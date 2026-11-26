const $ = id => document.getElementById(id);
const run = (action, data) => window.desktop.run(action, data);
const messageActions = window.ompTurnUI.messageActions({
  copy: text => run('copyMessage', text),
  speak: (id, text) => run('readMessage', { id, text }),
  stop: () => run('stopReading'),
  report: error => report(error instanceof Error ? error : new Error(error))
});

const { iconButton, adbPanel } = window.ompTurnUI;
const themes = [
  ['fjord', 'Blåtime', '#171c26', '#151922', '#202633', '#8fa9e6', true],
  ['codex', 'Codex-inspirert', '#181818', '#212121', '#2b2b2b', '#8ba8eb', true, 'OpenAI Sans', 'Cascadia Code'],
  ['claude', 'Claude Code-inspirert', '#171716', '#141413', '#252422', '#d97757', true, 'Poppins', 'Consolas'],
  ['omp', 'Oh My Pi-inspirert', '#221337', '#1e1629', '#2c2038', '#d1a6fa', true],
  ['nord', 'Nordlys', '#222c44', '#202a3e', '#29354c', '#a1d3e7', true],
  ['skog', 'Skog', '#253c30', '#f1f6ed', '#e1ecdc', '#3b6546'],
  ['kobber', 'Kobber', '#382b25', '#f9f1e7', '#eee0d2', '#8a4b2c'],
  ['midnatt', 'Midnatt', '#111923', '#131d2a', '#1c2839', '#a5bdff', true],
  ['lavendel', 'Lavendel', '#332959', '#faf7ff', '#efe7fb', '#6644a5'],
  ['grafitt', 'Grafitt', '#191b20', '#24262b', '#303238', '#e4e5ec', true]
];
const tabs = { general: 'Generelt', models: 'Modeller', bridge: 'Tilkobling', wol: 'Wake-on-LAN', theme: 'Utseende', resources: 'OMP-ressurser', machine: 'Maskinressurser', plugins: 'Plugins', device: 'Enheter', omp: 'OMP' };
const tabKeywords = { general: 'autostart oppstart innlogging pålogging windows', wol: 'strøm vekk pc relé ethernet mobil', models: 'api nøkkel modell ollama strata llama leverandør standard', bridge: 'synkronisering android mobil qr bridge',
  theme: 'tema font skrift farge aksent', resources: 'agent skill verktøy mcp', machine: 'gpu vram cpu ram temperatur', plugins: 'installer', device: 'adb android telefon feilsøking', omp: 'versjon omp.exe profil' };
const threadViews = new Map();
const drafts = new Map();
const requests = [];
const interactiveRequests = new Set(['confirm', 'input', 'select', 'editor', 'ask']);
let activeRequest;
let state;
let activeId;
let activeTab;
let models = [];
let pickerId;
let pickerGeneration = 0;
let modelFilter = 'all';
const modelCatalogs = new Map();
const modelLoads = new Map();
let modelChanging = false;
let tabGeneration = 0;
let version;
let bridgeRefreshing = false;

function element(tag, text, attributes = {}) {
  const result = document.createElement(tag);
  if (text != null) result.textContent = text;
  for (const [name, value] of Object.entries(attributes)) result.setAttribute(name, value);
  return result;
}

function button(text, action, attributes = {}) {
  const result = element('button', text, { type: 'button', ...attributes });
  result.onclick = () => Promise.resolve().then(action).catch(report);
  return result;
}

function report(error) {
  status(error.message.replace(/^Error invoking remote method 'desktop': Error: /, ''));
}

function status(message) {
  $('activity').textContent = message || '';
  $('activity').title = message || '';
}

const currentTheme = () => themes.find(theme => theme[0] === state.theme) || themes[0];

function applyTheme(custom = state.appearance || {}) {
  const [, , rail, defaultPaper, defaultPanel, defaultAccent, dark, uiFont, codeFont] = currentTheme();
  const accent = custom.accent || state.accent || defaultAccent;
  const paper = custom.paper || defaultPaper;
  const panel = custom.panel || defaultPanel;
  const [red, green, blue] = accent.slice(1).match(/../g).map(value => {
    const channel = parseInt(value, 16) / 255;
    return channel <= .04045 ? channel / 12.92 : ((channel + .055) / 1.055) ** 2.4;
  });
  const lightAccent = red * .2126 + green * .7152 + blue * .0722 > .179;
  const root = document.documentElement;
  const colors = {
    rail, paper, panel, accent, text: custom.text || (state.theme === 'claude' ? '#faf9f5' : dark ? '#e9edf4' : '#222330'),
    muted: state.theme === 'claude' ? '#b0aea5' : dark ? '#aab4c5' : '#626477', line: dark ? '#384253' : '#dedee7',
    'accent-text': lightAccent ? '#000' : '#fff', added: dark ? '#9bdfb1' : '#287a49',
    removed: dark ? '#f5a7a7' : '#aa363b',
    selection: `color-mix(in srgb, ${accent} 17%, ${paper})`
  };
  root.style.colorScheme = dark ? 'dark' : 'light';
  const uiFamily = JSON.stringify(custom.uiFont || uiFont || 'Segoe UI') + ', "Segoe UI", sans-serif';
  root.style.setProperty('--ui-font', uiFamily);
  root.style.setProperty('--code-font', JSON.stringify(custom.codeFont || codeFont || 'Consolas') + ', Consolas, monospace');
  for (const [key, value] of Object.entries(colors)) root.style.setProperty('--' + key, value);
  document.body.style.color = colors.text;
  document.body.style.backgroundColor = paper;
  document.body.style.fontFamily = uiFamily;
  run('appearanceChrome', { background: paper, text: colors.text }).catch(() => {});
}

const basename = path => path.split(/[\\/]/).filter(Boolean).at(-1) || path;
const thread = () => state.threads.find(item => item.id === activeId);
const chatProfiles = new Map();
const view = id => {
  if (!threadViews.has(id)) threadViews.set(id, { messages: [], attachments: [], commands: [], connected: false, busy: false });
  return threadViews.get(id);
};

const expandedProjects = new Set();
const threadLimits = new Map();
const otherThreads = Symbol();
let bridgeReachable = true;
const projectKey = directory => directory.replace(/\\/g, '/').replace(/\/$/, '').toLowerCase();
const cleanTitle = title => (title || '').replace(/[\p{Co}\uFFFD]/gu, '').trim() || 'Samtale';

function projectMenu(title, actions) {
  const menu = element('details', null, { class: 'sidebar-menu' });
  const trigger = element('summary', '⋯', { class: 'sidebar-icon', title, 'aria-label': title });
  const panel = element('div', null, { class: 'sidebar-menu-items' });
  for (const [label, action] of actions) panel.append(button(label, () => { menu.open = false; return action(); }));
  menu.append(trigger, panel);
  menu.ontoggle = () => {
    if (menu.open) for (const other of document.querySelectorAll('.sidebar-menu[open]')) {
      if (other !== menu) other.open = false;
    }
  };
  return menu;
}

function renderProjects() {
  const list = $('projectList');
  const scroll = list.scrollTop;
  const query = $('sidebarSearch').value.trim().toLowerCase();
  const pinned = state.pinnedProjects;
  const groups = new Map(pinned.map(project => [projectKey(project), []]));
  const other = [];
  const running = [];
  for (const item of state.threads) {
    if (item.hiddenFromSidebar) continue;
    if (item.activity) running.push(item);
    else (groups.get(projectKey(item.project)) || other).push(item);
  }
  const matches = item => [cleanTitle(item.title), item.project].some(value => value.toLowerCase().includes(query));
  const groupRows = [];

  function rows(key, entries, imported = false, showAll = false) {
    const container = element('div', null, { class: 'sidebar-threads' });
    const limit = threadLimits.get(key) || 4;
    const visible = query || showAll ? entries : entries.slice(-limit).reverse();
    const active = entries.find(item => item.id === activeId);
    if (!query && active && !visible.includes(active)) visible.unshift(active);
    for (const item of visible) {
      const title = cleanTitle(item.title);
      const row = element('div', null, { class: 'sidebar-thread-row' });
      const open = button('', () => connect(item.id), {
        class: 'thread', title: title, 'aria-current': String(item.id === activeId)
      });
      open.append(element('span', title, { class: 'thread-title' }));
      if (item.activity) {
        const label = item.activity === 'waiting' ? 'Venter på svar' : 'Jobber';
        open.append(element('span', label, { class: 'thread-activity ' + item.activity, title: label }));
      }
      if (item.shared) open.append(element('span', '↔', { class: 'thread-shared', title: 'Delt med Android', 'aria-label': 'Delt med Android' }));
      row.append(open);
      const actions = [];
      if (item.shared && item.sessionFile) actions.push(['Gi nytt navn', () => renameSharedChat(item)]);
      actions.push(['Flytt til papirkurven', () => confirmTrashThread(item)]);
      if (imported) actions.push(['Vis som prosjekt', async () => {
        state = await run('pinProject', item.project);
        expandedProjects.add(projectKey(item.project));
        renderProjects();
      }]);
      if (actions.length) row.append(projectMenu(title + ' · handlinger', actions));
      container.append(row);
    }
    if (!visible.length) container.append(element('p', 'Ingen samtaler ennå.', { class: 'sidebar-empty' }));
    if (visible.length < entries.length) container.append(button('Vis flere samtaler', () => {
      threadLimits.set(key, limit + 8);
      renderProjects();
    }, { class: 'sidebar-more' }));
    return container;
  }

  function group(key, name, entries, project) {
    const section = element('section', null, { class: 'sidebar-group' });
    const row = element('div', null, { class: 'sidebar-project-row' });
    const expanded = !!query || expandedProjects.has(key);
    const toggle = button('', () => {
      if (query) return;
      if (expanded) expandedProjects.delete(key);
      else expandedProjects.add(key);
      renderProjects();
      list.querySelectorAll('.sidebar-project-toggle')[groupRows.indexOf(section)]?.focus();
    }, { class: 'sidebar-project-toggle', 'aria-expanded': String(expanded), title: project || name });
    toggle.append(element('span', expanded ? '▾' : '▸', { 'aria-hidden': 'true' }), element('span', name, { class: 'sidebar-project-name' }));
    row.append(toggle);
    if (project) {
      row.append(button('+', () => newThread(project), { class: 'sidebar-icon', title: 'Ny samtale', 'aria-label': 'Ny samtale i ' + name }));
      const actions = [['Ny worktree', () => newThread(project, true)]];
      if (state.bridgeAddress) actions.push(['Ny lokal samtale', () => newThread(project, false, true)]);
      actions.push(['Åpne mappe i Utforsker', () => run('showProjectFolder', project)]);
      actions.push(['Fjern prosjekt', () => confirmRemoveProject(project)]);
      row.append(projectMenu(name + ' · handlinger', actions));
    }
    section.append(row);
    if (expanded) section.append(rows(key, entries, !project));
    groupRows.push(section);
  }

  const activeRows = running.filter(matches).sort((a, b) => Number(b.activity === 'waiting') - Number(a.activity === 'waiting'));
  if (activeRows.length) {
    const section = element('section', null, { class: 'sidebar-group sidebar-running', 'aria-label': 'Aktive samtaler' });
    section.append(element('h2', 'Aktive samtaler', { class: 'thread-activity-heading' }), rows(null, activeRows, false, true));
    groupRows.push(section);
  }
  for (const project of pinned) {
    const key = projectKey(project);
    const projectMatches = project.toLowerCase().includes(query);
    const entries = projectMatches ? groups.get(key) : groups.get(key).filter(matches);
    if (projectMatches || entries.length) group(key, basename(project), entries, project);
  }
  const imported = other.filter(matches);
  if (imported.length) group(otherThreads, 'Oh My Pi-samtaler', imported);
  list.replaceChildren(...groupRows);
  if (!groupRows.length) list.append(element('p', query ? 'Ingen treff.' : 'Åpne en mappe for å legge til et prosjekt.', { class: 'sidebar-empty' }));
  list.scrollTop = scroll;
  updateSyncStatus();
}

