package com.omp.chat.ui.chstgpt

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.navigationBarsPadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.statusBarsPadding
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.BasicTextField
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.ArrowBack
import androidx.compose.material.icons.outlined.Cloud
import androidx.compose.material.icons.outlined.Computer
import androidx.compose.material.icons.outlined.Delete
import androidx.compose.material.icons.outlined.Edit
import androidx.compose.material.icons.outlined.Refresh
import androidx.compose.material.icons.outlined.Search
import androidx.compose.material.icons.outlined.Visibility
import androidx.compose.material.icons.outlined.VisibilityOff
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.DropdownMenu
import androidx.compose.material3.DropdownMenuItem
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.ModalBottomSheet
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.OutlinedTextFieldDefaults
import androidx.compose.material3.Switch
import androidx.compose.material3.SwitchDefaults
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
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
import androidx.compose.ui.graphics.SolidColor
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.text.input.PasswordVisualTransformation
import androidx.compose.ui.text.input.VisualTransformation
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import com.omp.chat.data.ApiProvider
import com.omp.chat.data.ProviderHealth
import com.omp.chat.data.ProviderPreset
import com.omp.chat.data.ProviderPresets
import com.omp.chat.data.health

/**
 * Innstillinger → Leverandører & API.
 *
 * Liste over API-leverandører (fungerende øverst) + "Legg til leverandør" som
 * starter med en forhåndsdefinert liste. Kjente leverandører er ferdig utfylt
 * og krever kun (navn og) API-nøkkel; "Annen/Egendefinert" lar deg legge til
 * hvilken som helst annen leverandør.
 */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun GptApiProvidersScreen(
    providers: List<ApiProvider>,
    english: Boolean,
    onBack: () -> Unit,
    onAdd: (ApiProvider, String) -> Unit,
    onUpdate: (ApiProvider, String?) -> Unit,
    onRemove: (String) -> Unit,
    onTest: (String) -> Unit,
    onFetchModels: (String) -> Unit,
    onSetHidden: (String, String, Boolean) -> Unit,
    onAddManualModel: (String, String) -> Unit,
    onToggleFavorite: (String, String) -> Unit,
    onExport: () -> String,
    onSync: () -> Unit = {},
    onToast: (String) -> Unit = {}
) {
    val c = LocalChatGptColors.current
    val strings = com.omp.chat.ui.LocalStrings.current
    val context = LocalContext.current

    var showEditor by remember { mutableStateOf(false) }
    var editing by remember { mutableStateOf<ApiProvider?>(null) }
    var detail by remember { mutableStateOf<String?>(null) }
    var confirmDelete by remember { mutableStateOf<ApiProvider?>(null) }

    // Hold detail-panelet oppdatert når listen endrer seg (test/hent).
    val liveDetail = detail?.let { id -> providers.firstOrNull { it.id == id } }
    val sorted = remember(providers) { sortProviders(providers) }

    Column(Modifier.fillMaxSize().background(c.background).statusBarsPadding()) {
        Row(
            Modifier.fillMaxWidth().height(52.dp).padding(start = 4.dp, end = 8.dp),
            verticalAlignment = Alignment.CenterVertically
        ) {
            GptIconButton(icon = Icons.Filled.ArrowBack, contentDescription = strings.chats, onClick = { onBack() }, size = 44, iconSize = 22, tint = c.textPrimary)
            Text(
                if (english) "Providers & API" else "Leverandører & API",
                style = MaterialTheme.typography.titleLarge,
                color = c.textPrimary
            )
        }

        LazyColumn(
            Modifier.fillMaxSize(),
            contentPadding = PaddingValues(start = 14.dp, end = 14.dp, top = 4.dp, bottom = 28.dp),
            verticalArrangement = Arrangement.spacedBy(6.dp)
        ) {
            item {
                Row(
                    Modifier.fillMaxWidth().padding(top = 6.dp),
                    horizontalArrangement = Arrangement.spacedBy(8.dp)
                ) {
                    PrimaryPill(
                        text = if (english) "Add provider" else "Legg til leverandør",
                        modifier = Modifier.weight(1f),
                        onClick = { editing = null; showEditor = true }
                    )
                    IconPill(Icons.Outlined.Refresh, if (english) "Sync" else "Synk", Modifier) {
                        onSync()
                    }
                    IconPill(Icons.Outlined.Cloud, if (english) "Export" else "Eksporter", Modifier) {
                        val json = onExport()
                        context.copyText(json, "OMP providers")
                        onToast(if (english) "Providers exported (no keys)" else "Leverandører eksportert (uten nøkler)")
                    }
                }
            }

            if (sorted.isEmpty()) {
                item { EmptyProvidersCard(english) }
            }

            items(sorted, key = { it.id }) { provider ->
                ProviderRow(
                    provider = provider,
                    english = english,
                    onClick = { detail = provider.id },
                    onToggleEnabled = { onUpdate(provider.copy(enabled = !provider.enabled), null) },
                    onTest = { onTest(provider.id) },
                    onFetch = { onFetchModels(provider.id) }
                )
            }
            item { Spacer(Modifier.height(6.dp)) }
        }
    }

    // Detalj-/modell-panel for én leverandør.
    liveDetail?.let { provider ->
        ProviderDetailSheet(
            provider = provider,
            english = english,
            onDismiss = { detail = null },
            onTest = { onTest(provider.id) },
            onFetch = { onFetchModels(provider.id) },
            onEdit = { editing = provider; showEditor = true },
            onDelete = { confirmDelete = provider },
            onSetHidden = { modelId, hidden -> onSetHidden(provider.id, modelId, hidden) },
            onAddManualModel = { modelId -> onAddManualModel(provider.id, modelId) },
            onToggleFavorite = { modelId -> onToggleFavorite(provider.id, modelId) }
        )
    }

    // Rediger / legg til.
    if (showEditor) {
        ProviderEditorDialog(
            initial = editing,
            presets = ProviderPresets.list,
            english = english,
            existingIds = providers.map { it.id }.toSet(),
            onDismiss = { showEditor = false },
            onSave = { provider, key ->
                if (editing == null) onAdd(provider, key) else onUpdate(provider, key)
                showEditor = false
            }
        )
    }

    confirmDelete?.let { provider ->
        AlertDialog(
            onDismissRequest = { confirmDelete = null },
            containerColor = c.surfaceElevated,
            title = { Text(if (english) "Remove ${provider.name}?" else "Fjerne ${provider.name}?", color = c.textPrimary) },
            text = { Text(if (english) "Models from this provider disappear from the picker. The API key is deleted too." else "Modeller fra denne leverandøren forsvinner fra velgeren. API-nøkkelen slettes også.", color = c.textSecondary) },
            confirmButton = {
                TextButton(onClick = { onRemove(provider.id); confirmDelete = null; detail = null }) {
                    Text(if (english) "Remove" else "Fjern", color = c.error)
                }
            },
            dismissButton = { TextButton(onClick = { confirmDelete = null }) { Text(strings.cancel, color = c.textSecondary) } }
        )
    }
}

