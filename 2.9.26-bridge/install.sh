#!/usr/bin/env bash
# Nimay OMP Chat Bridge - Linux installer
# Supports:
#   install.sh              download the release tarball and install it
#   install.sh --local      install the files that sit next to this script
#   install.sh uninstall    remove the user installation
# Version: 2.9.31

set -euo pipefail

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

log_info()  { echo -e "${BLUE}[INFO]${NC} $*"; }
log_ok()    { echo -e "${GREEN}[OK]${NC} $*"; }
log_warn()  { echo -e "${YELLOW}[WARN]${NC} $*"; }
log_error() { echo -e "${RED}[ERROR]${NC} $*"; }

# Note: /etc/os-release also defines VERSION, so the bridge version uses its
# own variable name to avoid being overwritten by detect_os().
BRIDGE_VERSION="2.9.31"
REPO="megaxenon83-server/ompbridge"
INSTALL_DIR="${HOME}/.local/share/Nimay OMP Chat/bridge"
BRIDGE_DIR="${INSTALL_DIR}/bridge"
CONFIG_FILE="${BRIDGE_DIR}/config.json"
SERVICE_NAME="Nimay OMP Chat-bridge"
LEGACY_SERVICE_NAME="nimay-ompbridge"
LEGACY_INSTALL_DIR="${HOME}/.local/share/nimay/ompbridge"
PORT="${OMPCHAT_BRIDGE_PORT:-7777}"
DOWNLOAD_BASE="https://github.com/${REPO}/releases/download/v${BRIDGE_VERSION}"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
MODE="download"

detect_os() {
    if [[ -f /etc/os-release ]]; then
        source /etc/os-release
        OS_ID="${ID}"
        OS_NAME="${PRETTY_NAME}"
    else
        OS_ID="unknown"
        OS_NAME="Unknown"
    fi
    IS_IMMUTABLE=false
    if [[ -f /run/ostree-booted ]] || [[ "${ID_LIKE:-}" =~ (silverblue|bazzite|kinoite|coreos) ]] || [[ "${ID}" =~ (silverblue|bazzite|kinoite|coreos|fedora-atomic) ]]; then
        IS_IMMUTABLE=true
    fi
    HAS_SYSTEMD=false
    if command -v systemctl >/dev/null 2>&1 && systemctl --user list-units >/dev/null 2>&1; then
        HAS_SYSTEMD=true
    fi
    log_info "Detected: ${OS_NAME} (${OS_ID})"
    ${IS_IMMUTABLE} && log_info "Immutable/atomic system detected"
    ${HAS_SYSTEMD} && log_info "systemd user services available" || log_warn "systemd user services NOT available"
}

