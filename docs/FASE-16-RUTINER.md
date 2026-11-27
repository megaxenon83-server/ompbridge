# Fase 16 — Enhetsstyring + Rutiner + Skiftplan + Geofence

Status: planlagt (after Compose Desktop, Fase 14).

## Mål

Gjøre det enkelt for en vanlig bruker å automatisere telefonen:

- lage en rutine («stemple inn på jobb», «send melding til Anna», «åpne appen»)
- kjøre den manuelt, på tid, eller når telefonen ser at du nærmer deg jobb
- med skiftplan, geofence og sikker lagring av passord

Ingen av delene er app-spesifikke: Vy er bare ett eksempel.

## Rutiner

En rutine er en liste generiske steg:

| Steg | Betydning |
|---|---|
| Åpne app | hvilken som helst pakke |
| Åpne nettadresse | hvilken som helst URL |
| Trykk | på tekst/rolle (ikke faste koordinater) |
| Skriv | tekst eller hemmelighet |
| Vent | til element / fast tid |
| Rull / Tilbake / Hjem | navigasjon |
| Sjekk | at skjermen viser noe bestemt |
| Varsle | si fra til bruker |

Tre måter å lage en rutine:

1. **Beskriv med ord** — OMP foreslår stegene i klarspråk, brukeren godkjenner.
2. **Spill inn** — brukeren gjør det én gang; appen registrerer stegene (AccessibilityService).
3. **Bygg steg for steg** — velg handling og fyll ut, med skjermbilde.

## Kjøring

- Test-knapp med stort STOPP-overlegg og varsel «OMP styrer telefonen».
- Godkjenning per kjøring (standard) eller «Kjør automatisk» (må slås på per rutine).
- Logg med skjermbilde per steg.
- AI-fallback: finner ikke rutinen knappen, tar agenten skjermbilde og spør før den trykker.

## Skiftplan

Modell: skift med start/slutt, sted og merknad.

Import:
- mønster («hverdager 14–22, annenhver helg»)
- lim inn / CSV fra arbeidsgivers system
- bilde/PDF av skiftplanen (AI leser, bruker bekrefter)

## Geofence og triggere

- Marker jobb-stedet én gang (kart eller «bruk min posisjon»), radius f.eks. 250 m.
- Android Geofencing API; alt skjer på telefonen, posisjonen sendes ikke til PC-en.

Triggeren kombinerer sted og skiftplan:

```
Når: innenfor 250 m av jobb
OG:  neste skift starter innen 20 minutter
OG:  ikke stemplet inn i dag
→ Kjør «Stemple inn»
```

Og motsatt: forlat jobb etter skiftets slutt → «Stemple ut».

Triggertyper: manuelt, klokkeslett, sted (geofence), nettverk (jobb-Wi-Fi), hendelse.
Planleggingen ligger på telefonen (WorkManager/AlarmManager), så det virker uten PC.

## Hemmeligheter

- Passord i Android Keystore, aldri i rutinefila eller i samtalen.
- Rutinen refererer til en hemmelighet: `Skriv passord ← hemmelighet «Vy»`.
- Egen «Hemmeligheter»-side der brukeren fyller inn én gang.

## Motor

| Motor | Fordel | Ulempe |
|---|---|---|
| ADB (finnes i bridgen) | virker nå | krever USB-feilsøking og PC |
| AccessibilityService (i appen) | uten PC, raskere, kan spille inn | må aktiveres i Android-innstillinger |

Anbefaling: AccessibilityService primært, ADB som fallback.

## Sikkerhet

- Godkjenning per kjøring som standard; «Kjør automatisk» må aktiveres eksplisitt.
- Varselnotifikasjon med STOPP mens rutinen kjører.
- Logg med skjermbilder.
- Aldri automatisk sending av meldinger eller betaling uten bekreftelse.

## Begrensninger

- Bank-/ID-apper blokkerer ofte tilgjengelighet → rutinen stopper og varsler.
- 2FA/BankID/CAPTCHA må håndteres manuelt.
- Spill/DRM eksponerer ikke kontroller.
- Bakgrunnsposisjon krever egen tillatelse og kan begrenses av batterisparing.

## Faser

| Fase | Innhold |
|---|---|
| 16a | Rutiner-skjerm + manuelle steg (ADB) + Test/STOPP |
| 16b | AccessibilityService + innspilling (uten PC) |
| 16c | Skiftplan (mønster + CSV/bilde-import) |
| 16d | Geofence + trigger-motor (nær jobb + skift snart → stemple inn) |
| 16e | Planlegging, hemmeligheter, logg |
