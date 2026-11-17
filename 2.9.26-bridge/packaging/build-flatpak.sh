#!/usr/bin/env bash
# Builds the Nimay OMP Bridge Flatpak bundle.
#
# Usage: build-flatpak.sh [version] [output-dir]

set -euo pipefail

VERSION="${1:-2.9.27}"
OUT_DIR="${2:-dist}"
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
OUT_DIR="$(mkdir -p "${OUT_DIR}" && cd "${OUT_DIR}" && pwd)"
APP_ID="com.nimay.OMPBridge"

if ! command -v flatpak-builder >/dev/null 2>&1; then
    echo "[build-flatpak] ERROR: flatpak-builder is not installed." >&2
    exit 1
fi

echo "[build-flatpak] Building ${APP_ID} ${VERSION}"
cd "${ROOT}/flatpak"
flatpak-builder --force-clean --disable-rofiles-fuse --repo=flatpak-repo flatpak-build com.nimay.OMPBridge.yml

echo "[build-flatpak] Creating bundle"
flatpak build-bundle flatpak-repo "${OUT_DIR}/${APP_ID}-${VERSION}.flatpak" "${APP_ID}"

echo "[build-flatpak] Done: ${OUT_DIR}/${APP_ID}-${VERSION}.flatpak"
