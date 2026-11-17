<#
.SYNOPSIS
    Builds the Nimay OMP Bridge Windows installer from the repository sources.

.DESCRIPTION
    Stages a fresh payload (bridge, tools, commands) next to the Inno Setup
    script, compiles it and copies the resulting .exe to the output folder.
    The payload is always rebuilt from source, so the installer can never ship
    a stale bridge.

.PARAMETER Version
    Version written into the installer (default 2.9.27).

.PARAMETER OutputDir
    Where the .exe is copied (default: repository root / dist).
#>
param(
    [string]$Version = "2.9.27",
    [string]$OutputDir = ""
)

$ErrorActionPreference = "Stop"

$scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$root = Split-Path -Parent $scriptDir
$repoRoot = Split-Path -Parent $root

if ([string]::IsNullOrWhiteSpace($OutputDir)) {
    $OutputDir = Join-Path $repoRoot "dist"
}
New-Item -ItemType Directory -Force -Path $OutputDir | Out-Null
$OutputDir = (Resolve-Path $OutputDir).Path

$stage = Join-Path $scriptDir "stage"
if (Test-Path $stage) { Remove-Item -Recurse -Force $stage }
$payload = Join-Path $stage "payload"
New-Item -ItemType Directory -Force -Path (Join-Path $payload "bridge") | Out-Null
New-Item -ItemType Directory -Force -Path (Join-Path $payload "tools") | Out-Null
New-Item -ItemType Directory -Force -Path (Join-Path $payload "commands") | Out-Null

Copy-Item -Force (Join-Path $root "bridge\omp-bridge.mjs") (Join-Path $payload "bridge\omp-bridge.mjs")
Copy-Item -Force (Join-Path $root "bridge\config.template.json") (Join-Path $payload "bridge\config.template.json")
Copy-Item -Recurse -Force (Join-Path $root "tools\*") (Join-Path $payload "tools")
Copy-Item -Recurse -Force (Join-Path $root "commands\*") (Join-Path $payload "commands")

$issSource = Join-Path $scriptDir "Nimay-OMP-Bridge-Setup.iss"
$issTarget = Join-Path $stage "Nimay-OMP-Bridge-Setup.iss"
$iss = Get-Content -Raw $issSource
$iss = $iss -replace '(?m)^#define MyAppVersion\s+"[^"]*"', "#define MyAppVersion `"$Version`""
Set-Content -Path $issTarget -Value $iss -Encoding UTF8

$iscc = $null
foreach ($candidate in @(
    "C:\Program Files (x86)\Inno Setup 6\ISCC.exe",
    "C:\Program Files\Inno Setup 6\ISCC.exe"
)) {
    if (Test-Path $candidate) { $iscc = $candidate; break }
}
if (-not $iscc) {
    $cmd = Get-Command "iscc.exe" -ErrorAction SilentlyContinue
    if ($cmd) { $iscc = $cmd.Source }
}
if (-not $iscc) {
    throw "Inno Setup compiler (ISCC.exe) not found. Install Inno Setup 6 before building."
}

Write-Host "[build-installer] Compiling with $iscc"
Push-Location $stage
try {
    & $iscc "Nimay-OMP-Bridge-Setup.iss"
    if ($LASTEXITCODE -ne 0) { throw "Inno Setup failed with exit code $LASTEXITCODE" }
} finally {
    Pop-Location
}

$built = Join-Path $stage "dist\Nimay-OMP-Bridge-Setup-$Version.exe"
if (-not (Test-Path $built)) { throw "Installer not found at $built" }

$target = Join-Path $OutputDir "Nimay-OMP-Bridge-Setup-$Version.exe"
Copy-Item -Force $built $target
Write-Host "[build-installer] Created $target"
