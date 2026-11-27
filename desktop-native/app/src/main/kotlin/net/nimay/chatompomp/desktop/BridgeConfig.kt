package net.nimay.chatompomp.desktop

import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import org.json.JSONObject
import java.io.File
import java.net.HttpURLConnection
import java.net.URI
import java.net.URL
import java.util.Base64
import javax.crypto.Cipher
import javax.crypto.spec.GCMParameterSpec
import javax.crypto.spec.SecretKeySpec

/** Where we found (or were handed) a bridge: origin, bearer token, and how we know. */
data class BridgeLocation(val origin: String, val token: String, val source: String) {
    val hostPort: String
        get() = origin.removePrefix("http://").removePrefix("https://").trimEnd('/')
}

/**
 * Talks to the bridge the same way a phone would: either read the token straight
 * from the bridge's own config.json on this PC, or redeem a pairing link.
 */
object BridgeConfig {

    fun candidates(): List<File> {
        val local = System.getenv("LOCALAPPDATA")
        val roaming = System.getenv("APPDATA")
        val programFiles = System.getenv("ProgramFiles")
        val programFilesX86 = System.getenv("ProgramFiles(x86)")
        val list = ArrayList<File>()
        System.getenv("OMP_BRIDGE_CONFIG")?.takeIf { it.isNotBlank() }?.let { list.add(File(it)) }
        local?.let {
            list.add(File(it, "Nimay\\OMPBridge\\bridge\\config.json"))
            list.add(File(it, "Programs\\OMPBridge\\bridge\\config.json"))
            list.add(File(it, "OMPBridge\\bridge\\config.json"))
        }
        roaming?.let { list.add(File(it, "Nimay\\OMPBridge\\bridge\\config.json")) }
        programFiles?.let { list.add(File(it, "Nimay\\OMPBridge\\bridge\\config.json")) }
        programFilesX86?.let { list.add(File(it, "Nimay\\OMPBridge\\bridge\\config.json")) }
        // Running straight out of the repo (developer build).
        File(System.getProperty("user.dir"), "windows\\bridge\\config.json").let { list.add(it) }
        return list.distinct()
    }

    /** Read the first readable config.json that has a usable port and token. */
    fun detect(): BridgeLocation? = candidates().firstNotNullOfOrNull { read(it) }

    fun read(file: File): BridgeLocation? = runCatching {
        if (!file.isFile) return null
        val json = JSONObject(file.readText(Charsets.UTF_8))
        val port = json.optInt("port", 0)
        if (port <= 0) return null
        val token = json.optString("token").trim()
        if (token.isBlank()) return null
        val host = json.optString("host").trim().let { value ->
            when {
                value.isBlank() -> "127.0.0.1"
                value == "0.0.0.0" || value == "::" -> "127.0.0.1"
                else -> value
            }
        }
        BridgeLocation("http://$host:$port", token, file.path)
    }.getOrNull()

    /**
     * Turn whatever the user pasted into a pairing. Accepted forms:
     *  - omp2://HOST:PORT?token=...          (bridge's own pairing payload)
     *  - http(s)://HOST:PORT|token           (manual origin + token)
     *  - chatomp://pair/BASE64TICKET         (phone pairing link, AES-GCM exchange)
     *  - {"origin":"http://...","credential":"..."}
     */
    suspend fun resolveLink(raw: String): Pairing = withContext(Dispatchers.IO) {
        val link = raw.trim()
        require(link.isNotBlank()) { "Lim inn en paringslenke først." }
        when {
            link.startsWith("chatomp://pair/", ignoreCase = true) ->
                exchangeTicket(link.substringAfter("chatomp://pair/").trim())
            link.startsWith("omp2://", ignoreCase = true) -> fromOmp2(link)
            link.startsWith("{") -> fromJson(link)
            link.startsWith("http://", ignoreCase = true) || link.startsWith("https://", ignoreCase = true) ->
                fromHttp(link)
            else -> throw IllegalArgumentException(
                "Ukjent paringslenke. Bruk omp2://…, http://IP:PORT|token eller chatomp://pair/…",
            )
        }
    }

    private fun normalizeOrigin(origin: String): String {
        val trimmed = origin.trim().trimEnd('/')
        return if (trimmed.startsWith("http://") || trimmed.startsWith("https://")) trimmed else "http://$trimmed"
    }