// ---------------------------------------------------------------------------
// List
// ---------------------------------------------------------------------------

private fun sortProviders(providers: List<ApiProvider>): List<ApiProvider> =
    providers.sortedWith(
        compareBy<ApiProvider> {
            // OK first, unknown next, errors last; stable within each group.
            when (it.health()) {
                ProviderHealth.OK -> 0
                ProviderHealth.UNKNOWN -> 1
                ProviderHealth.ERROR -> 2
            }
        }.thenBy { it.name.lowercase().ifBlank { it.id.lowercase() } }
    )

@Composable
private fun ProviderRow(
    provider: ApiProvider,
    english: Boolean,
    onClick: () -> Unit,
    onToggleEnabled: () -> Unit,
    onTest: () -> Unit,
    onFetch: () -> Unit
) {
    val c = LocalChatGptColors.current
    var menu by remember { mutableStateOf(false) }
    Row(
        Modifier
            .fillMaxWidth()
            .padding(vertical = 1.dp)
            .clip(RoundedCornerShape(14.dp))
            .background(c.surface)
            .clickable(onClick = onClick)
            .padding(horizontal = 12.dp, vertical = 10.dp),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(12.dp)
    ) {
        Box(Modifier.size(34.dp).clip(CircleShape).background(c.surfaceElevated), contentAlignment = Alignment.Center) {
            Icon(
                if (provider.isBridge() || provider.source == "omp") Icons.Outlined.Computer else Icons.Outlined.Cloud,
                null,
                tint = c.textSecondary,
                modifier = Modifier.size(19.dp)
            )
        }
        Column(Modifier.weight(1f)) {
            Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                Text(
                    provider.name.ifBlank { provider.id },
                    style = MaterialTheme.typography.bodyLarge,
                    color = if (provider.enabled) c.textPrimary else c.textTertiary,
                    maxLines = 1,
                    overflow = TextOverflow.Ellipsis
                )
                if (!provider.enabled) {
                    Text(if (english) "off" else "av", style = MaterialTheme.typography.labelSmall, color = c.textTertiary)
                }
            }
            Text(
                subtitle(provider, english),
                style = MaterialTheme.typography.labelSmall,
                color = c.textTertiary,
                maxLines = 1,
                overflow = TextOverflow.Ellipsis
            )
        }
        HealthBadge(provider)
        Box {
            GptIconButton(icon = Icons.Outlined.Cloud, contentDescription = null, onClick = { menu = true }, size = 36, iconSize = 18, tint = c.textTertiary)
            DropdownMenu(expanded = menu, onDismissRequest = { menu = false }, containerColor = c.surfaceElevated, shape = RoundedCornerShape(16.dp)) {
                DropdownMenuItem(
                    text = { Text(if (english) "Test connection" else "Test tilkobling") },
                    onClick = { menu = false; onTest() }
                )
                DropdownMenuItem(
                    text = { Text(if (english) "Fetch models" else "Hent modeller") },
                    onClick = { menu = false; onFetch() }
                )
                DropdownMenuItem(
                    text = { Text(if (provider.enabled) (if (english) "Disable" else "Deaktiver") else (if (english) "Enable" else "Aktiver")) },
                    onClick = { menu = false; onToggleEnabled() }
                )
            }
        }
    }
}

