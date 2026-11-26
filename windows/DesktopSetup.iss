#ifndef DesktopVersion
  #define DesktopVersion "0.8.25"
#endif
#ifndef DesktopPayload
  #define DesktopPayload "..\clients\dist\" + DesktopVersion + "\OMP Desktop"
#endif

[Setup]
AppId=NimayOMPDesktop
AppName=OMP Desktop
AppVersion={#DesktopVersion}
AppPublisher=Megaxenon
AppPublisherURL=https://github.com/megaxenon83-server/ompbridge
DefaultDirName={localappdata}\Programs\OMP Desktop
DefaultGroupName=OMP Desktop
PrivilegesRequired=lowest
MinVersion=10.0
ArchitecturesAllowed=x64compatible
ArchitecturesInstallIn64BitMode=x64compatible
CloseApplications=yes
RestartApplications=no
WizardStyle=modern
OutputDir=dist
OutputBaseFilename=OMP-Desktop-Setup-{#DesktopVersion}-win-x64
Compression=lzma2/fast

[Languages]
Name: "norwegian"; MessagesFile: "compiler:Languages\Norwegian.isl"
Name: "english"; MessagesFile: "compiler:Default.isl"

[Tasks]
Name: "desktopicon"; Description: "{cm:CreateDesktopIcon}"; Flags: unchecked
Name: "autostart"; Description: "Start OMP Desktop when I sign in"; Flags: unchecked

[Files]
Source: "{#DesktopPayload}\*"; DestDir: "{app}"; Flags: ignoreversion recursesubdirs createallsubdirs

[Icons]
Name: "{group}\OMP Desktop"; Filename: "{app}\OMP Desktop.exe"
Name: "{userdesktop}\OMP Desktop"; Filename: "{app}\OMP Desktop.exe"; Tasks: desktopicon

[Registry]
Root: HKCU; Subkey: "Software\Microsoft\Windows\CurrentVersion\Run"; ValueType: string; ValueName: "OMP Desktop"; ValueData: """{app}\OMP Desktop.exe"""; Tasks: autostart; Flags: uninsdeletevalue

[Run]
Filename: "{app}\OMP Desktop.exe"; Description: "{cm:LaunchProgram,OMP Desktop}"; Flags: nowait postinstall skipifsilent
