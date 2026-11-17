# Security policy

## Reporting a vulnerability

Please report security issues privately. Do not open a public issue for a vulnerability you have found.

Use GitHub's private vulnerability reporting for this repository (Security → Report a vulnerability), or contact the maintainer directly.

Include:

- what the issue is and how it can be reproduced,
- the affected component (bridge, Android app, installer, packaging),
- the version you tested.

You will get an acknowledgement within a few days and a fix or a mitigation plan once the report is confirmed.

## Security model

### The bridge

- The bridge binds to `0.0.0.0` so the phone can reach it on the LAN. **Do not expose the port to the internet.** Use a trusted network or a VPN such as Tailscale.
- Every endpoint except the public APK download (`/apk`) and the discovery endpoint (`/api/ping`) requires `Authorization: Bearer <token>`.
- The token is generated with a cryptographically secure random source on first start and stored in `bridge/config.json` with file mode `600`. The file is git-ignored.
- `bridge/config.json` is created next to the bridge, never in the repository. Do not commit it.

### API keys

- The PC keeps API keys in `~/.omp/agent/models.yml` in plain text — that is how OMP works. Protect the file with normal filesystem permissions.
- The Android app stores received keys in the **Android Keystore**, encrypted by the platform, and never writes them to a readable file.

### Release signing

- The Android release keystore is stored as an encrypted GitHub Actions secret. It is never committed to this repository.
- Back up the keystore and its passwords somewhere safe. Losing them means the app can no longer be updated in place — new installs would need a different package id.

### Dependencies

- The bridge has no third-party npm dependencies.
- The Android app uses AndroidX, Jetpack Compose, Retrofit/OkHttp, Gson and the ZXing scanning library.

## Hardening tips

- Run the bridge on a user account, not as root or SYSTEM.
- Use Tailscale or a firewall rule if the PC is on a shared network.
- Rotate the pairing token by deleting `bridge/config.json` and restarting the bridge, then re-pair the phone.
- Keep the app's Keystore-protected credentials intact when you change devices — re-pair instead of copying app data.
