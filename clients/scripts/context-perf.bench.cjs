'use strict';
// Measures the conversation render path at a realistic 100k-token context.
//
// Why: both clients rebuild the whole transcript on every animation frame while
// OMP streams. Cost per frame therefore grows with the context, and at ~100k
// tokens the UI spends every frame re-creating hundreds of DOM nodes. This bench
// runs the real turn-ui.js against a small DOM shim and compares:
//   legacy : container.replaceChildren() + rebuild every row (current clients)
//   sync   : window.ompTurnUI.syncRows(...) which reuses unchanged rows
//
// Run: node clients/scripts/context-perf.bench.cjs
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

let created = 0;
let textChars = 0;
class FakeNode {
  constructor(tag) {
    created++;
    this.tagName = String(tag || '').toUpperCase();
    this.children = [];
    this.dataset = {};
    this.attributes = new Map();
    this.className = '';
    this.hidden = false;
    this.open = false;
    this.text = '';
    this.style = {};
    this.classList = {
      add: () => {}, remove: () => {}, toggle: () => {}, contains: () => false,
    };
  }
  get textContent() { return this.text; }
  set textContent(value) { this.text = String(value ?? ''); textChars += this.text.length; }
  get innerHTML() { return ''; }
  set innerHTML(value) { this.text = String(value ?? ''); textChars += this.text.length; }
  get lastElementChild() { return this.children[this.children.length - 1] || null; }
  get isConnected() { return true; }
  append(...nodes) {
    for (const node of nodes) {
      if (node == null) continue;
      if (typeof node === 'string') { const text = new FakeNode('#text'); text.text = node; this.children.push(text); continue; }
      node.parent = this;
      this.children.push(node);
    }
  }
  replaceChildren(...nodes) { this.children = []; this.append(...nodes); }
  remove() {
    this.removed = true;
    if (this.parent) {
      const index = this.parent.children.indexOf(this);
      if (index >= 0) this.parent.children.splice(index, 1);
    }
  }
  setAttribute(name, value) { this.attributes.set(name, String(value)); }
  getAttribute(name) { return this.attributes.get(name) ?? null; }
  querySelector() { return null; }
  querySelectorAll() { return []; }
  focus() {}
  scrollIntoView() {}
  getClientRects() { return [1]; }
  getBoundingClientRect() { return { top: 0, bottom: 0, left: 0, right: 0, height: 0 }; }
  appendChild(node) { this.append(node); return node; }
  addEventListener() {}
  closest() { return null; }
}

const document = {
  documentElement: { lang: 'nb' },
  createElement: tag => new FakeNode(tag),
  createElementNS: (ns, tag) => new FakeNode(tag),
  createTextNode: text => { const node = new FakeNode('#text'); node.text = text; return node; },
  querySelector: () => null,
  querySelectorAll: () => [],
};
const window = {};
const localStorage = { getItem: () => null, setItem: () => {} };
const context = { window, document, localStorage, CSS: { escape: value => value }, ResizeObserver: undefined,
  Intl, JSON, console, crypto, setTimeout, clearTimeout, requestAnimationFrame: fn => fn() };
vm.createContext(context);
const source = fs.readFileSync(path.join(__dirname, '..', 'android', 'assets', 'turn-ui.js'), 'utf8');
vm.runInContext(source, context);
const turnUI = window.ompTurnUI;
if (!turnUI) throw new Error('turn-ui.js did not expose window.ompTurnUI');

// --- synthetic 100k-token transcript ---------------------------------------
// ~4 chars per token, which is the usual ratio for a mixed code/chat transcript.
const totalChars = 400_000;
const messages = [];
let written = 0;
let turn = 0;
while (written < totalChars) {
  turn++;
  const user = 'Oppgave ' + turn + ': ' + 'forklar hvordan dette henger sammen. '.repeat(6);
  const answer = ('Dette er svaret for oppgave ' + turn + '. ').repeat(90) + '\n\n```js\nconst x = 1;\n```\n';
  messages.push({ id: 'u' + turn, role: 'user', text: user, timestamp: turn * 1000, status: 'done' });
  messages.push({ id: 'a' + turn, role: 'assistant', text: answer, timestamp: turn * 1000 + 500,
    status: 'done', usage: { input: 1000, output: 200, totalTokens: 1200 } });
  written += user.length + answer.length;
  if (turn % 5 === 0) {
    const output = 'filinnhold '.repeat(80);
    messages.push({ id: 't' + turn, role: 'tool', toolCallId: 'c' + turn, toolName: 'read',
      text: output, status: 'done' });
    written += output.length;
  }
}

