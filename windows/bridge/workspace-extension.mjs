import { execFile } from 'node:child_process';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';
import adb from './adb.cjs';
import { registerProjectPlugins } from './project-plugins.mjs';

const exec = promisify(execFile);
const here = dirname(fileURLToPath(import.meta.url));
const options = JSON.parse(process.env.OMP_BRIDGE_RESOURCE_OPTIONS || '{}');
const keys = { enter: [13, '66'], escape: [27, '111'], tab: [9, '61'],
  up: [38, '19'], down: [40, '20'], left: [37, '21'], right: [39, '22'],
  backspace: [8, '67'] };
const response = text => ({ content: [{ type: 'text', text }], details: {} });

async function windows(input, signal) {
  const { stdout } = await exec('powershell.exe', ['-NoProfile', '-STA', '-NonInteractive', '-ExecutionPolicy', 'Bypass',
    '-File', join(here, 'device-action.ps1')], {
    env: { ...process.env, OMP_DEVICE_REQUEST: JSON.stringify({ ...input, systemKey: keys[input.key]?.[0] }) },
    signal, windowsHide: true, timeout: 15000, maxBuffer: 8 * 1024 * 1024
  });
  return JSON.parse(stdout);
}

const packageName = /^[a-zA-Z][a-zA-Z\d_]*(?:\.[a-zA-Z][a-zA-Z\d_]*)+$/;
const componentName = /^[a-zA-Z][\w.]+\/[\w.$]+$/;
const launchIntent = ['-a', 'android.intent.action.MAIN', '-c', 'android.intent.category.LAUNCHER'];

async function android(input, device) {
  const capture = async () => {
    const { stdout } = await device.run(['exec-out', 'screencap', '-p'], { encoding: 'buffer' });
    if (stdout.length < 24 || stdout.readUInt32BE(0) !== 0x89504e47) throw new Error('Android gav ikke et skjermbilde.');
    return stdout;
  };
  if (input.action === 'screen') return { data: (await capture()).toString('base64') };
  if (input.action === 'apps') {
    const { stdout } = await device.run(['shell', 'cmd', 'package', 'query-activities', '--brief', ...launchIntent]);
    const names = [...new Set(stdout.split(/\r?\n/).map(line => line.trim()).filter(line => componentName.test(line))
      .map(line => line.split('/')[0]))].sort();
    return { title: names.length ? names.join('\n') : 'Ingen apper med startikon ble funnet.' };
  }
  if (input.action === 'open') {
    const { stdout } = await device.run(['shell', 'cmd', 'package', 'resolve-activity', '--brief', ...launchIntent, input.package]);
    const component = stdout.trim().split(/\r?\n/).at(-1);
    if (!componentName.test(component) || !component.startsWith(input.package + '/')) throw new Error('Fant ingen startaktivitet for ' + input.package);
    const result = await device.run(['shell', 'am', 'start', '-W', '-n', component]);
    if (/^Error\b/m.test(result.stdout) || !/Status: ok/.test(result.stdout)) throw new Error('Android bekreftet ikke at appen åpnet.');
    return { title: 'Åpnet ' + input.package };
  }
  if (input.action === 'tap') {
    const image = await capture();
    await device.run(['shell', 'input', 'tap', String(Math.floor(input.x * image.readUInt32BE(16))),
      String(Math.floor(input.y * image.readUInt32BE(20)))]);
  } else if (input.action === 'key') {
    await device.run(['shell', 'input', 'keyevent', keys[input.key][1]]);
  } else {
    if (!/^[a-z0-9 _.,@-]+$/i.test(input.text)) throw new Error('Android-inndata støtter bokstaver A–Z, tall og enkel tegnsetting.');
    await device.run(['shell', 'input', 'text', input.text.replaceAll(' ', '%s')]);
  }
  return {};
}

