package com.omp.chat.data.update

import android.content.Context
import android.content.Intent
import android.net.Uri
import androidx.core.content.FileProvider
import com.google.gson.Gson
import com.google.gson.JsonObject
import com.google.gson.JsonParser
import com.omp.chat.BuildConfig
import okhttp3.OkHttpClient
import okhttp3.Request
import java.io.File
import java.io.FileOutputStream
import java.security.MessageDigest
import java.util.concurrent.TimeUnit

object ReleaseUpdateChecker {
    private const val OMP_MANIFEST_URL = "https://omp.nimay.net/updates/latest.json"
    private const val GITHUB_LATEST_URL = "https://api.github.com/repos/megaxenon83-server/ompbridge/releases/latest"
    private const val PREFS = "ompchat_updates"
    private const val KEY_LAST_CHECK = "last_check_at"
    private const val KEY_NOTIFIED_BRIDGE = "notified_bridge_version"
    private const val KEY_LAST_MANIFEST_TAG = "last_manifest_tag"

    private val gson = Gson()
    private val client = OkHttpClient.Builder()
        .connectTimeout(15, TimeUnit.SECONDS)
        .readTimeout(30, TimeUnit.SECONDS)
        .build()

    fun prefs(context: Context) = context.getSharedPreferences(PREFS, Context.MODE_PRIVATE)

    fun lastCheckAt(context: Context): Long = prefs(context).getLong(KEY_LAST_CHECK, 0L)
    fun setLastCheckAt(context: Context, ts: Long) { prefs(context).edit().putLong(KEY_LAST_CHECK, ts).apply() }
    fun notifiedBridgeVersion(context: Context): String = prefs(context).getString(KEY_NOTIFIED_BRIDGE, "") ?: ""
    fun setNotifiedBridgeVersion(context: Context, v: String) { prefs(context).edit().putString(KEY_NOTIFIED_BRIDGE, v).apply() }

    fun shouldAutoCheck(context: Context, now: Long = System.currentTimeMillis(), cooldownMs: Long = 24L * 60 * 60 * 1000): Boolean {
        val last = lastCheckAt(context)
        return last <= 0L || now - last >= cooldownMs
    }

    fun check(context: Context, installedBridgeVersion: String, force: Boolean = false): UpdateCheckResult {
        val installedApp = normalizeAppVersion(BuildConfig.VERSION_NAME)
        val manifest = fetchManifestFromOmp() ?: fetchManifestFromGitHub()
        if (manifest == null) {
            return UpdateCheckResult(
                installedAppVersion = installedApp,
                installedBridgeVersion = installedBridgeVersion,
                error = "Could not fetch update information"
            )
        }
        val latestApp = normalizeAppVersion(manifest.app?.versionName.orEmpty())
        val latestBridge = manifest.bridge?.version.orEmpty().ifBlank { parseBridgeFromTag(manifest.releaseTag) }
        val appAvailable = isVersionNewer(latestApp, installedApp)
        val bridgeAvailable = latestBridge.isNotBlank() && installedBridgeVersion.isNotBlank() && isVersionNewer(latestBridge, installedBridgeVersion)
        setLastCheckAt(context, System.currentTimeMillis())
        prefs(context).edit().putString(KEY_LAST_MANIFEST_TAG, manifest.releaseTag).apply()
        return UpdateCheckResult(
            manifest = manifest,
            appUpdateAvailable = appAvailable,
            bridgeUpdateAvailable = bridgeAvailable,
            latestAppVersion = latestApp,
            latestBridgeVersion = latestBridge,
            installedAppVersion = installedApp,
            installedBridgeVersion = installedBridgeVersion,
            source = if (manifest.releaseUrl.contains("github.com")) "github" else "omp"
        )
    }

    private fun fetchManifestFromOmp(): UpdateManifest? {
        return try {
            val req = Request.Builder().url(OMP_MANIFEST_URL).get()
                .header("User-Agent", "NimayOMPChat/${BuildConfig.VERSION_NAME}")
                .build()
            client.newCall(req).execute().use { res ->
                if (!res.isSuccessful) return null
                val body = res.body?.string().orEmpty()
                parseOmpManifest(body)
            }
        } catch (_: Exception) { null }
    }

