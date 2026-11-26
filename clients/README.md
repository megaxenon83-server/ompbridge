# Build the Windows and Android apps

On Windows, use Node.js 22 or newer. Run these commands from this directory.

```powershell
npm ci
npm run check
npm run build
npm run build:android
```

The Android build requires a JDK on PATH, Android SDK platform 35 and Build Tools 35.0.0. Set ANDROID_SDK_ROOT if the SDK is outside C:/Android. The repository includes the pinned ZXing dependency. Local APK builds generate a development signing key in .android-build. Keep that key for updates to a locally signed installation. The release signing key is private.

With Inno Setup 6 installed, compile windows/DesktopSetup.iss and windows/Setup.iss from the repository root. The Desktop installer reads the Windows build from clients/dist. Bridge ships its source directly and requires OMP separately. The relay can be built with Docker Compose in chatompompwol.
