const { app, BrowserWindow, shell: desktopShell } = require('electron');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { execFileSync } = require('node:child_process');
const { spawn } = require('node:child_process');
const { setTimeout: sleep } = require('node:timers/promises');
const { randomUUID } = require('node:crypto');
const http = require('node:http');
const os = require('node:os');
const { version } = require('../package.json');

const root = path.join(__dirname, '..');
const sdk = process.env.ANDROID_SDK_ROOT || process.env.ANDROID_HOME || 'C:\\Android';
const adb = path.join(sdk, 'platform-tools', 'adb.exe');
const serial = process.env.ANDROID_SERIAL || 'emulator-5554';
const pkg = 'net.nimay.chatompomp';
const activity = pkg + '/.MainActivity';
const test = fs.mkdtempSync(path.join(fs.realpathSync.native(os.tmpdir()), '.desktop-test-mobile-'));
const project = path.join(test, 'project');
const profile = path.join(test, 'profile');
const release = process.env.OMP_TEST_RELEASE_DIR || path.join(root, 'dist', version);
const androidVersion = fs.readFileSync(path.join(root, 'android', 'AndroidManifest.xml'), 'utf8').match(/android:versionName="([\d.]+)"/)[1];
const marker = 'ChatOmp' + Date.now().toString().slice(-8);
const voiceFixture = 'Fixture OK. This is a local reading test for the Android voice. ' +
  'The text stays on the device. This sentence makes the reading long enough to verify the stop control. ' +
  'The application can stop the voice while it is reading and make the same message available again.';
const isolatedBridge = process.env.OMP_TEST_TURN_BRIDGE;
let fixtureBridge;
let fixtureModel;
const heldReplies = new Map();
const requestedTools = new Map();
const requestSizes = new Map();

function command(...args) {
  return execFileSync(adb, ['-s', serial, ...args], { encoding: 'utf8', windowsHide: true, timeout: 22000 });
}

function shell(...args) { return command('shell', ...args); }

function dump() {
  const file = '/data/local/tmp/chat-omp-smoke.xml';
  shell('uiautomator', 'dump', file);
  const xml = shell('cat', file);
  return [...xml.matchAll(/<node\s([^>]+)>/g)].map(match => {
    const item = {};
    for (const attr of match[1].matchAll(/([\w-]+)="([^"]*)"/g)) item[attr[1]] = attr[2];
    return item;
  }).filter(item => item.package === pkg || item.package === 'android');
}

const label = item => item.text || item['content-desc'] || '';
const exact = value => item => label(item).toLowerCase() === value.toLowerCase();
const partial = value => item => label(item).includes(value);

async function until(check, description, ms = 45000) {
  const end = Date.now() + ms;
  let last;
  while (Date.now() < end) {
    try {
      const result = await check();
      if (result) return result;
    } catch (error) { last = error; }
    await sleep(450);
  }
  throw new Error('Tidsavbrudd: ' + description + (last ? ' · ' + last.message.slice(0, 240) : ''));
}

const drawn = item => {
  const box = [...(item.bounds || '').matchAll(/\d+/g)].map(match => Number(match[0]));
  return box.length === 4 && box[0] < box[2] && box[1] < box[3];
};
const edit = item => item.class === 'android.widget.EditText' && item.enabled === 'true';
const visible = (match, description, ms) => until(() => dump().filter(drawn).reverse().find(match), description, ms);
async function tap(match, description, hold = false) {
  const item = await visible(match, description);
  const values = [...item.bounds.matchAll(/\d+/g)].map(match => Number(match[0]));
  assert(values.length === 4 && values[0] < values[2] && values[1] < values[3], 'Ugyldige grenser for ' + description);
  const x = String(Math.round((values[0] + values[2]) / 2));
  const y = String(Math.round((values[1] + values[3]) / 2));
  if (hold) shell('input', 'swipe', x, y, x, y, '750');
  else shell('input', 'tap', x, y);
}

async function moveSlider(name, fraction) {
  const item = await visible(row => row.class === 'android.widget.SeekBar' && label(row).includes(name), name);
  const [left, top, right, bottom] = [...item.bounds.matchAll(/\d+/g)].map(match => Number(match[0]));
  shell('input', 'tap', String(Math.round(left + (right - left) * fraction)), String(Math.round((top + bottom) / 2)));
}

function typed(text) { shell('input', 'text', text.replaceAll(' ', '%s')); }

async function chooseLocalModel() {
  await tap(item => ['velg modell', 'qwen2.5:1.5b'].includes(label(item).toLowerCase()), 'åpne modellvelger');
  await tap(edit, 'modellfilter');
  typed('qwen2.5:1.5b');
  await tap(item => label(item).startsWith('qwen2.5:1.5b') && item.class !== 'android.widget.EditText', 'velg lokal modell på Android');
}

async function sendMobile(text) {
  await tap(edit, 'skrivefelt');
  typed(text);
  await tap(item => label(item) === 'Send' || label(item) === '↑', 'send fra Android');
}

async function checkOrnith(ipc, js) {
  const state = await ipc('newThread', { project });
  const id = state.selected;
  const { models } = await ipc('models', id);
  const provider = process.env.OMP_TEST_ORNITH_PROVIDER || 'ornith-sycl';
  const model = models.find(item => item.provider === provider && item.id.startsWith('ornith-1.5-9b-q4_k_m'));
  assert(model, 'Ornith 1.5 SYCL mangler i OMP Bridge-katalogen.');
  await ipc('model', { id, provider: model.provider, modelId: model.id });
  const history = async () => (await ipc('bridgeHistory', id)).messages;
  async function reply(message) {
    return until(async () => {
      const list = await history();
      const index = list.findIndex(item => item.role === 'user' && item.text === message);
      return index >= 0 && list.slice(index + 1).find(item => item.role === 'assistant' && item.text?.trim());
    }, 'Ornith-svar etter ' + message, 220000);
  }
  const first = 'Ornith test ' + marker + '. Svar kun med OK.';
  await ipc('prompt', { id, message: first });
  const answer = await reply(first);
  assert.match(answer.text, /\bOK\b/i);
  console.log('OMP Desktop fikk svar fra ' + model.provider + '/' + model.id + ': ' + answer.text.slice(0, 100));
  const handoff = await ipc('threadHandoff', id);
  shell('am', 'start', '-W', '-a', 'android.intent.action.VIEW', '-d', handoff.link, '-n', activity);
  await visible(exact(first), 'PC-meldingen i delt Android-tråd');
  await visible(exact(answer.text.trim()), 'Ornith-svaret i Android');
  await tap(item => /^velg modell$|ornith/i.test(label(item)) && item.class === 'android.widget.Button', 'Ornith i Android-modellvelgeren');
  await tap(edit, 'modellfilter');
  typed('Ornith');
  await tap(item => item.class === 'android.widget.Button' && /ornith/i.test(label(item)) &&
    /128\s*k/i.test(label(item)) === /128k$/.test(provider), 'velg samme Ornith-profil på Android');
  const followup = marker + ' Svar bare med JA';
  await sendMobile(followup);
  const phoneAnswer = await reply(followup);
  assert.match(phoneAnswer.text, /\bJA\b/i);
  await visible(exact(followup), 'Android-oppfølging');
  await visible(exact(phoneAnswer.text.trim()), 'Ornith svarte på Android-oppfølgingen');
  const again = marker + ' Svar bare med TRE';
  await ipc('prompt', { id, message: again });
  assert.match((await reply(again)).text, /\bTRE\b/i);
  await visible(exact(again), 'ny Windows-melding i Android');

  const check = await ipc('projectRunTest', { id, command: "Write-Output 'Ornith sync verified'; exit 0", userIndex: 3 });
  await until(async () => (await ipc('turnData', id)).checks?.some(item => item.id === check.id && item.exitCode === 0),
    'testutfall lagret i den installerte bridgen');
  const review = await ipc('threadHandoff', { id, check: check.id });
  shell('am', 'start', '-W', '-a', 'android.intent.action.VIEW', '-d', review.link, '-n', activity);
  await visible(partial('Tester bestod'), 'testresultat åpnet i Android');
  await js(`(async () => { state = await window.desktop.run('state'); await connect(${JSON.stringify(id)}); })()`);
  await until(() => js("document.getElementById('location').textContent === 'Lokal'"), 'Ornith vises som lokal modell');
  const thread = (await ipc('state')).threads.find(item => item.id === id);
  assert.equal(thread.model?.id, model.id);
  console.log('Ornith-synk begge veier og Gjennomgå på Android bestod. Samtale: ' + thread.title);
}

function prepare() {
  fs.mkdirSync(project, { recursive: true });
  fs.mkdirSync(path.join(project, 'Arbeidsmapper'));
  fs.mkdirSync(profile, { recursive: true });
  fs.writeFileSync(path.join(profile, 'settings.json'), JSON.stringify({ projects: [project], threads: [] }));
  const git = (...args) => execFileSync('git.exe', args, { cwd: project, encoding: 'utf8', windowsHide: true });
  git('init', '-b', 'main');
  fs.writeFileSync(path.join(project, 'note.txt'), 'Original\n');
  git('add', 'note.txt');
  git('-c', 'user.name=Chat OMP smoke', '-c', 'user.email=smoke@example.invalid', 'commit', '-m', 'Fixture');
  fs.writeFileSync(path.join(project, 'note.txt'), 'ChatOmpFileTest\n');
  return git;
}

const git = prepare();
process.env.OMP_DESKTOP_DATA_DIR = profile;
app.disableHardwareAcceleration();
if (process.env.OMP_TEST_DESKTOP_MIC_WAV) {
  app.commandLine.appendSwitch('use-fake-ui-for-media-stream');
  app.commandLine.appendSwitch('use-fake-device-for-media-stream');
  app.commandLine.appendSwitch('use-file-for-fake-audio-capture', process.env.OMP_TEST_DESKTOP_MIC_WAV + '%noloop');
}

