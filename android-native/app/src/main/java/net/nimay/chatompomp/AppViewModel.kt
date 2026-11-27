package net.nimay.chatompomp

import android.app.Application
import android.util.Base64
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.setValue
import androidx.lifecycle.AndroidViewModel
import androidx.lifecycle.viewModelScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext
import okhttp3.OkHttpClient
import okhttp3.Request
import okhttp3.Response
import okhttp3.sse.EventSource
import okhttp3.sse.EventSourceListener
import okhttp3.sse.EventSources
import org.json.JSONArray
import org.json.JSONObject
import java.util.concurrent.TimeUnit
import javax.crypto.Cipher
import javax.crypto.spec.GCMParameterSpec
import javax.crypto.spec.SecretKeySpec

class AppViewModel(app: Application) : AndroidViewModel(app) {

    val bridge = BridgeClient(app)

    var pairing by mutableStateOf(bridge.pairing)
        private set
    var sessions by mutableStateOf<List<SessionInfo>>(emptyList())
        private set
    var activeFile by mutableStateOf("")
        private set
    var activeCwd by mutableStateOf("")
        private set
    var activeTitle by mutableStateOf("")
        private set
    var messages by mutableStateOf<List<Entry>>(emptyList())
        private set
    var stream by mutableStateOf(StreamState())
        private set
    var busy by mutableStateOf(false)
        private set
    var error by mutableStateOf("")
        private set
    var models by mutableStateOf<List<JSONObject>>(emptyList())
        private set
    var projects by mutableStateOf<List<ProjectInfo>>(emptyList())
        private set
    var registry by mutableStateOf<List<ProjectInfo>>(emptyList())
        private set
    var draft by mutableStateOf("")
        private set
    var fsPath by mutableStateOf("")
        private set
    var fsEntries by mutableStateOf<List<FsEntry>>(emptyList())
        private set
    var fsFile by mutableStateOf<FileContent?>(null)
        private set
    var gitStatus by mutableStateOf<JSONObject?>(null)
        private set
    var gitLog by mutableStateOf<List<JSONObject>>(emptyList())
        private set
    var terminalOutput by mutableStateOf("")
        private set
    var terminalRunning by mutableStateOf(false)
        private set
    var adbStatus by mutableStateOf<JSONObject?>(null)
        private set
    var voiceEngines by mutableStateOf<JSONObject?>(null)
        private set
    var voiceLocal by mutableStateOf<JSONObject?>(null)
        private set
    var wolInfo by mutableStateOf<JSONObject?>(null)
        private set
    var approval by mutableStateOf<JSONObject?>(null)
        private set
    var attachments by mutableStateOf<List<String>>(emptyList())
        private set
    var editingContent by mutableStateOf<String?>(null)
        private set
    var turnCards by mutableStateOf<List<JSONObject>>(emptyList())
        private set
    var todoPhases by mutableStateOf<org.json.JSONArray?>(null)
        private set
    var projectChecks by mutableStateOf<List<JSONObject>>(emptyList())
        private set
    var noticeText by mutableStateOf("")
        private set
    var themeId by mutableStateOf("omp")
        private set
    var lang by mutableStateOf(AppLang.NB)
        private set
    var contextTokens by mutableStateOf(0)
        private set
    var contextWindow by mutableStateOf(0)
        private set
    var providers by mutableStateOf<List<JSONObject>>(emptyList())
        private set
    var localModels by mutableStateOf<List<JSONObject>>(emptyList())
        private set
    var thinkingLevels by mutableStateOf<List<String>>(emptyList())
        private set
    var thinkingLevel by mutableStateOf("")
        private set
    private var activeProvider = ""
    private var activeModelId = ""
    private var stateThinkingLevel = ""
    var seenCounts by mutableStateOf<Map<String, Int>>(emptyMap())
        private set
    var pinned by mutableStateOf<Set<String>>(emptySet())
        private set

    val theme: ThemeSpec get() = themeById(themeId)
    var folderPath by mutableStateOf("")
        private set
    var folders by mutableStateOf<List<FsEntry>>(emptyList())
        private set
    var updateTag by mutableStateOf<String?>(null)
        private set
    var diffTitle by mutableStateOf("")
        private set
    var diffText by mutableStateOf<String?>(null)
        private set
    private var freshSessionFile = ""
    var updateStatus by mutableStateOf("")
        private set
    var bridgeVersion by mutableStateOf("")
        private set
    init {
        themeId = bridge.loadThemeId()
        lang = runCatching { AppLang.valueOf(bridge.loadLang()) }.getOrDefault(AppLang.NB)
        pinned = bridge.pinnedFiles()
        checkUpdate()
    }
    var activeModelName by mutableStateOf("")
        private set
    var modelMetrics by mutableStateOf<JSONObject?>(null)
        private set
    var plugins by mutableStateOf<JSONObject?>(null)
        private set
    var pluginsBusy by mutableStateOf(false)
        private set

    private val sseClient = OkHttpClient.Builder()
        .connectTimeout(8, TimeUnit.SECONDS)
        .readTimeout(0, TimeUnit.MILLISECONDS)
        .build()
    private var eventSource: EventSource? = null
    private var terminalSocket: okhttp3.WebSocket? = null
    private var streamingId: String = ""
    private var streamingText: StringBuilder = StringBuilder()
    private var streamingThinking: StringBuilder = StringBuilder()

    private fun token(): String = pairing?.credential ?: ""
    private fun origin(): String = pairing?.origin ?: ""

    // ---------------------------------------------------------------- pairing

    /** Handle a chatomp://pair/<ticket> link: exchange the nonce and store the pairing. */
    suspend fun pair(link: String): Result<Unit> = withContext(Dispatchers.IO) {
        runCatching {
            val start = link.indexOf("chatomp://pair/")
            require(start >= 0) { "Ukjent paringslenke." }
            val ticket = String(Base64.decode(link.substring(start + "chatomp://pair/".length).trim(), Base64.URL_SAFE or Base64.NO_PADDING or Base64.NO_WRAP))
            val data = JSONObject(ticket)
            val address = data.getString("address")
            val port = data.getInt("port")
            val nonce = data.getString("nonce")
            val key = Base64.decode(data.getString("key"), Base64.URL_SAFE or Base64.NO_PADDING or Base64.NO_WRAP)
            android.util.Log.i("ChatOmpPair", "ticket address=$address port=$port nonceLen=${nonce.length} keyLen=${key.size}")
            val url = "http://$address:$port/$nonce"
            val request = Request.Builder().url(url).get().build()
            val sealed = OkHttpClient().newCall(request).execute().use { response ->
                require(response.isSuccessful) { "Paringstjeneren svarte ${response.code}." }
                response.body?.string() ?: ""
            }
            val closed = sealed.trim()
            require(closed.length > 28) { "Tomt paringssvar." }
            val cipherBytes = Base64.decode(closed, Base64.URL_SAFE or Base64.NO_PADDING or Base64.NO_WRAP)
            android.util.Log.i("ChatOmpPair", "cipher bytes=${cipherBytes.size}")
            require(cipherBytes.size > 28) { "Tomt paringssvar." }
            val iv = cipherBytes.copyOfRange(0, 12)
            val cipher = Cipher.getInstance("AES/GCM/NoPadding")
            cipher.init(Cipher.DECRYPT_MODE, SecretKeySpec(key, "AES"), GCMParameterSpec(128, iv))
            val plain = cipher.doFinal(cipherBytes, 12, cipherBytes.size - 12)
            val payload = JSONObject(String(plain))
            val stored = Pairing(payload.getString("origin"), payload.getString("credential"))
            android.util.Log.i("ChatOmpPair", "paired origin=${stored.origin} credentialLen=${stored.credential.length}")
            bridge.save(stored)
            pairing = stored
            Unit
        }.onFailure { android.util.Log.e("ChatOmpPair", "pair failed", it) }
    }

