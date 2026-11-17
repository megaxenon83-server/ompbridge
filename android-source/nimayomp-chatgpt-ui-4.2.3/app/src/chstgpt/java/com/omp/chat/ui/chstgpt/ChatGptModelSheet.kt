package com.omp.chat.ui.chstgpt

import androidx.compose.animation.core.animateFloatAsState
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.navigationBarsPadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.lazy.rememberLazyListState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.BasicTextField
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.CameraAlt
import androidx.compose.material.icons.filled.Folder
import androidx.compose.material.icons.filled.Image
import androidx.compose.material.icons.filled.Mic
import androidx.compose.material.icons.outlined.Check
import androidx.compose.material.icons.outlined.Close
import androidx.compose.material.icons.outlined.KeyboardArrowDown
import androidx.compose.material.icons.outlined.Refresh
import androidx.compose.material.icons.outlined.Search
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.ModalBottomSheet
import androidx.compose.material3.Text
import androidx.compose.material3.rememberModalBottomSheetState
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.draw.rotate
import androidx.compose.ui.graphics.SolidColor
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import com.omp.chat.data.ModelInfo

/**
 * Model picker: auto-categorized by provider, collapsible sections, search,
 * recently used on top. Flat LazyColumn for smooth scrolling.
 */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun ChatGptModelSheet(
    models: List<ModelInfo>,
    current: ModelInfo?,
    usageCounts: Map<String, Int>,
    modelsLoading: Boolean,
    onRefresh: () -> Unit,
    onSelect: (ModelInfo) -> Unit,
    onDismiss: () -> Unit,
    /** Sist kjente helse per API-leverandør-prefiks ("api:<id>"): 0=OK, 1=ukjent, 2=feil. */
    providerHealth: Map<String, Int> = emptyMap()
) {
    val c = LocalChatGptColors.current
    val strings = com.omp.chat.ui.LocalStrings.current
    val english = strings.lang == "en"
    val sheet = rememberModalBottomSheetState(skipPartiallyExpanded = true)
    var query by rememberSaveable { mutableStateOf("") }
    val listState = rememberLazyListState()

    val sections = remember(models, usageCounts, query, providerHealth) {
        buildSections(models, usageCounts, query, providerHealth)
    }

    val defaultExpanded = remember(models, current) {
        val set = mutableSetOf(RECENT_ID)
        sectionsFor(models, emptyMap()).forEach { s -> if (s.isLocal) set += s.id }
        current?.let { cur -> set += categoryOf(cur).id }
        if (set.isEmpty()) set += RECENT_ID
        set.toSet()
    }
    var expanded by rememberSaveable(current?.key) { mutableStateOf(defaultExpanded) }

    LaunchedEffect(query) {
        if (query.isNotBlank()) expanded = sections.map { it.id }.toSet()
    }

    ModalBottomSheet(
        onDismissRequest = onDismiss,
        sheetState = sheet,
        containerColor = c.surfaceElevated,
        contentColor = c.textPrimary,
        dragHandle = {
            Box(
                Modifier
                    .padding(top = 10.dp, bottom = 6.dp)
                    .size(width = 36.dp, height = 4.dp)
                    .clip(CircleShape)
                    .background(c.divider)
            )
        }
    ) {
        Column(Modifier.fillMaxWidth().navigationBarsPadding()) {
            Row(
                Modifier.fillMaxWidth().padding(start = 20.dp, end = 8.dp, bottom = 6.dp),
                verticalAlignment = Alignment.CenterVertically
            ) {
                Column(Modifier.weight(1f)) {
                    Text(strings.models, style = MaterialTheme.typography.titleMedium, color = c.textPrimary)
                    Text(
                        current?.name ?: strings.noModels,
                        style = MaterialTheme.typography.labelSmall,
                        color = c.textSecondary,
                        maxLines = 1,
                        overflow = TextOverflow.Ellipsis
                    )
                }
                GptIconButton(
                    icon = Icons.Outlined.Refresh,
                    contentDescription = if (english) "Refresh" else "Oppdater",
                    onClick = onRefresh,
                    tint = if (modelsLoading) c.textTertiary else c.textSecondary,
                    enabled = !modelsLoading
                )
            }

            Row(
                modifier = Modifier
                    .fillMaxWidth()
                    .padding(horizontal = 16.dp, vertical = 4.dp)
                    .height(44.dp)
                    .clip(RoundedCornerShape(12.dp))
                    .background(c.surface)
                    .padding(horizontal = 12.dp),
                verticalAlignment = Alignment.CenterVertically,
                horizontalArrangement = Arrangement.spacedBy(8.dp)
            ) {
                Icon(Icons.Outlined.Search, null, tint = c.textTertiary, modifier = Modifier.size(20.dp))
                BasicTextField(
                    value = query,
                    onValueChange = { query = it },
                    singleLine = true,
                    textStyle = MaterialTheme.typography.bodyMedium.copy(color = c.textPrimary),
                    cursorBrush = SolidColor(c.textPrimary),
                    modifier = Modifier.weight(1f),
                    decorationBox = { inner ->
                        Box(contentAlignment = Alignment.CenterStart) {
                            if (query.isEmpty()) {
                                Text(
                                    if (english) "Search models" else "Søk etter modell",
                                    style = MaterialTheme.typography.bodyMedium,
                                    color = c.textTertiary
                                )
                            }
                            inner()
                        }
                    }
                )
                if (query.isNotEmpty()) {
                    Box(Modifier.size(32.dp).clip(CircleShape).clickable { query = "" }, contentAlignment = Alignment.Center) {
                        Icon(Icons.Outlined.Close, null, tint = c.textTertiary, modifier = Modifier.size(18.dp))
                    }
                }
            }

            if (models.isEmpty()) {
                Text(strings.noModels, style = MaterialTheme.typography.bodyMedium, color = c.textSecondary, modifier = Modifier.padding(horizontal = 20.dp, vertical = 18.dp))
            } else if (sections.isEmpty()) {
                Text(if (english) "No matching models" else "Ingen treff", style = MaterialTheme.typography.bodyMedium, color = c.textSecondary, modifier = Modifier.padding(horizontal = 20.dp, vertical = 18.dp))
            } else {
                LazyColumn(
                    state = listState,
                    modifier = Modifier.heightIn(max = 520.dp),
                    contentPadding = PaddingValues(horizontal = 10.dp, vertical = 6.dp)
                ) {
                    sections.forEach { section ->
                        val isOpen = expanded.contains(section.id)
                        item(key = "h:${section.id}") {
                            SectionHeader(
                                title = section.title(english),
                                count = section.models.size,
                                expanded = isOpen,
                                onToggle = { expanded = if (isOpen) expanded - section.id else expanded + section.id }
                            )
                        }
                        if (isOpen) {
                            items(section.models, key = { "m:${section.id}:${it.key}" }) { model ->
                                GptModelRow(
                                    model = model,
                                    isCurrent = current?.key == model.key,
                                    uses = usageCounts[model.key] ?: 0,
                                    onClick = { onSelect(model) }
                                )
                            }
                        }
                        item(key = "s:${section.id}") { Spacer(Modifier.height(2.dp)) }
                    }
                }
            }
            Spacer(Modifier.height(10.dp))
        }
    }
}