async function setupTurnFixture() {
  const host = path.join(test, 'appdata');
  const bridgeDir = path.join(host, 'Nimay', 'OMPBridge', 'bridge');
  const agent = path.join(test, 'omp-test', 'agent');
  const sessionDir = path.join(test, 'sessions');
  const omp = path.join(process.env.LOCALAPPDATA, 'omp', 'omp.exe');
  for (const directory of [bridgeDir, agent, sessionDir]) fs.mkdirSync(directory, { recursive: true });
  if (process.env.OMP_TEST_VOICE_DIR) {
    fs.symlinkSync(process.env.OMP_TEST_VOICE_DIR, path.join(path.dirname(bridgeDir), 'voice'), 'junction');
  }
  fs.copyFileSync(isolatedBridge, path.join(bridgeDir, 'omp-bridge.mjs'));
  fs.copyFileSync(path.join(root, 'turn-changes.cjs'), path.join(bridgeDir, 'omp-turn-changes.cjs'));
  for (const extra of ['omp-workspace.cjs', 'local-models.cjs', 'workspace-extension.mjs', 'adb.cjs', 'project-plugins.mjs', 'skill-catalog.cjs', 'skill-library.cjs', 'device-action.ps1', 'skills']) {
    const file = path.join(path.dirname(isolatedBridge), extra);
    if (fs.existsSync(file)) fs.cpSync(file, path.join(bridgeDir, extra), { recursive: true });
  }
  const skill = path.join(project, '.omp', 'skills', 'workspace-fixture');
  fs.mkdirSync(skill, { recursive: true });
  fs.writeFileSync(path.join(skill, 'SKILL.md'), '---\nname: workspace-fixture\ndescription: Fixture for shared workspaces\n---\nUse only in a test.\n');
  fs.writeFileSync(path.join(profile, 'settings.json'), JSON.stringify({ projects: [project], threads: [], executable: omp }));
  fixtureModel = http.createServer(async (request, response) => {
    const chunks = [];
    for await (const chunk of request) chunks.push(chunk);
    if (request.url === '/mcp') {
      const message = JSON.parse(Buffer.concat(chunks).toString() || '{}');
      if (message.id === undefined) { response.writeHead(202).end(); return; }
      const result = message.method === 'initialize'
        ? { protocolVersion: message.params.protocolVersion, capabilities: { tools: {} },
          serverInfo: { name: 'workspace-fixture', version: '1.0.0' } }
        : { tools: [] };
      response.setHeader('Content-Type', 'application/json');
      response.end(JSON.stringify({ jsonrpc: '2.0', id: message.id, result }));
      return;
    }
    if (!request.url.endsWith('/chat/completions')) return response.writeHead(404).end();
    const data = JSON.parse(Buffer.concat(chunks).toString());
    const userIndex = data.messages.findLastIndex(item => item.role === 'user' &&
      !JSON.stringify(item.content).includes('Tidligere bruker-godkjente prosjektnotater.'));
    const messages = data.messages.slice(userIndex);
    const prompt = JSON.stringify(messages[0]);
    const profileProbe = /ProfileProbe(?:Normal|Chat|Plan|Light)/.exec(prompt)?.[0];
    if (profileProbe) {
      requestedTools.set(profileProbe, (data.tools || []).map(item => item.function?.name).filter(Boolean));
      const system = data.messages.filter(item => item.role === 'system');
      const conversation = data.messages.filter(item => item.role !== 'system');
      requestSizes.set(profileProbe, {
        systemBytes: Buffer.byteLength(JSON.stringify(system)),
        toolBytes: Buffer.byteLength(JSON.stringify(data.tools || [])),
        historyBytes: Buffer.byteLength(JSON.stringify(conversation))
      });
    }
    const held = [...heldReplies].find(([key]) => prompt.includes(key));
    if (held) await held[1];
    const editing = /TurnPenOne|TurnPenTwo/.test(prompt);
    const second = prompt.includes('TurnPenTwo');
    const task = 'Kontroller endringskortet';
    const todoDone = messages.some(item => item.tool_call_id === (second ? 'todo-two' : 'todo-one'));
    const writeDone = messages.some(item => item.tool_call_id === (second ? 'write-two' : 'write-one'));
    const deviceTest = prompt.includes('DeviceScreenCheck');
    const deviceResult = messages.find(item => item.tool_call_id === 'device-screen');
    const available = name => data.tools?.some(item => item.function?.name === name);
    const fixtureTools = [
      ['PatchMemory', 'omp_agent_memory', { action: 'write', markdown: 'Godkjent prosjektminne' }],
      ['PatchStatus', 'omp_project_status', { action: 'write', markdown: '# Prosjektstatus\n\nVerifisert fra Android.' }],
      ['PatchGit', 'omp_git_overview', {}]
    ];
    const requested = fixtureTools.find(([marker]) => prompt.includes(marker));
    let tool;
    if (requested && available(requested[1]) && !messages.some(item => item.tool_call_id === requested[0])) {
      tool = { id: requested[0], name: requested[1], args: requested[2] };
    } else if (deviceTest && !deviceResult && available('omp_device')) {
      tool = { id: 'device-screen', name: 'omp_device', args: { device: 'android', action: 'screen' } };
    } else if (editing && !todoDone && available('todo')) {
      tool = { id: second ? 'todo-two' : 'todo-one', name: 'todo', args: { op: 'init', list: [{ phase: 'Synk', items: [task] }] } };
    } else if (editing && !writeDone && available('write')) {
      await sleep(4000);
      tool = { id: second ? 'write-two' : 'write-one', name: 'write', args: { path: 'note.txt', content: second ? 'Android edit\n' : 'Windows edit\n' } };
    }
    response.writeHead(200, { 'Content-Type': 'text/event-stream' });
    const send = (delta, finish_reason = null) => response.write('data: ' + JSON.stringify({ id: 'turn-sync',
      object: 'chat.completion.chunk', model: 'stable-turn', created: 1,
      choices: [{ index: 0, delta, finish_reason }] }) + '\n\n');
    send({ role: 'assistant' });
    if (tool) send({ tool_calls: [{ index: 0, id: tool.id, type: 'function',
      function: { name: tool.name, arguments: JSON.stringify(tool.args) } }] });
    else send({ content: requested ? (messages.some(item => item.tool_call_id === requested[0]) ? 'Plugin tool returned' : 'Plugin missing')
      : data.messages.some(item => JSON.stringify(item.content).includes('data:image/png;base64,'))
      ? 'Fixture device image received' : prompt.includes('Start ' + marker) || process.env.OMP_TEST_DESKTOP_MIC_WAV ? voiceFixture : 'Fixture OK' });
    send({}, tool ? 'tool_calls' : 'stop');
    response.write('data: ' + JSON.stringify({ id: 'turn-sync', object: 'chat.completion.chunk', model: 'stable-turn',
      choices: [], usage: { prompt_tokens: 84, completion_tokens: 16, total_tokens: 100 } }) + '\n\n');
    response.end('data: [DONE]\n\n');
  });
  await new Promise(resolve => fixtureModel.listen(0, '127.0.0.1', resolve));
  const modelPort = fixtureModel.address().port;
  fs.writeFileSync(path.join(agent, 'mcp.json'), JSON.stringify({ mcpServers: {
    'workspace-mcp': { type: 'http', url: 'http://127.0.0.1:' + modelPort + '/mcp' }
  } }));
  fs.writeFileSync(path.join(agent, 'config.yml'), 'tools:\n  approvalMode: yolo\n');
  fs.writeFileSync(path.join(agent, 'models.yml'), 'providers:\n  turn-fixture:\n    baseUrl: http://127.0.0.1:' + modelPort +
    '/v1\n    api: openai-completions\n    apiKey: local\n    models:\n      - id: stable-turn\n        input: [text, image]\n');
  const probe = http.createServer();
  await new Promise(resolve => probe.listen(0, resolve));
  const port = probe.address().port;
  await new Promise(resolve => probe.close(resolve));
  const token = randomUUID();
  fs.writeFileSync(path.join(bridgeDir, 'config.json'), JSON.stringify({ port, host: '0.0.0.0', token,
    approvalMode: 'yolo', sessionDir, projectsFile: path.join(test, 'projects.json'), projectRoots: [test] }));
  const env = { ...process.env, OMP_BIN: omp, PI_CODING_AGENT_DIR: agent, OMP_PROFILE: '', PI_PROFILE: '',
    PI_CONFIG_DIR: path.relative(os.homedir(), path.dirname(agent)), PI_NATIVES_DIR: path.join(test, 'natives'),
    OMPCHAT_BRIDGE_PORT: String(port), OMPCHAT_BRIDGE_TOKEN: token };
  const log = fs.openSync(path.join(test, 'bridge.log'), 'w');
  fixtureBridge = spawn('node.exe', ['omp-bridge.mjs'], { cwd: bridgeDir, env, stdio: ['ignore', log, log], windowsHide: true });
  fs.closeSync(log);
  await until(async () => (await fetch('http://127.0.0.1:' + port + '/api/health', { headers: { Authorization: 'Bearer ' + token } })).ok,
    'isolert bridge');
  process.env.LOCALAPPDATA = host;
}

