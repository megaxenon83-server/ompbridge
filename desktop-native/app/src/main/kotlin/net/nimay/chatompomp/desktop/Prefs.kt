package net.nimay.chatompomp.desktop

import org.json.JSONArray
import org.json.JSONObject
import java.io.File

/**
 * Desktop replacement for Android's SharedPreferences: one readable JSON file
 * under %LOCALAPPDATA%\OMPDesktop\settings.json. Keeps pairing, theme, language,
 * pinned chats, unread counters, drafts and window geometry between runs.
 */
class Prefs {
    val directory: File = File(
        System.getenv("LOCALAPPDATA") ?: System.getProperty("user.home"),
        "OMPDesktop",
    )
    val file: File = File(directory, "settings.json")

    private val data: JSONObject = runCatching {
        directory.mkdirs()
        if (file.exists()) JSONObject(file.readText(Charsets.UTF_8)) else JSONObject()
    }.getOrDefault(JSONObject())

    private fun flush() {
        runCatching {
            directory.mkdirs()
            val temp = File(directory, "settings.json.tmp")
            temp.writeText(data.toString(2), Charsets.UTF_8)
            if (!temp.renameTo(file)) {
                file.writeText(data.toString(2), Charsets.UTF_8)
                temp.delete()
            }
        }
    }

    fun string(key: String, fallback: String = ""): String = data.optString(key, fallback)

    fun put(key: String, value: String) {
        data.put(key, value)
        flush()
    }

    fun int(key: String, fallback: Int = 0): Int = data.optInt(key, fallback)

    fun put(key: String, value: Int) {
        data.put(key, value)
        flush()
    }

    fun bool(key: String, fallback: Boolean = false): Boolean = data.optBoolean(key, fallback)

    fun put(key: String, value: Boolean) {
        data.put(key, value)
        flush()
    }

    // ------------------------------------------------------------------ pairing

    fun pairing(): Pairing? {
        val origin = string("origin").trim()
        val token = string("credential").trim()
        return if (origin.isNotBlank() && token.isNotBlank()) Pairing(origin, token) else null
    }

    fun savePairing(pairing: Pairing) {
        data.put("origin", pairing.origin).put("credential", pairing.token)
        flush()
    }

    fun clearPairing() {
        data.remove("origin")
        data.remove("credential")
        flush()
    }

    // ------------------------------------------------------- theme, language, UI

    fun themeId(): String = string("themeId", "omp")

    fun lang(): AppLang = runCatching { AppLang.valueOf(string("lang", "NB")) }.getOrDefault(AppLang.NB)

    fun windowWidth(): Int = int("windowWidth", 1180)

    fun windowHeight(): Int = int("windowHeight", 820)

    fun saveWindow(width: Int, height: Int) {
        data.put("windowWidth", width).put("windowHeight", height)
        flush()
    }

    // ------------------------------------------------------------- chats & unread

    fun pinned(): Set<String> {
        val array = data.optJSONArray("pinned") ?: return emptySet()
        return (0 until array.length()).mapNotNull { array.optString(it).takeIf { value -> value.isNotBlank() } }.toSet()
    }

    fun setPinned(files: Set<String>) {
        data.put("pinned", JSONArray(files.toList()))
        flush()
    }

    fun seenCount(file: String): Int = int("seen:$file", -1)

    fun markSeen(file: String, count: Int) {
        data.put("seen:$file", count)
        flush()
    }

    fun draft(file: String): String = string("draft:$file")

    fun saveDraft(file: String, value: String) {
        if (file.isBlank()) return
        data.put("draft:$file", value)
        flush()
    }
}