    private fun parseOmpManifest(body: String): UpdateManifest? {
        return try {
            val root = JsonParser.parseString(body).asJsonObject
            val appObj = root.obj("app")
            val bridgeObj = root.obj("bridge")
            val downloads = mutableMapOf<String, BridgeDownloadInfo>()
            bridgeObj?.obj("downloads")?.entrySet()?.forEach { (k, v) ->
                val o = v.asJsonObject
                downloads[k] = BridgeDownloadInfo(
                    label = o.str("label"),
                    fileName = o.str("fileName"),
                    url = o.str("url"),
                    sha256 = o.str("sha256")
                )
            }
            UpdateManifest(
                releaseTag = root.str("releaseTag"),
                publishedAt = root.str("publishedAt"),
                releaseUrl = root.str("releaseUrl"),
                notesUrl = root.str("notesUrl"),
                app = appObj?.let {
                    AppUpdateInfo(
                        name = it.str("name"),
                        versionName = it.str("versionName"),
                        versionCode = it.int("versionCode"),
                        fileName = it.str("fileName"),
                        url = it.str("url"),
                        sha256 = it.str("sha256"),
                        changelog = it.str("changelog")
                    )
                },
                bridge = bridgeObj?.let {
                    BridgeUpdateInfo(
                        name = it.str("name"),
                        version = it.str("version"),
                        changelog = it.str("changelog"),
                        checksumsUrl = it.str("checksumsUrl"),
                        downloads = downloads
                    )
                }
            )
        } catch (_: Exception) { null }
    }

    private fun fetchManifestFromGitHub(): UpdateManifest? {
        return try {
            val builder = Request.Builder().url(GITHUB_LATEST_URL).get()
                .header("Accept", "application/vnd.github+json")
                .header("User-Agent", "NimayOMPChat/${BuildConfig.VERSION_NAME}")
            // Optional token can be added via BuildConfig in future; avoid hardcoding secrets.
            val req = builder.build()
            client.newCall(req).execute().use { res ->
                if (!res.isSuccessful) return null
                val body = res.body?.string().orEmpty()
                parseGitHubRelease(body)
            }
        } catch (_: Exception) { null }
    }

    private fun parseGitHubRelease(body: String): UpdateManifest? {
        return try {
            val root = JsonParser.parseString(body).asJsonObject
            val tag = root.str("tag_name")
            val releaseUrl = root.str("html_url")
            val assets = root.getAsJsonArray("assets")
            var apkName = ""
            var apkUrl = ""
            var apkVersion = ""
            assets?.forEach { el ->
                val o = el.asJsonObject
                val name = o.str("name")
                val dl = o.str("browser_download_url")
                if (name.startsWith("nimay-omp-chat-android-") && name.endsWith(".apk")) {
                    apkName = name
                    apkUrl = dl
                    apkVersion = Regex("nimay-omp-chat-android-(.+)\\.apk").find(name)?.groupValues?.getOrNull(1).orEmpty()
                }
            }
            val downloads = mutableMapOf<String, BridgeDownloadInfo>()
            fun putAsset(key: String, label: String, predicate: (String) -> Boolean) {
                assets?.forEach { el ->
                    val o = el.asJsonObject
                    val name = o.str("name")
                    if (predicate(name)) downloads[key] = BridgeDownloadInfo(label, name, o.str("browser_download_url"), "")
                }
            }
            putAsset("windows", "Windows Installer (.exe)") { it.endsWith(".exe") }
            putAsset("deb", "Debian/Ubuntu (.deb)") { it.endsWith(".deb") }
            putAsset("rpm", "Fedora/RHEL (.rpm)") { it.endsWith(".rpm") }
            putAsset("flatpak", "Flatpak (.flatpak)") { it.endsWith(".flatpak") }
            putAsset("linux", "Linux tarball (.tar.gz)") { it.endsWith(".tar.gz") && it.contains("linux") }
            val bridgeVersion = parseBridgeFromTag(tag)
            UpdateManifest(
                releaseTag = tag,
                publishedAt = root.str("published_at"),
                releaseUrl = releaseUrl,
                notesUrl = releaseUrl,
                app = if (apkUrl.isNotBlank()) AppUpdateInfo(
                    name = "Nimay OMP Chat (Android)",
                    versionName = apkVersion,
                    fileName = apkName,
                    url = apkUrl,
                    changelog = root.str("body").take(400)
                ) else null,
                bridge = BridgeUpdateInfo(
                    name = "Nimay OMP Chat Bridge",
                    version = bridgeVersion,
                    changelog = root.str("body").take(400),
                    downloads = downloads
                )
            )
        } catch (_: Exception) { null }
    }