    fun forget() {
        bridge.forget()
        pairing = null
        sessions = emptyList()
        messages = emptyList()
        activeFile = ""
        stopEvents()
    }

    // ---------------------------------------------------------------- data

    fun refresh() {
        val p = pairing ?: return
        viewModelScope.launch {
            runCatching {
                bridgeVersion = runCatching { bridge.get("/api/health").optString("version") }.getOrDefault("").ifBlank { bridgeVersion }
                val data = bridge.get("/api/sessions", mapOf("archived" to "1"))
                sessions = SessionInfo.list(data.optJSONArray("sessions"))
                seenCounts = sessions.mapNotNull { session ->
                    val seen = bridge.seenCount(session.file)
                    if (seen >= 0) session.file to seen else null
                }.toMap()
                pinned = pinned.filter { file -> sessions.any { it.file == file } }.toSet()
            }.onFailure { error = it.message ?: "Kunne ikke hente samtaler." }
        }
    }

    fun loadProjects() {
        if (pairing == null) return
        viewModelScope.launch {
            runCatching {
                val data = bridge.get("/api/projects")
                projects = ProjectInfo.list(data.optJSONArray("projects"))
            }.onFailure { error = it.message ?: "Kunne ikke hente prosjekter." }
        }
    }

    fun loadRegistry() {
        if (pairing == null) return
        viewModelScope.launch {
            runCatching {
                val data = bridge.get("/api/projects/registry")
                registry = ProjectInfo.list(data.optJSONArray("projects"))
            }.onFailure { error = it.message ?: "Kunne ikke hente prosjekter." }
        }
    }

    fun createProject(name: String) {
        if (name.isBlank()) return
        viewModelScope.launch {
            runCatching {
                bridge.post("/api/projects/create", JSONObject().apply { put("name", name.trim()) })
                loadRegistry()
                loadProjects()
            }.onFailure { error = it.message ?: "Kunne ikke opprette prosjekt." }
        }
    }

    fun renameProject(id: String, name: String) {
        if (id.isBlank() || name.isBlank()) return
        viewModelScope.launch {
            runCatching {
                bridge.post("/api/projects/rename", JSONObject().apply { put("id", id); put("name", name.trim()) })
                loadRegistry()
                loadProjects()
            }.onFailure { error = it.message ?: "Kunne ikke endre navnet på prosjektet." }
        }
    }

    fun setProjectHidden(id: String, hidden: Boolean) {
        if (id.isBlank()) return
        viewModelScope.launch {
            runCatching {
                bridge.post(if (hidden) "/api/projects/hide" else "/api/projects/unhide", JSONObject().apply { put("id", id) })
                loadRegistry()
                loadProjects()
            }.onFailure { error = it.message ?: "Kunne ikke endre prosjektet." }
        }
    }

    fun newSession(cwd: String) {
        if (cwd.isBlank()) return
        viewModelScope.launch {
            runCatching {
                val data = bridge.post("/api/sessions/new", JSONObject().apply { put("cwd", cwd) })
                val file = data.optString("sessionFile")
                require(file.isNotBlank()) { "Fikk ingen samtale fra OMP." }
                activeFile = file
                activeCwd = cwd
                activeTitle = "Ny samtale"
                activeModelName = data.optJSONObject("session")?.optString("model") ?: ""
                freshSessionFile = file
                messages = emptyList()
                stream = StreamState()
                error = ""
                turnCards = emptyList()
                todoPhases = null
                projectChecks = emptyList()
                noticeText = ""
                busy = false
                streamingId = ""
                streamingText = StringBuilder()
                streamingThinking = StringBuilder()
                refresh()
        loadModels()
        startEvents()
            }.onFailure { error = it.message ?: "Kunne ikke lage ny samtale." }
        }
    }

    fun loadModels() {
        if (pairing == null || activeCwd.isBlank()) return
        viewModelScope.launch {
            runCatching {
                val data = bridge.get("/api/models", mapOf("cwd" to activeCwd))
                val array = data.optJSONArray("models")
                models = if (array == null) emptyList() else (0 until array.length()).mapNotNull { array.optJSONObject(it) }
                if (activeProvider.isNotBlank() && activeModelId.isNotBlank()) syncThinking(activeProvider, activeModelId)
            }.onFailure { error = it.message ?: "Kunne ikke hente modeller." }
        }
    }

    fun chooseModel(provider: String, modelId: String, name: String) {
        if (activeCwd.isBlank()) return
        viewModelScope.launch {
            runCatching {
                bridge.post("/api/model", JSONObject().apply {
                    put("cwd", activeCwd)
                    put("provider", provider)
                    put("modelId", modelId)
                    if (activeFile.isNotBlank()) put("file", activeFile)
                })
                activeModelName = name.ifBlank { modelId }
                syncThinking(provider, modelId)
            }.onFailure { error = it.message ?: "Kunne ikke bytte modell." }
        }
    }

    fun loadPlugins() {
        if (activeCwd.isBlank()) return
        pluginsBusy = true
        viewModelScope.launch {
            runCatching {
                val query = buildMap {
                    put("cwd", activeCwd)
                    if (activeFile.isNotBlank()) put("file", activeFile)
                }
                plugins = bridge.get("/api/omp/workspace/plugins", query)
            }.onFailure { error = it.message ?: "Kunne ikke hente plugins." }
            pluginsBusy = false
        }
    }

