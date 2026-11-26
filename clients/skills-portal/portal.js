'use strict';
const $ = id => document.getElementById(id);
const session = location.hash.slice(1) || sessionStorage.getItem('omp-skills-page');
if (location.hash) {
  sessionStorage.setItem('omp-skills-page', session);
  history.replaceState(null, '', '/');
}
const selected = new Set();
let entries = [];
let library;
let queue = [];
let busy = false;
let active = 'discover';
let refreshInFlight = false;

function node(tag, text, attrs = {}) {
  const el = document.createElement(tag);
  if (text != null) el.textContent = text;
  for (const [key, value] of Object.entries(attrs)) el.setAttribute(key, value);
  return el;
}

function button(text, fn) {
  const el = node('button', text, { type: 'button' });
  el.onclick = () => work(fn);
  return el;
}

async function api(action, values = {}) {
  const response = await fetch('/api', {
    method: 'POST', headers: { 'Content-Type': 'application/json', 'X-OMP-Page': session || '' },
    body: JSON.stringify({ action, ...values })
  });
  const body = await response.json();
  if (!response.ok) throw new Error(body.error || 'Forespørselen mislyktes.');
  return body;
}

function report(text, failed = false, success = false) {
  $('status').textContent = text;
  $('status').className = failed ? 'error' : success ? 'success' : '';
}

async function work(task) {
  if (busy) return;
  busy = true;
  document.querySelector('main').setAttribute('aria-busy', 'true');
  try { await task(); }
  catch (error) { report(error.message, true); }
  finally { busy = false; document.querySelector('main').removeAttribute('aria-busy'); }
}

function tab(name) {
  active = name;
  for (const button of document.querySelectorAll('[data-tab]')) {
    const current = button.dataset.tab === name;
    button.setAttribute('aria-current', String(current));
    $(button.dataset.tab).hidden = !current;
  }
  $('selection').hidden = name !== 'discover';
}

function drawCatalogue() {
  const filter = $('filter').value.trim().toLowerCase();
  $('catalog').replaceChildren(...entries.filter(entry => [entry.category, entry.description, entry.ref]
    .some(value => value?.toLowerCase().includes(filter))).map(entry => {
    const card = node('article', null, { class: 'card' });
    const label = node('label');
    const choice = node('input', null, { type: 'checkbox' });
    const installed = library?.items.find(item => item.ref.toLowerCase() === entry.ref.toLowerCase());
    const inScope = installed && ($('scope').value === 'global' ? installed.global : installed.local);
    if (inScope) {
      selected.delete(entry.ref);
      choice.disabled = true;
    }
    choice.checked = selected.has(entry.ref);
    choice.onchange = () => choice.checked ? selected.add(entry.ref) : selected.delete(entry.ref);
    label.append(choice, node('strong', entry.category));
    card.append(label, node('small', entry.ref));
    if (installed) card.append(node('p', 'Allerede installert · ' +
      [installed.local && 'prosjekt', installed.global && 'globalt'].filter(Boolean).join(' og '), { class: 'success' }));
    if (entry.description) card.append(node('p', entry.description));
    return card;
  }));
}

const scopeName = scope => scope === 'global' ? 'Globalt for min OMP-bruker' : 'Kun dette prosjektet';
const sample = item => item.name === 'find-skills'
  ? 'Finn tre skills som passer dette prosjektet, og forklar hva de gjør.'
  : 'Bruk ' + item.name + ' til å foreslå et lite første steg i dette prosjektet.';

async function refresh() {
  if (refreshInFlight) return;
  refreshInFlight = true;
  try {
    const next = await api('skill-library');
    if (JSON.stringify(next) === JSON.stringify(library)) return;
    library = next;
    $('project').textContent = next.project + (next.pending ? ' · Gjelder fra neste oppgave' : '');
    drawInstalled();
    drawSetup();
    drawCatalogue();
  } finally { refreshInFlight = false; }
}

