package net.nimay.chatompomp.desktop

import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import okhttp3.MediaType.Companion.toMediaType
import okhttp3.OkHttpClient
import okhttp3.Request
import okhttp3.RequestBody.Companion.toRequestBody
import okhttp3.sse.EventSource
import okhttp3.sse.EventSourceListener
import okhttp3.sse.EventSources
import org.json.JSONObject
import java.util.concurrent.TimeUnit

/** A pairing: which bridge, and the bearer token. */
data class Pairing(val origin: String, val token: String)

/**
 * Minimal HTTP + SSE client for OMP Bridge, ported from android-native's
 * BridgeClient. JSON in, JSON out, bearer auth. Nothing here knows about
 * Compose, so the same code would work in any JVM client.
 */
class BridgeClient(private val prefs: Prefs) {

    // API calls need a finite timeout; the SSE stream below must stay open forever.
    private val apiClient = OkHttpClient.Builder()
        .connectTimeout(8, TimeUnit.SECONDS)
        .readTimeout(120, TimeUnit.SECONDS)
        .writeTimeout(70, TimeUnit.SECONDS)
        .build()

    private val sseClient = OkHttpClient.Builder()
        .connectTimeout(8, TimeUnit.SECONDS)
        .readTimeout(0, TimeUnit.MILLISECONDS) // SSE: keep the stream open
        .build()

    var pairing: Pairing? = prefs.pairing()
        private set

    fun save(pairing: Pairing) {
        this.pairing = pairing
        prefs.savePairing(pairing)
    }

    fun forget() {
        pairing = null
        prefs.clearPairing()
    }

    suspend fun get(path: String, query: Map<String, String> = emptyMap()): JSONObject =
        call("GET", path, query, null)

    suspend fun post(path: String, body: JSONObject? = null): JSONObject =
        call("POST", path, emptyMap(), body)

    suspend fun delete(path: String, query: Map<String, String> = emptyMap()): JSONObject =
        call("DELETE", path, query, null)

    /** Ping a bridge that is not necessarily the saved pairing yet. */
    suspend fun health(origin: String, token: String): JSONObject = withContext(Dispatchers.IO) {
        val request = Request.Builder()
            .url(origin.trimEnd('/') + "/api/health")
            .header("Authorization", "Bearer $token")
            .get()
            .build()
        apiClient.newCall(request).execute().use { response ->
            val text = response.body?.string().orEmpty()
            if (!response.isSuccessful) throw IllegalStateException(httpError(response.code, text))
            if (text.isBlank()) JSONObject() else JSONObject(text)
        }
    }

    /**
     * Open the bridge's terminal PTY over WebSocket. The bridge authorises the
     * upgrade itself, so the bearer token travels in the header like every other
     * call. Output arrives as text frames; input is sent back as JSON frames.
     */
    fun terminalSocket(
        id: String,
        onText: (String) -> Unit,
        onOpen: () -> Unit,
        onClosed: () -> Unit,
    ): okhttp3.WebSocket? {
        val current = pairing ?: return null
        val base = current.origin.trimEnd('/')
            .replaceFirst("http://", "ws://")
            .replaceFirst("https://", "wss://")
        val url = base + "/ws/terminal?id=" + enc(id)
        val request = Request.Builder()
            .url(url)
            .header("Authorization", "Bearer " + current.token)
            .build()
        return sseClient.newWebSocket(request, object : okhttp3.WebSocketListener() {
            override fun onOpen(webSocket: okhttp3.WebSocket, response: okhttp3.Response) = onOpen()

            override fun onMessage(webSocket: okhttp3.WebSocket, text: String) = onText(text)

            override fun onClosed(webSocket: okhttp3.WebSocket, code: Int, reason: String) = onClosed()

            override fun onFailure(webSocket: okhttp3.WebSocket, t: Throwable, response: okhttp3.Response?) = onClosed()
        })
    }

    /**
     * Subscribe to /api/events for one conversation. Frames arrive on an OkHttp
     * thread; the caller is responsible for hopping to the UI dispatcher.
     */
    fun openEvents(
        cwd: String,
        file: String,
        onFrame: (JSONObject) -> Unit,
        onClosed: () -> Unit,
    ): EventSource? {
        val current = pairing ?: return null
        val url = current.origin.trimEnd('/') + "/api/events?cwd=" + enc(cwd) + "&file=" + enc(file)
        val request = Request.Builder()
            .url(url)
            .header("Authorization", "Bearer " + current.token)
            .header("Accept", "text/event-stream")
            .build()
        return EventSources.createFactory(sseClient).newEventSource(request, object : EventSourceListener() {
            override fun onEvent(eventSource: EventSource, id: String?, type: String?, data: String) {
                runCatching { JSONObject(data) }.getOrNull()?.let(onFrame)
            }

            override fun onClosed(eventSource: EventSource) = onClosed()

            override fun onFailure(eventSource: EventSource, t: Throwable?, response: okhttp3.Response?) = onClosed()
        })
    }

    private suspend fun call(
        method: String,
        path: String,
        query: Map<String, String>,
        body: JSONObject?,
    ): JSONObject = withContext(Dispatchers.IO) {        val current = pairing ?: throw IllegalStateException("Ikke koblet til en PC.")
        val request = Request.Builder()
            .url(buildUrl(current.origin, path, query))
            .header("Authorization", "Bearer " + current.token)
            .method(method, body?.toString()?.toRequestBody(JSON))
            .build()
        apiClient.newCall(request).execute().use { response ->
            val text = response.body?.string().orEmpty()
            if (!response.isSuccessful) throw IllegalStateException(httpError(response.code, text))
            if (text.isBlank()) JSONObject() else JSONObject(text)
        }
    }

    private fun httpError(code: Int, body: String): String {
        val message = runCatching { JSONObject(body).optString("error") }.getOrNull()
        return message?.takeIf { it.isNotBlank() } ?: "HTTP $code"
    }

    private fun buildUrl(origin: String, path: String, query: Map<String, String>): String {
        val base = origin.trimEnd('/') + path
        if (query.isEmpty()) return base
        val params = query.entries.joinToString("&") { (key, value) -> "${enc(key)}=${enc(value)}" }
        return "$base?$params"
    }

    private fun enc(value: String): String = java.net.URLEncoder.encode(value, "UTF-8")

    companion object {
        private val JSON = "application/json".toMediaType()
    }
}
