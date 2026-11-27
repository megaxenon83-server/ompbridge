package net.nimay.chatompomp

import android.content.Context
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import okhttp3.MediaType.Companion.toMediaType
import okhttp3.OkHttpClient
import okhttp3.Request
import okhttp3.RequestBody.Companion.toRequestBody
import org.json.JSONObject
import java.util.concurrent.TimeUnit

/** A pairing: which bridge, and the pairing token. */
data class Pairing(val origin: String, val credential: String)

/**
 * Minimal HTTP + SSE client for OMP Bridge. Ported from the WebView app's
 * BridgeClient.java; JSON in, JSON out, bearer auth.
 */
class BridgeClient(private val context: Context) {

    private val client = OkHttpClient.Builder()
        .connectTimeout(8, TimeUnit.SECONDS)
        .readTimeout(0, TimeUnit.MILLISECONDS) // SSE: keep the stream open
        .writeTimeout(70, TimeUnit.SECONDS)
        .build()

    private val prefs = context.getSharedPreferences("pairing", Context.MODE_PRIVATE)

    var pairing: Pairing? = null
        private set

    init {
        val origin = prefs.getString("origin", null)
        val credential = prefs.getString("credential", null)
        if (!origin.isNullOrBlank() && !credential.isNullOrBlank()) pairing = Pairing(origin, credential)
    }

    fun save(pairing: Pairing) {
        this.pairing = pairing
        prefs.edit().putString("origin", pairing.origin).putString("credential", pairing.credential).apply()
    }

    fun forget() {
        pairing = null
        prefs.edit().clear().apply()
    }

    fun saveDraft(key: String, value: String) {
        prefs.edit().putString("draft:" + key, value).apply()
    }

    fun loadDraft(key: String): String = prefs.getString("draft:" + key, "") ?: ""
    /** Open the bridge's terminal PTY over WebSocket (auth via header). */
    fun terminalWebSocket(id: String, onText: (String) -> Unit, onClosed: () -> Unit): okhttp3.WebSocket? {
        val p = pairing ?: return null
        val base = p.origin.replaceFirst("http://", "ws://").replaceFirst("https://", "wss://")
        val url = base + "/ws/terminal?id=" + java.net.URLEncoder.encode(id, "UTF-8")
        val request = Request.Builder().url(url).header("Authorization", "Bearer " + p.credential).build()
        return client.newWebSocket(request, object : okhttp3.WebSocketListener() {
            override fun onMessage(webSocket: okhttp3.WebSocket, text: String) { onText(text) }
            override fun onClosed(webSocket: okhttp3.WebSocket, code: Int, reason: String) { onClosed() }
            override fun onFailure(webSocket: okhttp3.WebSocket, t: Throwable, response: okhttp3.Response?) { onClosed() }
        })
    }

    private fun originOrThrow(): String = pairing?.origin ?: throw IllegalStateException("Ikke koblet til en PC.")

    private fun tokenOrThrow(): String = pairing?.credential ?: throw IllegalStateException("Mangler paringstoken.")

    suspend fun get(path: String, query: Map<String, String> = emptyMap()): JSONObject =
        call("GET", path, query, null)

    suspend fun post(path: String, body: JSONObject? = null): JSONObject =
        call("POST", path, emptyMap(), body)

    private suspend fun call(method: String, path: String, query: Map<String, String>, body: JSONObject?): JSONObject =
        withContext(Dispatchers.IO) {
            val url = buildUrl(path, query)
            val builder = Request.Builder().url(url).header("Authorization", "Bearer " + tokenOrThrow())
            if (body != null) {
                builder.method(method, body.toString().toRequestBody(JSON))
            } else {
                builder.method(method, null)
            }
            client.newCall(builder.build()).execute().use { response ->
                val text = response.body?.string() ?: ""
                if (!response.isSuccessful) {
                    val message = runCatching { JSONObject(text).optString("error") }.getOrNull()
                    throw IllegalStateException(message?.takeIf { it.isNotBlank() } ?: "HTTP ${response.code}")
                }
                if (text.isBlank()) JSONObject() else JSONObject(text)
            }
        }

    private fun buildUrl(path: String, query: Map<String, String>): String {
        val base = originOrThrow() + path
        if (query.isEmpty()) return base
        val params = query.entries.joinToString("&") { (k, v) -> "${enc(k)}=${enc(v)}" }
        return "$base?$params"
    }

    private fun enc(value: String): String = java.net.URLEncoder.encode(value, "UTF-8")

    companion object {
        val JSON = "application/json".toMediaType()
    }
}
