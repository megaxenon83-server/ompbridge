---
name: device-control
description: Use the omp_device tool to inspect or interact with the active Windows window or an authorized Android device over ADB.
---

Use `omp_device` when a user asks to inspect or operate their own Windows or Android interface. Every tool call asks the user to approve exactly one operation. Explain the next action and wait for approval. A rejected request ends that action.

On Android, use `apps` to identify launcher packages and `open` with the exact package name to start a launcher app. Use a fresh screenshot to locate a button before sending a tap. The paired app and Android debugging have separate authorizations.

For Windows, ask the user to bring the target window to the foreground. Use `foreground` to get its title, then pass that exact title to later operations. Confirm from Android to keep focus on Windows, or switch back to the named window just after approving on Windows. Use `screen` before clicking unknown coordinates. Coordinates are relative to the target window from 0 to 1.

For Android, the device or emulator must already be visible as one authorized device in Android Debug Bridge on the PC. Use `screen`, `tap`, `type`, and the named navigation keys supported by the tool. Recheck the screen after navigation.

Screen images become model context. Keep sensitive screens out of scope. Do not enter credentials, approve security prompts, make purchases, or send messages on the user's behalf through this skill.
