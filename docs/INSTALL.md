# Installation

Everything is published on the [releases page](https://github.com/megaxenon83-server/ompbridge/releases). Every release contains a `SHA256SUMS` file that covers all artifacts; the universal tarball and the Android APK also ship an individual `.sha256` file.

Verify a download with:

```bash
sha256sum -c SHA256SUMS --ignore-missing
```

## Requirements

| | |
|---|---|
| PC | Windows 10+, or a modern Linux distribution with `systemd --user` |
| Runtime | Node.js 20 or newer on the PC |
| Agent | [OMP (Oh My Pi)](https://github.com/oh-my-pi) installed and on `PATH` (or `OMP_BIN` set) |
| Phone | Android 7.0 (API 24) or newer |
| Network | PC and phone on the same LAN, or connected through Tailscale |

---

## Windows

1. Download `Nimay OMP Chat-Bridge-Setup-<version>.exe`.
2. Run it. The installer is per-user: no administrator rights, no Windows service, nothing under `Program Files`.
3. It installs to `%LOCALAPPDATA%\Nimay OMP Chat\Bridge`, adds a Startup-folder shortcut, writes the OMP slash commands to `%USERPROFILE%\.omp\agent\commands` and starts the bridge.

The bridge listens on port `7777` by default. To use another port, set `OMPCHAT_BRIDGE_PORT` before starting it.

Uninstalling from Windows Settings removes the files, the shortcut and the installed commands.

## Linux â€” Debian / Ubuntu

```bash
sudo dpkg -i Nimay OMP Chat-bridge_<version>_amd64.deb
Nimay OMP Chat-bridge-install --local
```

The second command installs the files into `~/.local/share/Nimay OMP Chat/bridge`, creates the `Nimay OMP Chat-bridge` systemd **user** service, enables linger so it starts at boot, and installs the OMP slash commands.

## Linux â€” Fedora / RHEL

```bash
sudo rpm -i Nimay OMP Chat-bridge-<version>-1.x86_64.rpm
Nimay OMP Chat-bridge-install --local
```

## Linux â€” universal tarball

```bash
tar -xzf Nimay OMP Chat-bridge-linux-x86_64.tar.gz
cd Nimay OMP Chat-bridge
./install.sh                 # downloads the release payload again
./install.sh --local         # installs the files next to this script
./install.sh uninstall       # removes the user installation
```

## Linux â€” Flatpak

```bash
flatpak install com.Nimay OMP Chat.bridge-<version>.flatpak
flatpak run com.Nimay OMP Chat.bridge
```

The Flatpak sandbox needs the freedesktop 24.08 runtime and the Node 20 SDK extension; Flatpak installs them on demand.

On first start the launcher:

- copies the bridge into `~/.local/share/Nimay OMP Chat-bridge/` (the sandbox itself is read-only),
- installs the OMP slash commands into `~/.omp/agent/commands/`,
- writes `~/.omp/agent/ompchat-commands.json`,
- writes a `systemd --user` unit so you can enable autostart:

```bash
systemctl --user daemon-reload
systemctl --user enable --now Nimay OMP Chat-bridge
```

GNOME users can instead enable **Autostart** for the app in the system settings.

## Android

Install the APK from the release page, or download it straight from the bridge:

```bash
# on the phone, with the PC's LAN address
http://<pc-ip>:7777/apk
```

The page shows a QR code and a download button. Install the APK and allow installation from that source.

The APK is signed with the release key, so it installs as an update over previous versions â€” no uninstall needed.

---

## Pairing

1. Start the bridge on the PC.
2. In the app, open **Settings â†’ Scan QR code**, or run `omp` and then `/ompqr` on the PC to show the QR code on screen.
3. The app stores the address and token and connects automatically from then on.

Manual pairing works too: enter the address (`http://<pc-ip>:7777`) and the token from `bridge/config.json`. A deep link is supported as well:

```
omp2://<pc-ip>:7777?token=<token>
```

## Upgrading

| Platform | How |
|---|---|
| Windows | Run the new installer. The existing config and token are migrated automatically, so the phone stays paired. |
| Linux (deb/rpm) | Install the new package; the `nimay-ompbridge` package is obsoleted automatically. |
| Linux (tarball) | Run `./install.sh --local` again. |
| Flatpak | `flatpak update` or install the new bundle. |
| Android | Install the new APK over the old one. |

