#requires -version 5.1
<#
  PolyStrata compatibility for OMP Bridge 2.9.78.

  Finds a PolyStrata source tree, verifies that it contains the /v1/cancel fix, and applies the
  version-controlled patch when it does not.  Exits non-zero when the tree cannot be brought to a
  verified compatible state, so the OMP Bridge installer can stop instead of installing against an
  unpatched server.  It never touches model files, only terminal\serve\server.py (plus a backup).

  Exit codes: 0 = compatible or PolyStrata not installed; 3 = patch/write failed; 4 = incompatible
  source or a running PolyStrata without the fix.
#>
param(
    [string]$PolyStrataDir = "",
    [string]$PatchFile = "",
    [string]$RuntimeUrl = "http://127.0.0.1:8080",
    [string]$LogFile = "",
    [string]$ErrorFile = "",
    [switch]$CheckOnly
)

$ErrorActionPreference = "Stop"

function Write-Log([string]$Message) {
    $line = (Get-Date).ToString("s") + " " + $Message
    if ($LogFile) {
        [IO.File]::AppendAllText($LogFile, $line + "`r`n", (New-Object System.Text.UTF8Encoding($false)))
    }
    Write-Host $line
}

function Fail([int]$Code, [string]$Message) {
    Write-Log ("ERROR: " + $Message)
    if ($ErrorFile) {
        try {
            # Inno Setup reads this file as AnsiString; use the system codepage and no BOM.
            [IO.File]::WriteAllText($ErrorFile, $Message, [Text.Encoding]::Default)
        } catch {}
    }
    exit $Code
}

function Clear-Error {
    if ($ErrorFile -and (Test-Path -LiteralPath $ErrorFile)) {
        try { Remove-Item -LiteralPath $ErrorFile -Force } catch {}
    }
}

function Resolve-PolyStrata([string]$Given) {
    if ($Given) {
        if (Test-Path -LiteralPath (Join-Path $Given "terminal\serve\server.py")) {
            return (Resolve-Path -LiteralPath $Given).Path
        }
        Fail 4 ("PolyStrataDir does not contain terminal\serve\server.py: " + $Given)
    }
    if ($env:POLYSTRATA_HOME) {
        if (Test-Path -LiteralPath (Join-Path $env:POLYSTRATA_HOME "terminal\serve\server.py")) {
            return (Resolve-Path -LiteralPath $env:POLYSTRATA_HOME).Path
        }
        Write-Log ("POLYSTRATA_HOME is set but has no terminal\serve\server.py: " + $env:POLYSTRATA_HOME)
    }
    # A running PolyStrata server knows its own source root.  This also covers custom install folders.
    try {
        $processes = Get-CimInstance Win32_Process -Filter "Name='python.exe'" -ErrorAction Stop
        foreach ($process in $processes) {
            $command = [string]$process.CommandLine
            if ($command -match '([A-Za-z]:\\[^"]*?)[\\/]terminal[\\/]serve[\\/]server\.py') {
                $candidate = $Matches[1]
                if (Test-Path -LiteralPath (Join-Path $candidate "terminal\serve\server.py")) {
                    return (Resolve-Path -LiteralPath $candidate).Path
                }
            }
        }
    } catch {}
    $candidates = @(
        (Join-Path $env:LOCALAPPDATA "PolyStrata"),
        (Join-Path $env:LOCALAPPDATA "PolyStrata\source"),
        (Join-Path $env:USERPROFILE "PolyStrata"),
        (Join-Path $env:USERPROFILE "source\PolyStrata"),
        "C:\PolyStrata"
    )
    foreach ($candidate in $candidates) {
        if ($candidate -and (Test-Path -LiteralPath (Join-Path $candidate "terminal\serve\server.py"))) {
            return (Resolve-Path -LiteralPath $candidate).Path
        }
    }
    return $null
}

function Test-RunningServer([string]$Url) {
    if (-not $Url) { return }
    try {
        $status = Invoke-RestMethod -Uri ($Url.TrimEnd("/") + "/v1/status") -TimeoutSec 3 -ErrorAction Stop
    } catch {
        Write-Log ("The running server at " + $Url + " is not reachable; the patch takes effect on its next start.")
        return
    }
    if ($status.cancel -eq $true) {
        Write-Log ("The running server at " + $Url + " advertises /v1/cancel.")
        return
    }
    Fail 4 ("The source is patched, but the running PolyStrata server at " + $Url +
        " does not advertise /v1/cancel. Restart PolyStrata and run the compatibility check again.")
}

