package com.omp.chat.data

import com.google.gson.JsonObject

/**
 * En API-leverandør (API-nøkkel-basert) eller den eksisterende bridge/OMP.
 *
 * Nøkkelen lagres aldri her – kun i [SecureStore] under [keySuffix]. Resten er
 * trygt å lagre i klartekst (SharedPreferences/JSON), slik at eksport og synk
 * kan gjøres uten å spre hemmeligheter.
 *
 * `models` er modell-ID-er (rå ID fra leverandøren). UI-et kan skjule enkelte
 * ID-er med [hiddenModelIds] uten å slette dem.
 */
data class ApiProvider(
    val id: String,
    val name: String,
    val kind: String = "openai",          // "openai" | "bridge"
    val baseUrl: String = "",
    val authType: String = "bearer",       // "bearer" | "header" | "none"
    val headerName: String = "",
    val models: List<String> = emptyList(),
    val hiddenModelIds: List<String> = emptyList(),
    val favoriteModelIds: List<String> = emptyList(),
    val enabled: Boolean = true,
    val builtIn: Boolean = false,          // preset levert med appen
    val lastTestOk: Boolean? = null,       // null = ikke testet
    val lastTestMessage: String = "",
    val lastTestAt: Long = 0L,
    val modelsFetched: Boolean = false,
    /** Lokal eller synkronisert fra OMP på PC-en. */
    val source: String = "local"            // "local" | "omp"
) {
    val modelKeyPrefix: String get() = "api:${id.trim()}"
    fun modelKey(modelId: String): String = "$modelKeyPrefix/$modelId"
    fun modelProvider(modelId: String): String = modelKeyPrefix
    fun baseUrlNormalized(): String = normalizeApiBaseUrl(baseUrl)
    fun isBridge(): Boolean = kind == "bridge"
}

/** Status for siste tilkoblingstest, brukt til sortering i UI. */
enum class ProviderHealth { OK, UNKNOWN, ERROR }

/** Provider mottatt fra PC-en. Nøkkelen brukes kun til Keystore, aldri persistert i listen. */
data class OmpProvider(
    val provider: ApiProvider,
    val apiKey: String = ""
)

fun ApiProvider.health(): ProviderHealth = when {
    lastTestOk == true -> ProviderHealth.OK
    lastTestOk == false -> ProviderHealth.ERROR
    else -> ProviderHealth.UNKNOWN
}

/** Fasit for appens forhåndsdefinerte leverandører (nøkkel-only der mulig). */
data class ProviderPreset(
    val id: String,
    val name: String,
    val baseUrl: String,
    val authType: String = "bearer",
    val needsKey: Boolean = true,
    val note: String = "",
    val custom: Boolean = false
)

object ProviderPresets {

    val list: List<ProviderPreset> = listOf(
        ProviderPreset("openai", "OpenAI", "https://api.openai.com/v1"),
        ProviderPreset("anthropic", "Anthropic", "https://api.anthropic.com/v1", authType = "header"),
        ProviderPreset("google", "Google Gemini", "https://generativelanguage.googleapis.com/v1beta"),
        ProviderPreset("openrouter", "OpenRouter", "https://openrouter.ai/api/v1"),
        ProviderPreset("mistral", "Mistral", "https://api.mistral.ai/v1"),
        ProviderPreset("groq", "Groq", "https://api.groq.com/openai/v1"),
        ProviderPreset("deepseek", "DeepSeek", "https://api.deepseek.com/v1"),
        ProviderPreset("together", "Together AI", "https://api.together.xyz/v1"),
        ProviderPreset("fireworks", "Fireworks AI", "https://api.fireworks.ai/inference/v1"),
        ProviderPreset("perplexity", "Perplexity", "https://api.perplexity.ai"),
        ProviderPreset("cohere", "Cohere", "https://api.cohere.ai/compatibility/v1"),
        ProviderPreset("xai", "xAI (Grok)", "https://api.x.ai/v1"),
        ProviderPreset("nvidia", "NVIDIA", "https://integrate.api.nvidia.com/v1"),
        ProviderPreset("azure", "Azure OpenAI", "", needsKey = true, note = "Endpoint: https://<resource>.openai.azure.com/openai/v1"),
        ProviderPreset("coarena", "Coarena", "", needsKey = false),
        ProviderPreset("custom", "Annen / Egendefinert", "", needsKey = false, custom = true)
    )

    fun byId(id: String): ProviderPreset? = list.firstOrNull { it.id == id }
    fun nameOf(id: String): String = byId(id)?.name ?: id
}