package net.nimay.chatompomp

import android.content.Context
import android.graphics.Bitmap
import androidx.compose.foundation.Image
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.aspectRatio
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.lazy.itemsIndexed
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material.icons.filled.Add
import androidx.compose.material.icons.filled.ArrowDownward
import androidx.compose.material.icons.filled.ArrowUpward
import androidx.compose.material.icons.filled.Check
import androidx.compose.material.icons.filled.Delete
import androidx.compose.material.icons.filled.Edit
import androidx.compose.material.icons.filled.MoreVert
import androidx.compose.material.icons.filled.PlayArrow
import androidx.compose.material.icons.filled.PlayCircle
import androidx.compose.material.icons.filled.TouchApp
import androidx.compose.material.icons.filled.Warning
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Button
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.DropdownMenu
import androidx.compose.material3.DropdownMenuItem
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.material3.TopAppBar
import androidx.compose.material3.TopAppBarDefaults
import androidx.compose.runtime.Composable
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.asImageBitmap
import androidx.compose.ui.input.pointer.pointerInput
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.compose.foundation.gestures.detectTapGestures
import androidx.compose.ui.window.Dialog
import androidx.compose.ui.window.DialogProperties
import org.json.JSONArray
import org.json.JSONObject
import java.util.UUID

// ------------------------------------------------------------------ model

/** One step in a routine. Which fields matter depends on [type]. */
data class RoutineStep(
    val type: String,
    val text: String = "",
    val packageName: String = "",
    val url: String = "",
    val key: String = "",
    val ms: Int = 0,
    /** Relative tap point (0–1); negative means "tap by text" instead. */
    val rx: Float = -1f,
    val ry: Float = -1f,
) {
    val usesPoint: Boolean
        get() = type == "tap" && rx >= 0f && ry >= 0f

    fun toJson() = JSONObject().apply {
        put("type", type)
        if (text.isNotBlank()) put("text", text)
        if (packageName.isNotBlank()) put("package", packageName)
        if (url.isNotBlank()) put("url", url)
        if (key.isNotBlank()) put("key", key)
        if (ms > 0) put("ms", ms)
        if (rx >= 0f && ry >= 0f) {
            put("rx", Math.round(rx * 1000) / 1000.0)
            put("ry", Math.round(ry * 1000) / 1000.0)
        }
    }

    companion object {
        fun from(json: JSONObject) = RoutineStep(
            type = json.optString("type").ifBlank { "wait" },
            text = json.optString("text"),
            packageName = json.optString("package"),
            url = json.optString("url"),
            key = json.optString("key"),
            ms = json.optInt("ms"),
            rx = json.optDouble("rx", -1.0).toFloat(),
            ry = json.optDouble("ry", -1.0).toFloat(),
        )
    }
}

/** A named list of steps the app can run against the phone through the bridge. */
data class Routine(
    val id: String,
    val name: String,
    val steps: List<RoutineStep> = emptyList(),
    val createdAt: Long = System.currentTimeMillis(),
    val lastRunAt: Long = 0,
    val lastResult: String = "",
) {
    fun toJson() = JSONObject().apply {
        put("id", id)
        put("name", name)
        put("createdAt", createdAt)
        put("lastRunAt", lastRunAt)
        put("lastResult", lastResult)
        put("steps", JSONArray().apply { steps.forEach { put(it.toJson()) } })
    }

    companion object {
        fun from(json: JSONObject) = Routine(
            id = json.optString("id").ifBlank { UUID.randomUUID().toString() },
            name = json.optString("name").ifBlank { "Uten navn" },
            steps = json.optJSONArray("steps")?.let { array ->
                (0 until array.length()).mapNotNull { array.optJSONObject(it)?.let(RoutineStep::from) }
            } ?: emptyList(),
            createdAt = json.optLong("createdAt"),
            lastRunAt = json.optLong("lastRunAt"),
            lastResult = json.optString("lastResult"),
        )

        fun list(array: JSONArray?): List<Routine> {
            if (array == null) return emptyList()
            return (0 until array.length()).mapNotNull { array.optJSONObject(it)?.let(::from) }
        }
    }
}

/** Progress for the Test overlay: which step runs now, and how it ended. */
data class RoutineRunState(
    val name: String,
    val total: Int,
    val index: Int = 0,
    val label: String = "",
    val running: Boolean = true,
    val error: String = "",
    val done: Boolean = false,
    val stopped: Boolean = false,
)

/** The step types fase 16a supports, in the order the editor shows them. */
val routineStepTypes = listOf(
    "open_app" to ("Åpne app" to "Open app"),
    "open_url" to ("Åpne nettadresse" to "Open URL"),
    "tap" to ("Trykk" to "Tap"),
    "type" to ("Skriv" to "Type"),
    "key" to ("Tast" to "Key"),
    "wait" to ("Vent" to "Wait"),
    "check" to ("Sjekk" to "Check"),
)

val routineKeys = listOf("enter", "back", "home", "tab")

