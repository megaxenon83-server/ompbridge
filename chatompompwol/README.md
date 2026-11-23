# Wake-on-LAN for Chat OMP OMP

Run `chatompompwol` on an always-on Linux Docker host on the same LAN as the PC you want to wake. For example, use a NAS with Linux host networking or a Raspberry Pi. The relay needs to stay online after the target PC shuts down.

1. In this folder, create an `.env` file. Set `WOL_BIND` to the relay host's LAN IPv4 address and `WOL_TOKEN` to a random secret. You can generate a secret with `openssl rand -hex 32`. If your Docker host has multiple network adapters, set `WOL_BROADCAST` to the broadcast address for the target LAN, such as `192.168.1.255` on a `/24` network.
2. Run `docker compose up -d --build`. Allow TCP 27779 from your LAN or private VPN. Avoid forwarding the port on a public router. Use HTTPS via a private reverse proxy when the connection crosses an untrusted network.
3. Add the following `wol` entry to the target PC's installed Bridge configuration in `bridge/config.json`. Use the relay host's address and the same relay secret. Set `allowShutdown` to `true` if you want to shut down this PC from Android.

   ```json
   {
     "wol": {
       "relayUrl": "http://192.168.1.50:27779",
       "relayToken": "REPLACE_WITH_YOUR_RANDOM_SECRET",
       "allowShutdown": true
     }
   }
   ```

4. Restart Bridge. In OMP Desktop, show a mobile pairing QR code and select the target PC's wired LAN address. Scan it in Chat OMP OMP. The encrypted pairing transfers the MAC address and relay settings for that PC automatically. For a PC with several adapters, add a `mac` field to the `wol` entry if the address used for pairing differs from the Ethernet adapter that wakes the PC.
5. In Android, select the PC and open **Wake-on-LAN** next to **Innstillinger** in the sidebar. **Vekk PC** sends the magic packet. **Slå av PC** requires confirmation and a reachable Bridge.

Enable Wake-on-LAN in the target PC's UEFI and network-adapter settings. Waking from full shutdown depends on the hardware and power settings. If it works from sleep only, check whether the adapter remains powered after shutdown and whether Windows Fast Startup affects the hardware.