    fun normalizeAppVersion(raw: String): String {
        return raw.trim().removePrefix("v").substringBefore("-")
    }

    fun parseBridgeFromTag(tag: String): String = tag.trim().removePrefix("v")

    fun isVersionNewer(latest: String, installed: String): Boolean {
        val a = parseParts(latest)
        val b = parseParts(installed)
        if (a.isEmpty() || b.isEmpty()) return latest.isNotBlank() && installed.isNotBlank() && latest != installed
        val n = maxOf(a.size, b.size)
        for (i in 0 until n) {
            val av = a.getOrElse(i) { 0 }
            val bv = b.getOrElse(i) { 0 }
            if (av > bv) return true
            if (av < bv) return false
        }
        return false
    }

    private fun parseParts(v: String): List<Int> {
        if (v.isBlank()) return emptyList()
        return v.trim().removePrefix("v").split('.', '-', '_').mapNotNull { part ->
            part.filter { it.isDigit() }.takeIf { it.isNotBlank() }?.toIntOrNull()
        }
    }

    fun downloadApk(context: Context, url: String, onProgress: (String) -> Unit = {}): File? {
        return try {
            onProgress("Downloading update…")
            val req = Request.Builder().url(url).get().build()
            client.newCall(req).execute().use { res ->
                if (!res.isSuccessful) return null
                val file = File(context.cacheDir, "nimay-omp-chat-update.apk")
                val body = res.body ?: return null
                val total = body.contentLength()
                body.byteStream().use { input ->
                    FileOutputStream(file).use { output ->
                        val buf = ByteArray(8192)
                        var read: Int
                        var done = 0L
                        while (input.read(buf).also { read = it } != -1) {
                            output.write(buf, 0, read)
                            done += read
                            if (total > 0) onProgress("Downloading… ${(done * 100 / total).toInt()}%")
                        }
                    }
                }
                file
            }
        } catch (_: Exception) { null }
    }

    fun sha256(file: File): String {
        val md = MessageDigest.getInstance("SHA-256")
        file.inputStream().use { input ->
            val buf = ByteArray(8192)
            var read: Int
            while (input.read(buf).also { read = it } != -1) md.update(buf, 0, read)
        }
        return md.digest().joinToString("") { "%02x".format(it) }
    }

    fun installApk(context: Context, apkFile: File) {
        val authority = "${context.packageName}.fileprovider"
        val uri = FileProvider.getUriForFile(context, authority, apkFile)
        val intent = Intent(Intent.ACTION_VIEW).apply {
            setDataAndType(uri, "application/vnd.android.package-archive")
            addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION or Intent.FLAG_ACTIVITY_NEW_TASK)
        }
        context.startActivity(intent)
    }

    private fun JsonObject.obj(key: String): JsonObject? = if (has(key) && get(key).isJsonObject) getAsJsonObject(key) else null
    private fun JsonObject.str(key: String): String = runCatching { get(key)?.takeIf { !it.isJsonNull }?.asString ?: "" }.getOrDefault("")
    private fun JsonObject.int(key: String): Int = runCatching { get(key)?.asInt ?: 0 }.getOrDefault(0)
}