function updateSyncStatus() {
  const online = state.bridgeAddress && bridgeReachable;
  $('syncStatus').textContent = online ? 'Bridge tilkoblet' : 'Bridge frakoblet';
  $('syncStatus').classList.toggle('online', !!online);
  $('syncChats').textContent = state.bridgeAddress ? 'Oppdater' : 'Koble til';
}

function messageText(content) {
  if (typeof content === 'string') return content;
  return (content || []).filter(item => item.type === 'text').map(item => item.text).join('\n');
}

function historyEntries(messages = []) {
  const calls = new Map();
  const results = new Set(messages.filter(item => item.role === 'toolResult').map(item => item.toolCallId));
  return messages.flatMap(item => {
    for (const call of item.toolCalls || item.content?.filter?.(block => block.type === 'toolCall') || []) {
      calls.set(call.id, call.args || call.arguments);
    }
    const text = item.text ?? (messageText(item.content) || item.errorMessage || '');
    if (['tool', 'toolResult', 'terminal', 'bashExecution', 'pythonExecution'].includes(item.role)) {
      const name = item.toolName || item.role;
      const command = item.command || calls.get(item.toolCallId)?.command;
      return [{ id: item.toolCallId || item.id, role: 'tool', toolName: name, command,
        label: name + (command ? ' · ' + command.split('\n')[0] : '') + (item.isError ? ' · feilet' : item.status === 'no-result' ? ' · uten resultat' : ' · ferdig'),
        output: text || item.output, done: true }];
    }
    if (['user', 'assistant'].includes(item.role) && !item.synthetic) {
      const output = [{ id: item.id, role: item.role, text, usage: item.usage, timestamp: item.timestamp, segments: item.segments || window.ompTurnUI.segmentsOf(item.content) }];
      if (item.role === 'assistant' && Array.isArray(item.content) && !item.toolCalls) {
        for (const call of item.content) {
          if (call.type !== 'toolCall' || !call.id || results.has(call.id)) continue;
          const command = call.arguments?.command;
          output.push({ id: call.id, role: 'tool', toolName: call.name, command, done: true,
            label: call.name + (command ? ' · ' + command.split('\n')[0] : '') + ' · uten resultat', output: '' });
        }
      }
      return output;
    }
    return [];
  });
}

let chatScroll;
function renderConversation() {
  $('chatModeMenu').hidden = $('lightContextLabel').hidden = !thread()?.shared;
  $('voiceOpen').hidden = !thread()?.shared;
  const profile = chatProfiles.get(activeId) || view(activeId).chatProfile;
  $('chatMode').value = profile?.mode || 'build';
  $('chatMode').title = 'Arbeidsmodus · ' + $('chatMode').selectedOptions[0].textContent;
  $('lightContext').checked = profile?.light || false;
  window.ompModePicker?.sync();
  const current = view(activeId);
  const turnUI = window.ompTurnUI;
  turnUI.thinkingChoice($('thinkingLevel'), current.model, current.busy);
  const speed = turnUI.generation(activeId && 'desktop:' + activeId);
  turnUI.tokenUsage($('tokenUsage'), current.messages, current.model, current.contextUsage, turnUI.generationDetails(speed));
  turnUI.todo($('todoPanel'), activeId ? current.todos : [], activeId);
  const timeline = $('timeline');
  chatScroll ||= turnUI.conversationScroll(timeline, timeline, $('jumpLatest'));
  const scroll = chatScroll.capture(activeId);
  timeline.replaceChildren();
  const entries = turnUI.timeline(current.messages, current.cards || [], current.checks || []);
  for (const [index, entry] of entries.entries()) {
    if (entry.role === 'turn_changes') {
      const id = activeId;
      timeline.append(turnUI.card(entry.card, (card, file) => showTurnDiff(id, card, file),
        card => confirmTurnUndo(id, card), !current.busy));
    } else if (entry.role === 'project_check') {
      timeline.append(button(testSummary(entry.check), () => {
        current.selectedCheck = entry.check.id;
        return openReview('tests');
      }, { class: 'git-summary' }));
    } else if (entry.role === 'tool') {
      const item = element('details', null, { class: 'tool' });
      item.open = current.openTools?.has(entry.id) || false;
      item.ontoggle = () => {
        current.openTools ||= new Set();
        if (item.open) current.openTools.add(entry.id);
        else current.openTools.delete(entry.id);
      };
      item.append(element('summary', entry.label), element('pre', entry.output));
      timeline.append(item);
    } else if (entry.text || entry.segments?.some(block => block.text)) {
      const card = element('article', null, { class: 'message ' + entry.role });
      card.append(element('small', entry.role === 'user' ? 'Du' : 'Oh My Pi'));
      turnUI.appendSegments(card, entry, activeId + ':' + (entry.id || index), text => card.append(element('p', text)));
      const group = element('div', null, { class: 'chat-turn ' + entry.role });
      const actions = messageActions.row(entry.text, activeId + ':' + index);
      const time = window.ompLocale.messageTime(entry.timestamp);
      if (time) actions.append(time);
      group.append(card, actions);
      timeline.append(group);
    } else continue;
    timeline.lastElementChild.dataset.scrollKey = turnUI.scrollEntryKey(entry, index);
  }
  if (current.gitFiles && entries.length && !current.cards?.length) timeline.append(button(
    current.gitFiles === 1 ? '1 fil endret' : current.gitFiles + ' filer endret',
    () => openReview('changes'), { class: 'git-summary' }
  ));
  if (current.busy || current.modelPhase) {
    const settled = ['ready', 'cloud', 'failed'].includes(current.modelPhase?.phase);
    const indicator = element('div', (current.modelPhase && turnUI.modelProgress(current.modelPhase)) || current.workPhase || 'OMP arbeider',
      { class: 'work-indicator' + (settled ? ' settled' : ''), role: 'status' });
    const dots = element('span', '', { class: 'work-dots', 'aria-hidden': 'true' });
    dots.append(element('i', '.'), element('i', '.'), element('i', '.'));
    indicator.append(dots);
    const row = element('div', null, { class: 'generation-row' });
    row.append(indicator);
    const rate = turnUI.speedButton(speed, $('tokenUsage'));
    if (rate) row.append(rate);
    timeline.append(row);
  }
  const fresh = !entries.length;
  document.querySelector('.workspace').classList.toggle('fresh', fresh);
  $('welcome').hidden = !fresh;
  chatScroll.restore(scroll);
  $('welcomeHint').textContent = current.connected ? 'Skriv en oppgave for prosjektet.' :
    activeId ? 'Start eller velg OMP under Innstillinger.' : 'Åpne en prosjektmappe for å starte.';
  $('title').textContent = thread()?.title || 'Ny tråd';
  $('health').replaceChildren(element('i'), document.createTextNode(current.connected
    ? current.remoteBusy ? 'Delt økt arbeider' : current.busy ? 'OMP arbeider' : 'OMP klar' : version || 'Finn OMP'));
  $('health').classList.toggle('online', current.connected);
  $('projectStatus').textContent = thread() ? basename(thread().project) : '';
  $('breadcrumbTitle').textContent = thread() ? cleanTitle(thread().title) : '';
  $('shareThread').disabled = $('threadOptions').disabled = !thread();
  $('openPreview').disabled = !thread();
  $('send').title = current.remoteBusy ? 'En annen enhet bruker denne tråden.' : '';
  $('message').disabled = !current.connected || current.busy;
  $('send').disabled = !current.connected || current.busy;
  $('attach').disabled = !current.connected || current.busy;
  $('model').disabled = current.busy;
  $('stop').hidden = !current.busy;
  $('send').hidden = current.busy;
  const shownModel = current.model || (!activeId ? state.preferredModel : null);
  $('model').textContent = shownModel ? (shownModel.name || shownModel.id) + ' ▾' : 'Velg modell ▾';
  const provider = current.model?.provider;
  const endpoint = current.model?.baseUrl;
  const local = ['ollama', 'llama', 'strata'].includes(shownModel?.engine) || (endpoint
    ? /^https?:\/\/(localhost|127\.0\.0\.1|\[::1\])([:/]|$)/i.test(endpoint)
    : ['ollama', 'llama.cpp', 'lm-studio', 'strata', 'local'].includes(provider));
  const scope = provider && (local ? 'Lokal' : 'Sky');
  $('location').hidden = !scope;
  $('location').textContent = scope || '';
  $('attachments').replaceChildren(...current.attachments.map((file, index) =>
    button(file.name + ' ×', () => { current.attachments.splice(index, 1); renderConversation(); }, { class: 'chip' })));
}

function updateTurnCard(current, card) {
  current.cards = [...(current.cards || []).filter(item => item.id !== card.id), card].sort((a, b) => a.at - b.at);
}

async function loadTurnData(id) {
  if (!id || !state.threads.some(item => item.id === id)) return;
  const current = view(id);
  const data = await run('turnData', id).catch(() => null);
  if (!data) return;
  const cards = data.cards || [];
  if (thread()?.shared && id === activeId) current.sharedChecks = new Set((data.checks || []).map(check => check.id));
  const checks = [...new Map([...(current.checks || []), ...(data.checks || [])].map(check => [check.id, check])).values()]
    .sort((first, second) => first.at - second.at).slice(-24);
  const todos = Array.isArray(data.todos) && !current.busy && !current.remoteBusy ? data.todos : current.todos;
  if (JSON.stringify([current.cards, current.todos, current.checks]) === JSON.stringify([cards, todos, checks])) return;
  current.cards = cards;
  current.todos = todos;
  current.checks = checks;
  if (id === activeId) { renderConversation(); updateProjectTest(id); }
}

async function showTurnDiff(id, card, file) {
  await openReview('changes', true);
  if (id !== activeId) return;
  const body = $('turnReview');
  body.hidden = false;
  body.replaceChildren(element('header', file.file, { class: 'turn-review-title' }),
    button('Til prosjektendringer', () => openReview('changes')));
  const region = element('div');
  body.append(region);
  if (file.binary || file.unavailable) {
    region.append(element('p', 'Tekstdiff er ikke tilgjengelig for denne filen.'));
    return;
  }
  try {
    const data = await run('turnDiff', { id, cardId: card.id, file: file.file });
    if (!region.isConnected) return;
    region.append(data.diff ? window.ompTurnUI.diff(data.diff) : element('p', 'Ingen tekstlinjer endret.'));
    if (file.truncated) region.append(element('p', 'Viser starten av en stor diff.', { class: 'form-status' }));
  } catch (error) { region.append(element('p', error.message, { class: 'form-status' })); }
}

function confirmTurnUndo(id, card) {
  const dialog = $('workspaceDialog');
  const body = openWorkspace('Angre filendringer?', 'git-setup-dialog');
  const actions = element('div', null, { class: 'dialog-actions' });
  const feedback = element('p', null, { class: 'form-status', role: 'status' });
  const cancel = button('Avbryt', () => dialog.close());
  const apply = button('Angre endringer', async () => {
    apply.disabled = true;
    try {
      const result = await run('turnUndo', { id, cardId: card.id });
      updateTurnCard(view(id), result.card);
      if (actions.isConnected) dialog.close();
      if (id === activeId) { renderConversation(); await refreshGit(); }
    } catch (error) { feedback.textContent = error.message; }
    finally { apply.disabled = false; }
  }, { class: 'primary' });
  actions.append(cancel, apply);
  body.append(element('p', 'Dette setter de ' + card.files.length + ' filene tilbake til versjonen før svaret. Kontroll av senere filendringer skjer før noe skrives.'),
    feedback, actions);
  cancel.focus();
}

