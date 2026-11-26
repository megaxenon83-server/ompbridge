'use strict';

const panelTabs = {
  preview: ['reviewPreview', 'previewPanel'], changes: ['reviewChanges', 'diff'],
  tests: ['reviewTests', 'testsPanel'], terminal: ['reviewTerminal', 'terminalPanel'],
  files: ['reviewFiles', 'projectFiles']
};
let panelTab = 'changes';
let previewRequest = 0;
let previewBoundsQueued = false;
let pickingPreview = false;
let testLog;
let testHeading;
let testAction;
let testShare;
let loadedPreview;

function projectPreference() {
  const project = thread()?.project;
  const key = project && 'projectPanel:' + projectKey(project);
  let data = {};
  if (key) { try { data = JSON.parse(localStorage.getItem(key)) || {}; } catch {} }
  return { ...data, key };
}

function saveProjectPreference(changes) {
  const { key, ...data } = projectPreference();
  if (key) localStorage.setItem(key, JSON.stringify({ ...data, ...changes }));
}

function panelWidth(value) {
  const width = Math.max(300, Math.min(760, Math.round(value)));
  document.body.style.setProperty('--project-panel-width', width + 'px');
  return width;
}

function updatePreviewBounds() {
  if (previewBoundsQueued) return;
  previewBoundsQueued = true;
  queueMicrotask(() => {
    previewBoundsQueued = false;
    const viewport = $('previewViewport');
    const visible = activeId && panelTab === 'preview' && view(activeId).previewReady &&
      !document.querySelector('dialog[open]') && !$('previewSurface').hidden && viewport.getClientRects().length;
    const rect = visible ? viewport.getBoundingClientRect().toJSON() : null;
    run('projectPreviewBounds', { id: activeId, rect }).catch(() => {});
  });
}

function resetPanelForThread() {
  panelWidth(projectPreference().width || 520);
  if (!document.body.classList.contains('hide-review') && $('settingsDialog').hidden) {
    openReview(projectPreference().tab || 'changes').catch(report);
  }
  updatePreviewBounds();
}

function showPreviewSurface(current) {
  const ready = !!current.previewReady;
  $('previewSurface').hidden = !ready;
  $('previewTools').hidden = !ready;
  $('previewForm').hidden = ready;
  $('previewViewport').classList.toggle('mobile-preview', !!projectPreference().mobile);
  $('previewMobile').setAttribute('aria-pressed', String(!!projectPreference().mobile));
  $('previewOutput').textContent = current.previewOutput || '';
  $('previewDiagnostics').hidden = !current.previewOutput;
  updatePreviewBounds();
}

async function showProjectPreview() {
  const id = activeId;
  if (!id) {
    $('previewForm').hidden = $('previewTools').hidden = $('previewSurface').hidden = $('previewDiagnostics').hidden = true;
    $('previewStatus').textContent = 'Åpne et prosjekt først.';
    updatePreviewBounds();
    return;
  }
  const generation = ++previewRequest;
  const current = view(id);
  current.previewReady = false;
  showPreviewSurface(current);
  const { defaults, server } = await run('projectPanel', id);
  if (id !== activeId || generation !== previewRequest || panelTab !== 'preview') return;
  const preference = projectPreference();
  const command = preference.command ?? defaults.command;
  $('previewCommand').value = command;
  $('previewAddress').value = preference.address ?? (command ? defaults.address : defaults.staticPath);
  $('previewStatus').textContent = '';
  const address = current.previewAddress || server;
  if (!address) return;
  if (loadedPreview?.id === id && loadedPreview.address === address) {
    current.previewReady = true;
    $('previewStatus').textContent = address;
    showPreviewSurface(current);
    return;
  }
  await loadProjectPreview(id, address);
}

