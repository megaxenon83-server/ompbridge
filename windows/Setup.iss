#ifndef BridgeVersion
  #define BridgeVersion "2.9.90"
#endif
#ifndef BridgeAppId
  #define BridgeAppId "ChatOmpOmpBridge"
#endif

[Setup]
AppId={#BridgeAppId}
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
ArchitecturesAllowed=x64compatible or arm64
WizardStyle=modern
SetupIconFile=assets\omp-desktop-mark.ico
WizardImageFile=assets\bridge-wizard.bmp
WizardSmallImageFile=assets\bridge-wizard-small.bmp
UninstallDisplayIcon={app}\omp-desktop-mark.ico
CloseApplications=no
SetupLogging=yes
Compression=lzma2
SolidCompression=yes
OutputDir=dist
OutputBaseFilename=OMP-Bridge-Setup-{#BridgeVersion}

[Languages]
Name: "norwegian"; MessagesFile: "compiler:Languages\Norwegian.isl"
Name: "english"; MessagesFile: "compiler:Default.isl"

[CustomMessages]
norwegian.Update=Oppdater
english.Update=Update
norwegian.Repair=Reparer
english.Repair=Repair
norwegian.Remove=Avinstaller
english.Remove=Uninstall
norwegian.Existing=OMP Bridge %1 er installert. Denne pakken inneholder versjon %2. Innstillinger og mobilkoblinger beholdes.
english.Existing=OMP Bridge %1 is installed. This package contains version %2. Settings and mobile pairings are kept.
norwegian.Installed=OMP Bridge %1 er installert og kjører på port %2.
english.Installed=OMP Bridge %1 is installed and running on port %2.
norwegian.Updated=OMP Bridge er oppdatert til %1 og kjører på port %2.
english.Updated=OMP Bridge is updated to %1 and running on port %2.
norwegian.Repaired=OMP Bridge %1 er reparert og kjører på port %2.
english.Repaired=OMP Bridge %1 is repaired and running on port %2.
norwegian.VerifyFailed=Programfilene ble lagt inn, men Bridge kunne ikke bekreftes. Se %1.
english.VerifyFailed=The program files were copied, but Bridge could not be verified. See %1.
norwegian.RemoveConfirm=Avinstallere OMP Bridge? Samtaler, innstillinger og mobilkoblinger beholdes.
english.RemoveConfirm=Uninstall OMP Bridge? Chats, settings and mobile pairings are kept.
norwegian.RemoveFailed=Avinstalleringen ble ikke fullført.
english.RemoveFailed=The uninstall did not complete.

norwegian.NodePrompt=OMP Bridge trenger Node.js 22 eller nyere. Vil du laste ned Node.js og installere det for OMP Bridge? Dette krever ikke administrator.
english.NodePrompt=OMP Bridge requires Node.js 22 or newer. Download and install Node.js for OMP Bridge? Administrator privileges are not required.
norwegian.NodeRequired=OMP Bridge trenger Node.js 22 eller nyere. Velg Ja i installasjonsprogrammet for å installere det automatisk.
english.NodeRequired=OMP Bridge requires Node.js 22 or newer. Choose Yes in Setup to install it automatically.
norwegian.NodeDownload=Installerer Node.js for OMP Bridge
english.NodeDownload=Installing Node.js for OMP Bridge
norwegian.NodeFailed=Node.js kunne ikke installeres automatisk. Se installasjonsloggen for detaljer.
english.NodeFailed=Node.js could not be installed automatically. See the installer log for details.
norwegian.NodeFetching=Laster ned fra nodejs.org og kontrollerer filen.
english.NodeFetching=Downloading from nodejs.org and verifying the file.

[Tasks]
Name: "autostart"; Description: "Start OMP Bridge automatisk når jeg logger på Windows"
Name: "startmenu"; Description: "Legg til en snarvei i Start-menyen"

[Files]
Source: "assets\omp-desktop-mark.ico"; DestDir: "{app}"; Flags: ignoreversion
Source: "Bridge.ps1"; DestDir: "{app}"; Flags: ignoreversion
Source: "Bridge.ps1"; Flags: dontcopy
Source: "bridge\omp-bridge.mjs"; DestDir: "{app}\bridge"; Flags: ignoreversion
Source: "bridge\omp-recovery.yml"; DestDir: "{app}\bridge"; Flags: ignoreversion
Source: "bridge\machine-resources.cjs"; DestDir: "{app}\bridge"; Flags: ignoreversion
Source: "bridge\model-catalogue.cjs"; DestDir: "{app}\bridge"; Flags: ignoreversion
Source: "bridge\machine-resources.ps1"; DestDir: "{app}\bridge"; Flags: ignoreversion
Source: "bridge\omp-turn-changes.cjs"; DestDir: "{app}\bridge"; Flags: ignoreversion
Source: "bridge\omp-workspace.cjs"; DestDir: "{app}\bridge"; Flags: ignoreversion
Source: "bridge\local-models.cjs"; DestDir: "{app}\bridge"; Flags: ignoreversion
Source: "PolyStrata-Compat.ps1"; DestDir: "{app}"; Flags: ignoreversion
Source: "PolyStrata-Compat.ps1"; Flags: dontcopy
Source: "..\integration\polystrata\PolyStrata-main-omp-lock-fix.patch"; DestDir: "{app}\integration\polystrata"; Flags: ignoreversion
Source: "..\integration\polystrata\PolyStrata-main-omp-lock-fix.patch"; DestName: "PolyStrata-main-omp-lock-fix.patch"; Flags: dontcopy
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
Name: "{userstartup}\Chat OMP OMP Bridge"; Filename: "{sys}\WindowsPowerShell\v1.0\powershell.exe"; Parameters: "-NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File ""{app}\Bridge.ps1"""; Tasks: autostart; IconFilename: "{app}\omp-desktop-mark.ico"
Name: "{userprograms}\Chat OMP OMP\Start OMP Bridge"; Filename: "{sys}\WindowsPowerShell\v1.0\powershell.exe"; Parameters: "-NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File ""{app}\Bridge.ps1"""; Tasks: startmenu; IconFilename: "{app}\omp-desktop-mark.ico"

[UninstallDelete]
Type: files; Name: "{app}\runtime\node.exe"
Type: files; Name: "{app}\runtime\LICENSE"
Type: dirifempty; Name: "{app}\runtime"

[Code]
var
  BridgeExitCode: Integer;
  InstalledVersion, UninstallExe, BridgePort, FinishText: String;
  RemoveButton: TNewButton;
  Removed: Boolean;

const
  UninstallKey = 'Software\Microsoft\Windows\CurrentVersion\Uninstall\{#BridgeAppId}_is1';

procedure RemoveBridge(Sender: TObject);
var
  Code: Integer;
begin
  if MsgBox(CustomMessage('RemoveConfirm'), mbConfirmation, MB_YESNO) <> IDYES then Exit;
  if Exec(UninstallExe, '/SILENT /NORESTART', ExtractFileDir(UninstallExe), SW_SHOW, ewWaitUntilTerminated, Code) and (Code = 0) then
  begin
    Removed := True;
    WizardForm.Close;
  end
  else
    MsgBox(CustomMessage('RemoveFailed'), mbError, MB_OK);
end;

procedure CancelButtonClick(CurPageID: Integer; var Cancel, Confirm: Boolean);
begin
  if Removed then Confirm := False;
end;

procedure InitializeWizard;
var
  AppPath, Command: String;
begin
  RegQueryStringValue(HKCU, UninstallKey, 'DisplayVersion', InstalledVersion);
  if InstalledVersion = '' then Exit;
  WizardForm.WelcomeLabel2.Caption := FmtMessage(CustomMessage('Existing'), [InstalledVersion, '{#BridgeVersion}']);
  if RegQueryStringValue(HKCU, UninstallKey, 'Inno Setup: App Path', AppPath) and
     RegQueryStringValue(HKCU, UninstallKey, 'UninstallString', Command) then
  begin
    UninstallExe := RemoveQuotes(Command);
    if FileExists(UninstallExe) and (CompareText(ExtractFileDir(UninstallExe), AppPath) = 0) and
       (CompareText(Copy(ExtractFileName(UninstallExe), 1, 5), 'unins') = 0) then
    begin
      RemoveButton := TNewButton.Create(WizardForm);
      RemoveButton.Parent := WizardForm;
      RemoveButton.Left := ScaleX(10);
      RemoveButton.Top := WizardForm.CancelButton.Top;
      RemoveButton.Width := ScaleX(100);
      RemoveButton.Height := WizardForm.CancelButton.Height;
      RemoveButton.Caption := CustomMessage('Remove');
      RemoveButton.OnClick := @RemoveBridge;
      RemoveButton.Visible := False;
    end;
  end;
end;

procedure CurPageChanged(CurPageID: Integer);
begin
  if Assigned(RemoveButton) then RemoveButton.Visible := CurPageID = wpWelcome;
  if (InstalledVersion <> '') and (CurPageID = wpReady) then
  begin
    if InstalledVersion = '{#BridgeVersion}' then
      WizardForm.NextButton.Caption := CustomMessage('Repair')
    else
      WizardForm.NextButton.Caption := CustomMessage('Update');
    WizardForm.PageNameLabel.Caption := WizardForm.NextButton.Caption + ' OMP Bridge';
    WizardForm.ReadyLabel.Caption := FmtMessage(CustomMessage('Existing'), [InstalledVersion, '{#BridgeVersion}']);
  end;
  if (CurPageID = wpFinished) and (FinishText <> '') then
    WizardForm.FinishedLabel.Caption := FinishText;
end;

function RunBridge(const Script, Action: String): Boolean;
begin
  BridgeExitCode := -1;
  Result := Exec(ExpandConstant('{sys}\WindowsPowerShell\v1.0\powershell.exe'),
    '-NoProfile -ExecutionPolicy Bypass -File "' + Script + '" -Action ' + Action +
    ' -InstallDir "' + ExpandConstant('{app}') + '"', '', SW_HIDE, ewWaitUntilTerminated, BridgeExitCode) and (BridgeExitCode = 0);
end;

function EnsureNode(const Script: String): String;
var
  Download: TDownloadWizardPage;
  Platform, Hash: String;
begin
  Result := '';
  if RunBridge(Script, 'CheckNode') then Exit;
  if WizardSilent then
  begin
    if ExpandConstant('{param:INSTALLNODE|0}') <> '1' then
    begin
      Result := CustomMessage('NodeRequired');
      Exit;
    end;
  end
  else if MsgBox(CustomMessage('NodePrompt'), mbConfirmation, MB_YESNO or MB_DEFBUTTON2) <> IDYES then
  begin
    Result := CustomMessage('NodeRequired');
    Exit;
  end;
  if IsArm64 then
  begin
    Platform := 'arm64';
    Hash := 'b3cc74a295b39d4f273271e96f58c06dd2b35757ca12abec64c7d0598b434f14';
  end
  else
  begin
    Platform := 'x64';
    Hash := 'e612af99f626ab415ea225af6bce5c971feb448cb5cae250bb1c3fa50c5f7d9f';
  end;
  Download := CreateDownloadPage(CustomMessage('NodeDownload'), CustomMessage('NodeFetching'), nil);
  Download.Add('https://nodejs.org/dist/v24.22.3/node-v24.22.3-win-' + Platform + '.zip', 'omp-node.zip', Hash);
  Download.Show;
  try
    try
      Download.Download;
      if not RunBridge(Script, 'InstallNode') then
      begin
        Log('Node.js installation failed. Exit code: ' + IntToStr(BridgeExitCode));
        Result := CustomMessage('NodeFailed');
      end;
    except
      Log(GetExceptionMessage);
      Result := CustomMessage('NodeFailed') + ' ' + GetExceptionMessage;
    end;
  finally
    Download.Hide;
  end;
end;

function EnsurePolyStrataCompat: String;
var
  Code: Integer;
  Command, DirParam, RuntimeUrl, LogFile, ErrorFile: String;
  ErrorText: AnsiString;
begin
  Result := '';
  LogFile := ExpandConstant('{tmp}\polystrata-compat.log');
  ErrorFile := ExpandConstant('{tmp}\polystrata-compat-error.txt');
  ExtractTemporaryFile('PolyStrata-Compat.ps1');
  ExtractTemporaryFile('PolyStrata-main-omp-lock-fix.patch');
  DirParam := ExpandConstant('{param:POLYSTRATA|}');
  RuntimeUrl := ExpandConstant('{param:POLYSTRATA_URL|http://127.0.0.1:8080}');
  Command := '-NoProfile -ExecutionPolicy Bypass -File "' + ExpandConstant('{tmp}\PolyStrata-Compat.ps1') + '"' +
    ' -PatchFile "' + ExpandConstant('{tmp}\PolyStrata-main-omp-lock-fix.patch') + '"' +
    ' -RuntimeUrl "' + RuntimeUrl + '"' +
    ' -LogFile "' + LogFile + '"' +
    ' -ErrorFile "' + ErrorFile + '"';
  if DirParam <> '' then
    Command := Command + ' -PolyStrataDir "' + DirParam + '"';
  if Exec(ExpandConstant('{sys}\WindowsPowerShell\v1.0\powershell.exe'), Command, '', SW_HIDE,
          ewWaitUntilTerminated, Code) then
  begin
    if Code = 0 then
    begin
      Log('PolyStrata compatibility check passed.');
      Exit;
    end;
    if not LoadStringFromFile(ErrorFile, ErrorText) then
      ErrorText := 'PolyStrata could not be made compatible (exit ' + IntToStr(Code) + ').';
    Result := String(ErrorText) + #13#10 + 'See ' + LogFile + ' for details.';
    Log('PolyStrata compatibility failed: ' + Result);
  end
  else
    Result := 'Could not run the PolyStrata compatibility check.';
end;

function PrepareToInstall(var NeedsRestart: Boolean): String;
begin
  ExtractTemporaryFile('Bridge.ps1');
  Result := EnsurePolyStrataCompat;
  if Result <> '' then Exit;
  Result := EnsureNode(ExpandConstant('{tmp}\Bridge.ps1'));
  if Result <> '' then Exit;
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

function VerifyBridge: Boolean;
var
  Code: Integer;
  StatusFile: String;
  PortText: AnsiString;
begin
  StatusFile := ExpandConstant('{tmp}\bridge-verified-port.txt');
  Result := Exec(ExpandConstant('{sys}\WindowsPowerShell\v1.0\powershell.exe'),
    '-NoProfile -ExecutionPolicy Bypass -File "' + ExpandConstant('{app}\Bridge.ps1') +
    '" -Action Verify -InstallDir "' + ExpandConstant('{app}') + '" -ExpectedVersion "{#BridgeVersion}" -StatusFile "' +
    StatusFile + '"', '', SW_HIDE, ewWaitUntilTerminated, Code) and (Code = 0);
  if Result then
    Result := LoadStringFromFile(StatusFile, PortText);
  BridgePort := Trim(String(PortText));
  Result := Result and (BridgePort <> '');
end;

procedure CurStepChanged(CurStep: TSetupStep);
var
  Key: String;
begin
  if CurStep <> ssPostInstall then Exit;
  if RunBridge(ExpandConstant('{app}\Bridge.ps1'), 'MigratePort') and
     RunBridge(ExpandConstant('{app}\Bridge.ps1'), 'Start') and VerifyBridge then
  begin
    if InstalledVersion = '' then Key := 'Installed'
    else if InstalledVersion = '{#BridgeVersion}' then Key := 'Repaired'
    else Key := 'Updated';
    FinishText := FmtMessage(CustomMessage(Key), ['{#BridgeVersion}', BridgePort]);
    Log(FinishText);
  end
  else
  begin
    FinishText := FmtMessage(CustomMessage('VerifyFailed'), [ExpandConstant('{app}\bridge\launcher.log')]);
    Log(FinishText);
    SuppressibleMsgBox(FinishText, mbError, MB_OK, IDOK);
  end;
end;

function InitializeUninstall: Boolean;
begin
  Result := RunBridge(ExpandConstant('{app}\Bridge.ps1'), 'Stop');
  if not Result then
    SuppressibleMsgBox('Bridge kunne ikke stoppes. Avslutt aktive OMP-oppgaver og prøv igjen.', mbError, MB_OK, IDOK);
end;
