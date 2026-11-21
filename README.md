<h1 align="center">Chat OMP OMP</h1>
<p align="center"><strong>Oh My Pi på Windows. Prosjektene dine tilgjengelige fra Android.</strong></p>
<p align="center"><a href="https://megaxenon83-server.github.io/ompbridge/">Prosjektsiden</a> · <a href="https://github.com/megaxenon83-server/ompbridge/releases/tag/omp-desktop-0.8.1">Ny release</a> · <a href="docs/FAQ.md">Vanlige spørsmål</a></p>

## Last ned

| Komponent | Bruk |
| --- | --- |
| [OMP Bridge 2.9.35 for Windows](https://github.com/megaxenon83-server/ompbridge/releases/download/omp-desktop-0.8.1/OMP-Bridge-Setup-2.9.35.exe) | Installerer bridgen per bruker og starter den automatisk når du logger på Windows. |
| [Chat OMP OMP 0.2.0 for Android](https://github.com/megaxenon83-server/ompbridge/releases/download/omp-desktop-0.8.1/Chat-OMP-OMP-Android-0.2.1.apk) | Åpne og fortsett samtaler, gjennomgå kodeendringer og administrer prosjekter fra mobilen. |
| [OMP Desktop 0.8.1 for Windows x64](https://github.com/megaxenon83-server/ompbridge/releases/download/omp-desktop-0.8.1/OMP-Desktop-0.8.1-win-x64.zip) | Bruk OMP på PC-en og generer en engangskode for Android. |

## Kom i gang

1. Installer Node.js 22 eller nyere og Oh My Pi på Windows. Installer Git hvis du vil bruke Git-panelet og automatisk Git-sporing.
2. Kjør OMP Bridge-installeren. Standardporten er **7778** for nye installasjoner.
3. Pakk ut OMP Desktop og velg **Innstillinger → Tilkobling → Vis QR-kode**. Velg PC-ens adresse på lokalnettet.
4. Installer APK-en. Koble mobilen til samme betrodde nettverk som PC-en og velg **Skann QR-kode** i Chat OMP OMP.

## Fra første melding til kodegjennomgang

- Åpne delte prosjektmapper og fortsett den samme OMP-samtalen på PC og mobil. Registrerte mapper vises i begge klienter.
- Bruk **Innstillinger → OMP-ressurser** for å se og endre status på skills, verktøy og MCP-servere i et delt prosjekt.
- Bruk **Innstillinger → Plugins** for å slå på **Enhetsstyring**. Verktøyet ber om godkjenning per handling i Windows-vinduet eller på en autorisert Android-enhet via ADB.

- **Kopier** og **Les opp** finner du under hver tekstmelding. Opplesing bruker en lokal stemme på Windows eller Android.
- OMPs oppgaveliste viser ferdige og gjenstående punkter rett under samtalehodet når tråden har oppgaver.

- **Kjør prosjekt → Pek og be om endring → Gjennomgå.** Opplev lokale nettsider i Desktop-panelet, send et merket element som kontekst og åpne diffen ved siden av samtalen.
- **Aktive samtaler** vises øverst i sidemenyen på Windows og Android. Samtaler som venter på svar fra deg kommer først.
- Kjør prosjektets tester i panelet og åpne det delte utfallet fra Android. Dette krever minst Bridge 2.9.34 og Android 0.2.0.

- Fortsett samme samtale på PC og mobil. Navnebytter går begge veier, og arkiv og papirkurv oppdaterer samtalelisten på PC-en.
- Se OMPs oppgaveliste mens den jobber. Åpne endringskort for å se diff og antall linjer lagt til og fjernet per fil.
- Opprett en prosjektmappe på PC-en med Androids mappevelger. Nye mapper får lokal Git-sporing der Git er tilgjengelig.

[Installasjonsveiledning](docs/INSTALL.md) · [Prosjektpanelet](docs/PROJECT-PANEL.md) · [FAQ](docs/FAQ.md) · [Sikkerhet](SECURITY.md) · [Bygg installer](docs/BUILDING.md)

Bridge gir en paret klient tilgang til OMP og prosjektfiler på Windows. Bruk et betrodd lokalnett eller VPN. Hold bridge-porten utenfor offentlig internett.
