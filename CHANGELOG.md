# Changelog

## OMP Suite 0.3.0 — Fase 1: native Android app

- New native Jetpack Compose app in `android-native/` (package `net.nimay.chatompomp.native`, preview) shipped alongside the stable WebView app.
- Pairing by QR scan (CameraX + ZXing) or pasted link, with a confirmation dialog and AES-GCM credential exchange.
- Conversation drawer with edge swipe, grouped by project; per-session changes side files are filtered out.
- Chat with live SSE streaming, reasoning and tool rows, plus a compact near-black composer that hides the keyboard after sending.
- New conversation from any project (`/api/sessions/new`) and a model picker backed by `/api/models` + `/api/model`.
- Release signing uses the same production keystore as the WebView app (`chat-omp-dev`), so the preview installs alongside it.
- Stable apps unchanged in this release: Bridge 2.9.64, Desktop 0.8.30, WebView Android 0.2.30.

## Bridge 2.9.64 / Desktop 0.8.30 / Android 0.2.30

### Phase 0 fix: composer and settings redesign

- Compact ChatGPT-style composer with a near-black background, discreet border, smaller model picker, smaller microphone and a round send/stop button. The text field grows with the message and is capped at two rows when empty.
- One settings (gear) menu now gathers reasoning level, Light context, chat mode, Plugins and Skills. Light context is a real switch.
- Work status ("OMP tenker" / "OMP arbeider" / tokens per second) is shown directly above the composer with a short fade animation.
- Tool calls, reasoning and status update live in chronological order while OMP works.
- The plug-in/skill toggles are real switches (track + thumb) instead of the raw checkboxes that looked like plain boxes in the Android WebView.
- Removed the blue-grey radial gradient behind the conversation for a smooth, near-black background; the top bar is flat too.
- Empty "0 files changed" cards are no longer shown.
- The task overview collapses to one compact line with progress and only expands on tap.
- Desktop: flat near-black composer, discreet border, and a gear button for Plugins and Skills.

### Phase 0 baseline

- Android: swipe in from the left edge to open the conversation drawer, with a slide-in animation, instead of tapping the corner button.
- OMP Desktop Plugins page regrouped into clear sections (Skills, Prosjektutvidelser, Installerte pakker, Kilder) with short descriptions instead of one mixed list.
- Release automation: every release ships all four installers plus source and checksums.

## Bridge 2.9.63 / Desktop 0.8.29 / Android 0.2.29

### Android/Desktop UI polish (phase 0)

- Skills/plugin toggles are real switches (track + thumb) instead of a CSS pseudo-element that rendered as a plain box in the Android WebView.
- Android: swipe in from the left edge to open the conversation drawer, with a slide-in animation, instead of tapping the corner button.
- OMP Desktop Plugins page regrouped into clear sections (Skills, Prosjektutvidelser, Installerte pakker, Kilder) with short descriptions instead of one mixed list.
- Release automation: the GitHub Actions workflow builds all four installers (Bridge, Desktop installer, portable Desktop ZIP, Android APK), the Android build can sign with the existing release keystore, and every phase ships all apps plus source and checksums.

### Performance and correctness