async function checkPluginPatch(ipc, js) {
  const { selected: id } = await ipc('newThread', { project });
  await ipc('model', { id, provider: 'turn-fixture', modelId: 'stable-turn' });
  const plugins = await ipc('plugins', { id, action: 'list' });
  assert(plugins.skills.some(item => item.name === 'workspace-fixture' && item.enabled));
  for (const target of ['agent-memory', 'project-status', 'git-overview']) {
    assert(plugins.builtIn.some(item => item.id === target && !item.enabled));
    await ipc('plugins', { id, action: 'enable', target });
  }
  await ipc('prompt', { id, message: 'PatchReady ' + marker });
  const history = () => ipc('bridgeHistory', id).then(result => result.messages);
  await until(async () => (await history()).some(item => item.text === 'Fixture OK'), 'første svar');
  await js(`(async () => { state = await run('state'); await connect(${JSON.stringify(id)}); })()`);
  assert(await js(`document.querySelector('#settings').offsetWidth === document.querySelector('#changes').offsetWidth
    && !!document.querySelector('#settings svg')
    && !!document.querySelector('.chat-turn > .message + .message-actions [aria-label="Kopier"] svg')
    && !!document.querySelector('.message-actions [aria-label="Les opp"] svg')`));
  await js("openSettings('plugins')");
  await until(() => js("[...document.querySelectorAll('#settingsBody input[role=switch]')].some(input => input.checked && input.parentElement.textContent.includes('Agent Memory'))"), 'pluginbryter i Desktop');
  const adbStatus = await ipc('adbStatus');
  assert(adbStatus.running && adbStatus.devices.some(item => item.serial === serial && item.reachable));
  const catalogue = await ipc('skillCatalog', { id, action: 'catalog' });
  assert(catalogue.entries.some(entry => entry.ref.endsWith('/terraform-style-guide')));
  const target = 'https://skills.sh/hashicorp/agent-skills/terraform-style-guide';
  const preview = await ipc('skillCatalog', { id, action: 'preview-skill', target });
  assert.match(preview.sha, /^[a-f0-9]{40}$/);
  assert.match(preview.markdown, /name:\s*terraform-style-guide/);
  await ipc('skillCatalog', { id, action: 'install-skill', target: preview.ticket });
  const hasSkill = async enabled => (await ipc('plugins', { id, action: 'list' })).skills
    .some(item => item.name === 'terraform-style-guide' && item.source === 'skills.sh' && item.enabled === enabled);
  assert(await hasSkill(false));
  await ipc('toggleResource', { id, kind: 'skill', name: 'terraform-style-guide', enabled: true });
  assert(await hasSkill(true));
  const resources = await ipc('resources', id);
  assert(resources.Skills.some(item => item.name === 'terraform-style-guide' && item.loaded), 'OMP lastet ikke installert skill.');
  const { link } = await ipc('threadHandoff', id);
  shell('am', 'start', '-W', '-a', 'android.intent.action.VIEW', '-d', link, '-n', activity);
  await visible(exact('Kopier'), 'ikonet Kopier på Android');
  await visible(exact('Les opp'), 'ikonet Les opp på Android');
  const fixtureConfig = JSON.parse(fs.readFileSync(path.join(process.env.LOCALAPPDATA, 'Nimay', 'OMPBridge', 'bridge', 'config.json'), 'utf8'));
  const getState = () => fetch('http://127.0.0.1:' + fixtureConfig.port + '/api/state?' + new URLSearchParams({ cwd: project }),
    { headers: { Authorization: 'Bearer ' + fixtureConfig.token } }).then(response => response.json());
  for (const [prompt, title] of [['PatchMemory', 'Agent Memory'], ['PatchStatus', 'Project Status MD']]) {
    await until(async () => !(await ipc('state')).busy.includes(id), 'OMP er klar for ' + title);
    await ipc('prompt', { id, message: prompt + ' ' + marker });
    const request = await until(async () => {
      const current = (await getState()).request;
      return current?.title === title && current;
    }, 'godkjenningsforespørsel for ' + title);
    await ipc('dialog', { id, requestId: request.id, result: { confirmed: true } });
    await until(async () => {
      const messages = await history();
      const index = messages.findIndex(item => item.text === prompt + ' ' + marker);
      return index >= 0 && messages.slice(index + 1).some(item => item.text === 'Plugin tool returned');
    }, 'fullført ' + title);
  }
  assert.match(fs.readFileSync(path.join(project, 'PROJECT_STATUS.md'), 'utf8'), /Verifisert fra Android/);
  const memoryFolder = path.join(process.env.LOCALAPPDATA, 'Nimay', 'OMPBridge', 'bridge', 'workspace-settings');
  const memory = fs.readdirSync(memoryFolder).find(name => name.endsWith('.memory.md'));
  assert.equal(fs.readFileSync(path.join(memoryFolder, memory), 'utf8').trim(), 'Godkjent prosjektminne');
  await until(async () => !(await ipc('state')).busy.includes(id), 'OMP er klar for Git-oversikt');
  await ipc('prompt', { id, message: 'PatchGit ' + marker });
  await until(async () => (await history()).filter(item => item.text === 'Plugin tool returned').length === 3, 'Git-oversikt');
  await until(async () => !(await ipc('state')).busy.includes(id), 'OMP er klar for å endre pluginstatus');
  await ipc('plugins', { id, action: 'disable', target: 'agent-memory' });
  assert(!(await ipc('plugins', { id, action: 'list' })).builtIn.find(item => item.id === 'agent-memory').enabled);
  await visible(exact('Plugin tool returned'), 'pluginsvar synkronisert til Android');
  shell('am', 'force-stop', pkg);
  shell('am', 'start', '-W', '-a', 'android.intent.action.VIEW', '-d', link, '-n', activity);
  await visible(exact('Kopier'), 'Android er tilbake i testsamtalen');
  await tap(exact('Samtaler'), 'Android-sidemeny');
  await tap(exact('Innstillinger'), 'Android-innstillinger');
  await tap(exact('Plugins'), 'Android-pluginpanel');
  const gitSwitch = item => exact('Git-oversikt')(item) && item.checkable === 'true';
  await visible(item => gitSwitch(item) && item.checked === 'true', 'Git-oversikt er på i Android');
  await tap(gitSwitch, 'slå av Git-oversikt i Android');
  await visible(partial('Lagret for prosjektet'), 'Android lagret pluginvalget');
  const desktopSwitch = "[...document.querySelectorAll('#settingsBody input[role=switch]')].find(input => input.parentElement.textContent.includes('Git-oversikt'))";
  await until(() => js(`${desktopSwitch}?.checked === false`), 'Desktop viser avslått plugin uten å åpne panelet på nytt');
  await js(`${desktopSwitch}.click()`);
  await visible(item => gitSwitch(item) && item.checked === 'true', 'Android viser Desktop-endringen');
  for (const target of ['project-status', 'git-overview']) {
    const test = await ipc('plugins', { id, action: 'test', target });
    assert(test.ok, JSON.stringify(test));
  }
  await ipc('plugins', { id, action: 'enable', target: 'agent-memory' });
  assert((await ipc('plugins', { id, action: 'test', target: 'agent-memory' })).ok);
  await visible(partial('Test OK'), 'Android viser testresultat fra Windows');
  await tap(exact('Lukk'), 'lukk Android-pluginpanelet');
  await until(() => js("document.querySelector('#tokenUsage summary').textContent.trim() !== '–'"), 'tokenmåler på Windows');
  await js("document.querySelector('#tokenUsage summary').click()");
  assert(await js("document.querySelector('.token-breakdown').textContent.includes('Siste modellkall')"));
  await visible(partial('Tokenforbruk'), 'tokenmåler på Android');
  await tap(partial('Tokenforbruk'), 'åpne Androids tokendetaljer');
  await visible(exact('Siste modellkall'), 'tokendetaljer på Android');
  if (process.env.OMP_TEST_SKILLS_PORTAL) {
    await checkSkillsPortal(ipc, js, id);
    await checkSkillScope(ipc, id);
  }
  console.log('Pluginstatus, OMP-skills, ikoner, ADB og de tre prosjektpluginene bestod.');
}

async function checkSkillsPortal(ipc, js, id) {
  const launch = desktopShell.openExternal;
  desktopShell.openExternal = async () => {};
  let url;
  try { url = await ipc('openSkills', { id }); }
  finally { desktopShell.openExternal = launch; }
  assert.match(url, /^http:\/\/127\.0\.0\.1:/);
  const browser = new BrowserWindow({ show: false });
  const web = code => browser.webContents.executeJavaScript(code);
  try {
    await browser.loadURL(url);
    await until(() => web("document.getElementById('catalog').textContent.includes('La OMP finne skills')"), 'lokal katalog');
    await web(`document.querySelector('#scope').value = 'global'; document.querySelector('#refs').value =
      'npx skills add https://github.com/vercel-labs/skills --skill find-skills\\nvercel-labs/skills/omp-test-no-such-skill'; document.querySelector('#preview').click()`);
    await until(() => web("document.querySelector('#previews pre')?.textContent.includes('Find Skills')"), 'forhåndsvisning med GitHub-kilde');
    await until(() => web("!document.querySelector('main').hasAttribute('aria-busy') && !!document.querySelector('#previews .error')"), 'feil i én forhåndsvisning');
    await web("document.querySelector('#install').click()");
    await until(() => web("document.querySelector('#status').textContent.includes('1 installert')"), 'global installasjon i nettleseren');
    await web("document.querySelector('[data-tab=installed]').click()");
    assert(await web("document.querySelector('#catalog').textContent.includes('Allerede installert')"));
    await until(() => web("!document.querySelector('main').hasAttribute('aria-busy') && document.querySelector('#installed input[aria-label$=globalt]')?.checked === false"), 'global skill er avslått');
    await web("document.querySelector('#installed input[aria-label$=globalt]').click()");
    await until(() => web("!document.querySelector('main').hasAttribute('aria-busy') && [...document.querySelectorAll('#installed button')].some(button => button.textContent === 'Prøv i OMP')"), 'OMP har lastet global skill');
    await web("[...document.querySelectorAll('#installed button')].find(button => button.textContent === 'Prøv i OMP').click()");
    await until(async () => {
      const status = await web("document.querySelector('#status').textContent");
      if (await web("document.querySelector('#status').classList.contains('error')")) throw new Error(status);
      return status.includes('skrivefeltet');
    }, 'nettleseren bekreftet utkastet');
    await until(() => js("document.querySelector('#message').value.includes('Finn tre skills')"), 'redigerbart utkast fra nettleseren');
    assert.equal(await web('location.hash'), '');
    const pendingPrompt = 'Hold pending skills ' + marker;
    let release;
    heldReplies.set(pendingPrompt, new Promise(resolve => { release = resolve; }));
    try {
      await ipc('prompt', { id, message: pendingPrompt });
      await web("document.querySelector('#installed input[aria-label$=globalt]').click()");
      await until(() => web("document.querySelector('#project').textContent.includes('Gjelder fra neste oppgave')"), 'endring venter mens OMP jobber');
    } finally {
      release();
      heldReplies.delete(pendingPrompt);
    }
    await until(() => web("!document.querySelector('#project').textContent.includes('Gjelder fra neste oppgave') && document.querySelector('#installed input[aria-label$=globalt]')?.checked === false"),
      'skillendringen gjelder etter fullført arbeid');
  } finally { browser.destroy(); }
}