/** Plain language for the list, the detail screen and the run overlay. */
fun stepSummary(step: RoutineStep, nb: Boolean = true): String = when (step.type) {
    "open_app" -> if (nb) "Åpne appen «${shortPackage(step.packageName)}»" else "Open app \"${shortPackage(step.packageName)}\""
    "open_url" -> if (nb) "Åpne ${step.url}" else "Open ${step.url}"
    "tap" -> when {
        step.usesPoint -> if (nb) {
            "Trykk på skjermen (${(step.rx * 100).toInt()} %, ${(step.ry * 100).toInt()} %)"
        } else {
            "Tap the screen (${(step.rx * 100).toInt()}%, ${(step.ry * 100).toInt()}%)"
        }
        step.text.isNotBlank() -> if (nb) "Trykk «${step.text}»" else "Tap \"${step.text}\""
        else -> if (nb) "Trykk (mangler tekst)" else "Tap (missing text)"
    }
    "type" -> if (nb) "Skriv «${step.text}»" else "Type \"${step.text}\""
    "key" -> if (nb) "Trykk tasten ${keyName(step.key)}" else "Press the ${keyName(step.key)} key"
    "wait" -> if (nb) "Vent ${step.ms} ms" else "Wait ${step.ms} ms"
    "check" -> if (nb) "Sjekk at «${step.text}» vises" else "Check that \"${step.text}\" is visible"
    else -> step.type
}

private fun keyName(key: String): String = when (key) {
    "enter" -> "Enter"
    "back" -> "Tilbake"
    "home" -> "Hjem"
    "tab" -> "Tab"
    else -> key
}

fun shortPackage(value: String): String = value.substringAfterLast('.').ifBlank { value }

/** Prefilled example from docs/FASE-16A-RUTINER-MVP.md (no real secrets). */
fun stempleInnTemplate(): Routine = Routine(
    id = UUID.randomUUID().toString(),
    name = "Stemple inn",
    steps = listOf(
        RoutineStep(type = "open_url", url = "https://intern.vy.no"),
        RoutineStep(type = "tap", text = "Logg inn"),
        RoutineStep(type = "type", text = "brukernavn"),
        RoutineStep(type = "tap", text = "Passord"),
        RoutineStep(type = "wait", ms = 800),
        RoutineStep(type = "check", text = "Stemplet inn"),
    ),
)

/** Rutiner lagres lokalt i appen (JSON i SharedPreferences), ingen sync i 16a. */
class RoutineStore(context: Context) {
    private val prefs = context.getSharedPreferences("routines", Context.MODE_PRIVATE)

    fun load(): List<Routine> = runCatching {
        val raw = prefs.getString("items", "[]") ?: "[]"
        Routine.list(JSONArray(raw))
    }.getOrDefault(emptyList())

    fun save(routines: List<Routine>) {
        val array = JSONArray()
        routines.forEach { array.put(it.toJson()) }
        prefs.edit().putString("items", array.toString()).apply()
    }
}

