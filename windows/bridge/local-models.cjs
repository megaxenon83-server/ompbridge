const { execFile, spawn } = require('node:child_process');
const { promisify } = require('node:util');
const { setTimeout: delay } = require('node:timers/promises');
const fs = require('node:fs');
const path = require('node:path');
const http = require('node:http');
const net = require('node:net');
const { createHash, randomUUID } = require('node:crypto');
const os = require('node:os');

const exec = promisify(execFile);
const engines = { ollama: 'Ollama', llama: 'llama.cpp', strata: 'Strata' };
const MANAGED_CONFIG = 'C:\\Opencode\\Nimay AI control center\\ornith-1.5-9b-sycl\\managed-servers.json';
const residenceFile = process.env.OMP_GPU_STATE_FILE || path.join(os.homedir(), '.omp', 'agent', 'desktop-gpu.json');
const pipeKey = createHash('sha256').update(residenceFile.toLowerCase()).digest('hex').slice(0, 16);

function acquireGpu() {
  return new Promise((resolve, reject) => {
    const server = net.createServer(socket => socket.destroy());
    server.once('error', error => reject(error.code === 'EADDRINUSE'
      ? Object.assign(new Error('Vent til den andre lokale modellkjøringen er ferdig.'), { code: 'GPU_BUSY' })
      : error));
    const name = process.platform === 'win32' ? '\\\\.\\pipe\\omp-gpu-' + pipeKey : { host: '127.0.0.1', port: 27780 };
    server.listen(name, () => { server.unref(); resolve(() => server.close()); });
  });
}

function readResident() {
  try { return JSON.parse(fs.readFileSync(residenceFile, 'utf8')).model || null; }
  catch { return undefined; }
}

function saveResident(model) {
  fs.mkdirSync(path.dirname(residenceFile), { recursive: true });
  const temp = residenceFile + '.' + randomUUID() + '.tmp';
  fs.writeFileSync(temp, JSON.stringify({ model: model || null }), { mode: 0o600 });
  try { fs.renameSync(temp, residenceFile); }
  finally { fs.rmSync(temp, { force: true }); }
}