private const val RECENT_ID = "__recent"

private data class ModelSection(
    val id: String,
    val label: String,
    val labelEn: String,
    val models: List<ModelInfo>,
    val isLocal: Boolean = false
) { fun title(english: Boolean): String = if (english) labelEn else label }

private data class Category(val id: String, val label: String, val labelEn: String, val isLocal: Boolean = false, val order: Int = 100, val healthRank: Int = 0)

private fun categoryOf(model: ModelInfo, health: Map<String, Int> = emptyMap()): Category {
    val raw = model.provider.trim()
    val p = raw.lowercase()
    // API-leverandører fra Innstillinger bruker prefikset "api:<leverandør-id>".
    if (p.startsWith("api:")) {
        val pid = raw.substringAfter("api:", "").trim()
        if (pid.isEmpty()) return Category("other", "Annet", "Other", order = 200)
        val label = com.omp.chat.data.ProviderPresets.nameOf(pid)
        return Category(
            id = p,
            label = label,
            labelEn = label,
            order = 60,
            healthRank = health[p] ?: 1
        )
    }
    return when {
        p == "ollama" || p == "local" || p.contains("ollama") || p.contains("llama.cpp") || p.contains("lmstudio") ->
            Category("local", "Lokal", "Local", isLocal = true, order = 10)
        p == "nvidia" -> Category("nvidia", "NVIDIA", "NVIDIA", order = 20)
        p == "openai" -> Category("openai", "OpenAI", "OpenAI", order = 30)
        p == "anthropic" -> Category("anthropic", "Anthropic", "Anthropic", order = 30)
        p == "google" || p == "gemini" -> Category("google", "Google", "Google", order = 30)
        p == "azure" || p.contains("azure") -> Category("azure", "Azure", "Azure", order = 40)
        p == "openrouter" -> Category("openrouter", "OpenRouter", "OpenRouter", order = 40)
        p == "mistral" -> Category("mistral", "Mistral", "Mistral", order = 30)
        p == "deepseek" -> Category("deepseek", "DeepSeek", "DeepSeek", order = 30)
        p == "groq" -> Category("groq", "Groq", "Groq", order = 40)
        p == "xai" || p == "grok" -> Category("xai", "xAI", "xAI", order = 30)
        p == "coarena" -> Category("coarena", "Coarena", "Coarena", order = 40)
        p.isBlank() -> Category("other", "Annet", "Other", order = 200)
        else -> Category(p, providerLabel(p), providerLabel(p), order = 50)
    }
}