async function refreshGit() {
  const id = activeId;
  if (!id) return;
  const data = await run('git', id);
  if (id !== activeId) return;
  $('branch').hidden = !data.repository;
  $('branch').textContent = data.branch || 'Frakoblet HEAD';
  const container = $('diff');
  container.replaceChildren();
  if (!data.status) {
    const errors = { untracked: 'Denne mappen har ingen Git-historikk.', 'missing-git': 'Git ble ikke funnet på PC-en.',
      'missing-folder': 'Arbeidsmappen finnes ikke lenger.', bare: 'Dette Git-repositoriet har ingen arbeidsmappe.' };
    container.append(element('p', data.repository ? 'Ingen endringer ennå' : errors[data.reason] || data.detail || 'Kunne ikke lese Git-statusen.', { class: 'empty' }));
    if (data.reason === 'untracked') {
      const setup = element('div', null, { class: 'git-setup' });
      setup.append(element('p', 'Bruk Git til å se endringer og lagre versjoner av prosjektet.'),
        button('Start Git-sporing', () => showGitSetup(id), { class: 'primary' }));
      container.append(setup);
    }
    if (view(id).gitFiles) { view(id).gitFiles = 0; renderConversation(); }
    return;
  }
  container.append(element('pre', data.status));
  const files = await run('gitFiles', id);
  if (id !== activeId) return;
  if (view(id).gitFiles !== files.length) { view(id).gitFiles = files.length; renderConversation(); }
  for (const { file, index, work } of files) {
    const row = element('div', null, { class: 'row git-file' });
    row.append(element('span', file));
    for (const [visible, staged] of [[work !== ' ', false], [index !== ' ' && index !== '?', true]]) {
      if (!visible) continue;
      const change = staged ? 'Fjern fra staging' : 'Stage fil';
      row.append(button(change, async () => {
        await run('gitChange', { id, file, staged });
        await refreshGit();
      }));
      if (work === '?' && !staged) continue;
      row.append(button(staged ? 'Stagede blokker' : 'Blokker', async () => {
        const body = openWorkspace(file);
        const changes = await run('gitHunks', { id, file, staged });
        for (const [hunk, block] of changes.entries()) {
          const group = element('section');
          group.append(element('pre', block.text), button(staged ? 'Fjern blokk fra staging' : 'Stage blokk', async () => {
            await run('gitChange', { id, file, staged, hunk, expected: block.text });
            $('workspaceDialog').close();
            await refreshGit();
          }));
          body.append(group);
        }
        if (!changes.length) body.append(element('p', 'Ingen tekstblokker.'));
      }));
    }
    container.append(row);
  }
  for (const [heading, text] of [['Klargjort', data.staged], ['Arbeidsmappe', data.diff]]) {
    if (!text) continue;
    const code = element('pre');
    for (const line of text.split('\n')) {
      const className = line.startsWith('+') ? 'add' : line.startsWith('-') ? 'del' : '';
      code.append(element('span', line, { class: className }));
    }
    container.append(element('h2', heading), code);
  }
}

function showGitSetup(id) {
  const item = state.threads.find(entry => entry.id === id);
  if (!item) return;
  const dialog = $('workspaceDialog');
  const body = openWorkspace('Start Git-sporing?', 'git-setup-dialog');
  const actions = element('div', null, { class: 'dialog-actions' });
  const feedback = element('p', '', { class: 'form-status', role: 'status', hidden: '' });
  const cancel = button('Avbryt', () => dialog.close());
  const start = button('Start Git-sporing', async () => {
    start.disabled = true;
    cancel.disabled = true;
    feedback.hidden = true;
    try {
      await run('gitInit', id);
      if (actions.isConnected) dialog.close();
      if (activeId === id) await refreshGit();
      status('Git-sporing er startet.');
    } catch (error) {
      if (!actions.isConnected) throw error;
      feedback.textContent = error.message.replace(/^Error invoking remote method 'desktop': Error: /, '');
      feedback.hidden = false;
    } finally {
      start.disabled = false;
      cancel.disabled = false;
    }
  }, { class: 'primary' });
  actions.append(cancel, start);
  body.append(
    element('p', 'Git oppretter lokal versjonssporing i denne arbeidsmappen. Du kan deretter se endringer og selv velge når du vil lagre en versjon med en commit.'),
    element('p', item.cwd, { class: 'git-setup-path' }),
    element('p', 'Prosjektfilene blir værende på PC-en. Første commit tar du selv.', { class: 'form-status' }),
    feedback, actions
  );
  cancel.focus();
}

async function showProjectFiles(relative = '', preview = false) {
  const id = activeId;
  const body = $('projectFiles');
  const page = element('div');
  body.replaceChildren(page);
  if (!id) { page.append(element('p', 'Åpne et prosjekt først.')); return; }
  const parent = relative.split('/').slice(0, -1).join('/');
  if (relative) page.append(button('‹ Opp', () => showProjectFiles(parent)), element('p', relative, { class: 'form-status' }));
  try {
    if (preview) {
      const text = await run('projectPreview', { id, relative });
      page.append(element('pre', text || 'Tom fil.'));
      return;
    }
    const entries = await run('projectEntries', { id, relative });
    for (const entry of entries) {
      const path = [relative, entry.name].filter(Boolean).join('/');
      page.append(button((entry.directory ? '›  ' : '') + entry.name, () => showProjectFiles(path, !entry.directory), { class: 'file-entry' }));
    }
    if (!entries.length) page.append(element('p', 'Denne mappen er tom.'));
  } catch (error) { page.append(element('p', error.message)); }
}

function openReview(tab = 'changes', entry = false) {
  if (!Object.hasOwn(panelTabs, tab)) tab = 'changes';
  if (panelTab === 'preview' && tab !== 'preview' && pickingPreview) run('projectCancelPick').catch(() => {});
  panelTab = tab;
  saveProjectPreference({ tab });
  if (!$('settingsDialog').hidden) closeSettings();
  document.body.classList.remove('hide-review');
  $('changes').setAttribute('aria-pressed', 'true');
  for (const [key, [control, panel]] of Object.entries(panelTabs)) {
    $(control).setAttribute('aria-pressed', String(tab === key));
    $(panel).hidden = tab !== key || (entry && key === 'changes');
  }
  $('turnReview').hidden = !entry;
  $('refreshGit').hidden = tab !== 'changes' || entry;
  updatePreviewBounds();
  if (tab === 'preview') return showProjectPreview();
  if (tab === 'files') return showProjectFiles();
  if (tab === 'terminal') return Promise.resolve(showProjectTerminal());
  if (tab === 'tests') return showProjectTests();
  return entry ? Promise.resolve() : refreshGit();
}

async function connect(id, force = false) {
  if (!id) return;
  const previous = activeId;
  if (previous !== id) messageActions.cancel();
  if (previous !== id) drafts.set(previous, $('message').value);
  activeId = id;
  run('watchTurnData', id).catch(() => {});
  if (previous !== id) {
    const project = projectKey(thread().project);
    expandedProjects.add(state.pinnedProjects.some(directory => projectKey(directory) === project) ? project : otherThreads);
  }
  $('message').value = drafts.get(id) || '';
  const current = view(id);
  if (force) current.connected = false;
  renderProjects();
  renderConversation();
  refreshGit().catch(report);
  if (previous !== id) resetPanelForThread();
  if (current.connected) {
    await run('selectThread', id);
    return;
  }
  status('Kobler til OMP …');
  const data = await run('connect', id);
  current.connected = true;
  loadModelCatalog(id).catch(() => {});
  current.busy = data.state.isStreaming;
  current.model = data.state.model;
  current.contextUsage = data.state.contextUsage || null;
  current.todos = data.state.todoPhases || [];
  current.commands = data.commands?.commands || [];
  current.chatProfile = data.history?.chatProfile || current.chatProfile;
  if (!current.busy || !current.messages.length) current.messages = historyEntries(data.history?.messages);
  if (id !== activeId) return;
  status('');
  renderConversation();
  loadTurnData(id).catch(report);
  $('message').focus();
}

async function newThread(project, worktree = false, local = false) {
  state = await run('newThread', { project, worktree, local });
  await connect(state.selected);
}

function renderModels() {
  const search = $('modelSearch').value.toLowerCase().trim();
  const isLocal = model => !!model.engine || ['ollama', 'llama.cpp', 'lm-studio', 'strata', 'local'].includes(model.provider)
    || /^https?:\/\/(localhost|127\.0\.0\.1|\[::1\])([:/]|$)/i.test(model.baseUrl || '');
  const selected = pickerId ? view(pickerId).model : state.preferredModel;
  const isSelected = model => selected?.provider === model.provider && selected?.id === model.id;
  const displayed = models.filter(model =>
    (modelFilter === 'all' || isLocal(model) === (modelFilter === 'local')) &&
    `${model.provider}/${model.id} ${model.name || ''}`.toLowerCase().includes(search));
  const list = $('modelList');
  list.replaceChildren();
  for (const [label, entries] of [['Valgt modell', displayed.filter(isSelected)],
    ['Lokale modeller', displayed.filter(model => !isSelected(model) && isLocal(model))],
    ['Skymodeller', displayed.filter(model => !isSelected(model) && !isLocal(model))]]) {
    if (!entries.length) continue;
    list.append(element('h3', label));
    for (const model of entries) {
      const modelLabel = `${model.name || model.id} · ${model.label || model.provider}`;
      list.append(button(modelLabel, async () => {
        const id = pickerId;
        if ((id && id !== activeId) || modelChanging) return;
        modelChanging = true;
        const feedback = $('modelFeedback');
        list.querySelectorAll('button').forEach(item => { item.disabled = true; });
        $('modelSearch').disabled = true;
        feedback.textContent = 'Velger modell …';
        try {
          const changed = await run('model', { id, provider: model.provider, modelId: model.id });
          if (id) view(id).model = changed?.model || changed || model;
          if (id) view(id).contextUsage = null;
          else state.preferredModel = changed.model;
          $('modelDialog').close();
          renderConversation();
          (id ? $('message') : $('model')).focus();
        } catch (error) { feedback.textContent = error.message; }
        finally {
          modelChanging = false;
          $('modelSearch').disabled = false;
          list.querySelectorAll('button').forEach(item => { item.disabled = false; });
        }
      }, { 'aria-pressed': String(isSelected(model)) }));
    }
  }
  if (!displayed.length) list.append(element('p', 'Ingen modeller i denne visningen.'));
}

function commandSuggestions() {
  const query = $('message').value;
  const matches = /^\/\S*$/.test(query)
    ? view(activeId).commands.filter(command => command.name && ('/' + command.name).startsWith(query)).slice(0, 12) : [];
  $('suggestions').hidden = !matches.length;
  $('suggestions').replaceChildren(...matches.map(command => button('/' + command.name, () => {
    $('message').value = '/' + command.name + ' ';
    commandSuggestions();
    $('message').focus();
  }, { title: command.description || '' })));
}

async function submit(event) {
  event.preventDefault();
  const id = activeId;
  const current = view(id);
  const message = $('message').value.trim();
  if (!message || current.busy || !current.connected) return;
  $('suggestions').hidden = true;
  const images = current.attachments.map(file => file.image);
  const submitted = { role: 'user', text: message, pending: true, timestamp: Date.now(), clientMessageId: window.ompTurnUI.messageId() };
  current.messages.push(submitted);
  current.busy = true;
  $('message').value = '';
  drafts.delete(id);
  renderConversation();
  try {
    const chatProfile = chatProfiles.get(id);
    const result = await run('prompt', { id, message, images, chatProfile, thinking: window.ompTurnUI.thinkingRequest($('thinkingLevel'), view(id).model), clientMessageId: submitted.clientMessageId });
    if (result?.chatProfile) {
      current.chatProfile = result.chatProfile;
      chatProfiles.delete(id);
    }
    if (result?.agentInvoked === false) current.busy = false;
    current.attachments = [];
    state = await run('state');
    renderProjects();
  } catch (error) {
    current.busy = false;
    current.messages = current.messages.filter(entry => entry !== submitted);
    if (id === activeId) $('message').value = message;
    else drafts.set(id, message);
    throw error;
  } finally { renderConversation(); }
}

