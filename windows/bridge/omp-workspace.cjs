const fs = require('node:fs');
const path = require('node:path');
const { createHash, randomUUID } = require('node:crypto');
const { execFile } = require('node:child_process');
const { promisify } = require('node:util');

const exec = promisify(execFile);
const resourceName = /^[\p{L}\p{N}_:.@/-]{1,160}$/u;
const devicePlugin = 'device-control';

function createWorkspace(directory, executable, entry) {
  const root = path.join(directory, 'workspace-settings');
  const key = cwd => createHash('sha256').update(process.platform === 'win32' ? cwd.toLowerCase() : cwd).digest('hex');
  const file = cwd => path.join(root, key(cwd) + '.json');
  const overlay = (cwd, id) => path.join(root, key(cwd) + '.' + id + '.config.json');
  const script = path.join(directory, 'workspace-extension.mjs');
  const settings = cwd => {
    try { return JSON.parse(fs.readFileSync(file(cwd), 'utf8')); }
    catch (error) { if (error.code === 'ENOENT') return {}; throw error; }
  };
  function write(target, value) {
    fs.mkdirSync(root, { recursive: true });
    const temporary = target + '.' + randomUUID() + '.tmp';
    try {
      fs.writeFileSync(temporary, JSON.stringify(value, null, 2), { flag: 'wx' });
      fs.renameSync(temporary, target);
    } finally { fs.rmSync(temporary, { force: true }); }
  }
  async function omp(cwd, args) {
    const { stdout } = await exec(executable, [...(entry ? [entry] : []), ...args], { cwd, timeout: 45000,
      windowsHide: true, maxBuffer: 1024 * 1024 });
    return stdout.trim();
  }
  async function disabled(cwd, name) {
    const value = JSON.parse(await omp(cwd, ['config', 'get', name, '--json'])).value;
    return Array.isArray(value) ? value : [];
  }
  function readMcp(directories) {
    const result = new Map();
    for (const folder of directories) {
      for (const name of ['mcp.json', '.mcp.json']) {
        try {
          const data = JSON.parse(fs.readFileSync(path.join(folder, name), 'utf8').replace(/^\uFEFF/, ''));
          for (const [id, server] of Object.entries(data.mcpServers || {})) {
            result.set(id, { name: id, kind: 'mcp', enabled: server?.enabled !== false &&
              !data.disabledServers?.includes(id), detail: 'Konfigurert' });
          }
        } catch {}
      }
    }
    return result;
  }
  function saveOverlay(cwd, info) {
    const value = {};
    if (info.disabledExtensions !== undefined) value.disabledExtensions = info.disabledExtensions;
    if (info.deviceControl) value.skills = {
      customDirectories: [...new Set([...(info.skillDirectories || []), path.join(directory, 'skills')])]
    };
    info.overlay = randomUUID();
    write(overlay(cwd, info.overlay), value);
  }
  return {
    settings,
    pruneOverlays(cwd) {
      const keep = settings(cwd).overlay;
      if (!fs.existsSync(root)) return;
      for (const name of fs.readdirSync(root)) {
        if (name.startsWith(key(cwd) + '.') && name.endsWith('.config.json') &&
            path.basename(overlay(cwd, keep)) !== name) {
          try { fs.unlinkSync(path.join(root, name)); } catch {}
        }
      }
    },
    spawnOptions(cwd) {
      const info = settings(cwd);
      const hasOverlay = info.disabledExtensions !== undefined || info.deviceControl;
      const args = hasOverlay && /^[a-f0-9-]{36}$/.test(info.overlay || '') ? ['--config', overlay(cwd, info.overlay)] : [];
      if (info.disabledTools?.length || info.enabledTools?.length || info.deviceControl) args.push('--extension', script);
      return { args, env: {
        OMP_BRIDGE_RESOURCE_OPTIONS: JSON.stringify({
          disabled: info.disabledTools || [], enabled: info.enabledTools || [], deviceControl: !!info.deviceControl
        })
      } };
    },
    async resources(runtime, home) {
      const cwd = runtime.cwd;
      const info = settings(cwd);
      const { commands = [] } = await runtime.rpc('get_available_commands');
      const inactive = info.disabledExtensions ?? await disabled(cwd, 'disabledExtensions');
      const skills = new Map(commands.filter(command => command.source === 'skill').map(command => {
        const name = command.name.replace(/^skill:/, '');
        return [name, { name, kind: 'skill', detail: command.description, enabled: !inactive.includes('skill:' + name) }];
      }));
      for (const entry of inactive) {
        if (typeof entry !== 'string' || !entry.startsWith('skill:')) continue;
        const name = entry.slice(6);
        if (!skills.has(name)) skills.set(name, { name, kind: 'skill', enabled: false });
      }
      const tools = new Map();
      const servers = readMcp([home, path.join(cwd, '.omp'), cwd]);
      const toolText = await runtime.localCommand('/tools');
      for (const line of toolText.split('\n')) {
        const found = /^([*-]) +(\S+)/.exec(line);
        if (found) tools.set(found[2], { name: found[2], kind: 'tool',
          enabled: !info.disabledTools?.includes(found[2]) && (found[1] === '*' || info.enabledTools?.includes(found[2])) });
      }
      for (const name of info.disabledTools || []) {
        if (!tools.has(name)) tools.set(name, { name, kind: 'tool', enabled: false });
      }
      const mcpText = await runtime.localCommand('/mcp list');
      for (const line of mcpText.split('\n')) {
        const found = /^\s*(?:[-•*]\s+)?([a-z0-9_.:-]+)\s+(?:\(|—|–|\[)/i.exec(line);
        if (found) servers.set(found[1], { name: found[1], kind: 'mcp', enabled: !/disabled/i.test(line), detail: line.trim() });
      }
      return { Skills: [...skills.values()], 'MCP-servere': [...servers.values()], Verktøy: [...tools.values()] };
    },
    async toggle(runtime, input, home) {
      const { kind, name, enabled } = input;
      if (typeof enabled !== 'boolean' || !['skill', 'tool', 'mcp'].includes(kind) ||
          typeof name !== 'string' || !resourceName.test(name) || name.startsWith('-')) throw new Error('Ugyldig ressurs.');
      const all = Object.values(await this.resources(runtime, home)).flat();
      if (!all.some(item => item.name === name && item.kind === kind)) throw new Error('Ressursen finnes ikke i denne økten.');
      const cwd = runtime.cwd;
      if (kind === 'mcp') {
        const response = await runtime.localCommand('/mcp ' + (enabled ? 'enable ' : 'disable ') + name);
        if (!response || /failed|not found|unknown|error/i.test(response)) throw new Error(response || 'OMP bekreftet ikke endringen.');
        return;
      }
      const info = settings(cwd);
      function set(list, value, include) {
        const names = new Set(list || []);
        if (include) names.add(value);
        else names.delete(value);
        return [...names];
      }
      if (kind === 'skill') {
        info.disabledExtensions = set(info.disabledExtensions ?? await disabled(cwd, 'disabledExtensions'), 'skill:' + name, !enabled);
        saveOverlay(cwd, info);
      } else {
        info.disabledTools = set(info.disabledTools, name, !enabled);
        info.enabledTools = set(info.enabledTools, name, enabled);
      }
      write(file(cwd), info);
    },
    async plugins(cwd, input = {}) {
      const { action = 'list', target, scope } = input;
      if (action === 'list') {
        const output = await omp(cwd, ['plugin', 'list', '--json']);
        const data = output.startsWith('{') ? JSON.parse(output) : {};
        return { ...data, builtIn: [{ id: devicePlugin, name: 'Enhetsstyring',
          enabled: !!settings(cwd).deviceControl, description: 'Skjerm og inndata på PC og autorisert Android via ADB.' }] };
      }
      if (!['enable', 'disable'].includes(action) || typeof target !== 'string' ||
          !resourceName.test(target) || target.startsWith('-')) throw new Error('Ugyldig pluginhandling.');
      if (target === devicePlugin) {
        const info = { ...settings(cwd), deviceControl: action === 'enable' };
        if (info.deviceControl) info.skillDirectories = await disabled(cwd, 'skills.customDirectories');
        saveOverlay(cwd, info);
        write(file(cwd), info);
      } else {
        await omp(cwd, ['plugin', action, target, '--scope=' + (scope === 'user' ? 'user' : 'project')]);
      }
      return { ok: true };
    }
  };
}

module.exports = { createWorkspace };
