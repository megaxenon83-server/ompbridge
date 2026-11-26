const { app, BrowserWindow, ipcMain, dialog, safeStorage, shell, clipboard } = require('electron');
const { execFile, spawn } = require('node:child_process');
const { promisify } = require('node:util');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const { randomUUID } = require('node:crypto');
const { DatabaseSync } = require('node:sqlite');
const YAML = require('yaml');
const { catalogueRevision } = require('./model-catalogue.cjs');
const QRCode = require('qrcode');
const { OmpSession } = require('./omp.cjs');
const { Bridge } = require('./bridge.cjs');
const { discoverLocal, matchLocal, swapMemory, managedForModel, ensureManaged, acquireGpu, readResident, saveResident } = require('./local-models.cjs');
const { nativeProviders, accountPages, validateKey, apiEndpoint, discoverEndpoint } = require('./providers.cjs');
const { openBrowser, ProjectTerminal, hunks } = require('./workspace.cjs');
const { localAddress, projectDefaults, serveProject, startCommand, stopCommand, createPreview } = require('./project-panel.cjs');
const { pairingAddresses, createPairing, closePairing } = require('./mobile-pairing.cjs');
const wolRelay = require('./wol-relay.cjs');
const { createTurnChanges } = require('./turn-changes.cjs');
const { createSkillsPortal } = require('./skills-portal.cjs');
const { version: desktopVersion } = require('./package.json');

const exec = promisify(execFile);
const home = os.homedir();
const ompRoot = path.resolve(home, process.env.PI_CONFIG_DIR || '.omp');
const profileName = (process.env.OMP_PROFILE ?? process.env.PI_PROFILE ?? '').trim();
const ompHome = profileName && profileName !== 'default'
  ? path.join(ompRoot, 'profiles', profileName, 'agent')
  : process.env.PI_CODING_AGENT_DIR || path.join(ompRoot, 'agent');
const sessions = new Map();
const busy = new Set();
const gpuLeases = new Map();

function releaseLocalGpu(id) {
  gpuLeases.get(id)?.();
  gpuLeases.delete(id);
}
const sharedStreams = new Map();
const terminals = new Map();
const devServers = new Map();
const projectTests = new Map();
let preview;
let reading;
let scheduleTimer;
let runningSchedule = false;
let bridge;
let sharedWorkspace = false;
let sharedActivity = new Map();
let configuring = false;
let window;
const skillsPortal = createSkillsPortal();
let store;
let storePath;
let turnChanges;
let turnObserver;
let localCatalog = [];
let installedCatalog = [];
let lastDiscovery = 0;
let scanning;
let memorySwitching = false;

function scanModels() {
  if (scanning) return scanning;
  if (Date.now() - lastDiscovery < 8000) return Promise.resolve(localCatalog);
  scanning = discoverLocal().then(models => {
    localCatalog = models;
    lastDiscovery = Date.now();
    return models;
  }).finally(() => { scanning = null; });
  return scanning;
}

async function switchMemory(model, threadId, statusThreadId = threadId) {
  const catalog = await scanModels();
  const next = managedForModel(model) ? { ...model, managed: true } : matchLocal(model, catalog);
  if (memorySwitching || busy.size > 1) throw new Error('Vent til den andre modellkjøringen er ferdig før du bytter.');
  memorySwitching = true;
  let release;
  const operationId = randomUUID();
  let sequence = 0;
  const progress = (phase, item = model) => {
    if (statusThreadId) broadcast(statusThreadId, { type: 'model_preparing', operationId, sequence: ++sequence, phase,
      name: item?.name || item?.modelId || item?.id || item?.provider,
      engine: item?.label || (item?.mode === 'ollama' ? 'Ollama' : undefined) });
  };
  try {
    release = await acquireGpu();
    const previous = readResident();
    const sameManaged = previous?.managed && next?.managed && previous.provider === next.provider && previous.id === next.id;
    const sameLocal = previous?.origin && previous.origin === next?.origin && previous.id === next.id;
    if (sameManaged) { await ensureManaged(next, progress); progress('ready', next); }
    else if (!sameLocal || (!threadId && next.mode === 'ollama')) {
      await swapMemory(sameLocal ? null : previous, next, { onProgress: progress });
    }
    if (!next && !threadId) progress('cloud');
    saveResident(next);
    if (next && threadId) {
      gpuLeases.set(threadId, release);
      release = undefined;
    }
  } catch (error) {
    progress('failed');
    throw error;
  } finally {
    release?.();
    memorySwitching = false;
  }
}

function labelManagedModel(model) {
  return managedForModel(model) ? { ...model, engine: 'llama', label: 'llama.cpp' } : model;
}

async function registerDiscovered(model) {
  const file = path.join(ompHome, 'models.yml');
  const doc = YAML.parseDocument(read(file, value => value, ''));
  if (doc.errors.length) throw new Error('OMP models.yml har syntaksfeil.');
  if (doc.hasIn(['providers', model.provider, 'models'])) {
    const entries = doc.getIn(['providers', model.provider, 'models'], true).toJSON();
    if (entries.some(item => item.id === model.id)) return;
    doc.addIn(['providers', model.provider, 'models'], { id: model.id });
  } else {
    doc.setIn(['providers', model.provider], {
      baseUrl: model.baseUrl, api: 'openai-completions', apiKey: 'local', models: [{ id: model.id }]
    });
  }
  await reload();
  write(file, doc.toString());
}

function read(file, parse, fallback) {
  try { return parse(fs.readFileSync(file, 'utf8')); }
  catch (error) { if (error.code === 'ENOENT') return fallback; throw error; }
}

function write(file, content) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const temp = file + '.' + randomUUID() + '.tmp';
  fs.writeFileSync(temp, content, { flag: 'wx' });
  try { fs.renameSync(temp, file); }
  finally { fs.rmSync(temp, { force: true }); }
}

function save() {
  write(storePath, JSON.stringify(store, null, 2));
}

const modelsFile = path.join(ompHome, 'models.yml');

function providerDocument() {
  const doc = YAML.parseDocument(read(modelsFile, value => value, ''));
  if (doc.errors.length) throw new Error('OMP models.yml har syntaksfeil.');
  return doc;
}

function storedCredentials() {
  const file = path.join(ompHome, 'agent.db');
  if (!fs.existsSync(file)) return [];
  const db = new DatabaseSync(file, { readOnly: true });
  try {
    const table = db.prepare("SELECT 1 FROM sqlite_schema WHERE name = 'auth_credentials' AND type = 'table'").get();
    if (!table) return [];
    return db.prepare(`SELECT provider, MAX(disabled_cause IS NULL) AS hasCredential
      FROM auth_credentials GROUP BY provider`).all();
  } finally { db.close(); }
}

function ompEnvironment() {
  return Object.fromEntries(Object.entries(store.secrets).map(([name, ciphertext]) => [
    name, safeStorage.decryptString(Buffer.from(ciphertext, 'base64'))
  ]));
}

async function installedModels(cwd) {
  try {
    const data = JSON.parse(await runOmp(['models', '--json'], cwd, ompEnvironment()));
    if (Array.isArray(data.models)) return data.models.map(({ provider, id, name }) => ({ provider, id, name }));
  } catch {}
  throw new Error('Kunne ikke lese modellisten fra den installerte OMP-profilen.');
}

async function saveProvider(name, config, key, shared) {
  await reload();
  const doc = providerDocument();
  const previous = doc.getIn(['providers', name], true);
  const oldReference = previous?.get?.('apiKey');
  if (key && shared) config.apiKey = key;
  let reference;
  if (key && !shared) {
    if (!safeStorage.isEncryptionAvailable()) throw new Error('Windows kan ikke kryptere API-nøkkelen.');
    reference = 'OMP_DESKTOP_' + randomUUID().replaceAll('-', '').toUpperCase();
    store.secrets[reference] = safeStorage.encryptString(key).toString('base64');
    config.apiKey = reference;
    save();
  }
  for (const [field, value] of Object.entries(config)) doc.setIn(['providers', name, field], value);
  if (!key && config.auth === 'none') doc.deleteIn(['providers', name, 'apiKey']);
  if (key && !config.auth && previous?.get?.('auth') === 'none') doc.deleteIn(['providers', name, 'auth']);
  write(modelsFile, doc.toString());
  if (oldReference && oldReference !== reference && Object.hasOwn(store.secrets, oldReference)) delete store.secrets[oldReference];
  save();
}

function findOmp() {
  const candidates = [store.executable, path.join(process.env.LOCALAPPDATA || path.join(home, 'AppData', 'Local'), 'omp', 'omp.exe'),
    ...((process.env.PATH || '').split(path.delimiter).filter(Boolean).map(dir => path.join(dir, 'omp.exe'))),
    path.join(home, '.bun', 'bin', 'omp.exe'), path.join(home, '.local', 'bin', 'omp.exe')];
  return candidates.find(file => file && fs.existsSync(file));
}

function executable() {
  const file = findOmp();
  if (!file) throw new Error('Velg omp.exe i Innstillinger → OMP.');
  return file;
}

function getThread(id) {
  const thread = store.threads.find(item => item.id === id);
  if (!thread) throw new Error('Tråden finnes ikke.');
  return thread;
}

function broadcast(id, frame) {
  if (window && !window.isDestroyed()) window.webContents.send('omp-event', { id, frame });
}

function stopReading() {
  const child = reading;
  reading = null;
  child?.kill();
}