function drawInstalled() {
  const controls = $('installed');
  controls.replaceChildren(node('h2', 'Installerte skills'));
  if (!library.items.length) controls.append(node('p', 'Prosjektet har ingen importerte skills ennå.'));
  for (const item of library.items) {
    const card = node('article', null, { class: 'card' });
    const loaded = library.loaded.find(skill => skill.name === item.name);
    card.append(node('h3', item.name), node('p', item.ref, { class: 'muted' }),
      node('p', scopeName(item.scope) + ' · ' + item.sha.slice(0, 12) +
        (item.local && item.global ? ' · prosjektversjonen har forrang' : '')),
      node('p', loaded ? 'OMP har lastet ' + loaded.sha.slice(0, 12) + ' · ' + scopeName(loaded.scope)
        : library.blocked.includes(item.name) ? 'OMP har en annen skill med samme navn i dette prosjektet.'
        : item.enabled ? 'Avventer innlasting i OMP' : 'Avslått'));
    const actions = node('div', null, { class: 'actions' });
    const set = (scope, enabled) => mutate('set-skill', { scope, enabled, name: item.name });
    actions.append(switchControl('Aktiv i prosjektet', item.enabled, checked => set('project', checked)));
    if (!item.local && item.global && item.override !== null) actions.append(button('Bruk global innstilling', () => set('project', null)));
    if (loaded && item.enabled && loaded.sha === item.sha) actions.append(button('Prøv i OMP', async () => {
      await api('try-skill', { name: item.name, draft: sample(item) });
      report('Forslaget ligger klart i skrivefeltet i OMP Desktop.');
    }));
    card.append(actions);
    for (const scope of ['project', 'global']) {
      const version = scope === 'global' ? item.global : item.local;
      if (!version) continue;
      const row = node('div', null, { class: 'actions' });
      row.append(node('small', scopeName(scope) + ' · ' + version.sha.slice(0, 12)));
      if (scope === 'global') row.append(switchControl('Aktiv globalt', version.enabled, checked => set(scope, checked)));
      row.append(button('Se etter oppdatering', () => prepare([{ ref: version.ref, scope }])));
      if (version.previous?.length) row.append(button('Gjenopprett forrige', () =>
        mutate('rollback-skill', { name: item.name, scope })));
      row.append(button('Avinstaller', async () => {
        const affected = scope === 'global' ? item.affected : [];
        const text = affected.length ? 'Følgende prosjekter bruker den globale skillen:\n' + affected.join('\n') : scopeName(scope);
        if (confirm('Avinstaller ' + item.name + '?\n\n' + text)) await mutate('remove-skill', { name: item.name, scope, affected });
      }));
      card.append(row);
    }
    controls.append(card);
  }
}

function switchControl(text, checked, run) {
  const label = node('label', null, { class: 'portal-toggle' });
  const toggle = node('input', null, { type: 'checkbox', role: 'switch', 'aria-label': text });
  toggle.checked = checked;
  toggle.onchange = () => work(async () => {
    toggle.disabled = true;
    try { await run(toggle.checked); }
    catch (error) { toggle.checked = !toggle.checked; throw error; }
    finally { toggle.disabled = false; }
  });
  label.append(toggle, node('span', text));
  return label;
}

async function mutate(action, args) {
  const result = await api(action, args);
  report(result.pending ? 'Lagret. Gjelder fra neste oppgave.' : 'Lagret.');
  await refresh();
}

function drawSetup() {
  const root = $('setup');
  root.replaceChildren(node('h2', 'Prosjektets låsefil og skill-pakker'),
    node('p', 'Låsefilen lagrer kilde, revisjon og aktiv status. Du kan sjekke den inn sammen med prosjektet.'),
    button('Skriv omp-skills.lock.json', () => mutate('write-lock', {})));
  const restore = library.lock.filter(item => !item.matches);
  if (library.lockError) root.append(node('p', 'Låsefilen kunne ikke leses: ' + library.lockError, { class: 'error' }));
  if (library.lock.length) {
    root.append(node('p', restore.length ? restore.length + ' skills mangler eller avviker fra låsefilen.' : 'Prosjektet samsvarer med låsefilen.'));
    for (const item of restore) root.append(node('p', item.ref + ' · ' + item.sha.slice(0, 12)));
    if (restore.length) root.append(button('Forhåndsvis gjenoppretting', () => restoreSetup(restore)));
  }
  const label = node('input', null, { placeholder: 'Navn på pakken', 'aria-label': 'Navn på pakken', maxlength: '80' });
  const card = node('section', null, { class: 'panel' });
  card.append(node('h3', 'Gjenbrukbare pakker'), label, button('Lagre prosjektets skills som pakke', () =>
    mutate('save-pack', { label: label.value, skills: library.items.map(({ ref, sha, enabled }) => ({ ref, sha, enabled })) })));
  for (const pack of library.packs) card.append(node('p', pack.label + ' · ' + pack.skills.length + ' skills'),
    button('Forhåndsvis ' + pack.label, () => restoreSetup(pack.skills)));
  root.append(card);
}

function restoreSetup(items) {
  const missing = items.filter(item => !library.items.some(existing =>
    existing.ref === item.ref && existing.sha === item.sha && existing.enabled === item.enabled));
  if (!missing.length) { report('Prosjektet har allerede dette oppsettet.'); return; }
  return prepare(missing.slice(0, 20).map(item => ({ ref: item.ref, revision: item.sha, restoreEnabled: item.enabled, scope: 'project' })));
}