function requestNext() {
  if (activeRequest || !requests.length) return;
  activeRequest = requests.shift();
  const { id, frame } = activeRequest;
  const dialog = $('requestDialog');
  const form = $('requestForm');
  $('requestTitle').textContent = frame.title || 'OMP';
  form.replaceChildren();
  if (frame.message) form.append(element('p', frame.message, { class: 'form-status' }));
  const finish = async result => {
    const buttons = [...form.querySelectorAll('button')];
    if (buttons.some(item => item.disabled)) return;
    for (const item of buttons) item.disabled = true;
    try {
      await run('dialog', { id, requestId: frame.id, result });
      if (activeRequest?.frame.id !== frame.id || activeRequest.id !== id) return;
      dialog.close();
      activeRequest = null;
      requestNext();
    } catch (error) {
      form.append(element('p', error.message, { class: 'form-status' }));
      for (const item of buttons) item.disabled = false;
    }
  };
  if (frame.method === 'confirm') {
    form.append(button('Ja', () => finish({ confirmed: true }), { class: 'primary' }),
      button('Nei', () => finish({ confirmed: false })));
  } else if (frame.method === 'select') {
    for (const option of frame.options || []) form.append(button(String(option), () => finish({ value: option })));
  } else if (frame.method === 'ask' && Array.isArray(frame.questions)) {
    const fields = frame.questions.map(question => {
      const [label, input] = field(question.question || question.title || question.text || 'Svar');
      form.append(label);
      return input;
    });
    form.append(button('Send svar', () => finish({ answers: fields.map(input => input.value) }), { class: 'primary' }));
  } else {
    const input = element(frame.method === 'editor' ? 'textarea' : 'input', null, { 'aria-label': frame.title || 'Svar' });
    input.placeholder = frame.placeholder || '';
    input.value = frame.prefill || '';
    form.append(input, button('Send svar', () => finish({ value: input.value }), { class: 'primary' }));
    form.onsubmit = event => { event.preventDefault(); finish({ value: input.value }); };
  }
  if (frame.allowAlways) form.append(button('Tillat alt og alltid', () => {
      if (window.ompLocale.confirmAlways()) return finish({ allowAlways: true });
    }));
  form.append(button('Avbryt', () => finish({ cancelled: true })));
  dialog.oncancel = event => { event.preventDefault(); finish({ cancelled: true }); };
  dialog.showModal();
}

let livePaint = 0;
window.desktop.onEvent(({ id, frame }) => {
  if (frame.type === 'skill_draft') {
    state = frame.state;
    connect(id).then(() => {
      const message = $('message');
      message.value = message.value ? message.value.trimEnd() + '\n\n' + frame.draft : frame.draft;
      message.dispatchEvent(new Event('input'));
      message.focus();
    }).catch(report);
    return;
  }
  if (frame.type === 'message_speech') {
    messageActions.complete(frame.request, frame.error);
    return;
  }
  const current = view(id);
  window.ompTurnUI.generation('desktop:' + id, frame);
  switch (frame.type) {
    case 'shared_history':
      if (id === activeId) {
        refreshBridgeHistory().catch(() => {});
        refreshBridgeRuntime().catch(() => {});
      }
      return;
    case 'project_test':
      current.projectTest = frame.test;
      if (!frame.test.running) {
        const { id: checkId, at, userIndex, duration, exitCode } = frame.test;
        current.checks = [...(current.checks || []).filter(check => check.id !== checkId), { id: checkId, at, userIndex, duration, exitCode }];
        if (id === activeId) renderConversation();
      }
      updateProjectTest(id);
      return;
    case 'preview_output':
      current.previewOutput = ((current.previewOutput || '') + frame.text).slice(-12000);
      if (id === activeId && panelTab === 'preview') {
        $('previewOutput').textContent = current.previewOutput;
        $('previewDiagnostics').hidden = false;
      }
      return;
    case 'preview_stopped':
      current.previewReady = false;
      current.previewAddress = null;
      if (id === activeId && panelTab === 'preview') {
        $('previewStatus').textContent = frame.text;
        showPreviewSurface(current);
      }
      return;
    case 'turn_changes': updateTurnCard(current, frame.card); break;
    case 'todo_phases': current.todos = frame.phases; break;
    case 'terminal_output':
      current.terminal = ((current.terminal || '') + frame.text).slice(-60000);
      if (terminalId === id && $('terminalOutput')) {
        $('terminalOutput').textContent = current.terminal;
        $('terminalOutput').scrollTop = $('terminalOutput').scrollHeight;
      }
      return;
    case 'schedule_status':
      status(frame.status === 'sent' ? 'Planlagt oppgave sendt til OMP.' : frame.error);
      break;
    case 'agent_start':
      current.busy = true;
      current.remoteBusy = !!frame.remote;
      current.modelPhase = null;
      current.workPhase = 'OMP tenker';
      break;
    case 'auto_retry_start':
    case 'auto_retry_end': {
      const recovery = frame.type === 'auto_retry_start' || frame.recovery || current.recovering;
      const label = recovery && window.ompTurnUI.recoveryStatus(frame);
      current.recovering = !!label && frame.type === 'auto_retry_start';
      if (label) {
        current.workPhase = label;
        if (frame.type === 'auto_retry_end' && !frame.success && id === activeId) status(label);
      }
      break;
    }
    case 'agent_thinking':
      current.workPhase = 'OMP tenker';
      break;
    case 'state':
      if (frame.state?.model) current.model = frame.state.model;
      current.contextUsage = frame.state?.contextUsage || null;
      break;
    case 'model_preparing':
      if (frame.operationId && current.modelPhase?.operationId === frame.operationId && current.modelPhase.sequence >= frame.sequence) return;
      current.modelPhase = frame;
      if (id === activeId && $('modelDialog').open) $('modelFeedback').textContent = window.ompTurnUI.modelProgress(frame);
      break;
    case 'agent_end':
      current.busy = false;
      current.remoteBusy = false;
      current.modelPhase = null;
      current.workPhase = '';
      current.streaming = null;
      if (id === activeId) refreshGit().catch(report);
      if (id === activeId && thread()?.shared) refreshBridgeHistory().catch(report);
      loadTurnData(id).catch(report);
      break;
    case 'prompt_result':
      if (!frame.agentInvoked) current.busy = false;
      break;
    case 'available_commands_update': current.commands = frame.commands || []; break;
    case 'disconnected':
      current.busy = false;
      current.connected = false;
      if (id === activeId) status(frame.error);
      break;
    case 'rpc_error':
      if (frame.command === 'prompt') current.busy = false;
      if (id === activeId) status(frame.error);
      break;
    case 'message_start':
    case 'message_update':
    case 'message_end':
      if (frame.type === 'message_end' && frame.message?.role === 'user' && !frame.message.synthetic) {
        const message = frame.message;
        const messageId = frame.messageId || message.id;
        const text = messageText(message.content);
        const item = { id: messageId, clientMessageId: message.clientMessageId, role: 'user', text, timestamp: message.timestamp || frame.ts };
        if (!window.ompTurnUI.userEcho(current.messages, item)) current.messages.push(item);
      }
      if (frame.message?.role === 'assistant') {
        if (frame.type === 'message_update') {
          current.workPhase = (frame.kind === 'thinking' || frame.assistantMessageEvent?.type === 'thinking_delta') ? 'OMP tenker' : 'OMP skriver';
        }
        const messageId = frame.messageId || frame.message.id;
        if (messageId && current.messages.some(item => item.role === 'assistant' && item.id === messageId && item !== current.streaming)) break;
        if (!current.streaming) {
          current.streaming = { role: 'assistant', text: '', id: frame.messageId, timestamp: frame.message.timestamp || frame.ts || Date.now() };
          current.messages.push(current.streaming);
        }
        const message = frame.message;
        const fallback = /thinking.loop/i.test(message.errorMessage || '') ?
          'OMP oppdaget gjentakende resonnering.' : message.errorMessage;
        current.streaming.text = messageText(message.content) || fallback || '';
        const segments = message.segments || window.ompTurnUI.segmentsOf(message.content);
        if (segments.length || frame.type === 'message_end') current.streaming.segments = segments;
        if (frame.type === 'message_end') {
          current.streaming.id = frame.messageId || frame.message.id;
          current.streaming.usage = message.usage;
          current.streaming.timestamp = message.timestamp || current.streaming.timestamp;
          current.streaming = null;
        }
      }
      break;
    case 'tool_execution_start':
    case 'tool_execution_update':
    case 'tool_execution_end': {
      const ended = frame.type === 'tool_execution_end';
      if (frame.toolName === 'todo' && !frame.isError && Array.isArray(frame.result?.details?.phases)) current.todos = frame.result.details.phases;
      let entry = frame.toolCallId && current.messages.find(item => item.role === 'tool' && item.id === frame.toolCallId);
      if (entry?.done && !ended) break;
      if (!entry) {
        entry = { id: frame.toolCallId, role: 'tool', toolName: frame.toolName, command: frame.args?.command,
          output: JSON.stringify(frame.args, null, 2) || '' };
        current.streaming = null;
        current.messages.push(entry);
      }
      entry.done = ended;
      const name = frame.toolName || entry.toolName || 'OMP-verktøy';
      current.workPhase = ended ? 'OMP tenker' : ({ bash: 'Kjører Bash', read: 'Leser filer', edit: 'Redigerer kode',
        write: 'Skriver filer', web_search: 'Søker på nettet' }[name] || 'Kjører ' + name);
      entry.label = name + (entry.command && name === 'bash' ? ' · ' + entry.command.split('\n')[0] : '')
        + (!ended ? ' · kjører' : frame.isError ? ' · feilet' : ' · ferdig');
      const output = frame.result ?? frame.partialResult ?? frame.partial;
      if (output != null) entry.output = typeof output === 'string' ? output : messageText(output.content) || JSON.stringify(output, null, 2);
      break;
    }
    case 'subagent_lifecycle':
    case 'subagent_progress':
      if (id === activeId) status(frame.message || frame.agentName || 'OMP-agentaktivitet');
      break;
    case 'command_output': {
      const output = typeof frame.output === 'string' ? frame.output : frame.text || frame.message;
      if (output) current.messages.push({ role: 'assistant', text: output });
      break;
    }
    case 'extension_ui_request':
      if (interactiveRequests.has(frame.method)) {
        requests.push({ id, frame });
        requestNext();
      } else if (frame.method === 'cancel') {
        const index = requests.findIndex(item => item.id === id && item.frame.id === frame.targetId);
        if (index >= 0) requests.splice(index, 1);
        if (activeRequest?.id === id && activeRequest.frame.id === frame.targetId) {
          $('requestDialog').close();
          activeRequest = null;
          requestNext();
        }
      } else if (id === activeId && frame.message) status(frame.message);
      break;
    default: return;
  }
  if (id !== activeId) return;
  const paint = () => {
    renderConversation();
    if (frame.trace && localStorage.getItem('omp-live-trace') === '1') {
      console.debug('OMP live', JSON.stringify({ type: frame.type, ...frame.trace, domUpdatedAt: Date.now() }));
    }
  };
  if (frame.type === 'message_update' || frame.type === 'tool_execution_update') {
    if (!livePaint) livePaint = requestAnimationFrame(() => {
      livePaint = 0;
      if (id === activeId) paint();
    });
  } else paint();
});

function field(label, options) {
  const wrapper = element('label', label, { class: 'field' });
  const input = element('input', null, options);
  wrapper.append(input);
  return [wrapper, input];
}

function settingsStatus(container, content) {
  const result = element('p', content, { class: 'form-status', role: 'status' });
  container.append(result);
  return result;
}

async function reconnect() {
  modelCatalogs.clear();
  modelLoads.clear();
  for (const current of threadViews.values()) current.connected = false;
  await connect(activeId, true);
}