    private fun fromOmp2(link: String): Pairing {
        val uri = URI(link)
        val host = uri.host ?: throw IllegalArgumentException("Paringslenken mangler adresse.")
        val port = if (uri.port > 0) uri.port else 27778
        val query = uri.rawQuery.orEmpty().split('&').associate { part ->
            val key = part.substringBefore('=', "")
            val value = part.substringAfter('=', "")
            key to java.net.URLDecoder.decode(value, "UTF-8")
        }
        val token = query["token"].orEmpty().trim()
        require(token.isNotBlank()) { "Paringslenken mangler token." }
        return Pairing("http://$host:$port", token)
    }

    private fun fromHttp(link: String): Pairing {
        val separator = link.indexOf('|')
        val hasQueryToken = link.contains("token=", ignoreCase = true)
        if (separator < 0 && !hasQueryToken) {
            throw IllegalArgumentException("Skriv adressen som http://IP:PORT|token (lim inn token etter |).")
        }
        if (separator > 0) {
            val origin = normalizeOrigin(link.substring(0, separator))
            val token = link.substring(separator + 1).trim()
            require(token.isNotBlank()) { "Mangler token etter |." }
            return Pairing(origin, token)
        }
        val uri = URI(link)
        val token = uri.rawQuery.orEmpty().split('&')
            .firstOrNull { it.startsWith("token=") }
            ?.substringAfter('=')
            ?.let { java.net.URLDecoder.decode(it, "UTF-8") }
            .orEmpty()
        require(token.isNotBlank()) { "Paringslenken mangler token." }
        val origin = "${uri.scheme}://${uri.host}:${if (uri.port > 0) uri.port else 27778}"
        return Pairing(origin, token)
    }

    private fun fromJson(link: String): Pairing {
        val json = JSONObject(link)
        val origin = normalizeOrigin(json.optString("origin").ifBlank { json.optString("address") })
        val token = json.optString("credential").ifBlank { json.optString("token") }.trim()
        require(origin.isNotBlank() && token.isNotBlank()) { "JSON-en mangler origin/credential." }
        return Pairing(origin, token)
    }

    /**
     * The phone pairing flow: the link carries a ticket with a one-time nonce and
     * an AES-256 key. We fetch the sealed blob from the bridge's pairing server
     * and decrypt it here, so the token never travels in clear text.
     */
    private fun exchangeTicket(ticketText: String): Pairing {
        val decoded = Base64.getUrlDecoder().decode(ticketText.trim())
        val ticket = JSONObject(String(decoded, Charsets.UTF_8))
        val address = ticket.optString("address")
        val port = ticket.optInt("port", 0)
        val nonce = ticket.optString("nonce")
        val key = Base64.getUrlDecoder().decode(ticket.optString("key"))
        require(address.isNotBlank() && port > 0 && nonce.isNotBlank() && key.isNotEmpty()) {
            "Paringsbilletten er ufullstendig."
        }
        val connection = (URL("http://$address:$port/$nonce").openConnection() as HttpURLConnection).apply {
            requestMethod = "GET"
            connectTimeout = 5_000
            readTimeout = 8_000
            setRequestProperty("User-Agent", "omp-desktop")
            setRequestProperty("Accept", "*/*")
        }
        val sealedText = try {
            val code = connection.responseCode
            val body = (if (code in 200..299) connection.inputStream else connection.errorStream)
                ?.use { it.readBytes().toString(Charsets.UTF_8) }
                .orEmpty()
            require(code in 200..299) { "Paringstjeneren svarte $code." }
            body.trim()
        } finally {
            connection.disconnect()
        }
        require(sealedText.length > 28) { "Tomt paringssvar." }
        val sealedBytes = Base64.getUrlDecoder().decode(sealedText)
        require(sealedBytes.size > 28) { "Tomt paringssvar." }
        val iv = sealedBytes.copyOfRange(0, 12)
        val cipher = Cipher.getInstance("AES/GCM/NoPadding")
        cipher.init(Cipher.DECRYPT_MODE, SecretKeySpec(key, "AES"), GCMParameterSpec(128, iv))
        val plain = cipher.doFinal(sealedBytes, 12, sealedBytes.size - 12)
        val payload = JSONObject(String(plain, Charsets.UTF_8))
        val origin = normalizeOrigin(payload.optString("origin"))
        val credential = payload.optString("credential").trim()
        require(origin.isNotBlank() && credential.isNotBlank()) { "Paringen mangler origin/credential." }
        return Pairing(origin, credential)
    }
}
