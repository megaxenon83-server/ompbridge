const assert = require('node:assert/strict');
const { test } = require('node:test');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const vm = require('node:vm');
const { createHash } = require('node:crypto');
const { pathToFileURL } = require('node:url');
const source = '../../windows/bridge/';
const catalog = require(source + 'skill-catalog.cjs');
const { createSkillLibrary } = require(source + 'skill-library.cjs');
const { createSkillsPortal } = require('../skills-portal.cjs');

test('skills.sh clipboard commands resolve without running a shell', () => {
  const escaped = 'https' + String.fromCharCode(92) + '://github.com/anthropics/skills';
  assert.equal(catalog.parseRef('npx skills add ' + escaped + ' --skill frontend-design'), 'anthropics/skills/frontend-design');
  assert.equal(catalog.parseRef('npx skills add https://github.com/anthropics/skills.git --skill=frontend-design'), 'anthropics/skills/frontend-design');
  assert.throws(() => catalog.parseRef('npx skills add https://github.com/anthropics/skills --skill frontend-design && calc'));
  assert.throws(() => catalog.parseRef('npx skills add https://github.com.fake.invalid/anthropics/skills --skill frontend-design'));
});

test('catalogue, projects, global override, revision history and reproducible lock', async t => {
  const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'omp-skill-test-'));
  t.after(() => fs.rmSync(temp, { force: true, recursive: true }));
  const first = path.join(temp, 'first');
  const second = path.join(temp, 'second');
  const third = path.join(temp, 'third');
  for (const dir of [first, second, third]) fs.mkdirSync(dir);
  const a = 'a'.repeat(40);
  const b = 'b'.repeat(40);
  let head = a;
  const known = [first, second, third];
  const markdown = sha => '---\nname: example\ndescription: Example\n---\nRevision ' + sha[0] + '\n';
  const original = global.fetch;
  t.after(() => { global.fetch = original; });
  global.fetch = async url => {
    if (url.endsWith('/commits/HEAD')) return Response.json({ sha: head });
    const sha = url.match(/[ab]{40}/)?.[0];
    if (!sha) return new Response('', { status: 404 });
    const body = markdown(sha);
    if (url.startsWith('https://raw.githubusercontent.com/')) return new Response(body);
    const digest = createHash('sha1').update('blob ' + Buffer.byteLength(body) + '\0').update(body).digest('hex');
    return Response.json({ tree: [{ type: 'blob', mode: '100644', path: 'skills/example/SKILL.md', sha: digest }] });
  };
  const lib = createSkillLibrary(path.join(temp, 'managed'), () => ({}));
  const action = (cwd, action, input) => lib.change(cwd, { action, ...input }, [], known);
  const ref = 'sample/repo/example';
  const install = async (cwd, scope, pinned, restoreEnabled) => {
    const preview = await catalog.preview(cwd, ref, pinned);
    return action(cwd, 'install-skill', { scope, target: preview.ticket, restoreEnabled });
  };
  assert.throws(() => catalog.parseRef('https://untrusted.invalid/sample/repo/example'));
  await assert.rejects(() => catalog.preview(first, 'sample/repo/missing'));
  const preview = await catalog.preview(first, 'https://skills.sh/' + ref);
  await assert.rejects(action(second, 'install-skill', { scope: 'project', target: preview.ticket }), /forhåndsvisningen/);
  await action(first, 'install-skill', { scope: 'global', target: preview.ticket });
  assert.equal(lib.list(second)[0].enabled, false);
  await action(first, 'set-skill', { scope: 'global', name: 'example', enabled: true });
  assert.equal(lib.list(second)[0].enabled, true);
  await action(second, 'set-skill', { scope: 'project', name: 'example', enabled: false });
  assert.equal(lib.list(second)[0].enabled, false);
  assert.deepEqual(lib.summary(first, known).items[0].affected.sort(), [first, third].sort());
  await action(second, 'set-skill', { scope: 'project', name: 'example', enabled: null });
  head = b;
  await install(first, 'project');
  assert.equal(lib.list(first)[0].sha, b);
  assert.equal(lib.list(second)[0].sha, a);
  assert.match(lib.installedMarkdown(first, 'example', 'project'), /Revision b/);
  await action(first, 'set-skill', { scope: 'project', name: 'example', enabled: true });
  await action(first, 'write-lock');
  fs.copyFileSync(path.join(first, 'omp-skills.lock.json'), path.join(third, 'omp-skills.lock.json'));
  const [locked] = lib.summary(third).lock;
  assert.equal(locked.matches, false);
  await install(third, 'project', locked.sha, locked.enabled);
  assert.equal(lib.summary(third).lock[0].matches, true);
  const skills = [{ ref, sha: b, enabled: true }];
  const { pack } = await action(first, 'save-pack', { label: 'Fixture', skills });
  assert.deepEqual(pack.skills, skills);
  await install(second, 'global');
  assert.equal(lib.list(second)[0].sha, b);
  await action(second, 'rollback-skill', { scope: 'global', name: 'example' });
  assert.equal(lib.list(second)[0].sha, a);
  await assert.rejects(action(second, 'remove-skill', { scope: 'global', name: 'example', affected: [] }), /endret seg/);
  const affected = lib.summary(second, known).items[0].affected;
  await action(second, 'remove-skill', { scope: 'global', name: 'example', affected });
  assert.equal(lib.list(second).length, 0);
  assert.equal(lib.list(third)[0].scope, 'project');
});