    fun togglePlugin(id: String, enabled: Boolean, scope: String) {
        if (activeCwd.isBlank()) return
        viewModelScope.launch {
            runCatching {
                bridge.post("/api/omp/workspace/plugins", JSONObject().apply {
                    put("cwd", activeCwd)
                    put("action", if (enabled) "enable" else "disable")
                    put("target", id)
                    if (scope.isNotBlank()) put("scope", scope)
                    if (activeFile.isNotBlank()) put("file", activeFile)
                })
                loadPlugins()
            }.onFailure { error = it.message ?: "Kunne ikke endre plugin." }
        }
    }

    fun toggleSkill(name: String, scope: String, enabled: Boolean) {
        if (activeCwd.isBlank()) return
        viewModelScope.launch {
            runCatching {
                bridge.post("/api/omp/workspace/plugins", JSONObject().apply {
                    put("cwd", activeCwd)
                    put("action", "set-skill-scope")
                    put("target", name)
                    put("scope", scope)
                    put("enabled", enabled)
                    if (activeFile.isNotBlank()) put("file", activeFile)
                })
                loadPlugins()
            }.onFailure { error = it.message ?: "Kunne ikke endre skill." }
        }
    }

    fun openSession(info: SessionInfo) {
        activeFile = info.file
        activeCwd = info.cwd
        activeTitle = info.title
        activeModelName = info.model
        draft = bridge.loadDraft(info.file)
        markSeen(info.file, info.messageCount)
        turnCards = emptyList()
        todoPhases = null
        projectChecks = emptyList()
        noticeText = ""
        busy = false
        streamingId = ""
        streamingText = StringBuilder()
        streamingThinking = StringBuilder()
        messages = emptyList()
        stream = StreamState()
        error = ""
        viewModelScope.launch {
            runCatching {
                val data = bridge.get("/api/session/messages", mapOf("file" to info.file))
                val array = data.optJSONArray("messages")
                messages = if (array == null) emptyList() else (0 until array.length()).mapNotNull { index ->
                    val item = array.optJSONObject(index) ?: return@mapNotNull null
                    Entry(
                        id = item.optString("id"),
                        role = item.optString("role"),
                        text = item.optString("text"),
                        thinking = item.optString("thinking"),
                        toolName = item.optString("toolName"),
                        command = item.optString("command"),
                        isError = item.optBoolean("isError"),
                        timestamp = item.optLong("timestamp"),
                    )
                }
            }.onFailure { error = it.message ?: "Kunne ikke hente samtalen." }
        }
        loadTurnCards(info.file)
        loadModels()
        startEvents()
        viewModelScope.launch {
            runCatching {
                val snapshot = bridge.get("/api/state", mapOf("cwd" to info.cwd))
                snapshot.optJSONObject("state")?.optJSONObject("contextUsage")?.let { usage ->
                    contextTokens = usage.optInt("tokens", 0)
                    val window = usage.optInt("contextWindow", 0)
                    if (window > 0) contextWindow = window
                }
            }
        }
    }

    // ---------------------------------------------------------------- events

    private fun startEvents() {
        stopEvents()
        val p = pairing ?: return
        if (activeFile.isBlank()) return
        val query = "cwd=" + enc(activeCwd) + "&file=" + enc(activeFile)
        val request = Request.Builder()
            .url(p.origin + "/api/events?" + query)
            .header("Authorization", "Bearer " + p.credential)
            .build()
        eventSource = EventSources.createFactory(sseClient).newEventSource(request, object : EventSourceListener() {
            override fun onEvent(eventSource: EventSource, id: String?, type: String?, data: String) {
                runCatching { onFrame(JSONObject(data)) }
            }
        })
    }