function renderThemes(body) {
  body.append(element('p', 'Velg fargepalett for hele arbeidsområdet.'));
  const grid = element('div', null, { class: 'theme-grid' });
  for (const [id, label, rail, paper, panel, accent] of themes) {
    const card = button(label, async () => {
      await run('theme', id);
      state.theme = id;
      state.accent = null;
      state.appearance = {};
      applyTheme();
      showTab('theme');
      $('settingsBody').querySelector('[aria-pressed="true"]')?.focus();
    }, { class: 'theme-card', 'aria-pressed': String(id === state.theme) });
    const swatches = element('span', null, { class: 'swatches', 'aria-hidden': 'true' });
    for (const color of [rail, paper, panel, accent]) {
      const swatch = element('span');
      swatch.style.background = color;
      swatches.append(swatch);
    }
    card.append(swatches);
    grid.append(card);
  }
  body.append(grid);
  const [, , , paper, panel, accent, dark, uiFont, codeFont] = currentTheme();
  const controls = element('div', null, { class: 'appearance-fields' });
  for (const [key, label, type, fallback] of [
    ['paper', 'Bakgrunn', 'color', paper], ['panel', 'Paneler', 'color', panel],
    ['accent', 'Aksentfarge', 'color', state.accent || accent],
    ['text', 'Tekstfarge', 'color', state.theme === 'claude' ? '#faf9f5' : dark ? '#e9edf4' : '#222330'],
    ['uiFont', 'Skrift i appen', 'text', uiFont || 'Segoe UI'], ['codeFont', 'Skrift for kode', 'text', codeFont || 'Consolas']
  ]) {
    const [row, input] = field(label, { type, maxlength: '64' });
    input.value = state.appearance?.[key] || fallback;
    if (type === 'color') input.oninput = () => applyTheme({ ...state.appearance, [key]: input.value });
    input.onchange = async () => {
      try {
        state.appearance = await run('appearance', { key, value: input.value.trim() || null });
        applyTheme();
      } catch (error) { applyTheme(); report(error); }
    };
    controls.append(row);
  }
  body.append(controls, button('Gjenopprett temaet', async () => {
    await run('theme', state.theme);
    state.appearance = {};
    state.accent = null;
    applyTheme();
    showTab('theme');
  }));
}

function renderProviders(body) {
  const modelRows = element('div', null, { class: 'model-settings-rows' });
  modelRows.append(button('Standardmodell  ·  ' + (state.preferredModel?.name || state.preferredModel?.id || 'Velg modell'), () => {
    closeSettings();
    return openModelPicker(false, true);
  }));
  const engines = element('p', 'Lokale motorer  ·  Sjekker …');
  modelRows.append(engines);
  body.append(modelRows);
  run('localModels').then(list => {
    engines.textContent = 'Lokale motorer  ·  ' + ([...new Set(list.map(item => item.label))].join(', ') || 'Ingen funnet');
  }).catch(() => { engines.textContent = 'Lokale motorer  ·  Utilgjengelig'; });
  const providersSection = element('details', null, { class: 'provider-details' });
  providersSection.append(element('summary', 'Leverandører'));
  body.append(providersSection);
  const pane = element('div', null, { class: 'provider-pane' });
  const controls = element('nav', null, { class: 'provider-tabs', 'aria-label': 'Tilkoblingstype' });
  const native = button('Skyleverandører', () => select(false), { 'aria-pressed': 'true' });
  const custom = button('Egen adresse', () => select(true), { 'aria-pressed': 'false' });
  controls.append(native, custom);
  const browse = button('Se modeller fra OMP', () => {
    closeSettings();
    return openModelPicker();
  });
  providersSection.append(browse, controls, pane);
  function select(manual) {
    native.setAttribute('aria-pressed', String(!manual));
    custom.setAttribute('aria-pressed', String(manual));
    pane.replaceChildren();
    if (manual) renderCustomProvider(pane);
    else renderNativeProviders(pane).catch(error => settingsStatus(pane, error.message));
  }
  providersSection.ontoggle = () => {
    if (providersSection.open && !pane.childElementCount) select(false);
  };
}

function androidOption() {
  const checkbox = element('input', null, { type: 'checkbox', role: 'switch' });
  checkbox.checked = true;
  const label = element('label', null, { class: 'provider-share' });
  const text = element('span', 'Tilgjengelig i Chat OMP OMP på Android');
  text.append(element('small', 'Lagrer nøkkelen i klartekst i OMPs delte konfigurasjon på PC-en.'));
  label.append(checkbox, text);
  return [label, checkbox];
}

async function renderNativeProviders(body) {
  const search = element('input', null, { type: 'search', placeholder: 'Søk etter leverandør', 'aria-label': 'Søk etter leverandør' });
  const list = element('div', null, { class: 'provider-list' });
  const detail = element('section', null, { class: 'provider-detail' });
  const layout = element('div', null, { class: 'provider-layout' });
  const sidebar = element('div', null, { class: 'provider-sidebar' });
  sidebar.append(search, list);
  layout.append(sidebar, detail);
  body.append(layout);
  detail.append(element('p', 'Henter leverandører …'));
  const providers = await run('providerCatalog', activeId);
  providers.sort((a, b) => Number(b.configured) - Number(a.configured));
  let selected = providers[0];
  const drawList = () => {
    const query = search.value.trim().toLowerCase();
    const rows = providers.filter(item => (item.name + ' ' + item.id).toLowerCase().includes(query));
    list.replaceChildren(...rows.map(item => {
      const row = button(item.name, () => { selected = item; drawList(); drawDetail(); }, {
        'aria-pressed': String(selected?.id === item.id)
      });
      const label = providerStatus(item);
      if (label) row.append(element('span', label, { class: 'provider-configured' }));
      return row;
    }));
    if (!rows.length) list.append(element('p', 'Ingen leverandører samsvarer med søket.'));
  };
  function providerStatus(item) {
    if (item.disabled) return 'Deaktivert i OMP';
    if (item.modelCount) return item.modelCount + ' modeller';
    if (item.hasCredential) return 'Nøkkel lagret';
    if (item.configured) return 'Konfigurert i OMP';
    return '';
  }
  function drawDetail() {
    if (!selected) return;
    const item = selected;
    detail.replaceChildren(element('h3', item.name));
    if (item.hasCredential) detail.append(element('p', 'OMP har allerede en lagret nøkkel eller pålogging for denne leverandøren.'));
    if (item.disabled) detail.append(element('p', 'Leverandøren er deaktivert i OMP-oppsettet.'));
    if (item.modelCount) detail.append(element('p', item.modelCount + ' tilgjengelige modeller i OMP.'));
    if (!item.canConnect) return;
    const form = element('form');
    const [keyLabel, key] = field('API-nøkkel', { type: 'password', required: '', autocomplete: 'off' });
    const [shareLabel, shared] = androidOption();
    if (item.hasAccount) {
      detail.append(element('p', 'Logg inn på OpenCode-kontoen din i nettleseren og lim inn API-nøkkelen til abonnementet ditt. OMP håndterer modellene.'));
      detail.append(button('Åpne OpenCode-konto', () => run('openProviderAccount', item.id), { class: 'provider-account' }));
    }
    const save = element('button', item.configured ? 'Oppdater nøkkel' : 'Koble til ' + item.name, { type: 'submit', class: 'primary' });
    form.append(keyLabel, shareLabel, save);
    const feedback = settingsStatus(form, '');
    form.onsubmit = async event => {
      event.preventDefault();
      save.disabled = true;
      try {
        const result = await run('connectProvider', { id: item.id, key: key.value, shared: shared.checked });
        item.configured = true;
        item.hasCredential = true;
        key.value = '';
        feedback.textContent = result.shared ? 'Lagret i OMP. Android kan hente leverandøren via bridgen.' : 'Lagret i OMP Desktop.';
        save.textContent = 'Oppdater nøkkel';
        drawList();
        await reconnect();
      } catch (error) { feedback.textContent = error.message; }
      finally { save.disabled = false; }
    };
    detail.append(form);
  }
  search.oninput = drawList;
  drawList();
  drawDetail();
}

function renderCustomProvider(body) {
  body.append(element('p', 'Legg til 9Router, en annen gateway eller en server som krever egen adresse.'));
  const form = element('form');
  const [idLabel, name] = field('Navn', { required: '', placeholder: '9Router' });
  const [urlLabel, url] = field('API-adresse', { required: '', type: 'url', placeholder: 'http://127.0.0.1:20128/v1' });
  const [keyLabel, key] = field('API-nøkkel (valgfritt)', { type: 'password', autocomplete: 'off' });
  const [modelLabel, model] = field('Modell-ID (valgfritt)', { placeholder: 'Brukes hvis serveren mangler modelliste' });
  const [shareLabel, shared] = androidOption();
  const advanced = element('details', null, { class: 'provider-advanced' });
  advanced.append(element('summary', 'Avansert'));
  const apiLabel = element('label', 'Protokoll', { class: 'field' });
  const api = element('select');
  for (const value of ['openai-completions', 'openai-responses', 'anthropic-messages']) {
    api.append(element('option', value));
  }
  apiLabel.append(api);
  advanced.append(apiLabel, modelLabel);
  const data = () => ({
    name: name.value.trim().toLowerCase().replace(/[^a-z0-9_-]+/g, '-'),
    url: url.value, model: model.value, key: key.value, api: api.value, shared: shared.checked
  });
  const save = element('button', 'Legg til leverandør', { type: 'submit', class: 'primary' });
  const test = button('Finn modeller', async () => {
    if (!url.reportValidity()) return;
    test.disabled = true;
    feedback.textContent = 'Spør etter modeller …';
    try {
      const models = await run('discoverProvider', data());
      feedback.textContent = models.length ? models.length + ' funnet · ' + models.slice(0, 5).join(', ') : 'Serveren oppga ingen modeller.';
    } catch (error) { feedback.textContent = error.message; }
    finally { test.disabled = false; }
  });
  form.append(idLabel, urlLabel, keyLabel, advanced, shareLabel, save, test);
  const feedback = settingsStatus(form, '');
  form.onsubmit = async event => {
    event.preventDefault();
    save.disabled = true;
    try {
      const result = await run('addProvider', data());
      form.reset();
      feedback.textContent = result.models + ' modeller tilgjengelig.' + (result.shared ? ' Android kan hente leverandøren.' : '');
      await reconnect();
    } catch (error) { feedback.textContent = error.message; }
    finally { save.disabled = false; }
  };
  body.append(form);
}

function renderBridge(body) {
  body.append(element('p', state.bridgeAddress
    ? 'Tilkoblet ' + state.bridgeAddress + '. Delte tråder kan fortsettes i Chat OMP OMP.'
    : 'OMP Desktop finner bridgen og leser tilkoblingen fra installasjonen på PC-en.'));
  const feedback = settingsStatus(body, '');
  const connectButton = button(state.bridgeAddress ? 'Oppdater lokal tilkobling' : 'Koble til lokal bridge', async () => {
    connectButton.disabled = true;
    feedback.textContent = 'Kobler til og henter chatter …';
    try {
      const result = await run('pairBridge');
      state = result.state;
      bridgeReachable = true;
      renderProjects();
      if (activeId) await connect(activeId, true);
      showTab('bridge');
    } catch (error) { feedback.textContent = error.message; }
    finally { connectButton.disabled = false; }
  }, { class: 'primary' });
  body.append(connectButton);
  if (!state.bridgeAddress) return;
  const pairing = element('section', null, { class: 'pairing-panel' });
  pairing.append(element('h3', 'Koble til Chat OMP OMP'), element('p', 'Velg PC-adressen og skann engangskoden i Android-appen.'));
  const network = element('select', null, { 'aria-label': 'Nettverksadresse' });
  const code = element('div');
  const generate = button('Vis QR-kode', async () => {
    generate.disabled = true;
    code.replaceChildren();
    try {
      const result = await run('mobilePairing', network.value);
      code.append(element('img', null, { src: result.image, alt: 'Engangskode for Android-paring', width: '250', height: '250' }),
        element('p', 'Kan brukes én gang og utløper etter to minutter.'));
    } catch (error) { code.append(element('p', error.message)); }
    finally { generate.disabled = false; }
  }, { disabled: '' });
  pairing.append(network, generate, code);
  body.append(pairing);
  run('pairingAddresses').then(items => {
    for (const item of items) network.append(element('option', item.label, { value: item.address }));
    if (items.length > 1) network.selectedIndex = 1;
    generate.disabled = !items.length;
  }).catch(error => { code.textContent = error.message; });
}

