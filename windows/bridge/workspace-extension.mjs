import { execFile } from 'node:child_process';
import { existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';

const exec = promisify(execFile);
const here = dirname(fileURLToPath(import.meta.url));
const options = JSON.parse(process.env.OMP_BRIDGE_RESOURCE_OPTIONS || '{}');
const keys = { enter: ['{ENTER}', '66'], escape: ['{ESC}', '111'], tab: ['{TAB}', '61'],
  up: ['{UP}', '19'], down: ['{DOWN}', '20'], left: ['{LEFT}', '21'], right: ['{RIGHT}', '22'],
  backspace: ['{BACKSPACE}', '67'] };
const response = text => ({ content: [{ type: 'text', text }], details: {} });

async function windows(input, signal) {
  const { stdout } = await exec('powershell.exe', ['-NoProfile', '-STA', '-NonInteractive', '-ExecutionPolicy', 'Bypass',
    '-File', join(here, 'device-action.ps1')], {
    env: { ...process.env, OMP_DEVICE_REQUEST: JSON.stringify({ ...input, systemKey: keys[input.key]?.[0] }) },
    signal, windowsHide: true, timeout: 15000, maxBuffer: 8 * 1024 * 1024
  });
  return JSON.parse(stdout);
}

function adbBinary() {
  const sdk = process.env.ANDROID_SDK_ROOT || process.env.ANDROID_HOME || 'C:\\Android';
  const executable = join(sdk, 'platform-tools', 'adb.exe');
  return existsSync(executable) ? executable : 'adb.exe';
}

async function androidDevice(signal) {
  const adb = adbBinary();
  const launch = (args, extra = {}) => exec(adb, args, { signal, windowsHide: true, timeout: 12000,
    maxBuffer: 12 * 1024 * 1024, ...extra });
  const { stdout } = await launch(['devices']);
  const devices = stdout.split(/\r?\n/).map(line => /^([a-z0-9_.:\-]+)\s+device\s*$/i.exec(line)?.[1]).filter(Boolean);
  if (devices.length !== 1) throw new Error('Koble til og godkjenn nøyaktig én Android-enhet eller emulator via ADB.');
  return { serial: devices[0], run: (args, extra) => launch(['-s', devices[0], ...args], extra) };
}

async function android(input, device) {
  const capture = async () => {
    const { stdout } = await device.run(['exec-out', 'screencap', '-p'], { encoding: 'buffer' });
    if (stdout.length < 24 || stdout.readUInt32BE(0) !== 0x89504e47) throw new Error('Android gav ikke et skjermbilde.');
    return stdout;
  };
  if (input.action === 'screen') return { data: (await capture()).toString('base64') };
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
  const disabled = new Set(options.disabled || []);
  const enabled = options.enabled || [];
  const apply = async () => {
    const registered = new Set(pi.getAllTools().map(tool => tool.name));
    const active = new Set(pi.getActiveTools().filter(name => !disabled.has(name)));
    for (const name of enabled) if (registered.has(name) && !disabled.has(name)) active.add(name);
    await pi.setActiveTools([...active]);
  };
  pi.on('session_start', apply);
  pi.on('before_agent_start', apply);
  pi.on('tool_call', event => {
    if (disabled.has(event.toolName)) return { block: true, reason: 'Verktøyet er deaktivert for prosjektet.' };
  });
  if (!options.deviceControl || process.platform !== 'win32') return;
  const z = pi.zod;
  pi.registerTool({
    name: 'omp_device',
    label: 'Enhetsstyring',
    loadMode: 'essential',
    description: 'Med en egen godkjenning per operasjon: se og styr det aktive Windows-vinduet eller én autorisert ADB-enhet. ' +
      'Bruk action=foreground for aktiv vindustittel. Windows krever exactTitle ved screen, tap, type og key. ' +
      'Bruk relative skjermkoordinater x og y mellom 0 og 1. Taster: enter, escape, tab, up, down, left, right, backspace.',
    parameters: z.object({
      device: z.enum(['windows', 'android']),
      action: z.enum(['foreground', 'screen', 'tap', 'type', 'key']),
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
          (device === 'android' && action === 'foreground') ||
          (action === 'tap' && !(input.x >= 0 && input.x < 1 && input.y >= 0 && input.y < 1)) ||
          (action === 'type' && !input.text) || (action === 'key' && !Object.hasOwn(keys, input.key))) {
        return response('Handlingen mangler nødvendige parametere.');
      }
      const target = device === 'android' ? await androidDevice(signal) : null;
      const destination = target ? 'Android · ' + target.serial : 'Windows · ' + (input.exactTitle || 'aktivt vindu');
      const detail = { foreground: 'Les vindustittel', screen: 'Send skjermbilde til modellen', tap: 'Klikk ' + input.x + ', ' + input.y,
        type: 'Skriv: ' + input.text, key: 'Trykk: ' + input.key }[action];
      const allowed = await ctx.ui.confirm('Enhetsstyring · godkjenning', destination + '\n' + detail, { timeout: 45000 });
      if (!allowed || signal?.aborted) return response('Handlingen ble avvist eller avbrutt.');
      const result = target ? await android(input, target) : await windows(input, signal);
      if (!result.data) return response(result.title || 'Handlingen er utført.');
      return { content: [{ type: 'image', data: result.data, mimeType: 'image/png' }], details: {} };
    }
  });
}