@Composable
private fun HealthBadge(provider: ApiProvider) {
    val c = LocalChatGptColors.current
    val (color, label) = when (provider.health()) {
        ProviderHealth.OK -> c.online to "OK"
        ProviderHealth.UNKNOWN -> c.textTertiary to (if (com.omp.chat.ui.LocalStrings.current.lang == "en") "Unverified" else "Ikke testet")
        ProviderHealth.ERROR -> c.error to (if (com.omp.chat.ui.LocalStrings.current.lang == "en") "Error" else "Feil")
    }
    Row(
        Modifier
            .clip(RoundedCornerShape(10.dp))
            .background(color.copy(alpha = 0.12f))
            .padding(horizontal = 8.dp, vertical = 3.dp),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(5.dp)
    ) {
        Box(Modifier.size(6.dp).clip(CircleShape).background(color))
        Text(label, style = MaterialTheme.typography.labelSmall, color = color, maxLines = 1)
    }
}

private fun subtitle(provider: ApiProvider, english: Boolean): String {
    val base = provider.baseUrl.ifBlank { if (provider.isBridge()) "OMP Bridge" else "" }
    val count = provider.models.size
    val parts = mutableListOf<String>()
    if (base.isNotBlank()) parts += base.substringAfter("//").substringBefore('/')
    if (count > 0) parts += if (english) "$count models" else "$count modeller"
    if (provider.source == "omp") parts += if (english) "PC / OMP" else "PC / OMP"
    if (provider.lastTestAt > 0) {
        val mins = ((System.currentTimeMillis() - provider.lastTestAt) / 60000L)
        parts += if (mins < 1) (if (english) "tested just now" else "testet nå")
        else if (english) "tested ${mins}m ago" else "testet for ${mins}m siden"
    }
    return parts.joinToString(" · ")
}

