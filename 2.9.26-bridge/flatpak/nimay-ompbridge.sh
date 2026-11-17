#!/bin/sh
# Launcher for the Nimay OMP Bridge Flatpak.
#
# The bridge needs a writable directory next to omp-bridge.mjs (it stores its
# pairing token in config.json) and the real home directory (it reads
# ~/.omp/agent/models.yml, which is the source of truth for providers).
set -e

REAL_HOME="$(getent passwd "$(id -u)" 2>/dev/null | cut -d: -f6 || true)"
if [ -n "$REAL_HOME" ]; then
    export HOME="$REAL_HOME"
fi

DATA_DIR="${XDG_DATA_HOME:-$HOME/.local/share}/nimay-ompbridge"
mkdir -p "$DATA_DIR"

if [ ! -f "$DATA_DIR/bridge/omp-bridge.mjs" ]; then
    cp -r /app/share/nimay/ompbridge/bridge "$DATA_DIR/bridge"
    cp -r /app/share/nimay/ompbridge/tools "$DATA_DIR/tools" 2>/dev/null || true
    cp -r /app/share/nimay/ompbridge/commands "$DATA_DIR/commands" 2>/dev/null || true
    cp /app/share/nimay/ompbridge/install.sh "$DATA_DIR/install.sh" 2>/dev/null || true
fi

exec node "$DATA_DIR/bridge/omp-bridge.mjs" "$@"
