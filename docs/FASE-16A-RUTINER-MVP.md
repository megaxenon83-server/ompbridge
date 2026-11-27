# Fase 16a — Rutiner MVP (oppfølging)

Status: planlagt etter Compose Desktop (Fase 14b).

## Mål

En enkel, generisk rutinemotor i Android-appen:

- liste over rutiner
- lage en rutine med **manuelle steg** (ikke innspilling ennå)
- kjøre den via **ADB** (bridgen)
- Test-knapp med stort STOPP-overlegg
- én ferdig mal: «Stemple inn» (uten hemmeligheter i denne fasen)

## Omfang (MVP)

### Rutinemodell (JSON, lagres lokalt i appen)

```json
{
  "id": "…",
  "name": "Stemple inn på jobb",
  "steps": [
    { "type": "open_url", "url": "https://intern.vy.no" },
    { "type": "tap", "text": "Logg inn" },
    { "type": "type", "text": "brukernavn" },
    { "type": "tap", "text": "Passord" },
    { "type": "wait", "ms": 800 },
    { "type": "check", "text": "Stemplet inn" }
  ]
}
```

### Stegtyper i 16a

| type | parametere |
|---|---|
| open_app | package |
| open_url | url |
| tap | text (tilgjengelighetstekst) eller x/y (relative) |
| type | text |
| key | enter/back/home/tab |
| wait | ms |
| check | text (feiler rutinen hvis ikke funnet) |

Hemmeligheter (passord) kommer i 16e; i 16a skrives tekst rett inn.

### Kjøremotor

Bridgen har allerede Android-handlinger i `workspace-extension.mjs`
(screen, apps, open, tap, key, text) — men de er bare eksponert som OMP-verktøy.

16a legger til **HTTP-endepunkter** i bridgen:

```
POST /api/device/action
{ "device": "android", "action": "open|tap|type|key|screen|apps", ... }
```

som gjenbruker `adb.cjs` + `device-action.ps1`-logikken. Appen kaller dem.

### UI

1. **Rutiner** i sidemenyen (nytt ikon), liste med navn + «Test».
2. **Rutine-skjerm:** stegene i klarspråk (ikke JSON), «Kjør nå», «Rediger», «Slett».
3. **Steg-editor:** velg handling, fyll ut; «Trykk» kan velges fra skjermbilde.
4. **Test-kjøring:** overlegg «OMP styrer telefonen» + STOPP-knapp.
5. **Mal:** «Stemple inn» som forhåndsutfylt eksempel.

## Akseptansekriterier

- [ ] Opprette rutine «Åpne app» + kjøre den på emulatoren
- [ ] Rutine «Åpne nettadresse» + «Trykk» + «Skriv» fungerer
- [ ] STOPP avbryter en pågående kjøring umiddelbart
- [ ] Feil steg gir tydelig melding og stopper rutinen
- [ ] Malen «Stemple inn» kan redigeres og kjøres (uten ekte passord)

## Risiko

- Krever ADB (USB-feilsøking) i 16a; AccessibilityService kommer i 16b.
- Tekst med spesialtegn er begrenset i ADB (`input text`).
- Rutiner lagres lokalt; ingen sync i 16a.

## Neste etter 16a

16b: AccessibilityService + innspilling (uten PC).