    private fun stopEvents() {
        eventSource?.cancel()
        eventSource = null
    }
    private fun onFrame(frame: JSONObject) {
        val type = frame.optString("type")
        val frameFile = frame.optString("sessionFile")
        if (type != "hello" && type != "state" && frameFile.isNotBlank() &&
            activeFile.isNotBlank() && !frameFile.equals(activeFile, ignoreCase = true)) {
            return
        }
        when (type) {
            "hello", "state" -> {
                frame.optString("version").takeIf { it.isNotBlank() }?.let { bridgeVersion = it }
                val state = frame.optJSONObject("state") ?: return
                stream = StreamState(
                    active = state.optBoolean("isStreaming"),
                    phase = stream.phase,
                    tokensPerSecond = state.optDouble("tokensPerSecond", 0.0),
                )
                busy = state.optBoolean("isStreaming")
                state.optString("thinkingLevel").takeIf { it.isNotBlank() }?.let { stateThinkingLevel = it }
                state.optJSONObject("contextUsage")?.let { usage ->
                    contextTokens = usage.optInt("tokens", 0)
                    val window = usage.optInt("contextWindow", 0)
                    if (window > 0) contextWindow = window
                }
                val model = state.optJSONObject("model")
                val provider = model?.optString("provider").orEmpty()
                val modelId = model?.optString("id").orEmpty()
                if (provider.isNotBlank() && modelId.isNotBlank()) {
                    model?.optString("name")?.takeIf { it.isNotBlank() }?.let { activeModelName = it }
                    syncThinking(provider, modelId)
                }            }
            "message_start" -> {
                if (frame.optString("role") == "assistant" || frame.optJSONObject("message")?.optString("role") == "assistant") {
                    streamingId = frame.optString("messageId")
                    streamingText = StringBuilder()
                    streamingThinking = StringBuilder()
                    busy = true
                    stream = stream.copy(active = true, phase = "OMP skriver")
                    upsert(Entry(id = streamingId, role = "assistant", text = "", streaming = true, timestamp = System.currentTimeMillis()))
                }
            }
            "message_delta" -> {
                val delta = frame.optString("delta")
                val kind = frame.optString("kind")
                if (!streamingId.isBlank()) {
                    if (kind == "thinking") streamingThinking.append(delta) else streamingText.append(delta)
                    val partial = frame.optJSONObject("partial")
                    val partialText = partial?.optString("text").orEmpty()
                    val partialThinking = partial?.optString("thinking").orEmpty()
                    if (partialText.length > streamingText.length) streamingText = StringBuilder(partialText)
                    if (partialThinking.length > streamingThinking.length) streamingThinking = StringBuilder(partialThinking)
                    updateStreaming()
                }
            }
            "message_end" -> {
                val role = frame.optJSONObject("message")?.optString("role") ?: frame.optString("role")
                if (role == "user") {
                    val text = frame.optJSONObject("message")?.optString("text") ?: ""
                    val messageId = frame.optString("messageId")
                    if (text.isNotBlank()) {
                        val optimistic = messages.indexOfFirst { it.role == "user" && it.id.startsWith("local-") && it.text == text }
                        if (optimistic >= 0) {
                            val existing = messages[optimistic]
                            messages = messages.toMutableList().also { it[optimistic] = existing.copy(id = messageId.ifBlank { existing.id }) }
                        } else {
                            add(Entry(id = messageId + "-u", role = "user", text = text, timestamp = System.currentTimeMillis()))
                        }
                    }
                } else if (role == "assistant") {
                    if (!streamingId.isBlank()) {
                        finalizeStreaming()
                    }
                    if (streamingThinking.isBlank()) {
                        val blockThinking = frame.optJSONObject("message")?.optString("thinking").orEmpty()
                        if (blockThinking.isNotBlank()) {
                            val index = messages.indexOfLast { it.role == "assistant" }
                            if (index >= 0) {
                                messages = messages.toMutableList().also { it[index] = it[index].copy(thinking = blockThinking) }
                            }
                        }
                    }
                    busy = false
                    stream = stream.copy(active = false)
                }
            }
            "tool_start", "tool_update", "tool_end" -> {
                val id = frame.optString("toolCallId").ifBlank { "tool-" + System.nanoTime() }
                val name = frame.optString("toolName")
                val result = frame.opt("result") ?: frame.opt("partial")
                val text = when (result) {
                    is JSONObject -> result.optString("content", result.toString())
                    null -> ""
                    else -> result.toString()
                }
                val existing = messages.indexOfFirst { it.role == "tool" && it.id == id }
                val entry = Entry(
                    id = id,
                    role = "tool",
                    text = text,
                    toolName = name,
                    command = frame.optJSONObject("args")?.optString("command") ?: "",
                    isError = frame.optBoolean("isError"),
                    timestamp = System.currentTimeMillis(),
                    streaming = frame.optString("type") == "tool_start",
                )
                messages = if (existing >= 0) messages.toMutableList().also { it[existing] = entry } else messages + entry
                if (frame.optString("type") != "tool_end") {
                    stream = stream.copy(active = true, phase = phaseFor(name))
                    busy = true
                }
            }
            "agent_end", "session_settled" -> {
                modelMetrics = null
                if (activeFile.isNotBlank()) markSeen(activeFile, messages.size)
                busy = false
                stream = stream.copy(active = false, phase = "")
                if (!streamingId.isBlank()) finalizeStreaming()
            }
            "model_metrics" -> {
                val live = frame.optJSONObject("live")
                if (live?.optString("state") == "idle" && !busy) modelMetrics = null else modelMetrics = frame
            }
            "ui_request", "extension_ui_request" -> approval = frame
            "turn_changes" -> frame.optJSONObject("card")?.let { card ->
                val id = card.optString("id")
                turnCards = turnCards.filter { it.optString("id") != id } + card
            }
            "todo_phases" -> todoPhases = frame.optJSONArray("phases")
            "project_check" -> frame.optJSONObject("check")?.let { check ->
                val id = check.optString("id")
                projectChecks = projectChecks.filter { it.optString("id") != id } + check
            }
            "schedule_status" -> noticeText = frame.optString("status").ifBlank { frame.optString("error") }
            "notice" -> noticeText = frame.optString("message").ifBlank {
                frame.optJSONObject("notice")?.optString("message").orEmpty()
            }
            "rpc_error" -> noticeText = frame.optString("error")            "ui_cancel" -> if (approval?.optString("id") == frame.optString("targetId")) approval = null
        }
    }

    /** Live status from the model server's own metrics, or empty when it exposes none. */
    fun metricsLabel(): String {
        val live = modelMetrics?.optJSONObject("live") ?: return ""
        val phase = live.optString("phase")
        val queued = live.optInt("queued", 0)
        if (phase.contains("think", true) || phase.contains("reason", true)) {
            val rate = live.optDouble("tok_s", 0.0)
            return "Resonerer" + if (rate > 0) " · ${rate.toInt()} tok/s" else ""
        }
        val total = live.optInt("prompt_total", 0).takeIf { it > 0 } ?: live.optInt("prompt_tokens", 0)
        val read = live.optInt("prompt_read", 0)
        if (phase.contains("prefill", true) || phase.contains("prompt", true) || phase.contains("reading", true) || (total > 0 && read > 0 && read < total)) {
            val percent = if (total > 0) ((read * 100) / total).coerceIn(0, 100) else 0
            val rate = live.optDouble("prefill_tok_s_mean", 0.0)
            return "Behandler kontekst ${count(total)}" + (if (percent > 0) " · $percent %" else "") + (if (rate > 0) " · ${rate.toInt()} tok/s" else "")
        }
        if (phase.contains("decode", true) || phase.contains("generat", true) || phase.contains("answer", true) || phase.contains("respond", true)) {
            val rate = live.optDouble("tok_s", 0.0)
            return "Genererer" + if (rate > 0) " · ${rate.toInt()} tok/s" else ""
        }
        if (queued > 0) return "I kø · $queued"
        val reused = live.optInt("reused", 0).takeIf { it > 0 } ?: (modelMetrics?.optJSONObject("request")?.optInt("reused", 0) ?: 0)
        if (reused > 0) {
            val tokens = live.optInt("prompt_tokens", 0).takeIf { it > 0 } ?: (modelMetrics?.optJSONObject("request")?.optInt("prompt_tokens", 0) ?: 0)
            val percent = if (tokens > 0) ((reused * 100) / tokens).coerceIn(0, 100) else 0
            return "Cache · ${count(reused)}" + (if (percent > 0) " · $percent %" else "")
        }
        return ""
    }

    private fun count(value: Int): String = when {
        value >= 1_000_000 -> "%.1fM".format(value / 1_000_000.0).replace(".0M", "M")
        value >= 10_000 -> "${value / 1000}K"
        else -> value.toString()
    }

    private fun phaseFor(tool: String): String = when (tool) {
        "bash" -> "Kjører Bash"
        "read" -> "Leser filer"
        "edit", "write", "patch" -> "Endrer kode"
        "web_search" -> "Søker på nettet"
        else -> "OMP arbeider"
    }

    private fun upsert(entry: Entry) {
        val index = messages.indexOfFirst { it.role == entry.role && it.id == entry.id }
        messages = if (index >= 0) messages.toMutableList().also { it[index] = entry } else messages + entry
    }

    private fun add(entry: Entry) {
        messages = messages + entry
    }

    private fun updateStreaming() {
        updateStreamingEntry(streamingText.toString(), streamingThinking.toString())
    }

    private fun updateStreamingEntry(text: String, thinking: String) {
        val index = messages.indexOfFirst { it.role == "assistant" && it.id == streamingId }
        if (index < 0) return
        messages = messages.toMutableList().also {
            it[index] = it[index].copy(text = text, thinking = thinking, streaming = true)
        }
    }

