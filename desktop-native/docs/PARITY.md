# Før Electron kan pensjoneres

Status per fase 14b: `desktop-native/` dekker chat, filer, git, terminal, enheter
og tale-status, og snakker med bridgen over HTTP/SSE/WebSocket. `clients/` er
fortsatt fallback til listen under er tom.

Legenden: **P0** = må på plass før bytte, **P1** = viktig i daglig bruk,
**P2** = kosmetisk / sjelden bruk.

## P0 — blokkere

### 1. Prosjektpanelet (høyre sidepanel, per prosjekt)

Electron har et panel med fanene **Forhåndsvisning · Endringer · Tester ·
Terminal · Filer** for prosjektet som er åpent. I native er filer/git/terminal
globale skjermer i sidemenyen, ikke knyttet til et prosjektpanel.

- [ ] Panel med de fem fanene, åpnes fra topplinjen («Vis sidepanel»).
- [ ] Fanene må dele prosjektkontekst (`activeCwd`), og «Endringer» skal vise
      diff for arbeidstreet slik git-skjermen gjør i dag.
- [ ] Endepunkter: `GET /api/git/status|diff|log`, `GET /api/omp/turns`,
      `GET /api/fs/list`, `GET /api/files/read`, `POST /api/terminal/create`.

### 2. Innebygd forhåndsvisning av nettside

Electron kjører prosjektets nettside i et eget panel: **Kjør prosjekt**, åpne
adresse, mobilbredde, last på nytt, stopp, og «pek og be om endring» (klikk i
siden → forespørsel til OMP).

- [ ] Innebygd nettleser i Compose Desktop (JCEF eller JavaFX WebView via
      Swing-interop) — Compose har ingen innebygd browser.
- [ ] Knappene «Kjør prosjekt», «Åpne adresse», «Mobilbredde», «Last på nytt»,
      «Stopp».
- [ ] «Pek og be om endring»: plukke element/tekst fra siden og sende det som
      prompt med skjermbilde/HTML-kontekst.

### 3. Endringskort per tur + Tester-fanen

- [ ] `turn_changes`-frames fra `/api/events` rendret som kort under svaret
      (fil, +/- linjer, «Angre»).
- [ ] `GET /api/omp/turns?file=`, `GET /api/omp/turn-diff?file=&id=&path=`,
      `POST /api/omp/turn-undo`.
- [ ] Tester: `POST /api/omp/turn-check` og `project_check`-frames, med
      godkjenn/avvis i UI.

### 4. Plan og todo

- [ ] `todo_phases`-frames fra `/api/events` som en sammenleggbar plan over
      samtalen (nå vises ingenting).

### 5. Regenerer svar

- [ ] `POST /api/regenerate {cwd, file, entryId, text}` fra siste assistent-svar.

### 6. Vedlegg og bilder

- [ ] Legge ved bilde i composer (filvelger/drag-and-drop) og sende med
      `POST /api/prompt {attachments|images}`.
- [ ] `POST /api/files/upload` for store vedlegg.

### 7. Innstillinger med kategorier

Electron har en innstillingsdialog med faner. Native har i dag bare språk, tema,
modell og «Koble fra».

- [ ] **Utseende** (tema — finnes), **språk** (finnes).
- [ ] **Bridge/pairing**: vis `GET /api/pairing` som **QR-kode** + kopierbar
      lenke, slik at telefonen kan pare mot PC-en (native kan bare *lese*
      paringslenker i dag).
- [ ] **Godkjenningsmodus**: `GET/POST /api/approval` (deny/write/yolo/
      always-ask/always-ask-cached).
- [ ] **Modeller**: `GET /api/models`, `POST /api/model` (finnes som dialog),
      pluss standardmodell og resonneringsnivå per prosjekt.
- [ ] **Leverandører/API-nøkler**: `GET /api/omp/credentials`,
      `GET /api/omp/providers` (maskert visning, legg til/bytt/slett).
- [ ] **Lokale modeller**: `GET /api/local/models`, `POST /api/local/models/
      start|stop|switch`.
- [ ] **Tale**: `GET/POST /api/voice/local`, `POST /api/voice/select`,
      `POST /api/voice/install`, `POST /api/voice/settings`.