async function loadProjectPreview(id, address) {
  const current = view(id);
  try {
    loadedPreview = null;
    await run('projectLoadPreview', { id, address });
    loadedPreview = { id, address };
    current.previewAddress = address;
    current.previewReady = true;
    if (id === activeId && panelTab === 'preview') {
      $('previewStatus').textContent = address;
      showPreviewSurface(current);
    }
  } catch (error) {
    current.previewReady = false;
    if (id === activeId && panelTab === 'preview') {
      $('previewStatus').textContent = error.message;
      showPreviewSurface(current);
    }
  }
}

async function launchProjectPreview(existing = false) {
  const id = activeId;
  if (!id || $('launchProject').disabled) return;
  const command = $('previewCommand').value.trim();
  const address = $('previewAddress').value.trim();
  const current = view(id);
  current.previewOutput = '';
  $('launchProject').disabled = $('openPreviewAddress').disabled = true;
  $('previewStatus').textContent = 'Åpner prosjektet …';
  saveProjectPreference({ command, address });
  try {
    const target = existing ? address : await run('projectLaunch', { id, command, address, staticPath: address });
    current.previewAddress = target;
    if (id === activeId && panelTab === 'preview') await loadProjectPreview(id, target);
  } catch (error) {
    if (id === activeId) $('previewStatus').textContent = error.message;
  } finally { $('launchProject').disabled = $('openPreviewAddress').disabled = false; }
}

async function pickPreviewElement() {
  if (pickingPreview) { await run('projectCancelPick'); return; }
  const id = activeId;
  pickingPreview = true;
  $('previewPick').textContent = 'Avbryt markering';
  $('previewStatus').textContent = 'Klikk på et element i forhåndsvisningen.';
  try {
    const target = await run('projectPick', id);
    if (!target || activeId !== id || panelTab !== 'preview') return;
    const text = 'Forhåndsvisning (' + target.width + ' px), side ' + target.path +
      ', element `' + target.selector + '`' + (target.label ? ' (' + JSON.stringify(target.label) + ')' : '') + '.';
    const input = $('message');
    input.value = [input.value.trim(), text, ''].filter((part, index) => part || index === 2).join('\n');
    input.focus();
    input.setSelectionRange(input.value.length, input.value.length);
  } finally {
    pickingPreview = false;
    $('previewPick').textContent = 'Pek og be om endring';
    if (activeId === id) $('previewStatus').textContent = view(id).previewAddress || '';
  }
}

function testSummary(check) {
  const label = check.running ? 'Tester kjører …' : check.exitCode === 0 ? 'Tester bestod' :
    check.exitCode === null ? 'Testkjøring avbrutt' : 'Tester feilet (' + check.exitCode + ')';
  return check.running ? label : label + ' · ' + (check.duration / 1000).toFixed(1) + ' s';
}

function selectedProjectCheck(current) {
  return (current.projectTest?.id === current.selectedCheck || !current.selectedCheck ? current.projectTest : null) ||
    current.checks?.find(check => check.id === current.selectedCheck) || current.checks?.at(-1);
}

function updateProjectTest(id) {
  if (id !== activeId || panelTab !== 'tests' || !testHeading?.isConnected) return;
  const current = view(id);
  const check = selectedProjectCheck(current);
  testHeading.textContent = check ? testSummary(check) : 'Ingen testkjøringer i denne samtalen.';
  testLog.textContent = check?.output || '';
  testLog.hidden = !check?.output;
  testAction.textContent = current.projectTest?.running ? 'Stopp tester' : 'Kjør tester';
  testShare.hidden = !check || !(check.shared || current.sharedChecks?.has(check.id));
}