    private fun finalizeStreaming() {
        updateStreamingEntry(streamingText.toString(), streamingThinking.toString())
        val index = messages.indexOfFirst { it.role == "assistant" && it.id == streamingId }
        if (index >= 0) messages = messages.toMutableList().also { it[index] = it[index].copy(streaming = false) }
        streamingId = ""
    }

    // ---------------------------------------------------------------- actions

    fun send(text: String) {
        val p = pairing ?: return
        if (text.isBlank() || activeFile.isBlank()) return
        val optimistic = Entry(id = "local-" + System.currentTimeMillis(), role = "user", text = text, timestamp = System.currentTimeMillis())
        messages = messages + optimistic
        busy = true
        modelMetrics = null
        draft = ""
        if (activeFile.isNotBlank()) bridge.saveDraft(activeFile, "")
        if (activeFile == freshSessionFile) {
            val computed = deriveTitle(text)
            if (computed.isNotBlank()) {
                activeTitle = computed
                viewModelScope.launch {
                    runCatching {
                        bridge.post("/api/sessions/name", JSONObject().apply {
                            put("file", activeFile)
                            put("cwd", activeCwd)
                            put("name", computed)
                        })
                    }
                }
                refresh()
            }
            freshSessionFile = ""
        }
        val attached = attachments
        attachments = emptyList()
        val promptText = if (attached.isEmpty()) text else text + "\n\nVedlegg:\n" + attached.joinToString("\n") { "- $it" }
        stream = StreamState(active = true, phase = "Klargjør OMP")
        viewModelScope.launch {
            runCatching {
                bridge.post("/api/prompt", JSONObject().apply {
                    put("cwd", activeCwd)
                    put("file", activeFile)
                    put("text", promptText)
                    if (thinkingLevel.isNotBlank() && activeProvider.isNotBlank() && activeModelId.isNotBlank()) {
                        put("thinking", JSONObject().apply {
                            put("provider", activeProvider)
                            put("id", activeModelId)
                            put("level", thinkingLevel)
                        })
                    }
                })
            }.onFailure {
                error = it.message ?: "Kunne ikke sende."
                busy = false
                stream = StreamState()
            }
        }
    }

    fun stop() {
        if (activeFile.isBlank()) return
        viewModelScope.launch {
            runCatching { bridge.post("/api/abort", JSONObject().apply { put("cwd", activeCwd); put("file", activeFile) }) }
            busy = false
            modelMetrics = null
            stream = StreamState(active = false)
        }
    }

    fun dismissError() { error = "" }

    fun reportError(message: String) { error = message }
    fun updateDraft(value: String) {
        draft = value
        if (activeFile.isNotBlank()) bridge.saveDraft(activeFile, value)
    }

    fun loadFs(path: String) {
        fsPath = path
        fsFile = null
        viewModelScope.launch {
            runCatching {
                val data = bridge.get("/api/fs/list", mapOf("path" to path))
                val array = data.optJSONArray("entries")
                fsEntries = if (array == null) emptyList() else (0 until array.length()).mapNotNull { index ->
                    val item = array.optJSONObject(index) ?: return@mapNotNull null
                    FsEntry(item.optString("name"), item.optString("path"), item.optString("type") == "dir", item.optLong("size"))
                }
            }.onFailure { error = it.message ?: "Kunne ikke lese mappen." }
        }
    }

    fun readFile(path: String) {
        viewModelScope.launch {
            runCatching {
                val data = bridge.get("/api/files/read", mapOf("path" to path))
                fsFile = FileContent(data.optString("path"), data.optString("content"), data.optLong("size"))
            }.onFailure { error = it.message ?: "Kunne ikke lese filen." }
        }
    }
    fun loadGit() {
        viewModelScope.launch {
            runCatching {
                val candidates = ArrayList<String>()
                if (activeCwd.isNotBlank()) candidates.add(activeCwd)
                val list = runCatching { bridge.get("/api/projects") }.getOrNull()
                list?.optJSONArray("projects")?.let { array ->
                    for (index in 0 until array.length()) {
                        array.optJSONObject(index)?.optString("path")?.takeIf { it.isNotBlank() }?.let { candidates.add(it) }
                    }
                }
                var loaded = false
                for (path in candidates.distinct()) {
                    val status = runCatching { bridge.get("/api/git/status", mapOf("path" to path)) }.getOrNull() ?: continue
                    gitStatus = status
                    val log = runCatching { bridge.get("/api/git/log", mapOf("path" to path)) }.getOrNull()
                    val commits = log?.optJSONArray("commits")
                    gitLog = if (commits == null) emptyList() else (0 until commits.length()).mapNotNull { commits.optJSONObject(it) }
                    loaded = true
                    break
                }
                if (!loaded) {
                    gitStatus = null
                    gitLog = emptyList()
                    error = "Fant ingen Git-repo blant prosjektene."
                }
            }.onFailure { gitStatus = null; error = it.message ?: "Git feilet." }
        }
    }

    fun stageAll() {
        if (activeCwd.isBlank()) return
        val files = ArrayList<String>()
        gitStatus?.optJSONArray("files")?.let { array ->
            for (index in 0 until array.length()) array.optJSONObject(index)?.optString("path")?.takeIf { it.isNotBlank() }?.let { files.add(it) }
        }
        viewModelScope.launch {
            runCatching {
                bridge.post("/api/git/stage", JSONObject().apply {
                    put("cwd", activeCwd)
                    put("files", org.json.JSONArray(files))
                })
            }.onFailure { error = it.message ?: "Kunne ikke stage filer." }
            loadGit()
        }
    }

    fun commit(message: String) {
        if (activeCwd.isBlank() || message.isBlank()) return
        viewModelScope.launch {
            runCatching { bridge.post("/api/git/commit", JSONObject().apply { put("cwd", activeCwd); put("message", message.trim()) }) }
                .onFailure { error = it.message ?: "Commit feilet." }
            loadGit()
        }
    }

    fun runCommand(command: String) {
        if (command.isBlank()) return
        terminalRunning = true
        viewModelScope.launch {
            runCatching {
                val cwd = if (activeCwd.isNotBlank()) activeCwd else {
                    bridge.get("/api/projects").optJSONArray("projects")?.optJSONObject(0)?.optString("path").orEmpty()
                }
                if (cwd.isBlank()) {
                    terminalOutput = "Ingen prosjektmappe valgt."
                    terminalRunning = false
                    return@launch
                }
                val data = bridge.post("/api/bash", JSONObject().apply { put("cwd", cwd); put("command", command) })
                val result = data.opt("result")
                terminalOutput = when (result) {
                    is JSONObject -> result.optString("output", result.toString())
                    null -> ""
                    else -> result.toString()
                }
            }.onFailure { terminalOutput = it.message ?: "Kommandoen feilet." }
            terminalRunning = false
        }
    }

