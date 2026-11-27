// Build helper: the machine's JDK 17 and Gradle 8.9 are not on PATH, so both
// are pinned here instead of relying on the shell environment.
//
//   .\build.ps1 run                    - start the app from Gradle
//   .\build.ps1 createDistributable    - portable app-image with an .exe
//   .\build.ps1 packageExe             - jpackage .exe installer (needs WiX)
//   .\build.ps1 packageMsi             - jpackage .msi installer (needs WiX)
param(
    [Parameter(Position = 0)]
    [string]$Task = "run",
    [switch]$Clean
)

$ErrorActionPreference = "Stop"

$env:JAVA_HOME = "C:\Prosjekter\Inkling\tools\jdk-17.0.20.101-hotspot"
$gradle = "C:\Prosjekter\Inkling\tools\gradle-8.9\bin\gradle.bat"

if (-not (Test-Path "$env:JAVA_HOME\bin\java.exe")) { throw "Fant ikke JDK 17 i $env:JAVA_HOME" }
if (-not (Test-Path $gradle)) { throw "Fant ikke Gradle i $gradle" }

$here = Split-Path -Parent $MyInvocation.MyCommand.Path
if ($Clean) { & $gradle -p $here clean }
& $gradle -p $here ":$Task" --console=plain
exit $LASTEXITCODE