function renderWakeOnLan(body) {
  const panel = element('section', null, { class: 'pairing-panel' });
  const feedback = element('p', '', { role: 'status' });
  const code = element('div');
  const adapter = element('select', null, { 'aria-label': 'Ethernet-adresse' });
  const relay = element('input', null, { type: 'text', placeholder: 'Reléadresse, f.eks. 192.168.1.50', 'aria-label': 'Reléadresse' });
  const shutdown = element('input', null, { type: 'checkbox', role: 'switch' });
  const shutdownLabel = element('label', 'Tillat avslåing fra mobilen', { class: 'row' });
  shutdownLabel.append(shutdown);
  const useRelay = button('Koble til og vis QR-kode', async () => {
    useRelay.disabled = true;
    code.replaceChildren();
    try {
      feedback.textContent = 'Tester relé og kobler til …';
      const { address } = await run('wolConnect', { relayAddress: relay.value, adapterAddress: adapter.value, allowShutdown: shutdown.checked });
      const result = await run('mobilePairing', address);
      feedback.textContent = 'Reléet er klart. Skann koden fra Android-appen.';
      code.append(element('img', null, { src: result.image, alt: 'QR-kode for Wake-on-LAN', width: '250', height: '250' }),
        element('p', 'Koden kan brukes én gang og utløper etter to minutter.'));
    } catch (error) { feedback.textContent = error.message; }
    finally { useRelay.disabled = false; }
  }, { class: 'primary', disabled: '' });
  const scan = button('Finn relé', async () => {
    scan.disabled = true;
    results.replaceChildren();
    feedback.textContent = 'Leter etter chatompompwol på lokalnettet …';
    try {
      const relays = await run('wolDiscover');
      if (relays.length === 1) relay.value = relays[0].address;
      for (const item of relays) results.append(button(item.name + ' · ' + item.address, () => {
        relay.value = item.address;
        feedback.textContent = 'Relé valgt.';
      }));
      feedback.textContent = relays.length ? 'Velg relé og koble til.' : 'Fant ingen reléer. Du kan skrive eller lime inn reléadressen.';
    } catch (error) { feedback.textContent = error.message; }
    finally { scan.disabled = false; }
  });
  const results = element('div');
  panel.append(element('p', 'Koble PC-en med Ethernet til samme lokalnett som reléet.'), adapter, scan, results, relay, shutdownLabel, useRelay, feedback, code);
  body.append(panel);
  run('wolAdapters').then(items => {
    for (const item of items) adapter.append(element('option', item.label + ' · ' + item.address, { value: item.address }));
    if (items.length) {
      useRelay.disabled = false;
      scan.click();
    } else {
      scan.disabled = true;
      feedback.textContent = 'Fant ingen Ethernet-adresse på denne PC-en.';
    }
  }).catch(error => { feedback.textContent = error.message; });
}

async function refreshBridgeHistory() {
  const id = activeId;
  if (!id || !thread()?.shared) return;
  const data = await run('bridgeHistory', id);
  if (id !== activeId) return;
  const current = view(id);
  const saved = historyEntries(data.messages).filter(item =>
    !current.busy || item.role !== 'tool' || !item.label.endsWith(' · uten resultat'));
  const keys = new Set(saved.filter(item => item.id).map(item => item.role + ':' + item.id));
  const messages = current.busy
    ? [...saved, ...current.messages.filter(item => !keys.has(item.role + ':' + item.id) && !saved.some(entry => window.ompTurnUI.sameMessage(entry, item)))]
    : saved;
  if (current.streaming && !messages.includes(current.streaming)) current.streaming = null;
  const profileChanged = data.chatProfile && JSON.stringify(data.chatProfile) !== JSON.stringify(current.chatProfile);
  if (profileChanged) current.chatProfile = data.chatProfile;
  if (!profileChanged && JSON.stringify(messages) === JSON.stringify(current.messages)) return;
  current.messages = messages;
  renderConversation();
  refreshGit().catch(report);
}

async function refreshBridgeRuntime() {
  const id = activeId;
  if (!id || !thread()?.shared) return;
  const current = view(id);
  if (current.busy && !current.remoteBusy) return;
  const runtime = await run('bridgeRuntime', id);
  if (id !== activeId || (current.busy && !current.remoteBusy)) return;
  const request = runtime?.request;
  if (runtime?.model) current.model = runtime.model;
  if (runtime) current.contextUsage = runtime.contextUsage || null;
  const changedTodos = Array.isArray(runtime?.todos) && JSON.stringify(current.todos) !== JSON.stringify(runtime.todos);
  if (changedTodos) current.todos = runtime.todos;
  if (request?.id && interactiveRequests.has(request.method) && current.remoteRequest !== request.id) {
    current.remoteRequest = request.id;
    requests.push({ id, frame: request });
    requestNext();
  }
  if (!request && current.remoteRequest) {
    const requestId = current.remoteRequest;
    current.remoteRequest = null;
    const index = requests.findIndex(item => item.id === id && item.frame.id === requestId);
    if (index >= 0) requests.splice(index, 1);
    if (activeRequest?.id === id && activeRequest.frame.id === requestId) {
      $('requestDialog').close();
      activeRequest = null;
      requestNext();
    }
  }
  const working = !!runtime?.busy;
  if (working !== !!current.remoteBusy) {
    current.busy = current.remoteBusy = working;
    renderConversation();
  } else if (changedTodos) renderConversation();
}

function confirmRemoveProject(project) {
  const body = openWorkspace('Fjern prosjekt');
  body.append(element('p', 'Prosjektet fjernes fra prosjektlisten. Filene og samtalene beholdes.'),
    button('Fjern prosjekt', async () => {
      state = await run('removeProject', project);
      $('workspaceDialog').close();
      renderProjects();
    }, { class: 'primary' }),
    button('Avbryt', () => $('workspaceDialog').close()));
}

function confirmTrashThread(item) {
  const body = openWorkspace('Flytt til papirkurven?');
  body.append(element('p', cleanTitle(item.title)),
    button('Flytt til papirkurven', async () => {
      state = await run('trashThread', item.id);
      if (activeId === item.id) {
        activeId = undefined;
        messageActions.cancel();
        drafts.delete(item.id);
        threadViews.delete(item.id);
        $('message').value = '';
        await run('watchTurnData', null);
        renderConversation();
      }
      $('workspaceDialog').close();
      renderProjects();
    }, { class: 'primary' }),
    button('Avbryt', () => $('workspaceDialog').close()));
}

function renameSharedChat(item) {
  const dialog = $('workspaceDialog');
  const body = openWorkspace('Gi samtalen nytt navn', 'git-setup-dialog');
  const form = element('form');
  const field = element('input', null, { 'aria-label': 'Navn', value: cleanTitle(item.title), required: '', maxlength: '150' });
  const error = element('p', null, { role: 'status' });
  const actions = element('div', null, { class: 'dialog-actions' });
  const save = element('button', 'Lagre', { class: 'primary', type: 'submit' });
  actions.append(button('Avbryt', () => dialog.close()), save);
  form.append(field, error, actions);
  body.append(form);
  form.onsubmit = async event => {
    event.preventDefault();
    if (save.disabled) return;
    save.disabled = true;
    try {
      state = await run('bridgeRename', { id: item.id, name: field.value });
      renderProjects();
      renderConversation();
      if (form.isConnected) dialog.close();
    } catch (failure) { error.textContent = failure.message; }
    finally { save.disabled = false; }
  };
  field.focus();
  field.select();
}

async function syncChats(showStatus) {
  if (!state?.bridgeAddress) { if (showStatus) openSettings('bridge'); return; }
  if (bridgeRefreshing) return;
  bridgeRefreshing = true;
  try {
    const wasShared = thread()?.shared;
    const previous = JSON.stringify([state.pinnedProjects, state.threads]);
    try {
      state = await run('bridgeSync');
    } catch (error) {
      bridgeReachable = false;
      updateSyncStatus();
      throw error;
    }
    bridgeReachable = true;
    updateSyncStatus();
    if (thread()?.hiddenFromSidebar) {
      messageActions.cancel();
      drafts.set(activeId, $('message').value);
      view(activeId).connected = false;
      activeId = undefined;
      $('message').value = '';
      $('diff').replaceChildren();
      $('branch').hidden = true;
      $('projectFiles').hidden = true;
      run('watchTurnData', null).catch(() => {});
      renderConversation();
      resetPanelForThread();
    }
    if (previous !== JSON.stringify([state.pinnedProjects, state.threads])) renderProjects();
    if (!wasShared && thread()?.shared) await connect(activeId, true);
    await refreshBridgeRuntime();
    await refreshBridgeHistory();
    if (activeId && thread()?.shared) await loadTurnData(activeId);
    if (showStatus) status('Chatter synkronisert.');
  } finally { bridgeRefreshing = false; }
}

function toggleRow(label, detail, enabled, change) {
  const row = element('label', null, { class: 'row' });
  const caption = element('span', label);
  const hint = element('small', detail);
  const input = element('input', null, { type: 'checkbox', role: 'switch' });
  input.checked = enabled;
  input.onchange = async () => {
    input.disabled = true;
    input.setAttribute('aria-busy', 'true');
    try { await change(input.checked); }
    catch (error) { input.checked = !input.checked; report(error); }
    finally { input.disabled = false; input.removeAttribute('aria-busy'); }
  };
  caption.append(hint);
  row.append(caption, input);
  return row;
}

async function renderResources(body, generation) {
  if (!activeId) {
    body.append(element('p', 'Åpne et prosjekt for å se OMP-ressursene det bruker.'));
    return;
  }
  body.append(element('p', 'Status fra OMP for prosjektet. Endringer lastes inn på nytt i klienten.'));
  const feedback = settingsStatus(body, 'Henter ressurser …');
  try {
    const groups = await run('resources', activeId);
    if (generation !== tabGeneration) return;
    feedback.remove();
    for (const [section, rows] of Object.entries(groups)) {
      body.append(element('h3', section));
      if (!rows.length) body.append(element('p', 'Ingen oppføringer.'));
      for (const item of rows) {
        if (item.kind) {
          body.append(toggleRow(item.name, (item.enabled ? 'Aktivert' : 'Deaktivert') + (item.detail ? ' · ' + item.detail : ''),
            item.enabled, async enabled => {
              await run('toggleResource', { id: activeId, ...item, enabled });
              await reconnect();
              showTab('resources');
            }));
        } else {
          const row = element('div', null, { class: 'row' });
          row.append(element('span', item.name), element('small', item.detail));
          body.append(row);
        }
      }
    }
  } catch (error) { feedback.textContent = error.message; }
}