    fun clearTerminal() { terminalOutput = "" }

    fun loadAdb() {
        viewModelScope.launch {
            runCatching { adbStatus = bridge.get("/api/adb/status") }
                .onFailure { error = it.message ?: "Kunne ikke hente ADB-status." }
        }
    }

    fun installAdb() {
        viewModelScope.launch {
            runCatching { bridge.post("/api/adb/install") }
                .onFailure { error = it.message ?: "Kunne ikke installere ADB." }
            loadAdb()
        }
    }

    fun loadVoice() {
        viewModelScope.launch {
            runCatching {
                voiceEngines = bridge.get("/api/voice/engines")
                voiceLocal = bridge.get("/api/voice/local")
            }.onFailure { error = it.message ?: "Kunne ikke hente tale-motorer." }
        }
    }

    fun loadWol() {
        viewModelScope.launch {
            runCatching { wolInfo = bridge.get("/api/wol/pairing") }
                .onFailure { wolInfo = null; error = it.message ?: "Kunne ikke hente Wake-on-LAN-status." }
        }
    }
    fun closeFile() { fsFile = null }
    fun canGoUp(): Boolean {
        if (fsPath.isBlank()) return false
        val trimmed = fsPath.trimEnd('\\', '/')
        val parent = trimmed.substringBeforeLast('\\', "").substringBeforeLast('/', "")
        return parent.isNotBlank() && parent != trimmed
    }

    fun fsUp() {
        if (fsPath.isBlank()) return
        val trimmed = fsPath.trimEnd('\\', '/')
        val parent = trimmed.substringBeforeLast('\\', "").substringBeforeLast('/', "")
        if (parent.isNotBlank() && parent != trimmed) loadFs(parent)
    }

    fun speak(text: String) {
        if (text.isBlank()) return
        viewModelScope.launch {
            runCatching { bridge.post("/api/voice/speak", JSONObject().apply { put("text", text) }) }
                .onFailure { error = it.message ?: "Kunne ikke lese opp." }
        }
    }
    fun respondApproval(confirmed: Boolean? = null, value: String? = null, allowAlways: Boolean = false, cancelled: Boolean = false, answers: org.json.JSONArray? = null) {
        val pending = approval ?: return
        approval = null
        viewModelScope.launch {
            runCatching {
                bridge.post("/api/ask", JSONObject().apply {
                    put("cwd", activeCwd)
                    put("id", pending.optString("id"))
                    if (answers != null) put("answers", answers)
                    if (allowAlways) put("allowAlways", true)
                    if (cancelled) put("cancelled", true)
                    if (confirmed != null) put("confirmed", confirmed)
                    else if (value != null) put("value", value)
                })
            }.onFailure { error = it.message ?: "Kunne ikke svare på forespørselen." }
        }
    }

    fun uploadAttachment(name: String, bytes: ByteArray) {
        if (activeCwd.isBlank() || bytes.isEmpty()) return
        viewModelScope.launch {
            runCatching {
                val data = android.util.Base64.encodeToString(bytes, android.util.Base64.NO_WRAP)
                val result = bridge.post("/api/upload", JSONObject().apply {
                    put("cwd", activeCwd)
                    put("files", org.json.JSONArray().apply {
                        put(JSONObject().apply { put("name", name); put("data", data) })
                    })
                })
                val saved = result.optJSONArray("files")
                if (saved != null) {
                    val list = attachments.toMutableList()
                    for (index in 0 until saved.length()) {
                        saved.optJSONObject(index)?.optString("relative")?.takeIf { it.isNotBlank() }?.let { list.add(it) }
                    }
                    attachments = list
                }
            }.onFailure { error = it.message ?: "Kunne ikke laste opp vedlegget." }
        }
    }

    fun clearAttachments() { attachments = emptyList() }

    fun renameSession(file: String, name: String) {
        if (file.isBlank() || name.isBlank()) return
        viewModelScope.launch {
            runCatching {
                bridge.post("/api/sessions/name", JSONObject().apply {
                    put("file", file); put("cwd", activeCwd); put("name", name.trim())
                })
            }.onFailure { error = it.message ?: "Kunne ikke endre navnet på samtalen." }
            refresh()
        }
    }

    fun archiveSession(file: String, archived: Boolean) {
        if (file.isBlank()) return
        viewModelScope.launch {
            runCatching { bridge.post("/api/sessions/archive", JSONObject().apply { put("file", file); put("archived", archived) }) }
                .onFailure { error = it.message ?: "Kunne ikke arkivere samtalen." }
            refresh()
        }
    }

    fun startEditing(path: String) {
        viewModelScope.launch {
            runCatching {
                val data = bridge.get("/api/files/read", mapOf("path" to path))
                editingContent = data.optString("content")
            }.onFailure { error = it.message ?: "Kunne ikke åpne filen." }
        }
    }

    fun updateEditing(value: String) { editingContent = value }


    fun stopEditing() { editingContent = null }

    fun saveFile(path: String, content: String) {
        viewModelScope.launch {
            runCatching {
                bridge.post("/api/files/write", JSONObject().apply { put("path", path); put("content", content) })
                editingContent = null
                readFile(path)
            }.onFailure { error = it.message ?: "Kunne ikke lagre filen." }
        }
    }

    fun deleteEntry(path: String) {
        viewModelScope.launch {
            runCatching {
                bridge.post("/api/fs/delete", JSONObject().apply { put("path", path) })
                loadFs(fsPath)
            }.onFailure { error = it.message ?: "Kunne ikke slette." }
        }
    }

    fun makeDir(path: String) {
        viewModelScope.launch {
            runCatching {
                bridge.post("/api/fs/mkdir", JSONObject().apply { put("path", path) })
                loadFs(fsPath)
            }.onFailure { error = it.message ?: "Kunne ikke opprette mappen." }
        }
    }

    fun terminalStart() {
        if (terminalSocket != null) return
        viewModelScope.launch {
            runCatching {
                val cwd = if (activeCwd.isNotBlank()) activeCwd else {
                    bridge.get("/api/projects").optJSONArray("projects")?.optJSONObject(0)?.optString("path").orEmpty()
                }
                require(cwd.isNotBlank()) { "Ingen prosjektmappe valgt." }
                val data = bridge.post("/api/terminal/create", JSONObject().apply {
                    put("cwd", cwd); put("cols", 120); put("rows", 30)
                })
                val id = data.optString("id")
                require(id.isNotBlank()) { "Fikk ingen terminal." }
                terminalOutput = ""
                terminalRunning = true
                terminalSocket = bridge.terminalWebSocket(
                    id,
                    onText = { text -> terminalOutput += text },
                    onClosed = { terminalRunning = false; terminalSocket = null },
                )
            }.onFailure { terminalOutput = it.message ?: "Kunne ikke starte terminal." }
        }
    }

