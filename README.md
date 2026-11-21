<h1 align="center">Chat OMP OMP</h1>
<p align="center"><strong>Oh My Pi på Windows. Prosjektene dine tilgjengelige fra Android.</strong></p>
<p align="center"><a href="https://megaxenon83-server.github.io/ompbridge/">Prosjektsiden</a> · <a href="https://github.com/megaxenon83-server/ompbridge/releases/tag/chat-omp-omp-v0.1.5">Ny release</a> · <a href="docs/FAQ.md">Vanlige spørsmål</a></p>

## Last ned

| Komponent | Bruk |
| --- | --- |
| [OMP Bridge 2.9.32 for Windows](https://github.com/megaxenon83-server/ompbridge/releases/download/chat-omp-omp-v0.1.5/OMP-Bridge-Setup-2.9.32.exe) | Installerer bridgen per bruker og starter den automatisk når du logger på Windows. |
| [Chat OMP OMP 0.1.5 for Android](https://github.com/megaxenon83-server/ompbridge/releases/download/chat-omp-omp-v0.1.5/Chat-OMP-OMP-Android-0.1.5.apk) | Åpne og fortsett samtaler, gjennomgå kodeendringer og administrer prosjekter fra mobilen. |
| [OMP Desktop 0.6.1 for Windows x64](https://github.com/megaxenon83-server/ompbridge/releases/download/chat-omp-omp-v0.1.5/OMP-Desktop-0.6.1-win-x64.zip) | Bruk OMP på PC-en og generer en engangskode for Android. |

## Kom i gang

1. Installer Node.js 22 eller nyere og Oh My Pi på Windows. Installer Git hvis du vil bruke Git-panelet og automatisk Git-sporing.
2. Kjør OMP Bridge-installeren. Standardporten er **7778** for nye installasjoner.
3. Pakk ut OMP Desktop og velg **Innstillinger → Tilkobling → Vis QR-kode**. Velg PC-ens adresse på lokalnettet.
4. Installer APK-en. Koble mobilen til samme betrodde nettverk som PC-en og velg **Skann QR-kode** i Chat OMP OMP.

## Fra første melding til kodegjennomgang

- Fortsett samme samtale på PC og mobil. Navnebytter går begge veier, og arkiv og papirkurv oppdaterer samtalelisten på PC-en.
- Se OMPs oppgaveliste mens den jobber. Åpne endringskort for å se diff og antall linjer lagt til og fjernet per fil.
- Opprett en prosjektmappe på PC-en med Androids mappevelger. Nye mapper får lokal Git-sporing der Git er tilgjengelig.

[Installasjonsveiledning](docs/INSTALL.md) · [FAQ](docs/FAQ.md) · [Sikkerhet](SECURITY.md) · [Bygg installer](docs/BUILDING.md)

Bridge gir en paret klient tilgang til OMP og prosjektfiler på Windows. Bruk et betrodd lokalnett eller VPN. Hold bridge-porten utenfor offentlig internett.
