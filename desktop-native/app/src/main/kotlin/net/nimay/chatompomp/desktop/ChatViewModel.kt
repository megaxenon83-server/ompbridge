package net.nimay.chatompomp.desktop

import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.setValue
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.Job
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch
import okhttp3.sse.EventSource
import org.json.JSONArray
import org.json.JSONObject

/**
 * The desktop twin of android-native's AppViewModel: same state names, same
 * bridge calls, same SSE handling, minus the phone-only features (files, git,
 * terminal, adb, voice, wake-on-LAN, QR scanning).
 *
 * Everything the UI reads is Compose state, so a frame arriving from the bridge
 * repaints the chat without any adapter layer.
 */
class ChatViewModel {

    val prefs = Prefs()
    val bridge = BridgeClient(prefs)
    private val scope = CoroutineScope(SupervisorJob() + Dispatchers.Main.immediate)

    // ---------------------------------------------------------------- connection

    var pairing by mutableStateOf(bridge.pairing)
        private set
    var connected by mutableStateOf(false)
        private set
    var connecting by mutableStateOf(false)
        private set
    var detected by mutableStateOf<BridgeLocation?>(null)
        private set
    var bridgeVersion by mutableStateOf("")
        private set

    // ---------------------------------------------------------------- transcript

    var sessions by mutableStateOf<List<SessionInfo>>(emptyList())
        private set
    var projects by mutableStateOf<List<ProjectInfo>>(emptyList())
        private set
    var models by mutableStateOf<List<ModelInfo>>(emptyList())
        private set
    var activeFile by mutableStateOf("")
        private set
    var activeCwd by mutableStateOf("")
        private set
    var activeTitle by mutableStateOf("")
        private set
    var activeModelName by mutableStateOf("")
        private set
    var messages by mutableStateOf<List<Entry>>(emptyList())
        private set
    var stream by mutableStateOf(StreamState())
        private set
    var busy by mutableStateOf(false)
        private set
    var error by mutableStateOf("")
        private set
    var noticeText by mutableStateOf("")
        private set
    var approval by mutableStateOf<JSONObject?>(null)
        private set
    var draft by mutableStateOf("")
        private set
    var contextTokens by mutableStateOf(0)
    var modelSwitchText by mutableStateOf("")
        private set
    var contextWindow by mutableStateOf(0)
        private set
    var themeId by mutableStateOf("omp")
        private set
    var lang by mutableStateOf(AppLang.NB)
        private set
    var pinned by mutableStateOf<Set<String>>(emptySet())
        private set
    var seenCounts by mutableStateOf<Map<String, Int>>(emptyMap())
        private set
    var thinkingLevels by mutableStateOf<List<String>>(emptyList())
        private set
    var thinkingLevel by mutableStateOf("")
        private set

    // ------------------------------------------------------------------- files

    var fsPath by mutableStateOf("")
        private set
    var fsEntries by mutableStateOf<List<FsEntry>>(emptyList())
        private set
    var fsRoots by mutableStateOf<List<FsEntry>>(emptyList())
        private set
    var fsPlaces by mutableStateOf<List<FsEntry>>(emptyList())
        private set
    var fsFile by mutableStateOf<FileContent?>(null)
        private set
    var editingContent by mutableStateOf<String?>(null)
        private set
    var fsError by mutableStateOf("")
        private set
    var fsBusy by mutableStateOf(false)
        private set
    var fsNotice by mutableStateOf("")
        private set

    // --------------------------------------------------------------------- git

    var gitPath by mutableStateOf("")
        private set
    var gitStatus by mutableStateOf<JSONObject?>(null)
        private set
    var gitLog by mutableStateOf<List<JSONObject>>(emptyList())
        private set
    var gitDiffText by mutableStateOf<String?>(null)
        private set
    var gitDiffTitle by mutableStateOf("")
        private set
    var gitError by mutableStateOf("")
        private set
    var gitBusy by mutableStateOf(false)
        private set

    // ---------------------------------------------------------------- terminal

    var terminalOutput by mutableStateOf("")
        private set
    var terminalRunning by mutableStateOf(false)
        private set
    var terminalCwd by mutableStateOf("")
        private set
    var terminalId by mutableStateOf("")
        private set
    var terminalError by mutableStateOf("")
        private set

    // --------------------------------------------------------------------- adb

    var adbStatus by mutableStateOf<JSONObject?>(null)
        private set
    var adbError by mutableStateOf("")
        private set
    var adbBusy by mutableStateOf(false)
        private set

    // ------------------------------------------------------------------- voice