    fun terminalSend(input: String) {
        val socket = terminalSocket ?: return
        if (input.isBlank()) return
        socket.send(JSONObject().apply { put("type", "input"); put("data", input + "\r") }.toString())
    }

    fun terminalStop() {
        terminalSocket?.close(1000, "bye")
        terminalSocket = null
        terminalRunning = false
    }
    fun selectTheme(id: String) { themeId = id; bridge.saveThemeId(id) }

    fun selectLang(value: AppLang) {
        lang = value
        bridge.saveLang(value.name)
    }

    fun tr(nb: String, en: String): String = if (lang == AppLang.EN) en else nb
    fun dismissNotice() { noticeText = "" }

    fun togglePin(file: String) {
        val next = pinned.toMutableSet()
        if (!next.add(file)) next.remove(file)
        pinned = next
        bridge.setPinned(next)
    }

    fun isUnread(session: SessionInfo): Boolean {
        val seen = seenCounts[session.file] ?: return false
        return session.messageCount > seen
    }

    fun markSeen(file: String, count: Int) {
        if (file.isBlank()) return
        seenCounts = seenCounts + (file to count)
        bridge.markSeen(file, count)
    }

    fun markAllRead() {
        sessions.forEach { markSeen(it.file, it.messageCount) }
    }

    fun regenerate() {
        val entry = messages.lastOrNull { it.role == "user" && !it.id.startsWith("local-") } ?: return
        if (activeCwd.isBlank() || activeFile.isBlank()) return
        viewModelScope.launch {
            runCatching {
                bridge.post("/api/regenerate", JSONObject().apply {
                    put("cwd", activeCwd)
                    put("file", activeFile)
                    put("entryId", entry.id)
                    put("text", entry.text)
                })
            }.onFailure { error = it.message ?: "Kunne ikke regenerere." }
        }
    }

    private fun loadTurnCards(file: String) {
        viewModelScope.launch {
            runCatching {
            val data = bridge.get("/api/omp/turns", mapOf("cwd" to activeCwd, "file" to file))
            val cards = data.optJSONArray("cards")
            turnCards = if (cards == null) emptyList() else (0 until cards.length()).mapNotNull { cards.optJSONObject(it) }
            val checks = data.optJSONArray("checks")
            projectChecks = if (checks == null) emptyList() else (0 until checks.length()).mapNotNull { checks.optJSONObject(it) }
                val todos = data.optJSONArray("todos")
                if (todos != null) todoPhases = todos
            }
        }
    }
    fun loadLocalModels() {
        viewModelScope.launch {
            runCatching {
                val data = bridge.get("/api/local/models")
                val array = data.optJSONArray("models")
                localModels = if (array == null) emptyList() else (0 until array.length()).mapNotNull { array.optJSONObject(it) }
            }.onFailure { error = it.message ?: "Kunne ikke hente lokale modeller." }
        }
    }

    fun startLocalModel(id: String) {
        if (id.isBlank()) return
        viewModelScope.launch {
            runCatching { bridge.post("/api/local/models/start", JSONObject().apply { put("id", id) }) }
                .onFailure { error = it.message ?: "Kunne ikke starte modellen." }
            loadLocalModels()
        }
    }

    fun stopLocalModel(id: String) {
        if (id.isBlank()) return
        viewModelScope.launch {
            runCatching { bridge.post("/api/local/models/stop", JSONObject().apply { put("id", id) }) }
                .onFailure { error = it.message ?: "Kunne ikke stoppe modellen." }
            loadLocalModels()
        }
    }
    fun loadProviders() {
        viewModelScope.launch {
            runCatching {
                val data = bridge.get("/api/omp/credentials")
                val array = data.optJSONArray("credentials")
                providers = if (array == null) emptyList() else (0 until array.length()).mapNotNull { array.optJSONObject(it) }
            }.onFailure { error = it.message ?: "Kunne ikke hente leverandører." }
        }
    }

    fun addProvider(id: String, key: String, baseUrl: String) {
        if (id.isBlank() || key.isBlank()) return
        viewModelScope.launch {
            runCatching {
                bridge.post("/api/omp/credentials", JSONObject().apply {
                    put("provider", id.trim().lowercase())
                    put("apiKey", key.trim())
                })
                loadProviders()
            }.onFailure { error = it.message ?: "Kunne ikke lagre nøkkelen." }
        }
    }

    fun deleteProvider(id: String) {
        if (id.isBlank()) return
        viewModelScope.launch {
            runCatching {
                bridge.delete("/api/omp/credentials", mapOf("id" to id))
                loadProviders()
            }.onFailure { error = it.message ?: "Kunne ikke slette leverandøren." }
        }
    }
    fun loadFolders(path: String) {
        folderPath = path
        viewModelScope.launch {
            runCatching {
                val data = bridge.get("/api/folders", mapOf("path" to path))
                val array = data.optJSONArray("dirs")
                folders = if (array == null) emptyList() else (0 until array.length()).mapNotNull { index ->
                    val item = array.optJSONObject(index) ?: return@mapNotNull null
                    FsEntry(item.optString("name"), item.optString("path"), true, 0)
                }
            }.onFailure { error = it.message ?: "Kunne ikke lese mappen." }
        }
    }

    fun makeFolder(path: String) {
        viewModelScope.launch {
            runCatching { bridge.post("/api/fs/mkdir", JSONObject().apply { put("path", path) }) }
                .onFailure { error = it.message ?: "Kunne ikke opprette mappen." }
            loadFolders(folderPath)
        }
    }

    fun deleteFolder(path: String) {
        viewModelScope.launch {
            runCatching { bridge.post("/api/fs/delete", JSONObject().apply { put("path", path) }) }
                .onFailure { error = it.message ?: "Kunne ikke slette mappen." }
            loadFolders(folderPath)
        }
    }

    fun renameFolder(from: String, to: String) {
        if (from.isBlank() || to.isBlank()) return
        viewModelScope.launch {
            runCatching { bridge.post("/api/fs/rename", JSONObject().apply { put("from", from); put("to", to) }) }
                .onFailure { error = it.message ?: "Kunne ikke endre navnet på mappen." }
            loadFolders(folderPath)
        }
    }

    fun registerProject(path: String) {
        if (path.isBlank()) return
        viewModelScope.launch {
            runCatching { bridge.post("/api/projects/create", JSONObject().apply { put("path", path) }) }
                .onFailure { error = it.message ?: "Kunne ikke registrere prosjektet." }
            loadRegistry()
        }
    }

