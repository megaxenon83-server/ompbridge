const { spawn, execFile } = require('node:child_process');
const { createInterface } = require('node:readline');
const { promisify } = require('node:util');
const path = require('node:path');
const os = require('node:os');

const exec = promisify(execFile);
let worker, idle, pending, cached, sampledAt = 0;

function sampleWindows() {
  if (!worker) worker = spawn('powershell.exe', ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass',
    '-File', path.join(__dirname, 'machine-resources.ps1')], { windowsHide: true, stdio: ['pipe', 'pipe', 'ignore'] });
  const child = worker;
  clearTimeout(idle);
  return new Promise((resolve, reject) => {
    const lines = createInterface({ input: child.stdout });
    function finish(error, value) {
      clearTimeout(timeout);
      child.off('error', onError);
      child.off('exit', onExit);
      child.stdin.off('error', onError);
      lines.close();
      if (error) { if (worker === child) worker = undefined; child.kill(); reject(error); }
      else {
        idle = setTimeout(() => { if (worker === child) worker = undefined; child.stdin.end(); }, 10000);
        idle.unref();
        resolve(value);
      }
    }
    const timeout = setTimeout(() => finish(new Error('Tidsavbrudd under maskinmåling.')), 12000);
    const onError = error => finish(error);
    const onExit = () => finish(new Error('Maskinmåleren avsluttet.'));
    child.once('error', onError);
    child.once('exit', onExit);
    child.stdin.once('error', onError);
    lines.once('line', line => {
      try {
        const result = JSON.parse(line.replace(/^\uFEFF/, ''));
        finish(result.error ? new Error(result.error) : null, result);
      } catch (error) { finish(error); }
    });
    child.stdin.write('sample\n');
  });
}

async function collect() {
  const native = process.platform === 'win32'
    ? await sampleWindows()
    : { cpu: { name: os.cpus()[0]?.model, load: null }, ram: { total: os.totalmem(), available: os.freemem() }, gpus: [] };
  if (native.gpus.some(gpu => gpu.vendor === 0x10de)) {
    try {
      const { stdout } = await exec('nvidia-smi', ['--query-gpu=name,temperature.gpu', '--format=csv,noheader,nounits'],
        { timeout: 1200, windowsHide: true });
      const temperatures = stdout.trim().split(/\r?\n/).map(line => line.split(',').map(value => value.trim()));
      for (const gpu of native.gpus) {
        const matches = temperatures.filter(([name]) => name.toLowerCase().replace(/^nvidia /, '') === gpu.name.toLowerCase().replace(/^nvidia /, ''));
        if (matches.length === 1 && /^\d+$/.test(matches[0][1])) gpu.temperature = Number(matches[0][1]);
      }
    } catch {}
  }
  return native;
}

function read() {
  if (cached && Date.now() - sampledAt < 1500) return Promise.resolve(cached);
  pending ??= collect().then(value => { sampledAt = Date.now(); return cached = { ...value, sampledAt }; })
    .finally(() => { pending = undefined; });
  return pending;
}

module.exports = { read };