function Find-One([string[]]$Lines, [string]$Needle, [string]$What) {
    $hits = @()
    for ($i = 0; $i -lt $Lines.Count; $i++) {
        if ($Lines[$i].Contains($Needle)) { $hits += $i }
    }
    if ($hits.Count -ne 1) {
        Fail 4 ("Cannot apply the PolyStrata compatibility patch: expected exactly one " + $What +
            " anchor, found " + $hits.Count + ". Update integration/polystrata/PolyStrata-main-omp-lock-fix.patch for the new PolyStrata version.")
    }
    return $hits[0]
}

function Get-NewServerText([string]$Text) {
    $eol = if ($Text.Contains("`r`n")) { "`r`n" } else { "`n" }
    $lines = $Text -split "\r?\n"
    $changed = @()

    # 1. The auto_load property, after loaded().
    $loaded = Find-One $lines "def loaded(self) -> bool:" "loaded()"
    $return = Find-One $lines 'return not hasattr(self.engine, "alive") or self.engine.alive()' "loaded() return"
    if ($return -ne $loaded + 1) {
        Fail 4 "Cannot apply the PolyStrata compatibility patch: loaded() has an unexpected body."
    }
    $property = @(
        "",
        "    @property",
        "    def auto_load(self) -> bool:",
        '        """True when an unloaded model starts again on the next request (llama-server''s router, strata-poly)."""',
        '        return hasattr(self.engine, "restart")'
    )
    $lines = @($lines[0..$return]) + $property + @($lines[($return + 1)..($lines.Count - 1)])
    $changed += "auto_load property"

    # 2. The unloaded model is listed while the engine is idle.
    $condition = Find-One $lines "if not loaded and (self.switch_on_request or self.idle_unload_s or getattr(self.engine," "v1_models condition"
    $lines[$condition] = "        if not loaded and (self.switch_on_request or self.idle_unload_s or self.auto_load or"
    $lines = @($lines[0..$condition]) + @(
        '                           getattr(self.engine, "unloaded", False)):',
        "            # A model that starts on the next request (auto_load) is listed from the start, not only after the",
        "            # first load or unload: clients discover it while the engine is idle, as llama-server's router does."
    ) + @($lines[($condition + 1)..($lines.Count - 1)])
    $changed += "v1_models discovery"

    # 3. The /v1/cancel alias, before /v1/vram.
    $vram = Find-One $lines 'if path == "/v1/vram":' "/v1/vram route"
    $lines = @($lines[0..($vram - 1)]) + @(
        '                if path == "/v1/cancel":                     # stop the turn that runs now, and those queued behind it',
        '                    if not self._own_page("requests can be cancelled"):',
        "                        return",
        "                    cancelled = svc.cancel_owned_requests()",
        '                    self._json(200, {"status": "cancelled", "cancelled": cancelled, **svc.v1_status()})',
        "                    return"
    ) + @($lines[$vram..($lines.Count - 1)])
    $changed += "/v1/cancel route"

    # 4. Advertise the alias in /v1/status, and use the property everywhere.
    $status = Find-One $lines '"loaded": self.loaded(), "auto_load": hasattr(self.engine, "restart"),' "v1_status auto_load"
    $lines[$status] = '            "loaded": self.loaded(), "auto_load": self.auto_load, "cancel": True,'
    $changed += "v1_status cancel marker"

    $requests = Find-One $lines '"auto_load": hasattr(svc.engine, "restart")' "/api/requests auto_load"
    $lines[$requests] = $lines[$requests].Replace('hasattr(svc.engine, "restart")', "svc.auto_load")
    $changed += "/api/requests auto_load"

    $props = Find-One $lines '"models_autoload": hasattr(svc.engine, "restart"),' "/props models_autoload"
    $lines[$props] = $lines[$props].Replace('hasattr(svc.engine, "restart")', "svc.auto_load")
    $changed += "/props models_autoload"

    Write-Log ("Patch anchors verified: " + ($changed -join ", "))
    return ($lines -join $eol)
}

function Backup-Server([string]$Server) {
    $backup = $Server + ".omp-bak-2.9.78"
    if (-not (Test-Path -LiteralPath $backup)) { Copy-Item -LiteralPath $Server -Destination $backup }
    return $backup
}

