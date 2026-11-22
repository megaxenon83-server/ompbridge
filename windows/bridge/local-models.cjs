const { execFile, spawn } = require('node:child_process');
const { promisify } = require('node:util');
const { setTimeout: delay } = require('node:timers/promises');
const fs = require('node:fs');
const path = require('node:path');
const http = require('node:http');

const exec = promisify(execFile);
const engines = { ollama: 'Ollama', llama: 'llama.cpp', strata: 'Strata' };
const MANAGED_CONFIG = 'C:\\Opencode\\Nimay AI control center\\ornith-1.5-9b-sycl\\managed-servers.json';

function loadManagedServers() {
  try {
    const file = process.env.OMP_DESKTOP_MANAGED_SERVERS || MANAGED_CONFIG;
    const raw = JSON.parse(fs.readFileSync(file, 'utf8').replace(/^\uFEFF/, ''));
    return Array.isArray(raw.servers) ? raw.servers : [];
  } catch { return []; }
}

function managedForModel(model) {
  if (!model) return null;
  const servers = loadManagedServers();
  const provider = model.provider || '';
  const id = model.id || model.modelId || '';
  let origin;
  try { origin = new URL(model.baseUrl).origin; } catch {}
  return servers.find(s => s.provider === provider && s.modelId === id)
    || servers.find(s => origin && s.healthUrl && origin === new URL(s.healthUrl).origin)
    || null;
}

function isManagedModel(model) {
  return !!managedForModel(model);
}

async function portPids(port, executable) {
  const portQuery = `Get-NetTCPConnection -LocalPort ${Number(port)} -State Listen -ErrorAction SilentlyContinue | Select-Object -ExpandProperty OwningProcess -Unique`;
  const script = executable
    ? `$owned = '${executable.replaceAll("'", "''")}'; ${portQuery} | ForEach-Object {
        $process = Get-CimInstance Win32_Process -Filter ('ProcessId=' + $_)
        if ($process.ExecutablePath -eq $owned) { $_ }
      }`
    : portQuery;
  const encoded = Buffer.from(script, 'utf16le').toString('base64');
  try {
    const { stdout } = await exec('powershell.exe', ['-NoProfile', '-NonInteractive', '-EncodedCommand', encoded], { windowsHide: true, timeout: 6000 });
    return [...new Set((stdout.match(/\d+/g) || []).map(Number).filter(n => n > 0))];
  } catch { return []; }
}

async function stopManagedServer(server) {
  const pids = await portPids(server.port, server.command);
  if (!pids.length) return;
  for (const pid of pids) {
    try { process.kill(pid, 'SIGTERM'); } catch {}
  }
  await delay(500);
  const still = await portPids(server.port, server.command);
  for (const pid of still) {
    try { await exec('taskkill.exe', ['/PID', String(pid), '/T', '/F'], { windowsHide: true, timeout: 8000 }); } catch {}
  }
  for (let i = 0; i < 20; i++) {
    const left = await portPids(server.port, server.command);
    if (!left.length) return;
    await delay(500);
  }
}

async function healthOk(url, timeout = 2000) {
  try {
    const res = await fetch(url, { redirect: 'error', signal: AbortSignal.timeout(timeout) });
    return res.ok;
  } catch { return false; }
}

async function startManagedServer(server) {
  if (await healthOk(server.healthUrl, 1500)) return;
  const outLog = path.join(path.dirname(server.cwd), 'server', `managed-${server.port}.out.log`);
  const errLog = path.join(path.dirname(server.cwd), 'server', `managed-${server.port}.err.log`);
  fs.mkdirSync(path.dirname(outLog), { recursive: true });
  const out = fs.openSync(outLog, 'a');
  const err = fs.openSync(errLog, 'a');
  const child = spawn(server.command, server.args, {
    cwd: server.cwd,
    detached: true,
    stdio: ['ignore', out, err],
    windowsHide: true
  });
  let failure;
  child.once('error', error => { failure = error; });
  child.unref();
  try { fs.closeSync(out); } catch {}
  try { fs.closeSync(err); } catch {}
  for (let i = 0; i < 240; i++) { // up to ~8 min
    if (failure) throw new Error('Kunne ikke starte ' + server.provider + ': ' + failure.message);
    if (await healthOk(server.healthUrl, 2000)) return;
    const pids = await portPids(server.port);
    if (!pids.length && i > 6) {
      // process may have exited early; give it a moment then fail
      await delay(1000);
      const pids2 = await portPids(server.port);
      if (!pids2.length) break;
    }
    await delay(2000);
  }
  if (!(await healthOk(server.healthUrl, 2000))) {
    throw new Error(`Kunne ikke starte ${server.provider} på port ${server.port}. Sjekk logg: ${errLog}`);
  }
}

