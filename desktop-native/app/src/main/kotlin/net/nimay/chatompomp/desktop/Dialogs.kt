package net.nimay.chatompomp.desktop

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Check
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateMapOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.window.Dialog
import org.json.JSONObject

/** A pill-shaped choice, exactly like the one in android-native. */
@Composable
fun ChoiceChip(label: String, selected: Boolean, onClick: () -> Unit) {
    Surface(
        shape = RoundedCornerShape(999.dp),
        color = if (selected) MaterialTheme.colorScheme.primary else MaterialTheme.colorScheme.surfaceVariant,
        modifier = Modifier.clickable(onClick = onClick),
    ) {
        Text(
            label,
            color = if (selected) MaterialTheme.colorScheme.onPrimary else MaterialTheme.colorScheme.onSurface,
            style = MaterialTheme.typography.labelMedium,
            maxLines = 1,
            modifier = Modifier.padding(horizontal = 12.dp, vertical = 6.dp),
        )
    }
}

/**
 * OMP asks for permission through the bridge (confirm / select / input /
 * questions). Same four shapes the Android app handles.
 */
@Composable
fun ApprovalDialog(vm: ChatViewModel, request: JSONObject) {
    val method = request.optString("method")
    val title = request.optString("title").ifBlank { t("OMP trenger godkjenning", "OMP needs approval") }
    val message = request.optString("message")
    val allowAlways = request.optBoolean("allowAlways")
    val options = request.optJSONArray("options")
    val questions = request.optJSONArray("questions")
    var input by remember(request) { mutableStateOf(request.optString("prefill")) }
    val answers = remember(request) { mutableStateMapOf<Int, String>() }

    AlertDialog(
        onDismissRequest = { vm.respondApproval(cancelled = true) },
        containerColor = MaterialTheme.colorScheme.surface,
        title = { Text(title, fontWeight = FontWeight.SemiBold) },
        text = {
            Column(Modifier.heightIn(max = 420.dp).verticalScroll(rememberScrollState())) {
                if (message.isNotBlank()) Text(message, style = MaterialTheme.typography.bodyMedium)
                if (questions != null) {
                    for (index in 0 until questions.length()) {
                        val question = questions.optJSONObject(index)
                        val label = question?.optString("question").orEmpty()
                            .ifBlank { question?.optString("title").orEmpty() }
                            .ifBlank { questions.optString(index) }
                        Text(label, style = MaterialTheme.typography.bodyMedium, modifier = Modifier.padding(top = 10.dp))
                        OutlinedTextField(
                            value = answers[index].orEmpty(),
                            onValueChange = { answers[index] = it },
                            label = { Text(t("Svar", "Answer")) },
                            singleLine = true,
                            modifier = Modifier.fillMaxWidth(),
                        )
                    }
                } else if (method == "select" && options != null) {
                    for (index in 0 until options.length()) {
                        val option = options.optJSONObject(index)
                        val value = option?.optString("value") ?: options.optString(index)
                        val label = option?.optString("label").orEmpty().ifBlank { value }
                        TextButton(onClick = { vm.respondApproval(value = value) }) { Text(label) }
                    }
                } else if (method == "input") {
                    OutlinedTextField(
                        value = input,
                        onValueChange = { input = it },
                        label = { Text(t("Svar", "Answer")) },
                        singleLine = true,
                        modifier = Modifier.padding(top = 8.dp).fillMaxWidth(),
                    )
                }
            }
        },
        confirmButton = {
            if (questions != null) {
                TextButton(onClick = {
                    val array = org.json.JSONArray()
                    for (index in 0 until questions.length()) {
                        val question = questions.optJSONObject(index)
                        val label = question?.optString("question").orEmpty()
                            .ifBlank { question?.optString("title").orEmpty() }
                            .ifBlank { questions.optString(index) }
                        array.put(JSONObject().apply {
                            put("question", label)
                            put("answer", answers[index].orEmpty())
                        })
                    }
                    vm.respondApproval(answers = array)
                }) { Text(t("Svar", "Answer")) }
            } else if (method != "select") {
                TextButton(onClick = {
                    if (method == "input") vm.respondApproval(value = input) else vm.respondApproval(confirmed = true)
                }) { Text(t("Tillat", "Allow")) }
            }
            if (allowAlways && questions == null) {
                TextButton(onClick = { vm.respondApproval(allowAlways = true) }) { Text(t("Tillat alltid", "Always allow")) }
            }
        },
        dismissButton = { TextButton(onClick = { vm.respondApproval(cancelled = true) }) { Text(t("Avbryt", "Cancel")) } },
    )
}

