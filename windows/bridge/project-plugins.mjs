import { execFile } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import * as fs from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { promisify } from 'node:util';

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