async function checkSkillScope(ipc, first, js) {
  const target = 'workspace-fixture';
  const set = (id, scope, enabled) => ipc('setSkillScope', { id, target, scope, enabled });
  const test = id => ipc('plugins', { id, action: 'test-skill', target });
  await until(async () => !(await ipc('state')).busy.includes(first), 'første samtale er ledig');
  const { selected: second } = await ipc('newThread', { project });
  await ipc('model', { id: second, provider: 'turn-fixture', modelId: 'stable-turn' });
  await ipc('prompt', { id: second, message: 'Other scope ' + marker });
  await until(async () => !(await ipc('state')).busy.includes(second), 'andre samtale er ledig');
  await set(first, 'global', false);
  await set(first, 'session', true);
  assert((await test(first)).ok, 'Skill må lastes i den valgte samtalen.');
  assert(!(await test(second)).ok, 'Samtalevalget må holde seg i sin egen tråd.');
  await set(first, 'session', null);
  assert(!(await test(first)).ok, 'Første samtale skal arve globalt av.');
  await set(first, 'global', true);
  assert((await test(second)).ok, 'Andre samtale skal arve globalt på.');
  const { link } = await ipc('threadHandoff', first);
  shell('am', 'force-stop', pkg);
  shell('am', 'start', '-W', '-a', 'android.intent.action.VIEW', '-d', link, '-n', activity);
  await visible(exact('Kopier'), 'valgt samtale er åpen på Android');
  await tap(exact('Samtaler'), 'samtaleliste for skill-test');
  await tap(exact('Innstillinger'), 'Innstillinger for skill-test');
  await tap(exact('Plugins'), 'Plugins for skill-test');
  await tap(edit, 'søk etter skill i Android');
  typed(target);
  shell('input', 'keyevent', '4');
  const scopeSwitch = item => item.checkable === 'true' && label(item) === 'Kun denne samtalen · ' + target;
  const activeSwitch = item => item.checkable === 'true' && label(item) === 'Aktiver ' + target;
  const androidSwitch = (control, checked, description) =>
    visible(item => control(item) && item.checked === String(checked), description);
  await androidSwitch(activeSwitch, true, 'global aktivering vises på Android');
  await androidSwitch(scopeSwitch, false, 'Android viser at samtalen arver globalt valg');
  if (js) {
    await js(`(async () => { state = await run('state'); await connect(${JSON.stringify(first)}); openSettings('plugins'); })()`);
    const desktopSwitch = (prefix, checked) => js(`document.querySelector('input[aria-label="${prefix}workspace-fixture"]')?.checked === ${checked}`);
    await until(() => desktopSwitch('Aktiver ', true), 'global aktivering vises i Desktop');
    await tap(activeSwitch, 'slå av globalt fra Android');
    await until(() => desktopSwitch('Aktiver ', false), 'Desktop oppdaterer globalt Android-valg');
    assert(!(await test(second)).ok, 'Andre samtale arver globalt av fra Android.');
    await set(first, 'session', true);
    await androidSwitch(scopeSwitch, true, 'Android mottar samtaleoverstyring fra Windows');
    await androidSwitch(activeSwitch, true, 'Android viser at overstyringen aktiverer skillen');
    await set(first, 'session', null);
    await androidSwitch(scopeSwitch, false, 'Android mottar tilbakestilt overstyring');
    await set(first, 'global', true);
    await androidSwitch(activeSwitch, true, 'Android mottar global aktivering fra Windows');
    await until(() => desktopSwitch('Aktiver ', true), 'Desktop viser global aktivering igjen');
    await until(() => desktopSwitch('Kun denne samtalen · ', false), 'Desktop viser at samtalen arver globalt valg');
  }
  await tap(scopeSwitch, 'velg bare denne samtalen fra Android');
  await visible(item => scopeSwitch(item) && item.checked === 'true', 'samtalevalg i Android');
  await tap(activeSwitch, 'deaktiver i Android-samtalen');
  await until(async () => (await ipc('plugins', { id: first, action: 'list' })).skills
    .find(skill => skill.name === target).sessionEnabled === false, 'Desktop ser valg fra Android');
  if (js) await until(() => js(`document.querySelector('input[aria-label="Kun denne samtalen · ${target}"]')?.checked === true &&
    document.querySelector('input[aria-label="Aktiver ${target}"]')?.checked === false`), 'Desktop viser Android-overstyringen');
  assert((await test(second)).ok, 'Andre samtale holder globalt valg.');
  await tap(exact('Test skill'), 'test deaktivert skill via Android-knappen');
  await visible(partial('Test feilet'), 'Android viser resultatet fra OMP');
  await set(first, 'session', null);
  console.log('Native OMP skill: globalt valg, samtaleoverstyring, arv og positive/negative tester bestod.');
}

async function checkReleaseSync(ipc, js) {
  const { selected: id } = await ipc('newThread', { project });
  await ipc('model', { id, provider: 'turn-fixture', modelId: 'stable-turn' });
  await js(`(async () => { state = await run('state'); await connect(${JSON.stringify(id)}); })()`);
  const sendDesktop = message => js(`(async () => {
    document.getElementById('message').value = ${JSON.stringify(message)};
    await submit(new Event('submit'));
  })()`);
  const desktopText = text => js(`document.getElementById('timeline').textContent.includes(${JSON.stringify(text)})`);
  const first = 'Windows initial ' + marker;
  await sendDesktop(first);
  await until(() => desktopText('Fixture OK'), 'OMP-svar i Desktop');
  const { link } = await ipc('threadHandoff', id);
  shell('am', 'start', '-W', '-a', 'android.intent.action.VIEW', '-d', link, '-n', activity);
  await visible(exact(first), 'Windows-melding i Android');
  const reply = 'Android followup ' + marker;
  await sendMobile(reply);
  await until(() => desktopText(reply), 'Android-melding i åpen Windows-samtale');
  const again = 'Windows followup ' + marker;
  await until(async () => !(await ipc('state')).busy.includes(id), 'Android-oppgaven er ferdig');
  await until(() => js(`!view(${JSON.stringify(id)}).busy`), 'Windows har oppdatert arbeidsstatus');
  await sendDesktop(again);
  await visible(exact(again), 'ny Windows-melding i åpen Android-samtale');
  await until(async () => (await ipc('bridgeHistory', id)).messages.filter(item => item.role === 'assistant' && item.text === 'Fixture OK').length === 3,
    'tre OMP-svar i felles historikk');
  console.log('Meldinger synkroniserte automatisk begge veier i samme åpne samtale.');

  const windowsName = marker + 'Windows';
  const windowsFolder = path.join(test, windowsName);
  fs.mkdirSync(windowsFolder);
  await ipc('pinProject', windowsFolder);
  const desktopProjects = name => js(`[...document.querySelectorAll('.sidebar-project-name')].some(item => item.textContent === ${JSON.stringify(name)})`);
  await until(() => desktopProjects(windowsName), 'Windows-prosjektet vises i Desktop');
  await tap(exact('Velg prosjekt'), 'prosjektlisten fra Android');
  await until(async () => {
    if (dump().filter(drawn).some(partial(windowsName))) return true;
    await tap(exact('Lukk'), 'lukk prosjektlisten mens Android synkroniserer');
    await tap(exact('Velg prosjekt'), 'åpne den oppdaterte prosjektlisten');
    return false;
  }, 'Windows-prosjektet vises i Android');
  await tap(partial('Ny mappe'), 'ny mappe fra Android');
  await tap(exact('Gjeldende prosjekt'), 'velg gjeldende prosjekt');
  await tap(exact('Arbeidsmapper'), 'velg undermappe');
  await tap(exact('Ny mappe her'), 'bekreft plassering');
  await tap(partial('Mappenavn'), 'mappenavn');
  const androidName = marker + 'Android';
  typed(androidName);
  shell('input', 'keyevent', '4');
  await tap(exact('Opprett mappe'), 'opprett mappen på PC-en');
  await visible(exact('Opprettet ' + androidName + ' på PC-en'), 'Android bekrefter opprettelse');
  assert(fs.statSync(path.join(project, 'Arbeidsmapper', androidName)).isDirectory());
  await until(() => desktopProjects(androidName), 'Android-prosjektet vises automatisk i Desktop');
  console.log('Prosjektmapper synkroniserte begge veier og Android-mappen finnes på Windows.');

  await checkSkillScope(ipc, id, js);
}