private fun providerLabel(raw: String): String {
    val p = raw.trim()
    if (p.isEmpty()) return "Other"
    return p.split('-', '_', ' ', '.').filter { it.isNotBlank() }
        .joinToString(" ") { part -> part.replaceFirstChar { c -> if (c.isLowerCase()) c.titlecase() else c.toString() } }
}

private fun sectionsFor(models: List<ModelInfo>, usageCounts: Map<String, Int>): List<ModelSection> = buildSections(models, usageCounts, "", emptyMap())

private fun buildSections(
    models: List<ModelInfo>,
    usageCounts: Map<String, Int>,
    query: String,
    providerHealth: Map<String, Int> = emptyMap()
): List<ModelSection> {
    val q = query.trim().lowercase()
    val filtered = if (q.isEmpty()) models else models.filter { m ->
        m.name.lowercase().contains(q) || m.id.lowercase().contains(q) ||
            m.provider.lowercase().contains(q) || m.key.lowercase().contains(q)
    }
    if (filtered.isEmpty()) return emptyList()

    fun rank(m: ModelInfo): Int = usageCounts[m.key] ?: 0
    val result = mutableListOf<ModelSection>()

    val recent = filtered.filter { rank(it) > 0 }.sortedByDescending { rank(it) }
    if (recent.isNotEmpty()) {
        result += ModelSection(RECENT_ID, "Nylig brukt", "Recently used", recent, isLocal = false)
    }

    val byCat = linkedMapOf<String, Pair<Category, MutableList<ModelInfo>>>()
    for (m in filtered) {
        val cat = categoryOf(m, providerHealth)
        val entry = byCat.getOrPut(cat.id) { cat to mutableListOf() }
        entry.second += m
    }
    val providerSections = byCat.values
        .sortedWith(
            // Aktive/verifiserte API-leverandører øverst, feilende nederst.
            compareBy<Pair<Category, MutableList<ModelInfo>>> { it.first.healthRank }
                .thenBy { it.first.order }
                .thenBy { it.first.label.lowercase() }
        )
        .map { (cat, list) ->
            val sorted = list.sortedWith(compareByDescending<ModelInfo> { rank(it) }.thenBy { it.name.lowercase().ifBlank { it.id.lowercase() } })
            ModelSection(cat.id, cat.label, cat.labelEn, sorted, cat.isLocal)
        }
    result += providerSections
    return result
}

