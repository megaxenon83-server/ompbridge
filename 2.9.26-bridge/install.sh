#!/usr/bin/env bash
# Nimay OMP Bridge - Universal Linux Installer
# Version: 2.9.27

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

VERSION="2.9.27"
REPO="nimay/ompbridge"
INSTALL_DIR="${HOME}/.local/share/nimay/ompbridge"
CONFIG_DIR="${HOME}/.config/nimay/ompbridge"
SERVICE_NAME="nimay-ompbridge"
DOWNLOAD_BASE="https://github.com/${REPO}/releases/download/v${VERSION}"

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
    for cmd in curl tar systemctl loginctl; do
        if ! command -v "${cmd}" >/dev/null 2>&1; then
            missing+=("${cmd}")
        fi
    done
    if [[ ${#missing[@]} -gt 0 ]]; then
        log_error "Missing dependencies: ${missing[*]}"
        exit 1
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
    local tarball="ompbridge-linux-${ARCH}.tar.gz"
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
    rm "${dest}"
    log_ok "Extracted to ${INSTALL_DIR}"
}

setup_config() {
    mkdir -p "${CONFIG_DIR}"
    local config_file="${CONFIG_DIR}/config.json"
    if [[ ! -f "${config_file}" ]]; then
        local token
        token=$(openssl rand -hex 32 2>/dev/null || head -c 32 /dev/urandom | xxd -p -c 64)
        cat > "${config_file}" << CONFIG_EOF
{
    "port": 7777,
    "host": "0.0.0.0",
    "token": "${token}",
    "approvalMode": "always-ask",
    "allowBash": true,
    "projectRoots": [],
    "maxChildren": 4,
    "idleMinutes": 90
}
CONFIG_EOF
        log_ok "Generated config with new token at ${config_file}"
    else
        log_info "Using existing config at ${config_file}"
    fi
}

setup_systemd() {
    local service_dir="${HOME}/.config/systemd/user"
    local service_file="${service_dir}/${SERVICE_NAME}.service"
    mkdir -p "${service_dir}"
    cat > "${service_file}" << SERVICE_EOF
[Unit]
Description=Nimay OMP Bridge
After=network-online.target
Wants=network-online.target

[Service]
Type=simple
ExecStart=${INSTALL_DIR}/omp-bridge.mjs
WorkingDirectory=${INSTALL_DIR}
Restart=on-failure
RestartSec=5
Environment=OMPCHAT_BRIDGE_PORT=7777
Environment=HOME=%h
Environment=USERPROFILE=%h
StandardOutput=append:${INSTALL_DIR}/bridge.stdout.log
StandardError=append:${INSTALL_DIR}/bridge.stderr.log

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
    sleep 3
    local token
    token=$(grep -o '"token"' | sed 's/.*"\([^"]*\)".*/\1/')
    for i in {1..10}; do
        if curl -fsS -H "Authorization: Bearer ${token}" "http://127.0.0.1:7777/api/health" >/dev/null 2>&1; then
            log_ok "Bridge is running and healthy!"
            return 0
        fi
        sleep 1
    done
    log_error "Bridge failed to start. Check logs: ${INSTALL_DIR}/bridge.stderr.log"
    return 1
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
  "bridge": "${INSTALL_DIR}/omp-bridge.mjs"
}
STATE_EOF
    log_ok "Wrote OMP state file"
}

print_summary() {
    local token
    token=$(grep -o '"token"' | sed 's/.*"\([^"]*\)".*/\1/')
    echo
    echo "=========================================="
    echo "  Nimay OMP Bridge v${VERSION} installed!"
    echo "=========================================="
    echo "Install dir: ${INSTALL_DIR}"
    echo "Config dir:  ${CONFIG_DIR}"
    echo "Port:        7777"
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
    echo "Bridge API:  http://localhost:7777/api/health"
    echo "=========================================="
}

uninstall() {
    log_info "Uninstalling Nimay OMP Bridge..."
    systemctl --user stop "${SERVICE_NAME}.service" 2>/dev/null || true
    systemctl --user disable "${SERVICE_NAME}.service" 2>/dev/null || true
    rm -f "${HOME}/.config/systemd/user/${SERVICE_NAME}.service"
    systemctl --user daemon-reload
    rm -rf "${INSTALL_DIR}"
    rm -rf "${CONFIG_DIR}"
    rm -rf "${HOME}/.omp/agent/commands/ompserver" "${HOME}/.omp/agent/commands/ompqr" "${HOME}/.omp/agent/commands/ompchat-shared" 2>/dev/null || true
    rm -f "${HOME}/.omp/agent/ompchat-commands.json"
    loginctl disable-linger "$(whoami)" 2>/dev/null || true
    log_ok "Uninstall complete"
}

main() {
    case "${1:-install}" in
        install)
            log_info "Starting Nimay OMP Bridge v${VERSION} installation..."
            detect_os
            check_deps
            detect_arch
            download_bridge
            setup_config
            setup_systemd
            install_omp_commands
            start_service
            print_summary
            ;;
        uninstall)
            uninstall
            ;;
        *)
            echo "Usage: $0 [install|uninstall]"
            exit 1
            ;;
    esac
}

main "$@"