// ------------------------------------------------------------------ screens

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun RoutinesScreen(vm: AppViewModel, onBack: () -> Unit, onOpen: (String) -> Unit) {
    var newRoutine by remember { mutableStateOf(false) }
    var menuFor by remember { mutableStateOf<String?>(null) }
    var renameTarget by remember { mutableStateOf<Routine?>(null) }
    var deleteTarget by remember { mutableStateOf<Routine?>(null) }
    val accessReady by OmpAccessibilityService.isReady.collectAsState()

    Scaffold(
        containerColor = MaterialTheme.colorScheme.background,
        topBar = {
            TopAppBar(
                colors = TopAppBarDefaults.topAppBarColors(containerColor = MaterialTheme.colorScheme.background),
                navigationIcon = {
                    IconButton(onClick = onBack) {
                        Icon(Icons.AutoMirrored.Filled.ArrowBack, contentDescription = t("Tilbake", "Back"))
                    }
                },
                title = { Text(t("Rutiner", "Routines"), fontWeight = FontWeight.SemiBold) },
                actions = {
                    TextButton(onClick = { newRoutine = true }) { Text(t("+ Ny", "+ New")) }
                },
            )
        },
    ) { padding ->
        LazyColumn(
            Modifier.padding(padding).fillMaxSize(),
            contentPadding = PaddingValues(horizontal = 14.dp, vertical = 8.dp),
            verticalArrangement = Arrangement.spacedBy(6.dp),
        ) {
            item { RoutineAccessCard(vm, accessReady) }
            if (vm.recordingNotice.isNotBlank()) {
                item {
                    Surface(
                        shape = RoundedCornerShape(12.dp),
                        color = MaterialTheme.colorScheme.surfaceVariant,
                        modifier = Modifier.fillMaxWidth().padding(bottom = 8.dp),
                    ) {
                        Row(Modifier.padding(12.dp), verticalAlignment = Alignment.CenterVertically) {
                            Text(
                                vm.recordingNotice,
                                style = MaterialTheme.typography.bodySmall,
                                modifier = Modifier.weight(1f),
                            )
                            TextButton(onClick = { vm.clearRecordingNotice() }) { Text(t("Lukk", "Close")) }
                        }
                    }
                }
            }
            if (vm.routines.isEmpty()) {
                item {
                    Surface(
                        shape = RoundedCornerShape(14.dp),
                        color = MaterialTheme.colorScheme.surface,
                        modifier = Modifier.fillMaxWidth().padding(top = 8.dp),
                    ) {
                        Column(Modifier.padding(16.dp)) {
                            Icon(Icons.Filled.PlayCircle, contentDescription = null, tint = MaterialTheme.colorScheme.primary)
                            Spacer(Modifier.height(8.dp))
                            Text(t("Ingen rutiner ennå", "No routines yet"), style = MaterialTheme.typography.titleSmall)
                            Text(
                                t(
                                    "Lag en selv, eller start med malen «Stemple inn» og tilpass stegene.",
                                    "Create one, or start from the Stemple inn template and adjust the steps.",
                                ),
                                style = MaterialTheme.typography.bodySmall,
                                color = MaterialTheme.colorScheme.onSurfaceVariant,
                            )
                        }
                    }
                }
            }
            items(vm.routines, key = { it.id }) { routine ->
                Surface(
                    shape = RoundedCornerShape(14.dp),
                    color = MaterialTheme.colorScheme.surface,
                    modifier = Modifier.fillMaxWidth().clickable { onOpen(routine.id) },
                ) {
                    Row(Modifier.padding(start = 14.dp, top = 12.dp, bottom = 12.dp, end = 4.dp), verticalAlignment = Alignment.CenterVertically) {
                        Icon(
                            Icons.Filled.PlayCircle,
                            contentDescription = null,
                            tint = MaterialTheme.colorScheme.primary,
                            modifier = Modifier.size(22.dp),
                        )
                        Spacer(Modifier.width(12.dp))
                        Column(Modifier.weight(1f)) {
                            Text(routine.name, style = MaterialTheme.typography.bodyLarge, fontWeight = FontWeight.SemiBold)
                            Text(
                                routineSubtitle(routine),
                                style = MaterialTheme.typography.labelSmall,
                                color = MaterialTheme.colorScheme.onSurfaceVariant,
                            )
                        }
                        TextButton(onClick = { vm.startRoutine(routine) }) {
                            Text(t("Test", "Test"))
                        }
                        Box {
                            IconButton(onClick = { menuFor = routine.id }) {
                                Icon(Icons.Filled.MoreVert, contentDescription = t("Mer", "More"), tint = MaterialTheme.colorScheme.onSurfaceVariant)
                            }
                            DropdownMenu(expanded = menuFor == routine.id, onDismissRequest = { menuFor = null }) {
                                DropdownMenuItem(
                                    text = { Text(t("Endre navn", "Rename")) },
                                    onClick = { renameTarget = routine; menuFor = null },
                                )
                                DropdownMenuItem(
                                    text = { Text(t("Slett", "Delete")) },
                                    onClick = { deleteTarget = routine; menuFor = null },
                                )
                            }
                        }
                    }
                }
            }
            item {
                Spacer(Modifier.height(10.dp))
                Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                    OutlinedButton(onClick = { newRoutine = true }) {
                        Icon(Icons.Filled.Add, contentDescription = null, modifier = Modifier.size(16.dp))
                        Spacer(Modifier.width(6.dp))
                        Text(t("Ny rutine", "New routine"))
                    }
                    OutlinedButton(
                        onClick = { vm.addTemplate() },
                        enabled = vm.routines.none { it.name == "Stemple inn" },
                    ) { Text(t("Mal: Stemple inn", "Template: Clock in")) }
                }
            }
        }
    }

    if (newRoutine) {
        var name by remember { mutableStateOf("") }
        AlertDialog(
            onDismissRequest = { newRoutine = false },
            title = { Text(t("Ny rutine", "New routine")) },
            text = {
                OutlinedTextField(
                    value = name,
                    onValueChange = { name = it },
                    label = { Text(t("Navn", "Name")) },
                    singleLine = true,
                )
            },
            confirmButton = {
                TextButton(
                    onClick = {
                        val id = vm.createRoutine(name.trim())
                        newRoutine = false
                        onOpen(id)
                    },
                    enabled = name.isNotBlank(),
                ) { Text(t("Opprett", "Create")) }
            },
            dismissButton = { TextButton(onClick = { newRoutine = false }) { Text(t("Avbryt", "Cancel")) } },
        )
    }

    renameTarget?.let { routine ->
        var name by remember(routine.id) { mutableStateOf(routine.name) }
        AlertDialog(
            onDismissRequest = { renameTarget = null },
            title = { Text(t("Endre navn", "Rename")) },
            text = {
                OutlinedTextField(value = name, onValueChange = { name = it }, label = { Text(t("Navn", "Name")) }, singleLine = true)
            },
            confirmButton = {
                TextButton(onClick = { vm.renameRoutine(routine.id, name.trim()); renameTarget = null }, enabled = name.isNotBlank()) {
                    Text(t("Lagre", "Save"))
                }
            },
            dismissButton = { TextButton(onClick = { renameTarget = null }) { Text(t("Avbryt", "Cancel")) } },
        )
    }

    deleteTarget?.let { routine ->
        AlertDialog(
            onDismissRequest = { deleteTarget = null },
            title = { Text(t("Slette rutinen?", "Delete this routine?")) },
            text = { Text(t("«${routine.name}» fjernes fra telefonen.", "\"${routine.name}\" is removed from the phone.")) },
            confirmButton = {
                TextButton(onClick = { vm.deleteRoutine(routine.id); deleteTarget = null }) {
                    Text(t("Slett", "Delete"), color = MaterialTheme.colorScheme.error)
                }
            },
            dismissButton = { TextButton(onClick = { deleteTarget = null }) { Text(t("Avbryt", "Cancel")) } },
        )
    }
}

