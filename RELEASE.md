# Releasing (one release per phase)

Every completed phase gets its own GitHub release, and **every release ships all
apps plus the source code** — even the apps that did not change in that phase.
That keeps a single, obvious place to download everything for a given version.

## What goes in every release

| Artifact | Built from | Output |
| --- | --- | --- |
| Bridge installer (Windows) | `windows\Setup.iss` (Inno Setup) | `windows\dist\OMP-Bridge-Setup-<bridge>.exe` |
| OMP Desktop installer | `windows\DesktopSetup.iss` | `windows\dist\OMP-Desktop-Setup-<desktop>-win-x64.exe` |
| OMP Desktop (portable zip) | `clients\scripts\build.cjs` | `clients\dist\<desktop>\OMP-Desktop-<desktop>-win-x64.zip` |
| Chat OMP OMP (Android APK) | `clients\scripts\build-android.cjs` | `clients\dist\<android>\Chat-OMP-OMP-Android-<android>.apk` |
| Source code | GitHub (automatic for tags) | `Source code (zip)` / `(tar.gz)` |

Versions live in three places and can move independently:
- Bridge version: passed to the installer build (`{#BridgeVersion}`).
- Desktop version: `clients/package.json`.
- Android version: `clients/android/AndroidManifest.xml` (`android:versionName`).

## Steps

1. **Bump the version(s)** you changed this phase (`package.json`, `AndroidManifest.xml`).
2. **Build the artifacts** that changed. Reuse the last release's artifacts for the rest.

   ```powershell
   # Desktop (portable zip) — requires Windows Electron in clients/node_modules
   cd clients; npm install; npm run build
   # Android APK — requires Android SDK 35 + a Java toolchain
   npm run build:android
   # Installers — Inno Setup 6
   & "windows\Bridge.ps1"          # or the ISCC invocations it wraps
   ```

3. **Assemble and checksum** (optional helper, gathers whatever is in `dist`):

   ```bash
   node scripts/assemble-release.mjs --version v2.9.63 --dist dist
   ```

4. **Tag and push** — the tag drives the release and adds the source archives:

   ```bash
   git tag v2.9.63 && git push origin v2.9.63
   ```

5. **Attach the four files + SHA256SUMS** to the release (or let CI do it), and
   paste the generated notes. Include in the notes which apps actually changed
   this phase and which are unchanged — "unchanged" still ships.

## Notes

- If an app is unchanged, ship its **previous** build as-is — never omit it.
- The `.github/workflows/build-release.yml` in this repository is currently
  oriented at the older product line (the `android-source` Compose app and the
  Linux bridge) and does not yet build OMP Desktop or the Chat OMP OMP WebView
  APK. Prefer the local build + `assemble-release.mjs` flow above until that
  workflow is updated to match.