try {
    if (-not $LogFile) { $LogFile = Join-Path ([IO.Path]::GetTempPath()) "polystrata-compat.log" }
    if (-not $ErrorFile) { $ErrorFile = Join-Path ([IO.Path]::GetTempPath()) "polystrata-compat-error.txt" }
    Clear-Error
    Write-Log "PolyStrata compatibility check for OMP Bridge 2.9.78"

    $root = Resolve-PolyStrata $PolyStrataDir
    if (-not $root) {
        Write-Log "PolyStrata was not found; nothing to patch. Pass -PolyStrataDir or set POLYSTRATA_HOME when it is installed elsewhere."
        Clear-Error
        exit 0
    }
    Write-Log ("PolyStrata: " + $root)
    $server = Join-Path $root "terminal\serve\server.py"

    if ($PatchFile) {
        if (-not (Test-Path -LiteralPath $PatchFile)) { Fail 3 ("Patch file not found: " + $PatchFile) }
        Write-Log ("Patch file: " + $PatchFile + " (" + (Get-FileHash -LiteralPath $PatchFile -Algorithm SHA256).Hash + ")")
    }

    $text = [IO.File]::ReadAllText($server)
    $required = @(
        "def auto_load(self) -> bool:",
        'if path == "/v1/cancel":',
        '"cancel": True,',
        "or self.auto_load or"
    )
    $present = @($required | Where-Object { $text.Contains($_) }).Count
    if ($present -eq $required.Count) {
        Write-Log "The source already contains the compatibility fix; verifying the running server."
        Test-RunningServer $RuntimeUrl
        Clear-Error
        exit 0
    }
    if ($present -gt 0) {
        Fail 4 ("The source is only partly patched (" + $present + " of " + $required.Count +
            " markers). Restore terminal\serve\server.py from a clean PolyStrata checkout and run again.")
    }

    $newText = Get-NewServerText $text
    if ($CheckOnly) {
        Write-Log "CheckOnly: the patch would apply."
        Clear-Error
        exit 0
    }

    $backup = Backup-Server $server
    $bytes = [IO.File]::ReadAllBytes($server)
    $hasBom = ($bytes.Length -ge 3 -and $bytes[0] -eq 0xEF -and $bytes[1] -eq 0xBB -and $bytes[2] -eq 0xBF)
    $encoding = New-Object System.Text.UTF8Encoding($hasBom)
    $temp = $server + ".omp-new-" + [guid]::NewGuid().ToString("N")
    try {
        [IO.File]::WriteAllText($temp, $newText, $encoding)
        Move-Item -LiteralPath $temp -Destination $server -Force
    } catch {
        if (Test-Path -LiteralPath $temp) { Remove-Item -LiteralPath $temp -Force -ErrorAction SilentlyContinue }
        Copy-Item -LiteralPath $backup -Destination $server -Force
        Fail 3 ("Could not write server.py: " + $_.Exception.Message)
    }
    Write-Log ("Patched " + $server + " (backup: " + $backup + ")")

    $verified = [IO.File]::ReadAllText($server)
    foreach ($marker in $required) {
        if (-not $verified.Contains($marker)) {
            Copy-Item -LiteralPath $backup -Destination $server -Force
            Fail 3 ("The patched source failed verification (missing: " + $marker + "); the previous file was restored.")
        }
    }

    $python = Get-Command python.exe -ErrorAction SilentlyContinue
    if ($python) {
        # Compile in memory: no __pycache__ in the PolyStrata tree.
        $compileOutput = & $python.Source -c "import sys; p=sys.argv[1]; compile(open(p, encoding='utf-8').read(), p, 'exec')" $server 2>&1
        $compileCode = $LASTEXITCODE
        foreach ($line in $compileOutput) { Write-Log ("py_compile: " + $line) }
        if ($compileCode -ne 0) {
            Copy-Item -LiteralPath $backup -Destination $server -Force
            Fail 3 "The patched server.py does not compile; the previous file was restored."
        }
        Write-Log "server.py compiles."
    } else {
        Write-Log "Python is not on PATH; skipped py_compile (the running server verifies below)."
    }

    Test-RunningServer $RuntimeUrl
    Clear-Error
    Write-Log "PolyStrata is compatible with OMP Bridge 2.9.78."
    exit 0
} catch {
    Fail 3 ("Unexpected error: " + $_.Exception.Message)
}