    fun checkUpdate() {
        viewModelScope.launch(Dispatchers.IO) {
            val body = bridge.githubLatestRelease() ?: return@launch
            runCatching {
                val release = JSONObject(body)
                val assets = release.optJSONArray("assets") ?: return@runCatching
                val pattern = Regex("Chat-OMP-OMP-Native-([0-9.]+)\\\\.apk")
                var latest: String? = null
                for (index in 0 until assets.length()) {
                    val name = assets.optJSONObject(index)?.optString("name").orEmpty()
                    latest = pattern.find(name)?.groupValues?.get(1) ?: latest
                }
                if (latest != null && latest != BuildConfig.VERSION_NAME) {
                    updateTag = latest
                    updateStatus = "Ny versjon latest tilgjengelig"
                } else {
                    updateStatus = "Du kjører nyeste versjon"
                }
            }
        }
    }

    fun dismissUpdate() { updateTag = null }
    fun thinkingLabel(level: String): String = when (level) {
        "off" -> "Av"
        "minimal" -> "Minimalt"
        "low" -> "Lavt"
        "medium" -> "Middels"
        "high" -> "Høyt"
        "xhigh" -> "Ekstra høyt"
        "max" -> "Maks"
        "on" -> "På"
        else -> level
    }

    fun selectThinkingLevel(level: String) {
        thinkingLevel = level
        if (activeProvider.isNotBlank() && activeModelId.isNotBlank()) {
            bridge.saveThinking(activeProvider, activeModelId, level)
        }
    }

    private fun syncThinking(provider: String, modelId: String) {
        activeProvider = provider
        activeModelId = modelId
        val model = models.firstOrNull {
            it.optString("provider") == provider && it.optString("id") == modelId
        }
        val metadata = model?.optJSONObject("thinking")
        val efforts = mutableListOf<String>()
        val array = metadata?.optJSONArray("efforts")
        if (array != null) {
            for (index in 0 until array.length()) {
                array.optString(index).takeIf { it.isNotBlank() }?.let { efforts.add(it) }
            }
        }
        if (efforts.isEmpty() && metadata?.optString("mode") == "toggle") efforts.add("on")
        thinkingLevels = efforts.distinct()
        val stored = bridge.loadThinking(provider, modelId)
        thinkingLevel = when {
            stored.isNotBlank() && stored in thinkingLevels -> stored
            stateThinkingLevel.isNotBlank() && stateThinkingLevel in thinkingLevels -> stateThinkingLevel
            else -> thinkingLevels.firstOrNull() ?: ""
        }
    }
    fun openDiff(path: String, diff: String) {
        diffTitle = path
        diffText = diff.ifBlank { "Ingen diff tilgjengelig for denne filen." }
    }

    fun closeDiff() { diffText = null }

    fun deleteSession(file: String) {
        if (file.isBlank()) return
        viewModelScope.launch {
            runCatching { bridge.delete("/api/session", mapOf("file" to file)) }
                .onFailure { error = it.message ?: "Kunne ikke slette samtalen." }
            pinned = pinned - file
            seenCounts = seenCounts - file
            if (file == activeFile) {
                activeFile = ""
                activeTitle = ""
                messages = emptyList()
            }
            refresh()
        }
    }

    fun deleteProject(id: String) {
        if (id.isBlank()) return
        viewModelScope.launch {
            runCatching { bridge.delete("/api/projects", mapOf("id" to id, "physical" to "1")) }
                .onFailure { error = it.message ?: "Kunne ikke slette prosjektet." }
            loadRegistry()
            loadProjects()
            refresh()
        }
    }

    private fun deriveTitle(text: String): String {
        var value = text.trim().lineSequence().firstOrNull().orEmpty().trim()
        val fillers = listOf(
            "hvis du kan ", "hvis du kunne ", "hvis dere kan ", "kan du ", "kunne du ", "kan dere ",
            "kunne dere ", "jeg vil at du ", "jeg vil ", "jeg trenger at du ", "jeg trenger ",
            "vennligst ", "vær så snill ", "er det mulig å ", "er det mulig at du ", "please ",
            "could you ", "can you ", "i want you to ", "i want ", "i need you to ", "i need ",
        )
        var changed = true
        while (changed) {
            changed = false
            for (filler in fillers) {
                if (value.length > filler.length && value.lowercase().startsWith(filler)) {
                    value = value.substring(filler.length).trim()
                    changed = true
                }
            }
        }
        value = value.replace(Regex("^(en|ei|noen) (bra|god|fin) ", RegexOption.IGNORE_CASE), "")
        val imperative = mapOf(
            "finne" to "Finn", "sjekke" to "Sjekk", "lage" to "Lag", "skrive" to "Skriv",
            "sette" to "Sett", "vise" to "Vis", "forklare" to "Forklar", "hjelpe" to "Hjelp",
            "endre" to "Endre", "rette" to "Rett", "legge" to "Legg", "teste" to "Test",
            "installere" to "Installer", "oppdatere" to "Oppdater", "søke" to "Søk", "kjøre" to "Kjør",
            "bygge" to "Bygg", "fjerne" to "Fjern", "slette" to "Slett", "lese" to "Les",
        )
        val firstWord = value.substringBefore(' ').lowercase()
        imperative[firstWord]?.let { value = it + value.substring(firstWord.length) }
        value = value
            .replace(Regex("\\bai\\b", RegexOption.IGNORE_CASE), "AI")
            .replace(Regex("\\bgpu\\b", RegexOption.IGNORE_CASE), "GPU")
            .replace(Regex("\\bcpu\\b", RegexOption.IGNORE_CASE), "CPU")
            .replace(Regex("\\bapi\\b", RegexOption.IGNORE_CASE), "API")
            .replace(Regex("\\bpc\\b", RegexOption.IGNORE_CASE), "PC")
            .replace(Regex("\\barc\\b", RegexOption.IGNORE_CASE), "Arc")
            .replace(Regex("\\b(b\\d{3,4})\\b", RegexOption.IGNORE_CASE)) { it.groupValues[1].uppercase() }
            .replace(Regex("\\s+"), " ")
            .trim()
            .trimEnd('.', '?', '!', ',', ':', ';')
        if (value.isBlank()) value = text.trim().take(40)
        if (value.length > 48) {
            val cut = value.substring(0, 48)
            val lastSpace = cut.lastIndexOf(' ')
            value = (if (lastSpace > 24) cut.substring(0, lastSpace) else cut).trimEnd(',', '.', ':', ';', '-') + "…"
        }
        return value.replaceFirstChar { if (it.isLowerCase()) it.titlecase(java.util.Locale.getDefault()) else it.toString() }
    }

    override fun onCleared() {
        stopEvents()
        super.onCleared()
    }

    private fun enc(value: String): String = java.net.URLEncoder.encode(value, "UTF-8")
}
