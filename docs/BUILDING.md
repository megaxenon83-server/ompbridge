# Building OmniDesk

## Repository layout

```
.github/workflows/build-release.yml   GitHub Actions: Android, Linux, Windows, release
2.9.26-bridge/                        Bridge source and installers
  bridge/omp-bridge.mjs               Bridge server (Node.js, ESM, no dependencies)
  bridge/config.template.json         Config template (never the real config)
  commands/                           OMP slash commands (ompqr, ompserver, ompchat-shared)
  tools/                              QR generator, start/stop helpers, vendored qrcode
  install.sh                          Linux installer (download mode and --local mode)
  packaging/build-linux-packages.sh   Builds tarball + .deb + .rpm
  packaging/build-flatpak.sh          Builds the Flatpak bundle
  flatpak/                            Flatpak manifest, launcher and desktop entry
  build-installer/                    Inno Setup definition + Build-Installer.ps1
android-source/nimayomp-chatgpt-ui-4.2.3/   Android app source (Kotlin, Jetpack Compose)
docs/                                 This documentation
```

## Versions

| Component | Version | Where |
|---|---|---|
| OmniDesk Bridge | 2.9.28 | `const VERSION` in `bridge/omp-bridge.mjs` |
| OmniDesk Android | 4.2.6 (`versionCode 216`) | `app/build.gradle` (flavour `chstgpt`) |
| Release tag | `v2.9.28` | Follows the bridge version |

The version appears in more than one place. When you bump it, update:

1. `bridge/omp-bridge.mjs` → `const VERSION`
2. `android-source/.../app/build.gradle` → `versionCode` / `versionName` (flavour `chstgpt`)
3. `.github/workflows/build-release.yml` → `ANDROID_VERSION` and the `BRIDGE_VERSION` default
4. `install.sh` → `BRIDGE_VERSION`
5. `packaging/build-linux-packages.sh` and `packaging/build-flatpak.sh` → version defaults
6. `build-installer/Build-Installer.ps1` → default version

## Local builds

### Linux packages

```bash
bash 2.9.26-bridge/packaging/build-linux-packages.sh 2.9.28 dist
```

Produces `omnidesk-bridge-linux-x86_64.tar.gz`, `omnidesk-bridge_<version>_amd64.deb` and `omnidesk-bridge-<version>-1.x86_64.rpm` plus checksums. `dpkg-deb` and `rpmbuild` are required; missing tools are skipped with a warning.

### Flatpak

```bash
bash 2.9.26-bridge/packaging/build-flatpak.sh 2.9.28 dist
```

Requires `flatpak-builder` and the freedesktop 24.08 runtime plus the Node 20 SDK extension:

```bash
sudo flatpak install flathub org.freedesktop.Platform//24.08 org.freedesktop.Sdk//24.08
sudo flatpak install flathub org.freedesktop.Sdk.Extension.node20//24.08
```

### Windows installer

Requires [Inno Setup 6](https://jrsoftware.org/isinfo.php).

```powershell
& 2.9.26-bridge\build-installer\Build-Installer.ps1 -Version 2.9.28 -OutputDir dist
```

The script stages a fresh payload (bridge, tools, commands), writes the version into the Inno Setup definition and compiles `OmniDesk-Bridge-Setup-<version>.exe`. The payload is always rebuilt from source, so the installer can never ship a stale bridge.

### Android

Requires the Android SDK (platform 34, build-tools 34.0.0) and a release keystore.

```powershell
$env:ANDROID_HOME='C:\android'
cd android-source\nimayomp-chatgpt-ui-4.2.3
.\gradlew.bat :app:assembleChstgptRelease
```

The output is `app/build/outputs/apk/chstgpt/release/super-premium.apk`.

> Always run a **clean** build (`./gradlew clean :app:assembleChstgptRelease`) after changing only the version numbers. Kotlin's incremental compiler can otherwise keep an inlined `BuildConfig.VERSION_NAME` / `VERSION_CODE` from a previous build, which makes the app display a stale version even though the APK metadata is correct.

#### Release signing

The keystore is never committed. Create `keystore.properties` next to `app/build.gradle` (it is git-ignored):

```properties
storeFile=C:/path/to/nimayomp-release.jks
storePassword=...
keyAlias=...
keyPassword=...
```

Generate it with:

```bash
keytool -genkeypair -v -keystore nimayomp-release.jks -alias nimayomp \
        -keyalg RSA -keysize 2048 -validity 10000
```

## GitHub Actions

`.github/workflows/build-release.yml` runs three jobs in parallel and creates the release when a `v*` tag is pushed.

| Job | Runner | Output |
|---|---|---|
| `android-build` | `ubuntu-latest` | Signed APK + checksum |
| `linux-build` | `ubuntu-latest` | `.deb`, `.rpm`, Flatpak bundle, tarball + checksums |
| `windows-build` | `windows-latest` | Inno Setup `.exe` |
| `create-release` | `ubuntu-latest` | GitHub release with all artifacts and `SHA256SUMS` |

### Required secrets

| Secret | Content |
|---|---|
| `NIMAYOMP_KEYSTORE_BASE64` | Base64 of the release keystore |
| `NIMAYOMP_KEYSTORE_PASSWORD` | Keystore password |
| `NIMAYOMP_KEY_ALIAS` | Key alias |
| `NIMAYOMP_KEY_PASSWORD` | Key password |

The workflow writes the keystore to a temporary file in the runner, builds the APK and never prints the passwords.

### Publishing a release

```bash
git tag v2.9.28
git push origin v2.9.28
```

The workflow publishes the release automatically. Verify the assets and their `.sha256` files afterwards, then move the `stable-beta` prerelease tag to the same commit if you want it to track the newest build.

## Rules

- Never commit API keys, pairing tokens, `bridge/config.json` or the release keystore.
- The bridge has no third-party dependencies; keep it that way unless there is a very good reason.
- The installer must always start from a freshly staged payload.
