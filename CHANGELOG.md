# Changelog

All notable changes to Nimay OMP Chat. The release tag follows the bridge version; the Android app carries its own version number.

## 2.9.31 ? Critical approval/request fixes and release updates

**Bridge 2.9.31 ? Android 4.2.7 (`versionCode 217`) ? tag `v2.9.31`**

### Fixed
- **Approval flow:** switching approval mode to **Allow all (yolo)** now auto-approves pending interactive `confirm`/`select` requests in the bridge, preventing sessions from staying blocked after enabling yolo.
- **Android reconnect/request handling:** the app rebuilds the SSE stream on foreground to recover from half-open connections and receive replayed pending UI requests; failed approval answers now restore the request in state so the user can retry instead of losing the prompt while OMP remains blocked.

### Added / Changed
- In-app update support and `omp.nimay.net` update-manifest/site groundwork (primary) with GitHub fallback, plus CI workflow updates for release/site publishing.
- Bridge/runtime and release metadata bumped to **2.9.31**; Android app bumped to **4.2.7** (`versionCode 217`).

## 2.9.28 â€” Nimay OMP Chat rebrand and release polish

**Bridge 2.9.28 Â· Android 4.2.6 (`versionCode 216`) Â· tag `v2.9.28`**

### Changed
- The product is now called **Nimay OMP Chat**. The Android app is labelled *Nimay OMP Chat*, the bridge reports itself as *Nimay OMP Chat Bridge*, and the Windows installer, Linux packages, Flatpak bundle and desktop entries all use the new name.
- Artifacts are renamed accordingly:
  `Nimay OMP Chat-Bridge-Setup-<version>.exe`, `Nimay OMP Chat-bridge_<version>_amd64.deb`,
  `Nimay OMP Chat-bridge-<version>-1.x86_64.rpm`, `com.Nimay OMP Chat.bridge-<version>.flatpak`,
  `Nimay OMP Chat-bridge-linux-x86_64.tar.gz`, `Nimay OMP Chat-android-<version>.apk`.
- The Flatpak launcher now installs the OMP slash commands, writes `~/.omp/agent/ompchat-commands.json` and provides a `systemd --user` unit, so the Flatpak is a full replacement for the `.deb`/`.rpm` install.
- English UI polish: the approval mode label, the Wake-on-LAN section and the QR scanner prompt follow the in-app language setting.
- Documentation rewritten: product-first README, architecture, sync protocol, installation and build guides.

### Upgrades
- Windows: the installer moves from `%LOCALAPPDATA%\Nimay\OMPBridge` to `%LOCALAPPDATA%\Nimay OMP Chat\Bridge` and migrates `config.json` and `omp-bin.txt`, so the pairing token survives and the phone stays paired.
- Linux: the `Nimay OMP Chat-bridge` package conflicts with and replaces `nimay-ompbridge`; the installer removes the old systemd unit and migrates the config.

### Fixed
- The Android build no longer risks a stale inlined `BuildConfig.VERSION_NAME` / `VERSION_CODE` after a version bump â€” CI now performs a clean build.

## 2.9.27 â€” Two-way provider sync

**Bridge 2.9.27 Â· Android 4.2.5 (`versionCode 215`) Â· tag `v2.9.27`**

### Added
- **Two-way provider synchronisation.** The app pulls providers from the PC when it connects and can push added, edited and deleted providers with **Sync**.
- Incoming API keys are stored in the Android Keystore.
- Visual preferences (favourites, hidden models, test state, model list, enabled state) stay on the device.
- Offline and failed syncs keep the local changes and notify the user.
- New provider ids are derived from the provider name, so the PC and the app reference the same entry.

### Added â€” release engineering
- One GitHub release for every platform: Windows installer, `.deb`, `.rpm`, Flatpak bundle, universal tarball and signed Android APK, plus a `SHA256SUMS` file covering all of them.
- Packaging moved into committed scripts so CI and local builds share one code path.
- `stable-beta` prerelease tracks the newest validated build.

### Verified
- End-to-end provider sync against a real PC bridge: pull on connect, manual sync, push of add/edit/delete, key stored in the Keystore, and `models.yml` byte-identical after add and delete.
- Clean installs on Windows, Debian/Ubuntu and via the Linux tarball, including service setup and uninstall.
- APK signature matches the published release, so the new APK installs as an update.

