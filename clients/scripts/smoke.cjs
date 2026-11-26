const { app, BrowserWindow, webContents, clipboard } = require('electron');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const http = require('node:http');
const { execFileSync } = require('node:child_process');
const { setTimeout: pause } = require('node:timers/promises');
const { randomUUID } = require('node:crypto');
const os = require('node:os');
const { version } = require('../package.json');

const root = path.join(__dirname, '..');
const test = fs.mkdtempSync(path.join(root, '.desktop-test-'));
const bridgeHome = path.join(test, 'bridge-home');
const agent = path.join(bridgeHome, '.omp', 'agent');
const project = path.join(test, 'project');
const imported = path.join(test, 'imported');
const profile = path.join(test, 'profile');
const settings = path.join(profile, 'settings.json');
const id = randomUUID();
app.disableHardwareAcceleration();

function bootstrap() {
  const skills = path.join(project, '.omp', 'skills', 'smoke');
  for (const directory of [skills, agent, profile, imported]) fs.mkdirSync(directory, { recursive: true });
  fs.writeFileSync(path.join(skills, 'SKILL.md'), '---\nname: smoke\ndescription: Verify local skills.\n---\nSmoke test.\n');
  fs.writeFileSync(path.join(agent, 'config.yml'), 'tools:\n  approvalMode: yolo\n');
  const git = (...args) => execFileSync('git.exe', args, { cwd: project, stdio: 'ignore' });
  git('init', '-b', 'main');
  fs.writeFileSync(path.join(project, 'note.txt'), 'Before\n');
  fs.mkdirSync(path.join(project, 'docs'));
  fs.writeFileSync(path.join(project, 'docs', 'index.html'), '<!doctype html><button id="download">Last ned testfil</button>');
  git('add', 'note.txt', 'docs/index.html');
  git('-c', 'user.name=OMP Smoke', '-c', 'user.email=smoke@example.invalid', 'commit', '-m', 'Initial');
  const threads = [
    { id, cwd: project, project, title: 'Ny tråd' },
    { id: randomUUID(), cwd: imported, project: imported, title: 'Android test conversation', shared: true }
  ];
  fs.writeFileSync(settings, JSON.stringify({ projects: [project, imported], threads, selected: id }));
}

let modelRequests = 0;
let checkedKey = false;
const server = http.createServer(async (req, res) => {
  if (req.url === '/preview') {
    res.writeHead(200, { 'Content-Type': 'text/html' });
    res.end('<title>OMP preview smoke</title><h1>Local browser check</h1>');
    return;
  }
  if (req.url === '/v1/models') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ object: 'list', data: [{ id: 'smoke-model', object: 'model' }] }));
    return;
  }
  const chunks = [];
  for await (const chunk of req) chunks.push(chunk);
  const body = JSON.parse(Buffer.concat(chunks).toString() || '{}');
  if (req.url === '/mcp') {
    if (!body.id) { res.writeHead(req.method === 'POST' ? 202 : 405).end(); return; }
    const results = {
      initialize: { protocolVersion: body.params?.protocolVersion, capabilities: { tools: {} }, serverInfo: { name: 'fixture', version: '1.0.0' } },
      'tools/list': { tools: [{ name: 'fixture_status', description: 'Return fixture status', inputSchema: { type: 'object' } }] },
      'tools/call': { content: [{ type: 'text', text: 'fixture online' }] }
    };
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ jsonrpc: '2.0', id: body.id, result: results[body.method] || {} }));
    return;
  }
  if (req.url !== '/v1/chat/completions') { res.writeHead(404).end(); return; }
  modelRequests++;
  checkedKey ||= req.headers.authorization === 'Bearer fixture-key';
  const askedForWrite = JSON.stringify(body.messages).includes('Change note.txt');
  const todoDone = body.messages.some(item => item.role === 'tool' && item.tool_call_id === 'call_todo');
  const toolDone = body.messages.some(item => item.role === 'tool' && item.tool_call_id === 'call_smoke');
  const toolAvailable = body.tools?.some(item => item.function?.name === 'write');
  const useTool = askedForWrite && !toolDone && toolAvailable;
  const useTodo = useTool && !todoDone && body.tools?.some(item => item.function?.name === 'todo');
  const task = { index: 0, id: 'call_todo', type: 'function', function: {
    name: 'todo', arguments: JSON.stringify({ op: 'init', list: [{ phase: 'Smoke', items: ['Kontroller filendringen'] }] })
  } };
  const change = { index: 0, id: 'call_smoke', type: 'function', function: {
    name: 'write', arguments: JSON.stringify({ path: 'note.txt', content: 'After\n' })
  } };
  res.writeHead(200, { 'Content-Type': 'text/event-stream' });
  const send = (delta, finish_reason = null) => {
    res.write('data: ' + JSON.stringify({ id: 'chatcmpl-smoke', model: 'smoke-model', object: 'chat.completion.chunk', created: 1,
      choices: [{ index: 0, delta, finish_reason }] }) + '\n\n');
  };
  send({ role: 'assistant' });
  if (useTool) send({ tool_calls: [useTodo ? task : change] });
  else { send({ content: 'OMP ' }); send({ content: 'smoke OK' }); }
  send({}, useTool ? 'tool_calls' : 'stop');
  res.end('data: [DONE]\n\n');
});

