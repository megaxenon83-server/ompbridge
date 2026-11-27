'use strict';

if (!Element.prototype.replaceChildren) {
  Element.prototype.replaceChildren = function (...children) {
    while (this.firstChild) this.removeChild(this.firstChild);
    this.append(...children);
  };
}

const $ = id => document.getElementById(id);
const pending = new Map();
const bridge = window.Native;
const messageActions = window.ompTurnUI.messageActions({
  copy: text => {
    if (!bridge.copyMessage(text)) throw new Error('Meldingen kunne ikke kopieres.');
  },
  speak: (id, text) => bridge.readMessage(id, text),
  stop: () => bridge.stopReading(),
  report: error => status(error.message || error)
});
window.onMessageSpeech = messageActions.complete;
function storedValue(key, fallback) {
  try { return JSON.parse(localStorage.getItem(key)) ?? fallback; }
  catch { return fallback; }
}
const readDrafts = () => {
  try { return JSON.parse(bridge.readDrafts()); }
  catch { return storedValue('threadDrafts', []); }
};
const drafts = new Map(readDrafts());
let recentFolders = storedValue('recentFolders', []);
let requestId = 0;
let origin = bridge.origin();
const workspaceStorage = address => 'pcWorkspace:' + address;
const initialWorkspace = origin ? storedValue(workspaceStorage(origin), { cwd: localStorage.getItem('cwd'), file: localStorage.getItem('file') }) : {};
let cwd = initialWorkspace.cwd || '';
let activeFile = initialWorkspace.file || '';
let activeTitle = '';
let model;
let nextModel;
let sessions = [];
let projects = [];
let sharedWorkspace = false;
let history = [];
let live = [];
let streaming = false;
let workPhase = '';
let recoveryFailure = '';
let lightContext;
let chatMode;
let currentProfile;
let submitting = false;
let sendFailure = '';
let runtimeFile = '';
let contextUsage = null;
let activeModelPhase = null;
let streamRoute = '';
let reconnectTimer;
let selection = 0;
let attachment;
let polling = false;
let approvalId;
let recovering = false;
let todos = [];
let turnCards = [];
let projectChecks = [];
let requestedCheck;
let refreshingTurns = false;
const expandedFolders = new Map();

function node(tag, text, attributes = {}) {
  const result = document.createElement(tag);
  if (text !== undefined && text !== null) result.textContent = text;
  for (const [key, value] of Object.entries(attributes)) result.setAttribute(key, value);
  return result;
}

function button(text, action, className = '') {
  const result = node('button', text, { type: 'button', class: className });
  result.onclick = () => Promise.resolve().then(action).catch(error => status(error.message));
  return result;
}

function addIcon(target, name) {
  const namespace = 'http://www.w3.org/2000/svg';
  const icon = document.createElementNS(namespace, 'svg');
  const reference = document.createElementNS(namespace, 'use');
  icon.setAttribute('class', 'ui-icon');
  icon.setAttribute('aria-hidden', 'true');
  icon.setAttribute('viewBox', '0 0 24 24');
  reference.setAttribute('href', '#i-' + name);
  icon.append(reference);
  target.prepend(icon);
  return target;
}

function api(path, args, data, method = data === undefined ? 'GET' : 'POST') {
  const route = args ? path + '?' + new URLSearchParams(args) : path;
  const id = String(++requestId);
  return new Promise((resolve, reject) => {
    pending.set(id, { resolve, reject });
    bridge.request(id, method, route, data === undefined ? '' : JSON.stringify(data), origin);
  });
}

window.complete = (id, payload, error) => {
  const request = pending.get(id);
  pending.delete(id);
  if (!request) return;
  if (error) request.reject(new Error(error));
  else {
    try { request.resolve(JSON.parse(payload)); }
    catch (failure) { request.reject(failure); }
  }
};

const pathName = path => path?.split(/[\\/]/).filter(Boolean).pop() || '';
const same = (a, b) => !!a && !!b && a.replace(/\\/g, '/').toLowerCase() === b.replace(/\\/g, '/').toLowerCase();
const computers = () => JSON.parse(bridge.computers?.() || '[]');
let savedComputers = computers();
const computerName = () => savedComputers.find(item => item.active)?.name || '';
const status = text => { $('status').textContent = text || ''; };
const reconnectStatus = 'Kobler til Bridge igjen …';
const route = () => cwd ? '/api/events?' + new URLSearchParams({ cwd, ...(runtimeFile || activeFile ? { file: runtimeFile || activeFile } : {}) }) : '';
const draftKey = () => origin + '\n' + (activeFile || cwd);

let draftTimer;
function saveDraft(key, text) {
  drafts.delete(key);
  if (text) drafts.set(key, text.slice(0, 50000));
  while (drafts.size > 20) drafts.delete(drafts.keys().next().value);
  // Debounce the disk write: typing used to re-serialise and fsync every draft
  // on each keystroke, on the JS bridge thread.
  clearTimeout(draftTimer);
  draftTimer = setTimeout(flushDrafts, 400);
}

function flushDrafts() {
  draftTimer = undefined;
  if (!bridge.writeDrafts(JSON.stringify([...drafts]))) {
    status('Utkastene er for store til å lagres på enheten.');
  }
}

const themes = [
  ['omp', 'OMP · grønn', false],
  ['claude', 'Claude Code-inspirert', false],
  ['graphite', 'Grafitt · mørk', true],
  ['midnight', 'Midnatt · mørk', true],
  ['forest', 'Dyp skog · mørk', true],
  ['amethyst', 'Ametyst · mørk', true],
  ['bluehour', 'Blåtime · mørk', true],
  ['codex', 'Codex-inspirert · mørk', true],
  ['paper', 'Papir · lys', false],
  ['frost', 'Frost · lys', false],
  ['custom', 'Egendefinert', false]
];
const appearanceDefaults = { theme: 'omp', customMode: 'dark', accentHue: 162, accentSaturation: 52, backgroundHue: 215, textSize: 100,
  uiFont: '', codeFont: '' };
const appearance = { ...appearanceDefaults };
for (const key of Object.keys(appearance)) {
  const value = localStorage.getItem(key);
  if (value !== null) appearance[key] = typeof appearance[key] === 'number' ? Number(value) : value;
}
const chromeColor = document.createElement('canvas').getContext('2d');

function applyAppearance() {
  const root = document.documentElement;
  const [theme, , presetDark] = themes.find(([id]) => id === appearance.theme) || themes[0];
  const dark = theme === 'custom' ? appearance.customMode === 'dark' : presetDark;
  root.dataset.theme = theme;
  root.dataset.mode = dark ? 'dark' : 'light';
  root.style.setProperty('--text-scale', appearance.textSize / 100);
  root.style.setProperty('--accent-hue', appearance.accentHue);
  root.style.setProperty('--accent-saturation', appearance.accentSaturation + '%');
  root.style.setProperty('--background-hue', appearance.backgroundHue);
  const font = (value, fallback) => /^[\p{L}\p{N} _.-]{1,64}$/u.test(value) ? JSON.stringify(value) + ', ' + fallback : fallback;
  root.style.setProperty('--ui-font', font(appearance.uiFont || (theme === 'codex' ? 'OpenAI Sans' : theme === 'claude' ? 'Poppins' : ''), 'system-ui, sans-serif'));
  root.style.setProperty('--code-font', font(appearance.codeFont, 'monospace'));
  chromeColor.fillStyle = getComputedStyle(root).getPropertyValue('--bg').trim();
  bridge.chrome(chromeColor.fillStyle, dark);
}

function appearanceSetting(key, value) {
  appearance[key] = value;
  localStorage.setItem(key, value);
  applyAppearance();
}

function watch() {
  clearTimeout(reconnectTimer);
  streamRoute = origin ? route() : '';
  bridge.stream(streamRoute, origin);
}

let streamRetries = 0;
window.onStreamEnded = () => {
  clearTimeout(reconnectTimer);
  if (streamRoute && origin) {
    // Exponential backoff: a revoked pairing retried every 1.6 s would keep the
    // radio busy forever. Once we pass a few attempts, wait before retrying.
    streamRetries = Math.min(streamRetries + 1, 6);
    reconnectTimer = setTimeout(() => { watch(); recoverRuntime().catch(() => {}); }, 1600 * 2 ** streamRetries);
  }
  refresh(false).catch(() => {});
  if (origin && !sendFailure) status(reconnectStatus);
};

window.onPairingRequired = () => {
  clearTimeout(reconnectTimer);
  streamRoute = '';
  status('Bridge avviste koblingen. Skann en ny QR-kode fra OMP Desktop.');
  showSettings();
};

function showDrawer(show) {
  $('drawer').hidden = $('scrim').hidden = !show;
  if (show) {
    drawThreads();
    refresh(false).catch(error => status(error.message));
  }
}

function sheet(title) {
  showDrawer(false);
  $('sheetTitle').textContent = title;
  const body = $('sheetBody');
  body.replaceChildren();
  body.scrollTop = 0;
  if (!$('sheet').open) $('sheet').showModal();
  return body;
}

function input(label, attrs) {
  const wrapper = node('label', label, { class: 'field' });
  const field = node('input', null, attrs);
  wrapper.append(field);
  return [wrapper, field];
}

function generationKey() {
  return activeFile && 'android:' + origin + ':' + activeFile;
}

function renderWorkIndicator() {
  const working = activeFile && sessions.some(item => same(item.file, activeFile) && item.activity === 'working');
  const active = submitting || streaming || working || !!activeModelPhase;
  const label = activeModelPhase ? window.ompTurnUI.modelProgress(activeModelPhase) : workPhase || 'OMP arbeider';
  if ($('workLabel').textContent !== label) $('workLabel').textContent = label;
  $('generationRow').hidden = !active;
  const rate = window.ompTurnUI.speedButton(window.ompTurnUI.generation(generationKey()), $('tokenUsage'));
  const speed = $('generationSpeed');
  if ((rate?.textContent || '') !== speed.textContent) speed.replaceChildren(...(rate ? [rate] : []));
  $('workIndicator').classList.toggle('settled', ['ready', 'cloud', 'failed'].includes(activeModelPhase?.phase));
}

