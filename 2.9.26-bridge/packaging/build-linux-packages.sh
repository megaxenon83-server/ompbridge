#!/usr/bin/env bash
# Builds the Nimay OMP Chat Bridge Linux artifacts:
#   - nimay-omp-chat-bridge-linux-x86_64.tar.gz (+ .sha256)
#   - nimay-omp-chat-bridge_<version>_amd64.deb
#   - nimay-omp-chat-bridge-<version>-1.x86_64.rpm
#
# Usage: build-linux-packages.sh [version] [output-dir]

set -euo pipefail

VERSION="${1:-2.9.29}"
OUT_DIR="${2:-dist}"
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
WORK="$(mktemp -d)"
trap 'rm -rf "${WORK}"' EXIT

log() { echo "[build-linux] $*"; }

mkdir -p "${OUT_DIR}"
OUT_DIR="$(cd "${OUT_DIR}" && pwd)"

# ---------------------------------------------------------------- payload ---
PAYLOAD="${WORK}/payload"
mkdir -p "${PAYLOAD}"
mkdir -p "${PAYLOAD}/bridge"
cp "${ROOT}/bridge/omp-bridge.mjs" "${PAYLOAD}/bridge/omp-bridge.mjs"
cp "${ROOT}/bridge/config.template.json" "${PAYLOAD}/bridge/config.template.json"
cp -r "${ROOT}/tools" "${PAYLOAD}/tools"
cp -r "${ROOT}/commands" "${PAYLOAD}/commands"
cp "${ROOT}/install.sh" "${PAYLOAD}/install.sh"
chmod +x "${PAYLOAD}/install.sh"
if [[ -d "${ROOT}/flatpak" ]]; then
    cp -r "${ROOT}/flatpak" "${PAYLOAD}/flatpak"
fi
# Never ship a runtime config (it contains the pairing token).
rm -f "${PAYLOAD}/bridge/config.json"

# --------------------------------------------------------------- tarball ---
TARBALL_NAME="nimay-omp-chat-bridge-linux-x86_64.tar.gz"
log "Creating ${TARBALL_NAME}"
tar -czf "${OUT_DIR}/${TARBALL_NAME}" -C "${PAYLOAD}" .
(cd "${OUT_DIR}" && sha256sum "${TARBALL_NAME}" > "${TARBALL_NAME}.sha256")

# ------------------------------------------------------------------- .deb ---
PKG_NAME="nimay-omp-chat-bridge"
DEB_ROOT="${WORK}/deb"
mkdir -p "${DEB_ROOT}/DEBIAN" \
         "${DEB_ROOT}/usr/local/share/nimay/omp-chat-bridge" \
         "${DEB_ROOT}/usr/local/bin" \
         "${DEB_ROOT}/usr/share/applications"
cp -r "${PAYLOAD}"/* "${DEB_ROOT}/usr/local/share/nimay/omp-chat-bridge/"

cat > "${DEB_ROOT}/usr/local/bin/nimay-omp-chat-bridge-install" << WRAPPER
#!/bin/sh
exec /usr/local/share/nimay/omp-chat-bridge/install.sh --local "\$@"
WRAPPER
chmod 755 "${DEB_ROOT}/usr/local/bin/nimay-omp-chat-bridge-install"

cat > "${DEB_ROOT}/usr/share/applications/nimay-omp-chat-bridge.desktop" << DESKTOP
[Desktop Entry]
Type=Application
Name=Nimay OMP Chat Bridge
Comment=Bridge between OMP on your PC and Nimay OMP Chat on Android
Exec=nimay-omp-chat-bridge-install --local
Icon=network-transmit-receive
Terminal=true
Categories=Network;Development;
DESKTOP

cat > "${DEB_ROOT}/DEBIAN/control" << CONTROL
Package: nimay-omp-chat-bridge
Version: ${VERSION}
Section: net
Priority: optional
Architecture: amd64
Maintainer: Nimay <nimay@example.com>
Description: Bridge between OMP on your PC and Nimay OMP Chat on Android
 Nimay OMP Chat Bridge with provider synchronisation and Android pairing.
Homepage: https://github.com/megaxenon83-server/ompbridge
Conflicts: nimay-ompbridge
Replaces: nimay-ompbridge
CONTROL

cat > "${DEB_ROOT}/DEBIAN/postinst" << POSTINST
#!/bin/sh
set -e
echo "Nimay OMP Chat Bridge ${VERSION} installed."
echo "Run 'nimay-omp-chat-bridge-install --local' as your user to set up the service."
exit 0
POSTINST
chmod 755 "${DEB_ROOT}/DEBIAN/postinst"

cat > "${DEB_ROOT}/DEBIAN/prerm" << PRERM
#!/bin/sh
set -e
exit 0
PRERM
chmod 755 "${DEB_ROOT}/DEBIAN/prerm"

if command -v dpkg-deb >/dev/null 2>&1; then
    log "Building .deb"
    dpkg-deb --build --root-owner-group "${DEB_ROOT}" "${OUT_DIR}/nimay-omp-chat-bridge_${VERSION}_amd64.deb"
else
    log "WARNING: dpkg-deb not available, skipping .deb"
fi

# ------------------------------------------------------------------- .rpm ---
if command -v rpmbuild >/dev/null 2>&1; then
    log "Building .rpm"
    RPM_TOP="${WORK}/rpmbuild"
    mkdir -p "${RPM_TOP}"/{BUILD,BUILDROOT,RPMS,SOURCES,SPECS,SRPMS}
    cp "${OUT_DIR}/${TARBALL_NAME}" "${RPM_TOP}/SOURCES/nimay-omp-chat-bridge-${VERSION}.tar.gz"

    cat > "${WORK}/nimay-omp-chat-bridge.spec" << SPEC
Name: nimay-omp-chat-bridge
Version: ${VERSION}
Release: 1%{?dist}
Summary: Bridge between OMP on your PC and Nimay OMP Chat on Android
License: MIT
URL: https://github.com/megaxenon83-server/ompbridge
BuildArch: x86_64
Requires: nodejs
Obsoletes: nimay-ompbridge
Source0: nimay-omp-chat-bridge-${VERSION}.tar.gz

%description
Bridge between OMP on your PC and Nimay OMP Chat on Android, including provider
synchronisation and Android pairing.

%install
rm -rf %{buildroot}
mkdir -p %{buildroot}%{_prefix}/share/nimay/omp-chat-bridge
tar -xzf %{SOURCE0} -C %{buildroot}%{_prefix}/share/nimay/omp-chat-bridge
mkdir -p %{buildroot}%{_prefix}/bin
cat > %{buildroot}%{_prefix}/bin/nimay-omp-chat-bridge-install << 'WRAPPER'
#!/bin/sh
exec %{_prefix}/share/nimay/omp-chat-bridge/install.sh --local "\$@"
WRAPPER
chmod 755 %{buildroot}%{_prefix}/bin/nimay-omp-chat-bridge-install

%files
%{_prefix}/bin/nimay-omp-chat-bridge-install
%{_prefix}/share/nimay/omp-chat-bridge

%changelog
* Tue Nov 17 2026 Nimay <nimay@example.com> - ${VERSION}-1
- Release ${VERSION}
SPEC

    rpmbuild --define "_topdir ${RPM_TOP}" -bb "${WORK}/nimay-omp-chat-bridge.spec"
    find "${RPM_TOP}/RPMS" -name '*.rpm' -exec cp {} "${OUT_DIR}/" \;
else
    log "WARNING: rpmbuild not available, skipping .rpm"
fi

log "Artifacts in ${OUT_DIR}:"
ls -1 "${OUT_DIR}"