# Installer Chat OMP OMP

## Windows

Bruk Windows 10 eller 11. Installer [Node.js](https://nodejs.org/) 22 eller nyere, [Oh My Pi](https://github.com/can1357/oh-my-pi) og eventuelt [Git](https://git-scm.com/). Bekreft at `node --version` og `omp --version` virker i en ny terminal.

Kjør installasjonsprogrammet fra [releasen](https://github.com/megaxenon83-server/ompbridge/releases/tag/omp-desktop-0.8.1). Det installerer for gjeldende bruker i `%LOCALAPPDATA%\Nimay\OMPBridge`, starter bridgen med én gang og velger automatisk oppstart som standard. Etter en omstart starter bridgen når denne Windows-brukeren logger inn. Du kan også velge **Start OMP Bridge** i Start-menyen.

Windows kan spørre om nettverkstilgang for Node.js. Tillat den på det private nettverket der PC og mobil skal kommunisere. På nye installasjoner er bridge-adressen lokalt `http://127.0.0.1:7778`.

## Android og paring

1. Pakk ut Windows ZIP-filen. Åpne `OMP Desktop.exe` fra den utpakkede mappen.
2. Åpne **Innstillinger → Tilkobling** i Desktop. Koble til bridgen, velg **Vis QR-kode** og velg PC-adressen som mobilen når.
3. Installer APK-en på Android 8.0 eller nyere. Android kan be om tillatelse til å installere fra nettleseren eller filbehandleren som åpnet APK-en.
4. Åpne Chat OMP OMP, velg **Skann QR-kode** og bekreft tilkoblingen. Koden er gyldig i to minutter og kan brukes én gang.

## Oppgradering og feilsøking

Vent til aktive OMP-oppgaver er ferdige før oppgradering. Installeren bevarer eksisterende bridge-konfigurasjon på standard installasjonssti, inkludert porten og nøkkelen. Har du en eldre Bridge i en annen mappe, avslutt den før du setter opp den nye dersom de bruker samme port.

Ved oppstartsfeil, sjekk `bridge\bridge.stderr.log` under installasjonsmappen. Ved tilkoblingsfeil, sjekk at PC-en er våken, at du valgte riktig IP-adresse og at Windows tillater trafikk på det private nettverket.

Avinstaller **OMP Bridge for Chat OMP OMP** fra Windows Innstillinger. Det stopper bridgen og fjerner oppstartssnarveien. Konfigurasjon og OMP-prosjekter beholdes.