async function renderPlugins(body, generation) {
  const skillsPanel = element('section', null, { class: 'plugin-callout' });
  const explore = button('Utforsk skills ↗', () => run('openSkills', { id: activeId }), { class: 'primary' });
  explore.disabled = !state.bridgeAddress;
  skillsPanel.append(element('h3', 'Skills'), element('p', 'Forhåndsvis, installer og organiser prosjektets skills i nettleseren.'),
    explore);
  const advanced = element('details', null, { class: 'plugin-advanced' });
  advanced.append(element('summary', 'OMP-markedsplasser og pakkereferanser'));
  advanced.append(element('p', 'Installer en OMP-pakke fra en markedsplass, npm eller en lokal mappe.'));
  const form = element('form');
  const [label, target] = field('Pakkereferanse', { required: '', placeholder: 'navn@markedsplass' });
  const scopeLabel = element('label', 'Installer for', { class: 'field' });
  const scope = element('select');
  scope.append(element('option', 'Alle prosjekter', { value: 'user' }));
  if (activeId) scope.append(element('option', 'Dette prosjektet', { value: 'project' }));
  scopeLabel.append(scope);
  const install = element('button', 'Installer plugin', { class: 'primary', type: 'submit' });
  form.append(label, scopeLabel, install);
  const feedback = settingsStatus(form, '');
  form.onsubmit = async event => {
    event.preventDefault();
    install.disabled = true;
    feedback.textContent = 'OMP installerer pakken …';
    try {
      const result = await run('plugins', { action: 'install', target: target.value, scope: scope.value, id: activeId });
      await reconnect();
      showTab('plugins');
      status(result || 'Plugin installert.');
    } catch (error) { feedback.textContent = error.message; }
    finally { install.disabled = false; }
  };
  advanced.append(form);
  const marketplaceForm = element('form');
  const [sourceLabel, source] = field('Markedsplass', { required: '', placeholder: 'eier/repo eller katalogadresse' });
  const addMarket = element('button', 'Legg til markedsplass', { type: 'submit' });
  marketplaceForm.append(sourceLabel, addMarket);
  const marketplaceStatus = settingsStatus(marketplaceForm, '');
  marketplaceForm.onsubmit = async event => {
    event.preventDefault();
    addMarket.disabled = true;
    marketplaceStatus.textContent = 'Henter markedsplass …';
    try {
      await run('plugins', { action: 'marketplaceAdd', target: source.value, id: activeId });
      await reconnect();
      showTab('plugins');
    } catch (error) { marketplaceStatus.textContent = error.message; }
    finally { addMarket.disabled = false; }
  };
  advanced.append(marketplaceForm);
  const bundled = element('div', null, { class: 'plugin-cards' });
  const installed = element('div');
  const skills = element('div');
  const catalog = element('div');
  const inventory = element('details', null, { class: 'plugin-advanced' });
  inventory.append(element('summary', 'Skills funnet av OMP'), skills);
  advanced.append(element('h3', 'Tilgjengelig i markedsplassene'), catalog);
  body.append(skillsPanel, element('h3', 'Prosjektutvidelser'), bundled, element('h3', 'Installert i OMP'), installed, inventory, advanced);
  const [list, discovery] = await Promise.allSettled([
    run('plugins', { action: 'list', id: activeId }), run('plugins', { action: 'discover', id: activeId })
  ]);
  if (generation !== tabGeneration) return;
  let lastList;
  const renderPluginRows = data => {
    const next = JSON.stringify(data);
    if (lastList === next) return;
    lastList = next;
    bundled.replaceChildren();
    installed.replaceChildren();
    skills.replaceChildren();
    const entries = Array.isArray(data) ? data : [
      ...(data.npm || []),
      ...(data.marketplace || []).flatMap(plugin => plugin.entries?.map(entry => ({ ...plugin, ...entry })) || [plugin])
    ];
    if (!entries.length) installed.append(element('p', 'Ingen eksterne pakker installert i OMP.'));
    const builtIn = data.builtIn || [];
    if (!builtIn.length) bundled.append(element('p', 'Koble til Bridge for medfølgende plugins.'));
    if (!activeId && builtIn.length) bundled.append(element('p', 'Åpne en delt samtale for å endre pluginvalg for prosjektet.'));
    for (const plugin of [...entries, ...builtIn]) {
      const ref = plugin.id || plugin.packageName || plugin.name;
      if (!ref) continue;
      const enabled = plugin.enabled ?? plugin.status === 'enabled';
      const scopeText = plugin.description || (plugin.scope === 'project' ? 'Prosjekt' : 'Bruker');
      const row = toggleRow(plugin.name || ref, (enabled ? 'Aktivert' : 'Deaktivert') + ' · ' + scopeText, enabled, async checked => {
        await run('plugins', { action: checked ? 'enable' : 'disable', target: ref, scope: plugin.scope, id: activeId });
        await reconnect();
        showTab('plugins');
      });
      if (builtIn.includes(plugin) && !activeId) row.querySelector('input').disabled = true;
      if (builtIn.includes(plugin)) {
        const card = element('article', null, { class: 'plugin-card' });
        card.append(row, window.ompTurnUI.pluginTest(plugin.test, enabled && !!activeId,
          () => run('plugins', { action: 'test', target: ref, id: activeId })));
        bundled.append(card);
      } else installed.append(row);
    }
    for (const skill of data.skills || []) {
      if (state.bridgeAddress && thread()?.shared && typeof skill.globalEnabled === 'boolean') {
        skills.append(window.ompTurnUI.skillControls(skill, data.sessionScoped, {
          change: async (scope, enabled) => { await run('setSkillScope', { id: activeId, target: skill.name, scope, enabled }); },
          test: () => run('plugins', { id: activeId, action: 'test-skill', target: skill.name }),
          report
        }));
        continue;
      }
      const row = toggleRow(skill.name, [skill.scope === 'global' ? 'Global' : skill.scope === 'project' ? 'Prosjekt' : '',
        skill.detail || skill.source].filter(Boolean).join(' · '), skill.enabled, async enabled => {
        await run('toggleResource', { id: activeId, kind: 'skill', name: skill.name, enabled });
        await reconnect();
        showTab('plugins');
      });
      if (!activeId) row.querySelector('input').disabled = true;
      skills.append(row);
    }
    if (!skills.childElementCount) skills.append(element('p', 'OMP fant ingen skills.'));
  };
  if (list.status === 'fulfilled') renderPluginRows(list.value);
  else settingsStatus(installed, list.reason.message);
  const pluginVisible = () => generation === tabGeneration && !$('settingsDialog').hidden;
  async function refreshPlugins() {
    if (!pluginVisible()) return;
    try {
      const panels = [bundled, installed, skills];
      const waiting = () => panels.some(panel => panel.querySelector('[aria-busy="true"]'));
      if (!waiting()) {
        const data = await run('plugins', { action: 'list', id: activeId });
        if (pluginVisible() && !waiting()) renderPluginRows(data);
      }
    } catch {} finally { if (pluginVisible()) setTimeout(refreshPlugins, 8000); }
  }
  if (state.bridgeAddress) setTimeout(refreshPlugins, 8000);
  if (discovery.status === 'fulfilled') {
    const entries = Array.isArray(discovery.value) ? discovery.value : discovery.value.plugins || [];
    if (!entries.length) catalog.append(element('p', 'Ingen tilgjengelige pakker i OMP-katalogen.'));
    for (const plugin of entries) {
      const ref = plugin.id || (plugin.name && plugin.marketplace ? plugin.name + '@' + plugin.marketplace : plugin.name);
      if (!ref) continue;
      const row = element('div', null, { class: 'row' });
      row.append(element('span', ref), button('Velg', () => { target.value = ref; target.focus(); }));
      catalog.append(row);
    }
  } else settingsStatus(catalog, discovery.reason.message);
}

function drawSettingsTabs() {
  const query = $('settingsSearch').value.trim().toLowerCase();
  $('tabs').replaceChildren(...Object.entries(tabs)
    .filter(([key, label]) => (label + ' ' + tabKeywords[key]).toLowerCase().includes(query))
    .map(([key, label]) => iconButton(button('', () => {
      $('settingsSearch').value = '';
      showTab(key);
    }, { 'aria-current': String(activeTab === key), class: 'settings-tab' }), ['general', 'omp'].includes(key) ? 'settings' : key === 'wol' ? 'power' : key === 'machine' ? 'tokens' : key, label)));
  if (!$('tabs').childElementCount) $('tabs').append(element('small', 'Ingen treff.'));
}

function showTab(id) {
  activeTab = id;
  const generation = ++tabGeneration;
  const body = $('settingsBody');
  body.replaceChildren();
  if (id !== 'models') body.append(element('h2', tabs[id]));
  drawSettingsTabs();
  if (id === 'theme') renderThemes(body);
  if (id === 'models') renderProviders(body);
  if (id === 'bridge') renderBridge(body);
  if (id === 'wol') renderWakeOnLan(body);
  if (id === 'machine') body.append(window.ompTurnUI.machinePanel(() => run('machineResources'),
    () => !$('settingsDialog').hidden && activeTab === 'machine'));
  if (id === 'device') {
    if (state.bridgeAddress) body.append(adbPanel({ read: () => run('adbStatus'), install: () => run('adbInstall') }));
    else body.append(button('Koble til Bridge', () => showTab('bridge')));
  }
  if (id === 'resources') renderResources(body, generation).catch(report);
  if (id === 'plugins') renderPlugins(body, generation).catch(report);
  if (id === 'omp') {
    const path = element('p', state.detected || 'Ingen Windows-installasjon funnet.');
    body.append(path, button('Velg omp.exe', async () => {
      state = await run('selectOmp');
      version = await run('version').catch(() => '');
      showTab('omp');
      await reconnect();
    }), button('Koble til på nytt', reconnect));
    if (version) settingsStatus(body, version);
  }
  if (id === 'general') {
    body.append(window.ompLocale.languageSetting());
    body.append(window.ompLocale.approvalSetting(mode => run('bridgeApproval', mode)));
    const startup = settingsStatus(body, 'Henter oppstartsinnstilling …');
    run('desktopStartup').then(enabled => {
      if (generation !== tabGeneration) return;
      startup.replaceWith(toggleRow('Start OMP Desktop ved innlogging', 'Åpner appen automatisk når du logger på Windows.', enabled, async next => {
        if (await run('desktopStartup', next) !== next) throw new Error('Windows kunne ikke oppdatere automatisk oppstart.');
      }));
    }).catch(error => { startup.textContent = error.message; });
    body.append(button('Finn nyeste Windows-installer', () => run('desktopUpdates')));
  }
}

function openSettings(tab = activeTab || 'models') {
  $('settingsDialog').hidden = false;
  $('settingsSearch').value = '';
  document.body.classList.add('settings-open');
  $('settings').setAttribute('aria-pressed', 'true');
  showTab(tab);
}

function closeSettings() {
  $('settingsDialog').hidden = true;
  document.body.classList.remove('settings-open');
  $('settings').setAttribute('aria-pressed', 'false');
  return run('closeMobilePairing').catch(report);
}

function wire(id, handler) {
  $(id).onclick = () => Promise.resolve().then(handler).catch(report);
}

let terminalId;

function openWorkspace(title, variant = '') {
  $('workspaceDialogTitle').textContent = title;
  const body = $('workspaceDialogBody');
  body.replaceChildren();
  const dialog = $('workspaceDialog');
  dialog.dataset.variant = variant;
  if (!dialog.open) dialog.showModal();
  return body;
}

function showProjectTerminal() {
  const id = activeId;
  const body = $('terminalPanel');
  body.replaceChildren();
  if (!id) { body.append(element('p', 'Åpne et prosjekt først.')); return; }
  terminalId = id;
  const log = element('pre', view(id).terminal || '', { id: 'terminalOutput', role: 'log' });
  const form = element('form');
  const [label, command] = field('Kommando', { required: '', autocomplete: 'off' });
  form.append(label, element('button', 'Kjør', { class: 'primary', type: 'submit' }), button('Avslutt økt', () => run('stopTerminal', id)));
  form.onsubmit = event => {
    event.preventDefault();
    const text = command.value;
    command.value = '';
    const current = view(id);
    current.terminal = ((current.terminal || '') + '\n> ' + text + '\n').slice(-60000);
    log.textContent = current.terminal;
    run('terminal', { id, command: text }).catch(report);
  };
  body.append(log, form);
  log.scrollTop = log.scrollHeight;
}
wire('terminal', () => openReview('terminal'));

wire('browser', () => {
  const body = openWorkspace('Nettleser');
  const form = element('form');
  const [label, address] = field('Adresse', { type: 'url', required: '', placeholder: 'http://localhost:3000' });
  form.append(label, element('button', 'Åpne forhåndsvisning', { class: 'primary', type: 'submit' }));
  const feedback = settingsStatus(form, '');
  form.onsubmit = async event => {
    event.preventDefault();
    try { await run('browser', address.value); $('workspaceDialog').close(); }
    catch (error) { feedback.textContent = error.message; }
  };
  body.append(form);
  address.focus();
});