function loadManagedServers() {
  try {
    const portable = path.join(os.homedir(), '.omp', 'agent', 'managed-servers.json');
    const file = process.env.OMP_DESKTOP_MANAGED_SERVERS || (fs.existsSync(portable) ? portable : MANAGED_CONFIG);
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
  try { origin = new URL(model.baseUrl || model.origin).origin; } catch {}
  return servers.find(s => (s.provider === provider || s.providerAliases?.includes(provider)) && s.modelId === id)
    || servers.find(s => origin && s.healthUrl && origin === new URL(s.healthUrl).origin)
    || null;
}

function isManagedModel(model) {
  return !!managedForModel(model);
}

async function portPids(port, executable, required = []) {
  const portQuery = `Get-NetTCPConnection -State Listen -ErrorAction Stop | Where-Object LocalPort -eq ${Number(port)} | Select-Object -ExpandProperty OwningProcess -Unique`;
  const script = executable
    ? `$owned = '${executable.replaceAll("'", "''")}'; ${portQuery} | ForEach-Object {
        $process = Get-CimInstance Win32_Process -Filter ('ProcessId=' + $_)
        if ($process.ExecutablePath -eq $owned ${required.map(value =>
          `-and ($process.CommandLine -and $process.CommandLine.IndexOf('${value.replaceAll("'", "''")}', [StringComparison]::OrdinalIgnoreCase) -ge 0)`).join(' ')}) { $_ }
      }`
    : portQuery;
  const encoded = Buffer.from("$ProgressPreference = 'SilentlyContinue'; " + script, 'utf16le').toString('base64');
  try {
    const { stdout } = await exec('powershell.exe', ['-NoProfile', '-NonInteractive', '-EncodedCommand', encoded], { windowsHide: true, timeout: 6000 });
    return [...new Set((stdout.match(/\d+/g) || []).map(Number).filter(n => n > 0))];
  } catch (error) { throw new Error('Kunne ikke bekrefte hvilken prosess som eier port ' + port + '.', { cause: error }); }
}

async function stopManagedServer(server) {
  const listeners = await portPids(server.port);
  if (!listeners.length) return;
  const pids = await portPids(server.port, server.listenerCommand || server.command, server.listenerArgs);
  if (!pids.length || listeners.some(pid => !pids.includes(pid))) {
    throw new Error('Port ' + server.port + ' brukes av en annen prosess enn den registrerte llama.cpp-serveren.');
  }
  if (server.modelMode) {
    const origin = new URL(server.healthUrl).origin;
    if (server.modelMode === 'strata' && (await json(origin, '/v1/status')).activity?.in_flight > 0) {
      throw new Error('Vent til PolyStrata er ferdig med den aktive forespørselen.');
    }
    await lifecycle({ origin, id: server.modelId, mode: server.modelMode, label: server.label || server.provider }, false, undefined, false);
  }
  for (const pid of pids) {
    try { process.kill(pid, 'SIGTERM'); } catch {}
  }
  await delay(500);
  const still = await portPids(server.port, server.listenerCommand || server.command, server.listenerArgs);
  for (const pid of still) {
    try { await exec('taskkill.exe', ['/PID', String(pid), '/T', '/F'], { windowsHide: true, timeout: 8000 }); } catch {}
  }
  for (let i = 0; i < 20; i++) {
    const left = await portPids(server.port);
    if (!left.length) return;
    await delay(500);
  }
  throw new Error(`llama.cpp svarte fortsatt på port ${server.port} etter avlasting.`);
}

async function healthOk(url, timeout = 2000) {
  try {
    const res = await fetch(url, { redirect: 'error', signal: AbortSignal.timeout(timeout) });
    return res.ok;
  } catch { return false; }
}

async function startManagedServer(server, onProgress = () => {}) {
  const listeners = await portPids(server.port);
  if (listeners.length) {
    const owned = await portPids(server.port, server.listenerCommand || server.command, server.listenerArgs);
    if (listeners.some(pid => !owned.includes(pid))) {
      throw new Error('Port ' + server.port + ' brukes av en annen prosess enn den registrerte llama.cpp-serveren.');
    }
    if (await healthOk(server.healthUrl, 1500)) return;
    for (let attempt = 0; attempt < 90; attempt++) {
      if (await healthOk(server.healthUrl, 1500)) return;
      if (!(await portPids(server.port, server.listenerCommand || server.command, server.listenerArgs)).length) break;
      await delay(1000);
    }
    if ((await portPids(server.port, server.listenerCommand || server.command, server.listenerArgs)).length) {
      throw new Error('Den registrerte llama.cpp-serveren svarer ikke på port ' + server.port + '.');
    }
  }
  onProgress('starting', server);
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
  onProgress('loading', server);
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
    if (child.exitCode === null && child.pid) child.kill();
    throw new Error(`Kunne ikke starte ${server.provider} på port ${server.port}. Sjekk logg: ${errLog}`);
  }
}

async function switchManaged(targetModel, onProgress = () => {}) {
  const target = managedForModel(targetModel);
  if (target) {
    await startManagedServer(target, onProgress);
    if (target.modelMode) {
      await lifecycle({ origin: new URL(target.healthUrl).origin, id: target.modelId,
        mode: target.modelMode, label: target.label || target.provider }, true, onProgress, false);
    }
  }
}

async function ensureManaged(model, onProgress) {
  const server = managedForModel(model);
  if (server) await switchManaged(model, onProgress);
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

async function lifecycle(model, load, onProgress = () => {}, checkManaged = true) {
  if (!model) return;
  const managed = checkManaged && managedForModel(model);
  if (managed) {
    if (load) await switchManaged(model, onProgress);
    else { onProgress('stopping', managed); await stopManagedServer(managed); }
    return;
  }
  const { origin, id, mode, label } = model;
  if (mode === 'fixed') {
    return;
  }
  if (mode === 'ollama') {
    const running = async () => (await json(origin, '/api/ps')).models.some(item => item.name === id || item.model === id);
    if (await running() === load) return;
    onProgress(load ? 'loading' : 'unloading', model);
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
  onProgress(load ? 'loading' : 'unloading', model);
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

async function swapMemory(previous, next, { warmOllama = true, onProgress = () => {} } = {}) {
  const warmNext = next && (warmOllama || next.mode !== 'ollama');
  const nextManaged = managedForModel(next);
  if (previous) {
    await lifecycle(previous, false, onProgress);
    if (previous.mode !== 'fixed' || managedForModel(previous)) onProgress('unloaded', previous);
  }
  try {
    if (nextManaged) await switchManaged(nextManaged ? next : null, onProgress);
    if (warmNext && !nextManaged) await lifecycle(next, true, onProgress);
    if (warmNext && (nextManaged || next.mode !== 'fixed')) onProgress('ready', next);
  } catch (error) {
    if (previous) {
      try { await lifecycle(previous, true); }
      catch { throw new Error(error.message + ' Kunne heller ikke laste forrige modell igjen.', { cause: error }); }
    }
    throw error;
  }
}

module.exports = { discoverLocal, inspect, matchLocal, swapMemory, managedForModel, isManagedModel, switchManaged, ensureManaged,
  acquireGpu, readResident, saveResident };
