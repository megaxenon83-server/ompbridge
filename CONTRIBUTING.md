# Contributing

Thanks for helping out. Nimay OMP Chat is a two-part project: a Node.js bridge for the PC and a Kotlin/Compose app for Android.

## Getting started

```bash
git clone https://github.com/megaxenon83-server/ompbridge.git
cd ompbridge
```

Build everything locally before you push:

```bash
# bridge
node 2.9.26-bridge/bridge/omp-bridge.mjs --port 7777

# Linux packages
bash 2.9.26-bridge/packaging/build-linux-packages.sh 2.9.28 dist

# Android
cd android-source/nimayomp-chatgpt-ui-4.2.3
$env:ANDROID_HOME='C:\android'   # or export ANDROID_HOME=/path/to/sdk
./gradlew :app:assembleChstgptRelease
```

Details and version bumps: [`docs/BUILDING.md`](docs/BUILDING.md).

## Guidelines

- **Keep the bridge dependency-free.** It only needs Node.js 20 and the standard library.
- **Never commit secrets.** API keys, pairing tokens, `bridge/config.json` and the release keystore stay out of the repository. The CI expects the keystore in GitHub Actions secrets.
- **Keep app-local preferences local.** Provider fields come from the PC; favourites, hidden models and test state stay on the device.
- **Follow the existing structure.** Compose UI in `app/src/chstgpt/java/com/omp/chat/ui/chstgpt/`, shared code in `app/src/main/`, bridge code in `2.9.26-bridge/bridge/omp-bridge.mjs`.
- **Bump versions in all the places listed in `docs/BUILDING.md`** when you change a version number.
- **Write user-facing text in both Norwegian and English.** The app has an in-app language switch; both languages live side by side in `ui/Strings.kt`.
- **Add a changelog entry** for user-visible changes.

## Pull requests

1. Fork the repository and create a branch from `main`.
2. Make your change, and describe the problem it solves.
3. Run the build for the parts you touched.
4. Open a pull request against `main` and fill in the template.

Use the `bug_report.yml` and `feature_request.yml` issue templates for issues.

## Reporting bugs

A good report includes:

- Nimay OMP Chat version (bridge version in **Settings â†’ PC and bridge**, app version in **Settings â†’ About**),
- operating system and phone model,
- what you expected and what happened,
- the bridge log if the problem is on the PC side.

You can fetch the bridge log from **Settings â†’ Diagnostics â†’ Fetch log** in the app.