async function checkChatProfiles(ipc, js) {
  const { selected: id } = await ipc('newThread', { project });
  await ipc('model', { id, provider: 'turn-fixture', modelId: 'stable-turn' });
  await js(`(async () => { state = await run('state'); await connect(${JSON.stringify(id)}); })()`);
  assert(await js(`(() => {
    const box = id => $(id).getBoundingClientRect();
    const field = box('message');
    const mode = box('chatModeMenu');
    return field.width > box('compose').width * .9 && field.bottom <= mode.top &&
      mode.left > box('model').right && mode.width <= 36 &&
      [...$('chatMode').options].map(option => option.text).join(',') === 'Chat,Plan,Bygg' &&
      $('stop').hidden && !$('send').hidden;
  })()`), 'Arbeidsmodus skal ligge kompakt under skrivefeltet.');
  for (const [name, mode, light, expected] of [
    ['Normal', 'build', false, null],
    ['Chat', 'chat', false, []],
    ['Plan', 'plan', false, ['grep', 'read']],
    ['Light', 'build', true, ['edit', 'grep', 'read', 'write']]
  ]) {
    const message = 'ProfileProbe' + name;
    await js(`(async () => {
      $('chatMode').value = ${JSON.stringify(mode)};
      $('lightContext').checked = ${light};
      $('chatMode').dispatchEvent(new Event('change'));
      $('message').value = ${JSON.stringify(message)};
      await submit(new Event('submit'));
    })()`);
    const tools = await until(() => requestedTools.get(message), message);
    if (expected) assert.deepEqual(tools.filter(tool => tool !== 'report_issue').sort(), expected);
    else assert(tools.length > 4);
    await until(async () => !(await ipc('state')).busy.includes(id), 'samtale ferdig ' + name);
    await until(() => js(`!view(${JSON.stringify(id)}).busy`), 'Desktop er klart ' + name);
    console.log(name + ' tools: ' + tools.join(', ') + ' ' + JSON.stringify(requestSizes.get(message)));
  }
  const { link } = await ipc('threadHandoff', id);
  shell('am', 'start', '-W', '-a', 'android.intent.action.VIEW', '-d', link, '-n', activity);
  await visible(exact('ProfileProbeLight'), 'delt samtale på Android');
  const message = 'Animation probe ' + marker;
  let finish;
  heldReplies.set(message, new Promise(resolve => { finish = resolve; }));
  try {
    await js(`(async () => {
      $('message').value = ${JSON.stringify(message)};
      await submit(new Event('submit'));
    })()`);
    await until(() => js("!$('stop').hidden && $('send').hidden"), 'Stopp erstatter Send under en aktiv oppgave');
    await visible(partial('OMP arbeider'), 'Android viser arbeidsindikator for Windows');
    for (let i = 0; i < 3; i++) {
      const png = execFileSync(adb, ['-s', serial, 'exec-out', 'screencap', '-p'], { windowsHide: true, maxBuffer: 10000000 });
      fs.writeFileSync(path.join(test, 'animation-' + i + '.png'), png);
      await sleep(725);
    }
    console.log('Arbeidsindikator: ' + test);
  } finally {
    finish();
    heldReplies.delete(message);
  }
  await until(() => !dump().filter(drawn).some(partial('OMP arbeider')), 'Android skjuler indikatoren etter svaret');
  await until(() => js("$('stop').hidden && !$('send').hidden"), 'Send kommer tilbake etter oppgaven');
  if (process.env.OMP_TEST_ANDROID_PROFILES) {
    for (const [name, labelText, expected] of [
      ['Chat', 'Chat', []], ['Plan', 'Plan', ['grep', 'read']], ['Light', 'Bygg', ['edit', 'grep', 'read', 'write']]
    ]) {
      await tap(item => item['content-desc'] === 'Arbeidsmodus' || (item.class === 'android.widget.Spinner' && /^(Chat|Plan|Bygg)$/.test(item.text)), 'Android arbeidsmodus');
      await tap(exact(labelText), 'velg ' + labelText + ' på Android');
      if (name === 'Chat' && (await visible(exact('Lett'), 'mobilbryter for lett kontekst')).checked === 'true') {
        await tap(exact('Lett'), 'slå av lett kontekst på Android');
      }
      if (name === 'Light') await tap(exact('Lett'), 'aktiver lett kontekst på Android');
      const message = 'ProfileProbe' + name;
      requestedTools.delete(message);
      await tap(edit, 'skriv Android-profiltest');
      typed(message);
      shell('input', 'keyevent', '4');
      await tap(item => label(item) === 'Send' && item.enabled === 'true', 'send Android-profiltest');
      try {
        const tools = await until(() => requestedTools.get(message), 'OMP mottok Android-profil ' + name, 20000);
        assert.deepEqual(tools.filter(tool => tool !== 'report_issue').sort(), expected);
        console.log('Android ' + name + ' tools: ' + tools.join(', '));
      } catch (error) {
        let status;
        try { status = dump().find(item => item['resource-id'] === 'status'); } catch {}
        throw new Error(error.message + (status && label(status) ? ' · ' + label(status) : ''));
      }
      await visible(exact('Send'), 'mobil klar etter ' + labelText);
    }
  }
  if (process.env.OMP_TEST_VOICE_DIR) {
    assert((await ipc('voice', { route: '/local' })).ready);
    for (const [language, text, check] of [
      ['no', 'Dette er en enkel test av norsk tale.', /test.*norsk|test.*tale/i],
      ['en', 'This is a simple test of English speech.', /English/i]
    ]) {
      const { audio } = await ipc('voice', { route: '/speak', body: { text, language, inline: true } });
      assert.equal(Buffer.from(audio, 'base64').subarray(0, 4).toString(), 'RIFF');
      const { text: transcript } = await ipc('voice', { route: '/transcribe', body: { audio, language } });
      assert.match(transcript, check);
      console.log(language + ' lokal talesyntese og transkripsjon: ' + transcript);
    }
    await ipc('voice', { route: '/stop', body: {} });
    shell('pm', 'grant', pkg, 'android.permission.RECORD_AUDIO');
    await tap(exact('Talemodus'), 'start talemodus fra Android');
    await visible(exact('Lukk talemodus'), 'talemodus har eget vindu');
    await tap(exact('Start eller stopp tale'), 'start mikrofonen i talevinduet');
    await visible(exact('Lytter …'), 'Android åpnet mikrofonen');
    fs.writeFileSync(path.join(test, 'voice-dialog.png'), execFileSync(adb, ['-s', serial, 'exec-out', 'screencap', '-p'],
      { windowsHide: true, maxBuffer: 10000000 }));
    console.log('Talevindu i emulatoren: ' + test);
    await tap(exact('Lukk talemodus'), 'avslutt talemodus fra Android');
    await until(() => !dump().filter(drawn).some(exact('Lytter …')), 'Android lukket talemodus');
  }
  await tap(exact('Samtaler'), 'åpne Android-menyen');
  await tap(exact('Innstillinger'), 'åpne Android-innstillinger');
  await visible(exact('Chat OMP OMP · Versjon ' + androidVersion), 'versjonsnummer i Android-innstillinger');
}

async function checkDesktopVoiceCapture(ipc, js) {
  const { selected: id } = await ipc('newThread', { project });
  await ipc('model', { id, provider: 'turn-fixture', modelId: 'stable-turn' });
  await js(`(async () => { state = await run('state'); await connect(${JSON.stringify(id)}); })()`);
  const sample = fs.readFileSync(process.env.OMP_TEST_DESKTOP_MIC_WAV).toString('base64');
  await js(`(async () => {
    const context = new AudioContext();
    const bytes = Uint8Array.from(atob(${JSON.stringify(sample)}), character => character.charCodeAt(0));
    const clip = await context.decodeAudioData(bytes.buffer);
    const input = context.createMediaStreamDestination();
    const feed = () => {
      const source = context.createBufferSource();
      source.buffer = clip;
      source.connect(input);
      source.start(context.currentTime + 0.25);
    };
    navigator.mediaDevices.getUserMedia = async () => {
      await context.resume();
      feed();
      return input.stream;
    };
    const play = HTMLMediaElement.prototype.play;
    const pause = HTMLMediaElement.prototype.pause;
    HTMLMediaElement.prototype.pause = function () {
      if (this.src.startsWith('data:audio/wav')) window.voiceCapturePaused = true;
      pause.call(this);
    };
    HTMLMediaElement.prototype.play = async function () {
      await play.call(this);
      if (this.src.startsWith('data:audio/wav') && !window.voiceCapturePlayed) {
        window.voiceCapturePlayed = true;
        feed();
      }
    };
  })()`);
  await js("document.getElementById('voiceOpen').click()");
  assert(await js("document.getElementById('voiceDialog').open"));
  await js("document.getElementById('voiceMode').click()");
  try {
    await until(() => js("document.getElementById('timeline').textContent.includes('Fixture OK')"),
      'nettlesermikrofon, WAV-opptak, Bridge-transkripsjon, OMP-svar', 75000);
    const { messages } = await ipc('bridgeHistory', id);
    assert(messages.some(item => item.role === 'user' && /test.*norsk/i.test(item.text)), 'Forventet norsk transkripsjon i chatten.');
    await until(() => js('window.voiceCapturePlayed === true'), 'WAV-svaret er spilt av');
    await until(() => js("window.voiceCapturePaused && document.getElementById('voiceDialog').open && document.getElementById('voiceMode').getAttribute('aria-pressed') === 'true'"), 'avbrytelse stanser lyd med talevinduet åpent');
    await until(async () => (await ipc('bridgeHistory', id)).messages.filter(item => item.role === 'user').length === 2, 'avbrytelsen ble neste melding');
    console.log('Desktop-tale: lyd ble transkribert og spilt av. Avbrytelsen stoppet lyden og ble neste melding med åpnet talevindu.');
  } finally {
    await js("document.getElementById('voiceDialog').close()");
    await ipc('voice', { route: '/stop', body: {} });
  }
}

async function checkActiveThreads(ipc, js) {
  await js("(async () => { state = await run('state'); renderProjects(); })()");
  const other = path.join(test, 'second-project');
  fs.mkdirSync(other);
  await ipc('pinProject', other);
  const threads = [];
  for (const [index, directory] of [project, other].entries()) {
    const { selected: id } = await ipc('newThread', { project: directory });
    await ipc('model', { id, provider: 'turn-fixture', modelId: 'stable-turn' });
    const title = marker + 'Samtale' + index;
    await ipc('prompt', { id, message: title });
    await until(async () => (await ipc('bridgeHistory', id)).messages.some(item => item.text === 'Fixture OK'), title);
    threads.push({ id, title });
  }
  const [first, second] = threads;
  const handoff = await ipc('threadHandoff', first.id);
  shell('am', 'start', '-W', '-a', 'android.intent.action.VIEW', '-d', handoff.link, '-n', activity);
  await visible(exact(first.title), 'delt samtale på Android');
  const releases = [];
  try {
    for (const item of threads) {
      const prompt = 'Hold ' + item.title;
      heldReplies.set(prompt, new Promise(resolve => releases.push(resolve)));
      if (item === second) await ipc('model', { id: item.id, provider: 'turn-fixture', modelId: 'stable-turn' });
      await ipc('prompt', { id: item.id, message: prompt });
    }
    await until(async () => {
      const { threads: synced } = await ipc('bridgeSync');
      return threads.every(item => synced.some(thread => thread.id === item.id && thread.activity === 'working'));
    }, 'begge samtaler er aktive på Bridge');
    await until(() => js(`${JSON.stringify([first.title, second.title])}.every(title =>
      [...document.querySelectorAll('#projectList > :first-child .thread-title')]
        .some(element => element.textContent.includes(title)))`),
    'begge aktive samtaler øverst i Desktop');
    await tap(exact('Samtaler'), 'åpne sidemenyen på Android');
    await visible(exact('Aktive samtaler'), 'aktivseksjonen på Android');
    await visible(partial(first.title), 'første aktive samtale på Android');
    await visible(partial(second.title), 'andre aktive samtale på Android');
    await ipc('abort', first.id);
    releases[0]();
    await until(async () => {
      const { threads: synced } = await ipc('bridgeSync');
      return !synced.find(item => item.id === first.id)?.activity && synced.find(item => item.id === second.id)?.activity === 'working';
    }, 'bare den gjenværende samtalen er aktiv');
    releases[1]();
    await until(() => js("!document.querySelector('.sidebar-running')"), 'aktivseksjonen forsvinner på Desktop');
    await until(() => !dump().some(exact('Aktive samtaler')), 'aktivseksjonen forsvinner på Android');
    console.log('Begge bygg viste to samtidige samtaler øverst og fjernet dem da de var ferdige.');
  } finally {
    for (const release of releases) release();
  }
}

