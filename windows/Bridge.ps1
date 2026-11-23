param(
    [ValidateSet('Start','Stop')][string]$Action = 'Start',
    [string]$InstallDir = $PSScriptRoot
)
$ErrorActionPreference = 'Stop'
$bridgeDir = Join-Path $InstallDir 'bridge'
$entry = Join-Path $bridgeDir 'omp-bridge.mjs'
$configFile = Join-Path $bridgeDir 'config.json'
$pidFile = Join-Path $bridgeDir 'bridge.pid'

function Get-Health {
    try { Invoke-RestMethod "$origin/api/health" -Headers $headers -TimeoutSec 2 }
    catch { $null }
}

function Get-ListenerId {
    $port = [int]$config.port
    foreach ($line in (& netstat.exe -ano -p tcp)) {
        if ($line -match "^\s*TCP\s+\S+:${port}\s+\S+\s+LISTENING\s+(\d+)\s*$") {
            return [int]$Matches[1]
        }
    }
}

try {
    if (!(Test-Path -LiteralPath $configFile)) {
        if ($Action -eq 'Stop') { exit 0 }
        $bytes = New-Object byte[] 32
        $rng = [Security.Cryptography.RandomNumberGenerator]::Create()
        try { $rng.GetBytes($bytes) } finally { $rng.Dispose() }
        $config = @{
            port = 27778
            host = '0.0.0.0'
            token = [BitConverter]::ToString($bytes).Replace('-', '').ToLowerInvariant()
            approvalMode = 'always-ask'
            allowBash = $false
            voice = @{ enabled = $false }
        }
        $config | ConvertTo-Json | Set-Content -LiteralPath $configFile -Encoding UTF8
    }
    $config = Get-Content -LiteralPath $configFile -Raw -Encoding UTF8 | ConvertFrom-Json
    if (!$config.token -or !$config.port) { throw 'Bridge config needs a token and a port.' }
    $origin = "http://127.0.0.1:$($config.port)"
    $headers = @{ Authorization = 'Bearer ' + $config.token }
    $health = Get-Health

    if ($Action -eq 'Stop') {
        if (!$health) {
            if (Get-ListenerId) {
                [Console]::Error.WriteLine("Port $($config.port) is occupied by a process that rejects this Bridge installation's token.")
                exit 2
            }
            exit 0
        }
        if (!(Test-Path -LiteralPath $pidFile)) { throw 'Cannot verify the running Bridge process.' }
        $processId = [int](Get-Content -LiteralPath $pidFile -Raw)
        $listener = (Get-ListenerId) -eq $processId
        $processInfo = Get-CimInstance Win32_Process -Filter "ProcessId=$processId"
        if (!$listener -or $processInfo.Name -ne 'node.exe' -or $processInfo.CommandLine -notmatch 'omp-bridge\.mjs') {
            throw 'Cannot verify the running Bridge process.'
        }
        foreach ($runtime in $health.runtimes) {
            if ($runtime.streaming -or !$runtime.ready) { throw 'Wait for the current OMP task to finish.' }
            $state = Invoke-RestMethod "$origin/api/state?cwd=$([Uri]::EscapeDataString($runtime.cwd))" -Headers $headers -TimeoutSec 4
            if ($state.request -or $state.state.isStreaming) { throw 'Wait for the current OMP task to finish.' }
        }
        Stop-Process -Id $processId
        Wait-Process -Id $processId -Timeout 10 -ErrorAction SilentlyContinue
        exit 0
    }

    if ($health) { exit 0 }
    if (Get-ListenerId) { throw "Port $($config.port) is already in use. Stop the other service or choose a free port in bridge\config.json." }
    $node = (Get-Command node.exe -ErrorAction SilentlyContinue).Source
    if (!$node) { throw 'Install Node.js before starting Bridge.' }
    $version = & $node --version
    if ($version -notmatch '^v(?:2[2-9]|[3-9][0-9])\.') { throw 'Bridge requires Node.js 22 or newer.' }
    $ompBinFile = Join-Path $bridgeDir 'omp-bin.txt'
    if (!$env:OMP_BIN -and (Test-Path -LiteralPath $ompBinFile)) {
        $env:OMP_BIN = (Get-Content -LiteralPath $ompBinFile -Raw).Trim()
    }
    # Read this installation's configuration even if another Bridge uses environment overrides.
    Remove-Item Env:OMPCHAT_BRIDGE_PORT,Env:OMPCHAT_BRIDGE_HOST,Env:OMPCHAT_BRIDGE_TOKEN -ErrorAction SilentlyContinue
    $child = Start-Process $node -ArgumentList ('"' + $entry + '"') -WorkingDirectory $bridgeDir -WindowStyle Hidden -PassThru `
        -RedirectStandardOutput (Join-Path $bridgeDir 'bridge.stdout.log') `
        -RedirectStandardError (Join-Path $bridgeDir 'bridge.stderr.log')
    for ($attempt = 0; $attempt -lt 30; $attempt++) {
        if (Get-Health) { exit 0 }
        if ($child.HasExited) { break }
        Start-Sleep -Milliseconds 500
    }
    throw "Bridge did not start. See $bridgeDir\bridge.stderr.log."
} catch {
    try { Add-Content -LiteralPath (Join-Path $bridgeDir 'launcher.log') -Value ("{0:o} {1}" -f (Get-Date), $_.Exception.Message) }
    catch {}
    [Console]::Error.WriteLine($_.Exception.Message)
    exit 1
}