@Composable
private fun EmptyProvidersCard(english: Boolean) {
    val c = LocalChatGptColors.current
    Column(
        Modifier
            .fillMaxWidth()
            .clip(RoundedCornerShape(14.dp))
            .background(c.surface)
            .border(1.dp, c.divider, RoundedCornerShape(14.dp))
            .padding(14.dp),
        verticalArrangement = Arrangement.spacedBy(6.dp)
    ) {
        Text(
            if (english) "Bridge (OMP) is used by default." else "Bridge (OMP) brukes som standard.",
            style = MaterialTheme.typography.bodyMedium,
            color = c.textPrimary
        )
        Text(
            if (english) "Add an API provider for cloud models, or a custom one for local/third-party endpoints." else "Legg til en API-leverandør for sky-modeller, eller en egendefinert for lokale/tredjeparts endepunkter.",
            style = MaterialTheme.typography.bodyMedium,
            color = c.textSecondary
        )
    }
}

// ---------------------------------------------------------------------------
// Detail (models per provider)
// ---------------------------------------------------------------------------

@OptIn(ExperimentalMaterial3Api::class)
@Composable
private fun ProviderDetailSheet(
    provider: ApiProvider,
    english: Boolean,
    onDismiss: () -> Unit,
    onTest: () -> Unit,
    onFetch: () -> Unit,
    onEdit: () -> Unit,
    onDelete: () -> Unit,
    onSetHidden: (String, Boolean) -> Unit,
    onAddManualModel: (String) -> Unit,
    onToggleFavorite: (String) -> Unit
) {
    val c = LocalChatGptColors.current
    val strings = com.omp.chat.ui.LocalStrings.current
    val sheet = rememberModalBottomSheetState(skipPartiallyExpanded = true)
    var query by rememberSaveable(provider.id) { mutableStateOf("") }
    var showAdd by remember { mutableStateOf(false) }
    var manualId by remember { mutableStateOf("") }

    ModalBottomSheet(
        onDismissRequest = onDismiss,
        sheetState = sheet,
        containerColor = c.surfaceElevated,
        dragHandle = {
            Box(
                Modifier.padding(top = 10.dp, bottom = 6.dp).size(width = 36.dp, height = 4.dp)
                    .clip(CircleShape).background(c.divider)
            )
        }
    ) {
        Column(Modifier.fillMaxWidth().navigationBarsPadding().padding(horizontal = 16.dp)) {
            Row(verticalAlignment = Alignment.CenterVertically) {
                Column(Modifier.weight(1f)) {
                    Text(provider.name.ifBlank { provider.id }, style = MaterialTheme.typography.titleMedium, color = c.textPrimary)
                    Text(subtitle(provider, english), style = MaterialTheme.typography.labelSmall, color = c.textTertiary, maxLines = 1, overflow = TextOverflow.Ellipsis)
                }
                GptIconButton(icon = Icons.Outlined.Refresh, contentDescription = if (english) "Test" else "Test", onClick = { onTest() }, size = 40, iconSize = 20, tint = c.textSecondary)
                GptIconButton(icon = Icons.Outlined.Cloud, contentDescription = if (english) "Fetch models" else "Hent modeller", onClick = { onFetch() }, size = 40, iconSize = 20, tint = c.textSecondary)
                GptIconButton(icon = Icons.Outlined.Edit, contentDescription = if (english) "Edit" else "Rediger", onClick = { onEdit() }, size = 40, iconSize = 20, tint = c.textSecondary)
                GptIconButton(icon = Icons.Outlined.Delete, contentDescription = if (english) "Remove" else "Fjern", onClick = { onDelete() }, size = 40, iconSize = 20, tint = c.error)
            }
            Spacer(Modifier.height(8.dp))
            Row(
                Modifier.fillMaxWidth().height(44.dp).clip(RoundedCornerShape(12.dp))
                    .background(c.surface).padding(horizontal = 12.dp),
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
                            if (query.isEmpty()) Text(if (english) "Search models" else "Søk etter modell", color = c.textTertiary, style = MaterialTheme.typography.bodyMedium)
                            inner()
                        }
                    }
                )
            }
            Spacer(Modifier.height(6.dp))
            Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                TextButton(onClick = { manualId = ""; showAdd = true }) { Text(if (english) "+ Add model ID" else "+ Legg til modell-ID", color = c.textPrimary) }
                if (provider.modelsFetched) TextButton(onClick = { onFetch() }) { Text(if (english) "Refresh models" else "Oppdater modeller", color = c.textSecondary) }
            }
            if (provider.models.isEmpty()) {
                Text(
                    if (english) "No models yet. Tap + Add model ID, or Fetch models." else "Ingen modeller ennå. Trykk + Legg til modell-ID, eller Hent modeller.",
                    style = MaterialTheme.typography.bodyMedium,
                    color = c.textSecondary,
                    modifier = Modifier.padding(vertical = 18.dp)
                )
            } else {
                LazyColumn(
                    Modifier.heightIn(max = 420.dp),
                    contentPadding = PaddingValues(vertical = 4.dp)
                ) {
                    val q = query.trim().lowercase()
                    val filtered = provider.models.filter {
                        q.isEmpty() || it.lowercase().contains(q)
                    }
                    if (filtered.isEmpty()) {
                        item { Text(if (english) "No matching models" else "Ingen treff", color = c.textSecondary, style = MaterialTheme.typography.bodyMedium, modifier = Modifier.padding(vertical = 16.dp)) }
                    } else {
                        items(filtered, key = { it }) { modelId ->
                            ProviderModelRow(
                                modelId = modelId,
                                hidden = provider.hiddenModelIds.contains(modelId),
                                favorite = provider.favoriteModelIds.contains(modelId),
                                english = english,
                                onToggleHidden = { onSetHidden(modelId, !provider.hiddenModelIds.contains(modelId)) },
                                onToggleFavorite = { onToggleFavorite(modelId) }
                            )
                        }
                    }
                }
            }
            Spacer(Modifier.height(12.dp))
        }
    }

    if (showAdd) {
        AlertDialog(
            onDismissRequest = { showAdd = false },
            containerColor = c.surfaceElevated,
            title = { Text(if (english) "Add model ID" else "Legg til modell-ID", color = c.textPrimary) },
            text = {
                OutlinedTextField(
                    value = manualId,
                    onValueChange = { manualId = it },
                    label = { Text(if (english) "Model ID" else "Modell-ID", color = c.textSecondary) },
                    singleLine = true,
                    colors = OutlinedTextFieldDefaults.colors(
                        focusedTextColor = c.textPrimary,
                        unfocusedTextColor = c.textPrimary,
                        focusedBorderColor = c.accent,
                        unfocusedBorderColor = c.divider
                    )
                )
            },
            confirmButton = {
                TextButton(
                    onClick = {
                        val id = manualId.trim()
                        if (id.isNotEmpty()) onAddManualModel(id)
                        showAdd = false
                    },
                    enabled = manualId.isNotBlank()
                ) { Text(if (english) "Add" else "Legg til", color = c.textPrimary) }
            },
            dismissButton = { TextButton(onClick = { showAdd = false }) { Text(strings.cancel, color = c.textSecondary) } }
        )
    }
}

