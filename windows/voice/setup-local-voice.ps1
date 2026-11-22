param([Parameter(Mandatory=$true)][string]$VoiceDir)
$ErrorActionPreference = 'Stop'
$venv = Join-Path $VoiceDir 'venv'
$python = Join-Path $venv 'Scripts\python.exe'
if (!(Test-Path -LiteralPath $python)) {
    & python.exe -m venv $venv
    if ($LASTEXITCODE -ne 0) { throw 'Python 3.11 is required to set up local speech.' }
}
& $python -m pip --disable-pip-version-check install faster-whisper==1.2.1 piper-tts==1.3.0
if ($LASTEXITCODE -ne 0) { throw 'Voice dependencies could not be installed.' }
& $python (Join-Path $VoiceDir 'voice_runtime.py') install
if ($LASTEXITCODE -ne 0) { throw 'Voice models could not be installed.' }
