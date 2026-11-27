package net.nimay.chatompomp.desktop

import org.json.JSONArray
import org.json.JSONObject

/** A stored OMP session as the bridge describes it. */
data class SessionInfo(
    val file: String,
    val cwd: String,
    val title: String,
    val model: String,
    val updatedAt: Long,
    val messageCount: Int,
    val projectId: String,
    val archived: Boolean,
    val activity: String,
) {
    val projectName: String
        get() = cwd.trimEnd('\\', '/').split('\\', '/').lastOrNull()?.takeIf { it.isNotBlank() } ?: "Prosjekt"

    companion object {
        fun from(json: JSONObject) = SessionInfo(
            file = json.optString("file"),
            cwd = json.optString("cwd"),
            title = json.optString("title").ifBlank { "Ny samtale" },
            model = json.optString("model"),
            updatedAt = json.optLong("updatedAt"),
            messageCount = json.optInt("messageCount"),
            projectId = json.optString("projectId"),
            archived = json.optBoolean("archived"),
            activity = json.optString("activity"),
        )

        fun list(array: JSONArray?): List<SessionInfo> {
            if (array == null) return emptyList()
            val out = ArrayList<SessionInfo>(array.length())
            for (i in 0 until array.length()) out.add(from(array.optJSONObject(i) ?: continue))
            // The bridge also lists per-session changes.jsonl side files; they are not conversations.
            return out.filter { it.file.isNotBlank() && it.cwd.isNotBlank() && !it.file.endsWith("changes.jsonl") }
                .distinctBy { it.file }
        }
    }
}

/** One entry in the transcript. */
data class Entry(
    val id: String,
    val role: String,           // user | assistant | tool | system | terminal
    val text: String,
    val thinking: String = "",
    val toolName: String = "",
    val command: String = "",
    val isError: Boolean = false,
    val timestamp: Long = 0,
    val streaming: Boolean = false,
)

/** A running turn, kept so the UI can show work in real time. */
data class StreamState(
    val active: Boolean = false,
    val phase: String = "",
    val tokensPerSecond: Double = 0.0,
)

/** A model the bridge's OMP runtime can switch to. */
data class ModelInfo(
    val provider: String,
    val id: String,
    val name: String,
    val efforts: List<String>,
    val contextWindow: Int,
) {
    companion object {
        fun from(json: JSONObject): ModelInfo {
            val efforts = ArrayList<String>()
            val metadata = json.optJSONObject("thinking")
            metadata?.optJSONArray("efforts")?.let { array ->
                for (index in 0 until array.length()) {
                    array.optString(index).takeIf { it.isNotBlank() }?.let { efforts.add(it) }
                }
            }
            if (efforts.isEmpty() && metadata?.optString("mode") == "toggle") efforts.add("on")
            return ModelInfo(
                provider = json.optString("provider"),
                id = json.optString("id"),
                name = json.optString("name").ifBlank { json.optString("id") },
                efforts = efforts,
                contextWindow = json.optInt("contextWindow", 0),
            )
        }

        fun list(array: JSONArray?): List<ModelInfo> {
            if (array == null) return emptyList()
            return (0 until array.length()).mapNotNull { array.optJSONObject(it) }
                .map { from(it) }
                .filter { it.provider.isNotBlank() && it.id.isNotBlank() }
        }
    }
}

/** A project folder that can host a new conversation. */
data class ProjectInfo(
    val path: String,
    val name: String,
    val sessionCount: Int = 0,
) {
    companion object {
        fun from(json: JSONObject) = ProjectInfo(
            path = json.optString("path"),
            name = json.optString("name").ifBlank { json.optString("path") },
            sessionCount = json.optInt("sessionCount"),
        )

        fun list(array: JSONArray?): List<ProjectInfo> {
            if (array == null) return emptyList()
            return (0 until array.length()).mapNotNull { array.optJSONObject(it) }
                .map { from(it) }
                .filter { it.path.isNotBlank() }
        }
    }
}