export default function workspaceExtension(pi) {
  if (options.allowedTools) {
    const allowed = new Set(options.allowedTools);
    const apply = () => pi.setActiveTools(pi.getActiveTools().filter(name => allowed.has(name)));
    pi.on('session_start', apply);
    pi.on('before_agent_start', apply);
    pi.on('tool_call', event => {
      if (!allowed.has(event.toolName)) return { block: true, reason: 'Verktøyet er slått av i denne arbeidsmodusen.' };
    });
    return;
  }
  registerProjectPlugins(pi, options);
  const disabled = new Set(options.disabled || []);
  const enabled = options.enabled || [];
  const temporary = new Set();
  const apply = async () => {
    const registered = new Set(pi.getAllTools().map(tool => tool.name));
    const active = new Set(pi.getActiveTools().filter(name => (!disabled.has(name) || temporary.has(name))));
    for (const name of enabled) if (registered.has(name) && (!disabled.has(name) || temporary.has(name))) active.add(name);
    for (const name of temporary) if (registered.has(name)) active.add(name);
    await pi.setActiveTools([...active]);
  };
  pi.on('session_start', apply);
  pi.on('before_agent_start', apply);
  pi.on('tool_call', event => {
    if (disabled.has(event.toolName) && !temporary.has(event.toolName)) return { block: true, reason: 'Verktøyet er deaktivert for prosjektet.' };
  });
  if (options.resourceRequests) {
    pi.on('agent_end', async () => {
      if (!temporary.size) return;
      const active = pi.getActiveTools().filter(name => !temporary.has(name));
      temporary.clear();
      await pi.setActiveTools(active);
    });
    pi.registerTool({
      name: 'omp_request_resource',
      label: 'Request a tool or skill',
      loadMode: 'essential',
      description: 'Request explicit approval to enable a registered tool for the current run or install a specific catalog skill into this project. Disclose successful changes in your response.',
      parameters: pi.zod.object({
        kind: pi.zod.enum(['tool', 'skill']),
        target: pi.zod.string().min(1).max(500),
        reason: pi.zod.string().min(1).max(300)
      }),
      async execute(_id, { kind, target, reason }, signal, _update, ctx) {
        if (!ctx.hasUI || signal?.aborted) return response('User approval is required.');
        if (kind === 'tool') {
          if (!pi.getAllTools().some(tool => tool.name === target)) {
            return response('That tool is not registered. Use the project settings to configure its provider or MCP server.');
          }
          if (pi.getActiveTools().includes(target)) return response('Tool is already active: ' + target);
          const approved = await ctx.ui.confirm('Enable tool for this run?', target + '\n' + reason, { timeout: 60000 });
          if (!approved || signal?.aborted) return response('Tool activation declined or cancelled.');
          temporary.add(target);
          await apply();
          return response('Enabled ' + target + ' for this run. Tell the user it was enabled.');
        }
        const request = async body => {
          const { url, capability } = options.resourceRequests;
          const res = await fetch(url, { method: 'POST', signal, headers: {
            'Content-Type': 'application/json', 'X-OMP-Resource-Capability': capability
          }, body: JSON.stringify(body) });
          const data = await res.json();
          if (!res.ok) throw new Error(data.error || 'Skill request failed.');
          return data;
        };
        const preview = await request({ preview: true, target });
        const approved = await ctx.ui.confirm('Install and enable project skill?', [preview.ref, preview.sha, reason].filter(Boolean).join('\n'), { timeout: 60000 });
        if (!approved || signal?.aborted) return response('Skill installation declined or cancelled.');
        const { skill } = await request({ target: preview.ticket });
        return response('Installed and enabled ' + skill.name + ' for this project (' + skill.ref + ', ' + skill.sha +
          '). Tell the user what was installed. It will load on the next request. Approved skill instructions for the current task:\n\n' +
          String(preview.markdown || '').slice(0, 12000));
      }
    });
  }
  if (!options.deviceControl || process.platform !== 'win32') return;
  const z = pi.zod;
  pi.registerTool({
    name: 'omp_device',
    label: 'Enhetsstyring',
    loadMode: 'essential',
    description: 'Med en egen godkjenning per operasjon: se og styr det aktive Windows-vinduet eller én autorisert ADB-enhet. ' +
      'På Android viser action=apps apper med startikon, og action=open åpner en app med package-navn. ' +
      'Bruk action=foreground for aktiv vindustittel. Windows krever exactTitle ved screen, tap, type og key. ' +
      'Bruk relative skjermkoordinater x og y mellom 0 og 1. Taster: enter, escape, tab, up, down, left, right, backspace.',
    parameters: z.object({
      device: z.enum(['windows', 'android']),
      action: z.enum(['foreground', 'screen', 'tap', 'type', 'key', 'apps', 'open']),
      package: z.string().max(200).optional(),
      exactTitle: z.string().max(220).optional(),
      x: z.number().min(0).max(1).optional(),
      y: z.number().min(0).max(1).optional(),
      text: z.string().min(1).max(200).optional(),
      key: z.string().optional()
    }),
    async execute(_id, input, signal, _update, ctx) {
      if (!ctx.hasUI) return response('Enhetsstyring krever at brukeren kan godkjenne i appen.');
      const { device, action } = input;
      if ((device === 'windows' && action !== 'foreground' && !input.exactTitle) ||
          (device !== 'android' && (action === 'apps' || action === 'open')) ||
          (device === 'android' && action === 'foreground') ||
          (action === 'open' && !packageName.test(input.package || '')) ||
          (action === 'tap' && !(input.x >= 0 && input.x < 1 && input.y >= 0 && input.y < 1)) ||
          (action === 'type' && !input.text) || (action === 'key' && !Object.hasOwn(keys, input.key))) {
        return response('Handlingen mangler nødvendige parametere.');
      }
      const target = device === 'android' ? await adb.device(signal) : null;
      const destination = target ? 'Android · ' + target.serial : 'Windows · ' + (input.exactTitle || 'aktivt vindu');
      const detail = { foreground: 'Les vindustittel', screen: 'Send skjermbilde til modellen', tap: 'Klikk ' + input.x + ', ' + input.y,
        type: 'Skriv: ' + input.text, key: 'Trykk: ' + input.key, apps: 'Vis apper med startikon', open: 'Åpne ' + input.package }[action];
      const allowed = await ctx.ui.confirm('Enhetsstyring · godkjenning', destination + '\n' + detail, { timeout: 45000 });
      if (!allowed || signal?.aborted) return response('Handlingen ble avvist eller avbrutt.');
      const result = target ? await android(input, target) : await windows(input, signal);
      if (!result.data) return response(result.title || 'Handlingen er utført.');
      return { content: [{ type: 'image', data: result.data, mimeType: 'image/png' }], details: {} };
    }
  });
}
