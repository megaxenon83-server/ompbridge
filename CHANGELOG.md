# Changelog

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
