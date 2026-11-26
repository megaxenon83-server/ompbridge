const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { createTurnChanges, todoFromEntries } = require('../turn-changes.cjs');

function fixture() {
  const directory = fs.mkdtempSync(path.join(__dirname, '..', '.desktop-test-turns-'));
  const project = path.join(directory, 'project');
  fs.mkdirSync(project);
  return { project, changes: createTurnChanges(path.join(directory, 'vault')), session: path.join(directory, 'session.jsonl') };
}

const edit = (changes, id, file, mutate) => {
  changes.observe(id, { type: 'tool_execution_start', toolCallId: 't', toolName: 'edit', args: { path: file } });
  mutate();
  changes.observe(id, { type: 'tool_execution_end', toolCallId: 't' });
};

test('counts changes against the start of this answer and restores only its files', () => {
  const { project, changes, session } = fixture();
  const file = path.join(project, 'test.txt');
  const added = path.join(project, 'new.txt');
  fs.writeFileSync(file, 'one\nold\n');
  const unrelated = path.join(project, 'unrelated.txt');
  fs.writeFileSync(unrelated, 'mine\n');
  changes.start('a', project, 2);
  edit(changes, 'a', file, () => fs.writeFileSync(file, 'one\nnew\nmore\n'));
  edit(changes, 'a', added, () => fs.writeFileSync(added, 'brand new\n'));
  const card = changes.finish('a', session);
  assert.equal(card.userIndex, 2);
  assert(card.undoable);
  assert.deepEqual(card.files.find(item => item.file === 'test.txt'), { file: 'test.txt', added: 2, removed: 1, truncated: false, verified: true });
  assert.match(changes.diff(session, card.id, 'test.txt').diff, /-old[\s\S]*\+new/);
  assert.equal(changes.list(session).length, 1);
  fs.writeFileSync(unrelated, 'after the turn\n');
  assert(changes.undo(session, project, card.id).undone);
  assert.equal(fs.readFileSync(file, 'utf8'), 'one\nold\n');
  assert(!fs.existsSync(added));
  assert.equal(fs.readFileSync(unrelated, 'utf8'), 'after the turn\n');
});

test('refuses undo on conflicts and never marks unrelated edits as reversible', () => {
  const { project, changes, session } = fixture();
  const file = path.join(project, 'test.txt');
  fs.writeFileSync(file, 'one\n');
  changes.start('a', project, 0);
  edit(changes, 'a', file, () => fs.writeFileSync(file, 'two\n'));
  const card = changes.finish('a', session);
  fs.writeFileSync(file, 'manual\n');
  assert.throws(() => changes.undo(session, project, card.id), /etter svaret/);
  assert.equal(fs.readFileSync(file, 'utf8'), 'manual\n');
  changes.start('b', project, 1);
  fs.writeFileSync(file, 'unattributed\n');
  assert.equal(changes.finish('b', session).undoable, false);
});

test('restores the last successful structured OMP todo state', () => {
  const phases = [{ name: 'Test', tasks: [{ content: 'File diff', status: 'in_progress' }] }];
  assert.deepEqual(todoFromEntries([{ message: { toolName: 'todo', details: { phases } } },
    { message: { toolName: 'todo', isError: true, details: { phases: [] } } }]), phases);
});

test('publishes a stable anchored endringskort before the turn finishes', () => {
  const { project, changes, session } = fixture();
  const file = path.join(project, 'test.txt');
  fs.writeFileSync(file, 'before\n');
  changes.start('live', project, 0);
  edit(changes, 'live', file, () => fs.writeFileSync(file, 'after\n'));
  const first = changes.finish('live', session, 'edit-call');
  assert.equal(first.anchorToolId, 'edit-call');
  assert.equal(first.live, true);
  assert.equal(first.undoable, false);
  assert.equal(first.files[0].added, 1);
  assert.equal(first.files[0].removed, 1);
  assert.deepEqual(changes.list(session), [first]);
  assert.match(changes.diff(session, first.id, 'test.txt').diff, /\+after/);

  edit(changes, 'live', file, () => fs.writeFileSync(file, 'after\nextra\n'));
  const update = changes.finish('live', session, 'later-call');
  assert.equal(update.id, first.id);
  assert.equal(update.anchorToolId, 'edit-call');
  assert.equal(update.files[0].added, 2);
  const final = changes.finish('live', session);
  assert.equal(final.id, first.id);
  assert.equal(final.anchorToolId, 'edit-call');
  assert.equal(final.live, false);
  assert.equal(final.undoable, true);
  assert.deepEqual(changes.list(session), [final]);
});
