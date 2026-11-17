#!/bin/sh
# Launcher for the Nimay OMP Chat Bridge Flatpak.
#
# The bridge needs a writable directory next to omp-bridge.mjs (it stores its
# pairing token in config.json) and the real home directory (it reads
# ~/.omp/agent/models.yml, which is the source of truth for providers).
set -e

REAL_HOME="$(getent passwd "$(id -u)" 2>/dev/null | cut -d: -f6 || true)"
if [ -n "$REAL_HOME" ]; then
    export HOME="$REAL_HOME"
fi

APP_ID="com.Nimay OMP Chat.bridge"
DATA_DIR="${XDG_DATA_HOME:-$HOME/.local/share}/Nimay OMP Chat-bridge"
mkdir -p "$DATA_DIR"

if [ ! -f "$DATA_DIR/bridge/omp-bridge.mjs" ]; then
    cp -r /app/share/Nimay OMP Chat/bridge/bridge "$DATA_DIR/bridge"
    cp -r /app/share/Nimay OMP Chat/bridge/tools "$DATA_DIR/tools" 2>/dev/null || true
    cp -r /app/share/Nimay OMP Chat/bridge/commands "$DATA_DIR/commands" 2>/dev/null || true
    cp /app/share/Nimay OMP Chat/bridge/install.sh "$DATA_DIR/install.sh" 2>/dev/null || true
fi

# Install the OMP slash commands and the state file, exactly like the deb/rpm
# installer does, so /ompqr and /ompserver also work with the Flatpak.
OMP_DIR="$HOME/.omp/agent"
if [ -d "$DATA_DIR/commands" ]; then
    if mkdir -p "$OMP_DIR/commands" 2>/dev/null; then
        cp -r "$DATA_DIR/commands"/* "$OMP_DIR/commands/" 2>/dev/null || true
    fi
fi
if mkdir -p "$OMP_DIR" 2>/dev/null; then
    cat > "$OMP_DIR/ompchat-commands.json" << EOF
{
  "projectRoot": "$DATA_DIR",
  "bridge": "$DATA_DIR/bridge/omp-bridge.mjs"
}
EOF
fi

# Write a systemd user unit so the bridge can start at login. The unit can
# only be enabled from the host:
#   systemctl --user enable --now Nimay OMP Chat-bridge
SYSTEMD_DIR="$HOME/.config/systemd/user"
if mkdir -p "$SYSTEMD_DIR" 2>/dev/null; then
    cat > "$SYSTEMD_DIR/Nimay OMP Chat-bridge.service" << EOF
[Unit]
Description=Nimay OMP Chat Bridge
After=network-online.target
Wants=network-online.target

[Service]
Type=simple
ExecStart=/usr/bin/flatpak run ${APP_ID}
Restart=on-failure
RestartSec=5
Environment=HOME=%h

[Install]
WantedBy=default.target
EOF
fi

exec node "$DATA_DIR/bridge/omp-bridge.mjs" "$@"