/** The theme picker: 13 palettes, same swatches and names as on Android. */
@Composable
fun ThemeDialog(vm: ChatViewModel, onClose: () -> Unit) {
    Dialog(onDismissRequest = onClose) {
        Surface(
            shape = RoundedCornerShape(18.dp),
            color = MaterialTheme.colorScheme.surface,
            border = androidx.compose.foundation.BorderStroke(1.dp, MaterialTheme.colorScheme.outline),
            modifier = Modifier.width(620.dp),
        ) {
            Column(Modifier.padding(20.dp)) {
                Text(t("Tema", "Theme"), style = MaterialTheme.typography.titleMedium, fontWeight = FontWeight.Bold)
                Spacer(Modifier.height(4.dp))
                Text(
                    t("Velg et tema for hele appen.", "Pick a theme for the whole app."),
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                    style = MaterialTheme.typography.bodySmall,
                )
                Spacer(Modifier.height(12.dp))
                Column(Modifier.heightIn(max = 420.dp).verticalScroll(rememberScrollState())) {
                    for (row in themes.chunked(3)) {
                        Row(Modifier.fillMaxWidth().padding(vertical = 3.dp), horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                            for (spec in row) {
                                ThemeCard(spec, spec.id == vm.themeId, Modifier.weight(1f)) {
                                    vm.selectTheme(spec.id)
                                    onClose()
                                }
                            }
                            repeat(3 - row.size) { Spacer(Modifier.weight(1f)) }
                        }
                    }
                }
            }
        }
    }
}

@Composable
private fun ThemeCard(spec: ThemeSpec, selected: Boolean, modifier: Modifier = Modifier, onClick: () -> Unit) {
    Column(
        modifier
            .clip(RoundedCornerShape(12.dp))
            .background(spec.background)
            .border(if (selected) 2.dp else 1.dp, if (selected) spec.brand else spec.border, RoundedCornerShape(12.dp))
            .clickable(onClick = onClick)
            .padding(10.dp),
    ) {
        Row(horizontalArrangement = Arrangement.spacedBy(4.dp)) {
            Box(Modifier.size(14.dp).clip(RoundedCornerShape(4.dp)).background(spec.brand))
            Box(Modifier.size(14.dp).clip(RoundedCornerShape(4.dp)).background(spec.raised))
            Box(Modifier.size(14.dp).clip(RoundedCornerShape(4.dp)).background(spec.surface))
        }
        Spacer(Modifier.height(6.dp))
        Text(spec.name, color = spec.ink, style = MaterialTheme.typography.labelSmall, maxLines = 1)
    }
}

/** Model picker plus the reasoning levels that model supports. */
@Composable
fun ModelDialog(vm: ChatViewModel, onClose: () -> Unit) {
    Dialog(onDismissRequest = onClose) {
        Surface(
            shape = RoundedCornerShape(18.dp),
            color = MaterialTheme.colorScheme.surface,
            border = androidx.compose.foundation.BorderStroke(1.dp, MaterialTheme.colorScheme.outline),
            modifier = Modifier.width(520.dp),
        ) {
            Column(Modifier.padding(20.dp)) {
                Text(t("Velg modell", "Choose model"), style = MaterialTheme.typography.titleMedium, fontWeight = FontWeight.Bold)
                Spacer(Modifier.height(8.dp))
                if (vm.models.isEmpty()) {
                    Text(
                        t("Henter modeller …", "Loading models …"),
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                        style = MaterialTheme.typography.bodySmall,
                    )
                }
                Column(Modifier.heightIn(max = 320.dp).verticalScroll(rememberScrollState())) {
                    for (model in vm.models) {
                        val current = model.name == vm.activeModelName
                        Row(
                            Modifier.fillMaxWidth()
                                .clip(RoundedCornerShape(10.dp))
                                .clickable { vm.chooseModel(model); onClose() }
                                .padding(vertical = 10.dp, horizontal = 6.dp),
                            verticalAlignment = Alignment.CenterVertically,
                        ) {
                            Column(Modifier.weight(1f)) {
                                Text(model.name, style = MaterialTheme.typography.bodyMedium)
                                Text(
                                    "${model.provider}/${model.id}",
                                    style = MaterialTheme.typography.labelSmall,
                                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                                )
                            }
                            Box(Modifier.height(20.dp).width(22.dp), contentAlignment = Alignment.Center) {
                                if (current) {
                                    Icon(
                                        Icons.Filled.Check,
                                        contentDescription = null,
                                        tint = MaterialTheme.colorScheme.primary,
                                        modifier = Modifier.size(18.dp),
                                    )
                                }
                            }
                        }
                    }
                }
                if (vm.thinkingLevels.isNotEmpty()) {
                    HorizontalDivider(Modifier.padding(vertical = 8.dp))
                    Text(
                        "RESONNERING",
                        style = MaterialTheme.typography.labelSmall,
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                    )
                    Row(
                        Modifier.fillMaxWidth().padding(top = 6.dp),
                        horizontalArrangement = Arrangement.spacedBy(6.dp),
                    ) {
                        for (level in vm.thinkingLevels) {
                            ChoiceChip(vm.thinkingLabel(level), vm.thinkingLevel == level) {
                                vm.selectThinkingLevel(level)
                            }
                        }
                    }
                } else if (vm.models.isNotEmpty()) {
                    Text(
                        t("Denne modellen har ikke resonneringsnivå.", "This model has no reasoning levels."),
                        style = MaterialTheme.typography.labelSmall,
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                        modifier = Modifier.padding(top = 10.dp),
                    )
                }
            }
        }
    }
}

