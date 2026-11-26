# PolyStrata compatibility patch

OMP Bridge uses PolyStrata's local HTTP API for local models. PolyStrata is an external MIT-licensed project:
<https://github.com/simplexai-labs/PolyStrata>. This repository has no write access there, so the compatibility fixes
are kept here as a version-controlled patch and are also attached to the OMP Bridge release.

`PolyStrata-main-omp-lock-fix.patch` is based on upstream commit
`d62dfacbe185dfbb447e79c5fb1091ae189afc64` (`main`, 2026-11-25).

## What it changes

- Adds `POST /v1/cancel`, which stops the running turn and the requests queued behind it. A client that stopped or
  disappeared can no longer keep the model lock until the answer ends.
- Lists an `auto_load` model in `/v1/models` as `unloaded` while the engine is idle, so clients discover it before the
  first load.
- Updates `docs/DETAILS.md` and the two server tests for both behaviours.

## Automatic check in OMP Bridge

The Bridge installer extracts `windows/PolyStrata-Compat.ps1` and this patch, then runs the check before copying files. The script finds PolyStrata through `-PolyStrataDir`, `POLYSTRATA_HOME`, the running `python.exe` process, or a standard install folder. It applies the server hunks with exact anchors (no Git needed) and verifies:

- the source contains the `auto_load` property, the `/v1/cancel` route, the `cancel` marker and the discovery condition;
- `server.py` still compiles;
- a running server advertises `"cancel": true` in `/v1/status`.

Exit code 3 (write/verify failed) or 4 (incompatible source or unpatched running server) aborts the installation. A partially patched file is refused rather than guessed at. The script writes only `terminal/serve/server.py` and a `.omp-bak-2.9.62` backup; it never touches model files.

For future PolyStrata updates, run `PolyStrata-Compat.ps1 -CheckOnly` against the new checkout. If an anchor is missing, the script fails with the anchor name and asks for an updated patch; update this patch from the new upstream base instead of skipping the fix.

## Apply manually

```sh
git clone https://github.com/simplexai-labs/PolyStrata
cd PolyStrata
git checkout d62dfacbe185dfbb447e79c5fb1091ae189afc64
git apply /path/to/PolyStrata-main-omp-lock-fix.patch
cd terminal
python -m unittest serve.test_lifecycle serve.test_models
```

If upstream `main` has moved, try `git apply -3` or rebase the equivalent changes onto the new `main`. The server
changes are small and independent of the engine version.

## Without the patch

Bridge detects a server without `/v1/cancel` and falls back to unload retries. Stop can then take up to about 15 s
instead of being immediate, and a local-to-local model switch can still fail while a stuck turn holds the lock. The
unloaded-model discovery fix in `/v1/models` also requires the patch.
