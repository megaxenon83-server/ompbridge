(() => {
  const labels = new Map(`
Innstillinger|Settings
Generelt|General
Språk|Language
Norsk|Norwegian
Utseende|Appearance
Modeller|Models
Tilkobling|Connection
OMP-ressurser|OMP resources
Maskinressurser|System resources
Enheter|Devices
Enheter og ADB|Devices and ADB
Arkiv og papirkurv|Archive and trash
Ny tråd|New chat
Ny samtale|New chat
Prosjekter|Projects
Arbeidsområde|Workspace
Søk i prosjekter|Search projects
Søk i samtaler|Search chats
Hva skal vi bygge?|What shall we build?
Hva vil du endre?|What would you like to change?
Skriv en oppgave …|Enter a task …
Start eller velg OMP under Innstillinger.|Start or select OMP in Settings.
Vis flere samtaler|Show more chats
Oppdater|Refresh
Koble til på nytt|Reconnect
Koble til Bridge|Connect to Bridge
Bridge tilkoblet|Bridge connected
Bridge frakoblet|Bridge disconnected
OMP klar|OMP ready
Kobler til OMP …|Connecting to OMP …
Kjør prosjekt|Run project
Velg modell|Choose model
Administrer modeller|Manage models
Valgt modell|Selected model
Lokale modeller|Local models
Skymodeller|Cloud models
Alle modeller|All models
Lokal|Local
Sky|Cloud
Lett|Light
Lett kontekst|Light context
Begrens ekstra prosjektkontekst|Reduce extra project context
Arbeidsmodus|Work mode
Bruk nettsøk for fersk informasjon.|Search the web for current information.
Undersøk prosjektet og nettet med lesetilgang.|Research the workspace and the web with read-only tools.
Gjennomfør oppgaven med aktiverte verktøy.|Carry out the task with enabled tools.
Bygg|Build
Talemodus|Voice mode
Melding|Message
Legg ved bilde|Attach image
Send melding|Send message
Stopp den aktive OMP-oppgaven|Stop the active OMP task
Avbryt den aktive OMP-oppgaven|Cancel the active OMP task
Søk|Search
Lukk|Close
Tilbake|Back
Tilbake til innstillinger|Back to Settings
Avbryt|Cancel
Lagre|Save
Angre|Undo
Angret|Reverted
Ferdig|Done
Kopier|Copy
Kopier melding|Copy message
Kopier samtalen|Copy chat
Les opp|Read aloud
Stopp opplesing|Stop reading
Du|You
Vis endringer|View changes
Binærfil|Binary file
Linjetall mangler|Line counts unavailable
Deler av arbeidsmappen kunne ikke registreres.|Some parts of the workspace could not be tracked.
Velg prosjekt|Choose project
Åpne mappe|Open folder
Ny mappe|New folder
Velg en mappe|Choose a folder
Opprett mappe|Create folder
Opprett prosjekt|Create project
Mappenavn|Folder name
Ingen mapper|No folders
Aktive samtaler|Active chats
Åpne|Open
Gi nytt navn|Rename
Gi samtalen nytt navn|Rename chat
Flytt|Move
Slett|Delete
Gjenopprett|Restore
Arkiver|Archive
Fest|Pin
Fjern|Remove
Del tråd|Share chat
Eksporter Markdown|Export Markdown
Skann ny QR-kode|Scan new QR code
Skann QR-kode|Scan QR code
Skann trådkode|Scan chat QR code
PC-er|Computers
Oh My Pi-samtaler|Oh My Pi chats
Skann QR-kode på nytt|Scan QR code again
Leverandører fra PC-en|Providers on the PC
Handlinger for aktiv samtale|Actions for this chat
Koble til OMP Desktop med en engangskode.|Connect to OMP Desktop with a one-time code.
Tema|Theme
Lyst|Light
Mørkt|Dark
Egendefinert|Custom
Tekststørrelse|Text size
Skrifttyper|Fonts
Forhåndsvisning|Preview
Installer|Install
Installerte skills|Installed skills
Verktøy|Tools
Aktivert|Enabled
Deaktivert|Disabled
Globalt|Global
Kun denne samtalen|This chat only
Test|Test
OMP arbeider|OMP working
OMP tenker|OMP thinking
Resonnering|Reasoning
Gå til siste melding|Jump to latest message
OMP skriver|OMP writing
Leser filer|Reading files
Skriver filer|Writing files
Kjører Bash|Running Bash
Søker på nettet|Searching the web
Redigerer kode|Editing code
Venter på modellen|Waiting for the model
Klargjør OMP …|Preparing OMP …
Ny|New
Ny prosjektmappe|New project folder
Samtaler|Chats
Ny lokal samtale|New local chat
Start OMP|Start OMP
Velg omp.exe|Choose omp.exe
Ingen Windows-installasjon funnet.|No Windows installation found.
Henter oppstartsinnstilling …|Loading startup preference …
Start OMP Desktop når jeg logger på Windows|Start OMP Desktop when I sign in
Start OMP Desktop automatisk|Start OMP Desktop automatically
Søk i innstillinger|Search settings
Søk etter modell|Search models
Lukk innstillinger|Close settings
Meldinger|Messages
Samtale|Chat
Åpne sidepanel|Open side panel
Lukk sidepanel|Close side panel
Endringer|Changes
Tester|Tests
Forhåndsvis|Preview
Filer|Files
Bruk|Use
Send|Send
Stopp|Stop
Mikrofon|Microphone
Skann QR|Scan QR
Skann QR-kode for å koble til|Scan a QR code to connect
Tilkoblet|Connected
Frakoblet|Disconnected
Arbeider|Working
Velg prosjekt først.|Choose a project first.
Ingen samtaler ennå.|No chats yet.
Ingen modeller funnet.|No models found.
Modell|Model
Vis kilde|View source
Last inn på nytt|Reload
Data fra PC-en|Data from the PC
Versjon|Version
Temperatur|Temperature
Ingen målinger tilgjengelig.|No measurements available.
Bruk kontekst|Use context
Totalt|Total
Forbruk|Usage
Tokenforbruk|Token usage
Aktiv kontekst|Active context
Kontekstgrense|Context limit
Estimert|Estimated
Oppstart|Startup
Bekreft|Confirm
Avvis|Decline
Godkjenn|Approve
Godkjenning på denne PC-en|Permissions on this PC
Tidligere innstilling|Previous preference
Ikke tillat|Do not allow
Spør ved behov|Ask when needed
Tillat alt|Allow all
Tillat alt og alltid|Always allow all
Beholde automatisk godkjenning for nye OMP-runder på denne PC-en?|Keep automatic approval enabled for new OMP turns on this PC?
Lukk talemodus|Close voice mode
Avbryt opplesing|Stop reading aloud
Prøv igjen|Try again
Lytt|Listen
Starter|Starting
Velg PC|Choose a PC
PC-navn|PC name
Legg til PC|Add PC
Endre navn|Rename
Vis alle|Show all
Fjern fra listen|Remove from list
Slett samtale|Delete chat
Arkiver samtale|Archive chat
Papirkurv|Trash
Flytt til papirkurven|Move to trash
Flytt til papirkurven?|Move to trash?
Fjern prosjekt|Remove project
Prosjektet fjernes fra prosjektlisten. Filene og samtalene beholdes.|The project is removed from the project list. Its files and chats are kept.
Ingen aktive oppgaver|No active tasks
Kopiert|Copied
Arbeidsmappe|Working directory
`.trim().split('\n').map(line => line.split('|')));
  let preference = localStorage.getItem('omp-interface-language') || 'system';
  const isEnglish = () => preference === 'en' ||
    (preference === 'system' && !/^(nb|nn|no)(-|$)/i.test(navigator.language));
  const originalText = new WeakMap();
  const originalAttributes = new WeakMap();
  const attributes = ['title', 'aria-label', 'placeholder'];
  const untouched = '.chat-turn, .project-name, .sidebar-project-name, .session-name, .thread-title, .drawer-thread-title, #chatTitle, #projectLabel, #modelBtn, pre, code, script, style, textarea';
  const suffixes = new Map([['kjører', 'running'], ['ferdig', 'done'], ['feilet', 'failed'], ['uten resultat', 'no result']]);
  function translate(value) {
    if (!isEnglish() || typeof value !== 'string') return value;
    const trimmed = value.trim();
    const exact = labels.get(trimmed);
    if (exact) return value.replace(trimmed, exact);
    const files = /^(\d+) (fil|filer) endret$/.exec(trimmed);
    if (files) return files[1] + (files[1] === '1' ? ' file changed' : ' files changed');
    const tool = /^(.*) · (kjører|ferdig|feilet|uten resultat)$/.exec(trimmed);
    if (tool) return tool[1] + ' · ' + suffixes.get(tool[2]);
    if (trimmed.startsWith('Arbeidsmodus · ')) return 'Work mode · ' + translate(trimmed.slice('Arbeidsmodus · '.length));
    if (trimmed.startsWith('Chat OMP OMP · Versjon ')) return trimmed.replace('Versjon', 'Version');
    return value;
  }
  function localize(node) {
    if (node.nodeType === Node.TEXT_NODE) {
      if (!node.parentElement || node.parentElement.closest(untouched)) return;
      const previous = originalText.get(node);
      const source = previous?.localized === node.data ? previous.source : node.data;
      const localized = translate(source);
      if (localized === source) originalText.delete(node);
      else originalText.set(node, { source, localized });
      if (localized !== node.data) node.data = localized;
      return;
    }
    if (node.nodeType !== Node.ELEMENT_NODE || node.closest(untouched.replace(', textarea', ''))) return;
    const originals = originalAttributes.get(node) || new Map();
    for (const name of attributes) if (node.hasAttribute(name)) {
      const before = node.getAttribute(name);
      const previous = originals.get(name);
      const source = previous?.localized === before ? previous.source : before;
      const localized = translate(source);
      if (localized === source) originals.delete(name);
      else originals.set(name, { source, localized });
      if (localized !== before) node.setAttribute(name, localized);
    }
    if (originals.size) originalAttributes.set(node, originals);
    for (const child of node.childNodes) localize(child);
  }
  function languageSetting() {
    const label = document.createElement('label');
    label.className = 'interface-language';
    const title = document.createElement('span');
    title.textContent = 'Språk';
    const select = document.createElement('select');
    select.setAttribute('aria-label', title.textContent);
    for (const [id, name] of [['system', 'System'], ['nb', 'Norsk'], ['en', 'English']]) {
      select.add(new Option(name, id, false, id === preference));
    }
    select.onchange = () => {
      preference = select.value;
      localStorage.setItem('omp-interface-language', preference);
      applyLocale();
    };
    label.append(title, select);
    return label;
  }
  function confirmAlways() {
    return window.confirm(translate('Beholde automatisk godkjenning for nye OMP-runder på denne PC-en?'));
  }
  function approvalSetting(request) {
    const row = document.createElement('label');
    row.className = 'interface-language';
    const label = 'Godkjenning på denne PC-en';
    row.append(label);
    const select = document.createElement('select');
    select.setAttribute('aria-label', label);
    select.disabled = true;
    for (const [mode, text] of [['deny', 'Ikke tillat'], ['write', 'Spør ved behov'], ['yolo', 'Tillat alt']]) {
      select.add(new Option(text, mode));
    }
    const feedback = document.createElement('small');
    let current;
    const save = async mode => {
      select.disabled = true;
      try {
        const value = (await request(mode)).approvalMode;
        if (['always-ask', 'always-ask-cached', 'default'].includes(value) && ![...select.options].some(option => option.value === value)) {
          select.add(new Option('Tidligere innstilling', value));
        }
        current = value;
        feedback.textContent = '';
      } catch (error) {
        feedback.textContent = error.message;
      }
      select.value = current || '';
      select.disabled = !current;
    };
    select.onchange = () => {
      const mode = select.value;
      if (mode === 'yolo' && !confirmAlways()) select.value = current;
      else void save(mode);
    };
    row.append(select, feedback);
    void save();
    return row;
  }
  function messageTime(value) {
    const date = new Date(value);
    if (!value || Number.isNaN(date.getTime())) return null;
    const locale = document.documentElement.lang;
    const now = new Date();
    const yesterday = new Date(now);
    yesterday.setDate(now.getDate() - 1);
    const day = date.toDateString();
    const time = new Intl.DateTimeFormat(locale, { hour: '2-digit', minute: '2-digit' }).format(date);
    const prefix = day === now.toDateString() ? '' : day === yesterday.toDateString()
      ? (locale === 'en' ? 'Yesterday' : 'I går')
      : new Intl.DateTimeFormat(locale, { dateStyle: 'medium' }).format(date);
    const stamp = document.createElement('time');
    stamp.className = 'message-time';
    stamp.dateTime = date.toISOString();
    stamp.title = new Intl.DateTimeFormat(locale, { dateStyle: 'full', timeStyle: 'short' }).format(date);
    stamp.textContent = prefix ? prefix + ' · ' + time : time;
    return stamp;
  }
  function modePicker() {
    const original = document.getElementById('chatMode');
    const trigger = document.getElementById('modePicker');
    const dialog = document.getElementById('modeChoices');
    if (!original || !trigger || !dialog) return;
    const modes = [
      ['chat', 'Chat', 'Bruk nettsøk for fersk informasjon.', '◇'],
      ['plan', 'Plan', 'Undersøk prosjektet og nettet med lesetilgang.', '≡'],
      ['build', 'Bygg', 'Gjennomfør oppgaven med aktiverte verktøy.', '⌘']
    ];
    const sync = () => {
      const mode = modes.find(([id]) => id === original.value) || modes[2];
      trigger.disabled = original.disabled;
      if (trigger.firstElementChild.textContent !== mode[3]) trigger.firstElementChild.textContent = mode[3];
      const title = translate('Arbeidsmodus') + ' · ' + translate(mode[1]);
      if (trigger.title !== title) trigger.title = title;
      if (trigger.getAttribute('aria-label') !== title) trigger.setAttribute('aria-label', title);
    };
    trigger.onclick = () => {
      const body = dialog.querySelector('.mode-options');
      const active = original.value;
      body.replaceChildren(...modes.map(([id, name, hint, symbol]) => {
        const choice = document.createElement('button');
        choice.type = 'button';
        choice.className = 'mode-choice';
        choice.setAttribute('aria-pressed', String(active === id));
        const icon = document.createElement('span');
        icon.className = 'mode-symbol';
        icon.textContent = symbol;
        const text = document.createElement('span');
        const title = document.createElement('strong');
        title.textContent = name;
        const detail = document.createElement('small');
        detail.textContent = hint;
        const check = document.createElement('span');
        check.textContent = active === id ? '✓' : '';
        check.setAttribute('aria-hidden', 'true');
        text.append(title, detail);
        choice.append(icon, text, check);
        choice.onclick = () => {
          original.value = id;
          original.dispatchEvent(new Event('change', { bubbles: true }));
          dialog.close();
          sync();
        };
        return choice;
      }));
      if (!dialog.classList.contains('mode-mobile')) {
        const anchor = trigger.getBoundingClientRect();
        dialog.style.right = Math.max(12, innerWidth - anchor.right) + 'px';
        dialog.style.bottom = Math.max(12, innerHeight - anchor.top + 10) + 'px';
      }
      dialog.showModal();
      body.querySelector('[aria-pressed=true]')?.focus();
    };
    dialog.onclick = event => {
      const rect = dialog.getBoundingClientRect();
      if (event.target === dialog && (event.clientX < rect.left || event.clientX > rect.right ||
        event.clientY < rect.top || event.clientY > rect.bottom)) dialog.close();
    };
    dialog.querySelector('.mode-close').onclick = () => dialog.close();
    original.addEventListener('change', sync);
    new MutationObserver(sync).observe(original, { attributes: true, attributeFilter: ['disabled', 'title'] });
    window.ompModePicker = { sync };
    sync();
  }
  function applyLocale() {
    document.documentElement.lang = isEnglish() ? 'en' : 'nb';
    localize(document.body);
    window.ompModePicker?.sync();
    for (const previous of document.querySelectorAll('time.message-time')) previous.replaceWith(messageTime(previous.dateTime));
  }
  window.ompLocale = { translate, languageSetting, approvalSetting, confirmAlways, messageTime };
  applyLocale();
  new MutationObserver(records => {
    for (const record of records) {
      if (record.type === 'childList') for (const node of record.addedNodes) localize(node);
      else localize(record.target);
    }
  }).observe(document.body, { subtree: true, childList: true, characterData: true, attributes: true, attributeFilter: attributes });
  window.addEventListener('languagechange', applyLocale);
  modePicker();
})();