let chatScroll;
const openTools = new Set();
function render() {
  $('chatTitle').textContent = activeTitle || 'Chat OMP OMP';
  $('projectLabel').textContent = [computerName(), pathName(cwd) || 'Arbeidsområde'].filter(Boolean).join(' · ');
  const timeline = $('timeline');
  const messages = $('messages');
  chatScroll = chatScroll || window.ompTurnUI.conversationScroll(timeline, messages, $('jumpLatest'));
  const scroll = chatScroll.capture(selection);
  renderWorkIndicator();
  $('modelBtn').textContent = nextModel?.name || model?.name || nextModel?.id || model?.id || window.ompLocale.translate('Velg modell');
  $('modelBtn').disabled = !origin || !cwd || submitting || streaming;
  window.ompTurnUI.thinkingChoice($('thinkingLevel'), nextModel || model, $('modelBtn').disabled);
  $('lightContext').disabled = !origin || !cwd || submitting || streaming;
  $('lightContext').setAttribute('aria-checked', String(lightContext ?? currentProfile?.light ?? false));
  $('chatMode').disabled = $('lightContext').disabled;
  $('chatMode').value = chatMode ?? currentProfile?.mode ?? 'build';
  window.ompModePicker?.sync();
  $('prompt').disabled = !origin || !cwd;
  $('attach').disabled = !origin || !cwd || streaming || submitting;
  $('send').disabled = !origin || !cwd || streaming || submitting || !$('prompt').value.trim();
  $('send').hidden = streaming;
  $('stop').hidden = !streaming;
  $('attachmentChip').hidden = !attachment;
  $('attachmentChip').replaceChildren();
  if (attachment) $('attachmentChip').append(button(attachment.name + ' ×', () => { attachment = null; render(); }));
  window.ompTurnUI.todo($('todoPanel'), activeFile || submitting ? todos : [], selection);
  window.ompTurnUI.tokenUsage($('tokenUsage'), history, nextModel || model, nextModel ? null : contextUsage, window.ompTurnUI.generationDetails(window.ompTurnUI.generation(generationKey())));
  const entries = window.ompTurnUI.timeline([...history, ...live], turnCards, projectChecks);
  window.ompTurnUI.syncRows(messages, entries, {
    skip: item => !(item.role === 'turn_changes' || item.role === 'project_check' || item.role === 'tool' ||
      item.text || item.segments?.some(block => block.text)),
    build: (item, messageIndex) => buildRow(item, messageIndex)
  });
  const welcome = $('welcome');
  welcome.hidden = entries.length > 0;
  if (!welcome.hidden) {
    welcome.replaceChildren(node('span', 'O', { class: 'brand-mark' }),
      node('h1', origin ? 'Hva bygger vi?' : 'Chat OMP OMP'));
    if (!origin) {
      welcome.append(node('p', 'Åpne Synkronisering i OMP Desktop og skann engangskoden for å koble til PC-en.'),
        button('Skann QR-kode', () => bridge.scan(), 'accent'));
    } else if (!cwd) {
      welcome.append(node('p', 'Velg et prosjekt på PC-en for å starte.'), button('Velg prosjekt', showProjects, 'accent'));
    } else welcome.append(node('p', 'Klar til å jobbe i ' + pathName(cwd) + '.'));
  }
  chatScroll.restore(scroll);
  if (requestedCheck && same(requestedCheck.file, activeFile)) {
    const target = [...$('messages').querySelectorAll('[data-check]')].find(card => card.dataset.check === requestedCheck.id);
    if (target) {
      requestedCheck = null;
      target.classList.add('check-highlight');
      requestAnimationFrame(() => { if (target.isConnected) target.scrollIntoView({ block: 'center' }); });
    }
  }
}

function buildRow(item, messageIndex) {
  if (item.role === 'turn_changes') {
    return window.ompTurnUI.card(item.card, showTurnDiff, confirmTurnUndo, !streaming && !submitting);
  }
  if (item.role === 'project_check') {
    const { id, exitCode, duration } = item.check;
    const title = exitCode === 0 ? 'Tester bestod' : exitCode === null ? 'Testkjøring avbrutt' : 'Tester feilet (' + exitCode + ')';
    return node('article', title + ' · ' + (duration / 1000).toFixed(1) + ' s',
      { class: 'turn-card', 'data-check': id, tabindex: '-1' });
  }
  if (item.role === 'tool') {
    const tool = node('details', null, { class: 'tool', 'data-id': item.toolCallId || item.id || item.toolName });
    const key = tool.dataset.id;
    tool.open = openTools.has(key);
    tool.ontoggle = () => { if (tool.open) openTools.add(key); else openTools.delete(key); };
    const command = item.toolName === 'bash' && typeof item.command === 'string' ? ' · ' + item.command.split('\n')[0] : '';
    tool.append(node('summary', (item.toolName || 'OMP-verktøy') + command + (item.running ? ' · kjører' : item.isError ? ' · feilet' : item.status === 'no-result' ? ' · uten resultat' : item.done || item.status === 'done' ? ' · ferdig' : '')),
      node('pre', item.text || ''));
    return tool;
  }
  const entry = node('article', null, { class: 'entry ' + item.role });
  if (item.role === 'assistant') entry.append(node('small', 'Oh My Pi'));
  window.ompTurnUI.appendSegments(entry, item, selection + ':' + (item.id || messageIndex), value => {
    for (const [index, text] of value.split('\x60\x60\x60').entries()) {
      if (text) entry.append(node(index % 2 ? 'pre' : 'p', index % 2 ? text.replace(/^[a-z]+\n/i, '') : text));
    }
  });
  const group = node('div', null, { class: 'chat-turn ' + item.role });
  group.append(entry);
  if (item.role === 'user' || item.role === 'assistant') {
    const actions = messageActions.row(item.text, selection + ':' + (item.id || item.clientMessageId || item.toolCallId || messageIndex));
    const time = window.ompLocale.messageTime(item.timestamp);
    if (time) actions.append(time);
    group.append(actions);
  }
  return group;
}

function updateTurnCard(card) {
  turnCards = [...turnCards.filter(item => item.id !== card.id), card].sort((a, b) => a.at - b.at);
}

async function refreshTurnData() {
  if (!activeFile || !origin || refreshingTurns) return;
  const selected = selection;
  const file = activeFile;
  refreshingTurns = true;
  try {
    const data = await api('/api/omp/turns', { file });
    if (selected !== selection || !same(file, activeFile)) return;
    const nextTodos = !streaming && !submitting && Array.isArray(data.todos) ? data.todos : todos;
    const checks = data.checks || [];
    if (!requestedCheck && JSON.stringify([turnCards, todos, projectChecks]) === JSON.stringify([data.cards, nextTodos, checks])) return;
    turnCards = data.cards || [];
    projectChecks = checks;
    todos = nextTodos;
    render();
  } finally {
    refreshingTurns = false;
    if (selected !== selection) refreshTurnData().catch(() => {});
  }
}

async function showTurnDiff(card, entry) {
  const file = activeFile;
  const body = sheet(entry.file);
  const region = node('div');
  body.append(region);
  if (entry.binary || entry.unavailable) {
    region.append(node('p', 'Tekstdiff er ikke tilgjengelig for denne filen.'));
    return;
  }
  try {
    const result = await api('/api/omp/turn-diff', { file, id: card.id, path: entry.file });
    if (!region.isConnected) return;
    region.append(result.diff ? window.ompTurnUI.diff(result.diff) : node('p', 'Ingen tekstlinjer endret.'));
    if (entry.truncated) region.append(node('p', 'Viser starten av en stor diff.'));
  } catch (error) { region.append(node('p', error.message)); }
}

function confirmTurnUndo(card) {
  const file = activeFile;
  const selected = selection;
  const body = sheet('Angre filendringer?');
  const feedback = node('p', '', { role: 'status' });
  const apply = button('Angre endringer', async () => {
    apply.disabled = true;
    try {
      const result = await api('/api/omp/turn-undo', null, { file, id: card.id });
      if (selected === selection) {
        updateTurnCard(result.card);
        render();
      }
      if (feedback.isConnected && $('sheet').open) $('sheet').close();
    } catch (error) { feedback.textContent = error.message; }
    finally { apply.disabled = false; }
  }, 'accent');
  body.append(node('p', 'Filene settes tilbake til versjonen før svaret hvis ingen av dem er endret siden.'), feedback,
    button('Avbryt', () => $('sheet').close()), apply);
}

function chatName(item) {
  return (item.title || '').replace(/[\uE000-\uF8FF\uFFFD]/g, '').trim() || 'Samtale';
}

function bindChatHold(row, item) {
  let timer;
  let start;
  let held = false;
  const cancel = () => { clearTimeout(timer); start = null; };
  row.onpointerdown = event => {
    cancel();
    held = false;
    if (event.pointerType !== 'touch' || !event.isPrimary) return;
    start = [event.clientX, event.clientY];
    timer = setTimeout(() => {
      if (!row.isConnected || $('drawer').hidden) return;
      held = true;
      showChatActions(item);
    }, 500);
  };
  row.onpointermove = event => {
    if (start && Math.hypot(event.clientX - start[0], event.clientY - start[1]) > 10) cancel();
  };
  row.onpointerup = row.onpointercancel = row.onpointerleave = cancel;
  row.oncontextmenu = event => {
    event.preventDefault();
    cancel();
    if (!held && !$('drawer').hidden) {
      held = true;
      showChatActions(item);
    }
  };
  row.addEventListener('click', event => {
    if (!held) return;
    held = false;
    event.preventDefault();
    event.stopImmediatePropagation();
  }, true);
}