test('localhost portal checks origin and per-page access and serves the skills UI', async t => {
  const portal = createSkillsPortal();
  t.after(() => portal.close());
  const url = new URL(await portal.open(input => ({ action: input.action, project: 'Fixture' })));
  assert.equal(url.hostname, '127.0.0.1');
  const page = await fetch(url.origin);
  assert.match(await page.text(), /Bla gjennom skills.sh/);
  assert.match(page.headers.get('content-security-policy'), /frame-ancestors 'none'/);
  const invoke = (origin, key, action) => fetch(url.origin + '/api', {
    method: 'POST', headers: { Origin: origin, 'X-OMP-Page': key, 'Content-Type': 'application/json' },
    body: JSON.stringify({ action })
  });
  assert.equal((await invoke(url.origin, '', 'catalog')).status, 403);
  assert.equal((await invoke('https://outside.invalid', url.hash.slice(1), 'catalog')).status, 403);
  assert.equal((await invoke(url.origin, url.hash.slice(1), 'exec')).status, 400);
  const done = await invoke(url.origin, url.hash.slice(1), 'catalog');
  assert.deepEqual(await done.json(), { action: 'catalog', project: 'Fixture' });
});

test('token meter uses OMP totals, cache usage and unique message IDs', () => {
  const context = { window: {} };
  vm.runInNewContext(fs.readFileSync(path.join(__dirname, '../android/assets/turn-ui.js'), 'utf8'), context);
  const { usageTotals } = context.window.ompTurnUI;
  const last = { id: '2', role: 'assistant', usage: { input: 12, output: 4, cacheRead: 80, cacheWrite: 2 } };
  const result = usageTotals([{ role: 'user' }, { id: '1', role: 'assistant', usage: { totalTokens: 52, input: 51, output: 1 } },
    last, last, { role: 'assistant' }]);
  assert.equal(result.tokens, 150);
  assert.equal(result.input, 63);
  assert.equal(result.output, 5);
  assert.equal(result.cacheRead, 80);
  assert.equal(result.cacheWrite, 2);
  assert.equal(result.last, 98);
  assert.equal(result.calls, 2);
});

test('plugin self-tests read safely and expose both pass and failure', async t => {
  const cwd = fs.mkdtempSync(path.join(os.tmpdir(), 'omp-plugin-test-'));
  t.after(() => fs.rmSync(cwd, { force: true, recursive: true }));
  const { testProjectPlugin } = await import(pathToFileURL(path.resolve(__dirname, source, 'project-plugins.mjs')).href);
  fs.writeFileSync(path.join(cwd, 'PROJECT_STATUS.md'), 'Original');
  assert.match(await testProjectPlugin('agent-memory', cwd), /kontekst/);
  assert.match(await testProjectPlugin('project-status', cwd), /skrevet og lest/);
  assert.equal(fs.readFileSync(path.join(cwd, 'PROJECT_STATUS.md'), 'utf8'), 'Original');
  await assert.rejects(testProjectPlugin('git-overview', cwd));
});
