package net.nimay.chatompomp

import android.Manifest
import android.content.pm.PackageManager
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.background
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
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material.icons.filled.Add
import androidx.compose.material.icons.filled.Delete
import androidx.compose.material.icons.filled.PlayArrow
import androidx.compose.material.icons.filled.Warning
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Button
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Surface
import androidx.compose.material3.Switch
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.material3.TopAppBar
import androidx.compose.material3.TopAppBarDefaults
import androidx.compose.runtime.Composable
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import android.provider.Settings
import androidx.core.app.NotificationManagerCompat
import androidx.core.content.ContextCompat
import java.text.SimpleDateFormat
import java.util.Calendar
import java.util.Date
import java.util.Locale

// ------------------------------------------------------------ trigger card

@Composable
fun TriggerCard(vm: AppViewModel, routine: Routine) {
    var editing by remember { mutableStateOf(false) }
    Surface(
        shape = RoundedCornerShape(14.dp),
        color = MaterialTheme.colorScheme.surface,
        modifier = Modifier.fillMaxWidth().padding(horizontal = 14.dp, vertical = 4.dp),
    ) {
        Row(Modifier.padding(14.dp), verticalAlignment = Alignment.CenterVertically) {
            Column(Modifier.weight(1f)) {
                Text(
                    t("Når", "When"),
                    style = MaterialTheme.typography.labelSmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                )
                Text(vm.triggerSummary(routine), style = MaterialTheme.typography.bodyMedium)
                if (routine.trigger.type != "manual") {
                    Text(
                        if (routine.autoRun) t("Kjører automatisk", "Runs automatically")
                        else t("Spør først (varsel)", "Asks first (notification)"),
                        style = MaterialTheme.typography.labelSmall,
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                    )
                }
            }
            TextButton(onClick = { editing = true }) { Text(t("Endre", "Change")) }
        }
    }
    if (editing) TriggerSheet(vm, routine) { editing = false }
}