@Composable
private fun routineSubtitle(routine: Routine): String {
    val steps = if (routine.steps.size == 1) t("1 steg", "1 step") else t("${routine.steps.size} steg", "${routine.steps.size} steps")
    val last = when {
        routine.lastResult.isBlank() -> ""
        routine.lastRunAt <= 0 -> ""
        else -> " · " + routine.lastResult
    }
    return steps + last
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun RoutineDetailScreen(vm: AppViewModel, onBack: () -> Unit) {
    val routine = vm.activeRoutine
    var editorStep by remember { mutableStateOf<RoutineStep?>(null) }
    var editingIndex by remember { mutableStateOf(-1) }
    var showEditor by remember { mutableStateOf(false) }
    var menuFor by remember { mutableStateOf<Int?>(null) }
    var deleteStepTarget by remember { mutableStateOf(-1) }
    var confirmDelete by remember { mutableStateOf(false) }

    if (routine == null) {
        Box(Modifier.fillMaxSize(), contentAlignment = Alignment.Center) {
            Text(t("Fant ikke rutinen.", "Routine not found."))
        }
        return
    }

    Scaffold(
        containerColor = MaterialTheme.colorScheme.background,
        topBar = {
            TopAppBar(
                colors = TopAppBarDefaults.topAppBarColors(containerColor = MaterialTheme.colorScheme.background),
                navigationIcon = {
                    IconButton(onClick = onBack) {
                        Icon(Icons.AutoMirrored.Filled.ArrowBack, contentDescription = t("Tilbake", "Back"))
                    }
                },
                title = {
                    Column {
                        Text(routine.name, fontWeight = FontWeight.SemiBold, maxLines = 1)
                        Text(
                            routineSubtitle(routine),
                            style = MaterialTheme.typography.labelSmall,
                            color = MaterialTheme.colorScheme.onSurfaceVariant,
                        )
                    }
                },
                actions = {
                    TextButton(onClick = { confirmDelete = true }) {
                        Text(t("Slett", "Delete"), color = MaterialTheme.colorScheme.error)
                    }
                },
            )
        },
    ) { padding ->
        Column(Modifier.padding(padding).fillMaxSize()) {
            Row(
                Modifier.fillMaxWidth().padding(horizontal = 14.dp, vertical = 8.dp),
                horizontalArrangement = Arrangement.spacedBy(10.dp),
            ) {
                Button(onClick = { vm.startRoutine(routine) }, modifier = Modifier.weight(1f)) {
                    Icon(Icons.Filled.PlayArrow, contentDescription = null, modifier = Modifier.size(18.dp))
                    Spacer(Modifier.width(6.dp))
                    Text(t("Kjør nå", "Run now"))
                }
                OutlinedButton(
                    onClick = {
                        editingIndex = -1
                        editorStep = RoutineStep(type = "open_app", packageName = "com.android.settings")
                        showEditor = true
                    },
                ) { Text(t("+ Steg", "+ Step")) }
            }

            LazyColumn(
                Modifier.fillMaxSize(),
                contentPadding = PaddingValues(horizontal = 14.dp, vertical = 4.dp),
                verticalArrangement = Arrangement.spacedBy(6.dp),
            ) {
                if (routine.steps.isEmpty()) {
                    item {
                        Text(
                            t("Ingen steg ennå. Trykk «+ Steg» for å legge til det første.", "No steps yet. Tap \"+ Step\" to add the first one."),
                            style = MaterialTheme.typography.bodySmall,
                            color = MaterialTheme.colorScheme.onSurfaceVariant,
                            modifier = Modifier.padding(vertical = 12.dp),
                        )
                    }
                }
                itemsIndexed(routine.steps) { index, step ->
                    Surface(
                        shape = RoundedCornerShape(12.dp),
                        color = MaterialTheme.colorScheme.surface,
                        modifier = Modifier.fillMaxWidth(),
                    ) {
                        Row(
                            Modifier.padding(start = 12.dp, top = 10.dp, bottom = 10.dp, end = 4.dp),
                            verticalAlignment = Alignment.CenterVertically,
                        ) {
                            Surface(
                                shape = RoundedCornerShape(999.dp),
                                color = MaterialTheme.colorScheme.surfaceVariant,
                                modifier = Modifier.size(26.dp),
                            ) {
                                Box(contentAlignment = Alignment.Center) {
                                    Text(
                                        "${index + 1}",
                                        style = MaterialTheme.typography.labelMedium,
                                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                                    )
                                }
                            }
                            Spacer(Modifier.width(10.dp))
                            Column(Modifier.weight(1f)) {
                                Text(stepSummary(step, vm.lang == AppLang.NB), style = MaterialTheme.typography.bodyMedium)
                                Text(
                                    stepTypeLabel(step.type, vm.lang == AppLang.NB),
                                    style = MaterialTheme.typography.labelSmall,
                                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                                )
                            }
                            Box {
                                IconButton(onClick = { menuFor = index }) {
                                    Icon(Icons.Filled.MoreVert, contentDescription = t("Mer", "More"), tint = MaterialTheme.colorScheme.onSurfaceVariant)
                                }
                                DropdownMenu(expanded = menuFor == index, onDismissRequest = { menuFor = null }) {
                                    DropdownMenuItem(
                                        text = { Text(t("Rediger steg", "Edit step")) },
                                        onClick = {
                                            editingIndex = index
                                            editorStep = step
                                            showEditor = true
                                            menuFor = null
                                        },
                                    )
                                    DropdownMenuItem(
                                        text = { Text(t("Flytt opp", "Move up")) },
                                        onClick = { vm.moveStep(routine.id, index, -1); menuFor = null },
                                        enabled = index > 0,
                                    )
                                    DropdownMenuItem(
                                        text = { Text(t("Flytt ned", "Move down")) },
                                        onClick = { vm.moveStep(routine.id, index, 1); menuFor = null },
                                        enabled = index < routine.steps.size - 1,
                                    )
                                    DropdownMenuItem(
                                        text = { Text(t("Slett steg", "Delete step"), color = MaterialTheme.colorScheme.error) },
                                        onClick = {
                                            deleteStepTarget = index
                                            menuFor = null
                                        },
                                    )
                                }
                            }
                        }
                    }
                }
                item { Spacer(Modifier.height(24.dp)) }
            }
        }
    }

    if (showEditor) {
        StepEditorDialog(
            vm = vm,
            initial = editorStep ?: RoutineStep(type = "open_app"),
            isNew = editingIndex < 0,
            onDismiss = { showEditor = false },
            onSave = { step ->
                if (editingIndex < 0) vm.addStep(routine.id, step) else vm.updateStep(routine.id, editingIndex, step)
                showEditor = false
            },
        )
    }

    if (deleteStepTarget >= 0) {
        AlertDialog(
            onDismissRequest = { deleteStepTarget = -1 },
            title = { Text(t("Slette steget?", "Delete this step?")) },
            text = {
                Text(
                    routine.steps.getOrNull(deleteStepTarget)?.let { stepSummary(it, vm.lang == AppLang.NB) }.orEmpty(),
                )
            },
            confirmButton = {
                TextButton(onClick = {
                    vm.deleteStep(routine.id, deleteStepTarget)
                    deleteStepTarget = -1
                }) { Text(t("Slett", "Delete"), color = MaterialTheme.colorScheme.error) }
            },
            dismissButton = { TextButton(onClick = { deleteStepTarget = -1 }) { Text(t("Avbryt", "Cancel")) } },
        )
    }

    if (confirmDelete) {
        AlertDialog(
            onDismissRequest = { confirmDelete = false },
            title = { Text(t("Slette rutinen?", "Delete this routine?")) },
            text = { Text(t("«${routine.name}» fjernes fra telefonen.", "\"${routine.name}\" is removed from the phone.")) },
            confirmButton = {
                TextButton(onClick = {
                    vm.deleteRoutine(routine.id)
                    confirmDelete = false
                    onBack()
                }) { Text(t("Slett", "Delete"), color = MaterialTheme.colorScheme.error) }
            },
            dismissButton = { TextButton(onClick = { confirmDelete = false }) { Text(t("Avbryt", "Cancel")) } },
        )
    }
}

private fun stepTypeLabel(type: String, nb: Boolean): String {
    val pair = routineStepTypes.firstOrNull { it.first == type }?.second
    return when {
        pair == null -> type
        nb -> pair.first
        else -> pair.second
    }
}

// ------------------------------------------------------------------ step editor

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun StepEditorDialog(
    vm: AppViewModel,
    initial: RoutineStep,
    isNew: Boolean,
    onDismiss: () -> Unit,
    onSave: (RoutineStep) -> Unit,
) {
    var type by remember { mutableStateOf(if (initial.type.isBlank()) "open_app" else initial.type) }
    var text by remember { mutableStateOf(initial.text) }
    var packageName by remember { mutableStateOf(initial.packageName.ifBlank { "com.android.settings" }) }
    var url by remember { mutableStateOf(initial.url) }
    var key by remember { mutableStateOf(initial.key.ifBlank { "enter" }) }
    var ms by remember { mutableStateOf(initial.ms.takeIf { it > 0 }?.toString() ?: "800") }
    var rx by remember { mutableStateOf(initial.rx) }
    var ry by remember { mutableStateOf(initial.ry) }
    var showApps by remember { mutableStateOf(false) }
    var showPicker by remember { mutableStateOf(false) }

    Dialog(onDismissRequest = onDismiss) {
        Surface(
            shape = RoundedCornerShape(18.dp),
            color = MaterialTheme.colorScheme.surface,
            modifier = Modifier.fillMaxWidth(),
        ) {
            Column(Modifier.padding(18.dp).heightIn(max = 620.dp).verticalScroll(rememberScrollState())) {
                Text(
                    if (isNew) t("Nytt steg", "New step") else t("Rediger steg", "Edit step"),
                    style = MaterialTheme.typography.titleMedium,
                    fontWeight = FontWeight.Bold,
                )
                Spacer(Modifier.height(10.dp))
                Text(
                    t("HANDLING", "ACTION"),
                    style = MaterialTheme.typography.labelSmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                )
                Spacer(Modifier.height(6.dp))
                val rows = routineStepTypes.chunked(3)
                for (row in rows) {
                    Row(Modifier.fillMaxWidth().padding(bottom = 6.dp), horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                        for ((id, labels) in row) {
                            Surface(
                                shape = RoundedCornerShape(10.dp),
                                color = if (type == id) MaterialTheme.colorScheme.primary else MaterialTheme.colorScheme.surfaceVariant,
                                modifier = Modifier.weight(1f).clickable {
                                    type = id
                                    if (id == "tap") {
                                        rx = -1f
                                        ry = -1f
                                    }
                                },
                            ) {
                                Text(
                                    if (vm.lang == AppLang.NB) labels.first else labels.second,
                                    style = MaterialTheme.typography.labelSmall,
                                    textAlign = TextAlign.Center,
                                    color = if (type == id) MaterialTheme.colorScheme.onPrimary else MaterialTheme.colorScheme.onSurface,
                                    modifier = Modifier.padding(vertical = 9.dp, horizontal = 4.dp),
                                )
                            }
                        }
                        repeat(3 - row.size) { Spacer(Modifier.weight(1f)) }
                    }
                }
                HorizontalDivider(Modifier.padding(vertical = 8.dp))

                when (type) {
                    "open_app" -> {
                        OutlinedTextField(
                            value = packageName,
                            onValueChange = { packageName = it },
                            label = { Text(t("Package", "Package")) },
                            singleLine = true,
                            modifier = Modifier.fillMaxWidth(),
                        )
                        Row(Modifier.fillMaxWidth().padding(top = 6.dp), horizontalArrangement = Arrangement.End) {
                            TextButton(onClick = {
                                vm.loadDeviceApps()
                                showApps = true
                            }) { Text(t("Velg installert app", "Pick installed app")) }
                        }
                    }
                    "open_url" -> OutlinedTextField(
                        value = url,
                        onValueChange = { url = it },
                        label = { Text(t("Nettadresse", "URL")) },
                        placeholder = { Text("https://…") },
                        singleLine = true,
                        modifier = Modifier.fillMaxWidth(),
                    )
                    "tap" -> {
                        if (rx >= 0f && ry >= 0f) {
                            Text(
                                t(
                                    "Trykk på punkt (${(rx * 100).toInt()} %, ${(ry * 100).toInt()} %)",
                                    "Tap point (${(rx * 100).toInt()}%, ${(ry * 100).toInt()}%)",
                                ),
                                style = MaterialTheme.typography.bodyMedium,
                            )
                            TextButton(onClick = { rx = -1f; ry = -1f }) { Text(t("Bruk tekst i stedet", "Use text instead")) }
                        } else {
                            OutlinedTextField(
                                value = text,
                                onValueChange = { text = it },
                                label = { Text(t("Tekst på skjermen", "Text on screen")) },
                                placeholder = { Text(t("Logg inn", "Sign in")) },
                                singleLine = true,
                                modifier = Modifier.fillMaxWidth(),
                            )
                            Row(Modifier.fillMaxWidth().padding(top = 6.dp), horizontalArrangement = Arrangement.End) {
                                TextButton(onClick = {
                                    vm.loadDeviceScreen()
                                    showPicker = true
                                }) {
                                    Icon(Icons.Filled.TouchApp, contentDescription = null, modifier = Modifier.size(16.dp))
                                    Spacer(Modifier.width(6.dp))
                                    Text(t("Velg punkt på skjermbilde", "Pick a point on a screenshot"))
                                }
                            }
                        }
                    }
                    "type" -> OutlinedTextField(
                        value = text,
                        onValueChange = { text = it },
                        label = { Text(t("Tekst som skrives", "Text to type")) },
                        singleLine = true,
                        modifier = Modifier.fillMaxWidth(),
                    )
                    "key" -> Row(horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                        for (option in routineKeys) {
                            Surface(
                                shape = RoundedCornerShape(999.dp),
                                color = if (key == option) MaterialTheme.colorScheme.primary else MaterialTheme.colorScheme.surfaceVariant,
                                modifier = Modifier.clickable { key = option },
                            ) {
                                Text(
                                    keyName(option),
                                    style = MaterialTheme.typography.labelMedium,
                                    color = if (key == option) MaterialTheme.colorScheme.onPrimary else MaterialTheme.colorScheme.onSurface,
                                    modifier = Modifier.padding(horizontal = 14.dp, vertical = 7.dp),
                                )
                            }
                        }
                    }
                    "wait" -> OutlinedTextField(
                        value = ms,
                        onValueChange = { ms = it.filter { ch -> ch.isDigit() }.take(5) },
                        label = { Text(t("Millisekunder", "Milliseconds")) },
                        singleLine = true,
                        modifier = Modifier.fillMaxWidth(),
                    )
                    "check" -> OutlinedTextField(
                        value = text,
                        onValueChange = { text = it },
                        label = { Text(t("Tekst som må vises", "Text that must be visible")) },
                        singleLine = true,
                        modifier = Modifier.fillMaxWidth(),
                    )
                }

                Spacer(Modifier.height(14.dp))
                Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.End) {
                    TextButton(onClick = onDismiss) { Text(t("Avbryt", "Cancel")) }
                    TextButton(
                        onClick = {
                            onSave(
                                RoutineStep(
                                    type = type,
                                    text = text.trim(),
                                    packageName = packageName.trim(),
                                    url = url.trim(),
                                    key = key,
                                    ms = ms.toIntOrNull() ?: 0,
                                    rx = if (type == "tap") rx else -1f,
                                    ry = if (type == "tap") ry else -1f,
                                ),
                            )
                        },
                        enabled = when (type) {
                            "open_app" -> packageName.isNotBlank()
                            "open_url" -> url.isNotBlank()
                            "tap" -> text.isNotBlank() || (rx >= 0f && ry >= 0f)
                            "type", "check" -> text.isNotBlank()
                            "wait" -> (ms.toIntOrNull() ?: 0) > 0
                            else -> true
                        },
                    ) { Text(t("Lagre", "Save")) }
                }
            }
        }
    }

    if (showApps) {
        val apps = vm.deviceApps
        AlertDialog(
            onDismissRequest = { showApps = false },
            title = { Text(t("Velg app", "Pick app")) },
            text = {
                if (apps.isEmpty()) {
                    Row(verticalAlignment = Alignment.CenterVertically) {
                        CircularProgressIndicator(Modifier.size(16.dp), strokeWidth = 2.dp)
                        Spacer(Modifier.width(10.dp))
                        Text(t("Henter apper fra telefonen …", "Loading apps from the phone …"))
                    }
                } else {
                    LazyColumn(Modifier.heightIn(max = 420.dp)) {
                        items(apps) { id ->
                            Text(
                                id,
                                style = MaterialTheme.typography.bodySmall,
                                fontFamily = FontFamily.Monospace,
                                modifier = Modifier.fillMaxWidth().clickable {
                                    packageName = id
                                    showApps = false
                                }.padding(vertical = 9.dp),
                            )
                        }
                    }
                }
            },
            confirmButton = { TextButton(onClick = { showApps = false }) { Text(t("Lukk", "Close")) } },
        )
    }

    if (showPicker) {
        ScreenPickerDialog(
            vm = vm,
            onDismiss = { showPicker = false },
            onPick = { px, py ->
                rx = px
                ry = py
                text = ""
                showPicker = false
            },
        )
    }
}