async function prepare(items) {
  if (!items.length || items.length > 20) throw new Error('Velg mellom 1 og 20 skills.');
  queue = items.map(item => ({ ...item, scope: item.scope || $('scope').value }));
  $('review').hidden = false;
  $('destination').textContent = scopeName(queue[0].scope) + ' · ' + library.project;
  $('review').scrollIntoView({ block: 'start' });
  await loadPreviews();
}

async function loadPreviews() {
  report('Henter forhåndsvisninger …');
  for (const item of queue) {
    if (item.preview || item.done) continue;
    try { item.preview = await api('preview-skill', { target: item.ref, scope: item.scope, revision: item.revision }); item.error = ''; }
    catch (error) { item.error = error.message; }
    drawQueue();
  }
  const valid = queue.filter(item => item.preview && !item.error).length;
  report(valid ? valid + ' gyldige kilder. Gjennomgå utvalget før du installerer.' : 'Ingen gyldige kilder ble funnet.', !valid, !!valid);
}

function drawQueue() {
  $('previews').replaceChildren(...queue.map(item => {
    const card = node('article', null, { class: 'card' });
    card.append(node('h3', item.ref));
    if (item.done) { card.append(node('p', 'Installert', { class: 'success' })); return card; }
    if (item.error) card.append(node('p', item.error, { class: 'error' }));
    if (!item.preview) return card;
    const p = item.preview;
    const match = library?.items.find(skill => skill.name === p.name);
    const installed = item.scope === 'global' ? match?.global : match?.local;
    if (installed?.sha === p.sha) card.append(node('p', 'Allerede installert i valgt omfang.', { class: 'success' }));
    const include = node('input', null, { type: 'checkbox', 'aria-label': 'Installer ' + p.name });
    include.checked = item.include !== false;
    include.onchange = () => { item.include = include.checked; };
    const label = node('label');
    label.append(include, node('span', 'Gyldig kilde · ' + p.name + ' · ' + p.sha.slice(0, 12), { class: 'success' }));
    card.append(label, node('p', p.requires ? 'Oppgitte verktøy: ' + p.requires +
      (p.dependencyAvailable === false ? ' · Ikke funnet på PC-en' : '') : 'Ingen deklarerte verktøykrav.'));
    if (p.omitted) card.append(node('small', p.omitted + ' filer utenfor Markdown-importen.'));
    const details = node('details', null, { open: '' });
    details.append(node('summary', p.previous && p.previous !== p.markdown ? 'Se versjonsendring' : 'Les SKILL.md'));
    if (p.previous && p.previous !== p.markdown) {
      const diff = node('div', null, { class: 'diff' });
      for (const [title, text] of [['Installert versjon', p.previous], ['Ny versjon', p.markdown]]) {
        const column = node('div');
        column.append(node('strong', title), node('pre', text));
        diff.append(column);
      }
      details.append(diff);
    } else details.append(node('pre', p.markdown));
    card.append(details);
    return card;
  }));
  $('install').disabled = !queue.some(item => !item.done);
  $('install').textContent = queue.some(item => item.done || item.error) ? 'Fortsett med gjenstående' : 'Installer valgte skills';
}

async function install() {
  if (!queue.some(item => !item.done && item.preview && item.include !== false) && queue.some(item => !item.done && !item.preview)) {
    await loadPreviews();
    report('Gjennomgå nye forhåndsvisninger og velg Installer på nytt.');
    return;
  }
  for (const item of queue) {
    if (item.done || item.include === false || !item.preview) continue;
    try {
      await api('install-skill', { target: item.preview.ticket, scope: item.scope, restoreEnabled: item.restoreEnabled });
      item.done = true;
      item.error = '';
    } catch (error) {
      item.error = error.message;
      if (error.message.includes('forhåndsvisningen på nytt')) item.preview = null;
    }
    drawQueue();
  }
  report(queue.filter(item => item.done).length + ' installert. ' +
    queue.filter(item => item.error).length + ' feilet. Gjenstående kan prøves på nytt.');
  await refresh();
}

for (const control of document.querySelectorAll('[data-tab]')) control.onclick = () => tab(control.dataset.tab);
$('filter').oninput = drawCatalogue;
$('scope').onchange = drawCatalogue;
$('preview').onclick = () => work(() => prepare([...new Set([...selected, ...$('refs').value.split(/\r?\n/).map(line => line.trim()).filter(Boolean)])]
  .map(ref => ({ ref }))));
$('install').onclick = () => work(install);
$('cancel').onclick = () => { if (!busy) $('review').hidden = true; };
work(async () => {
  const data = await api('catalog');
  entries = data.entries;
  drawCatalogue();
  await refresh();
});
setInterval(() => { if (!busy && !document.hidden) refresh().catch(() => {}); }, 7000);