async function showProjectTests() {
  const id = activeId;
  const body = $('testsPanel');
  body.replaceChildren();
  if (!id) { body.append(element('p', 'Åpne et prosjekt først.')); return; }
  const form = element('form', null, { class: 'project-panel-form' });
  body.append(form);
  const { defaults, test, checks } = await run('projectPanel', id);
  if (!form.isConnected || id !== activeId) return;
  const current = view(id);
  if (!current.projectTest && test) current.projectTest = test;
  if (!current.checks) current.checks = checks;
  const [label, input] = field('Testkommando', { value: projectPreference().test ?? defaults.test, placeholder: 'npm.cmd test' });
  testHeading = element('p', null, { class: 'form-status', role: 'status' });
  testLog = element('pre', null, { class: 'project-output' });
  testShare = button('Gjennomgå på Android', () => showTestHandoff(id, selectedProjectCheck(current)));
  testAction = element('button', 'Kjør tester', { class: 'primary', type: 'submit' });
  form.append(label, testAction);
  body.append(testHeading, testShare, testLog);
  form.onsubmit = async event => {
    event.preventDefault();
    if (current.projectTest?.running) { await run('projectStopTest', id).catch(report); return; }
    if (!input.value.trim()) { testHeading.textContent = 'Skriv inn testkommandoen.'; return; }
    testAction.disabled = true;
    try {
      saveProjectPreference({ test: input.value.trim() });
      current.selectedCheck = null;
      const userIndex = current.messages.filter(message => message.role === 'user').length;
      const test = await run('projectRunTest', { id, command: input.value.trim(), userIndex });
      if (current.projectTest?.id !== test.id) current.projectTest = test;
      updateProjectTest(id);
    } catch (error) { testHeading.textContent = error.message; }
    finally { if (form.isConnected) testAction.disabled = false; }
  };
  updateProjectTest(id);
}

async function showTestHandoff(id, check) {
  const body = openWorkspace('Gjennomgå på Android');
  const region = element('div', null, { class: 'handoff' });
  body.append(region);
  const result = await run('threadHandoff', { id, check: check.id });
  if (region.isConnected) region.append(element('img', null, { src: result.image, width: '220', height: '220',
    alt: 'Åpne testresultatet på Android' }), element('p', 'Skann i Chat OMP OMP på en paret telefon.'));
}

function initProjectPanel() {
  const resize = $('reviewResize');
  resize.onpointerdown = event => {
    resize.setPointerCapture(event.pointerId);
    const start = event.clientX;
    const width = $('review').getBoundingClientRect().width;
    resize.onpointermove = move => saveProjectPreference({ width: panelWidth(width + start - move.clientX) });
    resize.onlostpointercapture = () => { resize.onpointermove = null; };
  };
  resize.onkeydown = event => {
    if (!['ArrowLeft', 'ArrowRight'].includes(event.key)) return;
    event.preventDefault();
    saveProjectPreference({ width: panelWidth($('review').getBoundingClientRect().width + (event.key === 'ArrowLeft' ? 16 : -16)) });
  };
  new ResizeObserver(updatePreviewBounds).observe($('previewViewport'));
  const visibility = new MutationObserver(updatePreviewBounds);
  visibility.observe(document.body, { attributes: true, attributeFilter: ['class'] });
  document.querySelectorAll('dialog').forEach(dialog => visibility.observe(dialog, { attributes: true, attributeFilter: ['open'] }));
  window.addEventListener('resize', updatePreviewBounds);
  $('review').addEventListener('scroll', updatePreviewBounds);
  $('previewForm').onsubmit = event => { event.preventDefault(); launchProjectPreview().catch(report); };
  wire('openPreviewAddress', () => launchProjectPreview(true));
  wire('openPreview', () => openReview('preview'));
  wire('previewPick', pickPreviewElement);
  wire('previewMobile', () => {
    saveProjectPreference({ mobile: !projectPreference().mobile });
    showPreviewSurface(view(activeId));
  });
  wire('previewReload', () => loadProjectPreview(activeId, view(activeId).previewAddress));
  wire('previewStop', async () => {
    const id = activeId;
    await run('projectStopPreview', id);
    if (loadedPreview?.id === id) loadedPreview = null;
    const current = view(id);
    current.previewAddress = null;
    current.previewReady = false;
    if (id === activeId) {
      $('previewStatus').textContent = 'Forhåndsvisningen er stoppet.';
      showPreviewSurface(current);
    }
  });
}