@Composable
private fun TriggerSheet(vm: AppViewModel, routine: Routine, onDismiss: () -> Unit) {
    var type by remember { mutableStateOf(routine.trigger.type) }
    var hour by remember { mutableStateOf(routine.trigger.hour) }
    var minute by remember { mutableStateOf(routine.trigger.minute) }
    var weekdays by remember { mutableStateOf(routine.trigger.weekdays) }
    var minutesBefore by remember { mutableStateOf(routine.trigger.minutesBefore) }
    var placeId by remember { mutableStateOf(routine.trigger.placeId) }
    var entering by remember { mutableStateOf(routine.trigger.entering) }
    var autoRun by remember { mutableStateOf(routine.autoRun) }

    AlertDialog(
        onDismissRequest = onDismiss,
        title = { Text(t("Når skal den kjøre?", "When should it run?")) },
        text = {
            Column(Modifier.verticalScroll(rememberScrollState())) {
                val types = listOf(
                    "manual" to t("Manuelt", "Manual"),
                    "time" to t("Klokkeslett", "Time"),
                    "shift" to t("Skift", "Shift"),
                    "place" to t("Sted", "Place"),
                )
                TypesRow(types, type) { type = it }
                Spacer(Modifier.height(10.dp))
                when (type) {
                    "time" -> {
                        Stepper(t("Time", "Hour"), hour, 0, 23) { hour = it }
                        Stepper(t("Minutt", "Minute"), minute, 0, 55, 5) { minute = it }
                        Row(verticalAlignment = Alignment.CenterVertically) {
                            Text(t("Bare hverdager", "Weekdays only"), modifier = Modifier.weight(1f))
                            Switch(checked = weekdays, onCheckedChange = { weekdays = it })
                        }
                    }
                    "shift" -> {
                        Text(
                            t(
                                "Rutinen kjører når et skift i skiftplanen starter om litt.",
                                "The routine runs when a shift in the shift plan is about to start.",
                            ),
                            style = MaterialTheme.typography.bodySmall,
                            color = MaterialTheme.colorScheme.onSurfaceVariant,
                        )
                        Spacer(Modifier.height(8.dp))
                        val options = listOf(10, 20, 30, 60)
                        Row(horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                            options.forEach { value ->
                                PillChip("$value min", minutesBefore == value) { minutesBefore = value }
                            }
                        }
                        if (vm.shifts.isEmpty()) {
                            Spacer(Modifier.height(8.dp))
                            Text(
                                t("Ingen skift lagt inn ennå – legg dem inn under Kilder.", "No shifts yet — add them under Sources."),
                                style = MaterialTheme.typography.labelSmall,
                                color = MaterialTheme.colorScheme.error,
                            )
                        }
                    }
                    "place" -> {
                        if (vm.places.isEmpty()) {
                            Text(
                                t("Legg til et sted under Kilder først.", "Add a place under Sources first."),
                                style = MaterialTheme.typography.bodySmall,
                                color = MaterialTheme.colorScheme.error,
                            )
                        } else {
                            vm.places.forEach { place ->
                                Row(
                                    Modifier.fillMaxWidth().clickable { placeId = place.id }.padding(vertical = 8.dp),
                                    verticalAlignment = Alignment.CenterVertically,
                                ) {
                                    Box(
                                        Modifier.size(16.dp).background(
                                            if (placeId == place.id) MaterialTheme.colorScheme.primary
                                            else MaterialTheme.colorScheme.surfaceVariant,
                                            RoundedCornerShape(8.dp),
                                        ),
                                    )
                                    Spacer(Modifier.width(10.dp))
                                    Text(place.name, modifier = Modifier.weight(1f))
                                    Text("${place.radius} m", style = MaterialTheme.typography.labelSmall,
                                        color = MaterialTheme.colorScheme.onSurfaceVariant)
                                }
                            }
                            Spacer(Modifier.height(6.dp))
                            Row(horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                                PillChip(t("Kommer", "Arrive"), entering) { entering = true }
                                PillChip(t("Forlater", "Leave"), !entering) { entering = false }
                            }
                        }
                    }
                }
                if (type != "manual") {
                    Spacer(Modifier.height(12.dp))
                    Row(verticalAlignment = Alignment.CenterVertically) {
                        Column(Modifier.weight(1f)) {
                            Text(t("Kjør automatisk", "Run automatically"))
                            Text(
                                t("Uten varsel – krever tilgjengelighetstjenesten.", "Without asking — needs the accessibility service."),
                                style = MaterialTheme.typography.labelSmall,
                                color = MaterialTheme.colorScheme.onSurfaceVariant,
                            )
                        }
                        Switch(checked = autoRun, onCheckedChange = { autoRun = it })
                    }
                }
            }
        },
        confirmButton = {
            TextButton(onClick = {
                val trigger = Trigger(
                    type = type,
                    hour = hour,
                    minute = minute,
                    weekdays = weekdays,
                    minutesBefore = minutesBefore,
                    placeId = placeId.ifBlank { vm.places.firstOrNull()?.id.orEmpty() },
                    entering = entering,
                )
                vm.setRoutineTrigger(routine.id, trigger)
                vm.setRoutineAutoRun(routine.id, autoRun && type != "manual")
                onDismiss()
            }) { Text(t("Lagre", "Save")) }
        },
        dismissButton = { TextButton(onClick = onDismiss) { Text(t("Avbryt", "Cancel")) } },
    )
}

@Composable
private fun Stepper(label: String, value: Int, min: Int, max: Int, step: Int = 1, onChange: (Int) -> Unit) {
    Row(Modifier.fillMaxWidth().padding(vertical = 4.dp), verticalAlignment = Alignment.CenterVertically) {
        Text(label, modifier = Modifier.weight(1f))
        TextButton(onClick = { onChange(((value - step + (max - min + step)) % (max - min + step)) + min) }) { Text("−") }
        Text(String.format(Locale.getDefault(), "%02d", value), fontWeight = FontWeight.SemiBold)
        TextButton(onClick = { onChange(((value - min + step) % (max - min + step)) + min) }) { Text("+") }
    }
}

