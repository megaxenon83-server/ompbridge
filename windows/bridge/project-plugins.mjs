import { execFile } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import * as fs from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';
import { tmpdir } from 'node:os';
import adb from './adb.cjs';

const exec = promisify(execFile);
const output = text => ({ content: [{ type: 'text', text }], details: {} });

async function readNote(file) {
  const info = await fs.lstat(file).catch(error => {
    if (error.code !== 'ENOENT') throw error;
  });
  if (!info) return '';
  if (!info.isFile() || info.size > 65536) throw new Error('Forventet en vanlig Markdown-fil under 64 KiB.');
  return fs.readFile(file, 'utf8');
}

async function writeNote(file, text) {
  await fs.mkdir(dirname(file), { recursive: true });
  const temporary = file + '.' + randomUUID() + '.tmp';
  try {
    await fs.writeFile(temporary, text, { flag: 'wx' });
    await fs.rename(temporary, file);
  } finally { await fs.rm(temporary, { force: true }); }
}

function registerNote(pi, definition) {
  const z = pi.zod;
  pi.registerTool({
    name: definition.tool,
    label: definition.label,
    description: definition.description,
    loadMode: 'essential',
    parameters: z.object({
      action: z.enum(['read', 'write']),
      markdown: z.string().min(1).max(12000).optional()
    }),
    async execute(id, input, signal, update, ctx) {
      const file = definition.file(ctx);
      const current = await readNote(file);
      if (input.action === 'read') return output(current || definition.empty);
      if (!input.markdown?.trim() || !ctx.hasUI) return output('Skriving krever Markdown og godkjenning fra brukeren.');
      const ok = await ctx.ui.confirm(definition.label, 'Lagre dette innholdet?\n\n' + input.markdown, { timeout: 60000 });
      if (!ok || signal?.aborted) return output('Lagring avbrutt.');
      if (await readNote(file) !== current) throw new Error('Filen ble endret. Les den før du prøver igjen.');
      await writeNote(file, input.markdown.trim() + '\n');
      return output(definition.label + ' lagret.');
    }
  });
}

export function registerProjectPlugins(pi, options) {
  const plugins = new Set(options.plugins || []);
  if (plugins.has('agent-memory') && options.memoryFile) {
    registerNote(pi, {
      tool: 'omp_agent_memory',
      label: 'Agent Memory',
      description: 'Read remembered project decisions and preferences. Write durable notes only when the user asks. Do not store credentials or secrets.',
      file: () => options.memoryFile,
      empty: 'Ingen prosjektminner er lagret.'
    });
    pi.on('before_agent_start', async () => {
      const notes = await readNote(options.memoryFile);
      if (notes) return { message: { customType: 'omp-project-memory', display: false,
        content: 'Tidligere bruker-godkjente prosjektnotater. Bruk dem som kontekst for denne oppgaven.\n\n' + notes } };
    });
  }
  if (plugins.has('project-status')) registerNote(pi, {
    tool: 'omp_project_status',
    label: 'Project Status MD',
    description: 'Read or update the project root PROJECT_STATUS.md. Summarize completed work, open items, decisions and test results.',
    file: ctx => join(ctx.cwd || process.cwd(), 'PROJECT_STATUS.md'),
    empty: 'Prosjektet har ingen PROJECT_STATUS.md ennå.'
  });
  if (plugins.has('git-overview')) pi.registerTool({
    name: 'omp_git_overview',
    label: 'Git-oversikt',
    description: 'Read the local Git branch, changed paths and five latest commits without changing the repository.',
    loadMode: 'essential',
    parameters: pi.zod.object({}),
    async execute(id, input, signal, update, ctx) {
      const options = { cwd: ctx.cwd || process.cwd(), signal, windowsHide: true, timeout: 10000, maxBuffer: 128 * 1024 };
      const status = await exec('git', ['-c', 'core.fsmonitor=false', 'status', '--short', '--branch'], options);
      const history = await exec('git', ['--no-pager', 'log', '-5', '--oneline'], options).catch(() => ({ stdout: '' }));
      return output(status.stdout.trim() + (history.stdout ? '\n\n' + history.stdout.trim() : ''));
    }
  });
}

export async function testProjectPlugin(id, cwd) {
  if (id === 'device-control') {
    const file = join(dirname(fileURLToPath(import.meta.url)), 'device-action.ps1');
    const { stdout } = await exec('powershell.exe', ['-NoProfile', '-STA', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-File', file], {
      env: { ...process.env, OMP_DEVICE_REQUEST: JSON.stringify({ action: 'foreground' }) }, windowsHide: true, timeout: 15000
    });
    if (!JSON.parse(stdout).title) throw new Error('Windows-testen fant ikke et aktivt vindu.');
    const device = await adb.device(AbortSignal.timeout(15000));
    const { stdout: png } = await device.run(['exec-out', 'screencap', '-p'], { encoding: 'buffer' });
    if (png.length < 24 || png.readUInt32BE(0) !== 0x89504e47) throw new Error('Android svarte via ADB, men gav ikke et gyldig skjermbilde.');
    return 'Windows svarte på vindustesten. Android leverte et gyldig skjermbilde via ADB.';
  }
  const temporary = await fs.mkdtemp(join(tmpdir(), 'omp-plugin-test-'));
  try {
    const tools = [];
    const hooks = new Map();
    const schema = new Proxy(() => schema, { get: () => schema });
    registerProjectPlugins({ zod: schema, registerTool: tool => tools.push(tool), on: (name, handler) => hooks.set(name, handler) },
      { plugins: [id], memoryFile: join(temporary, 'memory.md') });
    if (!tools.length) throw new Error('Pluginverktøyet ble ikke registrert.');
    const ctx = { cwd: id === 'git-overview' ? cwd : temporary, hasUI: true, ui: { confirm: async () => true } };
    const run = input => tools[0].execute('self-test', input, AbortSignal.timeout(15000), undefined, ctx);
    if (id === 'git-overview') {
      if (!(await run({})).content[0]?.text) throw new Error('Git gav ingen prosjektstatus.');
      return 'Gren og Git-status ble lest.';
    }
    const text = 'OMP self-test ' + randomUUID();
    await run({ action: 'write', markdown: text });
    if ((await run({ action: 'read' })).content[0]?.text.trim() !== text) throw new Error('Kunne ikke lese tilbake det skrevne innholdet.');
    if (id === 'agent-memory' && !(await hooks.get('before_agent_start')()).message.content.includes(text)) {
      throw new Error('Prosjektminnet ble ikke lagt til som OMP-kontekst.');
    }
    return id === 'agent-memory' ? 'Minne ble lagret, lest og lagt til som kontekst.' : 'En isolert PROJECT_STATUS.md ble skrevet og lest.';
  } finally { await fs.rm(temporary, { force: true, recursive: true }); }
}
