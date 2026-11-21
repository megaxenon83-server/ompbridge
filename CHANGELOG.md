# Endringslogg

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
