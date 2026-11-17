package com.omp.chat.data

import android.content.Context
import com.google.gson.Gson
import com.google.gson.JsonObject
import com.google.gson.reflect.TypeToken
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow

/**
 * Holder API-leverandører (nøkkelfritt metadata) i SharedPreferences og
 * API-nøkler i Android Keystore (én SecureStore-entry per leverandør).
 *
 * Eksport av konfigurasjon skjuler nøkler som standard.
 */
class ApiProviderStore(context: Context) {

    private val appContext = context.applicationContext
    private val prefs = appContext.getSharedPreferences(PREFS, Context.MODE_PRIVATE)
    private val gson = Gson()
    private val type = object : TypeToken<List<ApiProvider>>() {}.type

    private val _providers = MutableStateFlow(read())
    val providers: StateFlow<List<ApiProvider>> = _providers.asStateFlow()

    private fun keyStore(p: ApiProvider) = SecureStore(appContext, "api_${p.id}")

    private fun read(): List<ApiProvider> {
        val raw = prefs.getString(KEY_PROVIDERS, null) ?: return emptyList()
        return try {
            gson.fromJson<List<ApiProvider>>(raw, type) ?: emptyList()
        } catch (e: Exception) {
            emptyList()
        }
    }

    private fun persist(list: List<ApiProvider>) {
        prefs.edit().putString(KEY_PROVIDERS, gson.toJson(list)).apply()
        _providers.value = list
    }

    fun get(id: String): ApiProvider? = _providers.value.firstOrNull { it.id == id }

    fun key(id: String): String? = keyStore(ApiProvider(id = id, name = "", baseUrl = "")).get()

    fun hasKey(id: String): Boolean = !key(id).isNullOrBlank()

    fun add(provider: ApiProvider, apiKey: String?) {
        if (provider.id.isBlank()) return
        if (!_providers.value.any { it.id == provider.id }) {
            persist(_providers.value + provider)
        }
        if (!apiKey.isNullOrBlank()) putKey(provider.id, apiKey)
    }

    fun update(provider: ApiProvider, apiKey: String? = null) {
        val list = _providers.value.toMutableList()
        val idx = list.indexOfFirst { it.id == provider.id }
        if (idx >= 0) list[idx] = provider else list.add(provider)
        persist(list)
        if (apiKey != null) {
            if (apiKey.isBlank()) clearKey(provider.id) else putKey(provider.id, apiKey)
        }
    }

    fun remove(id: String) {
        persist(_providers.value.filterNot { it.id == id })
        clearKey(id)
    }

    fun putKey(id: String, key: String) {
        if (key.isBlank()) return
        keyStore(ApiProvider(id = id, name = "", baseUrl = "")).put(key)
    }

    fun clearKey(id: String) {
        keyStore(ApiProvider(id = id, name = "", baseUrl = "")).clear()
    }

    fun setModels(id: String, models: List<String>) {
        val list = _providers.value.toMutableList()
        val idx = list.indexOfFirst { it.id == id }
        if (idx < 0) return
        val current = list[idx]
        val merged = (current.models + models).distinct()
        list[idx] = current.copy(models = merged, modelsFetched = true)
        persist(list)
    }

    /** Legg til én modell-ID manuelt (bevarer eksisterende). */
    fun addModel(id: String, modelId: String) {
        val trimmed = modelId.trim()
        if (trimmed.isEmpty()) return
        val list = _providers.value.toMutableList()
        val idx = list.indexOfFirst { it.id == id }
        if (idx < 0) return
        val current = list[idx]
        val next = (current.models + trimmed).distinct()
        list[idx] = current.copy(models = next, modelsFetched = true)
        persist(list)
    }

