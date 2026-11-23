#define BridgeVersion "2.9.44"

[Setup]
AppId=ChatOmpOmpBridge
AppName=OMP Bridge for Chat OMP OMP
AppVersion={#BridgeVersion}
AppPublisher=Megaxenon
AppPublisherURL=https://github.com/megaxenon83-server/ompbridge
DefaultDirName={localappdata}\Nimay\OMPBridge
DisableDirPage=yes
DisableProgramGroupPage=yes
DisableWelcomePage=no
PrivilegesRequired=lowest
MinVersion=10.0
WizardStyle=modern
CloseApplications=no
Compression=lzma2
SolidCompression=yes
OutputDir=dist
OutputBaseFilename=OMP-Bridge-Setup-{#BridgeVersion}

[Languages]
Name: "norwegian"; MessagesFile: "compiler:Languages\Norwegian.isl"
Name: "english"; MessagesFile: "compiler:Default.isl"

[Tasks]
Name: "autostart"; Description: "Start OMP Bridge automatisk når jeg logger på Windows"
Name: "startmenu"; Description: "Legg til en snarvei i Start-menyen"

[Files]
Source: "Bridge.ps1"; DestDir: "{app}"; Flags: ignoreversion
Source: "Bridge.ps1"; Flags: dontcopy
Source: "bridge\omp-bridge.mjs"; DestDir: "{app}\bridge"; Flags: ignoreversion
Source: "bridge\omp-turn-changes.cjs"; DestDir: "{app}\bridge"; Flags: ignoreversion
Source: "bridge\omp-workspace.cjs"; DestDir: "{app}\bridge"; Flags: ignoreversion
Source: "bridge\local-models.cjs"; DestDir: "{app}\bridge"; Flags: ignoreversion
Source: "voice\setup-local-voice.ps1"; DestDir: "{app}\voice"; Flags: ignoreversion
Source: "voice\voice_runtime.py"; DestDir: "{app}\voice"; Flags: ignoreversion
Source: "bridge\workspace-extension.mjs"; DestDir: "{app}\bridge"; Flags: ignoreversion
Source: "bridge\project-plugins.mjs"; DestDir: "{app}\bridge"; Flags: ignoreversion
Source: "bridge\skill-catalog.cjs"; DestDir: "{app}\bridge"; Flags: ignoreversion
Source: "bridge\skill-library.cjs"; DestDir: "{app}\bridge"; Flags: ignoreversion
Source: "bridge\adb.cjs"; DestDir: "{app}\bridge"; Flags: ignoreversion
Source: "bridge\device-action.ps1"; DestDir: "{app}\bridge"; Flags: ignoreversion
Source: "bridge\skills\device-control\SKILL.md"; DestDir: "{app}\bridge\skills\device-control"; Flags: ignoreversion
Source: "..\LICENSE"; DestDir: "{app}"; Flags: ignoreversion

[Icons]
Name: "{userstartup}\Chat OMP OMP Bridge"; Filename: "{sys}\WindowsPowerShell\v1.0\powershell.exe"; Parameters: "-NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File ""{app}\Bridge.ps1"""; Tasks: autostart
Name: "{userprograms}\Chat OMP OMP\Start OMP Bridge"; Filename: "{sys}\WindowsPowerShell\v1.0\powershell.exe"; Parameters: "-NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File ""{app}\Bridge.ps1"""; Tasks: startmenu

[Code]
var
  BridgeExitCode: Integer;

function RunBridge(const Script, Action: String): Boolean;
begin
  BridgeExitCode := -1;
  Result := Exec(ExpandConstant('{sys}\WindowsPowerShell\v1.0\powershell.exe'),
    '-NoProfile -ExecutionPolicy Bypass -File "' + Script + '" -Action ' + Action +
    ' -InstallDir "' + ExpandConstant('{app}') + '"', '', SW_HIDE, ewWaitUntilTerminated, BridgeExitCode) and (BridgeExitCode = 0);
end;

function PrepareToInstall(var NeedsRestart: Boolean): String;
var
  Code: Integer;
begin
  Result := '';
  if not Exec(ExpandConstant('{sys}\where.exe'), 'node.exe', '', SW_HIDE, ewWaitUntilTerminated, Code) or (Code <> 0) then
  begin
    Result := 'Installer Node.js 22 eller nyere, og start installasjonsprogrammet igjen.';
    Exit;
  end;
  ExtractTemporaryFile('Bridge.ps1');
  if not RunBridge(ExpandConstant('{tmp}\Bridge.ps1'), 'CheckUpgradePort') then
  begin
    Result := 'Kontroller at port 27778 er ledig og at Bridge-konfigurasjonen kan leses. Se bridge\launcher.log.';
    Exit;
  end;
  if not RunBridge(ExpandConstant('{tmp}\Bridge.ps1'), 'Stop') then
  begin
    if BridgeExitCode = 2 then
      Result := ''
    else if BridgeExitCode = 4 then
      Result := 'En annen tjeneste svarer på port 27778, men avviser installasjonens token.'
    else
      Result := 'Bridge kunne ikke stoppes trygt. Vent til aktive oppgaver er ferdige. Sjekk bridge\launcher.log hvis problemet fortsetter.';
  end;
end;

procedure CurStepChanged(CurStep: TSetupStep);
begin
  if CurStep = ssPostInstall then
  begin
    if not RunBridge(ExpandConstant('{app}\Bridge.ps1'), 'MigratePort') then
      SuppressibleMsgBox('Kunne ikke flytte Bridge til port 27778. Se bridge\launcher.log.', mbError, MB_OK, IDOK)
    else if not RunBridge(ExpandConstant('{app}\Bridge.ps1'), 'Start') then
      SuppressibleMsgBox('Bridge kunne ikke starte. Se bridge.stderr.log i installasjonsmappen.', mbError, MB_OK, IDOK);
  end;
end;

function InitializeUninstall: Boolean;
begin
  Result := RunBridge(ExpandConstant('{app}\Bridge.ps1'), 'Stop');
  if not Result then
    SuppressibleMsgBox('Bridge kunne ikke stoppes. Avslutt aktive OMP-oppgaver og prøv igjen.', mbError, MB_OK, IDOK);
end;