check_deps() {
    local missing=()
    for cmd in systemctl loginctl node; do
        if ! command -v "${cmd}" >/dev/null 2>&1; then
            missing+=("${cmd}")
        fi
    done
    if [[ ${#missing[@]} -gt 0 ]]; then
        log_error "Missing dependencies: ${missing[*]}"
        log_error "Install them first, for example: sudo apt-get install nodejs"
        exit 1
    fi
    if [[ "${MODE}" == "download" ]]; then
        for cmd in curl tar sha256sum; do
            if ! command -v "${cmd}" >/dev/null 2>&1; then
                missing+=("${cmd}")
            fi
        done
        if [[ ${#missing[@]} -gt 0 ]]; then
            log_error "Missing dependencies: ${missing[*]}"
            exit 1
        fi
    fi
    if ! command -v omp >/dev/null 2>&1 && [[ -z "${OMP_BIN:-}" ]]; then
        log_warn "OMP CLI not found in PATH. Install OMP before using sessions (/ompserver)."
    fi
}

detect_arch() {
    case "$(uname -m)" in
        x86_64|amd64) ARCH="x86_64" ;;
        aarch64|arm64) ARCH="aarch64" ;;
        *) log_error "Unsupported architecture: $(uname -m)"; exit 1 ;;
    esac
    log_info "Architecture: ${ARCH}"
}

download_bridge() {
    local tarball="Nimay OMP Chat-bridge-linux-${ARCH}.tar.gz"
    local url="${DOWNLOAD_BASE}/${tarball}"
    local sha_url="${url}.sha256"
    local dest="${INSTALL_DIR}/${tarball}"
    log_info "Downloading ${tarball}..."
    mkdir -p "${INSTALL_DIR}"
    if ! curl -fsSL -o "${dest}" "${url}"; then
        log_error "Failed to download from ${url}"
        exit 1
    fi
    log_info "Verifying checksum..."
    local expected_sha
    expected_sha=$(curl -fsSL "${sha_url}" | awk '{print $1}')
    if [[ -z "${expected_sha}" ]]; then
        log_warn "Could not fetch checksum, skipping verification"
    else
        local actual_sha
        actual_sha=$(sha256sum "${dest}" | awk '{print $1}')
        if [[ "${actual_sha}" != "${expected_sha}" ]]; then
            log_error "Checksum mismatch! Expected: ${expected_sha}, Got: ${actual_sha}"
            exit 1
        fi
        log_ok "Checksum verified"
    fi
    log_info "Extracting..."
    tar -xzf "${dest}" -C "${INSTALL_DIR}"
    rm -f "${dest}"
    log_ok "Extracted to ${INSTALL_DIR}"
}

install_local_bridge() {
    if [[ ! -f "${SCRIPT_DIR}/bridge/omp-bridge.mjs" ]]; then
        log_error "No local payload found next to this script (${SCRIPT_DIR}/bridge/omp-bridge.mjs)"
        exit 1
    fi
    log_info "Installing local payload from ${SCRIPT_DIR}"
    mkdir -p "${BRIDGE_DIR}"
    cp -f "${SCRIPT_DIR}/bridge/omp-bridge.mjs" "${BRIDGE_DIR}/omp-bridge.mjs"
    if [[ -d "${SCRIPT_DIR}/tools" ]]; then
        rm -rf "${INSTALL_DIR}/tools"
        cp -r "${SCRIPT_DIR}/tools" "${INSTALL_DIR}/tools"
    fi
    if [[ -d "${SCRIPT_DIR}/commands" ]]; then
        rm -rf "${INSTALL_DIR}/commands"
        cp -r "${SCRIPT_DIR}/commands" "${INSTALL_DIR}/commands"
    fi
    if [[ -f "${SCRIPT_DIR}/flatpak/com.Nimay OMP Chat.bridge.yml" ]]; then
        mkdir -p "${INSTALL_DIR}/flatpak"
        cp -f "${SCRIPT_DIR}/flatpak/com.Nimay OMP Chat.bridge.yml" "${INSTALL_DIR}/flatpak/com.Nimay OMP Chat.bridge.yml"
    fi
    log_ok "Local payload installed"
}

setup_config() {
    mkdir -p "${BRIDGE_DIR}"
    if [[ -f "${CONFIG_FILE}" ]]; then
        log_info "Keeping existing bridge config at ${CONFIG_FILE}"
        return
    fi
    # Upgrade path: keep the pairing token from the pre-2.9.28 install so the
    # phone stays paired after the rename.
    local legacy_config="${LEGACY_INSTALL_DIR}/bridge/config.json"
    if [[ -f "${legacy_config}" ]]; then
        cp -f "${legacy_config}" "${CONFIG_FILE}"
        chmod 600 "${CONFIG_FILE}"
        log_ok "Migrated bridge config (pairing token preserved) from ${legacy_config}"
        return
    fi
    local token
    token=$(openssl rand -hex 32 2>/dev/null || head -c 32 /dev/urandom | xxd -p -c 64)
    cat > "${CONFIG_FILE}" << CONFIG_EOF
{
  "port": ${PORT},
  "host": "0.0.0.0",
  "token": "${token}",
  "approvalMode": "always-ask",
  "allowBash": true,
  "projectRoots": [],
  "maxChildren": 4,
  "idleMinutes": 90
}
CONFIG_EOF
    chmod 600 "${CONFIG_FILE}"
    log_ok "Generated config with new token at ${CONFIG_FILE}"
}

read_token() {
    if [[ ! -f "${CONFIG_FILE}" ]]; then
        echo ""
        return
    fi
    node -e "try{const c=JSON.parse(require('fs').readFileSync(process.argv[1],'utf8').replace(/^\uFEFF/,''));process.stdout.write(String(c.token||''))}catch(e){process.stdout.write('')}" "${CONFIG_FILE}"
}

setup_systemd() {
    local service_dir="${HOME}/.config/systemd/user"
    local service_file="${service_dir}/${SERVICE_NAME}.service"
    mkdir -p "${service_dir}"
    cat > "${service_file}" << SERVICE_EOF
[Unit]
Description=Nimay OMP Chat Bridge
After=network-online.target
Wants=network-online.target

[Service]
Type=simple
ExecStart=/usr/bin/env node ${BRIDGE_DIR}/omp-bridge.mjs
WorkingDirectory=${BRIDGE_DIR}
Restart=on-failure
RestartSec=5
Environment=OMPCHAT_BRIDGE_PORT=${PORT}
Environment=HOME=%h
Environment=USERPROFILE=%h
StandardOutput=append:${BRIDGE_DIR}/bridge.stdout.log
StandardError=append:${BRIDGE_DIR}/bridge.stderr.log

[Install]
WantedBy=default.target
SERVICE_EOF
    log_ok "Created systemd user service at ${service_file}"
    log_info "Enabling linger for user $(whoami)..."
    if loginctl enable-linger "$(whoami)" 2>/dev/null; then
        log_ok "Linger enabled - service will start at boot"
    else
        log_warn "Could not enable linger automatically. Run: sudo loginctl enable-linger \$(whoami)"
    fi
    systemctl --user daemon-reload
    systemctl --user enable "${SERVICE_NAME}.service"
    log_ok "Service enabled"
}

start_service() {
    log_info "Starting bridge..."
    systemctl --user start "${SERVICE_NAME}.service"
    local token
    token="$(read_token)"
    for _ in $(seq 1 15); do
        if curl -fsS -H "Authorization: Bearer ${token}" "http://127.0.0.1:${PORT}/api/health" >/dev/null 2>&1; then
            log_ok "Bridge is running and healthy!"
            return 0
        fi
        sleep 1
    done
    log_error "Bridge failed to start. Check logs: ${BRIDGE_DIR}/bridge.stderr.log"
    return 1
}

remove_legacy_service() {
    local legacy_unit="${HOME}/.config/systemd/user/${LEGACY_SERVICE_NAME}.service"
    if [[ -f "${legacy_unit}" ]]; then
        systemctl --user stop "${LEGACY_SERVICE_NAME}.service" 2>/dev/null || true
        systemctl --user disable "${LEGACY_SERVICE_NAME}.service" 2>/dev/null || true
        rm -f "${legacy_unit}"
        systemctl --user daemon-reload 2>/dev/null || true
        log_ok "Removed legacy service ${LEGACY_SERVICE_NAME}.service"
    fi
}

install_omp_commands() {
    local cmd_dir="${HOME}/.omp/agent/commands"
    mkdir -p "${cmd_dir}"
    if [[ -d "${INSTALL_DIR}/commands" ]]; then
        cp -r "${INSTALL_DIR}/commands"/* "${cmd_dir}/"
        log_ok "Installed OMP commands to ${cmd_dir}"
    else
        log_warn "Commands directory not found in tarball"
    fi
    local state_file="${HOME}/.omp/agent/ompchat-commands.json"
    mkdir -p "$(dirname "${state_file}")"
    cat > "${state_file}" << STATE_EOF
{
  "projectRoot": "${INSTALL_DIR}",
  "bridge": "${BRIDGE_DIR}/omp-bridge.mjs"
}
STATE_EOF
    log_ok "Wrote OMP state file"
}

print_summary() {
    local token
    token="$(read_token)"
    echo
    echo "=========================================="
    echo "  Nimay OMP Chat Bridge v${BRIDGE_VERSION} installed!"
    echo "=========================================="
    echo "Install dir: ${INSTALL_DIR}"
    echo "Config file: ${CONFIG_FILE}"
    echo "Port:        ${PORT}"
    echo "Token:       ${token}"
    echo
    echo "Service:     ${SERVICE_NAME} (systemd --user)"
    echo "Autostart:   Enabled (boot without login)"
    echo
    echo "Commands:"
    echo "  Status:    systemctl --user status ${SERVICE_NAME}"
    echo "  Logs:      journalctl --user -u ${SERVICE_NAME} -f"
    echo "  Restart:   systemctl --user restart ${SERVICE_NAME}"
    echo "  Stop:      systemctl --user stop ${SERVICE_NAME}"
    echo
    echo "QR pairing:  Run 'omp' then '/ompqr' in terminal"
    echo "Bridge API:  http://localhost:${PORT}/api/health"
    echo "=========================================="
}

uninstall() {
    log_info "Uninstalling Nimay OMP Chat Bridge..."
    systemctl --user stop "${SERVICE_NAME}.service" 2>/dev/null || true
    systemctl --user disable "${SERVICE_NAME}.service" 2>/dev/null || true
    rm -f "${HOME}/.config/systemd/user/${SERVICE_NAME}.service"
    systemctl --user daemon-reload 2>/dev/null || true
    rm -rf "${INSTALL_DIR}"
    rm -rf "${LEGACY_INSTALL_DIR}"
    rm -rf "${HOME}/.omp/agent/commands/ompserver" "${HOME}/.omp/agent/commands/ompqr" "${HOME}/.omp/agent/commands/ompchat-shared" 2>/dev/null || true
    rm -f "${HOME}/.omp/agent/ompchat-commands.json"
    loginctl disable-linger "$(whoami)" 2>/dev/null || true
    log_ok "Uninstall complete"
}

main() {
    local action="install"
    for arg in "$@"; do
        case "${arg}" in
            --local) MODE="local" ;;
            install|uninstall|help) action="${arg}" ;;
            *) log_error "Unknown argument: ${arg}"; exit 1 ;;
        esac
    done

    case "${action}" in
        install)
            log_info "Starting Nimay OMP Chat Bridge v${BRIDGE_VERSION} installation..."
            detect_os
            check_deps
            detect_arch
            remove_legacy_service
            if [[ "${MODE}" == "local" ]]; then
                install_local_bridge
            else
                download_bridge
            fi
            setup_config
            setup_systemd
            install_omp_commands
            start_service
            print_summary
            ;;
        uninstall)
            uninstall
            ;;
        help)
            echo "Usage: $0 [install [--local] | uninstall | help]"
            ;;
    esac
}

main "$@"