- Large conversations stay responsive. Both clients rebuilt the whole transcript on every animation frame while OMP streamed, so each frame cost grew with the conversation (~1300 DOM nodes and ~380k characters per frame at a 100k-token context). The list is now reconciled: unchanged rows are kept and only the streaming row is rebuilt.
- The bridge no longer sends a full copy of the streaming message with every token. Snapshots are rate limited and get sparser as the answer grows (a 60k-character answer went from ~450 MB to ~23 MB of streamed JSON).
- Android delivers live frames from Bridge in batches instead of one `evaluateJavascript` call per token on the UI thread.
- Reading a transcript parses only the appended tail instead of the whole JSONL file, and the app-message mapping is memoised.
- The streamed-token newline scanners in Bridge and the desktop SSE client are linear again instead of quadratic.
- Token totals, timeline de-duplication keys and scroll anchors are cached instead of recomputed for every message on every frame.
- Turn-change tracking reuses file hashes by modification stamp and no longer snapshots the whole workspace after every tool call, which used to block the bridge and stall the live stream.
- Security: the terminal WebSocket upgrade now requires the pairing token, the protected-path guard actually matches Windows system folders, and the upload endpoint no longer crashes the bridge on its first chunk.
- Fixed duplicate `POST /api/projects/hide` / `move-session` handlers, which made hiding an auto-discovered project impossible.
- Fixed `git status --porcelain=v2` rename paths, a BOM in a transcript dropping the session record, and a notification de-duplication set that never shrank.
- Fixed an OMP child that outlived a timed-out start and then tore down the replacement runtime.
- A cancelled copy/move now stops instead of continuing and deleting the source.
- Android: Stop works during the first turn of a new conversation.
- Session routes are confined to the sessions folder instead of accepting any absolute path, so a crafted rename/move can no longer rewrite unrelated files.
- "Always allow" records a scoped approval entry instead of flipping the whole bridge into yolo mode.
- Terminal shells are reaped when they exit and killed on bridge shutdown; the WebSocket frame buffer is capped.
- The bridge drops streamed progress while a slow client is congested instead of buffering every token in memory.
- `git` output is capped at 8 MB; the transcript cache and model-catalogue/signature lookups are bounded and memoised.
- Desktop no longer opens two live streams per shared thread, compares session paths case-insensitively, refreshes shared history in linear time, and the Nettleser window blocks downloads.
- Android stops polling while backgrounded, backs off when the live stream drops, prompts for a new QR code on 401, and debounces draft writes (surfacing when they are too large to store).

## Bridge 2.9.62 / Desktop 0.8.28 / Android 0.2.28

- Stop now cancels the local PolyStrata turn, so the model lock is released instead of blocking the next switch.
- A local model that will not unload no longer blocks switching to a cloud model; a local switch still reports the reason.
- Model discovery keeps the local model visible while the engine is unloaded, and the launcher loads an idle server instead of waiting for a request that never comes.
- The remembered local model stays truthful when an unload cannot complete.
- The model server's 409 message is shown in the apps instead of a bare HTTP status.
- A switch back to a local model waits out the brief 409 that can follow a cancel instead of failing.
- PolyStrata compatibility fixes are version-controlled in `integration/polystrata` (upstream `d62dfac`), since the upstream repository is external.

## Bridge 2.9.61 / Desktop 0.8.27 / Android 0.2.28

- Allow a cloud chat and a local chat to run concurrently in the same project.
- Reject a switch to another local model while a local generation has the GPU.
- Keep the Android model picker visible alongside the reasoning control.
- Avoid touching unrelated model servers when switching models.

## Bridge 2.9.60 / Desktop 0.8.26 / Android 0.2.27

- Fixed Windows drive discovery in the Android folder picker.
- Android prompts for a fresh QR code when Bridge rejects a saved pairing.
- Renamed the imported chat group to Oh My Pi chats.

## Bridge 2.9.59 / Desktop 0.8.25 / Android 0.2.26

- Setup offers to download and verify a private Node.js runtime when Node.js 22 or newer is unavailable.
- The current Desktop and Android build sources are available in the repository alongside Bridge and the relay.

## OMP Desktop 0.8.25 / Android 0.2.26 / Bridge 2.9.58

- Keep the visible message or tool output in place while OMP streams, even if earlier content grows.
- Pause automatic scrolling while inspecting expanded reasoning or tool output.
- Jump to the latest message with the down arrow, or scroll to the bottom to resume following.
- This bundle includes Bridge 2.9.58 unchanged.

## OMP Desktop 0.8.24 / Android 0.2.25 / Bridge 2.9.58

- Added per-model reasoning controls beside the model picker in Desktop and Android.
- Kept the live session open during OMP's thinking-loop recovery and display reported retry attempts in the activity indicator.
- Added live generation speed and a breakdown of prompt processing, first-token latency, output, cache, and active context. The clients mark estimated values.
- Deduplicated Windows GPU adapters by LUID and merged NVIDIA temperature, dedicated memory, and utilization readings when the physical adapter can be matched.

## OMP Desktop 0.8.7 · Android 0.2.7 · Bridge 2.9.39

- Desktop moves Chat, Plan, and Build into a compact mode picker and keeps the composer full width.
- Android adds a version label, muted navy launcher icon, and distinct live work states.

## OMP Desktop 0.8.5 · Android 0.2.5 · Bridge 2.9.39