    var voiceLocal by mutableStateOf<JSONObject?>(null)
        private set
    var voiceEngines by mutableStateOf<JSONObject?>(null)
        private set
    var voiceNotice by mutableStateOf("")
        private set
    var voiceBusy by mutableStateOf(false)
        private set

    val theme: ThemeSpec get() = themeById(themeId)

    // ---------------------------------------------------------------- internals

    private var eventSource: EventSource? = null
    private var eventsToken = 0
    private var retryJob: Job? = null
    private var terminalSocket: okhttp3.WebSocket? = null
    private var streamingId = ""
    private var streamingText = StringBuilder()
    private var streamingThinking = StringBuilder()
    private var freshSessionFile = ""
    private var activeProvider = ""
    private var activeModelId = ""

    init {
        themeId = prefs.themeId()
        lang = prefs.lang()
        pinned = prefs.pinned()
        detected = BridgeConfig.detect()
        scope.launch { autoConnect() }
    }

    // ---------------------------------------------------------------- pairing

    /** Try the saved pairing first, then whatever config.json we can find. */
    private suspend fun autoConnect() {
        val saved = bridge.pairing
        if (saved != null && tryPairing(saved)) return
        val found = detected ?: return
        tryPairing(Pairing(found.origin, found.token))
    }

    /** Connect from the bridge's own config.json on this PC. */
    fun connectDetected() {
        val found = detected ?: run {
            error = "Fant ingen bridge-config.json på denne PC-en."
            return
        }
        scope.launch { connecting = true; tryPairing(Pairing(found.origin, found.token)); connecting = false }
    }

    /** Connect from a pasted pairing link (omp2://, chatomp://pair/…, origin|token). */
    fun connectWithLink(link: String) {
        scope.launch {
            connecting = true
            error = ""
            val candidate = runCatching { BridgeConfig.resolveLink(link) }
                .onFailure { error = it.message ?: "Kunne ikke lese paringslenken." }
                .getOrNull()
            if (candidate != null) tryPairing(candidate)
            connecting = false
        }
    }

    fun retry() {
        scope.launch { connecting = true; autoConnect(); connecting = false }
    }

    private suspend fun tryPairing(candidate: Pairing): Boolean {
        connecting = true
        return try {
            val health = bridge.health(candidate.origin, candidate.token)
            bridge.save(candidate)
            pairing = candidate
            bridgeVersion = health.optString("version")
            connected = true
            error = ""
            // Sessions must be loaded before we can auto-open the newest chat.
            fetchSessions()
            loadProjects()
            autoOpenLatest()
            true
        } catch (failure: Throwable) {
            connected = false
            error = failure.message?.takeIf { it.isNotBlank() }
                ?: "Fikk ikke kontakt med bridgen på ${candidate.origin}. Sjekk at OMP Bridge kjører."
            false
        } finally {
            connecting = false
        }
    }

    fun forget() {
        eventSource?.cancel()
        eventSource = null
        eventsToken++
        bridge.forget()
        pairing = null
        connected = false
        sessions = emptyList()
        messages = emptyList()
        activeFile = ""
        activeCwd = ""
        activeTitle = ""
        stream = StreamState()
        busy = false
        contextTokens = 0
        contextWindow = 0
        error = ""
        detected = BridgeConfig.detect()
    }

    // ---------------------------------------------------------------- data

    fun refresh() {
        if (!connected) return
        scope.launch { fetchSessions() }
    }

    private suspend fun fetchSessions() {
        runCatching {
            val data = bridge.get("/api/sessions", mapOf("archived" to "1"))
            sessions = SessionInfo.list(data.optJSONArray("sessions"))
            seenCounts = sessions.mapNotNull { session ->
                val seen = prefs.seenCount(session.file)
                if (seen >= 0) session.file to seen else null
            }.toMap()
            val nextPinned = pinned.filter { file -> sessions.any { it.file == file } }.toSet()
            if (nextPinned != pinned) {
                pinned = nextPinned
                prefs.setPinned(nextPinned)
            }
        }.onFailure { error = it.message ?: "Kunne ikke hente samtaler." }
    }

    fun loadProjects() {
        if (!connected) return
        scope.launch {
            runCatching {
                val data = bridge.get("/api/projects")
                projects = ProjectInfo.list(data.optJSONArray("projects"))
            }.onFailure { error = it.message ?: "Kunne ikke hente prosjekter." }
        }
    }