function readMessage({ id, text }) {
  if (typeof text !== 'string' || !text.trim() || text.length > 1048576) throw new Error('Meldingen kan ikke leses opp.');
  stopReading();
  const script = `
    $ErrorActionPreference = 'Stop'
    [Console]::InputEncoding = [Text.UTF8Encoding]::new($false)
    Add-Type -AssemblyName System.Speech
    $voice = [System.Speech.Synthesis.SpeechSynthesizer]::new()
    try {
      $norwegian = $voice.GetInstalledVoices() | Where-Object {
        $_.Enabled -and $_.VoiceInfo.Culture.TwoLetterISOLanguageName -in 'nb','no','nn'
      } | Select-Object -First 1
      if ($norwegian) { $voice.SelectVoice($norwegian.VoiceInfo.Name) }
      $voice.Speak([Console]::In.ReadToEnd())
    } finally { $voice.Dispose() }
  `;
  const child = spawn('powershell.exe', ['-NoProfile', '-NonInteractive', '-EncodedCommand',
    Buffer.from(script, 'utf16le').toString('base64')], { windowsHide: true, stdio: ['pipe', 'ignore', 'ignore'] });
  reading = child;
  const done = error => {
    if (reading !== child) return;
    reading = null;
    broadcast(undefined, { type: 'message_speech', request: id, error });
  };
  child.once('error', () => done('Kunne ikke starte opplesing i Windows.'));
  child.once('exit', code => done(code === 0 ? null : 'Opplesing mislyktes. Sjekk taleinnstillingene i Windows.'));
  child.stdin.once('error', () => {});
  child.stdin.end(text, 'utf8');
}

function sessionFor(thread, approvalMode = store.localApprovalMode || 'write') {
  const existing = sessions.get(thread.id);
  if (existing && !existing.failure && !existing.closing) return existing;
  const env = ompEnvironment();
  const args = [];
  const settings = store.resources[thread.project];
  const tools = settings?.tools;
  if (approvalMode === 'deny') args.push('--no-tools', '--no-extensions', '--no-skills');
  else {
    args.push('--approval-mode', approvalMode);
    if (Array.isArray(tools)) args.push(tools.length ? '--tools=' + tools.join(',') : '--no-tools');
  }
  if (approvalMode !== 'deny' && settings?.disabledTools?.length) {
    env.OMP_DESKTOP_DISABLED_TOOLS = JSON.stringify(settings.disabledTools);
    args.push('--extension', path.join(__dirname, 'tool-filter.mjs'));
  }
  if (settings?.overlay) {
    const overlay = path.join(app.getPath('userData'), 'overlays', settings.overlay + '.yml');
    args.push('--config', overlay);
  }
  args.push('--config', path.join(__dirname, 'omp-recovery.yml'));
  const resume = thread.sessionFile && fs.existsSync(thread.sessionFile) ? thread.sessionFile : undefined;
  let recovering = false;
  let recoveryTerminalFrames = [];
  function onFrame(frame) {
    if (frame.type === 'agent_end' && frame.isTerminal === false) return;
    if (recovering && ['agent_end', 'prompt_result', 'session_settled'].includes(frame.type)) {
      recoveryTerminalFrames.push(frame);
      return;
    }
    if (frame.type === 'auto_retry_start' && /thinking.loop/i.test(frame.errorMessage || '')) recovering = true;
    if (frame.type === 'auto_retry_end' && recovering) {
      broadcast(thread.id, { ...frame, recovery: true });
      recovering = false;
      const terminalFrames = recoveryTerminalFrames;
      recoveryTerminalFrames = [];
      for (const terminalFrame of terminalFrames) onFrame(terminalFrame);
      return;
    }
    if (approvalMode === 'yolo' && frame.type === 'extension_ui_request' && frame.method === 'select' &&
        /^Allow tool: [^\r\n]+/i.test(frame.title || '') && frame.options?.some(x => /^deny$/i.test(x))) {
      const value = frame.options.find(x => /^approve$/i.test(x));
      if (value) {
        session.send('extension_ui_response', { id: frame.id, value });
        return;
      }
    }
    const changed = turnChanges.observe(thread.id, frame);
    broadcast(thread.id, frame);
    const anchor = changed && frame.toolCallId;
    if (anchor || ['agent_end', 'prompt_result', 'disconnected'].includes(frame.type)) {
      try {
        const card = turnChanges.finish(thread.id, localTurnKey(thread.id), anchor);
        if (card) broadcast(thread.id, { type: 'turn_changes', card });
      } catch (error) { console.error('Endringskort:', error.message); }
    }
    if (frame.type === 'disconnected') turnChanges.cancel(thread.id);
    if (['agent_end', 'disconnected'].includes(frame.type) || (frame.type === 'prompt_result' && !frame.agentInvoked)
      || (frame.type === 'rpc_error' && frame.command === 'prompt')) {
      busy.delete(thread.id);
      releaseLocalGpu(thread.id);
    }
    if (frame.type === 'agent_end') captureSession(thread, session)
      .then(state => { if (state) broadcast(thread.id, { type: 'state', state }); }).catch(() => {});
  }
  const session = new OmpSession(executable(), thread.cwd, resume, onFrame, env, args);
  sessions.set(thread.id, session);
  session.approvalMode = approvalMode;
  session.catalogueRevision = catalogueRevision(ompHome);
  return session;
}

async function captureSession(thread, session) {
  const state = await session.request('get_state');
  if (state?.sessionFile && fs.existsSync(state.sessionFile) && state.sessionFile !== thread.sessionFile) {
    thread.sessionFile = state.sessionFile;
    save();
  }
  return state;
}

async function reload() {
  if (busy.size) throw new Error('Vent til aktive oppgaver er ferdige før du endrer OMP-oppsettet.');
  const closing = [...sessions.values()].map(session => session.close());
  sessions.clear();
  await Promise.all(closing);
}

async function runOmp(args, cwd, environment) {
  try {
    const env = environment ? { ...process.env, ...environment } : process.env;
    const { stdout } = await exec(executable(), args, { cwd: cwd || home, env, windowsHide: true, timeout: 120000, maxBuffer: 4 * 1024 * 1024 });
    return stdout.trim();
  } catch (error) {
    throw new Error(error.stderr?.trim() || error.stdout?.trim() || error.message);
  }
}

async function runGit(cwd, ...args) {
  const { stdout } = await exec('git.exe', ['-C', cwd, ...args], { windowsHide: true, maxBuffer: 4 * 1024 * 1024, timeout: 15000 });
  return stdout;
}

function publicState() {
  const { secrets, resources, bridgeConfig, lastLocal, ...state } = store;
  const threads = state.threads.map(thread => ({
    ...thread,
    activity: (thread.shared && thread.sessionFile ? sharedActivity.get(pathKey(thread.sessionFile)) : null)
      || (busy.has(thread.id) ? 'working' : null)
  }));
  return { ...state, threads, preferredModel: labelManagedModel(state.preferredModel), desktopVersion,
    detected: findOmp() || '', busy: [...busy], bridgeAddress: bridge?.origin || bridgeConfig?.address || '' };
}

async function checkSchedule() {
  if (runningSchedule || configuring || busy.size) return;
  const job = store.jobs.find(item => item.status === 'pending' && Date.parse(item.when) <= Date.now());
  if (!job) return;
  runningSchedule = true;
  job.status = 'sending';
  save();
  try {
    await handlers.prompt({ id: job.thread, message: job.message });
    job.status = 'sent';
  } catch (error) {
    job.status = 'error';
    job.error = error.message;
  } finally {
    save();
    runningSchedule = false;
    broadcast(job.thread, { type: 'schedule_status', status: job.status, error: job.error });
  }
}

function getBridge() {
  if (!bridge) throw new Error('Koble til OMP Bridge i innstillingene.');
  return bridge;
}

function installedBridgeClient() {
  const configFile = path.join(process.env.LOCALAPPDATA || path.join(home, 'AppData', 'Local'), 'Nimay', 'OMPBridge', 'bridge', 'config.json');
  const config = read(configFile, text => JSON.parse(text.replace(/^\uFEFF/, '')), {});
  if (!config.token?.trim()) throw new Error('Fant ingen lokal Bridge-konfigurasjon. Installer eller start OMP Bridge.');
  return new Bridge('http://127.0.0.1:' + (config.port || 27778), config.token.trim());
}

async function connectInstalledBridge() {
  const client = installedBridgeClient();
  let health;
  try { health = await (await client.response('/api/health', null, undefined, AbortSignal.timeout(4000))).json(); }
  catch (error) {
    if (error.status === 401) throw new Error('En annen Bridge eller tjeneste svarer på den lokale porten og avviser installasjonens token.');
    throw error;
  }
  if (!health.ok) throw new Error('Bridge svarte uten aktiv OMP-status.');
  if (safeStorage.isEncryptionAvailable()) {
    store.bridgeConfig = { address: client.origin, token: safeStorage.encryptString(client.token).toString('base64'), installed: true };
    save();
  }
  bridge = client;
  return health;
}

const localTurnKey = id => path.join(app.getPath('userData'), 'thread', id);

const pathKey = value => path.resolve(value).toLowerCase();

function isSamePath(a, b) {
  return !!a && !!b && pathKey(a) === pathKey(b);
}

function projectPath(thread, relative = '') {
  const base = fs.realpathSync(thread.cwd);
  const file = fs.realpathSync(path.resolve(base, relative));
  const inside = path.relative(base, file);
  if (inside === '..' || inside.startsWith('..' + path.sep) || path.isAbsolute(inside)) {
    throw new Error('Velg en fil i prosjektmappen.');
  }
  return file;
}

function sharedHistory(messages) {
  return (messages || []).map(item => ({ ...item, content: [{ type: 'text', text: item.text || '' }] }));
}

async function refreshShared(thread) {
  if (!thread.sessionFile) return { messages: [] };
  const data = await getBridge().get('/api/session/messages', { file: thread.sessionFile });
  return { messages: sharedHistory(data.messages), title: data.session?.title, model: data.model, chatProfile: data.chatProfile };
}

function stopSharedStream(id) {
  sharedStreams.get(id)?.abort();
  sharedStreams.delete(id);
}