function drawThreads() {
  if ($('drawer').hidden) return;
  const q = $('search').value.trim().toLowerCase();
  const rows = sessions.filter(item => [item.title, item.cwd, item.snippet].some(value => value?.toLowerCase().includes(q)));
  const list = $('threads');
  const groups = new Map(projectDirectories().filter(entry => !entry.auto)
    .map(entry => [directoryKey(entry.dir), { ...entry, rows: [] }]));
  const projectPaths = new Map(projects.filter(item => !item.hidden).map(item => [item.id, item.path]));
  const other = { name: 'Oh My Pi-samtaler', rows: [] };
  const running = rows.filter(item => item.activity).sort((a, b) => Number(b.activity === 'waiting') - Number(a.activity === 'waiting'));
  for (const item of rows) {
    if (!item.activity) (groups.get(directoryKey(projectPaths.get(item.projectId) || item.cwd)) || other).rows.push(item);
  }
  if (other.rows.length) groups.set('', other);
  const scroll = list.scrollTop;
  const sections = [];
  function threadEntry(item) {
    const selected = same(item.file, activeFile);
    const row = addIcon(button('', () => chooseThread(item), 'thread-row' + (selected ? ' active' : '')), 'chat');
    const title = chatName(item);
    row.append(node('span', title, { class: 'drawer-thread-title' }));
    if (item.activity) {
      const label = item.activity === 'waiting' ? 'Venter på svar' : 'Jobber';
      row.append(node('span', label, { class: 'thread-activity ' + item.activity }));
    }
    row.setAttribute('aria-current', String(selected));
    bindChatHold(row, item);
    const more = addIcon(button('', () => showChatActions(item), 'drawer-thread-more'), 'more');
    more.setAttribute('aria-label', 'Flere valg for ' + title);
    const entry = node('div', null, { class: 'drawer-thread-item' });
    entry.append(row, more);
    return entry;
  }
  if (running.length) {
    const section = node('section', null, { class: 'drawer-group drawer-running', 'aria-label': 'Aktive samtaler' });
    const children = node('div', null, { class: 'drawer-threads' });
    children.append(...running.map(threadEntry));
    section.append(node('h2', 'Aktive samtaler', { class: 'thread-activity-heading' }), children);
    sections.push(section);
  }
  for (const [key, group] of groups) {
    if (q && !group.rows.length && !group.name.toLowerCase().includes(q)) continue;
    const section = node('section', null, { class: 'drawer-group' });
    const active = same(group.dir, cwd) || group.rows.some(item => same(item.file, activeFile));
    const expanded = !!q || (expandedFolders.has(key) ? expandedFolders.get(key) : active);
    const heading = node('div', null, { class: 'drawer-group-head' });
    const toggle = addIcon(button('', () => { expandedFolders.set(key, !expanded); drawThreads(); }, 'drawer-toggle'), 'chevron');
    toggle.append(node('span', group.name));
    toggle.setAttribute('aria-expanded', String(expanded));
    heading.append(toggle);
    if (group.dir) {
      const create = addIcon(button('', () => openProject(group.dir, true), 'drawer-group-new'), 'plus');
      create.setAttribute('aria-label', 'Ny samtale i ' + group.name);
      heading.append(create);
    }
    section.append(heading);
    if (expanded) {
      const children = node('div', null, { class: 'drawer-threads' });
      children.append(...group.rows.map(threadEntry));
      if (!children.childElementCount) children.append(node('p', 'Ingen samtaler ennå.', { class: 'drawer-empty muted' }));
      section.append(children);
    }
    sections.push(section);
  }
  list.replaceChildren(...sections);
  if (!sections.length) list.append(node('p', q ? 'Ingen treff.' : 'Ingen samtaler ennå.', { class: 'drawer-empty muted' }));
  list.scrollTop = scroll;
}

async function updateHistory(expected = selection) {
  const file = activeFile;
  if (!file) return;
  const data = await api('/api/session/messages', { file });
  if (expected !== selection || !same(file, activeFile) || submitting) return;
  history = (data.messages || []).filter(item => !streaming || item.status !== 'no-result');
  const stored = new Set(history.flatMap(item => [item.id, item.toolCallId]).filter(Boolean));
  if (streaming) live = live.filter(item => !stored.has(item.toolCallId || item.id) && !history.some(entry => window.ompTurnUI.sameMessage(entry, item)));
  if (data.chatProfile) currentProfile = data.chatProfile;
  if (data.model && !nextModel) model = data.model;
  if (!streaming) live = [];
  activeTitle = data.session?.title || activeTitle;
  render();
}

async function refresh(show) {
  if (!origin || polling) return;
  const address = origin;
  polling = true;
  try {
    const query = $('search').value.trim();
    const [list, folders] = await Promise.all([
      api('/api/sessions', query ? { limit: 150, q: query, content: 1 } : {}),
      api('/api/projects/registry').catch(() => api('/api/projects')).catch(() => ({}))
    ]);
    if (origin !== address) return;
    const nextSessions = list.sessions || [];
    const nextProjects = folders.projects || [];
    sharedWorkspace = !!folders.sharedWorkspace;
    const wasListed = sessions.some(item => same(item.file, activeFile));
    const listChanged = sessions.length !== nextSessions.length || sessions.some((item, index) => {
      const next = nextSessions[index];
      return ['file', 'title', 'cwd', 'snippet', 'projectId', 'activity'].some(field => item[field] !== next[field]);
    }) || JSON.stringify(projects) !== JSON.stringify(nextProjects);
    sessions = nextSessions;
    projects = nextProjects;
    if (listChanged) {
      drawThreads();
      renderWorkIndicator();
    }
    if (wasListed && !submitting && !streaming && !query && activeFile &&
        list.total === sessions.length && !sessions.some(item => same(item.file, activeFile))) {
      select(cwd, '', '');
    }
    if (!submitting) await updateHistory().catch(() => {});
    refreshTurnData().catch(() => {});
    if (show || $('status').textContent === reconnectStatus) status('Tilkoblet PC');
  } finally { polling = false; }
}

function persist() {
  if (origin) localStorage.setItem(workspaceStorage(origin), JSON.stringify({ cwd, file: activeFile }));
  localStorage.removeItem('cwd');
  localStorage.removeItem('file');
}

function select(cwdValue, file, title) {
  messageActions.cancel();
  if (origin && cwd) saveDraft(draftKey(), $('prompt').value);
  closeApproval();
  selection++;
  cwd = cwdValue;
  activeFile = file;
  activeTitle = title;
  history = [];
  live = [];
  todos = [];
  turnCards = [];
  projectChecks = [];
  streaming = false;
  workPhase = recoveryFailure = '';
  lightContext = undefined;
  chatMode = currentProfile = undefined;
  submitting = false;
  sendFailure = '';
  runtimeFile = '';
  model = nextModel = null;
  contextUsage = null;
  activeModelPhase = null;
  attachment = null;
  $('prompt').value = drafts.get(draftKey()) || '';
  persist();
  watch();
  refreshTurnData().catch(() => {});
  recoverRuntime().catch(() => {});
  render();
}

async function chooseThread(item) {
  showDrawer(false);
  select(item.cwd || cwd, item.file, item.title || 'Samtale');
  await updateHistory(selection);
}

function newThread() {
  showDrawer(false);
  if (!origin) return showSettings();
  if (!cwd) return showProjects();
  select(cwd, '', '');
  $('prompt').focus();
}

const directoryKey = directory => (directory || '').replace(/\\/g, '/').replace(/\/$/, '').toLowerCase();

function projectDirectories() {
  const entries = new Map();
  for (const item of projects) {
    if (item.hidden) continue;
    const dir = typeof item === 'string' ? item : item.path || item.cwd;
    if (dir) entries.set(directoryKey(dir), { dir, name: item.name || pathName(dir), auto: item.auto === true });
  }
  const hidden = new Set(projects.filter(item => item.hidden).map(item => directoryKey(item.path)));
  for (const dir of [cwd, ...sessions.map(item => item.cwd)]) {
    if (dir && !hidden.has(directoryKey(dir)) && !entries.has(directoryKey(dir))) entries.set(directoryKey(dir), { dir, name: pathName(dir), auto: true });
  }
  return [...entries.values()].sort((first, second) =>
    Number(same(second.dir, cwd)) - Number(same(first.dir, cwd)) || Number(first.auto) - Number(second.auto));
}

function openProject(directory, focus = false) {
  select(directory, '', '');
  expandedFolders.set(directoryKey(directory), true);
  if ($('sheet').open) $('sheet').close();
  showDrawer(false);
  if (focus) $('prompt').focus();
  if (sharedWorkspace && !projects.some(item => item.auto === false && !item.hidden && same(item.path, directory))) {
    api('/api/projects/register', null, { path: directory, show: true }).then(({ project }) => {
      projects = [project, ...projects.filter(item => !same(item.path, project.path))];
      drawThreads();
    }, error => status(error.message));
  }
}

function folderRow(name, hint, action, icon = 'folder') {
  const row = addIcon(button('', action, 'folder-row'), icon);
  const text = node('span', name, { class: 'folder-label' });
  if (hint) text.append(node('small', hint));
  row.append(text);
  return row;
}

function showProjects() {
  const body = sheet('Prosjekter');
  if (!origin) { body.append(node('p', 'Koble til PC-en først.')); return; }
  const actions = node('div', null, { class: 'folder-actions' });
  actions.append(addIcon(button('Bla på PC-en', () => browseFolders(), 'accent'), 'folder'),
    addIcon(button('Ny mappe', () => browseFolders('', true)), 'plus'));
  body.append(actions);
  const entries = projectDirectories();
  if (entries.length) {
    const search = node('input', null, { type: 'search', placeholder: 'Søk i prosjektmapper', 'aria-label': 'Søk i prosjektmapper' });
    const list = node('div');
    const draw = () => {
      const query = search.value.trim().toLowerCase();
      const matches = entries.filter(({ dir, name }) => (name + ' ' + dir).toLowerCase().includes(query));
      list.replaceChildren(...matches.map(({ dir, name }) => folderRow(name, dir, () => openProject(dir))));
      if (!matches.length) list.append(node('p', 'Ingen treff.', { class: 'folder-empty muted' }));
    };
    search.oninput = draw;
    body.append(search, list);
    draw();
  }
}

