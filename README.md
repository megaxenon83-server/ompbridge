# Nimay OMP Bridge

Repository for the Nimay OMP Bridge and the OmpChat Android app (ChatGPT UI).
One GitHub release contains every platform artifact.

## Versions

| Component | Version | Source |
|---|---|---|
| OMP Bridge | 2.9.27 | `2.9.26-bridge/` |
| OmpChat Android (ChatGPT UI) | 4.2.5 (`versionCode 215`) | `android-source/nimayomp-chatgpt-ui-4.2.3/` |

The release tag follows the bridge version (`v2.9.27`).

## Layout

```
.github/workflows/build-release.yml   GitHub Actions: Android, Linux, Windows, release
2.9.26-bridge/                        Bridge source and installers
  bridge/omp-bridge.mjs               Bridge server (Node.js, ESM)
  commands/                           OMP slash commands (ompqr, ompserver, ompchat-shared)
  tools/                              Helper scripts (QR, start/stop, QR dependencies)
  install.sh                          Linux installer (download mode and --local mode)
  packaging/build-linux-packages.sh   Builds tarball + .deb + .rpm
  packaging/build-flatpak.sh          Builds the Flatpak bundle
  flatpak/                            Flatpak manifest, launcher and desktop entry
  build-installer/                    Inno Setup definition + Build-Installer.ps1
android-source/nimayomp-chatgpt-ui-4.2.3/   Android app source
```

## Provider synchronisation

The bridge is the source of truth for providers and API keys
(`~/.omp/agent/models.yml`). The Android app pulls providers when it connects
and can push added, edited and deleted providers with **Sync**.

REST surface on the bridge:

| Method | Path | Purpose |
|---|---|---|
| `GET` | `/api/omp/providers` | List PC providers (including API keys) |
| `POST` | `/api/omp/providers` | Create or update a provider (`{"provider": {...}}`) |
| `DELETE` | `/api/omp/providers?id=<id>` | Delete a provider |

Visual model preferences (favorites, hidden models, test state, model list)
stay in the app. A failed or offline sync keeps the local changes and shows a
notification.

## Local builds

Android (requires the Android SDK and a release keystore in
`keystore.properties`):

```powershell
$env:ANDROID_HOME='C:\android'
.\gradlew.bat :app:assembleChstgptRelease
```

Linux packages (Debian/Ubuntu, Fedora/RHEL, universal tarball):

```bash
bash 2.9.26-bridge/packaging/build-linux-packages.sh 2.9.27 dist
```

Flatpak:

```bash
bash 2.9.26-bridge/packaging/build-flatpak.sh 2.9.27 dist
```

Windows installer (requires Inno Setup 6):

```powershell
& 2.9.26-bridge\build-installer\Build-Installer.ps1 -Version 2.9.27 -OutputDir dist
```

## GitHub Actions

`.github/workflows/build-release.yml` builds everything and creates the release
when a `v*` tag is pushed.

Repository secrets required for the signed Android APK:

| Secret | Content |
|---|---|
| `NIMAYOMP_KEYSTORE_BASE64` | Base64 of `nimayomp-release.jks` |
| `NIMAYOMP_KEYSTORE_PASSWORD` | Keystore password |
| `NIMAYOMP_KEY_ALIAS` | Key alias |
| `NIMAYOMP_KEY_PASSWORD` | Key password |

Release artifacts:

- `Nimay-OMP-Bridge-Setup-<version>.exe`
- `nimay-ompbridge_<version>_amd64.deb`
- `nimay-ompbridge-<version>-1.x86_64.rpm`
- `com.nimay.OMPBridge-<version>.flatpak`
- `ompbridge-linux-x86_64.tar.gz`
- `nimay-omp-android-4.2.5.apk`

## Security

Pairing tokens, API keys and the release keystore are never committed. The
bridge generates its own token on first start and stores it in
`bridge/config.json` (git-ignored), and the Android app keeps incoming keys in
the Android Keystore.