async function until(check, description) {
  for (let i = 0; i < 150; i++) {
    if (await check()) return;
    await pause(200);
  }
  throw new Error('Tidsavbrudd: ' + description);
}

async function testApp() {
  bootstrap();
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const url = 'http://127.0.0.1:' + server.address().port + '/v1';
  const mcpUrl = new URL('/mcp', url).href;
  fs.writeFileSync(path.join(agent, 'mcp.json'), JSON.stringify({ mcpServers: { fixture: { type: 'http', url: mcpUrl } } }));
  fs.writeFileSync(path.join(agent, 'models.yml'), 'providers:\n  desktop-smoke:\n    baseUrl: ' + url + '\n    api: openai-completions\n    apiKey: local\n    models:\n      - id: smoke-model\n');
  process.env.PI_CODING_AGENT_DIR = agent;
  process.env.OMP_PROFILE = '';
  const configRoot = path.join(test, 'omp-root');
  const relativeRoot = path.relative(os.homedir(), configRoot);
  assert(!path.isAbsolute(relativeRoot), 'Testen må kjøre på samme disk som brukerprofilen.');
  process.env.PI_CONFIG_DIR = relativeRoot;
  process.env.PI_NATIVES_DIR = path.join(test, 'natives');
  process.env.OMP_DESKTOP_DATA_DIR = profile;
  const built = path.join(root, 'dist', version, 'OMP Desktop', 'resources', 'app', 'main.cjs');
  require(fs.existsSync(built) ? built : path.join(root, 'main.cjs'));
  await app.whenReady();
  await until(() => BrowserWindow.getAllWindows().length > 0, 'Windows-vindu');
  const [window] = BrowserWindow.getAllWindows();
  const js = code => window.webContents.executeJavaScript(code);
  const run = (action, data) => js('window.desktop.run(' + JSON.stringify(action) + ',' + JSON.stringify(data) + ')');
  const connected = () => js("document.querySelector('#health.online') !== null").catch(() => false);
  await until(connected, 'OMP-tilkobling');
  assert.equal(await js("document.getElementById('desktopVersion').textContent"), version);
  assert.deepEqual(await run('state').then(state => state.pinnedProjects), [project]);
  assert.deepEqual(await js("Array.from(document.querySelectorAll('.sidebar-project-toggle'), button => button.getAttribute('aria-expanded'))"), ['true', 'false']);
  await js("document.querySelector('.sidebar-project-toggle').click()");
  await until(() => js("!document.querySelector('.thread')"), 'sammenlagt prosjekt');
  await js("document.getElementById('sidebarSearch').value = 'Android test'; document.getElementById('sidebarSearch').dispatchEvent(new Event('input'))");
  assert.equal(await js("document.querySelector('.thread-title').textContent"), 'Android test conversation');
  assert.equal(await js("document.querySelector('.thread-shared').getAttribute('aria-label')"), 'Delt med Android');
  await js("document.querySelector('#projectList .sidebar-menu summary').click(); document.querySelector('#projectList .sidebar-menu-items button').click()");
  await until(async () => (await run('state')).pinnedProjects.includes(imported), 'festet Android-prosjekt');
  await js("document.getElementById('sidebarSearch').value = ''; document.getElementById('sidebarSearch').dispatchEvent(new Event('input'))");
  await js("document.getElementById('sidebarResize').dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight' }))");
  assert.equal(await js("localStorage.getItem('sidebarWidth')"), '236');
  await js("document.getElementById('shareThread').click()");
  await until(() => js("document.getElementById('workspaceDialogTitle').textContent === 'Del tråd'"), 'deling fra trådlinjen');
  await js("document.getElementById('workspaceDialog').close(); document.getElementById('threadOptions').click()");
  await until(() => js("document.getElementById('workspaceDialogTitle').textContent === 'Trådvalg'"), 'trådvalg fra trådlinjen');
  await js("document.getElementById('workspaceDialog').close(); document.getElementById('changes').click()");
  await until(() => js("document.getElementById('changes').getAttribute('aria-pressed') === 'true'"), 'sidepanel fra trådlinjen');
  await js("document.getElementById('reviewFiles').click()");
  await until(() => js("document.getElementById('projectFiles').textContent.includes('note.txt')"), 'filer i prosjektpanelet');
  assert.equal(await run('projectPreview', { id, relative: 'note.txt' }), 'Before\n');
  await assert.rejects(run('projectEntries', { id, relative: '..' }), /prosjektmappen/);
  await js("document.getElementById('changes').click()");
  console.log('Prosjektgrupper, søk, Android-markør, festing og breddejustering bestod.');
  await js("document.getElementById('openPreview').click()");
  await until(() => js("document.getElementById('previewAddress').value === '/docs/'"), 'statisk forhåndsvisning oppdaget');
  await js("document.getElementById('launchProject').click()");
  await until(() => js("!document.getElementById('previewSurface').hidden"), 'integrert forhåndsvisning');
  const web = webContents.getAllWebContents().find(contents => /127\.0\.0\.1:\d+\/docs\//.test(contents.getURL()));
  assert(web, 'Fant ikke forhåndsvisningens webinnhold.');
  assert.equal(await web.executeJavaScript("document.getElementById('download').textContent"), 'Last ned testfil');
  await until(async () => {
    const width = await js("Math.round(document.getElementById('previewViewport').getBoundingClientRect().width)");
    const actual = await web.executeJavaScript('innerWidth');
    return width > 0 && Math.abs(width - actual) <= 1;
  }, 'skrivebordsbredde i prosjektpanelet').catch(async error => {
    const rect = await js("document.getElementById('previewViewport').getBoundingClientRect().toJSON()");
    const native = window.contentView.children.find(view => view.webContents === web)?.getBounds();
    throw new Error(error.message + ' · DOM ' + JSON.stringify(rect) + ' · native ' + JSON.stringify(native) +
      ' · side ' + await web.executeJavaScript('innerWidth'));
  });
  await js("document.getElementById('previewMobile').click()");
  await until(async () => {
    const viewport = await js(`(() => {
      const node = document.getElementById('previewViewport');
      return { mobile: node.classList.contains('mobile-preview'), width: node.getBoundingClientRect().width };
    })()`);
    const actual = await web.executeJavaScript('innerWidth');
    return viewport.mobile && actual > 0 && viewport.width <= 390.5 && Math.abs(actual - viewport.width) <= 1;
  }, 'mobilbredde i prosjektpanelet');
  await js("document.getElementById('previewPick').click()");
  await until(() => web.executeJavaScript("document.querySelector('style')?.textContent.includes('crosshair')"), 'markeringsmodus');
  web.debugger.attach('1.3');
  try {
    await web.debugger.sendCommand('Input.dispatchMouseEvent', { type: 'mousePressed', button: 'left', clickCount: 1, x: 40, y: 16 });
    await web.debugger.sendCommand('Input.dispatchMouseEvent', { type: 'mouseReleased', button: 'left', clickCount: 1, x: 40, y: 16 });
  } finally { web.debugger.detach(); }
  await until(() => js("document.getElementById('message').value.includes('#download')"), 'markert element lagt i utkast');
  assert.match(await js("document.getElementById('message').value"), /Last ned testfil/);
  fs.writeFileSync(path.join(project, 'docs', 'index.html'), '<!doctype html><button id="download">Oppdatert knapp</button>');
  await js("document.getElementById('previewReload').click()");
  await until(() => web.executeJavaScript("document.getElementById('download')?.textContent === 'Oppdatert knapp'").catch(() => false), 'forhåndsvisningen viser endret fil');
  await js("document.getElementById('previewStop').click()");
  await until(() => js("!document.getElementById('previewForm').hidden"), 'statisk forhåndsvisning stoppet');
  const devProbe = http.createServer();
  await new Promise(resolve => devProbe.listen(0, '127.0.0.1', resolve));
  const devPort = devProbe.address().port;
  await new Promise(resolve => devProbe.close(resolve));
  fs.writeFileSync(path.join(project, 'dev-fixture.cjs'),
    `require('node:http').createServer((req, res) => res.end('<p>Utviklingsserver i OMP</p>')).listen(${devPort}, '127.0.0.1')`);
  const devAddress = 'http://127.0.0.1:' + devPort;
  await js(`document.getElementById('previewCommand').value = 'node.exe dev-fixture.cjs';
    document.getElementById('previewAddress').value = ${JSON.stringify(devAddress)};
    document.getElementById('launchProject').click();`);
  await until(() => js("!document.getElementById('previewSurface').hidden"), 'utviklingsserver startet fra panelet');
  assert.match(await web.executeJavaScript('document.body.textContent'), /Utviklingsserver i OMP/);
  await js("document.getElementById('previewStop').click()");
  await until(() => fetch(devAddress).then(() => false, () => true), 'utviklingsserver og underprosesser stoppet');
  await js("document.getElementById('message').value=''; document.getElementById('reviewTests').click()");
  await until(() => js("!!document.querySelector('#testsPanel input')"), 'testfanen');
  await js("document.querySelector('#testsPanel input').value = \"Write-Output 'verified'; exit 7\"; document.querySelector('#testsPanel form').requestSubmit()");
  await until(() => js("document.getElementById('testsPanel').textContent.includes('Tester feilet (7)')"), 'ekte feilkode fra test');
  assert.match(await js("document.querySelector('#testsPanel pre').textContent"), /verified/);
  await js("document.querySelector('#testsPanel input').value = \"Write-Output 'passed'; exit 0\"; document.querySelector('#testsPanel form').requestSubmit()");
  await until(() => js("document.getElementById('testsPanel').textContent.includes('Tester bestod')"), 'bestått test');
  assert.equal((await run('turnData', id)).checks.length, 2);
  console.log('Prosjektstart, mobilbredde, visuell markering, oppdatert forhåndsvisning og testresultat bestod.');
  assert.match(await run('version'), /^omp\/19\./);
  assert.equal((await run('git', id)).branch, 'main');
  await run('browser', new URL('/preview', url).href);
  const preview = BrowserWindow.getAllWindows().find(item => item !== window);
  assert(preview, 'Nettleservinduet ble ikke opprettet.');
  assert.equal(await preview.webContents.executeJavaScript('document.title'), 'OMP preview smoke');
  preview.close();
  await js("window.desktop.onEvent(({frame}) => { if (frame.type === 'terminal_output') document.body.dataset.terminal = (document.body.dataset.terminal || '') + frame.text; })");
  await run('terminal', { id, command: "Write-Output 'OMP terminal smoke OK'" });
  await until(() => js("document.body.dataset.terminal?.includes('OMP terminal smoke OK')"), 'PowerShell-utdata');
  await run('stopTerminal', id);
  const jobs = await run('scheduleAdd', { id, when: new Date(Date.now() + 600000).toISOString(), message: 'Smoke schedule' });
  assert.equal(jobs.at(-1).status, 'pending');
  assert.equal((await run('scheduleCancel', jobs.at(-1).id)).at(-1).status, 'cancelled');
  await js("document.getElementById('settings').click()");
  await until(() => js("!document.getElementById('settingsDialog').hidden"), 'fast innstillingspanel');
  await js("document.getElementById('settingsSearch').value='font';document.getElementById('settingsSearch').dispatchEvent(new Event('input'));document.querySelector('#tabs button').click()");
  await until(() => js("document.querySelectorAll('.theme-card').length === 10"), 'ti temaer');
  await js("[...document.querySelectorAll('.theme-card')].find(x => x.textContent.includes('Oh My Pi')).click()");
  await until(() => JSON.parse(fs.readFileSync(settings, 'utf8')).theme === 'omp', 'lagre tema');
  assert.equal(await js('document.documentElement.style.colorScheme'), 'dark');
  assert.deepEqual(await run('appearance', { key: 'uiFont', value: 'Arial' }), { uiFont: 'Arial' });
  assert.deepEqual(await run('appearance', { key: 'paper', value: '#151922' }), { uiFont: 'Arial', paper: '#151922' });
  await js("document.querySelector('#settingsDialog .close').click()");

  const models = await run('models', id);
  assert(models.models.some(model => model.provider === 'desktop-smoke' && model.id === 'smoke-model'));
  const installedCatalog = await run('models', null);
  assert(installedCatalog.models.some(model => model.provider === 'desktop-smoke' && model.id === 'smoke-model'));
  const selectedDefault = await run('model', { provider: 'desktop-smoke', modelId: 'smoke-model' });
  assert.equal(selectedDefault.model.id, 'smoke-model');
  await js("document.getElementById('model').click()");
  const smokeChoice = "[...document.querySelectorAll('#modelList button')].find(b => b.textContent.includes('desktop-smoke'))";
  await until(() => js('!!(' + smokeChoice + ')'), 'klikkbar modell i skrivefeltets meny');
  await js(smokeChoice + '.click()');
  await until(() => js("!document.getElementById('modelDialog').open && document.getElementById('model').textContent.includes('smoke-model')"), 'modell valgt fra skrivefeltet');
  const reused = await js("document.getElementById('model').click(); Promise.resolve().then(() => !!(" + smokeChoice + "))");
  assert(reused, 'Modellisten må vises fra cache på nytt klikk.');
  assert.equal(await js(smokeChoice + ".getAttribute('aria-pressed')"), 'true');
  await js("document.getElementById('modelDialog').close()");
  const existing = (await run('providerCatalog', id)).find(item => item.id === 'desktop-smoke');
  assert(existing?.configured && existing.hasCredential && existing.custom && existing.modelCount > 0);
  const resource = await run('resources', id);
  assert(resource.Skills.some(item => item.name === 'smoke' && item.enabled));
  assert(resource.Agenter.length > 0);
  assert(resource.Verktøy.some(item => item.name === 'write' && item.enabled));
  assert(resource['MCP-servere'].some(item => item.name === 'fixture' && item.enabled), JSON.stringify(resource['MCP-servere']));
  for (const enabled of [false, true]) {
    await run('toggleResource', { id, kind: 'mcp', name: 'fixture', enabled });
    const servers = (await run('resources', id))['MCP-servere'];
    assert(servers.some(item => item.name === 'fixture' && item.enabled === enabled), JSON.stringify(servers));
  }
  for (const enabled of [false, true]) {
    await run('toggleResource', { id, kind: 'skill', name: 'smoke', enabled });
    assert.equal((await run('resources', id)).Skills.find(item => item.name === 'smoke')?.enabled, enabled);
  }
  const firstAgent = resource.Agenter.find(item => item.enabled);
  await run('toggleResource', { id, kind: 'agent', name: firstAgent.name, enabled: false });
  assert((await run('resources', id)).Agenter.some(item => item.name === firstAgent.name && !item.enabled));
  for (const enabled of [false, true]) {
    await run('toggleResource', { id, kind: 'tool', name: 'write', enabled });
    assert.equal((await run('resources', id)).Verktøy.some(item => item.name === 'write' && item.enabled), enabled);
  }
  assert.equal(typeof await run('plugins', { action: 'list', id }), 'object');
  assert.equal(typeof await run('plugins', { action: 'discover', id }), 'object');
  const marketplace = path.join(project, 'marketplace');
  const manifestDir = path.join(marketplace, 'fixture-plugin', '.omp-plugin');
  fs.mkdirSync(manifestDir, { recursive: true });
  fs.mkdirSync(path.join(marketplace, '.omp-plugin'), { recursive: true });
  fs.writeFileSync(path.join(marketplace, '.omp-plugin', 'marketplace.json'), JSON.stringify({
    name: 'desktop-fixtures', owner: { name: 'Test' }, plugins: [{ name: 'fixture-plugin', source: './fixture-plugin' }]
  }));
  fs.writeFileSync(path.join(manifestDir, 'plugin.json'), JSON.stringify({ name: 'fixture-plugin', version: '1.0.0' }));
  await run('plugins', { action: 'marketplaceAdd', target: './marketplace', id });
  const discovery = await run('plugins', { action: 'discover', id });
  assert(JSON.stringify(discovery).includes('fixture-plugin'), JSON.stringify(discovery));
  await run('plugins', { action: 'install', target: 'fixture-plugin@desktop-fixtures', scope: 'project', id });
  const installed = await run('plugins', { action: 'list', id });
  assert(installed.marketplace.some(plugin => JSON.stringify(plugin).includes('fixture-plugin')), JSON.stringify(installed));
  for (const enabled of [false, true]) {
    await run('plugins', { action: enabled ? 'enable' : 'disable', target: 'fixture-plugin@desktop-fixtures', scope: 'project', id });
    const list = await run('plugins', { action: 'list', id });
    assert(list.marketplace.some(plugin => plugin.id === 'fixture-plugin@desktop-fixtures' && plugin.entries.some(entry => entry.enabled === enabled)), JSON.stringify(list));
  }

  const provider = { name: 'desktop-key-test', url, model: 'smoke-model', api: 'openai-completions', key: 'fixture-key' };
  assert.deepEqual(await run('testProvider', provider), { models: 1, found: true });
  await run('addProvider', provider);
  assert(!fs.readFileSync(settings, 'utf8').includes('fixture-key'));
  assert(!fs.readFileSync(path.join(agent, 'models.yml'), 'utf8').includes('fixture-key'));
  window.webContents.reload();
  await until(connected, 'tilkobling etter omstart av visning');
  assert.equal(await js('document.documentElement.style.colorScheme'), 'dark');
  await run('model', { id, provider: 'desktop-key-test', modelId: 'smoke-model' });
  await js("document.getElementById('message').value = 'Change note.txt to After using the write tool'; document.getElementById('compose').requestSubmit()");
  await until(() => js("document.getElementById('timeline').textContent.includes('OMP smoke OK')"), 'strømmet modell- og verktøysvar');
  assert.equal(fs.readFileSync(path.join(project, 'note.txt'), 'utf8'), 'After\n');
  assert(checkedKey);
  assert(modelRequests >= 2);
  assert.match((await run('git', id)).diff, /\+After/);
  assert((await run('gitFiles', id)).some(file => file.file === 'note.txt'));
  await until(async () => (await run('turnData', id)).cards.some(card => card.files.some(item => item.file === 'note.txt')), 'endringskort fra OMP-verktøy');
  const card = (await run('turnData', id)).cards.find(item => item.files.some(file => file.file === 'note.txt'));
  assert.deepEqual(card.files.find(item => item.file === 'note.txt'), { file: 'note.txt', added: 1, removed: 1, truncated: false, verified: true });
  assert(card.undoable);
  assert.match((await run('turnDiff', { id, cardId: card.id, file: 'note.txt' })).diff, /-Before[\s\S]*\+After/);
  await until(() => js("document.querySelector('.turn-card')?.textContent.includes('note.txt')"), 'endringskort i samtalen');
  await js("document.querySelector('.turn-file').click()");
  await until(() => js("!document.getElementById('turnReview').hidden && document.getElementById('turnReview').textContent.includes('+After')"), 'diff ved siden av samtalen');
  await until(() => js("document.getElementById('todoPanel').textContent.includes('Kontroller filendringen')"), 'OMP-oppgaver i skrivebordsklienten');
  assert.match(await js("document.querySelector('.todo-count').textContent"), /0 av 1 ferdig · 1 gjenstår/);
  assert.deepEqual(await js(`(() => {
    const current = view(${JSON.stringify(id)});
    const original = current.todos;
    const checklist = document.getElementById('todoPanel');
    try {
      current.todos = original.map(phase => ({ ...phase, tasks: phase.tasks.map(task => ({ ...task, status: 'completed' })) }));
      renderConversation();
      const finished = checklist.querySelector('.todo-count').textContent;
      const collapsed = !checklist.querySelector('details').open;
      current.todos = [];
      renderConversation();
      return [finished, collapsed, checklist.hidden];
    } finally { current.todos = original; renderConversation(); }
  })()`), ['1 av 1 ferdig · 0 gjenstår', true, true]);
  const writeText = clipboard.writeText;
  let copied;
  try {
    clipboard.writeText = text => { copied = text; };
    await js("document.querySelector('.chat-turn.assistant > .message + .message-actions button').click()");
    await until(() => copied === 'OMP smoke OK', 'Kopier sender riktig melding til Windows-utklippstavlen');
  } finally { clipboard.writeText = writeText; }
  await js(`window.desktop.onEvent(({ frame }) => {
    if (frame.type === 'message_speech') document.body.dataset.speech = frame.error || 'ok';
  }); document.querySelector('.chat-turn.assistant [data-speech-key]').click();`);
  await until(() => js("document.body.dataset.speech === 'ok'"), 'Windows fullførte opplesingen');
  console.log('Kopier, Windows-opplesing og oppgavestatus (ferdig, gjenstår og tom liste) bestod.');
  for (const staged of [false, true]) {
    const blocks = await run('gitHunks', { id, file: 'note.txt', staged });
    assert(blocks[0].text.includes('+After'));
    await run('gitChange', { id, file: 'note.txt', staged, hunk: 0, expected: blocks[0].text });
    const git = await run('git', id);
    assert.match(staged ? git.diff : git.staged, /\+After/);
  }
  await until(() => !!JSON.parse(fs.readFileSync(settings, 'utf8')).threads[0].sessionFile, 'lagret OMP-økt');
  await until(async () => !(await run('state')).busy.length, 'klar for planlagt kjøring');
  const scheduled = (await run('scheduleAdd', {
    id, when: new Date(Date.now() + 1500).toISOString(), message: 'OMP scheduled smoke prompt'
  })).at(-1);
  await until(async () => (await run('scheduleList')).find(job => job.id === scheduled.id)?.status === 'sent', 'planlagt oppgave sendt');
  await until(async () => !(await run('state')).busy.length, 'planlagt oppgave fullført');
  await run('toggleResource', { id, kind: 'agent', name: firstAgent.name, enabled: true });
  const resumed = await run('connect', id);
  assert(resumed.history.messages.some(item => item.role === 'assistant' && JSON.stringify(item.content).includes('smoke OK')));
  assert(resumed.history.messages.some(item => item.role === 'user' && JSON.stringify(item.content).includes('OMP scheduled smoke prompt')));
  const tracker = await run('newThread', { project, worktree: true });
  const undone = await run('turnUndo', { id, cardId: card.id });
  assert(undone.card.undone);
  assert.equal(fs.readFileSync(path.join(project, 'note.txt'), 'utf8'), 'Before\n');
  assert.notEqual(tracker.threads.at(-1).cwd, project);
  assert.match((await run('git', tracker.selected)).branch, /^omp\//);
  const catalog = await run('providerCatalog');
  assert(catalog.length >= 50);
  assert(catalog.some(item => item.id === 'nvidia' && item.name === 'NVIDIA'));
  assert(catalog.some(item => item.id === 'opencode-zen' && item.hasAccount));
  assert(catalog.some(item => item.id === 'opencode-go' && item.hasAccount));
  await js("document.getElementById('settings').click()");
  await until(() => js("!!document.querySelector('#tabs button[aria-label=Modeller] svg')"), 'Modellikon i innstillinger');
  await js("document.querySelector('#tabs button[aria-label=Modeller]').click()");
  await until(() => js("!!document.querySelector('.provider-details')"), 'leverandørseksjon');
  await js("document.querySelector('.provider-details').open = true");
  await until(() => js("document.querySelector('.provider-list')?.textContent.includes('NVIDIA')"), 'søkbar leverandørmeny');
  await js("const search = document.querySelector('.provider-sidebar input'); search.value = 'nvidia'; search.dispatchEvent(new Event('input'))");
  assert.equal(await js("document.querySelectorAll('.provider-list button').length"), 1);
  await js("document.querySelector('.provider-list button').click()");
  assert.equal(await js("document.querySelector('.provider-detail input[type=password]') !== null && document.querySelector('.provider-detail input[type=url]') === null"), true);
  try {
    const preview = await window.capturePage();
    if (!preview.isEmpty()) fs.writeFileSync(path.join(test, 'providers.png'), preview.toPNG());
  } catch {}
  const router = { name: '9router', url, api: 'openai-completions', key: 'fixture-router-key', shared: true };
  assert.deepEqual(await run('discoverProvider', router), ['smoke-model']);
  assert.equal((await run('addProvider', router)).models, 1);
  assert((await run('models', id)).models.some(item => item.provider === '9router' && item.id === 'smoke-model'));
  await run('connectProvider', { id: 'nvidia', key: 'fixture-nvidia-key', shared: true });
  await run('connectProvider', { id: 'opencode-zen', key: 'fixture-opencode-key', shared: true });
  const config = require('yaml').parse(fs.readFileSync(path.join(agent, 'models.yml'), 'utf8')).providers;
  assert.deepEqual(config.nvidia, { apiKey: 'fixture-nvidia-key' });
  assert.deepEqual(config['opencode-zen'], { apiKey: 'fixture-opencode-key' });
  assert.equal(config['9router'].baseUrl, url);
  assert.equal(config['9router'].discovery.type, 'openai-models-list');
  assert.equal(config['9router'].apiKey, 'fixture-router-key');
  assert(!JSON.stringify(await run('providerCatalog')).includes('fixture-'));
  console.log('52 innebygde leverandører, NVIDIA uten URL, OpenCode-tilkobling, 9Router og delt OMP-konfigurasjon bestod.');
  console.log('Testdata:', test);
  console.log('Windows, OMP, nettleser, PowerShell, planlagt kjøring, modell, ressurser, plugins, gjenåpning, Git-blokker og worktree bestod.');
  try {
    const image = await window.capturePage();
    if (!image.isEmpty()) fs.writeFileSync(path.join(test, 'workspace.png'), image.toPNG());
  } catch (error) { console.log('Skjermbilde kunne ikke tas:', error.message); }

  await js(`newThread(${JSON.stringify(imported)}, false, true)`);
  const plain = await run('state');
  await js("openReview('changes')");
  const setup = "document.querySelector('.git-setup button')";
  const dialog = "document.getElementById('workspaceDialog')";
  await js(setup + '.click()');
  await until(() => js(dialog + '.open'), 'Git-bekreftelse i appen');
  assert.equal(await js("document.activeElement.textContent"), 'Avbryt');
  assert.equal(await js("document.querySelector('.git-setup-path').textContent"), imported);
  try {
    await pause(220);
    const screenshot = await window.capturePage();
    if (!screenshot.isEmpty()) fs.writeFileSync(path.join(test, 'git-setup.png'), screenshot.toPNG());
  } catch {}
  await js("document.querySelector('.dialog-actions button').click()");
  await until(() => js('!' + dialog + '.open'), 'avbrutt Git-oppsett');
  assert(!fs.existsSync(path.join(imported, '.git')));
  await js(setup + '.click()');
  await until(() => js(dialog + '.open'), 'gjenåpnet Git-oppsett');
  await js("document.querySelector('.dialog-actions .primary').click()");
  await until(() => js('!' + dialog + '.open'), 'bekreftet Git-oppsett');
  assert(fs.existsSync(path.join(imported, '.git')));
  assert.equal((await run('git', plain.selected)).repository, true);
  console.log('Git-dialogen beholdt mappen ved avbrudd og opprettet Git ved bekreftelse.');
}

testApp().then(() => app.quit(), error => {
  console.error(error);
  console.error('Testdata:', test);
  app.exit(1);
}).finally(() => server.close());