    fun setHidden(id: String, modelId: String, hidden: Boolean) {
        val list = _providers.value.toMutableList()
        val idx = list.indexOfFirst { it.id == id }
        if (idx < 0) return
        val p = list[idx]
        val next = if (hidden) (p.hiddenModelIds + modelId).distinct() else p.hiddenModelIds - modelId
        list[idx] = p.copy(hiddenModelIds = next)
        persist(list)
    }

    fun toggleFavorite(id: String, modelId: String) {
        val list = _providers.value.toMutableList()
        val idx = list.indexOfFirst { it.id == id }
        if (idx < 0) return
        val p = list[idx]
        val next = if (p.favoriteModelIds.contains(modelId)) p.favoriteModelIds - modelId else p.favoriteModelIds + modelId
        list[idx] = p.copy(favoriteModelIds = next)
        persist(list)
    }

    fun setTestResult(id: String, ok: Boolean, message: String) {
        val list = _providers.value.toMutableList()
        val idx = list.indexOfFirst { it.id == id }
        if (idx < 0) return
        list[idx] = list[idx].copy(lastTestOk = ok, lastTestMessage = message, lastTestAt = System.currentTimeMillis())
        persist(list)
    }

    fun updateName(id: String, name: String) {
        val list = _providers.value.toMutableList()
        val idx = list.indexOfFirst { it.id == id }
        if (idx < 0) return
        list[idx] = list[idx].copy(name = name)
        persist(list)
    }

    /**
     * PC/OMP er hovedkilde for providerfeltet. Mobil-spesifikke innstillinger
     * (favoritter, skjulte modeller, modelliste og teststatus) beholdes lokalt.
     */
    fun mergeFromOmp(remote: List<OmpProvider>) {
        val local = _providers.value.associateBy { it.id }
        val merged = remote.map { incoming ->
            val provider = incoming.provider
            val previous = local[provider.id]
            if (previous == null) provider.copy(source = "omp") else provider.copy(
                source = "omp",
                models = (previous.models + provider.models).distinct(),
                hiddenModelIds = previous.hiddenModelIds,
                favoriteModelIds = previous.favoriteModelIds,
                enabled = if (previous.source == "omp") previous.enabled else provider.enabled,
                lastTestOk = previous.lastTestOk,
                lastTestMessage = previous.lastTestMessage,
                lastTestAt = previous.lastTestAt,
                modelsFetched = previous.modelsFetched
            )
        } + _providers.value.filter { it.source != "omp" }
        remote.forEach { incoming ->
            clearKey(incoming.provider.id)
            if (incoming.apiKey.isNotBlank()) putKey(incoming.provider.id, incoming.apiKey)
        }
        merged.asSequence().map { it.id }.toSet()
            .let { ids -> _providers.value.filter { it.source == "omp" && it.id !in ids }.forEach { clearKey(it.id) } }
        persist(merged.distinctBy { it.id })
    }

    fun keyForPush(id: String): String = key(id).orEmpty()

    /** Eksporterbar JSON uten nøkler (hemmeligheter holdes utenfor). */
    fun exportJson(includeKeys: Boolean): String {
        val data = _providers.value.map { p ->
            JsonObject().apply {
                addProperty("id", p.id)
                addProperty("name", p.name)
                addProperty("kind", p.kind)
                addProperty("baseUrl", p.baseUrl)
                addProperty("authType", p.authType)
                addProperty("headerName", p.headerName)
                addProperty("enabled", p.enabled)
                add("models", com.google.gson.JsonArray().apply { p.models.forEach { add(it) } })
                add("hiddenModelIds", com.google.gson.JsonArray().apply { p.hiddenModelIds.forEach { add(it) } })
                add("favoriteModelIds", com.google.gson.JsonArray().apply { p.favoriteModelIds.forEach { add(it) } })
                if (includeKeys) addProperty("apiKey", key(p.id).orEmpty())
            }
        }
        return gson.toJson(data)
    }

    companion object {
        private const val PREFS = "omp_api_providers"
        private const val KEY_PROVIDERS = "providers"
    }
}