@Composable
private fun ProviderModelRow(
    modelId: String,
    hidden: Boolean,
    favorite: Boolean,
    english: Boolean,
    onToggleHidden: () -> Unit,
    onToggleFavorite: () -> Unit
) {
    val c = LocalChatGptColors.current
    Row(
        Modifier.fillMaxWidth().clip(RoundedCornerShape(12.dp)).padding(horizontal = 8.dp, vertical = 6.dp),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(10.dp)
    ) {
        Column(Modifier.weight(1f)) {
            Text(
                modelId,
                style = MaterialTheme.typography.bodyMedium,
                color = if (hidden) c.textTertiary else c.textPrimary,
                maxLines = 1,
                overflow = TextOverflow.Ellipsis
            )
            if (favorite) Text(if (english) "Favorite" else "Favoritt", style = MaterialTheme.typography.labelSmall, color = c.textTertiary)
        }
        GptIconButton(
            icon = if (favorite) Icons.Outlined.Visibility else Icons.Outlined.Edit,
            contentDescription = if (favorite) "Unfavorite" else "Favorite",
            onClick = { onToggleFavorite() },
            size = 36,
            iconSize = 18,
            tint = if (favorite) c.textPrimary else c.textTertiary
        )
        GptIconButton(
            icon = if (hidden) Icons.Outlined.VisibilityOff else Icons.Outlined.Visibility,
            contentDescription = if (hidden) (if (english) "Show" else "Vis") else (if (english) "Hide" else "Skjul"),
            onClick = { onToggleHidden() },
            size = 36,
            iconSize = 18,
            tint = c.textTertiary
        )
    }
}

