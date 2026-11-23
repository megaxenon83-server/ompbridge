# Wake-on-LAN for Chat OMP OMP

Run `chatompompwol` on an always-on Linux Docker host on the same LAN as the PC you want to wake. For example, use a NAS with Linux host networking or a Raspberry Pi. The relay needs to stay online after the target PC shuts down.

1. Run `docker compose up -d --build` once. The relay selects the default network adapter and stores a generated key in a Docker volume. If your Docker host needs another adapter, set `WOL_BIND` to its LAN IPv4 address in `.env`. For an existing installation, keep its `.env` so currently paired phones still work.
2. On each Windows PC, install OMP Desktop 0.8.13 and Bridge 2.9.45 or newer. Connect the PC by Ethernet. Open **Innstillinger → Wake-on-LAN**, select the relay, then click **Koble til og vis QR-kode**. If discovery fails, paste the relay's local IP address. Enable shutdown only if you want that action on the phone.
3. Scan the code in Chat OMP OMP. Open **Wake-on-LAN** next to **Innstillinger** in the sidebar. Test **Vekk PC** while the PC is on before testing from shutdown.

Discovery uses UDP 27779 and the relay API uses TCP 27779. Keep these on a trusted LAN. If you use Tailscale away from home, configure access to the relay's LAN address through a subnet route. Initial enrollment checks that the Windows PC's selected Ethernet MAC matches the relay's local neighbor entry.

Enable Wake-on-LAN in the target PC's UEFI and network-adapter settings. Waking from full shutdown depends on the hardware and power settings. If it works from sleep only, check whether the adapter remains powered after shutdown and whether Windows Fast Startup affects the hardware.
