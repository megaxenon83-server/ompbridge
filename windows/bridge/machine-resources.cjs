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
      const { stdout } = await exec('nvidia-smi', ['--query-gpu=uuid,name,temperature.gpu,memory.used,memory.total,utilization.gpu', '--format=csv,noheader,nounits'],
        { timeout: 1200, windowsHide: true });
      const key = name => name.trim().toLowerCase().replace(/^nvidia /, '');
      const metric = value => /^\d+(?:\.\d+)?$/.test(value) ? Number(value) : null;
      const mib = value => metric(value) == null ? null : metric(value) * 1048576;
      const physicalCards = new Map();
      for (const line of stdout.trim().split(/\r?\n/)) {
        const [id, name, temperature, used, total, load] = line.split(',').map(value => value.trim());
        if (!id.startsWith('GPU-') || !name) continue;
        physicalCards.set(id, { id, name, vendor: 0x10de, temperature: metric(temperature),
          used: mib(used), total: mib(total), load: metric(load) });
      }
      const cards = [...physicalCards.values()];
      const nativeNvidia = native.gpus.filter(gpu => gpu.vendor === 0x10de);
      for (const card of cards) {
        const name = key(card.name);
        // Windows can expose aliases of one physical card with different LUIDs.
        // Avoid borrowing a Windows counter when multiple physical cards share a name.
        if (cards.filter(item => key(item.name) === name).length !== 1) continue;
        const matches = nativeNvidia.filter(gpu => key(gpu.name) === name);
        const dxgi = matches.find(gpu => gpu.used != null) || matches[0];
        card.total ??= dxgi?.total ?? null;
        card.used ??= dxgi?.used ?? null;
        card.load ??= dxgi?.load ?? null;
      }
      native.gpus = native.gpus.filter(gpu => gpu.vendor !== 0x10de ||
        !cards.some(card => key(card.name) === key(gpu.name))).concat(cards);
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