// ---------------------------------------------------------------------------
// Editor (add/edit provider)
// ---------------------------------------------------------------------------

/**
 * Slug used as provider id. The id is shared with PC/OMP, so it must match the
 * format the bridge accepts (lowercase, no spaces).
 */
private fun providerIdFromName(name: String): String =
    name.trim()
        .lowercase()
        .replace(Regex("[^a-z0-9._-]+"), "-")
        .trim('-')
        .take(64)

/** Makes sure a new provider never overwrites an existing one. */
private fun uniqueProviderId(base: String, fallback: String, taken: Set<String>): String {
    val seed = base.ifBlank { fallback }
    if (taken.none { it.equals(seed, ignoreCase = true) }) return seed
    var index = 2
    while (taken.any { it.equals("$seed-$index", ignoreCase = true) }) index++
    return "$seed-$index"
}

@Composable
private fun ProviderEditorDialog(
    initial: ApiProvider?,
    presets: List<ProviderPreset>,
    english: Boolean,
    existingIds: Set<String>,
    onDismiss: () -> Unit,
    onSave: (ApiProvider, String) -> Unit
) {
    val c = LocalChatGptColors.current
    val strings = com.omp.chat.ui.LocalStrings.current

                    var selectedPreset by remember { mutableStateOf(presets.firstOrNull { it.id == initial?.id }?.id ?: presets.first().id) }
    var customId by remember { mutableStateOf("") }
    var name by remember { mutableStateOf(initial?.name.orEmpty()) }
    var baseUrl by remember { mutableStateOf(initial?.baseUrl.orEmpty()) }
    var apiKey by remember { mutableStateOf("") }
    var showKey by remember { mutableStateOf(false) }
    var enabled by remember { mutableStateOf(initial?.enabled ?: true) }

    val preset = presets.firstOrNull { it.id == selectedPreset }
    val isCustom = preset?.custom == true
    val isBridge = preset?.id == "bridge" || initial?.isBridge() == true

    AlertDialog(
        onDismissRequest = onDismiss,
        containerColor = c.surfaceElevated,
        title = {
            Text(
                if (initial == null) (if (english) "Add provider" else "Legg til leverandør")
                else (if (english) "Edit provider" else "Rediger leverandør"),
                color = c.textPrimary
            )
        },
        text = {
            Column(
                Modifier
                    .fillMaxWidth()
                    .heightIn(max = 440.dp)
                    .verticalScroll(rememberScrollState()),
                verticalArrangement = Arrangement.spacedBy(10.dp)
            ) {
                if (initial == null) {
                    Text(if (english) "Provider" else "Leverandør", style = MaterialTheme.typography.labelMedium, color = c.textSecondary)
                    PresetGrid(
                        presets = presets,
                        selected = selectedPreset,
                        english = english,
                        existingIds = existingIds,
                        onSelect = { selectedPreset = it }
                    )
                }

                if (isCustom) {
                    OutlinedTextField(
                        value = customId,
                        onValueChange = { customId = it },
                        label = { Text(if (english) "Provider ID" else "Leverandør-ID", color = c.textSecondary) },
                        placeholder = { Text(if (english) "e.g. my-local" else "f.eks. min-lokal", color = c.textTertiary) },
                        singleLine = true,
                        modifier = Modifier.fillMaxWidth(),
                        colors = fieldColors(c)
                    )
                }

                OutlinedTextField(
                    value = name,
                    onValueChange = { name = it },
                    label = { Text(if (english) "Name" else "Navn", color = c.textSecondary) },
                    placeholder = { Text(preset?.name ?: "", color = c.textTertiary) },
                    singleLine = true,
                    modifier = Modifier.fillMaxWidth(),
                    colors = fieldColors(c)
                )

                if (!isBridge) {
                    OutlinedTextField(
                        value = baseUrl,
                        onValueChange = { baseUrl = it },
                        label = { Text(if (english) "Base URL" else "Base-URL", color = c.textSecondary) },
                        placeholder = { Text(preset?.baseUrl?.ifBlank { "https://…" } ?: "https://…", color = c.textTertiary) },
                        singleLine = true,
                        modifier = Modifier.fillMaxWidth(),
                        colors = fieldColors(c)
                    )
                    preset?.note?.takeIf { it.isNotBlank() }?.let {
                        Text(it, style = MaterialTheme.typography.labelSmall, color = c.textTertiary)
                    }

                    if (preset?.authType != "none") {
                        OutlinedTextField(
                            value = apiKey,
                            onValueChange = { apiKey = it },
                            label = { Text(if (english) "API key" else "API-nøkkel", color = c.textSecondary) },
                            placeholder = { Text("sk-…", color = c.textTertiary) },
                            singleLine = true,
                            visualTransformation = if (showKey) VisualTransformation.None else PasswordVisualTransformation(),
                            keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Password),
                            trailingIcon = {
                                GptIconButton(
                                    icon = if (showKey) Icons.Outlined.VisibilityOff else Icons.Outlined.Visibility,
                                    contentDescription = if (showKey) "Hide" else "Show",
                                    onClick = { showKey = !showKey },
                                    size = 32,
                                    iconSize = 18,
                                    tint = c.textTertiary
                                )
                            },
                            modifier = Modifier.fillMaxWidth(),
                            colors = fieldColors(c)
                        )
                        Text(
                            if (english) "Stored encrypted on this device." else "Lagres kryptert på denne enheten.",
                            style = MaterialTheme.typography.labelSmall,
                            color = c.textTertiary
                        )
                    }
                }

                Row(verticalAlignment = Alignment.CenterVertically) {
                    Text(if (english) "Enabled" else "Aktiv", color = c.textPrimary, style = MaterialTheme.typography.bodyMedium, modifier = Modifier.weight(1f))
                    Switch(
                        checked = enabled,
                        onCheckedChange = { enabled = it },
                        colors = SwitchDefaults.colors(
                            checkedThumbColor = c.onAccent,
                            checkedTrackColor = c.accent,
                            uncheckedThumbColor = c.textSecondary,
                            uncheckedTrackColor = c.surface,
                            uncheckedBorderColor = c.divider
                        )
                    )
                }
            }
        },
        confirmButton = {
            TextButton(
                onClick = {
                    val trimmedName = name.trim()
                    val id = when {
                        initial != null -> initial.id
                        isCustom -> customId.trim()
                        isBridge -> "bridge"
                        // The id is shared with PC/OMP, so derive it from the name the
                        // user typed. That keeps the entry recognisable on the PC and
                        // lets several providers of the same type exist side by side.
                        else -> uniqueProviderId(
                            base = providerIdFromName(trimmedName),
                            fallback = selectedPreset,
                            taken = existingIds
                        )
                    }
                    val effectiveName = trimmedName.ifBlank {
                        when {
                            isBridge -> "Bridge (OMP)"
                            isCustom -> id
                            else -> presets.firstOrNull { it.id == selectedPreset }?.name ?: id
                        }
                    }
                    val provider = (initial ?: ApiProvider(id = id, name = effectiveName)).copy(
                        id = id,
                        name = effectiveName,
                        kind = if (isBridge) "bridge" else "openai",
                        baseUrl = if (isBridge) "" else baseUrl.trim(),
                        authType = if (isBridge) "none" else (preset?.authType ?: "bearer"),
                        headerName = if (!isBridge && preset?.authType == "header") "x-api-key" else "",
                        enabled = enabled
                    )
                    onSave(provider, apiKey.trim())
                },
                enabled = when {
                    initial != null -> true
                    isCustom -> customId.isNotBlank()
                    isBridge -> true
                    else -> true
                }
            ) { Text(if (english) "Save" else "Lagre", color = c.textPrimary) }
        },
        dismissButton = { TextButton(onClick = onDismiss) { Text(strings.cancel, color = c.textSecondary) } }
    )
}