async function checkTurnSync(ipc, js) {
  if (process.env.OMP_TEST_WORKSPACE) await ipc('pinProject', project);
  const state = await ipc('newThread', { project });
  const id = state.selected;
  await ipc('model', { id, provider: 'turn-fixture', modelId: 'stable-turn' });
  await ipc('prompt', { id, message: 'Start ' + marker });
  await until(async () => (await ipc('bridgeHistory', id)).messages.some(item => item.text === voiceFixture), 'første delte svar');
  const handoff = await ipc('threadHandoff', id);
  shell('am', 'start', '-W', '-a', 'android.intent.action.VIEW', '-d', handoff.link, '-n', activity);
  await visible(partial('This is a local reading test'), 'åpne delt tråd i emulatoren');
  await tap(exact('Kopier'), 'kopier modellsvaret i Android');
  await tap(edit, 'skrivefelt for lim inn');
  shell('input', 'keyevent', 'KEYCODE_PASTE');
  await visible(item => edit(item) && item.text === voiceFixture, 'Android-utklippstavlen inneholder modellsvaret');
  shell('input', 'keyevent', 'KEYCODE_MOVE_END', ...Array(voiceFixture.length).fill('KEYCODE_DEL'));
  shell('input', 'keyevent', '4');
  await tap(exact('Les opp'), 'les opp modellsvaret i Android');
  await tap(exact('Stopp opplesing'), 'Android-ttsmotoren kjører og kan stoppes');
  await visible(exact('Les opp'), 'opplesingsknappen gikk tilbake til Les opp');
  console.log('Android-utklippstavle og lokal opplesing med Stopp bestod.');
  await js(`(async () => { state = await window.desktop.run('state'); await connect(${JSON.stringify(id)}); })()`);
  if (process.env.OMP_TEST_WORKSPACE_ONLY) { await checkSharedWorkspace(ipc, js, id); return; }
  await ipc('prompt', { id, message: 'TurnPenOne ' + marker });
  await until(() => js("document.querySelector('#todoPanel')?.textContent.includes('Kontroller endringskortet')"), 'live todo på Windows');
  await visible(exact('Kontroller endringskortet'), 'live todo på Android');
  await visible(partial('0 av 1 ferdig'), 'Android viser fullført og gjenstående oppgaver');
  const readCards = () => ipc('turnData', id).then(data => data.cards);
  const card = await until(async () => (await readCards()).find(item => item.files.some(file => file.file === 'note.txt')), 'synkronisert endringskort');
  assert(card.undoable);
  assert.deepEqual(card.files.map(({ file, added, removed }) => [file, added, removed]), [['note.txt', 1, 1]]);
  await visible(exact('1 fil endret'), 'endringskort på mobilen');
  await tap(item => item.class === 'android.widget.Button' && label(item).startsWith('note.txt'), 'åpne diff fra endringskort');
  await visible(partial('+Windows edit'), 'riktig diff i Android');
  await tap(exact('Lukk'), 'lukk diff');
  await tap(exact('Angre'), 'angre fra Android');
  await tap(exact('Angre endringer'), 'bekreft angre');
  await until(() => fs.readFileSync(path.join(project, 'note.txt'), 'utf8') === 'ChatOmpFileTest\n', 'opprinnelig filinnhold');
  await until(async () => (await readCards()).find(item => item.id === card.id)?.undone, 'Angret synkronisert tilbake til Windows');
  await sendMobile('TurnPenTwo ' + marker);
  await until(async () => (await readCards()).length === 2, 'endringskort fra Android på Windows');
  assert.equal(fs.readFileSync(path.join(project, 'note.txt'), 'utf8'), 'Android edit\n');
  await until(() => js("document.querySelectorAll('.turn-card').length === 2"), 'begge endringskort i Windows-samtalen');
  console.log('Live todo, endringskort per svar, diff og Angre synkroniserte begge veier.');
  const check = await ipc('projectRunTest', { id, command: "Write-Output 'Sjekk på Windows'; exit 0", userIndex: 3 });
  await until(async () => (await ipc('turnData', id)).checks?.some(item => item.id === check.id && item.exitCode === 0), 'delt testresultat');
  const review = await ipc('threadHandoff', { id, check: check.id });
  assert(review.link.endsWith('?check=' + check.id));
  shell('am', 'start', '-W', '-a', 'android.intent.action.VIEW', '-d', review.link, '-n', activity);
  await visible(partial('Tester bestod'), 'PC-testresultat åpnet på Android');
  console.log('Gjennomgå på Android åpnet testresultatet i den delte samtalen.');
  if (process.env.OMP_TEST_WORKSPACE) await checkSharedWorkspace(ipc, js, id);
  await checkChatManagement(ipc, js, id);
}

async function checkSharedWorkspace(ipc, js, id) {
  const initial = await ipc('resources', id);
  assert(initial.Skills.some(item => item.name === 'workspace-fixture' && item.enabled), 'Prosjektskill mangler.');
  assert(initial.Verktøy.some(item => item.name === 'read' && item.enabled), 'Aktivt leseverktøy mangler.');
  assert(initial['MCP-servere'].some(item => item.name === 'workspace-mcp' && item.enabled), 'MCP-server mangler eller er inaktiv.');
  await ipc('toggleResource', { id, kind: 'mcp', name: 'workspace-mcp', enabled: false });
  assert((await ipc('resources', id))['MCP-servere'].some(item => item.name === 'workspace-mcp' && !item.enabled));
  await ipc('toggleResource', { id, kind: 'mcp', name: 'workspace-mcp', enabled: true });
  await ipc('toggleResource', { id, kind: 'tool', name: 'read', enabled: false });
  const current = await ipc('resources', id);
  assert(current.Verktøy.some(item => item.name === 'read' && !item.enabled));
  await tap(exact('Samtaler'), 'åpne ressurser fra Android');
  await tap(exact('Innstillinger'), 'innstillinger i Android');
  await tap(exact('OMP-ressurser'), 'delte OMP-ressurser på Android');
  await tap(edit, 'søk i OMP-ressurser');
  typed('workspace-fixture');
  await tap(exact('workspace-fixture'), 'slå av skill fra Android');
  await visible(partial('Lagret for prosjektet'), 'skillendring lagret');
  const changed = await ipc('resources', id);
  assert(changed.Skills.some(item => item.name === 'workspace-fixture' && !item.enabled));
  await ipc('toggleResource', { id, kind: 'skill', name: 'workspace-fixture', enabled: true });
  await ipc('toggleResource', { id, kind: 'tool', name: 'read', enabled: true });
  await tap(exact('Tilbake til innstillinger'), 'tilbake til innstillingene');
  await tap(exact('Plugins'), 'plugininnstillinger på Android');
  await tap(exact('Enhetsstyring'), 'aktiver enhetsstyring på Android');
  await visible(partial('Lagret for prosjektet'), 'pluginendring lagret');
  const plugins = await ipc('plugins', { id, action: 'list' });
  assert(plugins.builtIn.some(item => item.id === 'device-control' && item.enabled));
  const resources = await ipc('resources', id);
  assert(resources.Verktøy.some(item => item.name === 'omp_device' && item.enabled), JSON.stringify(resources.Verktøy.map(item => item.name)));
  assert(resources.Skills.some(item => item.name === 'device-control' && item.enabled), 'Medfølgende skill er ikke lastet inn.');
  await tap(exact('Lukk'), 'lukk plugininnstillinger');
  await ipc('prompt', { id, message: 'DeviceScreenCheck ' + marker });
  await visible(exact('Enhetsstyring · godkjenning'), 'enhetsstyring krevde samtykke i Android');
  await tap(exact('Ja'), 'godkjenn skjermbilde av testemulatoren');
  await visible(exact('Fixture device image received'), 'OMP mottok skjermbildet fra Android', 90000);
  await ipc('plugins', { id, action: 'disable', target: 'device-control' });
  assert(!(await ipc('resources', id)).Verktøy.some(item => item.name === 'omp_device'));
  await js("document.getElementById('syncChats').click()");
  console.log('Ressurser og ettklikks pluginvalg delte samme status på Windows og Android.');
}