async function switchManaged(targetModel) {
  const servers = loadManagedServers();
  const target = managedForModel(targetModel);
  for (const server of servers) {
    if (target && server.port === target.port && server.provider === target.provider) continue;
    await stopManagedServer(server);
  }
  if (target) await startManagedServer(target);
}

async function ensureManaged(model) {
  const server = managedForModel(model);
  if (server) await startManagedServer(server);
}

async function json(origin, route, payload, timeout = 2000) {
  const response = await fetch(origin + route, {
    method: payload === undefined ? 'GET' : 'POST',
    headers: payload === undefined ? {} : { 'Content-Type': 'application/json' },
    body: payload === undefined ? undefined : JSON.stringify(payload),
    redirect: 'error', signal: AbortSignal.timeout(timeout)
  });
  if (!response.ok) throw new Error('HTTP ' + response.status + ' fra ' + origin + route);
  return response.json();
}

async function windowsListeners() {
  const script = [
    '$engines = @{}',
    'Get-CimInstance Win32_Process | ForEach-Object {',
    '  if ($_.Name -match "^ollama\\.exe$") { $engines[[int]$_.ProcessId] = "ollama" }',
    '  elseif ($_.Name -match "^llama-server.*\\.exe$") { $engines[[int]$_.ProcessId] = "llama" }',
    '  elseif ($_.Name -match "^strata.*\\.exe$" -or ($_.Name -match "^python.*\\.exe$" -and $_.CommandLine -match "strata")) { $engines[[int]$_.ProcessId] = "strata" }',
    '}',
    'Get-NetTCPConnection -State Listen | ForEach-Object { if ($engines.ContainsKey([int]$_.OwningProcess)) { "$($engines[[int]$_.OwningProcess]):$($_.LocalPort)" } }'
  ].join('\n');
  const encoded = Buffer.from(script, 'utf16le').toString('base64');
  const { stdout } = await exec('powershell.exe', ['-NoProfile', '-NonInteractive', '-EncodedCommand', encoded], {
    windowsHide: true, timeout: 6000
  });
  return [...new Set(stdout.match(/^(?:ollama|llama|strata):\d+/gm) || [])];
}

async function inspect(origin, hint) {
  const [tags, status, props, catalog] = await Promise.all([
    json(origin, '/api/tags').catch(() => null),
    json(origin, '/v1/status').catch(() => null),
    json(origin, '/props').catch(() => null),
    json(origin, '/v1/models').catch(() => null)
  ]);
  const engine = Array.isArray(tags?.models) ? 'ollama'
    : hint === 'strata' || typeof status?.auto_load === 'boolean' ? 'strata'
      : hint === 'llama' || props?.default_generation_settings || props?.role === 'router' ? 'llama' : null;
  if (!engine) return [];
  const entries = engine === 'ollama' ? tags.models : catalog?.data;
  if (!Array.isArray(entries)) return [];
  return entries.filter(item => typeof (item.id || item.name || item.model) === 'string')
    .map(item => {
      const id = item.id || item.name || item.model;
      const router = typeof item.status === 'string' || typeof item.status?.value === 'string';
      return {
        id, name: id, engine, label: engines[engine], origin,
        baseUrl: origin + '/v1', provider: 'omp-desktop-' + engine + '-' + new URL(origin).port,
        mode: engine === 'ollama' ? 'ollama' : engine === 'strata' && typeof status?.loaded === 'boolean' ? 'strata'
          : router ? 'router' : 'fixed'
      };
    });
}