function bridgeActivity(frame, stream) {
  if (frame.trace) frame = { ...frame, trace: { ...frame.trace, desktopReceivedAt: Date.now() } };
  switch (frame.type) {
    case 'agent_start': stream.text = ''; return frame;
    case 'agent_end':
    case 'session_settled': return { ...frame, type: 'agent_end' };
    case 'message_start':
      stream.text = '';
      return frame;
    case 'message_delta':
      if (frame.kind === 'thinking' && !frame.partial?.segments) return { ...frame, type: 'agent_thinking' };
      stream.text = frame.partial?.text ?? (stream.text + (frame.delta || ''));
      return { ...frame, type: 'message_update', message: { role: 'assistant', content: stream.text, segments: frame.partial?.segments } };
    case 'message_end':
      if (frame.message?.role === 'user') return { ...frame, message: { ...frame.message, content: frame.message.text } };
      if (frame.message?.role !== 'assistant') return null;
      stream.text = '';
      return { ...frame, message: { role: 'assistant', content: frame.message.text || frame.message.error || '', usage: frame.message.usage, timestamp: frame.message.timestamp, id: frame.message.id, segments: frame.message.segments, timings: frame.message.timings, duration: frame.message.duration, ttft: frame.message.ttft } };
    case 'tool_start': return { ...frame, type: 'tool_execution_start' };
    case 'tool_update':
    case 'tool_stream': return { ...frame, type: 'tool_execution_update' };
    case 'tool_end': return { ...frame, type: 'tool_execution_end' };
    case 'auto_retry_start':
    case 'auto_retry_end':
    case 'model_preparing':
    case 'state': return frame;
    default: return null;
  }
}

function streamShared(thread, client) {
  stopSharedStream(thread.id);
  const controller = new AbortController();
  sharedStreams.set(thread.id, controller);
  const stream = { text: '' };
  let resolveReady;
  const ready = new Promise(resolve => { resolveReady = resolve; });
  void client.subscribe(thread.cwd, frame => {
    if (frame.type === 'hello') { resolveReady(); return; }
    if (frame.type === 'turn_changes') {
      if (isSamePath(frame.sessionFile, thread.sessionFile)) broadcast(thread.id, frame);
      return;
    }
    if (!busy.has(thread.id)) return;
    if (frame.sessionFile && thread.sessionFile && !isSamePath(frame.sessionFile, thread.sessionFile)) return;
    if (frame.type === 'state' && frame.state?.sessionFile && thread.sessionFile
      && !isSamePath(frame.state.sessionFile, thread.sessionFile)) return;
    switch (frame.type) {
      case 'ui_request':
        if (frame.sessionFile && thread.sessionFile && !isSamePath(frame.sessionFile, thread.sessionFile)) return;
        frame.type = 'extension_ui_request';
        break;
      case 'ui_cancel': frame = { ...frame, type: 'extension_ui_request', method: 'cancel' }; break;
      case 'notice': frame = { ...frame, type: 'extension_ui_request', method: 'notify' }; break;
      case 'agent_end':
      case 'session_settled':
        busy.delete(thread.id);
        stopSharedStream(thread.id);
        frame.type = 'agent_end';
        break;
      default: {
        const activity = bridgeActivity(frame, stream);
        if (!activity) return;
        frame = activity;
      }
    }
    broadcast(thread.id, frame);
  }, controller.signal);
  return ready;
}

async function activateShared(thread) {
  const client = getBridge();
  const { state, sessionFile, request } = await client.get('/api/state', { cwd: thread.cwd });
  if (state?.isStreaming || request) throw new Error('OMP Bridge jobber allerede i dette prosjektet.');
  if (thread.sessionFile) {
    if (!isSamePath(sessionFile, thread.sessionFile)) {
      const opened = await client.post('/api/sessions/open', { file: thread.sessionFile, cwd: thread.cwd });
      if (opened.readOnly) throw new Error(opened.reason || 'Bridge kunne bare åpne samtalen for lesing.');
    }
  } else {
    const created = await client.post('/api/sessions/new', { cwd: thread.cwd });
    const file = created.session?.file || created.state?.sessionFile;
    if (file && fs.existsSync(file)) { thread.sessionFile = file; save(); }
  }
  return client;
}

async function syncShared() {
  if (!bridge) await connectInstalledBridge();
  try { return await syncSharedWithBridge(); }
  catch (error) {
    if (error.status !== 401 && !error.cause) throw error;
    await connectInstalledBridge();
    return syncSharedWithBridge();
  }
}

async function syncSharedWithBridge() {
  const client = getBridge();
  const [data, registry] = await Promise.all([
    client.get('/api/sessions', { archived: 1 }),
    client.get('/api/projects/registry').catch(() => null)
  ]);
  sharedWorkspace = !!registry?.sharedWorkspace;
  let changed = false;
  const sharedProjects = (registry?.projects || []).slice();
  if (sharedWorkspace) {
    const known = new Set(sharedProjects.filter(item => item.auto === false).map(item => pathKey(item.path)));
    for (const directory of store.pinnedProjects) {
      if (known.has(pathKey(directory)) || !fs.statSync(directory, { throwIfNoEntry: false })?.isDirectory()) continue;
      const registered = await client.post('/api/projects/register', { path: directory }).catch(() => null);
      if (registered?.project) sharedProjects.push(registered.project);
    }
    const hidden = new Set(sharedProjects.filter(item => item.hidden).map(item => pathKey(item.path)));
    const pinned = store.pinnedProjects.filter(directory => !hidden.has(pathKey(directory)));
    if (pinned.length !== store.pinnedProjects.length) { store.pinnedProjects = pinned; changed = true; }
  }
  for (const item of sharedProjects) {
    if (item.auto !== false || item.hidden || typeof item.path !== 'string' || !path.isAbsolute(item.path)) continue;
    if (!fs.statSync(item.path, { throwIfNoEntry: false })?.isDirectory()) continue;
    if (store.pinnedProjects.some(directory => isSamePath(directory, item.path))) continue;
    const project = store.projects.find(directory => isSamePath(directory, item.path)) || item.path;
    if (!store.projects.includes(project)) store.projects.push(project);
    store.pinnedProjects.push(project);
    changed = true;
  }
  const catalogue = Array.isArray(data.sessions) ? data.sessions : [];
  sharedActivity = new Map(catalogue.filter(item => item?.file && !item.archived && ['working', 'waiting'].includes(item.activity))
    .map(item => [pathKey(item.file), item.activity]));
  const projectById = new Map(sharedProjects.filter(item => !item.hidden).map(item => [item.id, item.path]));
  const visible = new Set(catalogue.filter(item => item?.file && !item.archived).map(item => pathKey(item.file)));
  if (data.total === catalogue.length) {
    for (const thread of store.threads) {
      if (!thread.shared || !thread.sessionFile || busy.has(thread.id)) continue;
      const hidden = !visible.has(pathKey(thread.sessionFile));
      if (Boolean(thread.hiddenFromSidebar) !== hidden) {
        if (hidden) thread.hiddenFromSidebar = true;
        else delete thread.hiddenFromSidebar;
        changed = true;
      }
      if (hidden && store.selected === thread.id) { store.selected = null; changed = true; }
    }
  }
  for (const item of catalogue) {
    if (!item?.file || !path.isAbsolute(item.file) || typeof item.cwd !== 'string' || !path.isAbsolute(item.cwd)) continue;
    if (item.archived) continue;
    if (!fs.existsSync(item.cwd)) continue;
    const groupedPath = projectById.get(item.projectId);
    const existing = store.threads.find(candidate => isSamePath(candidate.sessionFile, item.file));
    if (existing) {
      if (!existing.shared && !existing.localOnly && !busy.has(existing.id) && !configuring) {
        const open = sessions.get(existing.id);
        if (open) { await open.close(); sessions.delete(existing.id); }
        existing.shared = true;
        changed = true;
      }
      if (existing.shared && item.title && existing.title !== item.title) { existing.title = item.title; changed = true; }
      if (existing.shared && groupedPath && !isSamePath(existing.project, groupedPath)) {
        existing.project = groupedPath;
        changed = true;
      }
      continue;
    }
    const project = groupedPath || store.projects.find(directory => isSamePath(directory, item.cwd)) || item.cwd;
    store.threads.push({ id: randomUUID(), cwd: item.cwd, project, title: item.title || 'Delt tråd', sessionFile: item.file, shared: true });
    changed = true;
  }
  if (changed) save();
  return publicState();
}

async function configure(action) {
  if (busy.size || configuring) throw new Error('Vent til den aktive OMP-handlingen er ferdig.');
  configuring = true;
  try { return await action(); }
  finally { configuring = false; }
}

async function configArray(cwd, key) {
  return JSON.parse(await runOmp(['config', 'get', key, '--json'], cwd)).value || [];
}

function appendNames(rows, names, kind, detail) {
  for (const name of names) {
    if (!rows.some(item => item.name === name)) rows.push({ name, kind, enabled: false, detail });
  }
  return rows;
}

function agentNames(directory) {
  if (!fs.existsSync(directory)) return [];
  const names = [];
  for (const item of fs.readdirSync(directory, { withFileTypes: true })) {
    if (!item.isFile() || !item.name.endsWith('.md')) continue;
    const head = fs.readFileSync(path.join(directory, item.name), 'utf8').match(/^---\r?\n([\s\S]*?)\r?\n---/);
    names.push((head && YAML.parseDocument(head[1]).get('name')) || item.name.slice(0, -3));
  }
  return names;
}

let bundledAgents;

