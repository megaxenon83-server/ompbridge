'use strict';

(() => {
  const expandedCards = new Map();
  const labels = {
    pending: ['○', 'Venter'],
    in_progress: ['◉', 'Pågår'],
    completed: ['✓', 'Ferdig'],
    abandoned: ['–', 'Avbrutt'],
    blocked: ['!', 'Blokkert']
  };
  const element = (tag, text, className) => {
    const item = document.createElement(tag);
    if (text != null) item.textContent = text;
    if (className) item.className = className;
    return item;
  };

  function todo(container, phases, thread) {
    const list = Array.isArray(phases) ? phases.filter(phase => phase.tasks?.length) : [];
    const version = JSON.stringify([thread, list]);
    if (container.dataset.version === version) return;
    const sameThread = container.dataset.thread === String(thread || '');
    const previous = container.querySelector('details');
    const wasPending = container.dataset.pending === 'true';
    container.dataset.version = version;
    container.dataset.thread = String(thread || '');
    container.hidden = !list.length;
    container.replaceChildren();
    if (!list.length) return;
    const tasks = list.flatMap(phase => phase.tasks);
    const completed = tasks.filter(task => task.status === 'completed').length;
    const abandoned = tasks.filter(task => task.status === 'abandoned').length;
    const remaining = tasks.length - completed - abandoned;
    container.dataset.pending = String(remaining > 0);
    const details = element('details');
    details.open = remaining > 0 && (!sameThread || !wasPending || !previous || previous.open);
    const summary = element('summary');
    const heading = element('span', 'Oppgaver', 'todo-heading');
    const parts = [completed + ' av ' + tasks.length + ' ferdig', remaining + ' gjenstår'];
    if (abandoned) parts.push(abandoned + ' avbrutt');
    summary.append(heading, element('span', parts.join(' · '), 'todo-count'));
    details.append(summary);
    const content = element('div', null, 'todo-content');
    for (const phase of list) {
      if (list.length > 1 && phase.name) content.append(element('h3', phase.name));
      const group = element('ul');
      for (const task of phase.tasks) {
        const [symbol, status] = labels[task.status] || labels.pending;
        const row = element('li', null, 'todo-task');
        row.dataset.status = task.status || 'pending';
        const check = element('span', symbol, 'todo-symbol');
        check.setAttribute('aria-hidden', 'true');
        row.append(check, element('span', task.content, 'todo-task-text'), element('small', status));
        if (task.blocker) row.title = task.blocker;
        group.append(row);
      }
      content.append(group);
    }
    details.append(content);
    container.append(details);
  }

  const glyphs = {
    copy: '<rect x="8" y="8" width="12" height="12" rx="2"/><path d="M15 4H6a2 2 0 0 0-2 2v9"/>',
    speaker: '<path d="M3 9v6h4l5 4V5L7 9H3m12 0a4 4 0 0 1 0 6m3-9a8 8 0 0 1 0 12"/>',
    stop: '<rect x="6" y="6" width="12" height="12" rx="2"/>',
    check: '<path d="m5 12 4 4L19 6"/>',
    settings: '<circle cx="12" cy="12" r="3"/><path d="M10 3h4l.7 2.8 2 .9 2.5-.9 2 3.4-1.8 1.9v2l1.8 1.9-2 3.4-2.5-.9-2 .9L14 21h-4l-.7-2.6-2-.9-2.5.9-2-3.4 1.8-1.9v-2L2.8 9.2l2-3.4 2.5.9 2-.9L10 3Z"/>',
    models: '<rect x="5" y="5" width="14" height="14" rx="3"/><path d="M9 2v3m6-3v3M9 19v3m6-3v3M2 9h3m-3 6h3m14-6h3m-3 6h3"/><rect x="9" y="9" width="6" height="6" rx="1"/>',
    tokens: '<path d="M4 18h16M6 15v-4m4 4V6m4 9V9m4 6V4"/>',
    bridge: '<path d="m10 14 4-4m-7 6-1 1a3 3 0 0 1-4-4l5-5a3 3 0 0 1 4 0m2 8a3 3 0 0 0 4 0l5-5a3 3 0 0 0-4-4l-1 1"/>',
    theme: '<circle cx="12" cy="12" r="4"/><path d="M12 2v3m0 14v3M2 12h3m14 0h3M5 5l2 2m10 10 2 2M5 19l2-2M17 7l2-2"/>',
    resources: '<path d="M4 6h16M4 12h16M4 18h16"/><circle cx="8" cy="6" r="2" fill="var(--surface, var(--paper))"/><circle cx="15" cy="12" r="2" fill="var(--surface, var(--paper))"/><circle cx="10" cy="18" r="2" fill="var(--surface, var(--paper))"/>',
    plugins: '<path d="M8 3v5m8-5v5M6 8h12v3a6 6 0 0 1-12 0V8Zm6 9v4"/>',
    device: '<rect x="7" y="2" width="10" height="20" rx="2"/><path d="M11 18h2"/>',
    power: '<path d="M12 2v10m5.7-7a9 9 0 1 1-11.4 0"/>',
    archive: '<path d="M4 8v11h16V8M9 12h6"/><rect x="3" y="4" width="18" height="4" rx="1"/>',
    chat: '<path d="M20 11a8 8 0 0 1-8 8 8.5 8.5 0 0 1-3-.5L4 20l1.5-4A8 8 0 1 1 20 11Z"/>'
  };

  function iconButton(button, icon, label) {
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.setAttribute('viewBox', '0 0 24 24');
    svg.setAttribute('class', 'action-icon');
    svg.setAttribute('aria-hidden', 'true');
    svg.innerHTML = glyphs[icon];
    button.replaceChildren(svg);
    button.title = label;
    button.setAttribute('aria-label', label);
    return button;
  }

  function pluginTest(last, enabled, run, title = 'Test plugin') {
    const row = element('div', null, 'plugin-test');
    const control = element('button', title);
    control.type = 'button';
    control.disabled = !enabled;
    const result = element('span');
    result.setAttribute('role', 'status');
    function update(test) {
      result.textContent = test ? (test.ok ? 'Test OK' : 'Test feilet') + ' · ' + test.detail +
        (Number.isFinite(test.duration) ? ' · ' + test.duration + ' ms' : '') : '';
      result.className = test ? (test.ok ? 'test-success' : 'test-error') : '';
    }
    update(last);
    control.onclick = async () => {
      control.disabled = true;
      result.className = '';
      result.textContent = 'Tester i OMP …';
      try { update(await run()); }
      catch (error) { update({ ok: false, detail: error.message }); }
      finally { control.disabled = false; }
    };
    row.append(control, result);
    return row;
  }

  function skillControls(item, hasSession, { change, test, report }) {
    const card = element('article', null, 'skill-control');
    const status = element('small');
    const active = element('input', null, 'switch-input');
    const scope = element('input', null, 'switch-input');
    for (const toggle of [active, scope]) {
      toggle.type = 'checkbox';
      toggle.setAttribute('role', 'switch');
    }
    active.setAttribute('aria-label', 'Aktiver ' + item.name);
    scope.setAttribute('aria-label', 'Kun denne samtalen · ' + item.name);
    const testing = pluginTest(item.test, true, test, 'Test skill');
    // A real track + thumb instead of a CSS pseudo-element: ::before on a
    // checkbox does not render consistently in the Android WebView, which made
    // these look like plain boxes rather than switches.
    const label = (title, input) => {
      const row = element('label', null, 'skill-switch');
      const track = element('span', null, 'switch-track');
      track.append(element('span', null, 'switch-thumb'));
      row.append(element('span', title, 'skill-switch-label'), input, track);
      return row;
    };
    function draw() {
      scope.checked = item.sessionEnabled !== null;
      active.checked = item.sessionEnabled ?? item.globalEnabled;
      scope.disabled = !hasSession;
      status.textContent = (active.checked ? 'Aktivert' : 'Deaktivert') + (scope.checked ? ' · kun denne samtalen' : ' · global innstilling') +
        (item.scope === 'project' ? ' · installert i prosjektet' : '');
    }
    async function set(kind, enabled) {
      const field = kind === 'global' ? 'globalEnabled' : 'sessionEnabled';
      card.setAttribute('aria-busy', 'true');
      active.disabled = scope.disabled = true;
      try {
        await change(kind, enabled);
        item[field] = enabled;
        testing.querySelector('[role="status"]').textContent = '';
      } catch (error) { report(error); }
      finally {
        card.removeAttribute('aria-busy');
        active.disabled = false;
        draw();
      }
    }
    active.onchange = () => set(scope.checked ? 'session' : 'global', active.checked);
    scope.onchange = () => set('session', scope.checked ? active.checked : null);
    card.append(element('strong', item.name), status);
    if (item.detail) card.append(element('p', item.detail));
    card.append(label('Aktivert', active), label('Kun denne samtalen', scope), testing);
    if (!hasSession) card.append(element('small', 'Send en melding i en delt samtale for å bruke samtalevalg.'));
    draw();
    return card;
  }

  const tokenFormat = new Intl.NumberFormat('nb');
  const tokenCompact = new Intl.NumberFormat('nb', { notation: 'compact', maximumFractionDigits: 1 });
  const thinkingLabels = { off: ['Av', 'Off'], minimal: ['Minimalt', 'Minimal'], low: ['Lavt', 'Low'],
    medium: ['Middels', 'Medium'], high: ['Høyt', 'High'], xhigh: ['Ekstra høyt', 'Extra high'], max: ['Maks', 'Max'],
    on: ['På', 'On'] };
  function thinkingChoice(control, model, disabled) {
    const metadata = model?.thinking;
    const levels = Array.isArray(metadata?.efforts) ? metadata.efforts : metadata?.mode === 'toggle' ? ['on'] : [];
    const available = [...new Set(levels.filter(level => level !== 'off' && thinkingLabels[level]))];
    control.hidden = !model?.id || !model.provider || !available.length;
    control.disabled = disabled;
    if (control.hidden) return;
    const key = 'omp-thinking:' + JSON.stringify([model.provider, model.id]);
    const optionsKey = JSON.stringify([key, available, document.documentElement.lang]);
    if (control.dataset.options === optionsKey) return;
    control.dataset.options = optionsKey;
    const tr = value => window.ompLocale?.translate(value) || value;
    const english = document.documentElement.lang === 'en';
    control.replaceChildren(new Option(english ? 'Reasoning' : tr('Resonnering'), ''),
      ...['off', ...available].map(level => new Option(thinkingLabels[level][english ? 1 : 0], level)));
    control.value = localStorage.getItem(key) || '';
    if (control.selectedIndex < 0) control.value = '';
    control.onchange = () => {
      if (control.value) localStorage.setItem(key, control.value);
      else localStorage.removeItem(key);
    };
  }
  function recoveryStatus(frame) {
    if (frame.type === 'auto_retry_start' && (frame.recovery || /thinking.loop/i.test(frame.errorMessage || ''))) {
      return 'OMP prøver en annen strategi' + (frame.attempt ? ' (' + frame.attempt + '/' + (frame.maxAttempts || 3) + ')' : '');
    }
    if (frame.type === 'auto_retry_end') {
      return frame.success ? 'OMP gjenopptar arbeidet' : 'Gjenoppretting stoppet. Send en melding for å fortsette.';
    }
  }
  function thinkingRequest(control, model) {
    return control.hidden || !control.value || !model?.id ? undefined :
      { level: control.value, provider: model.provider, id: model.id };
  }

  // Totals over the whole history are shown in the token meter, which is
  // repainted on every streamed delta. Recompute only when the history actually
  // changed: same array, same length, same tail object and usage.
  const usageCache = new WeakMap();
  function usageTotals(messages) {
    const list = Array.isArray(messages) ? messages : [];
    const tail = list.length ? list[list.length - 1] : null;
    const cached = usageCache.get(list);
    if (cached && cached.length === list.length && cached.tail === tail &&
        cached.usage === tail?.usage && cached.text === tail?.text) return cached.total;
    const total = usageSum(list);
    if (list && typeof list === 'object') {
      usageCache.set(list, { length: list.length, tail, usage: tail?.usage, text: tail?.text, total });
    }
    return total;
  }

  function usageSum(messages) {
    const total = { input: 0, output: 0, reasoning: null, cacheRead: 0, cacheWrite: 0, tokens: 0, calls: 0, last: 0, lastInput: 0 };
    const seen = new Set();
    const valid = value => typeof value === 'number' && Number.isFinite(value) && value >= 0;
    for (const item of messages) {
      const usage = item.usage;
      if (item.role !== 'assistant' || !usage || (item.id && seen.has(item.id))) continue;
      if (!['totalTokens', 'input', 'output', 'cacheRead', 'cacheWrite'].some(key => valid(usage[key]) && usage[key] > 0)) continue;
      if (item.id) seen.add(item.id);
      let sum = 0;
      for (const key of ['input', 'output', 'cacheRead', 'cacheWrite']) {
        if (valid(usage[key])) { sum += usage[key]; total[key] += usage[key]; }
      }
      const reasoning = usage.reasoningTokens ?? usage.outputTokensDetails?.reasoningTokens;
      if (valid(reasoning)) total.reasoning = (total.reasoning || 0) + reasoning;
      total.last = valid(usage.totalTokens) ? usage.totalTokens : sum;
      total.lastInput = ['input', 'cacheRead', 'cacheWrite'].reduce((count, key) => count + (valid(usage[key]) ? usage[key] : 0), 0);
      total.tokens += total.last;
      total.calls++;
    }
    return total;
  }

  const generationStates = new Map();
  function generation(key, frame) {
    if (!key) return {};
    let state = generationStates.get(key);
    if (!state) {
      state = {};
      try { state.last = JSON.parse(localStorage.getItem('omp-generation:' + key)); } catch {}
      generationStates.set(key, state);
    }
    if (!frame) return state;
    const now = frame.trace?.bridgeReceivedAt || frame.ts || Date.now();
    const kind = frame.assistantMessageEvent?.type || frame.kind;
    const delta = frame.assistantMessageEvent?.delta ?? frame.delta;
    const output = (frame.type === 'message_delta' || frame.type === 'message_update') &&
      ['text', 'thinking', 'text_delta', 'thinking_delta'].includes(kind) && typeof delta === 'string' && delta.length;
    if (frame.type === 'message_start' && (frame.message?.role || frame.role) === 'assistant') {
      state.started = now;
      state.first = state.latest = state.sampleAt = state.rate = state.backendAt = undefined;
      state.chars = state.sampleChars = 0;
    }
    if (output) {
      if (state.first == null) state.first = now;
      state.latest = now;
      state.active = true;
      if (state.sampleAt == null) state.sampleAt = now;
      state.chars = (state.chars || 0) + delta.length;
      const interval = now - state.sampleAt;
      if (interval >= 950) {
        const sample = (state.chars - (state.sampleChars || 0)) * 250 / interval;
        if (state.backendAt == null || now - state.backendAt > 2200) {
          state.rate = !state.estimated || state.rate === undefined ? sample : state.rate * 0.65 + sample * 0.35;
          state.estimated = true;
        }
        state.sampleChars = state.chars;
        state.sampleAt = now;
      }
    }
    if (frame.type === 'state' && state.active && frame.state?.tokensPerSecond > 0) {
      state.rate = state.estimated || state.rate == null ? frame.state.tokensPerSecond : state.rate * 0.65 + frame.state.tokensPerSecond * 0.35;
      state.estimated = false;
      state.backendAt = now;
    }
    if (frame.type === 'message_end' && frame.message?.role === 'assistant' && (state.first != null || frame.message.timings)) {
      const timing = frame.message.timings || {};
      const observedDuration = frame.message.duration > frame.message.ttft && frame.message.ttft >= 0
        ? frame.message.duration - frame.message.ttft : undefined;
      const duration = timing.predicted_ms ?? observedDuration ?? (state.first == null ? undefined : state.latest - state.first);
      const outputTokens = frame.message.usage?.output;
      const actual = timing.predicted_per_second ?? (timing.predicted_n > 0 && timing.predicted_ms > 0
        ? timing.predicted_n * 1000 / timing.predicted_ms : undefined);
      state.last = {
        rate: actual ?? (duration >= 250 ? (outputTokens > 0 ? outputTokens : state.chars / 4) * 1000 / duration : state.rate),
        estimated: actual == null, duration,
        promptMs: timing.prompt_ms, promptRate: timing.prompt_per_second,
        firstMs: frame.message.ttft ?? (state.started != null && state.first != null ? Math.max(0, state.first - state.started) : undefined),
        outputTokens,
      };
      try { localStorage.setItem('omp-generation:' + key, JSON.stringify(state.last)); } catch {}
    }
    if (['message_end', 'tool_start', 'tool_execution_start', 'agent_end', 'session_settled', 'prompt_result', 'disconnected', 'model_preparing'].includes(frame.type)) {
      state.active = false;
      if (frame.type !== 'model_preparing') state.first = undefined;
    }
    return state;
  }

  function speedButton(state, details) {
    if (!state.active || !(state.rate > 0)) return null;
    const label = (state.estimated ? '~' : '') + new Intl.NumberFormat(document.documentElement.lang, { maximumFractionDigits: 1 }).format(state.rate) + ' tok/s';
    const button = element('button', label, 'generation-speed');
    button.type = 'button';
    button.title = state.estimated ? 'Estimert genereringshastighet' : 'Genereringshastighet';
    button.onclick = () => { details.open = true; details.querySelector('summary')?.focus(); };
    return button;
  }

  function generationDetails(state) {
    return state.active ? {
      rate: state.rate, estimated: state.estimated,
      firstMs: state.started != null && state.first != null ? Math.max(0, state.first - state.started) : undefined
    } : state.last;
  }

  function tokenUsage(container, messages, model, context, last) {
    const usage = usageTotals(messages);
    const tokens = Number.isFinite(context?.tokens) && context.tokens >= 0 ? context.tokens : null;
    const limit = context?.contextWindow > 0 ? context.contextWindow : model?.contextWindow > 0 ? model.contextWindow : null;
    const snapshot = JSON.stringify([usage, model?.name, tokens, limit, last]);
    if (container.dataset.snapshot === snapshot) return;
    container.dataset.snapshot = snapshot;
    const summary = container.querySelector('summary');
    iconButton(summary, 'tokens', 'Aktiv kontekst' + (tokens === null ? '' : ' · anslag ' + tokenFormat.format(tokens)));
    summary.append(element('span', tokens === null ? '–' : '~' + tokenCompact.format(tokens)));
    const breakdown = container.querySelector('.token-breakdown');
    breakdown.replaceChildren(element('strong', 'Aktiv kontekst'));
    const rows = [['I aktiv kontekst (OMP-anslag)', tokens], ['Modellens kontekstgrense', limit]];
    const details = element('dl');
    const add = (target, key, value) => target.append(element('dt', key), element('dd', value === null ? 'Ukjent' : tokenFormat.format(value)));
    for (const [key, value] of rows) add(details, key, value);
    breakdown.append(details);
    if (last) {
      breakdown.append(element('strong', 'Siste generering'));
      const stats = element('dl');
      const rate = value => Number.isFinite(value) ? tokenFormat.format(Math.round(value * 10) / 10) + ' tok/s' : 'Ukjent';
      const time = value => Number.isFinite(value) ? tokenFormat.format(Math.round(value)) + ' ms' : 'Ukjent';
      for (const [label, value] of [
        ['Gjennomsnitt', (last.estimated && last.rate != null ? '~' : '') + rate(last.rate)],
        ['Promptbehandling', time(last.promptMs) + (last.promptRate > 0 ? ' · ' + rate(last.promptRate) : '')],
        ['Tid til første token (observert)', time(last.firstMs)],
        ['Genereringstid', time(last.duration)],
        ['Outputtokens', last.outputTokens == null ? 'Ukjent' : tokenFormat.format(last.outputTokens)]
      ]) stats.append(element('dt', label), element('dd', value));
      breakdown.append(stats);
    }
    breakdown.append(element('strong', 'Historisk forbruk rapportert til OMP'));
    if (!usage.calls) { breakdown.append(element('p', 'Ingen brukstall rapportert ennå.')); return; }
    const totals = element('dl');
    for (const [key, value] of [['Totalt for alle kall', usage.tokens], ['Inn uten cache', usage.input], ['Ut', usage.output], ['Resonnering (rapportert separat)', usage.reasoning],
      ['Lest fra cache', usage.cacheRead], ['Skrevet til cache', usage.cacheWrite], ['Inn i siste kall inkl. cache', usage.lastInput],
      ['Kall med rapportert bruk', usage.calls]]) add(totals, key, value);
    breakdown.append(totals);
  }

  function adbPanel({ read, install, phone, openSettings }) {
    const panel = element('section', null, 'adb-panel');
    const status = element('p');
    status.setAttribute('role', 'status');
    const targets = element('ul');
    const actions = element('div', null, 'adb-actions');
    const refresh = iconButton(element('button'), 'device', 'Sjekk ADB på nytt');
    refresh.dataset.adbRefresh = 'true';
    const setup = element('button', 'Installer ADB på PC-en');
    refresh.type = setup.type = 'button';
    setup.hidden = true;
    actions.append(refresh, setup);
    const local = element('p');
    if (openSettings) {
      const settings = element('button', 'Android-utviklerinnstillinger');
      settings.type = 'button';
      settings.onclick = openSettings;
      actions.append(settings);
    }
    panel.append(element('h3', 'ADB og enheter'), status, local, targets, actions);
    async function update(action) {
      refresh.disabled = setup.disabled = true;
      status.textContent = action === install ? 'Installerer og starter ADB på PC-en …' : 'Sjekker ADB på PC-en …';
      if (phone) {
        const { usb, wireless } = phone();
        const label = value => value === 1 ? 'på' : value === 0 ? 'av' : 'ukjent';
        local.textContent = 'Denne enheten · USB-feilsøking ' + label(usb) + ' · trådløs feilsøking ' + label(wireless);
      }
      try {
        const data = await action();
        setup.hidden = !data.installAvailable;
        const ready = data.devices.filter(item => item.reachable);
        status.textContent = !data.installed ? 'ADB mangler på PC-en.'
          : !data.running ? data.error || 'ADB på PC-en svarer ikke.'
          : ready.length === 1 ? 'ADB på PC-en når én godkjent enhet.'
          : ready.length > 1 ? 'Flere enheter svarer. Koble fra de andre for å bruke enhetsstyring.'
          : 'ADB kjører. Koble til Android og godkjenn feilsøking på enheten.';
        targets.replaceChildren(...data.devices.map(device => {
          const state = device.reachable ? 'Godkjent · Android ' + device.android + (device.matchesPhone ? ' · Denne enheten' : '')
            : device.state === 'unauthorized' ? 'Venter på godkjenning på Android' : 'Ingen forbindelse';
          return element('li', (device.model ? device.model + ' · ' : '') + device.serial + ' · ' + state);
        }));
        if (phone && data.running && ready.length) status.textContent = ready.some(device => device.matchesPhone)
          ? 'Denne Android-enheten er bekreftet via ADB.'
          : 'ADB når en enhet, men kunne ikke bekrefte denne telefonen.';
      } catch (error) { status.textContent = error.message; }
      finally { refresh.disabled = setup.disabled = false; }
    }
    refresh.onclick = () => update(read);
    setup.onclick = () => update(install);
    update(read);
    return panel;
  }

  function messageActions({ copy, speak, stop, report }) {
    let active;
    let sequence = 0;
    const update = () => {
      for (const button of document.querySelectorAll('[data-speech-key]')) {
        const speaking = active?.key === button.dataset.speechKey;
        iconButton(button, speaking ? 'stop' : 'speaker', speaking ? 'Stopp opplesing' : 'Les opp');
        button.setAttribute('aria-pressed', String(speaking));
      }
    };
    function cancel() {
      if (!active) return;
      active = null;
      update();
      Promise.resolve().then(stop).catch(report);
    }
    function complete(id, error) {
      if (active?.id !== String(id)) return;
      active = null;
      update();
      if (error) report(error);
    }
    function row(text, key) {
      const actions = element('div', null, 'message-actions');
      const copyButton = iconButton(element('button'), 'copy', 'Kopier');
      const spoken = active?.key === key;
      const speakButton = iconButton(element('button'), spoken ? 'stop' : 'speaker', spoken ? 'Stopp opplesing' : 'Les opp');
      copyButton.type = speakButton.type = 'button';
      speakButton.dataset.speechKey = key;
      speakButton.setAttribute('aria-pressed', String(spoken));
      copyButton.onclick = async () => {
        try {
          await copy(text);
          iconButton(copyButton, 'check', 'Kopiert');
          setTimeout(() => iconButton(copyButton, 'copy', 'Kopier'), 1200);
        } catch (error) { report(error); }
      };
      speakButton.onclick = () => {
        if (active?.key === key) { cancel(); return; }
        const id = String(++sequence);
        active = { id, key };
        update();
        Promise.resolve().then(() => speak(id, text)).catch(error => complete(id, error));
      };
      actions.append(copyButton, speakButton);
      return actions;
    }
    return { row, complete, cancel };
  }

  function sameMessage(a, b) {
    if (a.role !== b.role) return false;
    if (a.id && b.id && a.id === b.id) return true;
    if (a.clientMessageId && a.clientMessageId === b.clientMessageId) return true;
    if (a.role !== 'user' && a.role !== 'assistant') return false;
    return !!a.timestamp && a.timestamp === b.timestamp && a.text === b.text;
  }

  function userEcho(entries, item) {
    let previous = entries.find(entry => sameMessage(entry, item));
    for (let index = entries.length - 1; !previous && index >= 0; index--) {
      const entry = entries[index];
      if (entry.role === 'user' && entry.pending &&
          (item.clientMessageId ? entry.clientMessageId === item.clientMessageId : entry.text === item.text)) previous = entry;
    }
    if (previous) Object.assign(previous, item, { pending: false });
    return previous;
  }

  function messageId() {
    if (crypto.randomUUID) return crypto.randomUUID();
    const bytes = crypto.getRandomValues(new Uint8Array(16));
    bytes[6] = (bytes[6] & 15) | 64;
    bytes[8] = (bytes[8] & 63) | 128;
    const hex = Array.from(bytes, byte => byte.toString(16).padStart(2, '0')).join('');
    return hex.replace(/^(........)(....)(....)(....)/, '$1-$2-$3-$4-');
  }

  function segmentsOf(content) {
    return Array.isArray(content) ? content.flatMap(block => {
      if (block?.type === 'text' && typeof block.text === 'string') return [{ type: 'text', text: block.text }];
      if (block?.type === 'thinking' && !block.redacted && typeof block.thinking === 'string') {
        return [{ type: 'thinking', text: block.thinking }];
      }
      return [];
    }) : [];
  }

  const openThinking = new Set();
  function appendSegments(container, entry, key, appendText) {
    const segments = entry.segments?.length ? entry.segments : [{ type: 'text', text: entry.text }];
    for (const [index, block] of segments.entries()) {
      if (!block.text) continue;
      if (block.type !== 'thinking') { appendText(block.text); continue; }
      const id = key + ':' + index;
      const details = element('details', null, 'message-thinking');
      details.open = openThinking.has(id);
      details.ontoggle = () => {
        if (details.open) openThinking.add(id);
        else openThinking.delete(id);
      };
      details.append(element('summary', window.ompLocale?.translate('Resonnering') || 'Resonnering'), element('pre', block.text));
      container.append(details);
    }
  }

  function scrollEntryKey(entry, index) {
    return JSON.stringify([entry.role, entry.clientMessageId || entry.toolCallId || entry.card?.id ||
      entry.check?.id || entry.id || entry.timestamp || index]);
  }

  // What the row actually shows. The scroll key must stay stable (it anchors the
  // scroll position), so the changing parts get their own render key: when it
  // changes, that one row is rebuilt instead of the whole transcript.
  function renderKey(entry, index) {
    const text = typeof entry.text === 'string' ? entry.text.length : 0;
    const segments = Array.isArray(entry.segments)
      ? entry.segments.reduce((total, block) => total + (typeof block?.text === 'string' ? block.text.length : 0), 0)
      : 0;
    const state = entry.role === 'turn_changes'
      ? [entry.card?.id, entry.card?.undone ? 1 : 0, entry.card?.undoable ? 1 : 0,
        entry.card?.files?.length || 0, entry.card?.incomplete ? 1 : 0].join(':')
      : entry.role === 'project_check'
        ? [entry.check?.id, entry.check?.exitCode, entry.check?.duration].join(':')
        : [entry.done ? 1 : 0, entry.running ? 1 : 0, entry.isError ? 1 : 0, entry.status || ''].join(':');
    return scrollEntryKey(entry, index) + '|' + state + '|' + text + '|' + segments;
  }

  /**
   * Reconcile the conversation list instead of rebuilding it.
   *
   * Both clients used to call `container.replaceChildren()` and re-create every
   * message on each animation frame while OMP streamed, so the cost of a frame
   * grew with the conversation. At a 100k-token context that is thousands of
   * nodes and hundreds of kilobytes of text per frame, and the app crawls.
   * Here unchanged rows are kept, and only the changed tail (normally the one
   * message that is streaming) is rebuilt.
   */
  function syncRows(container, entries, { skip, build }) {
    const plan = [];
    for (let index = 0; index < entries.length; index++) {
      const entry = entries[index];
      if (skip && skip(entry, index)) continue;
      plan.push({ entry, index, key: renderKey(entry, index) });
    }
    const rows = container.children;
    const limit = Math.min(rows.length, plan.length);
    let keep = 0;
    while (keep < limit && rows[keep].dataset.renderKey === plan[keep].key) keep++;
    // The last row is the one that grows while streaming, so always refresh it.
    if (plan.length) keep = Math.min(keep, plan.length - 1);
    while (container.children.length > keep) container.lastElementChild.remove();
    let kept = keep;
    for (let index = keep; index < plan.length; index++) {
      const row = build(plan[index].entry, plan[index].index);
      if (!row) continue;
      row.dataset.renderKey = plan[index].key;
      row.dataset.scrollKey = scrollEntryKey(plan[index].entry, plan[index].index);
      container.append(row);
      kept++;
    }
    return kept;
  }

  function conversationScroll(scroller, content, jump) {
    let conversation;
    let following = true;
    let restoredTop = null;
    const atBottom = () => scroller.scrollHeight - scroller.scrollTop - scroller.clientHeight <= 16;
    const refresh = () => { jump.hidden = following || atBottom(); };
    const setTop = top => {
      scroller.scrollTop = top;
      restoredTop = scroller.scrollTop;
    };
    jump.addEventListener('click', () => {
      following = true;
      setTop(scroller.scrollHeight);
      refresh();
    });
    scroller.addEventListener('scroll', () => {
      if (restoredTop !== scroller.scrollTop) {
        following = atBottom();
        restoredTop = null;
      }
      refresh();
    }, { passive: true });
    scroller.addEventListener('click', event => {
      const summary = event.target.closest('summary');
      if (!summary || !content.contains(summary)) return;
      following = false;
      restoredTop = scroller.scrollTop;
      requestAnimationFrame(refresh);
    });
    const blocks = row => Array.from(row.querySelectorAll('p, summary, pre')).filter(block => block.getClientRects().length);
    function capture(key) {
      if (conversation !== key) {
        conversation = key;
        following = true;
      } else if (restoredTop !== scroller.scrollTop) {
        following = atBottom();
      }
      if (following) return null;
      const top = scroller.getBoundingClientRect().top;
      const rows = content.children;
      let start = 0, end = rows.length;
      while (start < end) {
        const middle = Math.floor((start + end) / 2);
        if (rows[middle].getBoundingClientRect().bottom <= top + 1) start = middle + 1;
        else end = middle;
      }
      const anchors = [];
      for (let index = start; index < Math.min(start + 3, rows.length); index++) {
        const row = rows[index];
        if (!row.dataset.scrollKey) continue;
        const parts = blocks(row);
        const part = parts.findIndex(block => block.getBoundingClientRect().bottom > top + 1);
        // Keep the element: rows are reused between renders, so restoring the
        // anchor does not need a scan of the whole conversation any more.
        anchors.push({ key: row.dataset.scrollKey, row, part, offset: (parts[part] || row).getBoundingClientRect().top - top });
      }
      return { anchors, top: scroller.scrollTop };
    }
    function restore(snapshot) {
      if (following) setTop(scroller.scrollHeight);
      else if (snapshot) {
        let offset = snapshot.top;
        for (const anchor of snapshot.anchors) {
          const row = anchor.row?.isConnected ? anchor.row
            : content.querySelector(':scope > [data-scroll-key="' + CSS.escape(anchor.key) + '"]');
          if (!row) continue;
          const target = blocks(row)[anchor.part] || row;
          offset = scroller.scrollTop + target.getBoundingClientRect().top - scroller.getBoundingClientRect().top - anchor.offset;
          break;
        }
        setTop(offset);
      }
      refresh();
    }
    if (typeof ResizeObserver === 'function') new ResizeObserver(() => {
      if (following) setTop(scroller.scrollHeight);
      refresh();
    }).observe(scroller);
    return { capture, restore };
  }

  // Dedupe keys used to fold local echoes into the history. Building them means
  // stringifying the whole message text, which used to happen for every message
  // on every render; cache them per message object and only redo the one that
  // is still streaming.
  const dedupeKeyCache = new WeakMap();
  function dedupeKeys(item) {
    const text = typeof item.text === 'string' ? item.text : undefined;
    const cached = dedupeKeyCache.get(item);
    if (cached && cached.text === text && cached.role === item.role && cached.id === item.id &&
        cached.clientMessageId === item.clientMessageId && cached.timestamp === item.timestamp) {
      return cached.keys;
    }
    const keys = [];
    if (item.id) keys.push('id:' + item.role + ':' + item.id);
    if (item.clientMessageId) keys.push('client:' + item.clientMessageId);
    if (item.timestamp && (item.role === 'user' || item.role === 'assistant')) {
      keys.push(JSON.stringify([item.role, item.timestamp, text]));
    }
    dedupeKeyCache.set(item, { text, role: item.role, id: item.id, clientMessageId: item.clientMessageId,
      timestamp: item.timestamp, keys });
    return keys;
  }

  function timeline(entries, cards, checks = []) {    const result = [];
    let index = -1;
    const placed = new Set();
    const append = () => {
      if (index < 0) return;
      result.push(...cards.filter(card => card.userIndex === index && !placed.has(card.id)).map(card => ({ role: 'turn_changes', card })));
      result.push(...checks.filter(check => check.userIndex === index + 1).map(check => ({ role: 'project_check', check })));
    };
    const seen = new Set();
    for (const item of entries) {
      const keys = dedupeKeys(item);
      if (keys.some(key => seen.has(key))) continue;
      keys.forEach(key => seen.add(key));
      if (item.role === 'user') { append(); index++; }
      result.push(item);
      if (item.role === 'tool') {
        const id = item.toolCallId || item.id;
        for (const card of cards) {
          if (!id || card.anchorToolId !== id || card.userIndex !== index || placed.has(card.id)) continue;
          result.push({ role: 'turn_changes', card });
          placed.add(card.id);
        }
      }
    }
    append();
    return result;
  }

  function counts(added, removed) {
    const stats = element('span', null, 'turn-counts');
    if (Number.isInteger(added) && Number.isInteger(removed)) {
      stats.append(element('span', '+' + added, 'turn-added'), element('span', '−' + removed, 'turn-removed'));
    }
    return stats;
  }

  function card(data, showDiff, undo, allowed) {
    const region = element('section', null, 'turn-card');
    const title = element('div', null, 'turn-card-title');
    const total = data.files.reduce(([added, removed], item) => [added + (item.added || 0), removed + (item.removed || 0)], [0, 0]);
    title.append(element('strong', data.files.length === 1 ? '1 fil endret' : data.files.length + ' filer endret'), counts(...total));
    if (data.undone) title.append(element('small', 'Angret'));
    else if (data.undoable) {
      const action = element('button', 'Angre');
      action.type = 'button';
      action.disabled = !allowed;
      action.onclick = () => undo(data);
      title.append(action);
    }
    region.append(title);
    if (data.files.length) {
      const details = element('details');
      details.open = expandedCards.get(data.id) ?? true;
      details.ontoggle = () => expandedCards.set(data.id, details.open);
      details.append(element('summary', 'Vis endringer'));
      const rows = element('div', null, 'turn-files');
      for (const entry of data.files) {
        const row = element('button', null, 'turn-file');
        row.type = 'button';
        row.append(element('span', entry.file), entry.binary || entry.unavailable
          ? element('small', entry.binary ? 'Binærfil' : 'Linjetall mangler') : counts(entry.added, entry.removed));
        row.onclick = () => showDiff(data, entry);
        rows.append(row);
      }
      details.append(rows);
      region.append(details);
    }
    if (data.incomplete) region.append(element('small', 'Deler av arbeidsmappen kunne ikke registreres.'));
    else if (!data.undoable && !data.undone) region.append(element('small', 'Kilden til enkelte endringer kunne ikke bekreftes.'));
    return region;
  }

  function diff(text) {
    const box = element('pre', null, 'turn-diff');
    for (const line of text.split('\n')) box.append(element('span', line || ' ',
      line.startsWith('+') ? 'turn-added' : line.startsWith('-') ? 'turn-removed' : ''));
    return box;
  }

  function machinePanel(read, active) {
    const panel = element('section', null, 'machine-panel');
    const gib = value => Number.isFinite(value) ? (value / 1073741824).toLocaleString('nb', { maximumFractionDigits: 1 }) + ' GiB' : 'Utilgjengelig';
    const percent = value => Number.isFinite(value) ? Math.round(value) + ' %' : 'Utilgjengelig';
    const summary = (parent, title, text, value) => {
      parent.append(element('h3', title), element('p', text));
      if (Number.isFinite(value)) {
        const meter = element('progress');
        meter.max = 100; meter.value = value;
        meter.setAttribute('aria-label', title);
        parent.append(meter);
      }
    };
    async function refresh() {
      if (!panel.isConnected || !active()) return;
      try {
        const data = await read();
        if (!panel.isConnected || !active()) return;
        const ram = data.ram || {};
        const usableRam = ram.usable ?? ram.total;
        const usedRam = Number.isFinite(ram.available) && Number.isFinite(usableRam) ? Math.max(0, usableRam - ram.available) : null;
        panel.replaceChildren();
        summary(panel, data.cpu?.name || 'CPU', 'Belastning ' + percent(data.cpu?.load) + (Number.isFinite(data.cpu?.temperature) ? ' · ' + data.cpu.temperature + ' °C' : ''), data.cpu?.load);
        summary(panel, 'RAM', gib(usedRam) + ' i bruk · ' + gib(ram.available) + ' tilgjengelig · ' + gib(ram.total) + ' installert',
          usedRam !== null && usableRam > 0 ? usedRam / usableRam * 100 : null);
        for (const gpu of data.gpus || []) {
          const free = Number.isFinite(gpu.used) && Number.isFinite(gpu.total) ? Math.max(0, gpu.total - gpu.used) : null;
          summary(panel, gpu.name, 'VRAM ' + gib(gpu.used) + ' brukt · ' + gib(free) + ' ledig · ' + gib(gpu.total) + ' totalt',
            free !== null && gpu.total > 0 ? gpu.used / gpu.total * 100 : null);
          panel.append(element('p', 'GPU-belastning ' + percent(gpu.load) + ' · Temperatur ' +
            (Number.isFinite(gpu.temperature) ? gpu.temperature + ' °C' : 'utilgjengelig')));
        }
        if (!data.gpus?.length) panel.append(element('p', 'Ingen GPU-målinger tilgjengelige.'));
        if (data.models?.length) panel.append(element('p', 'Lastet på PC-en: ' + data.models.map(model => model.name + ' · ' + model.engine).join(', ')));
      } catch (error) {
        if (panel.isConnected && active()) panel.replaceChildren(element('p', error.message));
      }
      if (panel.isConnected && active()) setTimeout(refresh, 1800);
    }
    panel.append(element('p', 'Henter maskinmålinger fra PC-en …'));
    setTimeout(refresh, 0);
    return panel;
  }

  function modelProgress(frame) {
    const name = frame.name ? ' · ' + frame.name : '';
    const labels = {
      waiting: 'Venter på ledig GPU-minne', starting: 'Starter tilpasset llama.cpp-server',
      loading: frame.engine === 'Ollama' ? 'Ollama laster modellen inn i minnet' : 'Laster modellen inn i VRAM/RAM',
      stopping: 'Stopper dedikert llama.cpp-server', unloading: 'Laster lokal modell ut av minnet',
      unloaded: frame.engine === 'Ollama' ? 'Ollama kjører fortsatt – modellen er lastet ut' : 'Lokal modell er lastet ut',
      ready: 'Modellen er lastet og klar', cloud: 'Skymodell valgt', failed: 'Modellbyttet kunne ikke fullføres'
    };
    return (labels[frame.phase] || (frame.queued ? 'Venter på ledig GPU-minne' : 'Klargjør lokal modell')) + name;
  }

  window.ompTurnUI = { conversationScroll, scrollEntryKey, syncRows, renderKey, recoveryStatus, thinkingChoice, thinkingRequest, todo, timeline, card, diff, messageActions, iconButton, adbPanel, pluginTest, skillControls, tokenUsage, usageTotals, machinePanel, modelProgress, sameMessage, userEcho, messageId, segmentsOf, appendSegments, generation, speedButton, generationDetails };
})();