/** New chat: pick one of the bridge's project folders, or type a path. */
@Composable
fun NewChatDialog(vm: ChatViewModel, onClose: () -> Unit) {
    var manual by remember { mutableStateOf("") }
    Dialog(onDismissRequest = onClose) {
        Surface(
            shape = RoundedCornerShape(18.dp),
            color = MaterialTheme.colorScheme.surface,
            border = androidx.compose.foundation.BorderStroke(1.dp, MaterialTheme.colorScheme.outline),
            modifier = Modifier.width(560.dp),
        ) {
            Column(Modifier.padding(20.dp)) {
                Text(t("Ny samtale", "New chat"), style = MaterialTheme.typography.titleMedium, fontWeight = FontWeight.Bold)
                Spacer(Modifier.height(4.dp))
                Text(
                    t("Velg prosjektmappen samtalen skal ligge i.", "Pick the project folder for the chat."),
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                    style = MaterialTheme.typography.bodySmall,
                )
                Spacer(Modifier.height(10.dp))
                Column(Modifier.heightIn(max = 320.dp).verticalScroll(rememberScrollState())) {
                    if (vm.projects.isEmpty()) {
                        Text(
                            t("Fant ingen prosjekter i bridgen.", "The bridge listed no projects."),
                            color = MaterialTheme.colorScheme.onSurfaceVariant,
                            style = MaterialTheme.typography.bodySmall,
                        )
                    }
                    for (project in vm.projects) {
                        Row(
                            Modifier.fillMaxWidth()
                                .clip(RoundedCornerShape(10.dp))
                                .clickable { vm.newSession(project.path); onClose() }
                                .padding(vertical = 10.dp, horizontal = 6.dp),
                            verticalAlignment = Alignment.CenterVertically,
                        ) {
                            Column(Modifier.weight(1f)) {
                                Text(project.name, style = MaterialTheme.typography.bodyMedium)
                                Text(
                                    project.path,
                                    style = MaterialTheme.typography.labelSmall,
                                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                                    maxLines = 1,
                                )
                            }
                            Text(
                                "${project.sessionCount}",
                                style = MaterialTheme.typography.labelSmall,
                                color = MaterialTheme.colorScheme.onSurfaceVariant,
                            )
                        }
                    }
                }
                HorizontalDivider(Modifier.padding(vertical = 10.dp))
                OutlinedTextField(
                    value = manual,
                    onValueChange = { manual = it },
                    label = { Text(t("Mappe-sti", "Folder path")) },
                    placeholder = { Text("C:\\Prosjekter\\…") },
                    singleLine = true,
                    modifier = Modifier.fillMaxWidth(),
                )
                Row(Modifier.fillMaxWidth().padding(top = 10.dp), horizontalArrangement = Arrangement.End) {
                    TextButton(onClick = onClose) { Text(t("Avbryt", "Cancel")) }
                    TextButton(
                        onClick = { vm.newSession(manual.trim()); onClose() },
                        enabled = manual.isNotBlank(),
                    ) { Text(t("Opprett", "Create")) }
                }
            }
        }
    }
}

