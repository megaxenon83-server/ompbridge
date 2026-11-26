const { test } = require('node:test');
const assert = require('node:assert/strict');
const { createServer } = require('node:http');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { inspect, matchLocal, swapMemory, managedForModel } = require('../local-models.cjs');

async function service(handler, t) {
  const server = createServer(async (request, response) => {
    const parts = [];
    for await (const chunk of request) parts.push(chunk);
    const value = handler(request.url, parts.length ? JSON.parse(Buffer.concat(parts)) : undefined);
    response.writeHead(value === undefined ? 404 : 200, { 'Content-Type': 'application/json' });
    response.end(JSON.stringify(value || {}));
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  t.after(() => server.close());
  return 'http://127.0.0.1:' + server.address().port;
}

test('discovers Ollama and Strata and frees memory before loading the next model', async t => {
  let ollamaLoaded = true;
  let strataLoaded = false;
  const events = [];
  const ollamaUrl = await service((route, data) => {
    if (route === '/api/tags') return { models: [{ name: 'model-a' }] };
    if (route === '/api/ps') return { models: ollamaLoaded ? [{ name: 'model-a' }] : [] };
    if (route === '/api/generate') {
      assert.equal(data.model, 'model-a');
      ollamaLoaded = data.keep_alive !== 0;
      events.push(ollamaLoaded ? 'ollama load' : 'ollama unload');
      return {};
    }
  }, t);
  const strataUrl = await service(route => {
    if (route === '/v1/models') return { data: [{ id: 'model-b' }] };
    if (route === '/v1/status') return { loaded: strataLoaded, auto_load: true };
    if (route === '/v1/load') { strataLoaded = true; events.push('strata load'); return {}; }
    if (route === '/v1/unload') { strataLoaded = false; events.push('strata unload'); return {}; }
  }, t);
  const [ollama] = await inspect(ollamaUrl);
  const [strata] = await inspect(strataUrl);
  assert.equal(matchLocal({ id: 'model-a', provider: 'ollama', baseUrl: ollama.baseUrl }, [ollama, strata]), ollama);
  await swapMemory(ollama, strata);
  assert.deepEqual(events, ['ollama unload', 'strata load']);
  await swapMemory(strata, ollama);
  assert.deepEqual(events, ['ollama unload', 'strata load', 'strata unload', 'ollama load']);
  await assert.rejects(swapMemory(ollama, { ...strata, origin: ollamaUrl }), /HTTP 404/);
  assert.equal(ollamaLoaded, true);
});

test('discovers llama.cpp router and uses model-specific endpoints', async t => {
  let loaded = false;
  const origin = await service((route, data) => {
    if (route === '/props') return { role: 'router' };
    if (route === '/v1/models') return { data: [{ id: 'router-model', status: { value: loaded ? 'loaded' : 'unloaded' } }] };
    if (route.startsWith('/models/')) {
      assert.equal(data.model, 'router-model');
      loaded = route === '/models/load';
      return {};
    }
  }, t);
  const [model] = await inspect(origin);
  assert.equal(model.mode, 'router');
  await swapMemory(null, model);
  assert.equal(loaded, true);
  await swapMemory(model, null);
  assert.equal(loaded, false);
  await swapMemory(null, model);
  await swapMemory({ ...model, mode: 'fixed' }, null);
  assert.equal(loaded, true);
});

test('recognizes a managed llama.cpp configuration written by Windows PowerShell', t => {
  const folder = fs.mkdtempSync(path.join(os.tmpdir(), 'omp-models-'));
  const previousFile = process.env.OMP_DESKTOP_MANAGED_SERVERS;
  process.env.OMP_DESKTOP_MANAGED_SERVERS = path.join(folder, 'servers.json');
  t.after(() => {
    if (previousFile) process.env.OMP_DESKTOP_MANAGED_SERVERS = previousFile;
    else delete process.env.OMP_DESKTOP_MANAGED_SERVERS;
    fs.unlinkSync(path.join(folder, 'servers.json'));
    fs.rmdirSync(folder);
  });
  const entry = { provider: 'ornith', modelId: 'ornith-1.5', healthUrl: 'http://127.0.0.1:8089/health' };
  fs.writeFileSync(process.env.OMP_DESKTOP_MANAGED_SERVERS, '\uFEFF' + JSON.stringify({ servers: [entry] }));
  assert.deepEqual(managedForModel({ provider: 'ornith', id: 'ornith-1.5' }), entry);
  assert.deepEqual(managedForModel({ baseUrl: 'http://127.0.0.1:8089/v1' }), entry);
  assert.deepEqual(managedForModel({ origin: 'http://127.0.0.1:8089', mode: 'fixed' }), entry);
  assert.equal(managedForModel({ baseUrl: 'http://127.0.0.1:80890/v1' }), null);
});