function parentFolder(directory) {
  const clean = directory.replace(/\//g, '\\').replace(/\\+$/, '');
  if (/^[a-z]:$/i.test(clean) || /^\\\\[^\\]+\\[^\\]+$/.test(clean)) return '';
  const parent = clean.slice(0, clean.lastIndexOf('\\'));
  return /^[a-z]:$/i.test(parent) ? parent + '\\' : parent;
}

function folderBreadcrumbs(directory, go) {
  const bar = node('nav', null, { class: 'folder-breadcrumbs', 'aria-label': 'Mappesti' });
  const ancestors = [];
  for (let path = directory; path; path = parentFolder(path)) ancestors.unshift(path);
  bar.append(button('PC-en', () => go('')));
  for (const path of ancestors) bar.append(button(pathName(path), () => go(path)));
  return bar;
}

async function browseFolders(directory = '', createMode = false, filesMode = false) {
  const body = sheet(createMode ? 'Plassering for ny mappe' : 'Bla på PC-en');
  const page = node('div', null, { class: 'folder-browser' });
  const feedback = node('p', 'Henter mapper …', { class: 'folder-empty muted', role: 'status' });
  body.append(page);
  const go = path => browseFolders(path, createMode, filesMode);
  if (directory) {
    page.append(folderBreadcrumbs(directory, go), folderRow('Opp', null, () => go(parentFolder(directory)), 'up'));
  } else page.append(folderRow('Tilbake til prosjekter', null, showProjects));
  const children = node('div', null, { class: 'folder-entries' });
  page.append(children);
  children.append(feedback);
  try {
    const data = await api('/api/fs/list', { path: directory || '/' });
    if (!page.isConnected || !$('sheet').open) return;
    children.replaceChildren();
    if (!directory) {
      const shortcuts = [...(data.places || [])];
      if (cwd && !shortcuts.some(item => same(item.path, cwd))) shortcuts.unshift({ label: 'Gjeldende prosjekt', path: cwd });
      for (const place of shortcuts) children.append(folderRow(place.label, null, () => go(place.path)));
      const recent = recentFolders.filter(path => origin === path.origin && !shortcuts.some(item => same(item.path, path.dir)));
      if (recent.length) children.append(node('h3', 'Nylig brukt', { class: 'folder-heading' }));
      for (const { dir } of recent) children.append(folderRow(pathName(dir), dir, () => go(dir)));
    } else {
      recentFolders = [{ dir: directory, origin }, ...recentFolders.filter(item => item.origin !== origin || !same(item.dir, directory))].slice(0, 5);
      localStorage.setItem('recentFolders', JSON.stringify(recentFolders));
      const actions = node('div', null, { class: 'folder-actions' });
      if (!createMode) actions.append(addIcon(button('Åpne mappen', () => openProject(directory), 'accent'), 'folder'));
      actions.append(addIcon(button('Ny mappe her', () => showCreateProject(directory, createMode, filesMode), createMode ? 'accent' : ''), 'plus'));
      if (!createMode) actions.append(addIcon(button(filesMode ? 'Endringer' : 'Vis filer', () => filesMode ? showGit() : browseFolders(directory, false, true)), filesMode ? 'git' : 'file'));
      page.insertBefore(actions, children);
    }
    const folders = (data.entries || []).filter(item => item.name && item.name !== '..' &&
      (item.type === 'dir' || item.type === 'directory' || item.isDir || item.isDirectory));
    folders.sort((a, b) => a.name.localeCompare(b.name, 'nb', { numeric: true }));
    if (!directory && folders.length) children.append(node('h3', 'Stasjoner', { class: 'folder-heading' }));
    for (const item of folders) {
      const path = item.path || (directory ? directory.replace(/[\\/]$/, '') + '\\' + item.name : item.name);
      children.append(folderRow(item.name, null, () => go(path)));
    }
    if (directory && filesMode) for (const item of (data.entries || []).filter(entry =>
      entry.name && (entry.type === 'file' || entry.isFile)).slice(0, 400)) {
      const path = item.path || directory.replace(/[\\/]$/, '') + '\\' + item.name;
      children.append(folderRow(item.name, null, async () => {
        const body = sheet(item.name);
        body.append(button('Tilbake til mapper', () => go(directory)));
        try { body.append(node('pre', (await api('/api/files/read', { path })).content || 'Tom fil.')); }
        catch (error) { body.append(node('p', error.message)); }
      }, 'file'));
    }
    if (!children.childElementCount) children.append(node('p', 'Ingen undermapper.', { class: 'folder-empty muted' }));
  } catch (error) {
    feedback.textContent = error.message;
    if (error.message.includes('HTTP 401')) {
      children.append(button('Skann QR-kode på nytt', () => bridge.scan(), 'accent'));
    } else {
      children.append(button('Prøv igjen', () => go(directory)));
    }
  }
}

function showCreateProject(parent, createMode, filesMode) {
  const body = sheet('Ny prosjektmappe');
  const form = node('form', null, { class: 'card project-form' });
  const [nameLabel, name] = input('Mappenavn', { required: '', maxlength: '80', placeholder: 'Mitt prosjekt' });
  const feedback = node('p', '', { class: 'muted', role: 'status' });
  const create = node('button', 'Opprett mappe', { type: 'submit', class: 'accent' });
  form.append(node('small', parent, { class: 'folder-path' }), nameLabel, feedback,
    node('div', null, { class: 'row' }));
  form.lastElementChild.append(create, button('Tilbake', () => browseFolders(parent, createMode, filesMode)));
  form.onsubmit = async event => {
    event.preventDefault();
    const folderName = name.value.trim();
    if (!folderName || /[<>:"/\\|?*]|[. ]$/.test(folderName) || /^(?:con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/i.test(folderName)) {
      feedback.textContent = 'Velg et gyldig Windows-mappenavn.';
      return;
    }
    create.disabled = true;
    feedback.textContent = 'Oppretter mappe på PC-en …';
    try {
      const data = await api('/api/projects/create', null, { name: folderName, root: parent });
      const project = data.project;
      if (!project?.path) throw new Error('Bridgen returnerte ingen prosjektmappe.');
      projects = [project, ...projects.filter(item => !same(item.path || item.cwd || item, project.path))];
      if (!form.isConnected || !$('sheet').open) return;
      openProject(project.path);
      status('Opprettet ' + project.name + ' på PC-en');
    } catch (error) { feedback.textContent = error.message; }
    finally { create.disabled = false; }
  };
  body.append(form);
}

async function showModels() {
  const body = sheet('Velg modell');
  body.append(node('p', 'Henter modeller fra OMP …'));
  try {
    const result = await api('/api/models', { cwd });
    const search = node('input', null, { type: 'search', placeholder: 'Søk etter modell', 'aria-label': 'Søk etter modell' });
    const list = node('div');
    const draw = () => {
      const q = search.value.trim().toLowerCase();
      const shown = (result.models || []).filter(item => [item.provider, item.name, item.id].join(' ').toLowerCase().includes(q));
      list.replaceChildren();
      for (const item of shown) {
        const row = button(item.name || item.id, async () => {
          const expected = selection;
          search.disabled = true;
          for (const choice of list.querySelectorAll('button')) choice.disabled = true;
          feedback.textContent = 'Bytter modell …';
          try {
            const result = await api('/api/model', null, { cwd, provider: item.provider, modelId: item.id,
              ...(activeFile ? { file: activeFile } : { stageOnly: true }) });
            if (expected !== selection) return;
            if (activeFile && result.memorySwitched) { model = item; nextModel = null; contextUsage = null; }
            else nextModel = item;
            if (body.contains(list) && $('sheet').open) $('sheet').close();
            render();
          } catch (error) {
            feedback.textContent = error.message;
          } finally {
            search.disabled = false;
            for (const choice of list.querySelectorAll('button')) choice.disabled = false;
          }
        }, 'pick-row model-option');
        row.append(node('small', item.provider));
        list.append(row);
      }
      if (!shown.length) list.append(node('p', 'Ingen modeller funnet.'));
    };
    const feedback = node('p', '', { role: 'status' });
    feedback.setAttribute('data-model-phase', '');
    body.replaceChildren(search, feedback, list);
    search.oninput = draw;
    draw();
  } catch (error) { body.replaceChildren(node('p', error.message)); }
}

async function send(event) {
  event.preventDefault();
  const text = $('prompt').value.trim();
  if (!text || !cwd || !origin || streaming || submitting) return;
  const selected = selection;
  const dir = cwd;
  const existing = activeFile;
  let file = existing;
  const chosen = nextModel;
  const profile = { ...(lightContext !== undefined && { light: lightContext }), ...(chatMode && { mode: chatMode }) };
  const files = attachment ? [attachment.image] : [];
  const originalDraft = draftKey();
  const item = { role: 'user', text, pending: true, timestamp: Date.now(), clientMessageId: window.ompTurnUI.messageId() };
  submitting = true;
  sendFailure = '';
  live.push(item);
  $('prompt').value = '';
  status('Klargjør OMP …');
  render();
  try {
    if (existing) {
      const state = await api('/api/state', { cwd: dir, file: existing });
      if (state.cwdMissing) throw new Error('Arbeidsmappen finnes ikke på PC-en.');
      if (state.state?.isStreaming || state.request) throw new Error('OMP jobber allerede i denne samtalen.');
      if (!same(state.sessionFile, existing)) {
        const opened = await api('/api/sessions/open', null, { file: existing, cwd: dir });
        if (opened.readOnly) throw new Error(opened.reason || 'Denne økten er skrivebeskyttet.');
      }
    } else {
      const created = await api('/api/sessions/new', null, { cwd: dir, isolated: true });
      file = created.sessionFile || created.session?.file || created.state?.sessionFile;
      if (!file) throw new Error('Bridge returnerte ingen samtale-ID.');
    }
    if (selected !== selection) throw new Error('Samtalen ble byttet.');
    runtimeFile = file;
    watch();
    if (chosen) {
      await api('/api/model', null, { cwd: dir, file, provider: chosen.provider, modelId: chosen.id });
    }
    if (selected !== selection) throw new Error('Samtalen ble byttet.');
    streaming = true;
    render();
    const sent = await api('/api/prompt', null, { cwd: dir, text, clientMessageId: item.clientMessageId, thinking: window.ompTurnUI.thinkingRequest($('thinkingLevel'), nextModel || model), file,
      ...(Object.keys(profile).length && { chatProfile: profile }), ...(files.length && { images: files }) });
    if (selected !== selection) return;
    if (sent.sessionFile) activeFile = runtimeFile = sent.sessionFile;
    if (sent.chatProfile) { currentProfile = sent.chatProfile; lightContext = chatMode = undefined; }
    saveDraft(originalDraft, '');
    if (!activeTitle) activeTitle = text.split('\n')[0].slice(0, 65);
    model = chosen || model;
    nextModel = null;
    attachment = null;
    persist();
    if (sent.ack?.agentInvoked === false) streaming = false;
    status('');
  } catch (error) {
    if (selected === selection) {
      live = live.filter(value => value !== item);
      $('prompt').value = text;
      saveDraft(originalDraft, text);
      streaming = false;
      sendFailure = error.message;
      status(sendFailure);
    }
  } finally {
    if (selected === selection) {
      submitting = false;
      render();
      if (!streaming) laterHistory();
    }
  }
}

function laterHistory() {
  const selected = selection;
  setTimeout(() => {
    if (selected === selection) updateHistory(selected).catch(() => {});
    refresh(false).catch(() => {});
  }, 300);
}

async function recoverRuntime() {
  if (!origin || !activeFile || !cwd || recovering || submitting) return;
  const selected = selection;
  recovering = true;
  try {
    const state = await api('/api/state', { cwd, ...(activeFile || runtimeFile ? { file: activeFile || runtimeFile } : {}) });
    if (selected !== selection || submitting) return;
    if (!same(state.sessionFile || state.state?.sessionFile, activeFile)) {
      if (streaming) { streaming = false; laterHistory(); }
      closeApproval();
      return;
    }
    runtimeFile = activeFile;
    if (state.state?.model && !nextModel) model = state.state.model;
    contextUsage = state.state?.contextUsage || null;
    if (state.chatProfile) currentProfile = state.chatProfile;
    const working = !!state.state?.isStreaming || !!state.request;
    if (streaming && !working) laterHistory();
    streaming = working;
    if (state.request?.id) showApproval(state.request);
    else if (approvalId) closeApproval();
    if (!sendFailure) status('');
    render();
  } finally {
    recovering = false;
    if (selected !== selection) recoverRuntime().catch(() => {});
  }
}

let livePaint = 0;
const liveEventTimings = [];
function recordLiveTiming(frame, uiReceivedAt) {
  if (!frame.trace) return;
  const timing = { type: frame.type, ...frame.trace, uiReceivedAt, domUpdatedAt: Date.now() };
  liveEventTimings.push(timing);
  if (liveEventTimings.length > 2000) liveEventTimings.shift();
  if (localStorage.getItem('omp-live-trace') === '1') console.debug('OMP live', JSON.stringify(timing));
}

window.onBridgeEvent = (raw, address) => {
  const uiReceivedAt = Date.now();
  if (address !== origin) return;
  const frame = typeof raw === 'string' ? JSON.parse(raw) : raw;
  // Bridge already filters the subscription by the canonical project path.
  // Match the event itself to the selected conversation, including after reconnect.
  if (!cwd) return;
  if (frame.type === 'hello' || frame.type === 'state') {
    const file = frame.sessionFile || frame.state?.sessionFile;
    // The subscription is per project, so frames for another conversation in the
    // same folder do arrive. Only adopt the file when it is the conversation we
    // are showing (or one we are creating): adopting a foreign file used to
    // silently re-point the live stream at the wrong conversation.
    if (file && (!activeFile || submitting || same(activeFile, file))) runtimeFile = file;
    if (same(runtimeFile, activeFile)) {
      if (frame.state?.model) model = frame.state.model;
      window.ompTurnUI.generation(generationKey(), frame);
      contextUsage = frame.state?.contextUsage || null;
      if (Array.isArray(frame.state?.todoPhases)) todos = frame.state.todoPhases;
      if (frame.state?.isStreaming && !submitting) streaming = true;
      if (frame.state?.isStreaming === false && streaming && !submitting && !approvalId) { streaming = false; laterHistory(); }
      render();
    }
    return;
  }
  if (frame.type === 'turn_changes' || frame.type === 'todo_phases') {
    if (same(frame.sessionFile, activeFile) || (!activeFile && submitting && frame.sessionFile)) {
      if (frame.type === 'turn_changes') updateTurnCard(frame.card);
      else todos = frame.phases;
      render();
    }
    return;
  }
  if (activeFile ? !same(activeFile, frame.sessionFile || runtimeFile) : !submitting) return;
  window.ompTurnUI.generation(generationKey(), frame);
  if (frame.recovery && (frame.type === 'auto_retry_start' || frame.type === 'auto_retry_end')) {
    workPhase = window.ompTurnUI.recoveryStatus(frame);
    if (frame.type === 'auto_retry_end' && !frame.success) status(recoveryFailure = workPhase);
    render();
    return;
  }
  if (frame.type === 'agent_start') {
    activeModelPhase = null;
    streaming = true;
    workPhase = 'OMP tenker';
    recoveryFailure = '';
    status('');
  } else if (frame.type === 'agent_end' || frame.type === 'session_settled' || frame.type === 'prompt_result') {
    activeModelPhase = null;
    streaming = false;
    workPhase = '';
    status(recoveryFailure || frame.error || '');
    closeApproval();
    laterHistory();
  } else if (frame.type === 'message_delta' && ['text', 'thinking'].includes(frame.kind)) {
    workPhase = frame.kind === 'thinking' ? 'OMP tenker' : 'OMP skriver';
    let previous = live[live.length - 1];
    if (previous?.role !== 'assistant' || previous.done) {
      previous = { id: frame.messageId, role: 'assistant', text: '', timestamp: frame.ts || Date.now() };
      live.push(previous);
    }
    if (frame.partial?.segments?.length) previous.segments = frame.partial.segments;
    if (frame.kind === 'text') previous.text = frame.partial?.text ?? (previous.text + (frame.delta || ''));
  } else if (frame.type === 'message_end' && frame.message?.role === 'user' && !frame.message.synthetic) {
    const item = { ...frame.message, role: 'user' };
    if (!window.ompTurnUI.userEcho([...history, ...live], item)) live.push(item);
  } else if (frame.type === 'message_end' && frame.message?.role === 'assistant') {
    workPhase = '';
    const previous = live[live.length - 1];
    if (previous?.role === 'assistant' && !previous.done) live.pop();
    if (!history.some(item => item.role === 'assistant' && item.id === frame.message.id)) live.push({ id: frame.message.id, role: 'assistant', text: frame.message.text || frame.message.error || '', usage: frame.message.usage, segments: frame.message.segments, timestamp: frame.message.timestamp || frame.ts, done: true });
  } else if (['tool_start', 'tool_update', 'tool_stream', 'tool_end'].includes(frame.type)) {
    if (frame.toolName === 'todo' && !frame.isError && Array.isArray(frame.result?.details?.phases)) todos = frame.result.details.phases;
    const ended = frame.type === 'tool_end';
    if (frame.toolCallId && history.some(value => value.role === 'tool' && value.toolCallId === frame.toolCallId && value.status === 'done')) return;
    let tool = frame.toolCallId && live.find(value => value.toolCallId === frame.toolCallId);
    if (tool?.done && !ended) return;
    if (!tool) {
      tool = { role: 'tool', toolName: frame.toolName, toolCallId: frame.toolCallId,
        command: frame.args?.command, text: JSON.stringify(frame.args || {}, null, 2) };
      live.push(tool);
    }
    if (frame.toolName) tool.toolName = frame.toolName;
    tool.running = !ended;
    tool.done = ended;
    tool.isError = frame.isError;
    const output = frame.result || frame.partial;
    const text = typeof output === 'string' ? output : output?.content?.filter(value => value.type === 'text').map(value => value.text).join('\n');
    if (text) tool.text = text;
    const runningTools = live.filter(item => item.running);
    const running = runningTools[runningTools.length - 1];
    workPhase = running ? ({ bash: 'Kjører Bash', read: 'Leser filer', write: 'Skriver filer', edit: 'Redigerer kode', web_search: 'Søker på nettet',
      grep: 'Søker', find: 'Søker etter filer' }[running.toolName] || ('Kjører ' + (running.toolName || 'verktøy'))) : 'OMP tenker';
  } else if (frame.type === 'ui_request') {
    showApproval(frame);
  } else if (frame.type === 'ui_cancel' && (!frame.targetId || frame.targetId === approvalId)) {
    closeApproval();
  } else if (frame.type === 'notice' || frame.type === 'rpc_error') {
    status(frame.message || frame.error);
  } else if (frame.type === 'model_preparing') {
    if (frame.operationId && activeModelPhase?.operationId === frame.operationId && activeModelPhase.sequence >= frame.sequence) return;
    activeModelPhase = frame;
    const feedback = $('sheetBody').querySelector('[data-model-phase]');
    if (feedback) feedback.textContent = window.ompTurnUI.modelProgress(frame);
  } else return;
  if (frame.type === 'message_delta' || frame.type === 'tool_update' || frame.type === 'tool_stream') {
    const selected = selection;
    if (!livePaint) livePaint = requestAnimationFrame(() => {
      livePaint = 0;
      if (selected !== selection) return;
      render();
      recordLiveTiming(frame, uiReceivedAt);
    });
    return;
  }
  render();
  recordLiveTiming(frame, uiReceivedAt);
};

// Batched delivery from MainActivity: one evaluateJavascript call for a burst of
// live frames instead of one JNI crossing per streamed token.
window.onBridgeBatch = (frames, address) => {
  if (!Array.isArray(frames)) return;
  for (const frame of frames) window.onBridgeEvent(frame, address);
};

function closeApproval() {
  approvalId = null;
  if ($('approval').open) $('approval').close();
}

function showApproval(frame) {
  if (approvalId === frame.id || (frame.sessionFile && activeFile && !same(frame.sessionFile, activeFile))) return;
  approvalId = frame.id;
  const dir = cwd;
  const body = $('approvalBody');
  $('approvalTitle').textContent = frame.title || 'OMP trenger svar';
  body.replaceChildren(node('p', frame.message || ''));
  const answer = async value => {
    await api('/api/ask', null, { cwd: dir, id: frame.id, ...value });
    closeApproval();
  };
  if (frame.method === 'confirm') {
    body.append(button('Ja', () => answer({ confirmed: true }), 'accent'), button('Nei', () => answer({ confirmed: false })));
  } else if (frame.method === 'select') {
    for (const option of frame.options || []) body.append(button(String(option), () => answer({ value: option }), 'pick-row'));
  } else if (frame.method === 'ask' && Array.isArray(frame.questions)) {
    const answers = frame.questions.map(question => {
      const [label, field] = input(question.question || question.title || question.text || 'Svar', {});
      body.append(label);
      return field;
    });
    body.append(button('Send svar', () => answer({ answers: answers.map(field => field.value) }), 'accent'));
  } else {
    const [label, field] = input('Svar', { placeholder: frame.placeholder || '' });
    field.value = frame.prefill || '';
    body.append(label, button('Send svar', () => answer({ value: field.value }), 'accent'));
  }
  if (frame.allowAlways) body.append(button('Tillat alt og alltid', () => {
      if (window.ompLocale.confirmAlways()) return answer({ allowAlways: true });
    }));
  body.append(button('Avbryt', () => answer({ cancelled: true })));
  $('approval').oncancel = event => { event.preventDefault(); answer({ cancelled: true }).catch(error => status(error.message)); };
  if (!$('approval').open) $('approval').showModal();
}

function appearanceControls() {
  const panel = node('section', null, { class: 'card appearance-card' });
  const theme = node('select', null, { id: 'mobileTheme', 'aria-label': 'Tema' });
  for (const [id, label] of themes) theme.append(node('option', label, { value: id }));
  theme.value = appearance.theme;
  const custom = node('div', null, { class: 'custom-colors' });
  const mode = node('select', null, { 'aria-label': 'Lys eller mørk bakgrunn' });
  mode.append(node('option', 'Mørk bakgrunn', { value: 'dark' }), node('option', 'Lys bakgrunn', { value: 'light' }));
  mode.value = appearance.customMode;
  mode.onchange = () => appearanceSetting('customMode', mode.value);
  const slider = (key, label, min, max, suffix = '') => {
    const field = node('input', null, { type: 'range', id: key, min, max, value: appearance[key], 'aria-label': label });
    const value = node('output', null, { for: key, 'aria-live': 'off' });
    const caption = node('div', null, { class: 'slider-caption' });
    caption.append(node('label', label, { for: key }), value);
    const control = node('div', null, { class: 'slider-control' });
    control.append(caption, field);
    const updateLabel = () => {
      value.textContent = suffix ? field.value + suffix : '';
      if (suffix) field.setAttribute('aria-valuetext', value.textContent);
    };
    field.oninput = () => { appearanceSetting(key, field.valueAsNumber); updateLabel(); };
    updateLabel();
    return control;
  };
  custom.append(mode, slider('accentHue', 'Aksentfarge', 0, 359), slider('accentSaturation', 'Fargestyrke', 0, 100, '%'),
    slider('backgroundHue', 'Bakgrunnsfarge', 0, 359));
  const updateCustom = () => { custom.hidden = theme.value !== 'custom'; };
  theme.onchange = () => { appearanceSetting('theme', theme.value); updateCustom(); };
  updateCustom();
  const preview = node('div', null, { class: 'appearance-preview' });
  const bubbles = node('div');
  bubbles.append(node('p', 'Slik ser en samtale ut'), node('span', 'Dette er en melding'));
  preview.append(node('span', 'O', { class: 'brand-mark', 'aria-hidden': 'true' }), bubbles);
  const fonts = node('details', null, { class: 'appearance-fonts' });
  fonts.append(node('summary', 'Skrifttyper'));
  for (const [key, label, sample] of [['uiFont', 'Skrift i appen', 'Systemstandard'], ['codeFont', 'Skrift for kode', 'Monospace']]) {
    const [row, field] = input(label, { maxlength: '64', placeholder: sample });
    field.value = appearance[key];
    field.onchange = () => appearanceSetting(key, field.value.trim());
    fonts.append(row);
  }
  panel.append(node('h3', 'Tema'), theme, custom, slider('textSize', 'Tekststørrelse', 85, 145, '%'), preview, fonts);
  return panel;
}

function showAppearance() {
  sheet('Utseende').append(appearanceControls(), button('Tilbake til innstillinger', showSettings));
}

function showSettings() {
  const body = sheet('Innstillinger');
  body.append(window.ompLocale.languageSetting());
  if (origin) body.append(window.ompLocale.approvalSetting(
    mode => mode ? api('/api/approval', null, { mode }) : api('/api/approval')));
  const version = bridge.appVersion?.();
  if (version) body.append(node('p', 'Chat OMP OMP · Versjon ' + version, { class: 'app-version' }));
  const openAppearance = settingsLink('theme', 'Utseende', showAppearance);
  const connection = node('div', null, { class: 'card' });
  connection.append(node('h3', 'Bridge'), node('p', origin || 'Koble til OMP Desktop med en engangskode.'),
    button(origin ? 'Skann ny QR-kode' : 'Skann QR-kode', () => bridge.scan(), 'accent'));
  if (origin) connection.append(button('Skann trådkode', () => bridge.scan()));
  connection.append(button('PC-er', showComputers));
  body.append(openAppearance, connection);
  if (origin) body.append(settingsLink('models', 'Leverandører fra PC-en', showProviders),
    settingsLink('tokens', 'Maskinressurser', () => {
      const pc = origin;
      sheet('Maskinressurser').append(window.ompTurnUI.machinePanel(() => api('/api/machine/resources'),
        () => $('sheet').open && origin === pc));
    }),
    settingsLink('resources', 'OMP-ressurser', () => showSharedWorkspace(false)),
    settingsLink('plugins', 'Plugins', () => showSharedWorkspace(true)),
    settingsLink('device', 'Enheter og ADB', showDeviceSettings), settingsLink('archive', 'Arkiv og papirkurv', showSavedChats));
  if (activeFile) body.append(settingsLink('chat', 'Handlinger for aktiv samtale', () => showChatActions({ file: activeFile, cwd, title: activeTitle })));
}

function showPowerSettings() {
  const body = sheet('Wake-on-LAN');
  const pc = computers().find(item => item.active);
  if (!pc) {
    body.append(node('p', 'Koble til en PC med QR-kode for å bruke Wake-on-LAN.'),
      button('PC-er', showComputers));
    return;
  }
  const panel = node('div', null, { class: 'card' });
  const status = node('p', '', { role: 'status' });
  const wake = button('Vekk PC', async () => {
    if (origin !== pc.id) return showPowerSettings();
    wake.disabled = true;
    status.textContent = 'Sender vekkesignal …';
    try {
      await api('/api/wol/wake', null, {});
      status.textContent = 'Vekkesignal sendt. Venter på at PC-en starter …';
      const deadline = Date.now() + 120000;
      while (status.isConnected && origin === pc.id && Date.now() < deadline) {
        try {
          const health = await api('/api/health');
          if (!health.ok) throw new Error('Bridge er ikke klar.');
        } catch {
          await new Promise(resolve => setTimeout(resolve, 2500));
          continue;
        }
        if (status.isConnected && origin === pc.id) {
          status.textContent = 'PC-en er på. Kontakt med OMP Bridge.';
          watch();
          refresh(true).catch(() => {});
        }
        return;
      }
      if (status.isConnected && origin === pc.id) {
        status.textContent = 'Vekkesignal sendt, men Bridge svarer ennå ikke. Sjekk nettverket og at Bridge har startet.';
      }
    } catch (error) { status.textContent = error.message; }
    finally { wake.disabled = false; }
  }, 'accent');
  wake.disabled = !pc.wakeReady;
  const poweroff = button('Slå av PC', () => {
    const confirm = sheet('Slå av ' + pc.name + '?');
    const feedback = node('p', '', { role: 'status' });
    const apply = button('Slå av', async () => {
      if (origin !== pc.id) return showPowerSettings();
      apply.disabled = true;
      try {
        await api('/api/poweroff', null, { confirm: true });
        feedback.textContent = 'Avslåing er bestilt.';
      } catch (error) {
        feedback.textContent = error.message;
        apply.disabled = false;
      }
    }, 'danger');
    confirm.append(node('p', 'Lagre åpne dokumenter på PC-en først.'), feedback, apply,
      button('Tilbake', showPowerSettings));
  });
  poweroff.disabled = !pc.allowShutdown;
  panel.append(node('h3', pc.name),
    node('p', pc.wakeReady ? 'Vekking er konfigurert.' : 'Konfigurer reléet på PC-en og skann en ny QR-kode.'),
    node('p', pc.allowShutdown ? 'Fjernavslåing er aktivert.' : 'Fjernavslåing er deaktivert på PC-en.'),
    wake, poweroff, status);
  body.append(panel, button('Bytt PC', showComputers));
}

function showComputerName(pc) {
  const body = sheet('Navn på PC');
  const form = node('form');
  const [label, name] = input('Navn på PC', { maxlength: '48', required: '' });
  name.value = pc.name;
  const save = button('Lagre', () => {});
  save.type = 'submit';
  form.append(label, save);
  form.onsubmit = event => {
    event.preventDefault();
    bridge.computer('rename', pc.id, name.value);
  };
  body.append(form);
}

function showComputers() {
  const body = sheet('PC-er');
  body.append(button('Legg til PC med QR-kode', () => bridge.scan(), 'accent'));
  for (const pc of computers()) {
    const card = node('div', null, { class: 'card' });
    card.append(node('h3', pc.name), node('p', pc.active ? 'Valgt PC' : pc.id));
    if (!pc.active) card.append(button('Bytt til ' + pc.name, () => bridge.computer('select', pc.id, '')));
    card.append(button('Endre navn', () => showComputerName(pc)), button('Fjern PC', () => {
      if (confirm('Fjerne ' + pc.name + ' fra denne telefonen?')) bridge.computer('remove', pc.id, '');
    }));
    body.append(card);
  }
}

window.onComputersChanged = () => { savedComputers = computers(); render(); showComputers(); };

function settingsLink(icon, name, action) {
  const control = window.ompTurnUI.iconButton(button('', action, 'pick-row settings-link'), icon, name);
  control.append(node('span', name));
  return control;
}

function showDeviceSettings() {
  sheet('Enheter').append(window.ompTurnUI.adbPanel({
    read: () => api('/api/adb/status', { identity: bridge.adbIdentity() }),
    install: async () => {
      await api('/api/adb/install', null, {});
      return api('/api/adb/status', { identity: bridge.adbIdentity() });
    },
    phone: () => JSON.parse(bridge.debuggingStatus()),
    openSettings: () => bridge.openDebuggingSettings()
  }), button('Tilbake til innstillinger', showSettings));
}

async function showSharedWorkspace(plugins) {
  const body = sheet(plugins ? 'Plugins' : 'OMP-ressurser');
  if (!cwd) { body.append(button('Velg prosjekt', showProjects, 'accent')); return; }
  const directory = cwd;
  const file = plugins ? activeFile : '';
  const route = '/api/omp/workspace/' + (plugins ? 'plugins' : 'resources');
  const [, search] = input(plugins ? 'Søk etter plugin' : 'Søk etter ressurs', { type: 'search', 'aria-label': 'Søk' });
  const controls = node('div');
  const feedback = node('p', 'Henter status fra PC-en …', { role: 'status' });
  body.append(node('p', pathName(directory) + ' · delt med PC-en'), search, feedback, controls,
    button('Tilbake til innstillinger', showSettings));
  if (plugins) controls.before(node('p', 'Bruk Utforsk skills i OMP Desktop for å installere, oppdatere eller fjerne skills.'));
  try {
    const queryArgs = { cwd: directory, ...(file && { file }) };
    const data = await api(route, queryArgs);
    if (!controls.isConnected) return;
    const grouped = value => plugins ? {
      'Innebygd i OMP Desktop': value.builtIn || [],
      'Installert i OMP': [...(value.npm || []),
        ...(value.marketplace || []).flatMap(plugin => plugin.entries?.map(entry => ({ ...plugin, ...entry })) || [plugin])],
      'Skills funnet av OMP': value.skills || []
    } : value;
    let groups = grouped(data);
    function refreshRows() {
      controls.replaceChildren();
      const query = search.value.trim().toLowerCase();
      for (const [name, entries] of Object.entries(groups)) {
        const rows = entries.filter(item => ((item.name || item.id) + ' ' + name).toLowerCase().includes(query));
        if (!rows.length && query) continue;
        const group = node('section', null, { class: 'workspace-resource-group' });
        group.append(node('h3', name));
        if (!rows.length) group.append(node('p', 'Ingen oppføringer.'));
        for (const item of rows) {
          if (plugins && item.kind === 'skill' && typeof item.globalEnabled === 'boolean') {
            group.append(window.ompTurnUI.skillControls(item, !!file, {
              change: (scope, enabled) => api(route, null, { cwd: directory, file, action: 'set-skill-scope', target: item.name, scope, enabled }),
              test: () => api(route, null, { cwd: directory, file, action: 'test-skill', target: item.name }),
              report: error => { feedback.textContent = error.message; }
            }));
            continue;
          }
          const label = node('label', null, { class: 'workspace-toggle' });
          const text = node('span', item.name || item.id);
          const state = node('small');
          const toggle = node('input', null, { type: 'checkbox', role: 'switch', 'aria-label': item.name || item.id });
          toggle.checked = item.enabled ?? item.status === 'enabled';
          const testRow = plugins && name === 'Innebygd i OMP Desktop' ? window.ompTurnUI.pluginTest(item.test, toggle.checked,
            () => api(route, null, { cwd: directory, action: 'test', target: item.id })) : null;
          const hint = () => { state.textContent = (toggle.checked ? 'Aktivert' : 'Deaktivert') +
            (item.description || item.detail ? ' · ' + (item.description || item.detail) : ''); };
          hint();
          toggle.onchange = async () => {
            const enabled = toggle.checked;
            toggle.disabled = true;
            toggle.setAttribute('aria-busy', 'true');
            try {
              const isPlugin = plugins && item.kind !== 'skill';
              await api(isPlugin ? route : '/api/omp/workspace/resources', null, isPlugin ? { cwd: directory, target: item.id || item.packageName || item.name,
                scope: item.scope, action: enabled ? 'enable' : 'disable' } : { cwd: directory, kind: item.kind, name: item.name, enabled });
              item.enabled = enabled;
              if (testRow) {
                testRow.querySelector('button').disabled = !enabled;
                testRow.querySelector('[role="status"]').textContent = '';
                delete item.test;
              }
              feedback.textContent = 'Lagret for prosjektet.';
            } catch (error) { toggle.checked = !enabled; feedback.textContent = error.message; }
            finally { toggle.disabled = false; toggle.removeAttribute('aria-busy'); hint(); }
          };
          text.append(state);
          label.append(text, toggle);
          group.append(label);
          if (testRow) group.append(testRow);
          if (plugins && item.scope === 'global' && item.override !== null) group.append(button('Bruk global innstilling', async () => {
            await api(route, null, { cwd: directory, action: 'set-skill', scope: 'project', enabled: null, name: item.name });
            await showSharedWorkspace(true);
          }));
        }
        controls.append(group);
      }
      if (!controls.childElementCount) controls.append(node('p', query ? 'Ingen treff.' : 'Ingen oppføringer.'));
    }
    search.oninput = refreshRows;
    feedback.textContent = '';
    refreshRows();
    const visible = () => controls.isConnected && $('sheet').open;
    async function refreshPluginState() {
      if (!visible()) return;
      try {
        const waiting = () => controls.querySelector('[aria-busy="true"]');
        if (!waiting()) {
          const next = grouped(await api(route, queryArgs));
          if (visible() && !waiting() && JSON.stringify(next) !== JSON.stringify(groups)) {
            groups = next;
            refreshRows();
          }
        }
      } catch {} finally { if (visible()) setTimeout(refreshPluginState, 8000); }
    }
    if (plugins) setTimeout(refreshPluginState, 8000);
  } catch (error) { feedback.textContent = error.message; }
}

async function showProviders() {
  const body = sheet('Leverandører');
  body.append(node('p', 'Henter delte leverandører fra PC-en …'));
  try {
    const data = await api('/api/omp/providers');
    body.replaceChildren(node('p', 'Leverandører administreres i OMP Desktop.'));
    for (const item of data.providers || []) {
      const row = node('div', null, { class: 'card' });
      row.append(node('h3', item.name || item.id), node('small', item.hasKey ? 'Nøkkel konfigurert på PC-en' : 'Tilgjengelig fra PC-en'));
      body.append(row);
    }
  } catch (error) { body.replaceChildren(node('p', error.message)); }
}

function chatAction(label, icon, action, className = '') {
  return addIcon(button(label, action, 'chat-action ' + className), icon);
}

function showChatActions(item) {
  const body = sheet('Samtalehandlinger');
  body.append(node('p', chatName(item), { class: 'chat-action-title' }),
    chatAction('Gi nytt navn', 'edit', () => rename(item)),
    chatAction('Arkiver', 'archive', () => confirmChatRemoval(item, false)),
    chatAction('Flytt til papirkurven', 'trash', () => confirmChatRemoval(item, true), 'danger'));
}

function chatFeedback() {
  return node('p', null, { class: 'chat-feedback', role: 'status' });
}

function refreshChatList(message) {
  render();
  status(message);
  setTimeout(() => refresh(false).catch(() => {}), 0);
}

function rename(item) {
  const body = sheet('Gi nytt navn');
  const [label, field] = input('Navn', { value: chatName(item), required: '', maxlength: '150' });
  const form = node('form');
  const save = node('button', 'Lagre', { type: 'submit', class: 'accent' });
  const feedback = chatFeedback();
  form.append(label, feedback, save);
  form.onsubmit = async event => {
    event.preventDefault();
    if (save.disabled) return;
    const name = field.value.trim();
    if (!name) { feedback.textContent = 'Skriv inn et navn.'; return; }
    save.disabled = true;
    try {
      await api('/api/sessions/name', null, { file: item.file, cwd: item.cwd, name });
      item.title = name;
      for (const entry of sessions) if (same(entry.file, item.file)) entry.title = name;
      if (same(item.file, activeFile)) activeTitle = name;
      $('sheet').close();
      refreshChatList('Samtalen har fått nytt navn.');
    } catch (error) { feedback.textContent = error.message; }
    finally { save.disabled = false; }
  };
  body.append(form, button('Tilbake', () => showChatActions(item)));
  field.focus();
  field.select();
}

function confirmChatRemoval(item, trash) {
  const body = sheet(trash ? 'Flytt til papirkurven?' : 'Arkiver samtalen?');
  const feedback = chatFeedback();
  const apply = button(trash ? 'Flytt til papirkurven' : 'Arkiver samtale', async () => {
    apply.disabled = true;
    try {
      if (trash) await api('/api/session', { file: item.file }, undefined, 'DELETE');
      else await api('/api/sessions/archive', null, { file: item.file, archived: true });
      sessions = sessions.filter(entry => !same(entry.file, item.file));
      if (same(item.file, activeFile)) select(cwd, '', '');
      $('sheet').close();
      refreshChatList(trash ? 'Samtalen er flyttet til papirkurven.' : 'Samtalen er arkivert.');
    } catch (error) { feedback.textContent = error.message; }
    finally { apply.disabled = false; }
  }, trash ? 'danger' : 'accent');
  body.append(node('p', chatName(item), { class: 'chat-action-title' }),
    node('p', 'Samtalen skjules på mobilen og PC-en. Du kan hente den tilbake fra Arkiv og papirkurv.'),
    feedback, apply, button('Avbryt', () => showChatActions(item)));
}

async function showSavedChats(trash = false) {
  const body = sheet('Arkiv og papirkurv');
  const tabs = node('div', null, { class: 'chat-action-tabs' });
  const archiveTab = chatAction('Arkiv', 'archive', () => showSavedChats());
  const trashTab = chatAction('Papirkurv', 'trash', () => showSavedChats(true));
  archiveTab.setAttribute('aria-pressed', String(!trash));
  trashTab.setAttribute('aria-pressed', String(trash));
  tabs.append(archiveTab, trashTab);
  const list = node('div');
  const feedback = chatFeedback();
  feedback.textContent = 'Henter samtaler …';
  body.append(tabs, feedback, list);
  try {
    const data = await (trash ? api('/api/trash') : api('/api/sessions', { archived: 1 }));
    const items = trash ? data.items : data.sessions.filter(item => item.archived);
    feedback.textContent = items.length ? '' : 'Ingen samtaler her.';
    for (const item of items) {
      const row = node('div', null, { class: 'chat-recovery-row' });
      const restore = button('Gjenopprett', async () => {
        restore.disabled = true;
        try {
          if (trash) await api('/api/trash/restore', null, { file: item.file });
          else await api('/api/sessions/archive', null, { file: item.file, archived: false });
          row.remove();
          feedback.textContent = 'Gjenopprettet «' + chatName(item) + '».';
          refreshChatList('Samtalen er gjenopprettet.');
        } catch (error) { feedback.textContent = error.message; }
        finally { restore.disabled = false; }
      });
      restore.setAttribute('aria-label', 'Gjenopprett ' + chatName(item));
      row.append(node('span', chatName(item)), restore);
      list.append(row);
    }
  } catch (error) { feedback.textContent = error.message; }
}

function showTerminal() {
  const body = sheet('Terminal · ' + pathName(cwd));
  if (!origin || !cwd) { body.append(node('p', 'Velg et prosjekt først.')); return; }
  const form = node('form');
  const [label, command] = input('Kommando på PC-en', { required: '', autocomplete: 'off' });
  const run = node('button', 'Kjør', { type: 'submit', class: 'accent' });
  const output = node('pre');
  form.append(label, run);
  body.append(form, output);
  form.onsubmit = async event => {
    event.preventDefault();
    run.disabled = true;
    try {
      const data = await api('/api/bash', null, { cwd, command: command.value });
      output.textContent += '> ' + command.value + '\n' + (data.result?.output || JSON.stringify(data.result, null, 2)) + '\n';
      command.value = '';
    } catch (error) { output.textContent += error.message + '\n'; }
    finally { run.disabled = false; }
  };
}

async function showGit() {
  const body = sheet('Git · ' + pathName(cwd));
  if (!origin || !cwd) { body.append(node('p', 'Velg et prosjekt først.')); return; }
  body.append(node('p', 'Henter Git-status …'));
  try {
    const data = await api('/api/git/status', { path: cwd });
    body.replaceChildren(node('p', 'Gren ' + (data.branch?.head || data.branch || 'ukjent')));
    const files = data.files || data.changes || [];
    for (const item of files) {
      const file = item.path || item.file;
      if (file) body.append(folderRow(file, item.staged && !item.unstaged ? 'Klargjort' : item.status || 'Endret',
        () => showDiff(file, item.staged && !item.unstaged), 'file'));
    }
    const row = node('div', null, { class: 'row' });
    row.append(button('Arbeidsdiff', () => showDiff('')), button('Staget diff', () => showDiff('', true)));
    body.append(row);
    if (!files.length) body.append(node('p', 'Ingen filer oppgitt i Git-statusen.'));
  } catch (error) { body.replaceChildren(node('p', error.message)); }
}

async function showDiff(file, staged = false) {
  const body = sheet(file || 'Git-diff');
  try {
    const data = await api('/api/git/diff', { path: cwd, file, staged: staged ? 1 : 0 });
    body.append(node('pre', data.diff || 'Ingen tekstendringer.'));
    if (file) {
      body.append(button(staged ? 'Fjern fra staging' : 'Stage fil', async () => {
        await api(staged ? '/api/git/unstage' : '/api/git/stage', null, { cwd, files: [file] });
        await showGit();
      }));
    }
  } catch (error) { body.append(node('p', error.message)); }
}

function showFiles() {
  if (origin) return browseFolders(cwd, false, true);
  return showSettings();
}

window.pairingStarted = () => status('Kobler til PC-en …');
window.onPairing = async (address, error) => {
  if (error) { status(error); if ($('sheet').open) $('sheetBody').append(node('p', error)); return; }
  if (origin && cwd) saveDraft(draftKey(), $('prompt').value);
  for (const request of pending.values()) request.reject(new Error('PC-en ble byttet.'));
  pending.clear();
  origin = address;
  savedComputers = computers();
  cwd = '';
  sessions = [];
  projects = [];
  sharedWorkspace = false;
  const previous = origin ? storedValue(workspaceStorage(origin), {}) : {};
  status(origin ? 'Tilkoblet PC' : '');
  if ($('sheet').open) $('sheet').close();
  select(previous.cwd || '', previous.file || '', '');
  drawThreads();
  await refresh(false).catch(failure => status(failure.message));
};
window.onResumeApp = () => {
  if (origin) {
    if ($('sheet').open) $('sheetBody').querySelector('[data-adb-refresh]')?.click();
    watch();
    refresh(false).catch(() => {});
    recoverRuntime().catch(() => {});
  }
};
window.onThreadLink = async (file, check) => {
  if (!origin) { status('Koble mobilen til PC-en først.'); return; }
  try {
    const { sessions } = await api('/api/sessions');
    const match = sessions?.find(item => same(item.file, file));
    if (!match?.cwd) throw new Error('Fant ikke tråden på den tilkoblede PC-en.');
    if ($('sheet').open) $('sheet').close();
    requestedCheck = /^[a-f0-9-]{36}$/.test(check || '') ? { file, id: check } : null;
    await chooseThread(match);
    if (requestedCheck) render();
  } catch (error) { status(error.message); }
};
window.androidBack = () => {
  if ($('approval').open) return true;
  if ($('sheet').open) { $('sheet').close(); return true; }
  if (!$('drawer').hidden) { showDrawer(false); return true; }
  return false;
};

$('historyBtn').onclick = () => showDrawer(true);
$('closeDrawer').onclick = $('scrim').onclick = () => showDrawer(false);
$('topTitle').onclick = showProjects;
$('computerPicker').onclick = showComputers;
$('lightContext').onclick = () => { lightContext = !(lightContext ?? currentProfile?.light ?? false); render(); };
$('chatMode').onchange = () => { chatMode = $('chatMode').value; render(); };
const voiceMode = window.createVoiceMode({
  button: $('voiceMode'), indicator: $('voiceStatus'), language: $('voiceLanguage'),
  request: (route, body) => api('/api/voice' + route, null, body),
  conversation: () => origin && activeFile,
  send: async text => {
    if ($('prompt').value.trim() || streaming || submitting) throw new Error('Fullfør oppgaven eller utkastet før du fortsetter med tale.');
    $('prompt').value = text;
    await send(new Event('submit'));
  },
  answer: text => {
    if (streaming || submitting) return;
    const messages = [...history, ...live];
    const recent = messages.reverse();
    const index = recent.findIndex(item => item.role === 'user' && item.text === text);
    return index >= 0 ? recent.slice(0, index).find(item => item.role === 'assistant')?.text : undefined;
  }
});
$('voiceOpen').onclick = () => {
  $('voiceStatus').textContent = 'Trykk på bølgen for å begynne.';
  $('voiceDialog').showModal();
};
$('voiceClose').onclick = () => $('voiceDialog').close();
$('voiceDialog').addEventListener('close', voiceMode.stop);
$('newBtn').onclick = $('drawerNew').onclick = newThread;
for (const [id, icon] of [['drawerNew', 'plus'], ['projects', 'folder'], ['computerPicker', 'computers'], ['savedChats', 'archive'], ['git', 'git'],
  ['files', 'file'], ['terminal', 'terminal'], ['settings', 'settings'], ['powerSettings', 'power']]) {
  const control = $(id);
  if (control.closest('.drawer-actions')) control.replaceChildren(node('span', control.textContent));
  addIcon(control, icon);
}
$('projects').onclick = showProjects;
$('settings').onclick = showSettings;
$('powerSettings').onclick = showPowerSettings;
$('savedChats').onclick = () => origin ? showSavedChats() : showSettings();
$('git').onclick = showGit;
$('terminal').onclick = showTerminal;
$('files').onclick = () => showFiles();
$('modelBtn').onclick = showModels;
$('closeSheet').onclick = () => $('sheet').close();
$('composer').onsubmit = send;
$('prompt').oninput = () => {
  if (origin && cwd) saveDraft(draftKey(), $('prompt').value);
  $('send').disabled = !origin || !cwd || submitting || streaming || !$('prompt').value.trim();
};

// Kant-sveip: dra fra venstre kant for å åpne menyen, i stedet for å måtte
// treffe knappen øverst i hjørnet.
let edgeTouch = null;
window.addEventListener('touchstart', event => {
  if (event.touches.length !== 1 || !$('drawer').hidden) return;
  if (event.touches[0].clientX <= 22) edgeTouch = { x: event.touches[0].clientX, y: event.touches[0].clientY };
}, { passive: true });
window.addEventListener('touchmove', event => {
  if (!edgeTouch || event.touches.length !== 1) return;
  const dx = event.touches[0].clientX - edgeTouch.x;
  const dy = event.touches[0].clientY - edgeTouch.y;
  if (dx > 60 && Math.abs(dy) < dx * 0.6) { edgeTouch = null; showDrawer(true); }
}, { passive: true });
const clearEdgeTouch = () => { edgeTouch = null; };
window.addEventListener('touchend', clearEdgeTouch, { passive: true });
window.addEventListener('touchcancel', clearEdgeTouch, { passive: true });

$('stop').onclick = async () => {
  try {
    // A brand-new conversation has no activeFile until /api/prompt returns, but
    // the runtime file is known; comparing against activeFile alone made Stop
    // impossible for the whole first turn.
    const target = activeFile || runtimeFile;
    if (!target) throw new Error('Ingen aktiv samtale å stoppe.');
    const state = await api('/api/state', { cwd, file: target });
    const sessionFile = state.sessionFile || state.state?.sessionFile;
    if (sessionFile && !same(sessionFile, target)) throw new Error('En annen samtale er aktiv på PC-en.');
    await api('/api/abort', null, { cwd, file: target });
    streaming = false;
    render();
    laterHistory();
  } catch (error) { status(error.message); }
};
$('attach').onclick = () => bridge.photo();
window.onAttachment = (payload, error) => {
  if (error) { status(error); return; }
  attachment = { name: 'Bilde vedlagt', image: JSON.parse(payload) };
  render();
};
let searchTimer;
$('search').oninput = () => {
  clearTimeout(searchTimer);
  drawThreads();
  searchTimer = setTimeout(() => refresh(false).catch(() => {}), 450);
};
applyAppearance();
$('prompt').value = drafts.get(draftKey()) || '';
render();
if (origin) {
  watch();
  refresh(true).catch(error => status(error.message));
  recoverRuntime().catch(() => {});
}
setInterval(() => {
  if (!origin) return;
  if (document.hidden) return; // do not poll while backgrounded
  if (streaming) recoverRuntime().catch(() => {});
  refresh(false).catch(() => {});
}, 5500);
document.addEventListener('visibilitychange', () => {
  if (!document.hidden && origin) { watch(); refresh(false).catch(() => {}); }
});