/** Chat settings: language, theme, model and the bridge we are connected to. */
@Composable
fun SettingsDialog(vm: ChatViewModel, onClose: () -> Unit, onOpenTheme: () -> Unit) {
    Dialog(onDismissRequest = onClose) {
        Surface(
            shape = RoundedCornerShape(18.dp),
            color = MaterialTheme.colorScheme.surface,
            border = androidx.compose.foundation.BorderStroke(1.dp, MaterialTheme.colorScheme.outline),
            modifier = Modifier.width(460.dp),
        ) {
            Column(Modifier.padding(20.dp)) {
                Text(t("Samtaleinnstillinger", "Chat settings"), style = MaterialTheme.typography.titleMedium, fontWeight = FontWeight.Bold)
                Spacer(Modifier.height(14.dp))
                Text(
                    "SPRÅK / LANGUAGE",
                    style = MaterialTheme.typography.labelSmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                )
                Row(Modifier.fillMaxWidth().padding(vertical = 6.dp), horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                    ChoiceChip("Norsk", vm.lang == AppLang.NB) { vm.selectLang(AppLang.NB) }
                    ChoiceChip("English", vm.lang == AppLang.EN) { vm.selectLang(AppLang.EN) }
                }
                HorizontalDivider(Modifier.padding(vertical = 8.dp))
                Row(
                    Modifier.fillMaxWidth()
                        .clip(RoundedCornerShape(12.dp))
                        .clickable { onOpenTheme() }
                        .padding(vertical = 10.dp),
                    verticalAlignment = Alignment.CenterVertically,
                ) {
                    Text(t("Tema", "Theme"), modifier = Modifier.weight(1f))
                    Box(Modifier.size(14.dp).clip(RoundedCornerShape(4.dp)).background(vm.theme.brand))
                    Spacer(Modifier.width(6.dp))
                    Text(
                        vm.theme.name,
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                        style = MaterialTheme.typography.bodySmall,
                    )
                }
                Row(
                    Modifier.fillMaxWidth()
                        .clip(RoundedCornerShape(12.dp))
                        .clickable { vm.loadModels() }
                        .padding(vertical = 10.dp),
                    verticalAlignment = Alignment.CenterVertically,
                ) {
                    Text(t("Modell", "Model"), modifier = Modifier.weight(1f))
                    Text(
                        vm.activeModelName.ifBlank { t("Ikke valgt", "Not set") },
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                        style = MaterialTheme.typography.bodySmall,
                        maxLines = 1,
                    )
                }
                HorizontalDivider(Modifier.padding(vertical = 8.dp))
                Text(
                    t("BRIDGE", "BRIDGE"),
                    style = MaterialTheme.typography.labelSmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                )
                Spacer(Modifier.height(4.dp))
                Text(
                    vm.pairing?.origin.orEmpty(),
                    style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.onSurface,
                )
                Text(
                    "v${vm.bridgeVersion.ifBlank { "?" }}" + " · " + t("token skjult", "token hidden"),
                    style = MaterialTheme.typography.labelSmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                )
                Spacer(Modifier.height(12.dp))
                Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.End) {
                    TextButton(onClick = { vm.forget(); onClose() }) { Text(t("Koble fra", "Disconnect")) }
                    TextButton(onClick = onClose) { Text(t("Lukk", "Close")) }
                }
            }
        }
    }
}

@Composable
fun RenameDialog(vm: ChatViewModel, session: SessionInfo, onClose: () -> Unit) {
    var name by remember(session.file) { mutableStateOf(session.title) }
    AlertDialog(
        onDismissRequest = onClose,
        containerColor = MaterialTheme.colorScheme.surface,
        title = { Text(t("Endre navn", "Rename")) },
        text = {
            OutlinedTextField(
                value = name,
                onValueChange = { name = it },
                label = { Text(t("Navn", "Name")) },
                singleLine = true,
            )
        },
        confirmButton = {
            TextButton(onClick = { vm.renameSession(session.file, name, session.cwd); onClose() }, enabled = name.isNotBlank()) {
                Text(t("Lagre", "Save"))
            }
        },
        dismissButton = { TextButton(onClick = onClose) { Text(t("Avbryt", "Cancel")) } },
    )
}

@Composable
fun ArchiveDialog(vm: ChatViewModel, session: SessionInfo, onClose: () -> Unit) {
    AlertDialog(
        onDismissRequest = onClose,
        containerColor = MaterialTheme.colorScheme.surface,
        title = { Text(t("Arkivere samtalen?", "Archive this chat?")) },
        text = {
            Text(
                t(
                    "«${session.title}» skjules fra listen, men blir liggende på PC-en.",
                    "\"${session.title}\" is hidden from the list but stays on the PC.",
                ),
            )
        },
        confirmButton = {
            TextButton(onClick = { vm.archiveSession(session.file, true); onClose() }) { Text(t("Arkiver", "Archive")) }
        },
        dismissButton = { TextButton(onClick = onClose) { Text(t("Avbryt", "Cancel")) } },
    )
}