async function checkChatManagement(ipc, js, id) {
  const original = (await ipc('bridgeSync')).threads.find(item => item.id === id).title;
  const first = marker + 'Mobilnavn';
  const second = marker + 'PCnavn';
  const desktopThread = async () => (await ipc('bridgeSync')).threads.find(item => item.id === id);
  const desktopList = title => js('Array.from(document.querySelectorAll(".thread-title")).some(el => el.textContent === ' +
    JSON.stringify(title) + ')');
  const menu = title => tap(exact('Flere valg for ' + title), 'åpne samtalemeny med prikk-knappen');
  const restore = title => tap(exact('Gjenopprett ' + title), 'hent tilbake samtalen');

  await tap(exact('Samtaler'), 'åpne samtalelisten');
  await tap(exact(original), 'langtrykk på samtalen', true);
  await visible(exact('Samtalehandlinger'), 'handlingsmeny fra langtrykk');
  await tap(exact('Gi nytt navn'), 'åpne navnebytte');
  await visible(edit, 'navnefelt');
  typed(first);
  await tap(exact('Lagre'), 'lagre navnet fra Android');
  await until(async () => (await desktopThread()).title === first, 'Android-navn i Desktop-synk');
  await until(() => desktopList(first), 'Android-navn i Desktop-sidemenyen');
  await js(`(async () => {
    const row = [...document.querySelectorAll('.sidebar-thread-row')].find(el =>
      el.querySelector('.thread-title')?.textContent === ${JSON.stringify(first)});
    row.querySelector('summary').click();
    [...row.querySelectorAll('button')].find(el => el.textContent === 'Gi nytt navn').click();
    await Promise.resolve();
    const form = document.querySelector('#workspaceDialog form');
    form.querySelector('input').value = ${JSON.stringify(second)};
    form.requestSubmit();
  })()`);
  await until(async () => (await desktopThread()).title === second, 'navn lagret fra Desktop-dialogen');
  await tap(exact('Samtaler'), 'tilbake til listen for PC-endringen');
  await menu(second);
  await tap(exact('Arkiver'), 'åpne arkivering');
  await tap(exact('Arkiver samtale'), 'bekreft arkivering');
  await until(async () => (await desktopThread()).hiddenFromSidebar, 'arkivering i Desktop-synk');
  await until(async () => !await desktopList(second), 'arkivert samtale fjernet fra Desktop-sidemenyen');
  await tap(exact('Samtaler'), 'åpne arkiv fra sidemenyen');
  await tap(exact('Arkiv og papirkurv'), 'arkivikon');
  await restore(second);
  await until(() => desktopList(second), 'gjenopprettet arkivert samtale i Desktop-sidemenyen');
  await tap(exact('Lukk'), 'lukk arkivet');
  await tap(exact('Samtaler'), 'vis gjenopprettet tråd på Android');
  await menu(second);
  await tap(exact('Flytt til papirkurven'), 'åpne sletting');
  await tap(exact('Flytt til papirkurven'), 'bekreft flytting til papirkurven');
  await until(async () => (await desktopThread()).hiddenFromSidebar, 'papirkurv i Desktop-synk');
  await until(async () => !await desktopList(second), 'slettet samtale fjernet fra Desktop-sidemenyen');
  await tap(exact('Samtaler'), 'åpne papirkurven fra sidemenyen');
  await tap(exact('Arkiv og papirkurv'), 'arkivikon');
  await tap(exact('Papirkurv'), 'bytt til papirkurven');
  await restore(second);
  await until(() => desktopList(second), 'gjenopprettet slettet samtale i Desktop-sidemenyen');
  assert((await ipc('bridgeHistory', id)).messages.some(item => item.text === 'Fixture OK'));
  console.log('Langtrykk, samtalemeny, navnebytte begge veier, arkivering, papirkurv og gjenoppretting bestod.');
}