- Added optional Norwegian and English voice conversations with spoken interruption.
- Added Chat, Plan, Build, and Light Context controls for shared conversations in Desktop.
- Shared local model switching now releases the old model before loading the replacement.
- Added an animated Android work indicator.

## OMP Desktop 0.8.4 · Android 0.2.4 · Bridge 2.9.38

- Fixed Windows Device Control typing and key presses. The device self-test checks the Windows foreground window and validates an ADB screenshot.
- Moved copy and read-aloud controls below messages on Desktop and Android.
- The local Skills page accepts copied skills.sh installation commands without running them. It confirms valid sources, marks installed skills, and uses switches for activation.
- Added global skill activation, per-conversation overrides, and checks for skills loaded by OMP. Built-in plugin self-tests report measured duration.

## OMP Desktop 0.8.3 · Android 0.2.3 · Bridge 2.9.37

- Added a localhost Skills page with reviewed batch imports, project and global scopes, project overrides, update previews, rollback, lockfiles, reusable packs, and editable prompts with Try in OMP.
- Redesigned Desktop Plugins, added runnable checks for the bundled project plugins, and refined Android switches.
- Added a conversation token meter and detailed OMP-reported input, output, and cache usage to both clients.

## OMP Desktop 0.8.2 · Android 0.2.2 · Bridge 2.9.36

- Replaced copy and read-aloud text buttons with icons. Aligned Desktop Settings with the conversation toolbar and added consistent switches in both clients.
- Added project switches for Agent Memory, Project Status MD, Git Overview, and Device Control. Plugin and skill choices are shared between Windows and Android.
- Added a skills.sh catalog with preview, GitHub revision verification, and Markdown-only imports that start disabled.
- Added an ADB status panel, Windows Platform Tools installation, and verification that the PC reaches the Android device displaying the status.
- Device Control can list and open Android apps, capture screenshots, and send approved input.

## OMP Desktop 0.8.1 · Android 0.2.1 · Bridge 2.9.35

- Active conversations appear at the top of the sidebar on Windows and Android. Conversations waiting for your input appear first.
- Bridge shares activity status and returns completed conversations to the normal project list.
- Conversations in separate projects can run concurrently when they do not need to unload a model in use.

## OMP Desktop 0.8.0 · Android 0.2.0 · Bridge 2.9.34

- Windows and Android share registered project folders and update the same conversation thread.
- Both clients expose settings for OMP skills, MCP servers, and tools in shared threads.
- Installed plugins can be switched on and off. Device Control adds a skill and a tool for approved screenshots and input.

## OMP Desktop 0.7.2 · Android 0.1.7

- Added copy and read-aloud actions under text messages. Read-aloud uses a local system voice and can be stopped from the message.
- The task list shows completed and remaining OMP tasks below the conversation header and collapses when all tasks are done.

## OMP Desktop 0.7.1 · Android 0.1.6 · Bridge 2.9.33

- Added the Desktop version to the top bar.
- Desktop can read managed llama.cpp configuration with a Windows UTF-8 marker and checks whether the selected server needs a restart.
- Managed llama.cpp models such as Ornith are marked as local. Desktop checks port ownership before stopping a managed server.
- Resizing or opening the project panel updates the preview viewport.
- Ornith 1.5 128K was tested against a local llama.cpp server with 131,072 tokens per session. GPU and batch settings depend on the local configuration.

## OMP Desktop 0.7.0 · Android 0.1.6 · Bridge 2.9.33

- Added a project panel with preview, changes, tests, terminal, and files alongside the conversation.
- Local web projects can be previewed at mobile width. Selected elements can be added to a draft as context.
- Change cards open file diffs. The test panel shows terminal output and exit status.
- Test results can be shared in the same conversation and opened on Android with a QR code.

## OMP Desktop 0.6.1 · Android 0.1.5 · Bridge 2.9.32

- Added a Windows installer with startup at sign-in and port 7778 as the default for new installations.
- Added a separate Android app with a folder picker, shared conversations, archive, and trash.
- Conversation renaming works in both directions between Android and Desktop.
- Added live OMP tasks and per-turn change cards with diffs and undo where supported.
- New project folders created through Bridge use local Git tracking when Git is available.

[Older releases and notes](https://github.com/megaxenon83-server/ompbridge/releases)