/** Shows a live screenshot; the tap point becomes relative coordinates. */
@Composable
private fun ScreenPickerDialog(vm: AppViewModel, onDismiss: () -> Unit, onPick: (Float, Float) -> Unit) {
    LaunchedEffect(Unit) { vm.loadDeviceScreen() }
    val bitmap = vm.routineScreen
    Dialog(onDismissRequest = onDismiss) {
        Surface(shape = RoundedCornerShape(18.dp), color = MaterialTheme.colorScheme.surface) {
            Column(Modifier.padding(14.dp)) {
                Text(t("Trykk der rutinen skal trykke", "Tap where the routine should tap"), fontWeight = FontWeight.SemiBold)
                Text(
                    vm.routineNotice.ifBlank { t("Skjermbildet kommer fra telefonen via ADB.", "The screenshot comes from the phone over ADB.") },
                    style = MaterialTheme.typography.labelSmall,
                    color = if (vm.routineNotice.startsWith("Feil") || vm.routineNotice.contains("Kunne")) {
                        MaterialTheme.colorScheme.error
                    } else {
                        MaterialTheme.colorScheme.onSurfaceVariant
                    },
                )
                Spacer(Modifier.height(10.dp))
                if (bitmap != null) {
                    val image = remember(bitmap) { bitmap.asImageBitmap() }
                    Box(
                        Modifier
                            .fillMaxWidth()
                            .aspectRatio(bitmap.width.toFloat() / bitmap.height.toFloat())
                            .clip(RoundedCornerShape(10.dp))
                            .pointerInput(bitmap) {
                                detectTapGestures { offset ->
                                    val width = size.width.toFloat().coerceAtLeast(1f)
                                    val height = size.height.toFloat().coerceAtLeast(1f)
                                    onPick(
                                        (offset.x / width).coerceIn(0f, 0.999f),
                                        (offset.y / height).coerceIn(0f, 0.999f),
                                    )
                                }
                            },
                    ) {
                        Image(
                            bitmap = image,
                            contentDescription = t("Skjermbilde fra telefonen", "Phone screenshot"),
                            modifier = Modifier.fillMaxSize(),
                            contentScale = ContentScale.FillBounds,
                        )
                    }
                } else {
                    Row(Modifier.fillMaxWidth().padding(vertical = 40.dp), horizontalArrangement = Arrangement.Center) {
                        CircularProgressIndicator(Modifier.size(20.dp), strokeWidth = 2.dp)
                    }
                }
                Row(Modifier.fillMaxWidth().padding(top = 8.dp), horizontalArrangement = Arrangement.End) {
                    TextButton(onClick = onDismiss) { Text(t("Avbryt", "Cancel")) }
                }
            }
        }
    }
}

