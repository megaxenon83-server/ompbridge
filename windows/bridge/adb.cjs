const fs = require('node:fs/promises');
const { existsSync } = require('node:fs');
const path = require('node:path');
const { execFile } = require('node:child_process');
const { promisify } = require('node:util');
const { pipeline } = require('node:stream/promises');
const { Readable } = require('node:stream');
const { createWriteStream } = require('node:fs');

const exec = promisify(execFile);
const platformToolsUrl = 'https://dl.google.com/android/repository/platform-tools-latest-windows.zip';
const managed = path.join(__dirname, 'platform-tools');
const adbName = process.platform === 'win32' ? 'adb.exe' : 'adb';
let installing;

function run(executable, args, extra = {}) {
  return exec(executable, args, { windowsHide: true, timeout: 15000, maxBuffer: 12 * 1024 * 1024, ...extra });
}

function binary() {
  const roots = [process.env.ANDROID_SDK_ROOT, process.env.ANDROID_HOME,
    process.env.LOCALAPPDATA && path.join(process.env.LOCALAPPDATA, 'Android', 'Sdk'), 'C:\\Android'];
  const candidates = [
    ...roots.filter(Boolean).map(root => path.join(root, 'platform-tools', adbName)), path.join(managed, adbName),
    ...String(process.env.PATH || '').split(path.delimiter).map(part => part.replace(/^"|"$/g, ''))
      .filter(path.isAbsolute).map(part => path.join(part, adbName))
  ];
  return candidates.find(existsSync);
}

async function status(identity) {
  const adb = binary();
  if (!adb) return { installed: false, running: false, devices: [], installAvailable: process.platform === 'win32' };
  try {
    const { stdout: version } = await run(adb, ['version']);
    const { stdout } = await run(adb, ['devices', '-l']);
    const devices = stdout.split(/\r?\n/).flatMap(line => {
      const match = /^([a-z\d_.:\-]+)\s+(device|offline|unauthorized|recovery|sideload|no permissions)(?:\s+(.*))?$/i.exec(line);
      return match ? [{ serial: match[1], state: match[2], model: match[3]?.match(/\bmodel:(\S+)/)?.[1]?.replaceAll('_', ' ') || '' }] : [];
    });
    await Promise.all(devices.filter(item => item.state === 'device').map(async item => {
      try {
        const { stdout: version } = await run(adb, ['-s', item.serial, 'shell', 'getprop', 'ro.build.version.release'], { timeout: 3500 });
        item.android = version.trim();
        item.reachable = !!item.android;
      } catch { item.reachable = false; }
      if (item.reachable && /^[a-f0-9-]{36}$/.test(identity || '')) {
        try {
          const { stdout } = await run(adb, ['-s', item.serial, 'shell', 'content', 'query', '--uri',
            'content://net.nimay.chatompomp.adb/identity'], { timeout: 3500 });
          item.matchesPhone = /^Row:\s*0\s+omp_id=([a-f0-9-]{36})\s*$/m.exec(stdout)?.[1] === identity;
        } catch { item.matchesPhone = false; }
      }
    }));
    return { installed: true, running: true, version: version.split(/\r?\n/)[0], devices };
  } catch (error) {
    return { installed: true, running: false, devices: [], error: error.killed ? 'ADB svarte ikke.' : 'ADB kunne ikke startes.' };
  }
}

async function install() {
  if (installing) return installing;
  const current = await status();
  if (current.installed || process.platform !== 'win32') return current;
  if (installing) return installing;
  installing = (async () => {
    const staging = await fs.mkdtemp(path.join(__dirname, 'adb-download-'));
    try {
      const response = await fetch(platformToolsUrl, { redirect: 'error', signal: AbortSignal.timeout(90000) });
      if (!response.ok || !response.body) throw new Error('Google Platform Tools kunne ikke lastes ned.');
      const archive = path.join(staging, 'platform-tools.zip');
      await pipeline(Readable.fromWeb(response.body), createWriteStream(archive, { flags: 'wx' }));
      await run(path.join(process.env.SystemRoot || 'C:\\Windows', 'System32', 'tar.exe'),
        ['-xf', archive, '-C', staging, 'platform-tools/adb.exe', 'platform-tools/AdbWinApi.dll', 'platform-tools/AdbWinUsbApi.dll']);
      const extracted = path.join(staging, 'platform-tools');
      await run(path.join(extracted, adbName), ['version']);
      await fs.rename(extracted, managed);
      const result = await status();
      if (!result.running) throw new Error('ADB ble installert, men kunne ikke starte.');
      return result;
    } finally { await fs.rm(staging, { recursive: true, force: true }); }
  })().finally(() => { installing = undefined; });
  return installing;
}

async function device(signal) {
  const adb = binary();
  if (!adb) throw new Error('Installer ADB fra Enhetsstyring i innstillingene.');
  const { devices } = await status();
  const ready = devices.filter(item => item.reachable);
  if (ready.length !== 1) throw new Error('Koble til og godkjenn nøyaktig én Android-enhet eller emulator via ADB.');
  return { serial: ready[0].serial, run: (args, extra) => run(adb, ['-s', ready[0].serial, ...args], { signal, ...extra }) };
}

module.exports = { status, install, device };
