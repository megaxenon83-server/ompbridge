# Architecture

OmniDesk is two components that talk to each other over a local network:

```
┌───────────────────────────── PC ───────────────────────────────┐
│                                                                    │
│  ~/.omp/agent/models.yml                                          │
│         │                                                          │
│         │ read / write                                             │
│         ▼                                                          │
│  OmniDesk Bridge  (bridge/omp-bridge.mjs, Node.js ≥ 20, no deps)   │
│    ├── HTTP + SSE API  (:7777, bearer token)                       │
│    ├── provider sync   (/api/omp/providers)                        │
│    ├── session manager (one OMP process per project folder)       │
│    ├── file + terminal API                                         │
│    └── Android APK distribution (/apk)                             │
│         │                                                          │
│         │ spawn: `omp --mode rpc` (newline-delimited JSON)        │
│         ▼                                                          │
│      OMP / Oh My Pi                                                │
└────────────────────────────────────────────────────────────────────┘
                 ▲
                 │  HTTP + SSE over LAN or Tailscale
                 │  Authorization: Bearer <pairing token>
┌────────────────┴───────────────────────────────────────────────────┐
│  OmniDesk (Android, Kotlin + Jetpack Compose)                      │
│    ├── chat, tool calls, approval prompts                          │
│    ├── provider editor (pull + push)                               │
│    ├── file browser, terminal, Git, tasks                          │
│    └── Android Keystore (API keys, pairing token)                 │
└────────────────────────────────────────────────────────────────────┘
```

## The bridge

`2.9.26-bridge/bridge/omp-bridge.mjs` is a single ESM file with **no third-party dependencies**. It only needs Node.js 20 or newer.

Responsibilities:

1. **Session manager.** For every project folder the app opens, the bridge spawns one `omp --mode rpc` process, keeps it warm and reuses it for the next request. Session files are written by OMP itself under `~/.omp/agent/sessions/`.
2. **Event normaliser.** OMP emits newline-delimited JSON. The bridge converts that into Server-Sent Events the app can consume, and translates host tool calls into approval requests.
3. **Provider sync.** Reads and writes `~/.omp/agent/models.yml`, the file OMP itself uses.
4. **File and terminal API.** Serves directory listings, file reads/writes and terminal sessions for the app.
5. **Authentication.** Every endpoint except the public APK download requires `Authorization: Bearer <token>`. The token is generated on first start and stored in `bridge/config.json` (mode `600`, git-ignored).

### Configuration

`bridge/config.json` next to `omp-bridge.mjs`:

| Field | Meaning |
|---|---|
| `port` | TCP port, default `7777` (override with `OMPCHAT_BRIDGE_PORT`) |
| `host` | Bind address, default `0.0.0.0` so the phone can reach it |
| `token` | Pairing token, generated on first start |
| `approvalMode` | `always-ask`, `ask-on-writes` or `allow-all` |
| `allowBash` | Allow bash tool calls from the app |
| `projectRoots` | Extra folders exposed to the app |
| `maxChildren` | Maximum number of concurrent OMP processes |
| `idleMinutes` | How long an idle session is kept warm |

## The Android app

`android-source/nimayomp-chatgpt-ui-4.2.3/` is a Kotlin app built with Jetpack Compose. Two product flavours exist:

| Flavour | Application id | Status |
|---|---|---|
| `classic` | `com.omp.chat` | Original UI, still buildable |
| `chstgpt` | `com.omp.chat.superpremium` | The shipped app — ChatGPT-inspired UI |

The application id is kept stable across releases so new APKs install as updates over existing ones.

### Where the app stores what

| Data | Location |
|---|---|
| API keys received from the PC | Android Keystore (encrypted by the platform) |
| Pairing token | Android Keystore / encrypted preferences |
| Provider list, favourites, hidden models | App-private storage |
| Chat sessions | **Not stored by the app** — they live on the PC, OMP owns them |
| Settings, theme, language | App-private storage |

The app deliberately keeps no chat content of its own: conversations are read from and written to the PC.

## OMP integration

The bridge talks to OMP exactly like the OMP CLI does:

- `omp --mode rpc` — newline-delimited JSON on stdin/stdout.
- Slash commands (`/ompqr`, `/ompserver`, `/ompchat-shared`) live in `2.9.26-bridge/commands/` and are installed into `~/.omp/agent/commands/` by the installer. `/ompqr` renders a QR code that points at the bridge, so pairing works without typing an IP address.
- `~/.omp/agent/ompchat-commands.json` points OMP at the installed bridge, so commands and the app always agree on which bridge is in use.

## Platform integration

| Platform | How the bridge runs | Autostart |
|---|---|---|
| Windows | Per-user install in `%LOCALAPPDATA%\OmniDesk\Bridge`, started by a Startup-folder shortcut | Yes, at logon |
| Linux (deb/rpm/tarball) | `systemd --user` unit `omnidesk-bridge` with linger enabled | Yes, at boot |
| Flatpak | `flatpak run com.omnidesk.bridge`, launcher copies the payload into the sandbox | GNOME autostart key + optional user unit |

See [`INSTALL.md`](INSTALL.md) for the details of each variant.
