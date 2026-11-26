const { app, BrowserWindow } = require('electron');
const assert = require('node:assert/strict');
const { setTimeout: sleep } = require('node:timers/promises');
const fs = require('node:fs');
const path = require('node:path');
const { version } = require('../package.json');

const root = path.join(__dirname, '..');
const existing = process.env.OMP_DESKTOP_BRIDGE_TEST_DIR;
const test = existing ? path.resolve(existing) : fs.mkdtempSync(path.join(root, '.desktop-test-bridge-'));
const project = path.join(test, 'project');
const profile = path.join(test, 'profile');
const prior = existing ? JSON.parse(fs.readFileSync(path.join(profile, 'settings.json'), 'utf8')) : null;
const token = prior?.threads.find(item => item.id === prior.selected)?.title.match(/^OMPDesktopAndroid\d+/)?.[0]
  || 'OMPDesktopAndroid' + Date.now().toString().slice(-8);
const android = token + 'Mobil';
if (!existing) {
  fs.mkdirSync(profile, { recursive: true });
  fs.mkdirSync(project, { recursive: true });
  fs.writeFileSync(path.join(profile, 'settings.json'), JSON.stringify({ projects: [project] }));
}
process.env.OMP_DESKTOP_DATA_DIR = profile;
app.disableHardwareAcceleration();
require(path.join(root, 'dist', version, 'OMP Desktop', 'resources', 'app', 'main.cjs'));

async function until(check, message, seconds = 90) {
  for (let i = 0; i < seconds; i++) {
    const value = await check();
    if (value) return value;
    await sleep(1000);
  }
  throw new Error('Tidsavbrudd: ' + message);
}

async function testBridge() {
  await app.whenReady();
  const window = await until(() => BrowserWindow.getAllWindows()[0], 'Windows-vindu');
  const js = source => window.webContents.executeJavaScript(source);
  const run = (name, data) => js('window.desktop.run(' + JSON.stringify(name) + ',' + JSON.stringify(data) + ')');
  await until(() => js("typeof window.desktop !== 'undefined'").catch(() => false), 'Windows-klient');
  const linked = await run('pairBridge', { automatic: true });
  assert(linked.status);
  const active = prior || await run('newThread', { project });
  const id = active.selected;
  assert(active.threads.find(item => item.id === id).shared);
  const models = (await run('models', id)).models;
  const model = models.find(item => item.provider === 'ollama' && item.id === 'qwen2.5:1.5b')
    || models.find(item => item.provider === 'ollama' && /gemma.*(e4b|4b)/.test(item.id));
  assert(model, 'En lokal Ollama-modell mangler i bridge-katalogen.');
  await run('model', { id, provider: model.provider, modelId: model.id });
  const text = token + '. Svar bare OK uten å bruke verktøy.';
  window.webContents.reload();
  await until(() => js("document.querySelector('#health.online') !== null").catch(() => false), 'delt tråd');
  console.log('Bridge', linked.status, 'Ollama', model.id, 'Testsamtale', token, 'Android-oppfølging', android);
  if (!prior) await js("document.getElementById('message').value = " + JSON.stringify(text) + "; document.getElementById('compose').requestSubmit()");
  const read = () => run('bridgeHistory', id);
  await until(async () => (await read()).messages.some(item => item.role === 'assistant' && /\bOK\b/i.test(item.text)),
    'Windows-melding og Ollama-svar på den ekte bridgen', 120);
  console.log('Windows → Bridge bestod. Søk etter', token, 'i Android og send', android);
  await until(async () => (await read()).messages.some(item => item.role === 'user' && item.text.includes(android)), 'Android-oppfølging i samme samtale', 385);
  await until(() => js('document.getElementById("timeline").textContent.includes(' + JSON.stringify(android) + ')'),
    'Android-oppfølging synlig i Windows-vinduet');
  console.log('Android → Bridge → åpent Windows-vindu bestod.');
  const history = (await read()).messages.filter(item => item.role === 'user');
  assert(history[0].text.startsWith(token));
  assert(history.some(item => item.text.startsWith(android)));
  window.webContents.reload();
  await until(() => js('document.getElementById("timeline").textContent.includes(' + JSON.stringify(android) + ')').catch(() => false),
    'samme historikk etter gjenåpning');
  console.log('Gjenåpning av den delte historikken bestod.');
  await until(async () => {
    const messages = (await read()).messages;
    const followup = messages.findIndex(item => item.role === 'user' && item.text.includes(android));
    return messages.slice(followup + 1).some(item => item.role === 'assistant');
  }, 'Android-svar ferdig');
  const continued = token + 'Windows. Svar bare OK uten å bruke verktøy.';
  await js("document.getElementById('message').value = " + JSON.stringify(continued) + "; document.getElementById('compose').requestSubmit()");
  await until(async () => {
    const messages = (await read()).messages;
    const followup = messages.findIndex(item => item.role === 'user' && item.text === continued);
    return followup >= 0 && messages.slice(followup + 1).some(item => item.role === 'assistant' && /\bOK\b/i.test(item.text));
  }, 'videre koding fra Windows i samme OMP-økt', 120);
  console.log('Windows fortsatte samme tråd etter Android-meldingen.');
}

testBridge().then(() => app.quit(), error => {
  console.error(error);
  console.error('Testdata:', test);
  app.exit(1);
});