@Composable
private fun PresetGrid(
    presets: List<ProviderPreset>,
    selected: String,
    english: Boolean,
    existingIds: Set<String>,
    onSelect: (String) -> Unit
) {
    val c = LocalChatGptColors.current
    Column(
        Modifier
            .fillMaxWidth()
            .heightIn(max = 220.dp)
            .clip(RoundedCornerShape(12.dp))
            .verticalScroll(rememberScrollState()),
        verticalArrangement = Arrangement.spacedBy(6.dp)
    ) {
        presets.chunked(2).forEach { rowItems ->
            Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                rowItems.forEach { preset ->
                    val active = preset.id == selected
                    val already = existingIds.contains(preset.id)
                    Row(
                        Modifier
                            .weight(1f)
                            .clip(RoundedCornerShape(10.dp))
                            .background(if (active) c.selected else c.surface)
                            .border(1.dp, if (active) c.accent else c.divider, RoundedCornerShape(10.dp))
                            .clickable(enabled = !already) { onSelect(preset.id) }
                            .padding(horizontal = 10.dp, vertical = 10.dp),
                        verticalAlignment = Alignment.CenterVertically
                    ) {
                        Text(
                            preset.name,
                            style = MaterialTheme.typography.labelMedium,
                            color = if (already) c.textTertiary else c.textPrimary,
                            maxLines = 1,
                            overflow = TextOverflow.Ellipsis
                        )
                        if (already) {
                            Spacer(Modifier.width(6.dp))
                            Text("•", color = c.textTertiary, style = MaterialTheme.typography.labelSmall)
                        }
                    }
                }
                if (rowItems.size == 1) Spacer(Modifier.weight(1f))
            }
        }
    }
}

