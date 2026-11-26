const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const { execFileSync } = require('node:child_process');
const { setTimeout: delay } = require('node:timers/promises');
const { pathToFileURL } = require('node:url');
const electron = process.versions.electron ? require('electron') : null;
electron?.app.on('window-all-closed', () => {});

const sdk = process.env.ANDROID_SDK_ROOT || 'C:\\Android';
const adb = path.join(sdk, 'platform-tools', 'adb.exe');
const serial = process.env.ANDROID_SERIAL || 'emulator-5554';
const runAdb = (...args) => execFileSync(adb, ['-s', serial, ...args], { encoding: 'utf8', windowsHide: true, timeout: 20000 });

async function until(check) {
  for (let i = 0; i < 40; i++) {
    const result = await check();
    if (result) return result;
    await delay(250);
  }
  throw new Error('Testvinduet bekreftet ikke handlingen innen fristen.');
}

async function main() {
  console.log('Starting device-control verification.');
  const devices = execFileSync(adb, ['devices'], { encoding: 'utf8', windowsHide: true })
    .split(/\r?\n/).filter(row => /\tdevice$/.test(row));
  assert.deepEqual(devices, [serial + '\tdevice'], 'Kjør testen med bare den angitte emulatoren koblet til.');
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'omp-device-smoke-'));
  const title = 'OMP device smoke ' + process.pid;
  let fixture;
  process.env.OMP_BRIDGE_RESOURCE_OPTIONS = JSON.stringify({ deviceControl: true });
  const source = process.env.OMP_DEVICE_PLUGIN || path.join(__dirname, '../../windows/bridge/workspace-extension.mjs');
  const extension = (await import(pathToFileURL(source).href)).default;
  let tool;
  const schema = new Proxy(() => schema, { get: () => schema });
  extension({ zod: schema, on() {}, registerTool(candidate) { if (candidate.name === 'omp_device') tool = candidate; } });
  assert(tool);
  const execute = (input, approved = true) => tool.execute('smoke', input, AbortSignal.timeout(30000), undefined, {
    hasUI: true, ui: { confirm: async (caption, detail) => {
      assert.match(caption, /godkjenning/);
      assert(detail.includes(input.device === 'android' ? serial : input.exactTitle || 'Windows'));
      if (approved && input.device === 'windows' && fixture) {
        fixture.moveTop();
        fixture.focus();
        if (input.action === 'type') {
          fixture.webContents.focus();
          await fixture.webContents.executeJavaScript("document.querySelector('#text').focus()");
        }
        await delay(130);
      }
      return approved;
    } }
  });
  const capture = result => {
    assert.equal(result.content[0].mimeType, 'image/png');
    const png = Buffer.from(result.content[0].data, 'base64');
    assert.equal(png.readUInt32BE(0), 0x89504e47);
    return png;
  };
  try {
    if (!process.env.OMP_DEVICE_ANDROID_ONLY) {
      if (!electron) throw new Error('Run the Windows test with Electron.');
      const { app, BrowserWindow } = electron;
      app.setPath('userData', directory);
      await app.whenReady();
      fixture = new BrowserWindow({ width: 490, height: 300, title, alwaysOnTop: true, resizable: false });
      const html = '<title>' + title + '</title><input id="text" autofocus style="position:absolute;left:30px;top:30px">' +
        '<button id="tap" style="position:absolute;left:125px;top:90px;width:200px;height:100px">Confirm click</button>';
      await fixture.loadURL('data:text/html;charset=utf-8,' + encodeURIComponent(html));
      console.log('Windows fixture rendered.');
      const js = code => fixture.webContents.executeJavaScript(code);
      await js("document.getElementById('tap').onclick = () => { document.body.dataset.clicked = document.getElementById('text').value; }; document.getElementById('text').focus()");
      fixture.show();
      fixture.focus();
      await until(async () => (await execute({ device: 'windows', action: 'foreground' }).catch(() => null))?.content[0].text === title);
      const win = { device: 'windows', exactTitle: title };
      capture(await execute({ ...win, action: 'screen' }));
      await execute({ ...win, action: 'type', text: 'Rejected' }, false);
      assert.equal(await js("document.getElementById('text').value"), '');
      const marker = 'Actual OMP input ' + process.pid;
      await execute({ ...win, action: 'type', text: marker });
      await until(async () => await js("document.getElementById('text').value") === marker);
      await execute({ ...win, action: 'tap', x: .45, y: .59 });
      await until(async () => await js("document.body.dataset.clicked") === marker);
      console.log('Windows: correct window, screenshot, rejected input, typed marker and clicked button.');
    }
    if (process.env.OMP_DEVICE_WINDOWS_ONLY) return;

    const android = { device: 'android' };
    assert.match((await execute({ ...android, action: 'apps' })).content[0].text, /com\.android\.settings/);
    await execute({ ...android, action: 'open', package: 'com.android.settings' });
    assert.match(runAdb('shell', 'dumpsys', 'activity', 'activities'), /(?:mResumedActivity|topResumedActivity).*com\.android\.settings/);
    const png = capture(await execute({ ...android, action: 'screen' }));
    const xmlFile = '/data/local/tmp/omp-control-smoke.xml';
    runAdb('shell', 'uiautomator', 'dump', xmlFile);
    const xml = runAdb('shell', 'cat', xmlFile);
    const node = xml.match(/<node\s[^>]*text="Network &amp; internet"[^>]*>/i)?.[0];
    assert(node, 'Could not find Network & internet on the test emulator');
    const bounds = [...node.match(/bounds="([^"]+)"/)[1].matchAll(/\d+/g)].map(item => Number(item[0]));
    await execute({ ...android, action: 'tap', x: (bounds[0] + bounds[2]) / (2 * png.readUInt32BE(16)),
      y: (bounds[1] + bounds[3]) / (2 * png.readUInt32BE(20)) });
    runAdb('shell', 'uiautomator', 'dump', xmlFile);
    assert.match(runAdb('shell', 'cat', xmlFile), /Airplane mode|Mobile network|Data Saver/i);
    console.log('Android ADB: listed apps, opened Settings, captured screen and reached the expected subpage by tapping.');
  } finally {
    if (!process.env.OMP_DEVICE_WINDOWS_ONLY) runAdb('shell', 'am', 'start', '-n', 'net.nimay.chatompomp/.MainActivity');
    fixture?.destroy();
    await fs.rm(directory, { force: true, recursive: true }).catch(() => {});
  }
}

main().then(() => { if (electron) electron.app.exit(0); }, error => {
  console.error(error);
  if (electron) electron.app.exit(1);
  else process.exitCode = 1;
});
