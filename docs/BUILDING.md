# Bygg Windows-installeren

Installer Inno Setup og kompiler `windows/Setup.iss` med `ISCC.exe`. Den ferdige EXE-en ligger i `windows/dist`. Installeren pakker Bridge-koden og Windows-oppstarteren. Node.js, Oh My Pi og Git installeres separat.

Kjør `node --check windows/bridge/omp-bridge.mjs` før bygg. Test i en egen installasjonsmappe med en ledig port, og verifiser autostart-snarveien, helseendepunktet og avinstallasjon. Test også at en aktiv OMP-oppgave kan fullføre før en oppgradering.

Releasen bruker separat tagg `omp-desktop-0.7.2` for å skille publiseringen fra den eldre automatiske releaserutinen. SHA-256-summer følger med nedlastingene.
