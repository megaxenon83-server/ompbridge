# OMP Desktop — native Compose client (fase 14a)

Native **Compose Multiplatform Desktop** client for OMP Bridge. It replaces the
Electron app in `clients/` with the same design language as the Android app in
`android-native/`, and talks to **OMP Bridge over HTTP/SSE** — it never spawns
its own OMP process.

```
┌──────────────────────────┐        HTTP + SSE         ┌───────────────────────┐
│  OMP Desktop (Compose)   │ ────────────────────────► │  OMP Bridge :27778    │
│  desktop-native/         │ ◄──────────────────────── │  windows/bridge/      │
└──────────────────────────┘      /api/events          └──────────┬────────────┘
                                                                  │ stdio RPC
                                                            ┌─────▼─────┐
                                                            │  omp.exe  │
                                                            └───────────┘
```

## Status — fase 14a spike

Working against bridge v2.9.87:

- [x] Connect by reading the bridge's `config.json` (port + token), or paste a
      pairing link (`omp2://…`, `http://ip:port|token`, `chatomp://pair/…`
      with the AES-GCM ticket exchange, JSON).
- [x] Session list (`GET /api/sessions?archived=1`) with the Android grouping:
      Active / Unread / Pinned / Today / Yesterday / Last 7 days / Older.
- [x] Chat history (`GET /api/session/messages?file=…`), Markdown rendering,
      tool rows, collapsible reasoning.
- [x] Live streaming (`GET /api/events?cwd=&file=`) — `message_start`,
      `message_delta` (text + thinking), `tool_*`, `agent_end`, `state`.
- [x] Send + abort (`POST /api/prompt`, `POST /api/abort`), optimistic user
      bubble, auto title for new chats (`POST /api/sessions/name`).
- [x] Context meter from `state.contextUsage` (tokens / contextWindow), same
      3 dp bar, amber at 60 %, red at 85 %.
- [x] 13 themes (identical palettes to `android-native/Theme.kt`) and
      Norwegian/English (`Lang.kt` pattern, `t(nb, en)`).
- [x] Approvals/questions (`ui_request` → `POST /api/ask`): confirm, select,
      input, multi-question.
- [x] Model + reasoning level picker (`GET /api/models`, `POST /api/model`).
- [x] Portable `.exe` via jpackage (`createDistributable`).

Not in this spike (fase 14b+): file browser, git panel, terminal, ADB, voice,
Wake-on-LAN, plugins/skills screen, QR scanning, turn cards / project checks.

## Verified (2026-11-27, bridge v2.9.87)

Run as a packaged build (`createDistributable`) against the live bridge on
127.0.0.1:27778:

| Check | Result |
| --- | --- |
| Auto-connect from `config.json` | `Live · v2.9.87` pill, token never shown |
| Session list + grouping | 40+ chats, Active/Today buckets, pinned/unread dots |
| Open a chat | history + `state.contextUsage` → meter `9K / 1.0M tok` |
| Live SSE turn | streaming text, reasoning card, tool rows, `10 tok/s` |
| New chat | project list from `/api/projects`, new file created |
| Send prompt | typed in composer, Enter → user bubble → answer `OK` |
| 13 themes / NB-EN | theme picker renders all palettes, language chips |

![Chat with a streamed answer](docs/fase14a-chat.png)
![Live turn with tool rows and the context meter](docs/fase14a-streaming.png)
![The 13 themes](docs/fase14a-themes.png)

The test session used for the send check was archived afterwards and the
project runtime was switched back to the user's own chat.

## Build and run

Requirements: JDK 17 and Gradle 8.9 (the machine paths are pinned in
`build.ps1`, change them there if yours differ).

```powershell
cd desktop-native
.\build.ps1 run                    # start from source
.\build.ps1 :app:createDistributable   # portable app-image with OMP Desktop.exe
.\build.ps1 :app:packageExe        # jpackage .exe installer (downloads WiX)
.\build.ps1 :app:packageMsi        # jpackage .msi installer
```

Built artifacts from fase 14a:

- portable: `app/build/compose/binaries/main/app/OMP Desktop/OMP Desktop.exe` (118 MB folder)
- installer: `app/build/compose/binaries/main/exe/OMP Desktop-1.14.0.exe` (58 MB)

Without the helper script:

```powershell
$env:JAVA_HOME = "C:\Prosjekter\Inkling\tools\jdk-17.0.20.101-hotspot"
C:\Prosjekter\Inkling\tools\gradle-8.9\bin\gradle.bat -p . :app:run
```

The packaged app-image ends up in
`app/build/compose/binaries/main/app/OMP Desktop/OMP Desktop.exe`.

## Configuration

The app looks for a bridge token in this order:

1. saved pairing in `%LOCALAPPDATA%\OMPDesktop\settings.json`,
2. `%LOCALAPPDATA%\Nimay\OMPBridge\bridge\config.json` (the normal install),
3. `%APPDATA%\Nimay\OMPBridge\bridge\config.json`,
4. `%ProgramFiles%\Nimay\OMPBridge\bridge\config.json`,
5. `windows\bridge\config.json` relative to the working directory,
6. a pairing link pasted into the connect screen.

`host: 0.0.0.0` in the bridge config is treated as `127.0.0.1`.

## Source map

| File | Mirrors | Purpose |
| --- | --- | --- |
| `Main.kt` | `MainActivity.kt` | Window, theme + language providers |
| `Theme.kt` | `Theme.kt` | 13 palettes, identical hex values |
| `Lang.kt` | `Lang.kt` | `AppLang`, `LocalLang`, `t(nb, en)` |
| `Models.kt` | `Models.kt` | `SessionInfo`, `Entry`, `StreamState`, `ModelInfo` |
| `BridgeClient.kt` | `BridgeClient.kt` | OkHttp JSON + okhttp-sse stream, bearer auth |
| `ChatViewModel.kt` | `AppViewModel.kt` | State holder: sessions, streaming, context, approvals |
| `Markdown.kt` | `Markdown.kt` | Markdown → AnnotatedString, unchanged |
| `Screens.kt` | `Screens.kt` + `Screens2.kt` | Connect, sidebar, chat, composer |
| `Dialogs.kt` | `Screens.kt` sheets | Approval, theme, model, new chat, settings |
| `Prefs.kt` | `BridgeClient` prefs | Desktop settings as one JSON file |
| `BridgeConfig.kt` | `pair()` | config.json discovery + pairing links |

Desktop differences, on purpose:

- the session drawer is a permanent left rail instead of a hamburger drawer,
- bottom sheets are dialogs,
- Enter sends, Shift+Enter makes a new line,
- window size and drafts are remembered between runs.

## Verification

Bridge endpoints exercised by the spike:

```
GET  /api/health              version + runtimes
GET  /api/sessions            ?archived=1
GET  /api/session/messages    ?file=
GET  /api/state               ?cwd=   (contextUsage, model, thinkingLevel)
GET  /api/events              SSE, ?cwd=&file=
POST /api/prompt              {cwd, file, text, thinking}
POST /api/abort               {cwd, file}
POST /api/ask                 {cwd, id, confirmed|value|answers|cancelled}
GET  /api/models              ?cwd=
POST /api/model               {cwd, file, provider, modelId}
POST /api/sessions/new        {cwd}
POST /api/sessions/name       {file, cwd, name}
POST /api/sessions/archive    {file, archived}
GET  /api/projects
```

The bridge in `windows/bridge/` is **not** modified by this phase, and neither is
`android-native/`.
