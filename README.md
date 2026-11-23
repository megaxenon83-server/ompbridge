# OMP Desktop and Chat OMP OMP

![OMP Desktop and Chat OMP OMP connected across Windows and Android](docs/assets/omp-banner.png)

Use Oh My Pi on Windows and continue the same project conversation on Android. OMP Bridge connects both clients to the projects and model configuration on your PC.

[Project website](https://megaxenon83-server.github.io/ompbridge/) · [Latest release](https://github.com/megaxenon83-server/ompbridge/releases/latest) · [FAQ](docs/FAQ.md)

## Downloads

| Component | What it does |
| --- | --- |
| [OMP Bridge 2.9.44 for Windows](https://github.com/megaxenon83-server/ompbridge/releases/download/omp-desktop-0.8.12/OMP-Bridge-Setup-2.9.44.exe) | Connects Windows and Android. Starts automatically when you sign in to Windows. |
| [OMP Desktop 0.8.12 Windows installer](https://github.com/megaxenon83-server/ompbridge/releases/download/omp-desktop-0.8.12/OMP-Desktop-Setup-0.8.12-win-x64.exe) | Installs and upgrades the desktop app. Optional desktop shortcut and sign-in launch. |
| [OMP Desktop 0.8.12 for Windows x64](https://github.com/megaxenon83-server/ompbridge/releases/download/omp-desktop-0.8.12/OMP-Desktop-0.8.12-win-x64.zip) | Run OMP in project workspaces, preview changes, and pair Android with a one-time QR code. |
| [Chat OMP OMP 0.2.13 for Android](https://github.com/megaxenon83-server/ompbridge/releases/download/omp-desktop-0.8.12/Chat-OMP-OMP-Android-0.2.13.apk) | Continue conversations, review edits, and manage project folders from your phone. |

## Get started

1. Install Node.js 22 or newer and [Oh My Pi](https://github.com/can1357/oh-my-pi) on Windows. Install Git to use Git tracking and review.
2. Run the Bridge installer. New installs and upgrades use port **27778**. Upgrades preserve the pairing credential. Re-pair Android if the port changed.
3. Extract OMP Desktop and open **Innstillinger → Tilkobling → Vis QR-kode** (Settings → Connection → Show QR code). Choose the PC address that your phone can reach.
4. Install the APK, open Chat OMP OMP, and scan the code from the same trusted network or VPN.

## Automatic startup

In OMP Desktop, open **Settings → General** to enable automatic launch when you sign in to Windows. Android connects directly to Bridge, so Desktop can remain closed.

## Wake-on-LAN

The Wake-on-LAN button beside Settings in the Android sidebar opens controls to wake or shut down a paired PC. The encrypted QR pairing supplies the PC's MAC address and relay configuration. Install the [chatompompwol relay](chatompompwol/README.md) on a Linux host that remains online on the same LAN.

Set the relay address and token in Bridge once. OMP Desktop 0.8.12 has no Wake-on-LAN setup form. In Desktop, choose the PC's wired LAN address and display a fresh QR code. Android imports the settings when you scan it.

Shutdown and wake were confirmed from Android on a physical Windows PC. The app confirms when the relay sends the wake packet. Boot progress, Bridge reachability and OMP readiness are not displayed yet.

## What changed in 0.8.9

- Android saves multiple PCs. Use the PC picker to switch between them or rename a connection. Each PC has its own project list, chats, and drafts.
- Bridge 2.9.42 standardizes new installs and upgrades on port 27778. Upgrades keep the pairing credential.

## What changed in 0.8.8

- Android now offers Chat, Plan, Build, and Light Context for shared conversations.
- Bridge avoids a separate Ollama warm-up request and reports local model preparation. Windows setup distinguishes port conflicts from active tasks.
- Desktop refreshes local Bridge credentials after a connection failure and offers an installer and a Windows sign-in setting.

## What changed in 0.8.7

- Desktop uses a compact mode picker on the right of the composer and keeps the message field full width. Stop takes the place of Send while OMP runs.
- Android shows its installed version in Settings, has a muted navy launcher icon, and updates its animated activity indicator from live OMP events.

## What changed in 0.8.5

- Added optional local voice conversations in Norwegian and English. Both clients use the speech pack on the Windows host.
- Speak during playback to interrupt a reply and submit a follow-up.
- Desktop adds Chat, Plan, and Build modes for shared conversations and a Light Context switch.
- Bridge frees a supported local chat model before loading its replacement. Android shows an animated progress indicator while OMP works.
- Automated interruption, local speech processing, and Android emulator microphone checks passed. Full microphone conversations on physical devices are pending.

## What changed in 0.8.4

- Fixed Windows Device Control keyboard input. Verified typing and clicking in a dedicated Windows test window, and opening and navigating Android Settings through ADB in an emulator.
- Moved copy and read-aloud icons below the message in both clients.
- The Skills page accepts copied skills.sh install commands, confirms valid sources, and marks installed entries. Activation uses switches.
- Skills discovered by OMP have global and conversation-level controls. The skill test checks whether OMP registered the skill in that conversation. Built-in plugin tests report what they checked and how long it took.

## Work across both devices

- Follow active conversations, continue the same thread, and share registered project folders. Create a Windows project folder from Android with the graphical folder picker.
- Review changes with per-file added and removed line counts, diffs, and undo. Preview a local web project and share test results with Android.
- Copy or read messages aloud using the icons below each message. Follow OMP’s live task list during a turn.
- Manage OMP skills, tools, and MCP servers. Enable **Agent Memory**, **Project Status MD**, **Git Overview**, and **Device Control** per shared project.
- Open **Explore skills** from Desktop Settings to preview and batch-install Markdown from pinned GitHub revisions. Paste a skills.sh link or its copied install command, preview the source, and see which skills are already installed. Choose project or global scope, review updates, roll back, and save reusable packs or a project lockfile.
- Check ADB and confirm whether Windows can reach the phone displaying the status. Device Control can open apps, capture a screen, and send input with approval for each action.

[Installation](docs/INSTALL.md) · [Project panel](docs/PROJECT-PANEL.md) · [FAQ](docs/FAQ.md) · [Security](SECURITY.md) · [Build the installer](docs/BUILDING.md)

Use Bridge on a trusted private network or VPN. Keep the Bridge port off the public internet.