- [ ] **Wake-on-LAN**: `GET /api/wol/pairing`, `GET/POST /api/wol/config`.
- [ ] **Plugins og skills**: `GET/POST /api/omp/workspace/plugins`,
      `GET/POST /api/omp/workspace/resources` (egen skjerm i Android).
- [ ] **Oppdatering**: sjekk mot GitHub-releases, vis versjon og «last ned».
- [ ] **Diagnostikk**: `GET /api/diagnostics` (logg-tail, porter, stier).

### 8. Planlagte oppgaver

- [ ] Skjerm for «Planlagte oppgaver» (Electron har det i sidemenyens
      arbeidsverktøy). Endepunkter må bekreftes mot bridgen.

### 9. Skrivebordsintegrasjon

- [ ] Tray-ikon med bridge-status (start/stopp), og «vis/skjul».
- [ ] Varsler når et svar blir ferdig i en annen samtale (`agent_end`).
- [ ] Enkelt-instans (fokusér eksisterende vindu), autostart, hurtigtast.
- [ ] Vindusposisjon huskes (i dag bare størrelse), maksimert tilstand.

### 10. Utgivelse

- [ ] Signert `.exe`/`.msi` (kode-signering) og CI-bygg (i dag bygger
      `clients/scripts/build.cjs` release-artefaktene).
- [ ] Versjonsnummer følger release-toget (nå `1.14.0` / app `0.14.0`).
- [ ] Oppdater `README`/`RELEASE.md` når `clients/` fjernes.

## P1 — viktig i daglig bruk

- [ ] Live modellmetrikk i composer (`model_metrics`: Resonnerer/Behandler
      kontekst/Genererer, tok/s, cache) — i dag vises bare `tokensPerSecond`.
- [ ] Godkjenningsmodus direkte i composer (Electron har egen velger).
- [ ] Tagger og innholdssøk: `GET /api/tags`, `GET /api/sessions?q=&content=1`.
- [ ] Maskinressurser: `GET /api/machine/resources` (CPU/GPU/RAM-panel).
- [ ] Prosjektregister: `GET /api/projects/registry`, `POST /api/projects/
      create|rename|hide|unhide|register` (native viser bare listen).
- [ ] Del tråd / trådvalg (eksport, arkiv, slett, «merk alle som lest» finnes).
- [ ] Taleopptak: `POST /api/voice/start|stop|transcribe` + avspilling av
      `audioUrl` (native har bare status og opplesing).
- [ ] Filjobber: `fs_job`-fremdrift ved kopiering/flytting + avbryt.
- [ ] Terminal: flere sesjoner (`GET /api/terminal/list`, `POST /api/terminal/
      kill`) og resize ved vindusendring.
- [ ] Tastatursnarveier og menylinje (Ctrl+N, Ctrl+F, Ctrl+Enter, F5).
- [ ] Samtale-søk med utheving, og «hopp til siste melding»-knapp.

## P2 — kosmetisk

- [ ] Statistikk/kostnad per samtale (`usage` i meldinger).
- [ ] Tema per prosjekt (i dag globalt).
- [ ] Skills-portal (`clients/skills-portal/`) som egen nettside eller panel.
- [ ] «Nettleser»-verktøyet i sidemenyen (Electron åpner en egen nettleser).
- [ ] Flerspråklighet utover nb/en.

## Hva som allerede er på plass (14a + 14b)

| Område | Status |
| --- | --- |
| Tilkobling | config.json, paringslenke (omp2/chatomp/AES-GCM/JSON), `Health` |
| Samtaler | liste, gruppering, festing, uleste, arkiv, ny samtale, navngiving |
| Chat | historikk, Markdown, resonnering, verktøyrader, SSE-streaming, stopp |
| Kontekst | måler fra `state.contextUsage`, modell + resonneringsnivå |
| Godkjenninger | `ui_request` → `POST /api/ask` (confirm/select/input/questions) |
| Tema/språk | 13 temaer, nb/en |
| Filer | stasjoner/plasser, opp/ned, «Gå til», vis, rediger+lagre, ny mappe, gi nytt navn, slett |
| Git | repo-velger, gren + ahead/behind, endringer, diff, stage alle, commit, logg |
| Terminal | ekte PTY over WebSocket, input, Ctrl+C, tøm, restart, kill |
| Enheter | ADB-status, installasjon, enhetsliste |
| Tale | lokal-status, motorliste, start/stopp, opplesing (ingen opptak) |
