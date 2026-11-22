#define BridgeVersion "2.9.38"

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
function RunBridge(const Script, Action: String): Boolean;
var
  Code: Integer;
begin
  Result := Exec(ExpandConstant('{sys}\WindowsPowerShell\v1.0\powershell.exe'),
    '-NoProfile -ExecutionPolicy Bypass -File "' + Script + '" -Action ' + Action +
    ' -InstallDir "' + ExpandConstant('{app}') + '"', '', SW_HIDE, ewWaitUntilTerminated, Code) and (Code = 0);
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
  if not RunBridge(ExpandConstant('{tmp}\Bridge.ps1'), 'Stop') then
    Result := 'Bridge kunne ikke stoppes. Vent til aktive OMP-oppgaver er ferdige, og sjekk at porten er ledig.';
end;

procedure CurStepChanged(CurStep: TSetupStep);
begin
  if (CurStep = ssPostInstall) and not RunBridge(ExpandConstant('{app}\Bridge.ps1'), 'Start') then
    SuppressibleMsgBox('Bridge kunne ikke starte. Se bridge.stderr.log i installasjonsmappen.', mbError, MB_OK, IDOK);
end;

function InitializeUninstall: Boolean;
begin
  Result := RunBridge(ExpandConstant('{app}\Bridge.ps1'), 'Stop');
  if not Result then
    SuppressibleMsgBox('Bridge kunne ikke stoppes. Avslutt aktive OMP-oppgaver og prøv igjen.', mbError, MB_OK, IDOK);
end;
