const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const path = require('node:path');
const { setTimeout: delay } = require('node:timers/promises');
const { test } = require('node:test');
const vm = require('node:vm');

test('cloud prompts bypass local loading, and cancelling a queued local prompt does not affect the owner', async () => {
  const source = readFileSync(path.join(__dirname, '../../windows/bridge/omp-bridge.mjs'), 'utf8');
  let finishLoad;
  const loading = new Promise(resolve => { finishLoad = resolve; });
  const unloaded = [];
  let locked = false;
  const context = vm.createContext({
    setTimeout,
    crypto: { randomUUID: () => 'test-operation' },
    localCatalogExpires: Infinity,
    localCatalog: [],
    localModels: {
      managedForModel: () => false,
      discoverLocal: async () => [],
      matchLocal: model => model,
      readResident: () => null,
      saveResident: () => {},
      acquireGpu: async () => {
        if (locked) throw Object.assign(new Error('GPU busy'), { code: 'GPU_BUSY' });
        locked = true;
        return () => { locked = false; };
      },
      swapMemory: async (previous, next) => { unloaded.push([previous?.id, next.id]); await loading; }
    }
  });
  vm.runInContext(source.slice(source.indexOf('async function prepareChatModel('), source.indexOf('const refreshingWorkspaces')), context);
  const runtime = (id, baseUrl) => ({ state: { model: { id, baseUrl } }, working: true, broadcast() {} });
  const local = runtime('first', 'http://127.0.0.1:11434');
  const queued = runtime('second', 'http://127.0.0.1:11434');
  const cloud = runtime('cloud', 'https://provider.invalid');
  const first = context.prepareChatModel(local);
  try {
    const waiting = context.prepareChatModel(queued);
    const cancelled = assert.rejects(waiting, /Oppgaven ble avbrutt/);
    await delay(5);
    assert.equal(queued.modelPreparation.queued, true);
    await context.prepareChatModel(cloud);
    await context.prepareChatModel(cloud, cloud.state.model, { selection: true });
    const switching = runtime('third', 'http://127.0.0.1:11434');
    await assert.rejects(context.prepareChatModel(switching, switching.state.model, { selection: true }), /lokal modell jobber/);
    assert.equal(local.modelPreparation.cancelled, false);
    queued.modelPreparation.cancelled = true;
    await cancelled;
    assert.equal(local.working, true);
    assert.deepEqual(unloaded, [[undefined, 'first']]);
    assert.equal(locked, true);
  } finally {
    finishLoad();
    await first;
  }
});