async function runTest() {
  if (isolatedBridge) await setupTurnFixture();
  require(path.join(release, 'OMP Desktop', 'resources', 'app', 'main.cjs'));
  await app.whenReady();
  const win = await until(() => BrowserWindow.getAllWindows()[0], 'Windows-vindu');
  const js = code => win.webContents.executeJavaScript(code);
  const ipc = (name, data) => js('window.desktop.run(' + JSON.stringify(name) + ',' + JSON.stringify(data) + ')');
  await until(() => js("typeof window.desktop !== 'undefined'"), 'desktop API');
  const linked = await ipc('pairBridge');
  assert(linked.status);
  const apk = path.join(release, 'Chat-OMP-OMP-Android-' + androidVersion + '.apk');
  assert.match(command('install', '-r', apk), /Success/);
  shell('am', 'start', '-W', '-n', activity);
  await visible(exact('Chat OMP OMP'), 'Android-startskjerm');
  if (!process.env.OMP_TEST_ACTIVE_THREADS) {
    shell('pm', 'grant', pkg, 'android.permission.CAMERA');
    if (dump().some(exact('Skann QR-kode'))) await tap(exact('Skann QR-kode'), 'kameraknapp');
    else {
      await tap(exact('Samtaler'), 'åpne meny for ny paring');
      await tap(exact('Innstillinger'), 'paring i innstillinger');
      await tap(item => /Skann (ny )?QR-kode/.test(label(item)), 'kameraknapp');
    }
    await visible(exact('Lukk skanner'), 'QR-kamera');
    await tap(exact('Lukk skanner'), 'lukk kamera');
  }
  let pass;
  for (let attempt = 0; attempt < 3; attempt++) {
    const qr = await ipc('mobilePairing', '10.0.2.2');
    assert(qr.image.startsWith('data:image/png;base64,'));
    pass = JSON.parse(Buffer.from(qr.link.split('/').at(-1), 'base64url'));
    try {
      shell('am', 'start', '-W', '-a', 'android.intent.action.VIEW', '-d', qr.link, '-n', activity);
      await tap(exact('Koble til'), 'bekreft engangskode');
      await visible(exact('Tilkoblet PC'), 'Android koblet til ekte bridge', 16000);
      break;
    } catch (error) {
      if (attempt === 2) throw error;
      shell('am', 'force-stop', pkg);
      shell('am', 'start', '-W', '-n', activity);
    }
  }
  const replay = await fetch('http://127.0.0.1:' + pass.port + '/' + pass.nonce).catch(() => null);
  assert(!replay?.ok, 'Engangskoden kunne brukes om igjen.');
  console.log('Android APK installert. Engangskode brukt og gjenbruk avvist. Bridge ' + linked.status + '.');
  if (process.env.OMP_TEST_MULTI_PC) {
    const fixtureName = marker + 'OnlySecondPC';
    if (isolatedBridge) {
      const directory = path.join(test, fixtureName);
      fs.mkdirSync(directory);
      await ipc('pinProject', directory);
      shell('am', 'force-stop', pkg);
      shell('am', 'start', '-W', '-n', activity);
      await tap(exact('Velg prosjekt'), 'prosjekter på test-PC etter omstart');
      await visible(partial(fixtureName), 'testprosjekt finnes fortsatt på test-PC');
      await tap(exact('Lukk'), 'lukk prosjektlisten');
    }
    await tap(exact('Samtaler'), 'mobilmenyen for PC-valg');
    await tap(exact('PC-er'), 'liste over PC-er');
    if (!isolatedBridge) {
      if (dump().filter(drawn).some(exact('HovedPC'))) return;
      await tap(exact('Endre navn'), 'navn på den vanlige PC-en');
      await tap(edit, 'navnefelt');
      shell('input', 'keyevent', 'KEYCODE_MOVE_END', ...Array(40).fill('KEYCODE_DEL'));
      typed('HovedPC');
      shell('input', 'keyevent', '4');
      await tap(exact('Lagre'), 'lagre HovedPC');
      await visible(exact('HovedPC'), 'HovedPC er lagret');
    } else {
      await visible(exact('HovedPC'), 'første PC beholdes etter en ny paring');
      await tap(exact('Bytt til HovedPC'), 'bytt tilbake til hoved-PC');
      await tap(exact('Velg prosjekt'), 'prosjekter på hoved-PC');
      assert(!dump().filter(drawn).some(partial(fixtureName)), 'Test-PC-ens prosjekt ble vist på hoved-PC.');
      await tap(exact('Lukk'), 'lukk hoved-PC-ens prosjektliste');
      await visible(partial('HovedPC ·'), 'aktivt PC-navn i chatoverskriften', 8000).catch(() => {});
      await tap(exact('Samtaler'), 'åpne menyen fra hoved-PC');
      await tap(exact('PC-er'), 'åpne PC-listen etter bytte');
      await visible(exact('Bytt til 10.0.2.2'), 'test-PC er fortsatt lagret');
      console.log('Begge PC-er beholdt etter omstart. Testprosjektet vises kun på test-PC.');
    }
    return;
  }
  if (process.env.OMP_TEST_PAIR_ONLY) return;
  if (isolatedBridge && process.env.OMP_TEST_DESKTOP_MIC_WAV) { await checkDesktopVoiceCapture(ipc, js); return; }
  if (isolatedBridge && process.env.OMP_TEST_CHAT_PROFILES) { await checkChatProfiles(ipc, js); return; }
  if (isolatedBridge && process.env.OMP_TEST_RELEASE_SYNC) { await checkReleaseSync(ipc, js); return; }
  if (isolatedBridge && process.env.OMP_TEST_SKILL_SCOPE_ONLY) {
    const { selected: id } = await ipc('newThread', { project });
    await ipc('model', { id, provider: 'turn-fixture', modelId: 'stable-turn' });
    await ipc('prompt', { id, message: 'Scope fixture ' + marker });
    await checkSkillScope(ipc, id);
    return;
  }
  if (isolatedBridge && process.env.OMP_TEST_PLUGIN_SUITE) { await checkPluginPatch(ipc, js); return; }
  if (isolatedBridge && process.env.OMP_TEST_ACTIVE_THREADS) { await checkActiveThreads(ipc, js); return; }
  if (isolatedBridge) { await checkTurnSync(ipc, js); return; }
  if (process.env.OMP_TEST_ORNITH) { await checkOrnith(ipc, js); return; }

  const state = await ipc('newThread', { project });
  const id = state.selected;
  const models = (await ipc('models', id)).models;
  const model = models.find(item => item.provider === 'ollama' && item.id === 'qwen2.5:1.5b');
  assert(model, 'Mangler den lokale Ollama-testmodellen.');
  await ipc('model', { id, provider: model.provider, modelId: model.id });
  const first = marker + '. Svar bare OK uten verktøy.';
  await ipc('prompt', { id, message: first });
  const history = async () => (await ipc('bridgeHistory', id)).messages;
  await until(async () => (await history()).some(item => item.role === 'assistant' && /\bOK\b/i.test(item.text)), 'første Windows-svar', 120000);
  const handoff = await ipc('threadHandoff', id);
  assert(handoff.link.startsWith('chatomp://thread/') && handoff.image.startsWith('data:image/png;base64,'));
  shell('am', 'start', '-W', '-a', 'android.intent.action.VIEW', '-d', handoff.link, '-n', activity);
  await visible(exact(first), 'åpne delt tråd fra Windows-lenke');
  await tap(exact('Samtaler'), 'Android samtaleliste');
  await tap(edit, 'Android chatsøk');
  typed(marker);
  await tap(item => label(item).startsWith(marker) && item.class !== 'android.widget.EditText', 'åpne delt tråd fra PC');
  await visible(exact('OK'), 'svaret fra Windows i Android');
  await chooseLocalModel();

  const mobile = marker + 'Mobil Svar bare JA';
  await sendMobile(mobile);
  await until(async () => {
    const list = await history();
    const index = list.findIndex(item => item.role === 'user' && item.text === mobile);
    return index >= 0 && list.slice(index + 1).some(item => item.role === 'assistant' && item.text);
  }, 'Android-oppfølging i samme fil', 120000);
  await visible(exact(mobile), 'Android viser den sendte meldingen');
  console.log('Windows → Android → samme OMP-økt bestod.');

  const again = marker + 'Windows. Svar bare OK uten verktøy.';
  await ipc('prompt', { id, message: again });
  await visible(exact(again), 'Windows-oppfølging i åpnet Android-tråd', 90000);
  const draft = marker + 'Utkast';
  await tap(edit, 'utkast i skrivefeltet');
  typed(draft);
  await visible(item => edit(item) && item.text === draft, 'utkast skrevet på mobilen');
  shell('am', 'force-stop', pkg);
  shell('am', 'start', '-W', '-n', activity);
  await visible(item => edit(item) && item.text === draft, 'utkast etter omstart');
  await tap(exact('Samtaler'), 'åpne meny');
  await tap(exact('Filer'), 'filer');
  await tap(exact('note.txt'), 'fil i prosjekt');
  await visible(partial('ChatOmpFileTest'), 'vis filinnhold');
  await tap(exact('Lukk'), 'lukk fil');
  await tap(exact('Samtaler'), 'åpne meny for Git');
  await tap(exact('Git'), 'Git-status');
  await tap(partial('note.txt'), 'Git-endret fil');
  await visible(partial('+ChatOmpFileTest'), 'Git-diff');
  await tap(exact('Stage fil'), 'stage fil på Android');
  await until(() => git('diff', '--cached').includes('+ChatOmpFileTest'), 'Git-staging på PC');
  await visible(partial('Git · project'), 'tilbake i Git-oversikten');
  await tap(partial('note.txt'), 'staget fil');
  await visible(partial('+ChatOmpFileTest'), 'ferdig lastet staget diff');
  await sleep(600);
  await tap(exact('Fjern fra staging'), 'unstage fil');
  await sleep(1600);
  if (git('diff', '--cached').includes('+ChatOmpFileTest') && dump().some(exact('Fjern fra staging'))) {
    await tap(exact('Fjern fra staging'), 'gjenta trykk hvis WebView beholdt fokus');
  }
  await until(() => !git('diff', '--cached').includes('+ChatOmpFileTest'), 'Git-unstaging på PC');
  await tap(exact('Lukk'), 'lukk Git');
  await tap(exact('Samtaler'), 'åpne meny for terminal');
  await tap(exact('Terminal'), 'terminal');
  await tap(edit, 'terminalkommando');
  typed('echo ChatOmpTerminalCheck');
  await tap(exact('Kjør'), 'kjør terminalkommando fra Android');
  await visible(item => label(item).includes('ChatOmpTerminalCheck') && item.class !== 'android.widget.EditText', 'terminalresultat');
  await tap(exact('Lukk'), 'lukk terminal');
  await tap(exact('Samtaler'), 'åpne meny for modeller');
  await tap(exact('Innstillinger'), 'Android-innstillinger');
  await tap(partial('Utseende'), 'utseendeinnstillinger');
  const themeControl = item => item['resource-id'] === 'mobileTheme' || label(item) === 'Tema';
  await tap(themeControl, 'temavalg');
  await visible(exact('Grafitt · mørk'), 'Grafitt');
  await visible(exact('Dyp skog · mørk'), 'Dyp skog');
  await visible(exact('Ametyst · mørk'), 'Ametyst');
  await tap(exact('Midnatt · mørk'), 'bytt til mørkt tema');
  await visible(partial('Midnatt · mørk'), 'valgt mørkt tema');
  fs.writeFileSync(path.join(test, 'android-dark.png'),
    execFileSync(adb, ['-s', serial, 'exec-out', 'screencap', '-p'], { windowsHide: true, maxBuffer: 10000000 }));
  await tap(themeControl, 'egendefinert temavalg');
  await tap(exact('Egendefinert'), 'egendefinerte farger');
  await moveSlider('Aksentfarge', .8);
  await moveSlider('Fargestyrke', .75);
  await moveSlider('Bakgrunnsfarge', .7);
  await moveSlider('Tekststørrelse', .52);
  await visible(row => /^11\d\s*%$/.test(label(row)), 'forstørret tekst');
  fs.writeFileSync(path.join(test, 'android-custom.png'),
    execFileSync(adb, ['-s', serial, 'exec-out', 'screencap', '-p'], { windowsHide: true, maxBuffer: 10000000 }));
  await tap(themeControl, 'tilbake til et standardtema');
  await tap(exact('Midnatt · mørk'), 'velg Midnatt igjen');
  await tap(exact('Tilbake til innstillinger'), 'tilbake til innstillinger');
  await tap(exact('Leverandører fra PC-en'), 'delte leverandører');
  await visible(exact('Leverandører administreres i OMP Desktop.'), 'leverandørlisten fra bridge');
  shell('am', 'force-stop', pkg);
  shell('am', 'start', '-W', '-n', activity);
  await visible(exact(again), 'historikk og tilkobling etter omstart', 90000);
  await tap(exact('Samtaler'), 'meny etter omstart');
  await tap(exact('Innstillinger'), 'utseende etter omstart');
  await tap(partial('Utseende'), 'åpne utseende etter omstart');
  await visible(partial('Midnatt · mørk'), 'lagret tema etter omstart');
  await visible(row => /^11\d\s*%$/.test(label(row)), 'lagret tekststørrelse etter omstart');
  await tap(exact('Lukk'), 'lukk innstillinger');
  fs.writeFileSync(path.join(test, 'android-chat.png'),
    execFileSync(adb, ['-s', serial, 'exec-out', 'screencap', '-p'], { windowsHide: true, maxBuffer: 10000000 }));
  console.log('Samtalefortsettelse, filer, Git-diff, staging, terminal, tema og delte leverandører bestod.');
  await tap(exact('Ny samtale'), 'ny samtale fra Android');
  await chooseLocalModel();
  const second = marker + 'Ny Svar bare OK';
  await sendMobile(second);
  const imported = await until(async () => (await ipc('bridgeSync')).threads.find(item => item.title.startsWith(marker + 'Ny')), 'ny Android-tråd i Windows');
  await until(async () => (await ipc('bridgeHistory', imported.id)).messages.some(item => item.role === 'assistant' && item.text),
    'svaret i den Android-opprettede tråden', 90000);
  console.log('En ny Android-tråd dukket opp i OMP Desktop.');
  await tap(exact('Samtaler'), 'den nye mobilmenyen');
  await visible(exact('Prosjekter'), 'prosjektikonet i mobilmenyen');
  await visible(exact('Terminal'), 'terminal i den faste verktøylinjen');
  fs.writeFileSync(path.join(test, 'android-drawer.png'),
    execFileSync(adb, ['-s', serial, 'exec-out', 'screencap', '-p'], { windowsHide: true, maxBuffer: 10000000 }));
  await tap(exact('Prosjekter'), 'prosjektvelger fra mobilmenyen');
  await tap(partial('Ny mappe'), 'ny prosjektmappe fra Android');
  await tap(exact('Gjeldende prosjekt'), 'velg gjeldende prosjekt grafisk');
  await tap(exact('Arbeidsmapper'), 'åpne undermappe grafisk');
  await tap(exact('Opp'), 'gå opp ett nivå i mappevelgeren');
  await tap(exact('Arbeidsmapper'), 'gå tilbake til ønsket undermappe');
  await tap(exact('Ny mappe her'), 'velg plassering i mappevelgeren');
  await tap(partial('Mappenavn'), 'mappenavn');
  const folderName = marker + 'Prosjekt';
  typed(folderName);
  shell('input', 'keyevent', '4');
  await tap(exact('Opprett mappe'), 'opprett mappen på PC-en');
  const created = path.join(project, 'Arbeidsmapper', folderName);
  await until(() => fs.existsSync(created), 'prosjektmappe på Windows');
  await visible(exact('Opprettet ' + folderName + ' på PC-en'), 'åpnet opprettet prosjekt på Android');
  const synced = await ipc('bridgeSync');
  assert(synced.pinnedProjects.some(directory => directory.toLowerCase() === created.toLowerCase()),
    'Mobilprosjektet mangler i Windows-prosjektlisten.');
  await tap(exact('Velg prosjekt'), 'vis prosjektvelger etter opprettelse');
  await visible(partial(folderName), 'registrert prosjekt i mobilappen');
  console.log('Android opprettet en mappe på PC-en og åpnet den som prosjekt.');
  console.log('Testdata: ' + test);
}

runTest().then(() => { fixtureBridge?.kill(); fixtureModel?.close(); app.quit(); }, error => {
  console.error(error.message);
  console.error('Testdata: ' + test);
  try {
    const png = execFileSync(adb, ['-s', serial, 'exec-out', 'screencap', '-p'], { windowsHide: true, maxBuffer: 10000000 });
    fs.writeFileSync(path.join(test, 'android-error.png'), png);
  } catch {}
  fixtureBridge?.kill();
  fixtureModel?.close();
  app.exit(1);
});
