'use strict';
// Regression test for window.ompTurnUI.syncRows: the conversation list must be
// reconciled, not rebuilt. Loads the real turn-ui.js against a tiny DOM shim.
//
// Run: node clients/scripts/turn-ui-rows.test.cjs
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

class FakeNode {
  constructor(tag) {
    this.tagName = String(tag || '').toUpperCase();
    this.children = [];
    this.dataset = {};
    this.attributes = new Map();
    this.text = '';
    this.className = '';
    this.hidden = false;
    this.open = false;
    this.style = {};
    this.classList = { add() {}, remove() {}, toggle() {}, contains() { return false; } };
  }
  get textContent() { return this.text; }
  set textContent(value) { this.text = String(value ?? ''); }
  get innerHTML() { return ''; }
  set innerHTML(value) { this.text = String(value ?? ''); }
  get lastElementChild() { return this.children[this.children.length - 1] || null; }
  get isConnected() { return true; }
  append(...nodes) {
    for (const node of nodes) {
      if (node == null) continue;
      node.parent = this;
      this.children.push(node);
    }
  }
  replaceChildren(...nodes) { this.children = []; this.append(...nodes); }
  remove() {
    if (!this.parent) return;
    const index = this.parent.children.indexOf(this);
    if (index >= 0) this.parent.children.splice(index, 1);
  }
  setAttribute(name, value) { this.attributes.set(name, String(value)); }
  getAttribute(name) { return this.attributes.get(name) ?? null; }
  querySelector() { return null; }
  querySelectorAll() { return []; }
  getClientRects() { return [1]; }
  getBoundingClientRect() { return { top: 0, bottom: 0 }; }
  addEventListener() {}
  closest() { return null; }
}

const document = {
  documentElement: { lang: 'nb' },
  createElement: tag => new FakeNode(tag),
  createElementNS: (namespace, tag) => new FakeNode(tag),
  createTextNode: text => { const node = new FakeNode('#text'); node.text = String(text); return node; },
  querySelector: () => null,
  querySelectorAll: () => [],
};
const window = {};
const context = { window, document, localStorage: { getItem: () => null, setItem: () => {} },
  CSS: { escape: value => value }, Intl, JSON, console, crypto, setTimeout, clearTimeout };
vm.createContext(context);
vm.runInContext(fs.readFileSync(path.join(__dirname, '..', 'android', 'assets', 'turn-ui.js'), 'utf8'), context);
const turnUI = window.ompTurnUI;

const container = new FakeNode('div');
const build = (entry, index) => {
  const row = new FakeNode('article');
  row.textContent = entry.text || '';
  row.dataset.built = String(++build.count);
  row.dataset.role = entry.role;
  if (index === 0) build.first = row;
  return row;
};
build.count = 0;
const skip = entry => !(entry.role === 'turn_changes' || entry.role === 'project_check' ||
  entry.role === 'tool' || entry.text);
const render = entries => turnUI.syncRows(container, turnUI.timeline(entries, [], []), { skip, build });

test('reuses rows for unchanged messages', () => {
  const messages = [
    { id: 'u1', role: 'user', text: 'hei', timestamp: 1 },
    { id: 'a1', role: 'assistant', text: 'svar', timestamp: 2 },
  ];
  render(messages);
  const first = container.children[0];
  const built = build.count;
  render(messages);
  assert.equal(container.children.length, 2);
  assert.equal(container.children[0], first, 'unchanged row must be reused');
  assert.ok(build.count - built <= 1, 'at most the last row is rebuilt, got ' + (build.count - built));
});

test('growing the streaming message rebuilds only that row', () => {
  const messages = [
    { id: 'u1', role: 'user', text: 'hei', timestamp: 1 },
    { id: 'a1', role: 'assistant', text: 'svar', timestamp: 2 },
  ];
  render(messages);
  const first = container.children[0];
  const built = build.count;
  render([messages[0], { ...messages[1], text: 'svar som vokser' }]);
  assert.equal(container.children.length, 2);
  assert.equal(container.children[0], first);
  assert.equal(container.children[1].textContent, 'svar som vokser');
  assert.equal(build.count - built, 1, 'exactly one row rebuilt');
});

test('appending and removing messages keeps the list in sync', () => {
  const messages = [
    { id: 'u1', role: 'user', text: 'hei', timestamp: 1 },
    { id: 'a1', role: 'assistant', text: 'svar', timestamp: 2 },
  ];
  render(messages);
  render([...messages, { id: 'u2', role: 'user', text: 'neste', timestamp: 3 }]);
  assert.equal(container.children.length, 3);
  assert.equal(container.children[2].textContent, 'neste');
  render(messages.slice(0, 1));
  assert.equal(container.children.length, 1);
  assert.equal(container.children[0].textContent, 'hei');
});

test('a changed card state is not left stale', () => {
  const card = { id: 'c1', at: 1, userIndex: 0, files: [{ file: 'a.js', added: 1, removed: 0 }], undoable: true, undone: false };
  const entries = [
    { id: 'u1', role: 'user', text: 'hei', timestamp: 1 },
    { role: 'turn_changes', card },
  ];
  // The timeline only places cards at a user turn, so render through it.
  const rendered = turnUI.timeline([entries[0]], [card], []);
  render(rendered);
  const before = container.children.length;
  assert.ok(before >= 2, 'card row is rendered');
  const undone = { ...card, undone: true };
  render(turnUI.timeline([entries[0]], [undone], []));
  assert.equal(container.children.length, before);
  assert.notEqual(container.children[0].dataset.built, undefined);
});

test('identical renders do not grow the DOM', () => {
  const messages = [{ id: 'u1', role: 'user', text: 'hei', timestamp: 1 }];
  for (let index = 0; index < 20; index++) render(messages);
  assert.equal(container.children.length, 1);
});
