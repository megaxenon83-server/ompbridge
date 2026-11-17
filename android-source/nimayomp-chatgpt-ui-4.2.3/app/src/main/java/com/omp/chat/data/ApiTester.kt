package com.omp.chat.data

import com.google.gson.JsonObject
import com.google.gson.JsonParser
import okhttp3.MediaType.Companion.toMediaType
import okhttp3.OkHttpClient
import okhttp3.Request
import okhttp3.RequestBody.Companion.toRequestBody
import java.net.URI
import java.util.concurrent.TimeUnit

/** Resultat av en leverandør-/modell-test. */
data class ApiTestResult(
    val ok: Boolean,
    val models: List<String> = emptyList(),
    val message: String = "",
    val version: String = ""
)

/**
 * Lett HTTP-klient for å teste en API-leverandør og hente modelliste.
 *
 * Støtter OpenAI-kompatibel `GET /models` (Bearer eller egen header) samt
 * Anthropic-stil `x-api-key` + `anthropic-version`. Feil mappes til korte,
 * lesbare norsk meldinger. Kalles alltid fra en bakgrunnstråd.
 */
class ApiTester {

    private val jsonType = "application/json; charset=utf-8".toMediaType()
    private val client = OkHttpClient.Builder()
        .connectTimeout(8, TimeUnit.SECONDS)
        .readTimeout(15, TimeUnit.SECONDS)
        .writeTimeout(15, TimeUnit.SECONDS)
        .retryOnConnectionFailure(true)
        .build()

    fun test(provider: ApiProvider, apiKey: String): ApiTestResult {
        val base = provider.baseUrlNormalized()
        if (base.isBlank()) return ApiTestResult(false, emptyList(), "Mangler base-URL")
        if (provider.authType != "none" && apiKey.isBlank()) {
            return ApiTestResult(false, emptyList(), "Mangler API-nøkkel")
        }

        val url = join(base, "/models")
        return try {
            val request = Request.Builder().url(url).get().applyHeaders(provider, apiKey).build()
            client.newCall(request).execute().use { response ->
                val body = response.body?.string().orEmpty()
                if (response.isSuccessful) {
                    val models = parseModelIds(body)
                    val msg = if (models.isNotEmpty()) "${models.size} modeller funnet" else "Tilkobling OK"
                    ApiTestResult(true, models, msg)
                } else {
                    val apiMsg = runCatching { JsonParser.parseString(body).asJsonObject.str("error") }.getOrNull()
                    val msg = when (response.code) {
                        401, 403 -> "Nøkkel avvist (HTTP ${response.code})"
                        404 -> "Fant ikke /models (HTTP 404). Sjekk base-URL."
                        else -> apiMsg?.take(120)?.ifBlank { "HTTP ${response.code}" } ?: "HTTP ${response.code}"
                    }
                    ApiTestResult(false, emptyList(), msg)
                }
            }
        } catch (e: java.net.SocketTimeoutException) {
            ApiTestResult(false, emptyList(), "Tidsavbrudd – svarer ikke")
        } catch (e: java.net.ConnectException) {
            ApiTestResult(false, emptyList(), "Tilkobling nektet – er adressen riktig?")
        } catch (e: java.net.UnknownHostException) {
            ApiTestResult(false, emptyList(), "Ukjent adresse")
        } catch (e: Exception) {
            ApiTestResult(false, emptyList(), e.javaClass.simpleName + ": " + (e.message ?: "ukjent feil"))
        }
    }

    fun fetchModels(provider: ApiProvider, apiKey: String): ApiTestResult = test(provider, apiKey)

    private fun Request.Builder.applyHeaders(provider: ApiProvider, apiKey: String): Request.Builder {
        when (provider.authType) {
            "none" -> {}
            "header" -> {
                val name = provider.headerName.ifBlank { "x-api-key" }
                header(name, apiKey)
                // Anthropic krever versjon; ellers er header alminnelig.
                if (provider.id == "anthropic") header("anthropic-version", "2023-06-01")
            }
            else -> header("Authorization", "Bearer $apiKey")
        }
        return this
    }

    private fun parseModelIds(body: String): List<String> {
        if (body.isBlank()) return emptyList()
        val root = try { JsonParser.parseString(body).asJsonObject } catch (e: Exception) { return emptyList() }
        val data = root.getAsJsonArray("data") ?: return emptyList()
        val ids = mutableListOf<String>()
        for (el in data) {
            val obj = el.asJsonObject
            val id = obj.get("id")?.asString ?: obj.get("name")?.asString ?: continue
            if (id.isNotBlank()) ids += id
        }
        return ids.distinct()
    }

    private fun join(base: String, path: String): String = base.trimEnd('/') + path
}

/** Normaliserer en base-URL for API-leverandører (beholder sti som /v1). */
fun normalizeApiBaseUrl(raw: String): String {
    var value = raw.trim()
    if (value.isEmpty()) return ""
    if (!Regex("^https?://", RegexOption.IGNORE_CASE).containsMatchIn(value)) {
        value = "https://$value"
    }
    value = value.substringBefore("?").substringBefore("#").trimEnd('/')
    return value
}