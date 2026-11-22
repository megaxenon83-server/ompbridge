const fs = require('node:fs');
const path = require('node:path');
const { createHash, randomUUID } = require('node:crypto');
const { execFile } = require('node:child_process');
const { promisify } = require('node:util');
const catalog = require('./skill-catalog.cjs');
const adb = require('./adb.cjs');
const { createSkillLibrary } = require('./skill-library.cjs');

const exec = promisify(execFile);
const resourceName = /^[\p{L}\p{N}_:.@/-]{1,160}$/u;
const devicePlugin = 'device-control';
const bundled = [
  { id: 'agent-memory', name: 'Agent Memory', description: 'Husk godkjente prosjektbeslutninger på tvers av samtaler.' },
  { id: 'project-status', name: 'Project Status MD', description: 'Les og oppdater PROJECT_STATUS.md etter godkjenning.' },
  { id: 'git-overview', name: 'Git-oversikt', description: 'Vis gren, filendringer og de fem siste commitene.' },
  { id: devicePlugin, name: 'Enhetsstyring', description: 'Åpne apper, se skjerm og styr en autorisert Android-enhet eller PC. Henter ADB hvis Windows mangler det.' }
];

function createWorkspace(directory, executable, entry) {
  const root = path.join(directory, 'workspace-settings');
  const key = cwd => createHash('sha256').update(process.platform === 'win32' ? cwd.toLowerCase() : cwd).digest('hex');
  const file = cwd => path.join(root, key(cwd) + '.json');
  const overlay = (cwd, id) => path.join(root, key(cwd) + '.' + id + '.config.json');
  const scopeFile = session => path.join(root, session ? key(session) + '.skill-scope.json' : 'global-skill-scope.json');
  const scopeSettings = session => {
    try { return JSON.parse(fs.readFileSync(scopeFile(session), 'utf8')); }
    catch (error) { if (error.code === 'ENOENT') return { choices: {}, tests: {} }; throw error; }
  };
  const script = path.join(directory, 'workspace-extension.mjs');
  const activePlugins = info => new Set([...(info.plugins || []), ...(info.deviceControl ? [devicePlugin] : [])]);
  const settings = cwd => {
    try { return JSON.parse(fs.readFileSync(file(cwd), 'utf8')); }
    catch (error) { if (error.code === 'ENOENT') return {}; throw error; }
  };
  const library = createSkillLibrary(root, settings);
  const choices = session => ({ ...scopeSettings('').choices, ...(session ? scopeSettings(session).choices : {}) });
  const layout = (cwd, selected = {}) => library.list(cwd).filter(skill => selected[skill.name] ?? skill.enabled);
  const signature = (cwd, session) => {
    const selected = choices(session);
    return JSON.stringify([layout(cwd, selected).map(({ name, sha, scope }) => [name, sha, scope]),
      Object.entries(selected).sort(([a], [b]) => a.localeCompare(b))]);
  };
  const managed = cwd => library.list(cwd).map(({ folder, ...skill }) => skill);
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
  async function listSkills(cwd, inactive) {
    const { skills = [] } = JSON.parse(await omp(cwd, ['skill', 'list', '--json']));
    return skills.filter(item => item.name).map(item => ({
      name: item.name, kind: 'skill', detail: item.description, source: item.source,
      enabled: !inactive.includes('skill:' + item.name)
    }));
  }
  return {
    settings,
    signature,
    async skillScope(cwd, session, input, runtime) {
      const key = input.target;
      if (typeof key !== 'string' || !resourceName.test(key) || Object.hasOwn(Object.prototype, key)) throw new Error('Ugyldig skillnavn.');
      const info = settings(cwd);
      const skills = [...await listSkills(cwd, info.disabledExtensions ?? await disabled(cwd, 'disabledExtensions')), ...managed(cwd)];
      const skill = skills.find(item => item.name === key);
      if (!skill) throw new Error('OMP fant ikke denne skillen.');
      const global = scopeSettings('');
      const local = session ? scopeSettings(session) : { choices: {}, tests: {} };
      if (input.action === 'test-skill') {
        if (!runtime) throw new Error('Åpne en samtale for å teste skillen.');
        const { commands = [] } = await runtime.rpc('get_available_commands');
        const active = commands.some(command => command.source === 'skill' && command.name.replace(/^skill:/, '') === key);
        const test = { ok: active, detail: active ? 'OMP har lastet og registrert skillen.' : 'OMP har ikke lastet skillen i denne samtalen.',
          enabled: local.choices[key] ?? global.choices[key] ?? skill.enabled,
          at: new Date().toISOString() };
        const log = scopeSettings(session);
        log.tests[key] = test;
        write(scopeFile(session), log);
        return test;
      }
      if (!['global', 'session'].includes(input.scope) || (input.scope === 'session' && !session) ||
          (input.enabled !== null && typeof input.enabled !== 'boolean')) throw new Error('Velg globalt eller en lagret samtale.');
      const target = input.scope === 'session' ? local : global;
      if (input.enabled === null) delete target.choices[key];
      else target.choices[key] = input.enabled;
      delete target.tests[key];
      if (session) {
        delete local.tests[key];
        write(scopeFile(session), local);
      }
      if (input.scope === 'global') write(scopeFile(''), global);
      return { ok: true };
    },
    isManagedSkill: (cwd, name) => managed(cwd).some(item => item.name === name),
    async skillAction(cwd, input, runtime, known) {
      if (input.action === 'skill-library') {
        const summary = library.summary(cwd, known);
        return { ...summary, pending: !!runtime && runtime.workspaceSignature !== signature(cwd, runtime.sessionFile),
          loaded: runtime?.loadedSkills || [], blocked: runtime?.blockedSkills || [] };
      }
      if (input.action === 'catalog') return { entries: catalog.catalog };
      if (input.action === 'preview-skill') {
        if (input.scope != null && !['project', 'global'].includes(input.scope)) throw new Error('Ugyldig installasjonsomfang.');
        const preview = await catalog.preview(cwd, input.target, input.revision);
        return { ...preview, previous: library.installedMarkdown(cwd, preview.name, input.scope) };
      }
      const native = input.action === 'install-skill' ? (await listSkills(cwd, [])).map(item => item.name) : [];
      const result = await library.change(cwd, input, native, known);
      return { ...result, pending: !!runtime && runtime.workspaceSignature !== signature(cwd, runtime.sessionFile) };
    },
    async testPlugin(runtime, id) {
      if (!activePlugins(settings(runtime.cwd)).has(id) || !bundled.some(item => item.id === id)) throw new Error('Aktiver pluginen først.');
      const names = { 'agent-memory': 'omp_agent_memory', 'project-status': 'omp_project_status',
        'git-overview': 'omp_git_overview', 'device-control': 'omp_device' };
      const snapshot = await runtime.localCommand('/tools');
      const start = performance.now();
      let result;
      try {
        if (!snapshot.split('\n').some(line => line.startsWith('* ' + names[id]) && line.split(/\s+/)[1] === names[id])) {
          throw new Error('OMP har ikke aktivert pluginverktøyet.');
        }
        const { testProjectPlugin } = await import('./project-plugins.mjs');
        result = { ok: true, detail: await testProjectPlugin(id, runtime.cwd) };
      } catch (error) { result = { ok: false, detail: error.message }; }
      const info = settings(runtime.cwd);
      info.pluginTests ||= {};
      info.pluginTests[id] = { ...result, duration: Math.round(performance.now() - start), at: new Date().toISOString() };
      write(file(runtime.cwd), info);
      return info.pluginTests[id];
    },
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
    async spawnOptions(cwd, session) {
      const info = settings(cwd);
      const plugins = activePlugins(info);
      const selected = choices(session);
      const skills = layout(cwd, selected);
      const native = skills.length ? new Set((await listSkills(cwd, [])).map(item => item.name)) : new Set();
      const usable = skills.filter(item => !native.has(item.name));
      const folders = usable.map(item => item.folder);
      if (plugins.has(devicePlugin)) folders.push(path.join(directory, 'skills'));
      const args = [];
      if (folders.length || info.disabledExtensions !== undefined || Object.keys(selected).length) {
        const value = {};
        if (info.disabledExtensions !== undefined || Object.keys(selected).length) {
          const inactive = new Set(info.disabledExtensions ?? await disabled(cwd, 'disabledExtensions'));
          for (const [name, enabled] of Object.entries(selected)) {
            if (enabled) inactive.delete('skill:' + name);
            else inactive.add('skill:' + name);
          }
          value.disabledExtensions = [...inactive];
        }
        if (folders.length) value.skills = { customDirectories: [...new Set([...(await disabled(cwd, 'skills.customDirectories')), ...folders])] };
        const config = overlay(cwd, randomUUID());
        this.pruneOverlays(cwd);
        write(config, value);
        args.push('--config', config);
      }
      if (info.disabledTools?.length || info.enabledTools?.length || plugins.size) args.push('--extension', script);
      return { args, signature: signature(cwd, session), blocked: skills.filter(item => native.has(item.name)).map(item => item.name),
        skills: usable.map(({ name, sha, scope }) => ({ name, sha, scope })), env: {
        OMP_BRIDGE_RESOURCE_OPTIONS: JSON.stringify({
          disabled: info.disabledTools || [], enabled: info.enabledTools || [], deviceControl: plugins.has(devicePlugin),
          plugins: [...plugins], memoryFile: path.join(root, key(cwd) + '.memory.md')
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
        return [name, { name, kind: 'skill', detail: command.description, loaded: true, enabled: !inactive.includes('skill:' + name) }];
      }));
      for (const skill of await listSkills(cwd, inactive)) if (!skills.has(skill.name)) skills.set(skill.name, skill);
      for (const skill of managed(cwd)) skills.set(skill.name, { ...skill, loaded: skills.get(skill.name)?.loaded === true,
        pending: runtime.workspaceSignature !== signature(cwd, runtime.sessionFile) });
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
      const external = managed(cwd).find(item => item.name === name);
      if (kind === 'skill' && external) {
        return this.skillAction(cwd, { action: 'set-skill', name, scope: 'project', enabled }, runtime);
      }
      function set(list, value, include) {
        const names = new Set(list || []);
        if (include) names.add(value);
        else names.delete(value);
        return [...names];
      }
      if (kind === 'skill') {
        info.disabledExtensions = set(info.disabledExtensions ?? await disabled(cwd, 'disabledExtensions'), 'skill:' + name, !enabled);
      } else {
        info.disabledTools = set(info.disabledTools, name, !enabled);
        info.enabledTools = set(info.enabledTools, name, enabled);
      }
      write(file(cwd), info);
    },
    async plugins(cwd, input = {}, session) {
      const { action = 'list', target, scope } = input;
      if (action === 'list') {
        const info = settings(cwd);
        const active = activePlugins(info);
        const [output, inactive] = await Promise.all([
          omp(cwd, ['plugin', 'list', '--json']),
          info.disabledExtensions ?? disabled(cwd, 'disabledExtensions')
        ]);
        const data = output.startsWith('{') ? JSON.parse(output) : {};
        const global = scopeSettings('');
        const local = session ? scopeSettings(session) : { choices: {}, tests: {} };
        return { ...data, sessionScoped: !!session, builtIn: bundled.map(item => ({ ...item, enabled: active.has(item.id), test: info.pluginTests?.[item.id] })),
          skills: [...await listSkills(cwd, inactive), ...managed(cwd)].map(skill => {
            const globalEnabled = global.choices[skill.name] ?? skill.enabled;
            const sessionEnabled = local.choices[skill.name] ?? null;
            const test = local.tests[skill.name] || (!session && global.tests[skill.name]);
            const enabled = sessionEnabled ?? globalEnabled;
            return { ...skill, globalEnabled, sessionEnabled, enabled, test: test?.enabled === enabled ? test : undefined };
          }) };
      }
      if (!['enable', 'disable'].includes(action) || typeof target !== 'string' ||
          !resourceName.test(target) || target.startsWith('-')) throw new Error('Ugyldig pluginhandling.');
      if (bundled.some(item => item.id === target)) {
        const info = settings(cwd);
        const active = activePlugins(info);
        if (target === devicePlugin && action === 'enable' && process.platform === 'win32') await adb.install();
        if (action === 'enable') active.add(target);
        else active.delete(target);
        info.plugins = [...active];
        delete info.deviceControl;
        if (info.pluginTests) delete info.pluginTests[target];
        write(file(cwd), info);
      } else {
        await omp(cwd, ['plugin', action, target, '--scope=' + (scope === 'user' ? 'user' : 'project')]);
      }
      return { ok: true };
    }
  };
}

module.exports = { createWorkspace };