async function discoverLocal() {
  const ports = new Map([[11434, 'ollama'], [8080, null], [8081, null], [8000, null], [8089, null], [8091, null]]);
  for (const item of await windowsListeners().catch(() => [])) {
    const [engine, port] = item.split(':');
    ports.set(Number(port), engine);
  }
  const results = await Promise.all([...ports].map(([port, engine]) => inspect('http://127.0.0.1:' + port, engine)));
  return results.flat();
}

function matchLocal(model, catalog) {
  if (!model) return null;
  let port;
  try {
    const url = new URL(model.baseUrl);
    if (!['localhost', '127.0.0.1', '[::1]'].includes(url.hostname)) return null;
    port = url.port || (url.protocol === 'https:' ? '443' : '80');
  } catch {}
  return catalog.find(item => item.id === model.id && (item.provider === model.provider ||
    (port && new URL(item.origin).port === port) ||
    (!port && ({ ollama: 'ollama', strata: 'strata', 'llama.cpp': 'llama' })[model.provider] === item.engine)));
}

async function lifecycle(model, load) {
  if (!model) return;
  const managed = managedForModel(model);
  if (managed) {
    if (load) await startManagedServer(managed);
    else await stopManagedServer(managed);
    return;
  }
  const { origin, id, mode, label } = model;
  if (mode === 'fixed') {
    if (load) return;
    throw new Error(label + ' kjører som fast modellserver og kunne ikke stoppes automatisk.');
  }
  if (mode === 'ollama') {
    const running = async () => (await json(origin, '/api/ps')).models.some(item => item.name === id || item.model === id);
    if (await running() === load) return;
    await json(origin, '/api/generate', { model: id, stream: false, keep_alive: load ? '5m' : 0 }, 180000);
    for (let attempt = 0; attempt < 12; attempt++) {
      if (await running() === load) return;
      await delay(250);
    }
    throw new Error('Ollama bekreftet ikke at modellen var ' + (load ? 'lastet.' : 'frigjort.'));
  }
  const state = async () => {
    if (mode === 'strata') return (await json(origin, '/v1/status')).loaded ? 'loaded' : 'unloaded';
    const item = (await json(origin, '/v1/models')).data.find(entry => entry.id === id);
    return item?.status?.value || item?.status;
  };
  const desired = load ? 'loaded' : 'unloaded';
  if (await state() === desired) return;
  const action = load ? 'load' : 'unload';
  await json(origin, mode === 'strata' ? '/v1/' + action : '/models/' + action, mode === 'strata' ? {} : { model: id }, 180000);
  for (let attempt = 0; attempt < 180; attempt++) {
    const status = await state();
    if (status === desired) return;
    if (status === 'failed') break;
    await delay(1000);
  }
  throw new Error(label + ' bekreftet ikke at modellen var ' + (load ? 'lastet.' : 'frigjort.'));
}

async function swapMemory(previous, next) {
  const prevManaged = managedForModel(previous);
  const nextManaged = managedForModel(next);
  if (prevManaged || nextManaged) {
    const unloadPrevious = previous && !prevManaged && nextManaged;
    if (unloadPrevious) await lifecycle(previous, false);
    try {
      await switchManaged(nextManaged ? next : null);
      if (next && !nextManaged) await lifecycle(next, true);
    } catch (error) {
      if (previous) await lifecycle(previous, true).catch(() => {});
      throw error;
    }
    return;
  }
  if (previous) await lifecycle(previous, false);
  try {
    if (next) await lifecycle(next, true);
  } catch (error) {
    if (previous) {
      try { await lifecycle(previous, true); }
      catch { throw new Error(error.message + ' Kunne heller ikke laste forrige modell igjen.', { cause: error }); }
    }
    throw error;
  }
}

module.exports = { discoverLocal, inspect, matchLocal, swapMemory, managedForModel, isManagedModel, switchManaged, ensureManaged };
