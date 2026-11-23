# Install OMP Desktop and Chat OMP OMP

## Windows

Use Windows 10 or 11. Install [Node.js](https://nodejs.org/) 22 or newer, [Oh My Pi](https://github.com/can1357/oh-my-pi), and optionally [Git](https://git-scm.com/). Confirm that `node --version` and `omp --version` work in a new terminal.

Run the [Bridge installer](https://github.com/megaxenon83-server/ompbridge/releases/latest). It installs for the current user under `%LOCALAPPDATA%NimayOMPBridge`, starts Bridge immediately, and enables startup at Windows sign-in by default. You can also use **Start OMP Bridge** from the Start menu.

Allow Node.js on the private network that Windows and Android will use. New installs and upgrades listen locally at `http://127.0.0.1:27778`.

## Pair Android

1. Extract the Desktop ZIP and open `OMP Desktop.exe`.
2. Open **Innstillinger → Tilkobling** (Settings → Connection), connect to Bridge, and select **Vis QR-kode** (Show QR code). Select the PC address your phone can reach.
3. Install the APK on Android 8.0 or newer. Android may ask you to allow installation from the browser or file manager that opened the file.
4. Open Chat OMP OMP, select **Skann QR-kode** (Scan QR code), and confirm. The one-time code expires in two minutes.

## Verify ADB device control

Open **Enheter** (Devices) in Desktop or **Enheter og ADB** (Devices and ADB) on Android. The panel checks whether ADB runs on Windows, which devices respond, and whether the Android app can confirm its own device through ADB. Use the install action if Windows needs SDK Platform Tools. On Android, turn on USB or wireless debugging in Developer options and approve the PC.

## Upgrade and troubleshoot

Let active OMP work finish before upgrading. The installer preserves existing configuration at the default installation path. Stop any separate Bridge installation using the same port before running the installer.

For startup failures, check `bridgeridge.stderr.log` under the installation directory. For connection problems, verify that the PC is awake, the address is reachable from Android, and Windows allows traffic on the private network.

Uninstall **OMP Bridge for Chat OMP OMP** from Windows Settings. This stops Bridge and removes its startup shortcut while preserving configuration and OMP projects.