    fun loadModels() {
        if (!connected || activeCwd.isBlank()) return
        scope.launch {
            runCatching {
                val data = bridge.get("/api/models", mapOf("cwd" to activeCwd))
                models = ModelInfo.list(data.optJSONArray("models"))
                if (activeProvider.isNotBlank() && activeModelId.isNotBlank()) syncThinking(activeProvider, activeModelId)
            }.onFailure { error = it.message ?: "Kunne ikke hente modeller." }
        }
    }

    private fun autoOpenLatest() {
        if (activeFile.isNotBlank()) return
        // Never open an archived chat on a cold start; it would look like a fresh
        // conversation that the user cannot find in the list later.
        val latest = sessions.firstOrNull { !it.archived } ?: sessions.firstOrNull() ?: return
        openSession(latest)
    }

    fun openSession(info: SessionInfo) {
        activeFile = info.file
        activeCwd = info.cwd
        activeTitle = info.title
        activeModelName = info.model
        draft = prefs.draft(info.file)
        markSeen(info.file, info.messageCount)
        busy = false
        streamingId = ""
        streamingText = StringBuilder()
        streamingThinking = StringBuilder()
        messages = emptyList()
        stream = StreamState()
        error = ""
        noticeText = ""
        approval = null
        scope.launch {
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
                }.filter { it.text.isNotBlank() || it.thinking.isNotBlank() || it.toolName.isNotBlank() }
                data.optJSONObject("model")?.let { model ->
                    model.optString("name").takeIf { it.isNotBlank() }?.let { activeModelName = it }
                    syncThinking(model.optString("provider"), model.optString("id"))
                }
            }.onFailure { error = it.message ?: "Kunne ikke hente samtalen." }
            runCatching {
                val snapshot = bridge.get("/api/state", mapOf("cwd" to info.cwd))
                snapshot.optJSONObject("state")?.let { state -> applyState(state) }
                applyPending(snapshot.optJSONObject("request"))
            }
        }
        loadModels()
        startEvents()
    }

    fun newSession(cwd: String) {
        if (cwd.isBlank()) return
        scope.launch {
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
                busy = false
                streamingId = ""
                streamingText = StringBuilder()
                streamingThinking = StringBuilder()
                contextTokens = 0
                contextWindow = 0
                refresh()
                loadModels()
                startEvents()
            }.onFailure { error = it.message ?: "Kunne ikke lage ny samtale." }
        }
    }

    // ---------------------------------------------------------------- events

    private fun startEvents() {
        stopEvents()
        if (!connected || activeFile.isBlank()) return
        val file = activeFile
        val cwd = activeCwd
        val token = ++eventsToken
        eventSource = bridge.openEvents(
            cwd = cwd,
            file = file,
            onFrame = { frame -> scope.launch { applyFrame(frame) } },
            onClosed = { scope.launch { scheduleRetry(token, file) } },
        )
    }

    private fun stopEvents() {
        eventsToken++
        retryJob?.cancel()
        retryJob = null
        eventSource?.cancel()
        eventSource = null
    }

    /** The bridge restarts now and then; keep the chat live instead of freezing. */
    private fun scheduleRetry(token: Int, file: String) {
        if (token != eventsToken) return
        eventSource = null
        stream = stream.copy(active = false)
        retryJob?.cancel()
        retryJob = scope.launch {
            delay(1_500)
            if (token != eventsToken || !connected || activeFile != file) return@launch
            startEvents()
        }
    }

    private fun applyPending(request: JSONObject?) {
        if (request == null || request.length() == 0) return
        val id = request.optString("id").ifBlank { request.optString("requestId") }
        val method = request.optString("method")
        if (id.isNotBlank() && method.isNotBlank()) approval = request
    }

    private fun applyState(state: JSONObject) {
        stream = StreamState(
            active = state.optBoolean("isStreaming"),
            phase = stream.phase,
            tokensPerSecond = state.optDouble("tokensPerSecond", 0.0),
        )
        busy = state.optBoolean("isStreaming")
        state.optString("thinkingLevel").takeIf { it.isNotBlank() }?.let { stateThinking(it) }
        state.optJSONObject("contextUsage")?.let { usage ->
            contextTokens = usage.optInt("tokens", 0)
            val window = usage.optInt("contextWindow", 0)
            if (window > 0) contextWindow = window
        }
        state.optJSONObject("model")?.let { model ->
            val provider = model.optString("provider")
            val id = model.optString("id")
            model.optString("name").takeIf { it.isNotBlank() }?.let { activeModelName = it }
            if (provider.isNotBlank() && id.isNotBlank()) syncThinking(provider, id)
        }
    }

    private var stateThinkingLevel = ""

    private fun stateThinking(level: String) {
        stateThinkingLevel = level
        if (thinkingLevel.isBlank()) thinkingLevel = level
        if (thinkingLevels.isEmpty()) thinkingLevels = listOf(level)
    }

    private fun applyFrame(frame: JSONObject) {
        val type = frame.optString("type")
        val frameFile = frame.optString("sessionFile")
        if (type != "hello" && type != "state" && frameFile.isNotBlank() &&
            activeFile.isNotBlank() && !frameFile.equals(activeFile, ignoreCase = true)
        ) {
            return
        }
        when (type) {
            "hello", "state" -> {
                frame.optString("version").takeIf { it.isNotBlank() }?.let { bridgeVersion = it }
                frame.optJSONObject("state")?.let { applyState(it) }
            }
            "message_start" -> {
                val role = frame.optString("role")
                    .ifBlank { frame.optJSONObject("message")?.optString("role") ?: "" }
                if (role == "assistant") {
                    streamingId = frame.optString("messageId").ifBlank { "stream-" + System.currentTimeMillis() }
                    streamingText = StringBuilder()
                    streamingThinking = StringBuilder()
                    busy = true
                    stream = stream.copy(active = true, phase = "OMP skriver")
                    upsert(Entry(id = streamingId, role = "assistant", text = "", streaming = true, timestamp = System.currentTimeMillis()))
                }
            }
            "model_preparing" -> {
                val phase = frame.optString("phase")
                val label = frame.optString("name").ifBlank { activeModelName }
                modelSwitchText = when (phase) {
                    "starting" -> "Starter $label …"
                    "unloading" -> "Frigjør VRAM …"
                    "loading" -> "Laster $label …"
                    "waiting" -> "Venter på ledig GPU …"
                    else -> ""
                }
            }
            "message_delta" -> {
                val delta = frame.optString("delta")
                val kind = frame.optString("kind")
                if (streamingId.isNotBlank()) {
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
                    if (streamingId.isNotBlank()) finalizeStreaming()
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
                    streaming = type == "tool_start",
                )
                messages = if (existing >= 0) messages.toMutableList().also { it[existing] = entry } else messages + entry
                if (type != "tool_end") {
                    stream = stream.copy(active = true, phase = phaseFor(name))
                    busy = true
                }
            }
            "agent_end", "session_settled" -> {
                if (activeFile.isNotBlank()) markSeen(activeFile, messages.size)
                busy = false
                stream = stream.copy(active = false, phase = "")
                if (streamingId.isNotBlank()) finalizeStreaming()
            }
            "ui_request", "extension_ui_request" -> approval = frame
            "ui_cancel" -> if (approval?.optString("id") == frame.optString("targetId")) approval = null
            "schedule_status" -> noticeText = frame.optString("status").ifBlank { frame.optString("error") }
            "notice" -> noticeText = frame.optString("message").ifBlank {
                frame.optJSONObject("notice")?.optString("message").orEmpty()
            }
            "rpc_error" -> noticeText = frame.optString("error")
        }
    }

    private fun upsert(entry: Entry) {
        val index = messages.indexOfFirst { it.role == entry.role && it.id == entry.id }
        messages = if (index >= 0) messages.toMutableList().also { it[index] = entry } else messages + entry
    }

    private fun add(entry: Entry) {
        messages = messages + entry
    }

    private fun updateStreaming() = updateStreamingEntry(streamingText.toString(), streamingThinking.toString())

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

    private fun phaseFor(tool: String): String = when (tool) {
        "bash" -> "Kjører Bash"
        "read" -> "Leser filer"
        "edit", "write", "patch" -> "Endrer kode"
        "web_search" -> "Søker på nettet"
        else -> "OMP arbeider"
    }

    // ---------------------------------------------------------------- actions

    fun send(text: String) {
        val value = text.trim()
        if (value.isBlank() || activeFile.isBlank()) return
        val optimistic = Entry(
            id = "local-" + System.currentTimeMillis(),
            role = "user",
            text = value,
            timestamp = System.currentTimeMillis(),
        )
        messages = messages + optimistic
        busy = true
        draft = ""
        prefs.saveDraft(activeFile, "")
        if (activeFile == freshSessionFile) {
            val computed = deriveTitle(value)
            if (computed.isNotBlank()) {
                activeTitle = computed
                scope.launch {
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
        stream = StreamState(active = true, phase = "Klargjør OMP")
        scope.launch {
            delay(45_000)
            if (busy && stream.active && streamingId.isBlank() && stream.phase == "Klargjør OMP") {
                error = "OMP svarte ikke. Prøv igjen, eller sjekk at bridgen kjører."
                busy = false
                stream = StreamState()
            }
        }
        scope.launch {
            runCatching {
                bridge.post("/api/prompt", JSONObject().apply {
                    put("cwd", activeCwd)
                    put("file", activeFile)
                    put("text", value)
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
        scope.launch {
            runCatching {
                bridge.post("/api/abort", JSONObject().apply { put("cwd", activeCwd); put("file", activeFile) })
            }
            busy = false
            stream = StreamState(active = false)
        }
    }

    fun respondApproval(
        confirmed: Boolean? = null,
        value: String? = null,
        allowAlways: Boolean = false,
        cancelled: Boolean = false,
        answers: JSONArray? = null,
    ) {
        val pending = approval ?: return
        approval = null
        scope.launch {
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

    fun chooseModel(model: ModelInfo) {
        if (activeCwd.isBlank()) return
        scope.launch {
            modelSwitchText = "Bytter til ${model.name} …"
            runCatching {
                bridge.post("/api/model", JSONObject().apply {
                    put("cwd", activeCwd)
                    put("provider", model.provider)
                    put("modelId", model.id)
                    if (activeFile.isNotBlank()) put("file", activeFile)
                })
                activeModelName = model.name
                thinkingLevels = model.efforts
                thinkingLevel = when {
                    model.efforts.isEmpty() -> ""
                    thinkingLevel in model.efforts -> thinkingLevel
                    else -> model.efforts.first()
                }
            }.onFailure { error = it.message ?: "Kunne ikke bytte modell." }
            modelSwitchText = ""
        }
    }

    fun selectThinkingLevel(level: String) {
        thinkingLevel = level
        if (activeProvider.isNotBlank() && activeModelId.isNotBlank()) prefs.put("thinking:$activeProvider/$activeModelId", level)
    }

    private fun syncThinking(provider: String, modelId: String) {
        if (provider.isBlank() || modelId.isBlank()) return
        activeProvider = provider
        activeModelId = modelId
        val model = models.firstOrNull { it.provider == provider && it.id == modelId } ?: return
        thinkingLevels = model.efforts
        if (thinkingLevels.isEmpty()) {
            thinkingLevel = ""
            return
        }
        val saved = prefs.string("thinking:$provider/$modelId")
        val stateLevel = stateThinkingLevel
        thinkingLevel = when {
            saved.isNotBlank() && saved in thinkingLevels -> saved
            stateLevel.isNotBlank() && stateLevel in thinkingLevels -> stateLevel
            else -> thinkingLevels.firstOrNull().orEmpty()
        }
    }

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

    // ---------------------------------------------------------------- chats

    fun renameSession(file: String, name: String, cwd: String) {
        if (file.isBlank() || name.isBlank()) return
        scope.launch {
            runCatching {
                bridge.post("/api/sessions/name", JSONObject().apply {
                    put("file", file)
                    put("cwd", cwd)
                    put("name", name.trim())
                })
                if (file == activeFile) activeTitle = name.trim()
            }.onFailure { error = it.message ?: "Kunne ikke endre navnet." }
            refresh()
        }
    }

    fun archiveSession(file: String, archived: Boolean) {
        scope.launch {
            runCatching {
                bridge.post("/api/sessions/archive", JSONObject().apply {
                    put("file", file)
                    put("archived", archived)
                })
            }.onFailure { error = it.message ?: "Kunne ikke arkivere samtalen." }
            refresh()
        }
    }

    fun togglePin(file: String) {
        val next = pinned.toMutableSet()
        if (!next.add(file)) next.remove(file)
        pinned = next
        prefs.setPinned(next)
    }

    fun isUnread(session: SessionInfo): Boolean {
        val seen = seenCounts[session.file] ?: return false
        return session.messageCount > seen
    }

    fun markSeen(file: String, count: Int) {
        if (file.isBlank()) return
        seenCounts = seenCounts + (file to count)
        prefs.markSeen(file, count)
    }

    fun markAllRead() {
        sessions.forEach { markSeen(it.file, it.messageCount) }
    }

    // ---------------------------------------------------------------- files

    /** The folder the files screen should look at when nothing else is chosen. */
    fun toolCwd(): String = activeCwd.takeIf { it.isNotBlank() }
        ?: projects.firstOrNull()?.path.orEmpty()

    fun loadFs(path: String) {
        scope.launch {
            fsBusy = true
            fsError = ""
            fsNotice = ""
            runCatching {
                val data = bridge.get("/api/fs/list", mapOf("path" to path))
                if (data.optBoolean("roots")) {
                    fsPath = ""
                    fsRoots = FsEntry.list(data.optJSONArray("entries"))
                    val places = data.optJSONArray("places")
                    fsPlaces = if (places == null) emptyList() else (0 until places.length()).mapNotNull { index ->
                        val item = places.optJSONObject(index) ?: return@mapNotNull null
                        FsEntry(
                            name = item.optString("label"),
                            path = item.optString("path"),
                            isDir = true,
                            size = 0,
                            mtime = 0,
                        )
                    }
                    fsEntries = emptyList()
                    fsFile = null
                    editingContent = null
                } else {
                    fsPath = data.optString("path")
                    fsEntries = FsEntry.list(data.optJSONArray("entries"))
                        .sortedWith(compareByDescending<FsEntry> { it.isDir }.thenBy { it.name.lowercase() })
                    fsRoots = emptyList()
                    fsPlaces = emptyList()
                }
            }.onFailure { fsError = it.message ?: "Kunne ikke lese mappen." }
            fsBusy = false
        }
    }

    fun fsRootsListing() = loadFs("")

    fun canGoUp(): Boolean = fsPath.isNotBlank() && java.io.File(fsPath).parent != null

    fun fsUp() {
        if (fsPath.isBlank()) return
        val parent = java.io.File(fsPath).parent ?: ""
        loadFs(parent)
    }

    fun openFile(path: String) {
        scope.launch {
            fsError = ""
            runCatching {
                val data = bridge.get("/api/files/read", mapOf("path" to path))
                fsFile = FileContent(
                    path = data.optString("path"),
                    content = data.optString("content"),
                    size = data.optLong("size"),
                    mtime = data.optLong("mtime"),
                )
                editingContent = null
            }.onFailure { fsError = it.message ?: "Kunne ikke lese filen." }
        }
    }

    fun closeFile() {
        fsFile = null
        editingContent = null
    }

    fun startEditing() {
        editingContent = fsFile?.content
    }

    fun updateEditing(value: String) {
        editingContent = value
    }

    fun cancelEditing() {
        editingContent = null
    }

    fun saveFile() {
        val file = fsFile ?: return
        val content = editingContent ?: return
        scope.launch {
            fsError = ""
            runCatching {
                bridge.post("/api/files/write", JSONObject().apply {
                    put("path", file.path)
                    put("content", content)
                    if (file.mtime > 0) put("expectedMtime", file.mtime)
                })
                editingContent = null
                fsNotice = "Lagret ${file.name}"
                val data = bridge.get("/api/files/read", mapOf("path" to file.path))
                fsFile = FileContent(
                    path = data.optString("path"),
                    content = data.optString("content"),
                    size = data.optLong("size"),
                    mtime = data.optLong("mtime"),
                )
            }.onFailure { fsError = it.message ?: "Kunne ikke lagre filen." }
        }
    }

    fun makeDir(name: String) {
        val trimmed = name.trim()
        if (trimmed.isBlank() || fsPath.isBlank()) return
        val target = java.io.File(fsPath, trimmed).path
        scope.launch {
            runCatching {
                bridge.post("/api/fs/mkdir", JSONObject().apply { put("path", target) })
                fsNotice = "Opprettet $trimmed"
                loadFs(fsPath)
            }.onFailure { fsError = it.message ?: "Kunne ikke opprette mappen." }
        }
    }

    fun deleteEntry(path: String) {
        scope.launch {
            runCatching {
                bridge.post("/api/fs/delete", JSONObject().apply { put("path", path) })
                if (fsFile?.path == path) closeFile()
                fsNotice = "Slettet"
                loadFs(fsPath)
            }.onFailure { fsError = it.message ?: "Kunne ikke slette." }
        }
    }

    fun renameEntry(path: String, newName: String) {
        val trimmed = newName.trim()
        if (trimmed.isBlank()) return
        val parent = java.io.File(path).parent ?: return
        val target = java.io.File(parent, trimmed).path
        scope.launch {
            runCatching {
                bridge.post("/api/fs/rename", JSONObject().apply { put("from", path); put("to", target) })
                fsNotice = "Navn endret"
                loadFs(fsPath)
            }.onFailure { fsError = it.message ?: "Kunne ikke endre navnet." }
        }
    }

    fun dismissFsError() { fsError = "" }

    fun dismissFsNotice() { fsNotice = "" }

    // ---------------------------------------------------------------- git

    fun loadGit() = loadGit(toolCwd())

    fun loadGit(path: String) {
        scope.launch {
            gitBusy = true
            gitError = ""
            if (path.isBlank()) {
                gitStatus = null
                gitLog = emptyList()
                gitError = "Ingen prosjektmappe valgt ennå – åpne en samtale først."
                gitBusy = false
                return@launch
            }
            gitPath = path
            runCatching {
                gitStatus = bridge.get("/api/git/status", mapOf("path" to path))
                val log = bridge.get("/api/git/log", mapOf("path" to path))
                val commits = log.optJSONArray("commits")
                gitLog = if (commits == null) emptyList() else (0 until commits.length()).mapNotNull { commits.optJSONObject(it) }
            }.onFailure {
                gitStatus = null
                gitLog = emptyList()
                gitError = it.message ?: "Kunne ikke lese Git-status."
            }
            gitBusy = false
        }
    }

    fun stageAll() {
        val files = gitFiles().map { it.optString("path") }.filter { it.isNotBlank() }
        if (files.isEmpty() || gitPath.isBlank()) return
        scope.launch {
            runCatching {
                bridge.post("/api/git/stage", JSONObject().apply {
                    put("cwd", gitPath)
                    put("files", JSONArray(files))
                })
            }.onFailure { gitError = it.message ?: "Kunne ikke stage filene." }
            loadGit()
        }
    }

    fun commit(message: String) {
        if (gitPath.isBlank() || message.isBlank()) return
        scope.launch {
            runCatching {
                bridge.post("/api/git/commit", JSONObject().apply {
                    put("cwd", gitPath)
                    put("message", message.trim())
                })
            }.onFailure { gitError = it.message ?: "Commit feilet." }
            loadGit()
        }
    }

    fun gitFiles(): List<JSONObject> {
        val files = gitStatus?.optJSONArray("files") ?: return emptyList()
        return (0 until files.length()).mapNotNull { files.optJSONObject(it) }
    }

    fun openDiff(file: String) {
        if (gitPath.isBlank()) return
        scope.launch {
            runCatching {
                val data = bridge.get("/api/git/diff", mapOf("path" to gitPath, "file" to file))
                gitDiffTitle = file
                val diff = data.optString("diff")
                gitDiffText = diff.ifBlank { "Ingen endringer i filen." }
            }.onFailure { gitError = it.message ?: "Kunne ikke hente diff." }
        }
    }

    fun closeDiff() {
        gitDiffText = null
        gitDiffTitle = ""
    }

    fun dismissGitError() { gitError = "" }

    // ---------------------------------------------------------------- terminal

    fun terminalStart() {
        if (terminalSocket != null) return
        scope.launch {
            terminalError = ""
            val dir = toolCwd()
            if (dir.isBlank()) {
                terminalError = "Velg en samtale eller et prosjekt først."
                return@launch
            }
            terminalCwd = dir
            runCatching {
                val data = bridge.post("/api/terminal/create", JSONObject().apply {
                    put("cwd", dir)
                    put("cols", 120)
                    put("rows", 30)
                })
                val id = data.optString("id")
                require(id.isNotBlank()) { "Fikk ingen terminal fra bridgen." }
                terminalId = id
                terminalOutput = ""
                terminalRunning = true
                terminalSocket = bridge.terminalSocket(
                    id = id,
                    onText = { text -> scope.launch { appendTerminal(text) } },
                    onOpen = {},
                    onClosed = { scope.launch { terminalRunning = false } },
                )
            }.onFailure {
                terminalRunning = false
                terminalError = it.message ?: "Kunne ikke starte terminalen."
            }
        }
    }

    private fun appendTerminal(text: String) {
        terminalOutput = (terminalOutput + stripAnsi(text)).takeLast(120_000)
    }

    private fun stripAnsi(text: String): String = text
        .replace(ANSI_CSI, "")
        .replace(ANSI_OSC, "")
        .replace("\r\n", "\n")
        .replace('\r', '\n')

    fun terminalSend(input: String) {
        val socket = terminalSocket ?: return
        socket.send(JSONObject().apply { put("type", "input"); put("data", input) }.toString())
    }

    fun terminalSendLine(line: String) {
        if (line.isBlank()) return
        val socket = terminalSocket ?: return
        socket.send(JSONObject().apply { put("type", "input"); put("data", line + "\r") }.toString())
    }

    fun terminalCtrlC() {
        val socket = terminalSocket ?: return
        socket.send(JSONObject().apply { put("type", "input"); put("data", "\u0003") }.toString())
    }

    fun terminalClear() {
        terminalOutput = ""
    }

    fun terminalStop() {
        terminalSocket?.close(1000, "bye")
        terminalSocket = null
        terminalRunning = false
        val id = terminalId
        terminalId = ""
        if (id.isNotBlank()) {
            scope.launch {
                runCatching { bridge.post("/api/terminal/kill", JSONObject().apply { put("id", id) }) }
            }
        }
    }

    fun dismissTerminalError() { terminalError = "" }

    // ---------------------------------------------------------------- adb

    fun loadAdb() {
        scope.launch {
            adbBusy = true
            adbError = ""
            runCatching {
                adbStatus = bridge.get("/api/adb/status")
            }.onFailure { adbError = it.message ?: "Kunne ikke hente ADB-status." }
            adbBusy = false
        }
    }

    fun installAdb() {
        scope.launch {
            adbBusy = true
            adbError = ""
            runCatching {
                bridge.post("/api/adb/install")
            }.onFailure { adbError = it.message ?: "Kunne ikke installere ADB." }
            adbBusy = false
            loadAdb()
        }
    }

    fun dismissAdbError() { adbError = "" }

    fun adbDevices(): List<JSONObject> {
        val devices = adbStatus?.optJSONArray("devices") ?: return emptyList()
        return (0 until devices.length()).mapNotNull { devices.optJSONObject(it) }
    }

    // ---------------------------------------------------------------- voice

    fun loadVoice() {
        scope.launch {
            runCatching {
                voiceLocal = bridge.get("/api/voice/local")
                voiceEngines = bridge.get("/api/voice/engines")
                voiceNotice = ""
            }.onFailure { voiceNotice = it.message ?: "Kunne ikke hente tale-status." }
        }
    }

    fun speak(text: String) {
        if (text.isBlank()) return
        scope.launch {
            voiceBusy = true
            runCatching {
                bridge.post("/api/voice/speak", JSONObject().apply { put("text", text) })
                voiceNotice = "Sendt til opplesing."
            }.onFailure { voiceNotice = it.message ?: "Opplesing feilet." }
            voiceBusy = false
        }
    }

    fun voiceStart() {
        scope.launch {
            runCatching {
                bridge.post("/api/voice/start")
                voiceNotice = "Lytting startet."
            }.onFailure { voiceNotice = it.message ?: "Kunne ikke starte lytting." }
            loadVoice()
        }
    }

    fun voiceStop() {
        scope.launch {
            runCatching {
                bridge.post("/api/voice/stop")
                voiceNotice = "Lytting stoppet."
            }.onFailure { voiceNotice = it.message ?: "Kunne ikke stoppe lytting." }
            loadVoice()
        }
    }

    fun dismissVoiceNotice() { voiceNotice = "" }

    // ---------------------------------------------------------------- UI state

    fun selectTheme(id: String) {
        themeId = id
        prefs.put("themeId", id)
    }

    fun selectLang(value: AppLang) {
        lang = value
        prefs.put("lang", value.name)
    }

    fun updateDraft(value: String) {
        draft = value
        if (activeFile.isNotBlank()) prefs.saveDraft(activeFile, value)
    }

    fun dismissError() { error = "" }

    fun reportError(message: String) { error = message }

    fun dismissNotice() { noticeText = "" }

    fun saveWindow(width: Int, height: Int) = prefs.saveWindow(width, height)

    private fun deriveTitle(text: String): String {        var value = text.trim().lineSequence().firstOrNull().orEmpty().trim()
        val fillers = listOf(
            "hvis du kan ", "hvis du kunne ", "kan du ", "kunne du ", "kan dere ", "kunne dere ",
            "jeg vil at du ", "jeg vil ", "jeg trenger at du ", "jeg trenger ", "vennligst ",
            "vær så snill ", "er det mulig å ", "please ", "could you ", "can you ",
            "i want you to ", "i want ", "i need you to ", "i need ",
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
        value = value.trimEnd('.', '!', '?', ':', ';', ' ')
        if (value.isBlank()) value = text.trim().lineSequence().firstOrNull().orEmpty()
        if (value.length > 64) value = value.take(64).trimEnd() + " …"
        return value.replaceFirstChar { char -> if (char.isLowerCase()) char.titlecase() else char.toString() }
    }
}

// ANSI/OSC escapes from the PTY are decoration we cannot render, so they are
// stripped before the terminal output reaches the view.
private val ANSI_CSI = Regex("\u001B\\[[0-9;?]*[ -/]*[@-~]")
private val ANSI_OSC = Regex("\u001B\\][^\u0007]*\u0007")
