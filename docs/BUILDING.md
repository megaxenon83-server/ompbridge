# Build the Windows installer

Install Inno Setup and compile `windows/Setup.iss` with `ISCC.exe`. The executable is written to `windows/dist`. The installer packages Bridge and its Windows launcher. Install Node.js, Oh My Pi, and Git separately.

Run `node --check windows/bridge/omp-bridge.mjs` before compiling. Test in a separate installation with an unused port. Check the startup shortcut, the health endpoint, configuration preservation, and uninstallation.

Desktop releases use the `omp-desktop-<version>` tag. The release includes SHA-256 checksums for its downloads.