@Composable
private fun TypesRow(types: List<Pair<String, String>>, selected: String, onSelect: (String) -> Unit) {
    Row(horizontalArrangement = Arrangement.spacedBy(6.dp)) {
        types.forEach { (id, label) -> PillChip(label, selected == id) { onSelect(id) } }
    }
}

@Composable
private fun PillChip(label: String, selected: Boolean, onClick: () -> Unit) {
    Surface(
        shape = RoundedCornerShape(999.dp),
        color = if (selected) MaterialTheme.colorScheme.primary else MaterialTheme.colorScheme.surfaceVariant,
        modifier = Modifier.clickable(onClick = onClick),
    ) {
        Text(
            label,
            style = MaterialTheme.typography.labelMedium,
            color = if (selected) MaterialTheme.colorScheme.onPrimary else MaterialTheme.colorScheme.onSurfaceVariant,
            modifier = Modifier.padding(horizontal = 12.dp, vertical = 7.dp),
        )
    }
}

// ------------------------------------------------------------ sources screen

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun SourcesScreen(vm: AppViewModel, onBack: () -> Unit) {
    val context = LocalContext.current
    var showPlace by remember { mutableStateOf(false) }
    var showPattern by remember { mutableStateOf(false) }
    var showPaste by remember { mutableStateOf(false) }
    var hasLocation by remember {
        mutableStateOf(ContextCompat.checkSelfPermission(context, Manifest.permission.ACCESS_FINE_LOCATION) == PackageManager.PERMISSION_GRANTED)
    }
    val launcher = rememberLauncherForActivityResult(ActivityResultContracts.RequestMultiplePermissions()) { result ->
        hasLocation = result[Manifest.permission.ACCESS_FINE_LOCATION] == true
    }

    Scaffold(
        containerColor = MaterialTheme.colorScheme.background,
        topBar = {
            TopAppBar(
                colors = TopAppBarDefaults.topAppBarColors(containerColor = MaterialTheme.colorScheme.background),
                navigationIcon = {
                    IconButton(onClick = onBack) { Icon(Icons.AutoMirrored.Filled.ArrowBack, contentDescription = t("Tilbake", "Back")) }
                },
                title = { Text(t("Kilder og triggere", "Sources and triggers"), fontWeight = FontWeight.SemiBold) },
            )
        },
    ) { padding ->
        LazyColumn(
            Modifier.padding(padding).fillMaxSize(),
            contentPadding = PaddingValues(horizontal = 14.dp, vertical = 8.dp),
            verticalArrangement = Arrangement.spacedBy(8.dp),
        ) {
            item { SectionTitle(t("STEDER", "PLACES")) }
            if (vm.places.isEmpty()) {
                item { Muted(t("Ingen steder ennå. Legg til jobb, hjem eller et annet sted.", "No places yet. Add work, home or another place.")) }
            }
            items(vm.places) { place ->
                Surface(shape = RoundedCornerShape(12.dp), color = MaterialTheme.colorScheme.surface, modifier = Modifier.fillMaxWidth()) {
                    Row(Modifier.padding(12.dp), verticalAlignment = Alignment.CenterVertically) {
                        Column(Modifier.weight(1f)) {
                            Text(place.name, style = MaterialTheme.typography.bodyMedium)
                            Text("${place.radius} m", style = MaterialTheme.typography.labelSmall,
                                color = MaterialTheme.colorScheme.onSurfaceVariant)
                        }
                        IconButton(onClick = { vm.deletePlace(place.id) }) {
                            Icon(Icons.Filled.Delete, contentDescription = t("Slett", "Delete"),
                                tint = MaterialTheme.colorScheme.error, modifier = Modifier.size(18.dp))
                        }
                    }
                }
            }
            item {
                OutlinedButton(onClick = {
                    if (!hasLocation) launcher.launch(arrayOf(Manifest.permission.ACCESS_FINE_LOCATION, Manifest.permission.ACCESS_COARSE_LOCATION))
                    else showPlace = true
                }) {
                    Icon(Icons.Filled.Add, contentDescription = null, modifier = Modifier.size(16.dp))
                    Spacer(Modifier.width(6.dp))
                    Text(if (!hasLocation) t("Gi posisjonstillatelse", "Allow location") else t("Legg til sted", "Add place"))
                }
            }

            item { Spacer(Modifier.height(6.dp)); SectionTitle(t("SKIFTPLAN", "SHIFT PLAN")) }
            item {
                val next = vm.shifts.firstOrNull { it.end > System.currentTimeMillis() }
                Surface(shape = RoundedCornerShape(12.dp), color = MaterialTheme.colorScheme.surface, modifier = Modifier.fillMaxWidth()) {
                    Column(Modifier.padding(12.dp)) {
                        Text(
                            if (vm.shifts.isEmpty()) t("Ingen skift lagt inn.", "No shifts added.")
                            else t("${vm.shifts.size} skift", "${vm.shifts.size} shifts"),
                            style = MaterialTheme.typography.bodyMedium,
                        )
                        if (next != null) {
                            Text(
                                t("Neste: ", "Next: ") + formatShift(next),
                                style = MaterialTheme.typography.labelSmall,
                                color = MaterialTheme.colorScheme.onSurfaceVariant,
                            )
                        }
                    }
                }
            }
            item {
                Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                    OutlinedButton(onClick = { showPattern = true }) { Text(t("Mønster", "Pattern")) }
                    OutlinedButton(onClick = { showPaste = true }) { Text(t("Lim inn", "Paste")) }
                    if (vm.shifts.isNotEmpty()) {
                        TextButton(onClick = { vm.clearShifts() }) { Text(t("Tøm", "Clear")) }
                    }
                }
            }
            if (vm.shifts.isNotEmpty()) {
                items(vm.shifts.take(30)) { shift ->
                    Row(Modifier.fillMaxWidth().padding(vertical = 2.dp), verticalAlignment = Alignment.CenterVertically) {
                        Text(formatShift(shift), style = MaterialTheme.typography.bodySmall, modifier = Modifier.weight(1f))
                        IconButton(onClick = { vm.deleteShift(shift.id) }, modifier = Modifier.size(28.dp)) {
                            Icon(Icons.Filled.Delete, contentDescription = t("Slett", "Delete"),
                                tint = MaterialTheme.colorScheme.onSurfaceVariant, modifier = Modifier.size(16.dp))
                        }
                    }
                }
            }

            item { Spacer(Modifier.height(6.dp)); SectionTitle(t("AUTOMATIKK", "AUTOMATION")) }
            item {
                val ready by OmpAccessibilityService.isReady.collectAsState()
                Surface(shape = RoundedCornerShape(12.dp), color = MaterialTheme.colorScheme.surface, modifier = Modifier.fillMaxWidth()) {
                    Column(Modifier.padding(12.dp)) {
                        Row(verticalAlignment = Alignment.CenterVertically) {
                            Icon(
                                if (ready) Icons.Filled.PlayArrow else Icons.Filled.Warning,
                                contentDescription = null,
                                tint = if (ready) MaterialTheme.colorScheme.primary else MaterialTheme.colorScheme.error,
                                modifier = Modifier.size(18.dp),
                            )
                            Spacer(Modifier.width(8.dp))
                            Text(
                                if (ready) t("Klar til å kjøre automatisk", "Ready to run automatically")
                                else t("Slå på tilgjengelighetstjenesten for automatiske trykk", "Turn on the accessibility service for automatic taps"),
                                style = MaterialTheme.typography.bodySmall,
                                modifier = Modifier.weight(1f),
                            )
                        }
                        Spacer(Modifier.height(8.dp))
                        Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                            if (!ready) {
                                OutlinedButton(onClick = { vm.openAccessibilitySettings() }) { Text(t("Slå på", "Turn on")) }
                            }
                            OutlinedButton(onClick = { openBatterySettings(context) }) { Text(t("Batteri: ubegrenset", "Battery: unrestricted")) }
                        }
                        Spacer(Modifier.height(8.dp))
                        Button(onClick = { vm.checkTriggersNow() }, modifier = Modifier.fillMaxWidth()) {
                            Text(t("Sjekk triggere nå", "Check triggers now"))
                        }
                    }
                }
            }
            if (vm.recordingNotice.isNotBlank()) {
                item {
                    Surface(shape = RoundedCornerShape(12.dp), color = MaterialTheme.colorScheme.surfaceVariant,
                        modifier = Modifier.fillMaxWidth()) {
                        Row(Modifier.padding(12.dp), verticalAlignment = Alignment.CenterVertically) {
                            Text(vm.recordingNotice, style = MaterialTheme.typography.bodySmall, modifier = Modifier.weight(1f))
                            TextButton(onClick = { vm.clearRecordingNotice() }) { Text(t("Lukk", "Close")) }
                        }
                    }
                }
            }
        }
    }

    if (showPlace) PlaceDialog(vm, onDismiss = { showPlace = false })
    if (showPattern) ShiftPatternDialog(vm, onDismiss = { showPattern = false })
    if (showPaste) ShiftPasteDialog(vm, onDismiss = { showPaste = false })
}