const buildRow = (entry, index) => {
  if (entry.role === 'tool') {
    const node = new FakeNode('details');
    node.append(new FakeNode('summary'), new FakeNode('pre'));
    return node;
  }
  if (!entry.text && !entry.segments?.some(block => block.text)) return null;
  const row = new FakeNode('article');
  row.append(new FakeNode('small'));
  turnUI.appendSegments(row, entry, 'r:' + (entry.id || index), text => {
    const block = new FakeNode('p');
    block.textContent = text;
    row.append(block);
  });
  const group = new FakeNode('div');
  group.append(row, new FakeNode('div'));
  return group;
};
const skip = item => !(item.role === 'tool' || item.text || item.segments?.some(block => block.text));

function legacyRender(container, entries) {
  container.replaceChildren();
  for (const [index, entry] of entries.entries()) {
    const row = buildRow(entry, index);
    if (!row) continue;
    row.dataset.scrollKey = turnUI.scrollEntryKey(entry, index);
    container.append(row);
  }
}
function syncRender(container, entries) {
  if (typeof turnUI.syncRows !== 'function') throw new Error('turn-ui.js is missing syncRows');
  turnUI.syncRows(container, entries, { skip, build: buildRow });
}

function stream(render, frames) {
  const container = new FakeNode('div');
  const list = [...messages];
  const live = { id: 'stream', role: 'assistant', text: '', timestamp: 999999 };
  const charsBefore = textChars;
  const started = process.hrtime.bigint();
  for (let frame = 0; frame < frames; frame++) {
    live.text = ('Nytt svar som vokser med hvert token. '.repeat(20)).slice(0, Math.min(4000, frame * 40));
    render(container, turnUI.timeline([...list, live], [], []));
  }
  const ns = Number(process.hrtime.bigint() - started);
  return { ms: ns / 1e6 / frames, rows: container.children.length, chars: (textChars - charsBefore) / frames };
}

const frames = 120;
const before = created;
const legacy = stream(legacyRender, frames);
const legacyNodes = created - before;
if (typeof turnUI.syncRows !== 'function') {
  console.log('legacy full rebuild : ' + legacy.ms.toFixed(2) + ' ms/frame  (' + legacy.rows + ' rows, ' +
    legacyNodes + ' nodes, ' + Math.round(legacy.chars / 1000) + 'k text chars per frame)');
  console.log('syncRows is not implemented yet - baseline only.');
  process.exit(0);
}
const createdBefore = created;
const sync = stream(syncRender, frames);
const syncNodes = created - createdBefore;

console.log('transcript: ' + messages.length + ' messages, ' + Math.round(written / 1000) + 'k chars (~' +
  Math.round(written / 4 / 1000) + 'k tokens)');
console.log('frames measured: ' + frames);
console.log('');
console.log('legacy full rebuild : ' + legacy.ms.toFixed(2) + ' ms/frame  (' + legacy.rows + ' rows re-created every frame, ' +
  legacyNodes + ' nodes, ' + Math.round(legacy.chars / 1000) + 'k text chars)');
console.log('syncRows            : ' + sync.ms.toFixed(2) + ' ms/frame  (' + sync.rows + ' rows kept, ' + syncNodes +
  ' nodes, ' + Math.round(sync.chars / 1000) + 'k text chars)');
console.log('speed-up            : ' + (legacy.ms / sync.ms).toFixed(1) + 'x');
if (sync.ms > legacy.ms) { console.error('REGRESSION: syncRows slower'); process.exit(1); }