// ------------------------------------------------------------------ run overlay

/** Full-screen "OMP is driving the phone" panel with a big STOP button. */
@Composable
fun RoutineRunOverlay(vm: AppViewModel, run: RoutineRunState) {
    val error = run.error.isNotBlank()
    // A dialog window, not an in-layout Box: the overlay must sit above the
    // Scaffold and the drawer, otherwise the chat stays on top of it.
    Dialog(
        onDismissRequest = { if (!run.running) vm.dismissRoutineRun() },
        properties = DialogProperties(
            usePlatformDefaultWidth = false,
            dismissOnClickOutside = false,
            dismissOnBackPress = !run.running,
        ),
    ) {
        Box(
            Modifier
                .fillMaxSize()
                .background(Color(0xE6000000))
                .clickable(enabled = false) {},
            contentAlignment = Alignment.Center,
        ) {
        Surface(
            shape = RoundedCornerShape(20.dp),
            color = MaterialTheme.colorScheme.surface,
            modifier = Modifier.fillMaxWidth().padding(24.dp),
        ) {
            Column(Modifier.padding(20.dp), horizontalAlignment = Alignment.CenterHorizontally) {
                Row(verticalAlignment = Alignment.CenterVertically) {
                    Icon(
                        if (error) Icons.Filled.Warning else Icons.Filled.PlayCircle,
                        contentDescription = null,
                        tint = if (error) MaterialTheme.colorScheme.error else MaterialTheme.colorScheme.primary,
                        modifier = Modifier.size(24.dp),
                    )
                    Spacer(Modifier.width(10.dp))
                    Text(
                        when {
                            error || run.stopped -> t("Rutinen stoppet", "The routine stopped")
                            run.done -> t("Rutinen er ferdig", "The routine finished")
                            else -> t("OMP styrer telefonen", "OMP is driving the phone")
                        },
                        style = MaterialTheme.typography.titleMedium,
                        fontWeight = FontWeight.Bold,
                    )
                }
                Spacer(Modifier.height(6.dp))
                Text(
                    run.name,
                    style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                )
                Spacer(Modifier.height(14.dp))

                if (run.running && run.total > 0) {
                    val fraction = (run.index.toFloat() / run.total).coerceIn(0f, 1f)
                    Box(
                        Modifier.fillMaxWidth().height(6.dp).clip(RoundedCornerShape(999.dp))
                            .background(MaterialTheme.colorScheme.surfaceVariant),
                    ) {
                        Box(Modifier.fillMaxWidth(fraction).height(6.dp).background(MaterialTheme.colorScheme.primary))
                    }
                    Spacer(Modifier.height(10.dp))
                }

                Text(
                    if (run.running) {
                        t("Steg ${run.index} av ${run.total}", "Step ${run.index} of ${run.total}")
                    } else {
                        t("${run.total} steg", "${run.total} steps")
                    },
                    style = MaterialTheme.typography.labelSmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                )
                Spacer(Modifier.height(4.dp))
                Text(
                    run.label.ifBlank { t("Starter …", "Starting …") },
                    style = MaterialTheme.typography.bodyLarge,
                    textAlign = TextAlign.Center,
                    modifier = Modifier.fillMaxWidth(),
                )

                if (error) {
                    Spacer(Modifier.height(10.dp))
                    Surface(
                        shape = RoundedCornerShape(10.dp),
                        color = MaterialTheme.colorScheme.error.copy(alpha = 0.12f),
                        modifier = Modifier.fillMaxWidth(),
                    ) {
                        Text(
                            run.error,
                            color = MaterialTheme.colorScheme.error,
                            style = MaterialTheme.typography.bodySmall,
                            modifier = Modifier.padding(10.dp),
                        )
                    }
                }

                Spacer(Modifier.height(18.dp))
                if (run.running) {
                    Surface(
                        shape = RoundedCornerShape(16.dp),
                        color = MaterialTheme.colorScheme.error,
                        modifier = Modifier.fillMaxWidth().height(72.dp).clickable { vm.stopRoutine() },
                    ) {
                        Box(contentAlignment = Alignment.Center) {
                            Text(
                                t("STOPP", "STOP"),
                                color = Color.White,
                                fontSize = 24.sp,
                                fontWeight = FontWeight.Bold,
                            )
                        }
                    }
                    Spacer(Modifier.height(8.dp))
                    Text(
                        t("Stopper umiddelbart, også midt i et steg.", "Stops immediately, even mid-step."),
                        style = MaterialTheme.typography.labelSmall,
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                    )
                } else {
                    Button(onClick = { vm.dismissRoutineRun() }, modifier = Modifier.fillMaxWidth().height(52.dp)) {
                        Text(t("Lukk", "Close"))
                    }
                }
            }
        }
        }
    }
}