async function resourceList(id) {
  if (!id) return {};
  const thread = getThread(id);
  const session = sessionFor(thread);
  const { commands } = await session.request('get_available_commands');
  const settings = store.resources[thread.project];
  const [disabledSkills, disabledAgents] = await Promise.all([
    configArray(thread.cwd, 'disabledExtensions'), configArray(thread.cwd, 'task.disabledAgents')
  ]);
  const disabled = settings?.disabledExtensions || disabledSkills;
  const skills = commands.filter(item => item.source === 'skill').map(item => ({
    name: item.name.replace(/^skill:/, ''), kind: 'skill', enabled: true, detail: item.description
  }));
  appendNames(skills, disabled.filter(item => typeof item === 'string' && item.startsWith('skill:')).map(item => item.slice(6)), 'skill');
  const tools = [];
  const servers = [];
  if (!busy.has(id)) {
    const toolText = await session.localCommand('/tools');
    for (const line of toolText.split('\n')) {
      const match = /^([*-]) +(\S+)/.exec(line);
      if (match) tools.push({ name: match[2], enabled: match[1] === '*' && !settings?.disabledTools?.includes(match[2]), kind: 'tool' });
    }
    appendNames(tools, settings?.knownTools || [], 'tool');
    const mcpText = await session.localCommand('/mcp list');
    for (const line of mcpText.split('\n')) {
      const match = /^\s*(?:[-•*]\s+)?([a-z0-9_.:-]+)\s+(?:\(|—|–|\[)/i.exec(line);
      if (match) servers.push({ name: match[1], kind: 'mcp', enabled: !/disabled/i.test(line), detail: line.trim() });
    }
    for (const directory of [ompHome, path.join(thread.cwd, '.omp'), thread.cwd]) {
      for (const filename of ['mcp.json', '.mcp.json']) {
        const file = path.join(directory, filename);
        const data = read(file, JSON.parse, {});
        if (!data?.mcpServers) continue;
        for (const [name, server] of Object.entries(data.mcpServers)) {
          if (!servers.some(item => item.name === name)) servers.push({
            name, kind: 'mcp', enabled: server.enabled !== false && !data.disabledServers?.includes(name), detail: 'Konfigurert'
          });
        }
      }
    }
  }
  if (!bundledAgents) {
    const directory = path.join(app.getPath('userData'), 'bundled-agents');
    await runOmp(['agents', 'unpack', '--dir=' + directory, '--force', '--json'], thread.cwd);
    bundledAgents = agentNames(directory);
  }
  const agentDisabled = settings?.disabledAgents || disabledAgents;
  const agentFolders = [path.join(ompHome, 'agents'), path.join(thread.cwd, '.omp', 'agents'), path.join(thread.cwd, '.claude', 'agents')];
  const agents = [...new Set([...bundledAgents, ...agentFolders.flatMap(agentNames), ...agentDisabled])]
    .map(name => ({ name, enabled: !agentDisabled.includes(name), kind: 'agent' }));
  return { Skills: skills, 'MCP-servere': servers, Verktøy: tools, Agenter: agents };
}

const handlers = {
  machineResources: () => getBridge().get('/api/machine/resources'),
  desktopStartup: enabled => {
    if (typeof enabled === 'boolean') app.setLoginItemSettings({ name: 'OMP Desktop', path: process.execPath, openAtLogin: enabled });
    return app.getLoginItemSettings({ path: process.execPath }).executableWillLaunchAtLogin;
  },
  desktopUpdates: () => shell.openExternal('https://github.com/megaxenon83-server/ompbridge/releases/latest'),
  voice: ({ route, body }) => {
    if (!['/local', '/start', '/stop', '/transcribe', '/speak'].includes(route)) throw new Error('Ukjent talehandling.');
    const client = getBridge();
    if (body === undefined) return client.get('/api/voice' + route);
    return client.post('/api/voice' + route, body);
  },
  state: publicState,
  theme: theme => {
    store.theme = theme;
    delete store.accent;
    delete store.appearance;
    save();
  },
  appearance: ({ key, value }) => {
    const color = ['paper', 'panel', 'accent', 'text'].includes(key);
    if ((!color && !['uiFont', 'codeFont'].includes(key)) ||
        (value !== null && (typeof value !== 'string' ||
          !(color ? /^#[0-9a-f]{6}$/i : /^[\p{L}\p{N} _.-]{1,64}$/u).test(value)))) {
      throw new Error('Ugyldig verdi for utseende.');
    }
    store.appearance ||= {};
    if (value === null) delete store.appearance[key];
    else store.appearance[key] = value;
    save();
    return store.appearance;
  },
  appearanceChrome: ({ background, text }) => {
    if (/^#[0-9a-f]{6}$/i.test(background) && /^#[0-9a-f]{6}$/i.test(text)) {
      window.setTitleBarOverlay({ color: background, symbolColor: text, height: 44 });
    }
  },
  accent: value => {
    if (value !== null && !/^#[0-9a-f]{6}$/i.test(value)) throw new Error('Ugyldig farge.');
    store.accent = value;
    save();
  },
  selectOmp: async () => {
    const { filePaths } = await dialog.showOpenDialog(window, { properties: ['openFile'], filters: [{ name: 'OMP', extensions: ['exe'] }] });
    if (filePaths[0]) {
      const { stdout } = await exec(filePaths[0], ['--version'], { windowsHide: true, timeout: 10000 });
      if (!/omp[ /]/i.test(stdout)) throw new Error('Filen svarte ikke som OMP.');
      await reload();
      store.executable = filePaths[0];
      save();
    }
    return publicState();
  },
  version: () => runOmp(['--version']),
  scheduleList: () => store.jobs,
  scheduleAdd: ({ id, when, message }) => {
    getThread(id);
    const date = new Date(when);
    if (!Number.isFinite(date.getTime()) || date.getTime() <= Date.now() || typeof message !== 'string' || !message.trim()) {
      throw new Error('Velg et framtidig tidspunkt og skriv en oppgave.');
    }
    store.jobs.push({ id: randomUUID(), thread: id, when: date.toISOString(), message: message.trim(), status: 'pending' });
    save();
    return store.jobs;
  },
  scheduleCancel: id => {
    const job = store.jobs.find(item => item.id === id);
    if (job?.status === 'pending') { job.status = 'cancelled'; save(); }
    return store.jobs;
  },
  copyMessage: text => {
    if (typeof text !== 'string' || text.length > 1048576) throw new Error('Meldingen er for stor til å kopiere.');
    clipboard.writeText(text);
  },
  readMessage,
  stopReading,
  browser: url => openBrowser(url, window),
  projectPanel: id => {
    const { cwd } = getThread(id);
    const server = devServers.get(pathKey(cwd));
    return { defaults: projectDefaults(cwd), server: server?.address, test: projectTests.get(id)?.data,
      checks: turnChanges.checks(localTurnKey(id)) };
  },
  projectLaunch: async ({ id, command, address, staticPath }) => {
    const { cwd } = getThread(id);
    const key = pathKey(cwd);
    const previous = devServers.get(key);
    if (previous) {
      if (!previous.address) throw new Error('Prosjektet starter allerede.');
      return handlers.projectLoadPreview({ id, address: previous.address });
    }
    const entry = { address: undefined, output: '' };
    devServers.set(key, entry);
    try {
      if (command?.trim()) {
        const target = localAddress(address);
        entry.child = startCommand(cwd, command, text => {
          entry.output = (entry.output + text).slice(-12000);
          broadcast(id, { type: 'preview_output', text });
        }, (code, signal) => {
          if (devServers.get(key) !== entry) return;
          devServers.delete(key);
          if (entry.address) broadcast(id, { type: 'preview_stopped', text: 'Utviklingsserveren avsluttet.' });
          entry.failure = 'Utviklingsserveren avsluttet (' + (code ?? signal ?? 'feil') + ').';
        });
        let ready = false;
        for (let attempt = 0; attempt < 40 && !entry.failure && devServers.get(key) === entry; attempt++) {
          try {
            const request = await fetch(target, { signal: AbortSignal.timeout(650), redirect: 'manual' });
            if (request.body) await request.body.cancel();
            ready = true;
            break;
          } catch { await new Promise(resolve => setTimeout(resolve, 350)); }
        }
        if (!ready) throw new Error(entry.failure || 'Utviklingsserveren svarte ikke på ' + target.origin + '.');
        entry.address = target.href;
      } else {
        entry.server = await serveProject(cwd);
        if (devServers.get(key) !== entry) { entry.server.close(); throw new Error('Forhåndsvisningen ble stoppet.'); }
        const origin = 'http://127.0.0.1:' + entry.server.address().port;
        const target = new URL(staticPath || '/', origin);
        if (target.origin !== origin) throw new Error('Velg en lokal sti til HTML-filen.');
        entry.address = target.href;
      }
      broadcast(id, { type: 'preview_server', address: entry.address });
      return entry.address;
    } catch (error) {
      if (devServers.get(key) === entry) devServers.delete(key);
      entry.server?.close();
      stopCommand(entry.child);
      throw error;
    }
  },
  projectLoadPreview: async ({ id, address }) => {
    getThread(id);
    preview ||= createPreview(window, (thread, data) => broadcast(thread, { type: 'preview_ready', ...data }));
    await preview.load(id, address);
    return address;
  },
  projectPreviewBounds: ({ id, rect }) => preview?.bounds(id, rect),
  projectPick: id => {
    getThread(id);
    if (!preview) throw new Error('Åpne forhåndsvisningen først.');
    return preview.pick(id);
  },
  projectCancelPick: () => preview?.cancel(),
  projectStopPreview: id => {
    const key = pathKey(getThread(id).cwd);
    const entry = devServers.get(key);
    devServers.delete(key);
    entry?.server?.close();
    stopCommand(entry?.child);
  },
  projectRunTest: ({ id, command, userIndex }) => {
    const thread = getThread(id);
    const sessionFile = thread.shared ? thread.sessionFile : null;
    if (projectTests.get(id)?.data.running) throw new Error('En testkjøring pågår allerede.');
    if (!Number.isSafeInteger(userIndex) || userIndex < 0) throw new Error('Ugyldig plassering i samtalen.');
    const data = { id: randomUUID(), at: Date.now(), userIndex, command, output: '', running: true };
    const send = () => broadcast(id, { type: 'project_test', test: data });
    let timer;
    const child = startCommand(thread.cwd, command, output => {
      data.output = (data.output + output).slice(-45000);
      if (!timer) timer = setTimeout(() => { timer = null; send(); }, 100);
    }, (code) => {
      clearTimeout(timer);
      Object.assign(data, { running: false, exitCode: code === null || data.stopping ? null : code >>> 0, duration: Date.now() - data.at });
      try { turnChanges.saveCheck(localTurnKey(id), data); }
      catch (error) { data.output += '\nKunne ikke lagre testresultatet: ' + error.message; }
      send();
      if (sessionFile && userIndex > 0) {
        Promise.resolve().then(() => getBridge().post('/api/omp/turn-check', { file: sessionFile, check: {
          id: data.id, at: data.at, userIndex, duration: data.duration, exitCode: data.exitCode
        } })).then(() => { data.shared = true; send(); }, () => { data.shared = false; send(); });
      }
    });
    projectTests.set(id, { child, data });
    return data;
  },
  projectStopTest: id => {
    const record = projectTests.get(id);
    if (!record?.data.running) return;
    record.data.stopping = true;
    stopCommand(record.child);
  },
  terminal: ({ id, command }) => {
    const { cwd } = getThread(id);
    if (typeof command !== 'string' || !command.trim() || command.length > 32000) throw new Error('Oppgi en PowerShell-kommando.');
    let terminal = terminals.get(id);
    if (!terminal || terminal.child.exitCode !== null || terminal.child.killed) {
      terminal = new ProjectTerminal(cwd, text => broadcast(id, { type: 'terminal_output', text }));
      terminals.set(id, terminal);
    }
    terminal.send(command);
  },
  stopTerminal: id => {
    terminals.get(id)?.close();
    terminals.delete(id);
  },
  pairBridge: () => configure(async () => {
    const health = await connectInstalledBridge();
    const result = await syncShared();
    return { status: health.version, state: result };
  }),
  pairingAddresses,
  mobilePairing: address => createPairing(getBridge(), address),
  wolAdapters: () => wolRelay.adapters().map(({ address, label }) => ({ address, label })),
  wolDiscover: wolRelay.discoverRelays,
  wolConnect: options => wolRelay.connectRelay(getBridge(), options),
  closeMobilePairing: closePairing,
  bridgeSync: syncShared,
  bridgeRename: async ({ id, name }) => {
    const thread = getThread(id);
    const title = typeof name === 'string' ? name.trim() : '';
    if (!thread.shared || !thread.sessionFile || thread.hiddenFromSidebar || !title || title.length > 150) {
      throw new Error('Skriv inn et gyldig navn for den delte samtalen.');
    }
    await getBridge().post('/api/sessions/name', { file: thread.sessionFile, cwd: thread.cwd, name: title });
    return syncShared();
  },
  bridgeHistory: async id => {
    const thread = getThread(id);
    if (!thread.shared) throw new Error('Velg en delt tråd.');
    return refreshShared(thread);
  },
  bridgeApproval: async mode => {
    if (mode && !['deny', 'write', 'yolo', 'always-ask', 'always-ask-cached'].includes(mode)) {
      throw new Error('Ugyldig godkjenningsmodus.');
    }
    const result = bridge
      ? await (mode ? bridge.post('/api/approval', { mode }) : bridge.get('/api/approval'))
      : { approvalMode: mode || store.localApprovalMode || 'write' };
    if (mode) { store.localApprovalMode = result.approvalMode; save(); }
    return result;
  },
  bridgeRuntime: async id => {
    const thread = getThread(id);
    if (!thread.shared || !thread.sessionFile || busy.has(id)) return null;
    const runtime = await getBridge().get('/api/state', { cwd: thread.cwd });
    if (!isSamePath(runtime.sessionFile || runtime.state?.sessionFile, thread.sessionFile)) return null;
    return { busy: !!runtime.state?.isStreaming || !!runtime.request, request: runtime.request || null,
      todos: runtime.state?.todoPhases, contextUsage: runtime.state?.contextUsage, model: runtime.state?.model };
  },
  turnData: id => {
    const thread = getThread(id);
    if (!thread.shared) return { cards: turnChanges.list(localTurnKey(id)), checks: turnChanges.checks(localTurnKey(id)) };
    if (!thread.sessionFile) return { cards: [] };
    return getBridge().get('/api/omp/turns', { file: thread.sessionFile });
  },
  watchTurnData: id => {
    turnObserver?.abort();
    turnObserver = undefined;
    if (!id) return;
    const thread = getThread(id);
    if (!thread.shared) return;
    const controller = new AbortController();
    const stream = { text: '' };
    turnObserver = controller;
    void getBridge().subscribe(thread.cwd, frame => {
      if (isSamePath(frame.sessionFile, thread.sessionFile)) {
        if (['turn_changes', 'todo_phases'].includes(frame.type)) broadcast(id, frame);
        if (!busy.has(id)) {
          const activity = bridgeActivity(frame, stream);
          if (activity) broadcast(id, { ...activity, remote: true });
        }
      }
    }, controller.signal).catch(() => {});
  },
  turnDiff: ({ id, cardId, file }) => {
    const thread = getThread(id);
    return thread.shared
      ? getBridge().get('/api/omp/turn-diff', { file: thread.sessionFile, id: cardId, path: file })
      : turnChanges.diff(localTurnKey(id), cardId, file);
  },
  turnUndo: ({ id, cardId }) => {
    const thread = getThread(id);
    if (store.threads.some(other => busy.has(other.id) && isSamePath(other.cwd, thread.cwd))) {
      throw new Error('Vent til prosjektet er ledig før du angrer.');
    }
    return thread.shared
      ? getBridge().post('/api/omp/turn-undo', { file: thread.sessionFile, id: cardId })
      : { card: turnChanges.undo(localTurnKey(id), thread.cwd, cardId) };
  },
  threadHandoff: async input => {
    const id = typeof input === 'string' ? input : input.id;
    const check = typeof input === 'object' && /^[a-f0-9-]{36}$/.test(input.check) ? '?check=' + input.check : '';
    const thread = getThread(id);
    if (!thread.shared || !thread.sessionFile) throw new Error('Send en melding i en delt tråd først.');
    const link = 'chatomp://thread/' + encodeURIComponent(thread.sessionFile) + check;
    return { link, image: await QRCode.toDataURL(link, { margin: 2, width: 240 }) };
  },
  exportThread: async ({ id, markdown, copy }) => {
    const thread = getThread(id);
    if (typeof markdown !== 'string' || markdown.length > 8 * 1024 * 1024) throw new Error('Samtalen er for stor til eksport.');
    if (copy) { clipboard.writeText(markdown); return true; }
    const title = String(thread.title || 'Samtale').replace(/[<>:"/\\|?*\p{Cc}]/gu, '-').slice(0, 80);
    const { filePath } = await dialog.showSaveDialog(window, { defaultPath: title + '.md', filters: [{ name: 'Markdown', extensions: ['md'] }] });
    if (!filePath) return false;
    fs.writeFileSync(filePath, markdown, 'utf8');
    return true;
  },
  openProject: async () => {
    const { filePaths } = await dialog.showOpenDialog(window, { properties: ['openDirectory'] });
    const cwd = filePaths[0];
    if (!cwd) return;
    const project = store.projects.find(directory => isSamePath(directory, cwd)) || cwd;
    await handlers.pinProject(project);
    return project;
  },
  pinProject: async project => {
    if (typeof project !== 'string' || !path.isAbsolute(project) || !fs.statSync(project, { throwIfNoEntry: false })?.isDirectory()) {
      throw new Error('Prosjektmappen finnes ikke.');
    }
    if (bridge && sharedWorkspace) await bridge.post('/api/projects/register', { path: project, show: true });
    if (!store.projects.includes(project)) store.projects.push(project);
    if (!store.pinnedProjects.some(directory => isSamePath(directory, project))) store.pinnedProjects.push(project);
    save();
    return publicState();
  },
  removeProject: async project => {
    if (!store.pinnedProjects.some(directory => isSamePath(directory, project))) throw new Error('Fant ikke prosjektet.');
    if (bridge && sharedWorkspace) await bridge.post('/api/projects/hide', { path: project });
    store.pinnedProjects = store.pinnedProjects.filter(directory => !isSamePath(directory, project));
    save();
    return publicState();
  },
  trashThread: async id => {
    const thread = getThread(id);
    if (busy.has(id)) throw new Error('Vent til den aktive oppgaven er ferdig.');
    if (thread.shared && thread.sessionFile) {
      await getBridge().delete('/api/session', { file: thread.sessionFile });
    } else if (!thread.shared) {
      const session = sessions.get(id);
      if (session) { await captureSession(thread, session); await session.close(); sessions.delete(id); }
      if (thread.sessionFile && path.extname(thread.sessionFile) === '.jsonl' && fs.existsSync(thread.sessionFile)) {
        await shell.trashItem(thread.sessionFile);
      }
    }
    stopSharedStream(id);
    store.threads = store.threads.filter(item => item.id !== id);
    if (store.selected === id) store.selected = null;
    save();
    return publicState();
  },
  showProjectFolder: async project => {
    if (!store.pinnedProjects.includes(project)) throw new Error('Åpne prosjektet først.');
    const error = await shell.openPath(project);
    if (error) throw new Error(error);
  },
  newThread: async ({ project, worktree, local }) => {
    if (!store.projects.includes(project)) throw new Error('Åpne prosjektmappen først.');
    const id = randomUUID();
    let cwd = project;
    if (worktree) {
      cwd = path.join(app.getPath('userData'), 'worktrees', id);
      fs.mkdirSync(path.dirname(cwd), { recursive: true });
      await runGit(project, 'worktree', 'add', '-b', 'omp/' + id.slice(0, 8), cwd);
    }
    store.threads.push({ id, project, cwd, title: 'Ny tråd', shared: !!bridge && !local, localOnly: !!local, model: store.preferredModel });
    store.selected = id;
    save();
    return publicState();
  },
  selectThread: id => { getThread(id); store.selected = id; save(); },
  connect: async id => {
    if (configuring) throw new Error('Vent til OMP-oppsettet er oppdatert.');
    const thread = getThread(id);
    store.selected = id;
    save();
    if (thread.shared) {
      const client = getBridge();
      const [shared, history] = await Promise.all([client.get('/api/state', { cwd: thread.cwd }), refreshShared(thread)]);
      if (shared.cwdMissing) throw new Error('Arbeidsmappen finnes ikke lenger.');
      const selected = isSamePath(shared.sessionFile, thread.sessionFile) ? shared.state?.model || thread.model : history.model || thread.model;
      return { state: { ...shared.state, isStreaming: busy.has(id), model: labelManagedModel(selected) }, history };
    }
    const session = sessionFor(thread);
    const state = await captureSession(thread, session);
    const [history, commands] = await Promise.all([
      session.request('get_messages'),
      session.request('get_available_commands')
    ]);
    session.request('set_subagent_subscription', { level: 'progress' }).catch(() => {});
    return { state: { ...state, model: labelManagedModel(thread.model || state.model) }, history, commands };
  },
  localModels: scanModels,
  models: async (input) => {
    const { id, refresh } = typeof input === 'object' && input !== null ? input : { id: input };
    const thread = id ? getThread(id) : null;
    const [response, catalog] = await Promise.all([
      thread
        ? thread.shared ? getBridge().get('/api/models', { cwd: thread.cwd }) : installedModels(thread.cwd).then(models => ({ models }))
        : installedModels().then(models => ({ models: installedCatalog = models })),
      refresh ? scanModels() : scanning || localCatalog
    ]);
    const models = response.models || [];
    const known = new Set();
    const listed = models.map(model => {
      const local = matchLocal(model, catalog);
      if (!local) return labelManagedModel(model);
      known.add(local.origin + '/' + local.id);
      return { ...model, engine: local.engine, label: local.label };
    });
    if (thread && !thread.shared) listed.push(...catalog.filter(model => !known.has(model.origin + '/' + model.id)));
    return { models: listed };
  },
  model: async ({ id, provider, modelId }) => {
    if (id && getThread(id).shared) {
      const thread = getThread(id);
      if (busy.has(id) || configuring) throw new Error('Vent til den aktive oppgaven i samtalen er ferdig.');
      const { models } = await getBridge().get('/api/models', { cwd: thread.cwd });
      const model = models.find(item => item.provider === provider && item.id === modelId);
      if (!model) throw new Error('Modellen er ikke tilgjengelig i bridge.');
      const result = await getBridge().post('/api/model', { cwd: thread.cwd, provider, modelId,
        ...(thread.sessionFile ? { file: thread.sessionFile } : { stageOnly: true }) });
      thread.modelNeedsApply = !result.memorySwitched;
      thread.model = model;
      save();
      return { model: labelManagedModel(model) };
    }
    return configure(async () => {
      if (!id) {
        const model = installedCatalog.find(item => item.provider === provider && item.id === modelId);
        if (!model) throw new Error('Modellen er ikke lenger tilgjengelig i OMP.');
        await switchMemory(model);
        store.preferredModel = { provider: model.provider, id: model.id, name: model.name };
        save();
        return { model: labelManagedModel(store.preferredModel) };
      }
      const thread = getThread(id);
      const discovered = localCatalog.find(item => item.provider === provider && item.id === modelId);
      if (discovered) await registerDiscovered(discovered);
      const session = sessionFor(thread);
      let selectedSession = session;
      if (session.catalogueRevision !== catalogueRevision(ompHome)) {
        await captureSession(thread, session);
        await session.close();
        sessions.delete(thread.id);
        selectedSession = sessionFor(thread);
      }
      const previous = (await selectedSession.request('get_state')).model;
      const selected = await selectedSession.request('set_model', { provider, modelId });
      const model = selected?.model || selected;
      try { await switchMemory(model, undefined, id); }
      catch (error) {
        if (previous) await selectedSession.request('set_model', { provider: previous.provider, modelId: previous.id }).catch(() => {});
        throw error;
      }
      thread.model = model;
      save();
      return selected?.model ? { ...selected, model: labelManagedModel(model) } : labelManagedModel(model);
    });
  },
  prompt: async ({ id, message, images, chatProfile, thinking, clientMessageId }) => {
    const thread = getThread(id);
    if (busy.has(id) || configuring || (!thread.shared && memorySwitching)) throw new Error('Vent til den aktive OMP-handlingen er ferdig.');
    if (store.threads.some(other => other.id !== id && isSamePath(other.cwd, thread.cwd) && busy.has(other.id))) {
      throw new Error('Vent til den andre tråden i arbeidsmappen er ferdig.');
    }
    if (thread.shared) {
      busy.add(id);
      try {
        const hadHistory = !!thread.sessionFile;
        const client = await activateShared(thread);
        if ((!hadHistory || thread.modelNeedsApply) && thread.model) {
          await client.post('/api/model', { cwd: thread.cwd, provider: thread.model.provider, modelId: thread.model.id });
          thread.modelNeedsApply = false;
        }
        const ready = streamShared(thread, client);
        let timer;
        try {
          await Promise.race([ready, new Promise((_resolve, reject) => {
            timer = setTimeout(() => reject(new Error('Kunne ikke åpne live-strømmen fra OMP Bridge.')), 8000);
          })]);
        } finally { clearTimeout(timer); }
        const result = await client.post('/api/prompt', { cwd: thread.cwd, text: message, images, chatProfile, thinking, clientMessageId, ...(hadHistory && { file: thread.sessionFile }) });
        if (result.sessionFile && !thread.sessionFile) { thread.sessionFile = result.sessionFile; save(); }
        if (thread.title === 'Ny tråd' && !message.startsWith('/')) {
          thread.title = message.trim().split('\n')[0].slice(0, 52);
          save();
        }
        if (result.ack?.agentInvoked === false) { busy.delete(id); stopSharedStream(id); }
        return { ...result.ack, chatProfile: result.chatProfile };
      } catch (error) {
        busy.delete(id);
        stopSharedStream(id);
        throw error;
      }
    }
    busy.add(id);
    try {
      const policy = bridge ? await bridge.get('/api/approval').catch(error => {
        if (error.status !== 404) throw error;
        return null;
      }) : null;
      const approvalMode = policy?.approvalMode || store.localApprovalMode || 'write';
      const existing = sessions.get(id);
      if (existing && existing.approvalMode !== approvalMode) {
        await captureSession(thread, existing);
        await existing.close();
        sessions.delete(id);
        busy.add(id);
      }
      const session = sessionFor(thread, approvalMode);
      const current = await session.request('get_state');
      if (thread.model && (thread.model.provider !== current.model?.provider || thread.model.id !== current.model?.id)) {
        await session.request('set_model', { provider: thread.model.provider, modelId: thread.model.id });
      }
      await switchMemory(thread.model || current.model, id);
      try {
        const history = await session.request('get_messages');
        turnChanges.start(id, thread.cwd, history.messages.filter(item => item.role === 'user' && !item.synthetic).length);
      } catch (error) { console.error('Endringskort:', error.message); }
      if (thinking) {
        const state = await session.request('get_state');
        if (state.model?.provider === thinking.provider && state.model?.id === thinking.id) {
          await session.request('set_thinking_level', { level: thinking.level });
        }
      }
      const result = await session.request('prompt', { message, images });
      if (result?.agentInvoked === false) { busy.delete(id); releaseLocalGpu(id); turnChanges.cancel(id); }
      if (thread.title === 'Ny tråd' && !message.startsWith('/')) {
        thread.title = message.trim().split('\n')[0].slice(0, 52);
        save();
      }
      return result;
    } catch (error) { busy.delete(id); releaseLocalGpu(id); turnChanges.cancel(id); throw error; }
  },
  abort: async id => {
    const thread = getThread(id);
    if (!thread.shared) return sessionFor(thread).request('abort');
    const client = getBridge();
    const state = await client.get('/api/state', { cwd: thread.cwd });
    if (!isSamePath(state.sessionFile, thread.sessionFile)) throw new Error('En annen samtale er aktiv i bridge.');
    await client.post('/api/abort', { cwd: thread.cwd, file: thread.sessionFile });
    busy.delete(id);
    stopSharedStream(id);
    broadcast(id, { type: 'agent_end' });
  },
  dialog: ({ id, requestId, result }) => {
    const thread = getThread(id);
    if (thread.shared) return getBridge().post('/api/ask', { cwd: thread.cwd, ...result, id: requestId });
    return sessionFor(thread).send('extension_ui_response', { ...result, id: requestId });
  },
  attachments: async () => {
    const { filePaths } = await dialog.showOpenDialog(window, {
      properties: ['openFile', 'multiSelections'],
      filters: [{ name: 'Bilder', extensions: ['png', 'jpg', 'jpeg', 'webp', 'gif'] }]
    });
    const extensions = { '.png': 'png', '.jpg': 'jpeg', '.jpeg': 'jpeg', '.webp': 'webp', '.gif': 'gif' };
    if (filePaths.reduce((size, file) => size + fs.statSync(file).size, 0) > 700000) throw new Error('Bildene kan være opptil 700 kB til sammen.');
    return filePaths.map(file => ({
      name: path.basename(file),
      image: { type: 'image', mimeType: 'image/' + extensions[path.extname(file).toLowerCase()], data: fs.readFileSync(file).toString('base64') }
    }));
  },
  git: async id => {
    const { cwd } = getThread(id);
    try {
      if ((await runGit(cwd, 'rev-parse', '--is-inside-work-tree')).trim() !== 'true') return { repository: false, reason: 'bare' };
    } catch (error) {
      if (error.code === 'ENOENT') return { repository: false, reason: fs.existsSync(cwd) ? 'missing-git' : 'missing-folder' };
      if (/not a git repository/i.test(error.stderr || '')) return { repository: false, reason: 'untracked' };
      return { repository: false, reason: 'error', detail: (error.stderr || error.message).trim() };
    }
    const [branch, status, staged, diff] = await Promise.all([
      runGit(cwd, 'branch', '--show-current'), runGit(cwd, 'status', '--short'),
      runGit(cwd, 'diff', '--cached', '--no-ext-diff', '--no-color'), runGit(cwd, 'diff', '--no-ext-diff', '--no-color')
    ]);
    return { repository: true, branch: branch.trim(), status, staged, diff };
  },
  gitInit: async id => {
    if ((await handlers.git(id)).reason !== 'untracked') throw new Error('Arbeidsmappen kan ikke initialiseres nå.');
    await runGit(getThread(id).cwd, 'init');
  },
  projectEntries: ({ id, relative }) => {
    const directory = projectPath(getThread(id), relative);
    return fs.readdirSync(directory, { withFileTypes: true })
      .filter(entry => entry.name !== '.git' && (entry.isDirectory() || entry.isFile()))
      .sort((a, b) => Number(b.isDirectory()) - Number(a.isDirectory()) || a.name.localeCompare(b.name, 'nb'))
      .map(entry => ({ name: entry.name, directory: entry.isDirectory() }));
  },
  projectPreview: ({ id, relative }) => {
    const file = projectPath(getThread(id), relative);
    const stat = fs.statSync(file);
    if (!stat.isFile() || stat.size > 256 * 1024) throw new Error('Forhåndsvisning støtter tekstfiler på opptil 256 kB.');
    const data = fs.readFileSync(file);
    if (data.includes(0)) throw new Error('Filen kan ikke vises som tekst.');
    return data.toString('utf8');
  },
  gitFiles: async id => {
    const { cwd } = getThread(id);
    const status = await runGit(cwd, 'status', '--porcelain=v1', '-z', '--untracked-files=all', '--no-renames', '--', '.');
    return status.split('\0').filter(Boolean).map(line => ({ index: line[0], work: line[1], file: line.slice(3) }));
  },
  gitHunks: async ({ id, file, staged }) => {
    const cwd = (await runGit(getThread(id).cwd, 'rev-parse', '--show-toplevel')).trim();
    if (!(await handlers.gitFiles(id)).some(item => item.file === file)) throw new Error('Filen er ikke i endringslisten.');
    const diff = await runGit(cwd, '--literal-pathspecs', 'diff', ...(staged ? ['--cached'] : []), '--no-ext-diff', '--no-color', '--no-renames', '--', file);
    return hunks(diff).map(({ label, text }) => ({ label, text }));
  },
  gitChange: async ({ id, file, staged, hunk, expected }) => {
    const cwd = (await runGit(getThread(id).cwd, 'rev-parse', '--show-toplevel')).trim();
    const files = await handlers.gitFiles(id);
    if (!files.some(item => item.file === file)) throw new Error('Filen er ikke lenger i endringslisten.');
    if (hunk === undefined) {
      if (staged) return runGit(cwd, '--literal-pathspecs', 'restore', '--staged', '--', file);
      return runGit(cwd, '--literal-pathspecs', 'add', '--', file);
    }
    const diff = await runGit(cwd, '--literal-pathspecs', 'diff', ...(staged ? ['--cached'] : []), '--no-ext-diff', '--no-color', '--no-renames', '--', file);
    const selected = hunks(diff)[hunk];
    if (!selected || selected.text !== expected || /^(new file mode|deleted file mode) /m.test(diff)) {
      throw new Error('Endringsblokken er endret eller inngår i en ny eller slettet fil. Oppdater diffen.');
    }
    await new Promise((resolve, reject) => {
      const child = execFile('git.exe', ['-C', cwd, 'apply', '--cached', ...(staged ? ['--reverse'] : []), '-'], {
        windowsHide: true, timeout: 15000
      }, (error, _stdout, stderr) => error ? reject(new Error(stderr || error.message)) : resolve());
      child.stdin.on('error', reject);
      child.stdin.end(selected.patch);
    });
  },
  adbStatus: () => getBridge().get('/api/adb/status'),
  adbInstall: () => getBridge().post('/api/adb/install', {}),
  openSkills: async ({ id } = {}) => {
    const thread = id ? getThread(id) : null;
    let project = thread?.cwd || store.pinnedProjects?.[0];
    if (!project) {
      const { filePaths } = await dialog.showOpenDialog(window, { properties: ['openDirectory'], title: 'Velg prosjekt for Skills' });
      project = filePaths[0];
      if (!project) return null;
    }
    const client = getBridge();
    const address = await skillsPortal.open(async input => {
      if (input.action === 'try-skill') {
        const library = await client.post('/api/omp/workspace/plugins', { cwd: project, action: 'skill-library' });
        const item = library.items.find(item => item.name === input.name && item.enabled &&
          library.loaded.some(loaded => loaded.name === item.name && loaded.sha === item.sha));
        if (!item) throw new Error('Aktiver og last skillen i prosjektet først.');
        const draft = item.name === 'find-skills' ? 'Finn tre skills som passer dette prosjektet, og forklar hva de gjør.'
          : 'Bruk ' + item.name + ' til å foreslå et lite første steg i dette prosjektet.';
        if (!thread?.shared && !store.projects.includes(project)) await handlers.pinProject(project);
        const state = thread?.shared ? publicState() : await handlers.newThread({ project });
        window.show();
        if (window.isMinimized()) window.restore();
        window.focus();
        broadcast(thread?.shared ? thread.id : state.selected, { type: 'skill_draft', draft, state });
        return { ok: true };
      }
      const result = await client.post('/api/omp/workspace/plugins', { ...input, cwd: project });
      if (input.action === 'preview-skill' && result.requires === 'agent-browser') {
        try { await exec('where.exe', ['agent-browser'], { windowsHide: true, timeout: 3000 }); result.dependencyAvailable = true; }
        catch { result.dependencyAvailable = false; }
      }
      return { ...result, project: path.basename(project) || project };
    });
    await shell.openExternal(address);
    return address;
  },
  skillCatalog: ({ id, action, target }) => {
    if (!['catalog', 'preview-skill', 'install-skill'].includes(action)) throw new Error('Ugyldig skillhandling.');
    const thread = id ? getThread(id) : null;
    if (action !== 'catalog' && !thread?.shared) throw new Error('Åpne en delt samtale for å installere en skill.');
    return getBridge().post('/api/omp/workspace/plugins', { cwd: thread?.cwd || home, action, target });
  },
  plugins: async ({ action, target, scope, id }) => {
    if (!['list', 'discover', 'enable', 'disable', 'install', 'marketplaceAdd', 'test', 'test-skill', 'set-skill-scope'].includes(action)) throw new Error('Ukjent pluginhandling.');
    const thread = id ? getThread(id) : null;
    const cwd = thread?.cwd || home;
    if (store.bridgeConfig && ['list', 'enable', 'disable', 'test', 'test-skill'].includes(action) && (thread || action === 'list')) {
      const client = getBridge();
      const file = thread?.shared ? thread.sessionFile : undefined;
      if (action === 'list') return client.get('/api/omp/workspace/plugins', { cwd, ...(file && { file }) });
      return client.post('/api/omp/workspace/plugins', { cwd, action, target, scope, file });
    }
    if (action === 'test' || action === 'test-skill') throw new Error('Åpne et delt prosjekt for å teste ressursen.');
    if (['enable', 'disable', 'install', 'marketplaceAdd'].includes(action)) {
      if (typeof target !== 'string' || !target.trim() || target.startsWith('-') || /[\r\n\0]/.test(target)) throw new Error('Ugyldig pakkereferanse.');
      const args = action === 'marketplaceAdd' ? ['plugin', 'marketplace', 'add', target.trim()] : ['plugin', action, target.trim()];
      if (['project', 'user'].includes(scope)) args.push('--scope=' + scope);
      return configure(async () => {
        const result = await runOmp(args, cwd);
        await reload();
        return result;
      });
    }
    const text = await runOmp(['plugin', action, '--json'], cwd);
    if (!text || text === 'No plugins available') return [];
    if (action === 'list') {
      const result = JSON.parse(text);
      const { skills = [] } = JSON.parse(await runOmp(['skill', 'list', '--json'], cwd));
      const inactive = await configArray(cwd, 'disabledExtensions');
      return { ...result, skills: skills.map(item => ({ ...item, kind: 'skill', enabled: !inactive.includes('skill:' + item.name) })) };
    }
    if (/^[\[{]/.test(text)) return JSON.parse(text);
    const list = await runOmp(['plugin', 'marketplace', 'list', '--json'], cwd);
    const marketplaces = [...list.matchAll(/^\s{2}([a-z0-9_.-]+)\s+\S.*$/gmi)].map(match => match[1]);
    const results = await Promise.all(marketplaces.map(async marketplace => {
      const catalog = await runOmp(['plugin', 'discover', marketplace, '--json'], cwd);
      return [...catalog.matchAll(/^\s{2}([a-z0-9_.-]+)(?:\s+.*)?$/gmi)]
        .map(match => ({ name: match[1], marketplace }));
    }));
    return results.flat();
  },
  setSkillScope: ({ id, target, scope, enabled }) => {
    const thread = getThread(id);
    if (!thread.shared) throw new Error('Velg en delt samtale.');
    return getBridge().post('/api/omp/workspace/plugins', {
      cwd: thread.cwd, file: thread.sessionFile, action: 'set-skill-scope', target, scope, enabled
    });
  },
  resources: id => configure(() => {
    const thread = id ? getThread(id) : null;
    if (thread?.shared) return getBridge().get('/api/omp/workspace/resources', { cwd: thread.cwd });
    return resourceList(id);
  }),
  toggleResource: ({ id, kind, name, enabled }) => configure(async () => {
    const thread = getThread(id);
    if (thread.shared) return getBridge().post('/api/omp/workspace/resources', { cwd: thread.cwd, kind, name, enabled });
    if (typeof name !== 'string' || !/^[\p{L}\p{N}_:.@/-]+$/u.test(name) || name.startsWith('-')) throw new Error('Ugyldig ressursnavn.');
    if (kind === 'mcp') {
      const output = await sessionFor(thread).localCommand('/mcp ' + (enabled ? 'enable ' : 'disable ') + name);
      if (!output || /failed|not found|unknown|error/i.test(output)) throw new Error(output || 'OMP bekreftet ikke endringen.');
      await reload();
      return;
    }
    const settings = store.resources[thread.project] ||= {};
    if (kind === 'tool') {
      const groups = await resourceList(id);
      if (!groups.Verktøy.some(item => item.name === name)) throw new Error('Verktøyet finnes ikke i denne OMP-økten.');
      const included = new Set(groups.Verktøy.filter(item => item.enabled).map(item => item.name));
      if (enabled) included.add(name);
      else included.delete(name);
      settings.tools = [...included];
      settings.knownTools = groups.Verktøy.map(item => item.name);
      const disabled = new Set(settings.disabledTools || []);
      if (enabled) disabled.delete(name);
      else disabled.add(name);
      settings.disabledTools = [...disabled];
    } else {
      const isSkill = kind === 'skill';
      if (!isSkill && kind !== 'agent') throw new Error('Ukjent ressurstype.');
      const key = isSkill ? 'disabledExtensions' : 'disabledAgents';
      const target = isSkill ? 'skill:' + name : name;
      const disabled = new Set(settings[key] || await configArray(thread.cwd, isSkill ? key : 'task.' + key));
      if (enabled) disabled.delete(target);
      else disabled.add(target);
      settings[key] = [...disabled];
      settings.overlay ||= randomUUID();
      const overlay = {};
      if (settings.disabledExtensions) overlay.disabledExtensions = settings.disabledExtensions;
      if (settings.disabledAgents) overlay.task = { disabledAgents: settings.disabledAgents };
      write(path.join(app.getPath('userData'), 'overlays', settings.overlay + '.yml'), YAML.stringify(overlay));
    }
    save();
    await reload();
  }),
  providerCatalog: async id => {
    const models = await installedModels(id ? getThread(id).cwd : undefined).catch(() => []);
    const counts = new Map();
    for (const model of models) counts.set(model.provider, (counts.get(model.provider) || 0) + 1);
    const modelsConfig = providerDocument().toJSON()?.providers || {};
    const config = read(path.join(ompHome, 'config.yml'), YAML.parse, {}) || {};
    const configured = new Map([...Object.entries(config.providers || {}), ...Object.entries(modelsConfig)]);
    const credentials = new Map(storedCredentials().map(row => [row.provider, row.hasCredential === 1]));
    const providers = new Set([...nativeProviders.keys(), ...configured.keys(), ...credentials.keys(), ...counts.keys()]);
    return [...providers].map(id => {
      const entry = configured.get(id);
      const custom = !!entry?.baseUrl;
      const modelCount = counts.get(id) || 0;
      const disabled = Array.isArray(config.disabledProviders) && config.disabledProviders.includes(id);
      return {
        id, name: nativeProviders.get(id) || id, hasAccount: Object.hasOwn(accountPages, id),
        configured: !!entry || credentials.has(id) || modelCount > 0,
        hasCredential: !!entry?.apiKey || credentials.get(id) === true,
        custom, disabled, modelCount, canConnect: nativeProviders.has(id) && !custom
      };
    });
  },
  openProviderAccount: id => {
    if (!Object.hasOwn(accountPages, id)) throw new Error('Ukjent kontoside.');
    return shell.openExternal(accountPages[id]);
  },
  connectProvider: ({ id, key, shared }) => configure(async () => {
    if (!nativeProviders.has(id)) throw new Error('Ukjent OMP-leverandør.');
    const doc = providerDocument();
    if (doc.hasIn(['providers', id, 'baseUrl'])) {
      throw new Error('Denne leverandøren har et eget endepunkt i OMP. Oppdater nøkkelen under Egen adresse.');
    }
    await saveProvider(id, {}, validateKey(key), shared === true);
    return { id, name: nativeProviders.get(id), shared: shared === true };
  }),
  testProvider: async data => {
    const entries = await discoverEndpoint(data.api, data.url, validateKey(data.key, false));
    return { models: entries.length, found: entries.includes(data.model) };
  },
  discoverProvider: async data => {
    if (!['openai-completions', 'openai-responses', 'anthropic-messages'].includes(data.api)) throw new Error('API-typen støttes ikke.');
    return discoverEndpoint(data.api, data.url, validateKey(data.key, false));
  },
  addProvider: data => configure(async () => {
    const { name, model, api } = data;
    if (!/^[a-z0-9][a-z0-9_-]{1,40}$/.test(name)) throw new Error('Oppgi en leverandør-ID med små bokstaver, tall eller bindestrek.');
    if (!['openai-completions', 'openai-responses', 'anthropic-messages'].includes(api)) throw new Error('API-typen støttes ikke.');
    const baseUrl = apiEndpoint(data.url).href.replace(/\/$/, '');
    const key = validateKey(data.key, false);
    const doc = providerDocument();
    const previous = doc.getIn(['providers', name, 'baseUrl']);
    if (doc.hasIn(['providers', name]) && previous !== baseUrl) {
      throw new Error('Leverandør-ID-en er allerede i bruk med en annen adresse.');
    }
    const explicitModel = typeof model === 'string' ? model.trim() : '';
    const entries = explicitModel ? [explicitModel] : await discoverEndpoint(api, baseUrl, key);
    if (!entries.length) throw new Error('Endepunktet oppga ingen modeller. Oppgi en modell-ID manuelt.');
    const config = { baseUrl, api, auth: key ? 'apiKey' : 'none', authHeader: !!key };
    if (explicitModel) config.models = [{ id: explicitModel }];
    else config.discovery = { type: 'openai-models-list', injectV1: false };
    await saveProvider(name, config, key, data.shared === true);
    return { models: entries.length, shared: data.shared === true };
  })
};

app.whenReady().then(async () => {
  const dataDir = process.env.OMP_DESKTOP_DATA_DIR;
  if (dataDir) app.setPath('userData', path.resolve(dataDir));
  turnChanges = createTurnChanges(path.join(app.getPath('userData'), 'turn-changes'));
  storePath = path.join(app.getPath('userData'), 'settings.json');
  store = { theme: 'fjord', projects: [], threads: [], secrets: {}, resources: {}, jobs: [], ...read(storePath, JSON.parse, {}) };
  store.pinnedProjects ??= store.projects.filter(project => {
    const threads = store.threads.filter(thread => isSamePath(thread.project, project));
    return !threads.length || threads.some(thread => !thread.shared || Object.hasOwn(thread, 'localOnly') || !isSamePath(thread.cwd, project));
  });
  for (const job of store.jobs) {
    if (job.status === 'sending') job.status = 'interrupted';
  }
  scheduleTimer = setInterval(() => checkSchedule().catch(error => console.error(error.message)), 2000);
  if (store.bridgeConfig) {
    const { address, token } = store.bridgeConfig;
    try { bridge = new Bridge(address, safeStorage.decryptString(Buffer.from(token, 'base64'))); }
    catch { delete store.bridgeConfig; }
  }
  if (!process.env.OMP_DESKTOP_DATA_DIR) {
    try {
      const local = installedBridgeClient();
      if (!bridge || bridge.origin === local.origin || store.bridgeConfig?.installed === true) await connectInstalledBridge();
    } catch {}
  }
  ipcMain.handle('desktop', async (event, action, data) => {
    if (event.senderFrame !== window.webContents.mainFrame || !Object.hasOwn(handlers, action)) throw new Error('Ukjent handling.');
    return handlers[action](data);
  });
  window = new BrowserWindow({
    width: 1480, height: 900, minWidth: 860, minHeight: 600, title: 'OMP Desktop',
    backgroundColor: '#151922', autoHideMenuBar: true, titleBarStyle: 'hidden',
    titleBarOverlay: { color: '#151922', symbolColor: '#e9edf4', height: 44 },
    webPreferences: { preload: path.join(__dirname, 'preload.cjs'), sandbox: true, contextIsolation: true, nodeIntegration: false }
  });
  window.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  window.webContents.on('will-navigate', event => event.preventDefault());
  window.loadFile(path.join(__dirname, 'index.html'));
  scanModels().catch(() => {});
});

app.on('before-quit', () => {
  skillsPortal.close();
  stopReading();
  preview?.close();
  for (const entry of devServers.values()) { entry.server?.close(); stopCommand(entry.child); }
  for (const { child } of projectTests.values()) stopCommand(child);
  turnObserver?.abort();
  closePairing();
  clearInterval(scheduleTimer);
  for (const session of sessions.values()) session.close();
  for (const terminal of terminals.values()) terminal.close();
  for (const id of sharedStreams.keys()) stopSharedStream(id);
});
app.on('window-all-closed', () => app.quit());