@Composable
private fun SectionHeader(title: String, count: Int, expanded: Boolean, onToggle: () -> Unit) {
    val c = LocalChatGptColors.current
    val rotation by animateFloatAsState(if (expanded) 0f else -90f, label = "chev")
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .padding(top = 6.dp, bottom = 2.dp)
            .clip(RoundedCornerShape(12.dp))
            .clickable(onClick = onToggle)
            .padding(horizontal = 10.dp, vertical = 12.dp),
        verticalAlignment = Alignment.CenterVertically
    ) {
        Icon(Icons.Outlined.KeyboardArrowDown, contentDescription = null, tint = c.textSecondary, modifier = Modifier.size(22.dp).rotate(rotation))
        Spacer(Modifier.width(6.dp))
        Text(title, style = MaterialTheme.typography.titleSmall, color = c.textPrimary, fontWeight = FontWeight.SemiBold, modifier = Modifier.weight(1f))
        Box(Modifier.clip(RoundedCornerShape(10.dp)).background(c.surface).padding(horizontal = 8.dp, vertical = 3.dp)) {
            Text("$count", style = MaterialTheme.typography.labelSmall, color = c.textSecondary)
        }
    }
}

@Composable
private fun GptModelRow(model: ModelInfo, isCurrent: Boolean, uses: Int, onClick: () -> Unit) {
    val c = LocalChatGptColors.current
    Row(
        Modifier
            .fillMaxWidth()
            .padding(vertical = 1.dp)
            .clip(RoundedCornerShape(12.dp))
            .background(if (isCurrent) c.selected else androidx.compose.ui.graphics.Color.Transparent)
            .clickable(onClick = onClick)
            .padding(horizontal = 12.dp, vertical = 10.dp),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(10.dp)
    ) {
        Box(Modifier.size(32.dp).clip(CircleShape).background(c.surface), contentAlignment = Alignment.Center) {
            Text(providerInitial(model.provider), style = MaterialTheme.typography.labelMedium, color = c.textSecondary, fontWeight = FontWeight.SemiBold)
        }
        Column(Modifier.weight(1f)) {
            Text(model.name.ifBlank { model.id }, style = MaterialTheme.typography.bodyMedium, color = c.textPrimary, maxLines = 1, overflow = TextOverflow.Ellipsis)
            Text(metaLine(model, uses), style = MaterialTheme.typography.labelSmall, color = c.textTertiary, maxLines = 1, overflow = TextOverflow.Ellipsis)
        }
        if (isCurrent) {
            Icon(Icons.Outlined.Check, contentDescription = null, tint = c.textPrimary, modifier = Modifier.size(20.dp))
        }
    }
}

private fun providerInitial(provider: String): String {
    val p = provider.trim()
    if (p.isEmpty()) return "M"
    if (p.startsWith("api:")) {
        val id = p.substringAfter("api:").trim()
        val label = com.omp.chat.data.ProviderPresets.nameOf(id)
        return label.take(1).uppercase()
    }
    return p.take(1).uppercase()
}

private fun displayProvider(provider: String): String {
    val p = provider.trim()
    if (p.startsWith("api:")) return com.omp.chat.data.ProviderPresets.nameOf(p.substringAfter("api:").trim())
    return providerLabel(p)
}

private fun metaLine(model: ModelInfo, uses: Int): String = buildString {
    append(displayProvider(model.provider))
    if (model.reasoning) append(" · reasoning")
    if (model.supportsImages) append(" · bilder")
    model.contextWindow?.let { if (it > 0) append(" · ${formatCtx(it)}") }
    if (uses > 0) append(" · ${uses}×")
}

