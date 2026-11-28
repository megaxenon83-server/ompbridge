#ifndef DesktopVersion
  #define DesktopVersion "0.9.2"
#endif
#ifndef DesktopPayload
  #define DesktopPayload "..\desktop-native\app\build\compose\binaries\main\app\OMP Desktop"
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

[InstallDelete]
; The native app replaces the Electron build in the same folder.
Type: files; Name: "{app}\icudtl.dat"
Type: files; Name: "{app}\snapshot_blob.bin"
Type: files; Name: "{app}\v8_context_snapshot.bin"
Type: files; Name: "{app}\vk_swiftshader_icd.json"
Type: files; Name: "{app}\LICENSES.chromium.html"
Type: files; Name: "{app}\LICENSE"
Type: filesandordirs; Name: "{app}\resources"
Type: filesandordirs; Name: "{app}\locales"
Type: files; Name: "{app}\*.dll"
Type: files; Name: "{app}\*.pak"
Type: files; Name: "{app}\version"

[Files]
Source: "{#DesktopPayload}\*"; DestDir: "{app}"; Flags: ignoreversion recursesubdirs createallsubdirs

[Icons]
Name: "{group}\OMP Desktop"; Filename: "{app}\OMP Desktop.exe"
Name: "{userdesktop}\OMP Desktop"; Filename: "{app}\OMP Desktop.exe"; Tasks: desktopicon

[Registry]
Root: HKCU; Subkey: "Software\Microsoft\Windows\CurrentVersion\Run"; ValueType: string; ValueName: "OMP Desktop"; ValueData: """{app}\OMP Desktop.exe"""; Tasks: autostart; Flags: uninsdeletevalue

[Run]
Filename: "{app}\OMP Desktop.exe"; Description: "{cm:LaunchProgram,OMP Desktop}"; Flags: nowait postinstall skipifsilent
