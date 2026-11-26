param(
    [ValidateSet('Start','Stop','CheckUpgradePort','MigratePort','Verify','CheckNode','InstallNode')][string]$Action = 'Start',
    [string]$InstallDir = $PSScriptRoot,
    [string]$ExpectedVersion,
    [string]$StatusFile
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

function Get-ListenerId([int]$port = [int]$config.port) {
    foreach ($line in (& netstat.exe -ano -p tcp)) {
        if ($line -match "^\s*TCP\s+\S+:${port}\s+\S+\s+LISTENING\s+(\d+)\s*$") {
            return [int]$Matches[1]
        }
    }
}

function Find-BridgeNode {
    $candidates = @((Join-Path $InstallDir 'runtime\node.exe'))
    $candidates += @(Get-Command node.exe -CommandType Application -All -ErrorAction SilentlyContinue | Select-Object -ExpandProperty Source)
    foreach ($root in @($env:ProgramW6432, $env:ProgramFiles, [Environment]::GetFolderPath('ProgramFiles'))) {
        if ($root) { $candidates += Join-Path $root 'nodejs\node.exe' }
    }
    foreach ($candidate in ($candidates | Select-Object -Unique)) {
        if (!(Test-Path -LiteralPath $candidate -PathType Leaf)) { continue }
        try {
            $version = & $candidate --version 2>$null
            if ($LASTEXITCODE -eq 0 -and $version -match '^v(\d+)\.' -and [int]$Matches[1] -ge 22) {
                return $candidate
            }
        } catch {}
    }
}

try {
    if ($Action -eq 'CheckNode') {
        if (Find-BridgeNode) { exit 0 }
        exit 3
    }
    if ($Action -eq 'InstallNode') {
        $archive = Join-Path $PSScriptRoot 'omp-node.zip'
        $staging = Join-Path $PSScriptRoot ('node-extract-' + [guid]::NewGuid().ToString('N'))
        New-Item -ItemType Directory -Path $staging | Out-Null
        Add-Type -AssemblyName System.IO.Compression.FileSystem
        $zip = [IO.Compression.ZipFile]::OpenRead($archive)
        try {
            $executables = @($zip.Entries | Where-Object FullName -match '^node-v24\.22\.3-win-(x64|arm64)/node\.exe$')
            if ($executables.Count -ne 1) { throw 'The Node.js archive did not contain a single executable.' }
            $node = $executables[0]
            $license = $zip.GetEntry($node.FullName.Replace('/node.exe', '/LICENSE'))
            if (!$license) { throw 'The Node.js license is missing.' }
            [IO.Compression.ZipFileExtensions]::ExtractToFile($node, (Join-Path $staging 'node.exe'))
            [IO.Compression.ZipFileExtensions]::ExtractToFile($license, (Join-Path $staging 'LICENSE'))
        } finally {
            $zip.Dispose()
        }
        $version = & (Join-Path $staging 'node.exe') --version
        if ($LASTEXITCODE -ne 0 -or $version -ne 'v24.22.3') { throw 'Unexpected Node.js runtime version.' }
        $runtime = Join-Path $InstallDir 'runtime'
        New-Item -ItemType Directory -Path $runtime -Force | Out-Null
        Copy-Item -LiteralPath (Join-Path $staging 'node.exe'),(Join-Path $staging 'LICENSE') -Destination $runtime -Force
        if (!(Find-BridgeNode)) { throw 'The Node.js runtime could not be verified.' }
        exit 0
    }
    if (!(Test-Path -LiteralPath $configFile)) {
        if ($Action -eq 'Verify') { throw 'Bridge config missing.' }
        if ($Action -ne 'Start') { exit 0 }
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
    if ($Action -in 'CheckUpgradePort','MigratePort') {
        if ($config.port -ne 7778) { exit 0 }
        if (Get-ListenerId 27778) { throw 'The new default port 27778 is occupied.' }
        if ($Action -eq 'MigratePort') {
            $config.port = 27778
            $temp = $configFile + '.port-migration'
            [IO.File]::WriteAllText($temp, ($config | ConvertTo-Json -Depth 40))
            [IO.File]::Replace($temp, $configFile, ($configFile + '.before-27778'))
        }
        exit 0
    }
    $origin = "http://127.0.0.1:$($config.port)"
    $headers = @{ Authorization = 'Bearer ' + $config.token }
    $health = Get-Health
    if ($Action -eq 'Verify') {
        if (!$health.ok -or $health.version -ne $ExpectedVersion) {
            throw "Expected Bridge $ExpectedVersion on port $($config.port)."
        }
        [IO.File]::WriteAllText($StatusFile, [string]$config.port)
        exit 0
    }

    if ($Action -eq 'Stop') {
        if (!$health) {
            if (Get-ListenerId) {
                [Console]::Error.WriteLine("Port $($config.port) is occupied by a process that rejects this Bridge installation's token.")
                if ($config.port -eq 27778) { exit 4 }
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
    $node = Find-BridgeNode
    if (!$node) { throw 'Bridge requires Node.js 22 or newer.' }
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