private fun formatCtx(ctx: Int): String = when {
    ctx >= 1_000_000 -> "${ctx / 1_000_000}M ctx"
    ctx >= 1000 -> "${ctx / 1000}k ctx"
    else -> "$ctx ctx"
}

/** Simple, honest attachment hints: the actions come from the activity. */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun ChatGptAttachSheet(
    onPhoto: () -> Unit,
    onCamera: () -> Unit,
    onFile: () -> Unit,
    onVoice: () -> Unit,
    onDismiss: () -> Unit
) {
    val c = LocalChatGptColors.current
    val strings = com.omp.chat.ui.LocalStrings.current
    ModalBottomSheet(
        onDismissRequest = onDismiss,
        sheetState = rememberModalBottomSheetState(skipPartiallyExpanded = true),
        containerColor = c.surfaceElevated,
        dragHandle = {
            Box(
                Modifier.padding(top = 10.dp, bottom = 8.dp).size(width = 34.dp, height = 4.dp)
                    .clip(CircleShape).background(c.divider)
            )
        }
    ) {
        Column(Modifier.fillMaxWidth().navigationBarsPadding().padding(horizontal = 12.dp, vertical = 4.dp)) {
            GptAttachRow(Icons.Filled.Image, strings.photo, strings.attachFromGallery) { onDismiss(); onPhoto() }
            GptAttachRow(Icons.Filled.CameraAlt, strings.camera, strings.takePhoto) { onDismiss(); onCamera() }
            GptAttachRow(Icons.Filled.Folder, strings.file, strings.pickFile) { onDismiss(); onFile() }
            if (com.omp.chat.data.FeatureFlags.VoiceEnabled) {
                GptAttachRow(Icons.Filled.Mic, strings.voice, strings.recordVoice) { onDismiss(); onVoice() }
            }
            Spacer(Modifier.height(12.dp))
        }
    }
}

@Composable
private fun GptAttachRow(icon: androidx.compose.ui.graphics.vector.ImageVector, title: String, subtitle: String, onClick: () -> Unit) {
    val c = LocalChatGptColors.current
    Row(
        Modifier.fillMaxWidth().clip(RoundedCornerShape(12.dp)).clickable { onClick() }.padding(horizontal = 12.dp, vertical = 13.dp),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(12.dp)
    ) {
        Box(Modifier.size(34.dp).clip(CircleShape).background(c.surface), contentAlignment = Alignment.Center) {
            Icon(icon, contentDescription = null, tint = c.textSecondary, modifier = Modifier.size(18.dp))
        }
        Column(Modifier.weight(1f)) {
            Text(title, style = MaterialTheme.typography.bodyMedium, color = c.textPrimary)
            Text(subtitle, style = MaterialTheme.typography.labelSmall, color = c.textSecondary)
        }
    }
}

@Composable
internal fun GptApprovalRow(
    label: String,
    description: String,
    selected: Boolean,
    destructive: Boolean,
    onClick: () -> Unit
) {
    val c = LocalChatGptColors.current
    val border = when {
        destructive -> c.error.copy(alpha = 0.5f)
        selected -> c.textPrimary
        else -> c.divider
    }
    Row(
        Modifier.fillMaxWidth().clip(RoundedCornerShape(12.dp))
            .background(if (selected) c.selected else c.surface)
            .border(1.dp, border, RoundedCornerShape(12.dp))
            .clickable { onClick() }.padding(horizontal = 13.dp, vertical = 11.dp),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(10.dp)
    ) {
        Column(Modifier.weight(1f)) {
            Text(label, style = MaterialTheme.typography.bodyMedium, color = if (destructive) c.error else c.textPrimary)
            if (description.isNotBlank()) Text(description, style = MaterialTheme.typography.labelSmall, color = c.textSecondary)
        }
        if (selected) Icon(Icons.Outlined.Check, contentDescription = null, tint = c.textPrimary, modifier = Modifier.size(17.dp))
    }
}