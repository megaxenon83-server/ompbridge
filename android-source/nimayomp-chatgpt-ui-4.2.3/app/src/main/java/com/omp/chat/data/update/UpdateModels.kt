package com.omp.chat.data.update

data class UpdateManifest(
    val releaseTag: String = "",
    val publishedAt: String = "",
    val releaseUrl: String = "",
    val notesUrl: String = "",
    val app: AppUpdateInfo? = null,
    val bridge: BridgeUpdateInfo? = null
)

data class AppUpdateInfo(
    val name: String = "",
    val versionName: String = "",
    val versionCode: Int = 0,
    val fileName: String = "",
    val url: String = "",
    val sha256: String = "",
    val changelog: String = ""
)

data class BridgeDownloadInfo(
    val label: String = "",
    val fileName: String = "",
    val url: String = "",
    val sha256: String = ""
)

data class BridgeUpdateInfo(
    val name: String = "",
    val version: String = "",
    val changelog: String = "",
    val checksumsUrl: String = "",
    val downloads: Map<String, BridgeDownloadInfo> = emptyMap()
)

data class UpdateCheckResult(
    val manifest: UpdateManifest? = null,
    val appUpdateAvailable: Boolean = false,
    val bridgeUpdateAvailable: Boolean = false,
    val latestAppVersion: String = "",
    val latestBridgeVersion: String = "",
    val installedAppVersion: String = "",
    val installedBridgeVersion: String = "",
    val error: String = "",
    val source: String = "" // "omp" or "github"
)

enum class UpdateCheckState {
    IDLE,
    CHECKING,
    UP_TO_DATE,
    UPDATE_AVAILABLE,
    ERROR
}

data class UpdateUiState(
    val state: UpdateCheckState = UpdateCheckState.IDLE,
    val result: UpdateCheckResult? = null,
    val lastCheckedAt: Long = 0L,
    val checking: Boolean = false,
    val installing: Boolean = false,
    val installProgress: String = "",
    val showStartupDialog: Boolean = false,
    val startupDialogDismissedThisSession: Boolean = false
)
