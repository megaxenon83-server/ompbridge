# Frequently asked questions

### Does my Windows PC need to be on?

Yes. Keep it awake, signed in, and reachable from Android. Bridge starts automatically at Windows sign-in by default.

### How do I continue a conversation on my phone?

Use a shared conversation in OMP Desktop. Open the conversation list in Chat OMP OMP and choose the same thread. Active conversations appear at the top, with requests that need your input first.

### Can I rename, archive, or restore a conversation?

Long-press the conversation on Android or use its **⋯** menu. You can rename it, archive it, or move it to the trash. The archive button in the sidebar opens the restore options. Changes are shared with Desktop.

### What does the Git panel do?

The working diff shows unstaged changes. Staging selects changes for the next commit. Unstaging preserves the edits in your working directory. New project folders made from Android use Git tracking when Git is available. A subfolder inside an existing repository uses that repository.

### How do I copy a message or listen to it?

Use the copy or speaker icon below the message. The speaker changes to a stop icon during playback. Read-aloud uses a local system voice.

### How do I import skills?

Open **Innstillinger → Plugins → Utforsk skills** (Settings → Plugins → Explore skills) in OMP Desktop. The localhost page opens for the selected project. Pick recommended items or paste links from skills.sh, inspect the Markdown and pinned revisions, and choose **Project** or **Global**. Global skills are available to shared projects on the same Bridge, with a project-level override. Imports start disabled.

Use **Installed** to inspect the loaded revision, preview an update, roll back, or open an editable example with **Try in OMP**. The lockfile records reusable project settings. Review the restore preview before applying it.

### How do I verify a plugin or see token usage?

Enable a bundled project plugin and choose **Test plugin** in Desktop or Android. The result shows whether OMP registered its tool and whether its self-test passed. The conversation header has a token meter with input, output, cache, and most recent model-call totals reported by OMP.

### How does Device Control work?

In a shared project, enable **Enhetsstyring** (Device Control) under **Plugins** and ask OMP for a specific action. Approve each action in the client. For Android, connect and authorize exactly one ADB device or emulator. The Devices panel checks whether the Android app can confirm its own device through ADB. Approved screenshots go to the model selected for the conversation.

### Do model keys go on the phone?

Configure providers in OMP on Windows. Android pairs with Bridge using the QR code from Desktop.

### Can I connect away from home?

Use a trusted VPN that can reach the Windows PC. Keep the Bridge port off the public internet.

### Does this APK replace the old Nimay app?

Chat OMP OMP has its own Android package. Install and pair it separately. Existing OMP conversations stay on the PC.
