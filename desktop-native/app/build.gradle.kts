import org.jetbrains.compose.desktop.application.dsl.TargetFormat

plugins {
    kotlin("jvm")
    id("org.jetbrains.compose")
}

kotlin {
    jvmToolchain(17)
}

dependencies {
    // Compose Multiplatform desktop (Material 3 UI, same design language as the
    // Android app). `currentOs` picks the Skiko build for the machine we build on.
    implementation(compose.desktop.currentOs)
    implementation(compose.material3)
    // Same icon set as android-native (Folder, AccountTree, Terminal, ...).
    implementation(compose.materialIconsExtended)

    // Same HTTP stack as android-native: OkHttp for JSON calls and okhttp-sse for
    // the /api/events stream, so the BridgeClient pattern is shared.
    implementation("com.squareup.okhttp3:okhttp:4.12.0")
    implementation("com.squareup.okhttp3:okhttp-sse:4.12.0")

    // android-native uses the platform's org.json; on desktop it is a library.
    implementation("org.json:json:20240303")

    // Dispatchers.Main on desktop (Swing event loop for Compose).
    implementation("org.jetbrains.kotlinx:kotlinx-coroutines-swing:1.8.1")
}

compose.desktop {
    application {
        mainClass = "net.nimay.chatompomp.desktop.MainKt"
        jvmArgs += listOf("-Dfile.encoding=UTF-8", "-Dsun.java2d.uiScale.enabled=true")

        nativeDistributions {
            // .exe/.msi are jpackage installers; `createDistributable` also builds
            // a portable app-image folder with the launcher exe.
            targetFormats(TargetFormat.Exe, TargetFormat.Msi)
            packageName = "OMP Desktop"
            packageVersion = "1.14.0"
            description = "OMP Desktop - native Compose client for OMP Bridge"
            vendor = "Nimay"
            copyright = "(c) 2026 Nimay"

            // OkHttp needs java.naming; HTTPS pairing (chatomp:// links) needs EC.
            modules("java.naming", "java.net.http", "jdk.crypto.ec")

            windows {
                menuGroup = "OMP"
                shortcut = true
                menu = true
                dirChooser = true
                perUserInstall = true
                upgradeUuid = "2b7e0d6c-5a41-4f0e-9c3d-6f41a0b7c114"
            }
        }
    }
}