wire('schedule', async () => {
  const body = openWorkspace('Planlagte oppgaver');
  body.append(element('p', 'OMP kjører oppgavene når appen er åpen. Oppgaver som forfaller mens den er lukket, sendes ved neste oppstart.'));
  const list = element('div');
  body.append(list);
  const render = jobs => {
    list.replaceChildren();
    for (const job of jobs) {
      const row = element('div', null, { class: 'row' });
      const labels = { pending: 'Planlagt', sending: 'Sender', sent: 'Sendt', error: 'Feilet', interrupted: 'Avbrutt ved oppstart', cancelled: 'Kansellert' };
      row.append(element('span', new Date(job.when).toLocaleString('nb-NO') + ' · ' + job.message),
        element('small', labels[job.status] || job.status, { title: job.error || '' }));
      if (job.status === 'pending') row.append(button('Kanseller', async () => render(await run('scheduleCancel', job.id))));
      list.append(row);
    }
  };
  if (activeId) {
    const id = activeId;
    const form = element('form');
    const [dateLabel, date] = field('Tidspunkt', { type: 'datetime-local', required: '' });
    const [taskLabel, task] = field('Kodeoppgave i ' + thread().title, { required: '' });
    form.append(dateLabel, taskLabel, element('button', 'Planlegg', { type: 'submit', class: 'primary' }));
    const feedback = settingsStatus(form, '');
    form.onsubmit = async event => {
      event.preventDefault();
      try {
        render(await run('scheduleAdd', { id, when: new Date(date.value).toISOString(), message: task.value }));
        form.reset();
        feedback.textContent = 'Oppgaven er planlagt.';
      } catch (error) { feedback.textContent = error.message; }
    };
    body.prepend(form);
  }
  render(await run('scheduleList'));
});

wire('openProject', async () => {
  const project = await run('openProject');
  if (!project) return;
  state = await run('state');
  const latest = state.threads.findLast(item => item.project === project);
  if (latest) await connect(latest.id);
  else await newThread(project);
});
iconButton($('settings'), 'settings', 'Innstillinger');
wire('settings', () => $('settingsDialog').hidden ? openSettings() : closeSettings());
$('settingsSearch').oninput = drawSettingsTabs;
wire('syncChats', () => syncChats(true));
$('sidebarSearch').oninput = renderProjects;
document.addEventListener('pointerdown', event => {
  for (const menu of document.querySelectorAll('.sidebar-menu[open]')) {
    if (!menu.contains(event.target)) menu.open = false;
  }
});
document.addEventListener('keydown', event => {
  if (event.key !== 'Escape') return;
  const menu = document.querySelector('.sidebar-menu[open]');
  if (menu) { menu.open = false; menu.querySelector('summary').focus(); }
});

const sidebarResize = $('sidebarResize');
let sidebarWidth = Number(localStorage.getItem('sidebarWidth')) || 220;
function resizeSidebar(width) {
  sidebarWidth = Math.max(210, Math.min(455, width));
  document.body.style.setProperty('--sidebar-width', sidebarWidth + 'px');
  sidebarResize.setAttribute('aria-valuenow', String(sidebarWidth));
  localStorage.setItem('sidebarWidth', String(sidebarWidth));
}
resizeSidebar(sidebarWidth);
sidebarResize.onpointerdown = event => {
  sidebarResize.setPointerCapture(event.pointerId);
  const start = event.clientX;
  const width = document.querySelector('.projects').getBoundingClientRect().width;
  sidebarResize.onpointermove = move => resizeSidebar(Math.round(width + move.clientX - start));
  sidebarResize.onlostpointercapture = () => { sidebarResize.onpointermove = null; };
};
sidebarResize.onkeydown = event => {
  if (!['ArrowLeft', 'ArrowRight'].includes(event.key)) return;
  event.preventDefault();
  resizeSidebar(sidebarWidth + (event.key === 'ArrowLeft' ? -16 : 16));
};
wire('workspace', () => thread() ? newThread(thread().project) : $('openProject').click());
wire('manageModels', () => openSettings('models'));
wire('modelSettings', () => { $('modelDialog').close(); openSettings('models'); });
wire('changes', () => {
  if (document.body.classList.contains('hide-review') || !$('settingsDialog').hidden) {
    return openReview(projectPreference().tab || panelTab);
  }
  document.body.classList.add('hide-review');
  $('changes').setAttribute('aria-pressed', 'false');
});
wire('reviewChanges', () => openReview('changes'));
wire('reviewFiles', () => openReview('files'));
wire('reviewPreview', () => openReview('preview'));
wire('reviewTests', () => { view(activeId).selectedCheck = null; return openReview('tests'); });
wire('reviewTerminal', () => openReview('terminal'));
initProjectPanel();
wire('shareThread', () => {
  const item = thread();
  if (!item) return;
  const body = openWorkspace('Del tråd');
  const markdown = '# ' + cleanTitle(item.title) + '\n\n' + view(item.id).messages
    .filter(message => ['user', 'assistant'].includes(message.role))
    .map(message => '## ' + (message.role === 'user' ? 'Du' : 'Oh My Pi') + '\n\n' + message.text).join('\n\n');
  body.append(button('Kopier samtalen', async () => {
    await run('exportThread', { id: item.id, markdown, copy: true });
    status('Samtalen er kopiert.');
  }), button('Eksporter Markdown', async () => {
    if (await run('exportThread', { id: item.id, markdown })) status('Samtalen er eksportert.');
  }));
  const handoff = element('div', null, { class: 'handoff' });
  body.append(handoff);
  if (item.shared && item.sessionFile) handoff.append(button('Fortsett på mobilen', async () => {
    const result = await run('threadHandoff', item.id);
    handoff.replaceChildren(element('img', null, { src: result.image, width: '220', height: '220', alt: 'Åpne tråden på mobilen' }),
      element('p', 'Skann i Chat OMP OMP på en mobil paret med denne PC-en.'));
  }));
  else handoff.append(element('p', 'Mobiloverføring blir tilgjengelig etter første melding i en delt tråd.'));
});
wire('threadOptions', () => {
  const item = thread();
  if (!item) return;
  const current = view(item.id);
  const body = openWorkspace('Trådvalg');
  body.append(element('p', item.shared ? 'Delt tråd via OMP Bridge' : 'Lokal tråd på denne PC-en'),
    element('p', current.model?.name || current.model?.id || 'Standardmodell i OMP'),
    element('p', activeRequest?.id === item.id ? 'Venter på svar eller godkjenning.' : 'Ingen ventende godkjenning.'),
    button('Velg modell', () => { $('workspaceDialog').close(); return openModelPicker(); }),
    button('Åpne prosjektmappen', () => run('showProjectFolder', item.project)));
});
wire('refreshGit', refreshGit);
wire('stop', () => run('abort', activeId));
wire('attach', async () => {
  const id = activeId;
  const files = await run('attachments');
  view(id).attachments = [...view(id).attachments, ...files];
  renderConversation();
});
function loadModelCatalog(id, refresh = false) {
  if (modelLoads.has(id)) return modelLoads.get(id);
  if (!refresh && modelCatalogs.has(id)) return Promise.resolve(modelCatalogs.get(id));
  const request = run('models', { id, refresh }).then(({ models }) => {
    if (modelLoads.get(id) === request) modelCatalogs.set(id, models);
    return models;
  }).finally(() => {
    if (modelLoads.get(id) === request) modelLoads.delete(id);
  });
  modelLoads.set(id, request);
  return request;
}

async function updateModelPicker(refresh = false) {
  const generation = ++pickerGeneration;
  const id = pickerId;
  const cached = modelCatalogs.get(id);
  models = cached || [];
  if (cached) renderModels();
  else $('modelList').replaceChildren(element('p', 'Henter modeller fra OMP …'));
  $('modelFeedback').textContent = refresh ? 'Oppdaterer modeller …' : id ? '' : 'Valget brukes i nye tråder.';
  $('refreshModels').disabled = true;
  try {
    const result = await loadModelCatalog(id, refresh);
    if (generation !== pickerGeneration || !$('modelDialog').open) return;
    models = result;
    $('modelFeedback').textContent = id ? '' : 'Valget brukes i nye tråder.';
    renderModels();
  } catch (error) {
    if (generation !== pickerGeneration || !$('modelDialog').open) return;
    $('modelFeedback').textContent = error.message;
    if (!cached) $('modelList').replaceChildren();
  } finally {
    if (generation === pickerGeneration) $('refreshModels').disabled = false;
  }
}
function openModelPicker(anchored = false, global = false) {
  if ($('modelDialog').open || modelChanging) return;
  pickerId = global ? undefined : activeId;
  modelFilter = 'all';
  for (const filter of $('modelFilters').querySelectorAll('button')) {
    filter.setAttribute('aria-pressed', String(filter.dataset.filter === modelFilter));
  }
  $('modelSearch').value = '';
  const dialog = $('modelDialog');
  dialog.classList.toggle('anchored', anchored);
  if (anchored) {
    const trigger = $('model').getBoundingClientRect();
    dialog.style.setProperty('--model-left', Math.min(trigger.left, innerWidth - 496) + 'px');
    dialog.style.setProperty('--model-bottom', (innerHeight - trigger.top + 8) + 'px');
  }
  dialog.showModal();
  $('modelSearch').focus();
  return updateModelPicker(true);
}
wire('model', () => openModelPicker(true));
wire('refreshModels', () => updateModelPicker(true));
$('modelSearch').oninput = renderModels;
$('modelFilters').onclick = event => {
  const selected = event.target.closest('button[data-filter]');
  if (!selected) return;
  modelFilter = selected.dataset.filter;
  for (const filter of $('modelFilters').querySelectorAll('button')) filter.setAttribute('aria-pressed', String(filter === selected));
  renderModels();
};
$('modelDialog').onpointerdown = event => {
  if (event.target !== $('modelDialog') || modelChanging) return;
  const box = event.target.getBoundingClientRect();
  if (event.clientX < box.left || event.clientX >= box.right || event.clientY < box.top || event.clientY >= box.bottom) event.target.close();
};
$('modelDialog').onkeydown = event => {
  const search = $('modelSearch');
  const rows = [...$('modelList').querySelectorAll('button:not(:disabled)')];
  const index = rows.indexOf(document.activeElement);
  if (!['ArrowDown', 'ArrowUp'].includes(event.key) || (document.activeElement !== search && index < 0)) return;
  event.preventDefault();
  if (event.key === 'ArrowDown') rows[Math.min(index + 1, rows.length - 1)]?.focus();
  else if (index <= 0) search.focus();
  else rows[index - 1].focus();
};
for (const close of document.querySelectorAll('dialog .close')) close.onclick = () => close.closest('dialog').close();
$('settingsDialog').querySelector('.close').onclick = closeSettings;
$('message').oninput = commandSuggestions;
$('message').onkeydown = event => {
  if (event.key === 'Enter' && !event.shiftKey && !event.isComposing) {
    event.preventDefault();
    $('compose').requestSubmit();
  }
};
$('compose').onsubmit = event => submit(event).catch(report);
const desktopVoiceMode = window.createVoiceMode({
  button: $('voiceMode'), indicator: $('voiceStatus'), language: $('voiceLanguage'),
  request: (route, body) => run('voice', { route, body }),
  conversation: () => thread()?.shared ? activeId : null,
  send: async text => {
    if ($('message').value.trim() || view(activeId).busy) throw new Error('Fullfør oppgaven eller utkastet før du fortsetter med tale.');
    $('message').value = text;
    await submit(new Event('submit'));
  },
  answer: text => {
    const current = view(activeId);
    if (current.busy) return;
    const index = current.messages.findLastIndex(item => item.role === 'user' && item.text === text);
    return index >= 0 ? current.messages.slice(index + 1).reverse().find(item => item.role === 'assistant')?.text : undefined;
  }
});
$('voiceOpen').onclick = () => {
  $('voiceStatus').textContent = 'Trykk på bølgen for å begynne.';
  $('voiceDialog').showModal();
};
$('voiceClose').onclick = () => $('voiceDialog').close();
$('voiceDialog').addEventListener('close', desktopVoiceMode.stop);
$('chatMode').onchange = $('lightContext').onchange = () => {
  if (activeId) chatProfiles.set(activeId, { mode: $('chatMode').value, light: $('lightContext').checked });
  $('chatMode').title = 'Arbeidsmodus · ' + $('chatMode').selectedOptions[0].textContent;
};

async function start() {
  state = await run('state');
  $('desktopVersion').textContent = state.desktopVersion;
  applyTheme();
  renderProjects();
  renderConversation();
  if (state.detected) {
    if (!state.selected) loadModelCatalog(undefined).catch(() => {});
    run('version').then(result => { version = result; renderConversation(); }).catch(report);
  }
  if (state.selected) await connect(state.selected);
}
start().catch(report);
setInterval(() => syncChats(false).catch(() => {}), 6000);
