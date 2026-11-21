# Endringslogg

## OMP Desktop 0.8.1 · Android 0.2.1 · Bridge 2.9.35

- **Aktive samtaler** vises øverst i sidemenyen på Windows og Android. Samtaler som venter på svar fra deg kommer først.
- Statusen synkroniseres via Bridge. Når OMP er ferdig, går samtalen tilbake til den vanlige prosjektlisten.
- Samtaler i ulike prosjekter kan kjøre samtidig når det ikke krever at en modell i bruk lastes ut.

## OMP Desktop 0.8.0 · Android 0.2.0 · Bridge 2.9.34

- Prosjektmapper registrert fra Windows eller Android vises i begge klienter. Delte samtaler oppdateres i den samme tråden.
- Delte tråder har innstillinger for OMP-skills, MCP-servere og verktøy i begge klienter.
- Installerte OMP-plugins kan slås av og på. Den innebygde Enhetsstyring-pluginen legger til en OMP-skill og et verktøy for godkjente skjermbilder og inndata.

## OMP Desktop 0.7.2 · Android 0.1.7

- **Kopier** og **Les opp** under hver tekstmelding. Opplesingen bruker en lokal systemstemme og kan stoppes fra meldingen.
- Oppgavelisten vises rett under samtalehodet når tråden har OMP-oppgaver. Den viser ferdige og gjenstående oppgaver og foldes sammen når alt er avsluttet.

## OMP Desktop 0.7.1 · Android 0.1.6 · OMP Bridge 2.9.33

- Desktop-versjonen vises i topplinjen.
- Konfigurasjoner for administrerte llama.cpp-modeller kan leses når Windows har lagt til en UTF-8-markør. Desktop sjekker også om den valgte serveren må startes på nytt.
- Administrerte llama.cpp-modeller som Ornith vises som **Lokal**. Desktop sjekker hvilken prosess som eier porten før den stopper en administrert modellserver.
- Forhåndsvisningen oppdaterer størrelsen på nettleserflaten når prosjektpanelet vises eller endrer bredde.
- Ornith 1.5 128K ble testet mot en lokal llama.cpp-server med 131 072 tokens per økt. GPU- og batchinnstillingene for testen tilhører PC-ens lokale modellkonfigurasjon.

## Chat OMP OMP 0.1.6 · OMP Bridge 2.9.33 · OMP Desktop 0.7.0

- Prosjektpanel med forhåndsvisning, endringer, tester, terminal og filer ved siden av samtalen.
- Start lokale nettprosjekter, bytt til mobilbredde og pek på et element for å legge det i utkastet.
- Åpne filens diff direkte fra endringskortet. Kjør tester med terminalutdata og exit-kode.
- Del testutfallet i den samme OMP-samtalen og åpne det på Android med QR-kode.

## Chat OMP OMP 0.1.5 · OMP Bridge 2.9.32 · OMP Desktop 0.6.1

- Windows-installer med oppstart ved pålogging og lokal Bridge på port 7778 for nye installasjoner.
- Egen Android-app med mappevelger, delte samtaler, arkiv og papirkurv.
- Toveis navnebytte mellom Android og Desktop.
- OMP-oppgaveliste live og endringskort per svar med diff og angremulighet der det støttes.
- Lokal Git-sporing i nye prosjektmapper som opprettes via Bridge.

[Eldre releaser og tilhørende versjonsnotater](https://github.com/megaxenon83-server/ompbridge/releases)