@Composable
private fun RoutineAccessCard(vm: AppViewModel, ready: Boolean) {
    val recorded by RoutineRecorder.steps.collectAsState()
    Surface(
        shape = RoundedCornerShape(14.dp),
        color = MaterialTheme.colorScheme.surface,
        modifier = Modifier.fillMaxWidth().padding(bottom = 8.dp),
    ) {
        Column(Modifier.padding(14.dp)) {
            Row(verticalAlignment = Alignment.CenterVertically) {
                Icon(
                    if (ready) Icons.Filled.Check else Icons.Filled.Warning,
                    contentDescription = null,
                    tint = if (ready) MaterialTheme.colorScheme.primary else MaterialTheme.colorScheme.error,
                    modifier = Modifier.size(20.dp),
                )
                Spacer(Modifier.width(10.dp))
                Column(Modifier.weight(1f)) {
                    Text(
                        if (ready) t("Kjører uten PC", "Runs without a PC") else t("Kjør uten PC", "Run without a PC"),
                        style = MaterialTheme.typography.bodyMedium,
                        fontWeight = FontWeight.SemiBold,
                    )
                    Text(
                        if (ready) {
                            t(
                                "Tilgjengelighetstjenesten er på – rutinene virker uten bridge.",
                                "The accessibility service is on — routines work without the bridge.",
                            )
                        } else {
                            t(
                                "Slå på tilgjengelighetstjenesten, så virker rutinene uten PC og ADB.",
                                "Turn on the accessibility service so routines work without a PC or ADB.",
                            )
                        },
                        style = MaterialTheme.typography.labelSmall,
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                    )
                }
                if (!ready) {
                    TextButton(onClick = { vm.openAccessibilitySettings() }) { Text(t("Slå på", "Turn on")) }
                }
            }
            if (ready) {
                Spacer(Modifier.height(10.dp))
                if (vm.recording) {
                    Row(verticalAlignment = Alignment.CenterVertically) {
                        Text(
                            t("Spiller inn · ${recorded.size} steg", "Recording · ${recorded.size} steps"),
                            style = MaterialTheme.typography.labelMedium,
                            color = MaterialTheme.colorScheme.primary,
                            modifier = Modifier.weight(1f),
                        )
                        TextButton(onClick = { vm.cancelRecording() }) { Text(t("Avbryt", "Cancel")) }
                        Button(onClick = { vm.stopRecording() }) { Text(t("Stopp og lagre", "Stop and save")) }
                    }
                } else {
                    OutlinedButton(onClick = { vm.startRecording() }) {
                        Icon(Icons.Filled.TouchApp, contentDescription = null, modifier = Modifier.size(16.dp))
                        Spacer(Modifier.width(8.dp))
                        Text(t("Spill inn en rutine", "Record a routine"))
                    }
                }
            }
        }
    }
}