@Composable
private fun SectionTitle(text: String) {
    Text(text, style = MaterialTheme.typography.labelSmall, color = MaterialTheme.colorScheme.onSurfaceVariant,
        fontWeight = FontWeight.SemiBold)
}

@Composable
private fun Muted(text: String) {
    Text(text, style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
}

@Composable
private fun PlaceDialog(vm: AppViewModel, onDismiss: () -> Unit) {
    var name by remember { mutableStateOf("") }
    var radius by remember { mutableStateOf(250) }
    var point by remember { mutableStateOf(vm.currentLocation()) }
    var busy by remember { mutableStateOf(false) }
    androidx.compose.runtime.LaunchedEffect(Unit) {
        if (point == null) {
            busy = true
            point = vm.requestLocation()
            busy = false
        }
    }
    AlertDialog(
        onDismissRequest = onDismiss,
        title = { Text(t("Nytt sted", "New place")) },
        text = {
            Column {
                OutlinedTextField(value = name, onValueChange = { name = it },
                    label = { Text(t("Navn (f.eks. Jobb)", "Name (e.g. Work)")) }, singleLine = true)
                Spacer(Modifier.height(10.dp))
                Text(
                    when {
                        busy -> t("Henter posisjon …", "Getting location …")
                        point == null -> t("Ingen posisjon funnet. Slå på posisjon og prøv igjen.", "No location found. Turn on location and try again.")
                        else -> t("Posisjon: lagret ✓", "Location: saved ✓")
                    },
                    style = MaterialTheme.typography.labelSmall,
                    color = if (point == null && !busy) MaterialTheme.colorScheme.error else MaterialTheme.colorScheme.onSurfaceVariant,
                )
                Spacer(Modifier.height(8.dp))
                Row(horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                    listOf(100, 250, 500, 1000).forEach { value ->
                        PillChip("$value m", radius == value) { radius = value }
                    }
                }
            }
        },
        confirmButton = {
            TextButton(enabled = name.isNotBlank() && point != null, onClick = {
                point?.let { vm.addPlace(name, it.first, it.second, radius) }
                onDismiss()
            }) { Text(t("Lagre", "Save")) }
        },
        dismissButton = { TextButton(onClick = onDismiss) { Text(t("Avbryt", "Cancel")) } },
    )
}

@Composable
private fun ShiftPatternDialog(vm: AppViewModel, onDismiss: () -> Unit) {
    val days = remember { mutableStateOf(setOf(Calendar.MONDAY, Calendar.TUESDAY, Calendar.WEDNESDAY, Calendar.THURSDAY, Calendar.FRIDAY)) }
    var startHour by remember { mutableStateOf(8) }
    var endHour by remember { mutableStateOf(16) }
    var weeks by remember { mutableStateOf(4) }
    val labels = listOf(
        Calendar.MONDAY to "M", Calendar.TUESDAY to "T", Calendar.WEDNESDAY to "O",
        Calendar.THURSDAY to "T", Calendar.FRIDAY to "F", Calendar.SATURDAY to "L", Calendar.SUNDAY to "S",
    )
    AlertDialog(
        onDismissRequest = onDismiss,
        title = { Text(t("Gjenta skift", "Repeat shifts")) },
        text = {
            Column {
                Row(horizontalArrangement = Arrangement.spacedBy(4.dp)) {
                    labels.forEach { (day, label) ->
                        PillChip(label, days.value.contains(day)) {
                            days.value = if (days.value.contains(day)) days.value - day else days.value + day
                        }
                    }
                }
                Spacer(Modifier.height(10.dp))
                Stepper(t("Starter", "Starts"), startHour, 0, 23) { startHour = it }
                Stepper(t("Slutter", "Ends"), endHour, 1, 24) { endHour = it }
                Stepper(t("Uker", "Weeks"), weeks, 1, 12) { weeks = it }
            }
        },
        confirmButton = {
            TextButton(enabled = days.value.isNotEmpty() && endHour > startHour, onClick = {
                vm.addPatternShifts(days.value, startHour, endHour, weeks)
                onDismiss()
            }) { Text(t("Lag skift", "Create")) }
        },
        dismissButton = { TextButton(onClick = onDismiss) { Text(t("Avbryt", "Cancel")) } },
    )
}

@Composable
private fun ShiftPasteDialog(vm: AppViewModel, onDismiss: () -> Unit) {
    var text by remember { mutableStateOf("") }
    AlertDialog(
        onDismissRequest = onDismiss,
        title = { Text(t("Lim inn skiftplan", "Paste shift plan")) },
        text = {
            Column {
                Text(
                    t("Én linje per skift, f.eks. «2026-12-01 14:00-22:00» eller «1.12 14:00-22:00».",
                        "One line per shift, e.g. «2026-12-01 14:00-22:00» or «1.12 14:00-22:00»."),
                    style = MaterialTheme.typography.labelSmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                )
                Spacer(Modifier.height(8.dp))
                OutlinedTextField(value = text, onValueChange = { text = it }, minLines = 5, maxLines = 8)
            }
        },
        confirmButton = {
            TextButton(enabled = text.isNotBlank(), onClick = {
                vm.importShifts(text)
                onDismiss()
            }) { Text(t("Legg til", "Add")) }
        },
        dismissButton = { TextButton(onClick = onDismiss) { Text(t("Avbryt", "Cancel")) } },
    )
}

private fun formatShift(shift: Shift): String {
    val format = SimpleDateFormat("EEE d.MM HH:mm", Locale.getDefault())
    val end = SimpleDateFormat("HH:mm", Locale.getDefault())
    return format.format(Date(shift.start)) + "–" + end.format(Date(shift.end))
}

private fun openBatterySettings(context: android.content.Context) {
    val intent = android.content.Intent(Settings.ACTION_IGNORE_BATTERY_OPTIMIZATION_SETTINGS)
        .addFlags(android.content.Intent.FLAG_ACTIVITY_NEW_TASK)
    runCatching { context.startActivity(intent) }
}
