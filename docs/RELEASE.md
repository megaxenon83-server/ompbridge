# Release-prosedyre (alle apper, hver gang)

**Regel:** hver gang noe er endret og verifisert, publiser en ny release med **alle** appene,
og oppdater denne PC-en etterpå.

**Token:** bruk miljøvariabelen `GH_TOKEN` i shell-kommandoen. Skriv den aldri til fil,
commit, logg eller chat-historikk.

## 1. Bump versjoner (alle steder)

| Fil | Felt |
|---|---|
| `android-native/app/build.gradle.kts` | `versionCode` (+1) og `versionName` |
| `windows/Setup.iss` | `#define BridgeVersion` |
| `windows/bridge/omp-bridge.mjs` | `const VERSION` |
| `windows/PolyStrata-Compat.ps1` | versjonsstrengen |
| `windows/DesktopSetup.iss` | `#define DesktopVersion` |
| `clients/package.json` + `package-lock.json` | `"version"` |

## 2. Bygg

```powershell
$jdk='C:\Prosjekter\Inkling\tools\jdk-17.0.20.101-hotspot'
$env:JAVA_HOME=$jdk; $env:ANDROID_HOME='C:\Android'; $env:ANDROID_SDK_ROOT='C:\Android'
$env:PATH="$jdk\bin;C:\Android\build-tools\35.0.0;$env:PATH"
$env:CHATOMP_KEYSTORE='C:\Prosjekter\Inkling\release\chatomp-development.jks'
$env:CHATOMP_KEYSTORE_PASSWORD='android'; $env:CHATOMP_KEY_ALIAS='chat-omp-dev'; $env:CHATOMP_KEY_PASSWORD='android'
Push-Location 'C:\Prosjekter\ompbridge-git\android-native'
& 'C:\Prosjekter\Inkling\tools\gradle-8.9\bin\gradle.bat' assembleRelease --no-daemon --console=plain
Pop-Location

$node='C:\Users\Megaxenon\.dsh\dsh-runtimes\dsh-primary-runtime\dependencies\node\bin\node.exe'
Push-Location 'C:\Prosjekter\ompbridge-git\clients'
& $node scripts\build.cjs
Pop-Location

& 'C:\Prosjekter\Inkling\tools\InnoSetup6\ISCC.exe' 'C:\Prosjekter\ompbridge-git\windows\Setup.iss' '/DBridgeVersion=<bridge>'
& 'C:\Prosjekter\Inkling\tools\InnoSetup6\ISCC.exe' 'C:\Prosjekter\ompbridge-git\windows\DesktopSetup.iss' '/DDesktopVersion=<desktop>'
```

## 3. Stage filer

`C:\Prosjekter\Inkling\release\<bridge>\`:

- `OMP-Bridge-Setup-<bridge>.exe`
- `OMP-Desktop-Setup-<desktop>-win-x64.exe`
- `OMP-Desktop-<desktop>-win-x64.zip`
- `Chat-OMP-OMP-Native-<android>.apk`
- `OMP-Suite-<bridge>-source.zip` (git archive)
- `SHA256SUMS.txt`

## 4. Publiser

```python
import json, os, urllib.request, urllib.parse, urllib.error, http.client
REPO = "megaxenon83-server/ompbridge"
TOKEN = os.environ["GH_TOKEN"]
TAG = "omp-bridge-<bridge>"
COMMIT = "<full 40-char sha>"
# 1) opprett tag: POST /repos/{REPO}/git/refs {"ref":"refs/tags/"+TAG,"sha":COMMIT}
# 2) opprett release: POST /repos/{REPO}/releases {tag_name, target_commitish, name, body}
# 3) last opp hver fil: POST uploads.github.com/repos/{REPO}/releases/{id}/assets?name=...
```

Bruk full SHA (ikke kort) i tag og `target_commitish`.

## 5. Oppdater PC-en

```powershell
$inst='C:\Users\Megaxenon\AppData\Local\Nimay\OMPBridge\bridge'
Copy-Item 'C:\Prosjekter\ompbridge-git\windows\bridge\*.mjs','C:\Prosjekter\ompbridge-git\windows\bridge\*.cjs' $inst -Force
# restart bridge via planlagt oppgave
Start-ScheduledTask -TaskName 'OMP Bridge'
# Desktop
Start-Process 'C:\Prosjekter\Inkling\release\<bridge>\OMP-Desktop-Setup-<desktop>-win-x64.exe' -ArgumentList '/VERYSILENT','/SUPPRESSMSGBOXES','/NORESTART' -Wait
# Android (emulator)
& 'C:\Android\platform-tools\adb.exe' install -r 'C:\Prosjekter\ompbridge-git\android-native\app\build\outputs\apk\release\app-release.apk'
```

## 6. Verifiser

- `GET /api/health` viser ny bridge-versjon
- Desktop-versjon i `resources\app\package.json`
- Android `dumpsys package net.nimay.chatompomp` viser ny `versionName`
- Releasesiden har alle 6 filene