// ---------------------------------------------------------------------------
// Shared bits
// ---------------------------------------------------------------------------

@Composable
private fun PrimaryPill(text: String, modifier: Modifier = Modifier, onClick: () -> Unit) {
    val c = LocalChatGptColors.current
    Box(
        modifier
            .height(44.dp)
            .clip(RoundedCornerShape(12.dp))
            .background(c.textPrimary)
            .clickable(onClick = onClick),
        contentAlignment = Alignment.Center
    ) {
        Text(text, color = c.background, style = MaterialTheme.typography.labelLarge, fontWeight = FontWeight.Medium)
    }
}

@Composable
private fun IconPill(icon: ImageVector, text: String, modifier: Modifier = Modifier, onClick: () -> Unit) {
    val c = LocalChatGptColors.current
    Row(
        modifier
            .height(44.dp)
            .clip(RoundedCornerShape(12.dp))
            .background(c.surface)
            .border(1.dp, c.divider, RoundedCornerShape(12.dp))
            .clickable(onClick = onClick)
            .padding(horizontal = 12.dp),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(6.dp)
    ) {
        Icon(icon, null, tint = c.textSecondary, modifier = Modifier.size(18.dp))
        Text(text, color = c.textPrimary, style = MaterialTheme.typography.labelMedium)
    }
}

@Composable
private fun fieldColors(c: ChatGptColors) = OutlinedTextFieldDefaults.colors(
    focusedTextColor = c.textPrimary,
    unfocusedTextColor = c.textPrimary,
    focusedBorderColor = c.accent,
    unfocusedBorderColor = c.divider
)