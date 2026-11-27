package net.nimay.chatompomp

import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
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
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material.icons.filled.Refresh
import androidx.compose.material.icons.filled.Delete
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.Button
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.material3.TopAppBar
import androidx.compose.material3.TopAppBarDefaults
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import org.json.JSONObject

@OptIn(ExperimentalMaterial3Api::class)
@Composable
private fun ToolBar(title: String, onBack: () -> Unit, actions: @Composable () -> Unit = {}) {
    TopAppBar(
        colors = TopAppBarDefaults.topAppBarColors(containerColor = MaterialTheme.colorScheme.background),
        navigationIcon = {
            IconButton(onClick = onBack) {
                Icon(Icons.AutoMirrored.Filled.ArrowBack, contentDescription = "Tilbake")
            }
        },
        title = { Text(title, fontWeight = FontWeight.SemiBold, maxLines = 1) },
        actions = { actions() },
    )
}

@Composable
private fun SectionTitle(text: String) {
    Text(
        text,
        style = MaterialTheme.typography.labelSmall,
        color = MaterialTheme.colorScheme.primary,
        modifier = Modifier.padding(top = 12.dp, bottom = 4.dp),
    )
}

@Composable
private fun Muted(text: String) {
    Text(
        text,
        style = MaterialTheme.typography.bodySmall,
        color = MaterialTheme.colorScheme.onSurfaceVariant,
        modifier = Modifier.padding(vertical = 4.dp),
    )
}

private fun jsonItems(array: org.json.JSONArray?): List<JSONObject> {
    if (array == null) return emptyList()
    return (0 until array.length()).mapNotNull { array.optJSONObject(it) }
}

// ------------------------------------------------------------------ files

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun FilesScreen(vm: AppViewModel, onBack: () -> Unit) {
    LaunchedEffect(Unit) { if (vm.fsPath.isBlank()) vm.loadFs(vm.activeCwd.ifBlank { "C:\\" }) }
    val file = vm.fsFile
    val editing = vm.editingContent
    var showMkdir by remember { mutableStateOf(false) }
    Scaffold(
        containerColor = MaterialTheme.colorScheme.background,
        topBar = {
            ToolBar(
                title = if (file != null) file.path.substringAfterLast('\\').substringAfterLast('/') else "Filer",
                onBack = {
                    when {
                        editing != null -> vm.stopEditing()
                        file != null -> vm.closeFile()
                        vm.canGoUp() -> vm.fsUp()
                        else -> onBack()
                    }
                },
                actions = {
                    if (file != null) {
                        if (editing == null) {
                            TextButton(onClick = { vm.startEditing(file.path) }) { Text("Rediger") }
                        } else {
                            TextButton(onClick = { vm.saveFile(file.path, editing) }) { Text("Lagre") }
                            TextButton(onClick = { vm.stopEditing() }) { Text("Avbryt") }
                        }
                        TextButton(onClick = { vm.deleteEntry(file.path); vm.closeFile() }) { Text("Slett") }
                    } else {
                        TextButton(onClick = { showMkdir = true }) { Text("Ny mappe") }
                        IconButton(onClick = { vm.loadFs(vm.fsPath) }) {
                            Icon(Icons.Filled.Refresh, contentDescription = "Oppdater")
                        }
                    }
                },
            )
        },
    ) { padding ->
        when {
            editing != null -> OutlinedTextField(
                value = editing,
                onValueChange = { vm.updateEditing(it) },
                modifier = Modifier.padding(padding).fillMaxSize().padding(8.dp),
                textStyle = MaterialTheme.typography.bodySmall.copy(fontFamily = FontFamily.Monospace),
            )
            file != null -> LazyColumn(
                Modifier.padding(padding).fillMaxSize(),
                contentPadding = PaddingValues(12.dp),
            ) {
                item {
                    Text(file.content, fontFamily = FontFamily.Monospace, fontSize = 12.sp,
                        color = MaterialTheme.colorScheme.onBackground)
                }
            }
            else -> Column(Modifier.padding(padding).fillMaxSize()) {
                Text(
                    vm.fsPath,
                    style = MaterialTheme.typography.labelSmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                    maxLines = 1,
                    modifier = Modifier.padding(horizontal = 16.dp, vertical = 6.dp),
                )
                LazyColumn(Modifier.fillMaxSize()) {
                    if (vm.fsEntries.isEmpty()) item { Muted("Tom mappe.") }
                    items(vm.fsEntries) { entry ->
                        Row(
                            Modifier.fillMaxWidth()
                                .clickable { if (entry.isDir) vm.loadFs(entry.path) else vm.readFile(entry.path) }
                                .padding(horizontal = 16.dp, vertical = 10.dp),
                            verticalAlignment = Alignment.CenterVertically,
                        ) {
                            Text(if (entry.isDir) "📁" else "📄", modifier = Modifier.padding(end = 10.dp))
                            Column(Modifier.weight(1f)) {
                                Text(entry.name, style = MaterialTheme.typography.bodyMedium)
                                Text(
                                    if (entry.isDir) "mappe" else "${entry.size} bytes",
                                    style = MaterialTheme.typography.labelSmall,
                                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                                )
                            }
                        }
                    }
                }
            }
        }
    }
    if (showMkdir && vm.fsPath.isNotBlank()) {
        var name by remember { mutableStateOf("") }
        AlertDialog(
            onDismissRequest = { showMkdir = false },
            title = { Text("Ny mappe") },
            text = { OutlinedTextField(value = name, onValueChange = { name = it }, label = { Text("Navn") }, singleLine = true) },
            confirmButton = {
                TextButton(
                    onClick = {
                        if (name.isNotBlank()) {
                            vm.makeDir(vm.fsPath.trimEnd('\\', '/') + "\\" + name.trim())
                            showMkdir = false
                        }
                    },
                    enabled = name.isNotBlank(),
                ) { Text("Opprett") }
            },
            dismissButton = { TextButton(onClick = { showMkdir = false }) { Text("Avbryt") } },
        )
    }
}

// ------------------------------------------------------------------ git

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun GitScreen(vm: AppViewModel, onBack: () -> Unit) {
    LaunchedEffect(Unit) { vm.loadGit() }
    var message by remember { mutableStateOf("") }
    Scaffold(
        containerColor = MaterialTheme.colorScheme.background,
        topBar = {
            ToolBar("Git", onBack, actions = {
                IconButton(onClick = { vm.loadGit() }) {
                    Icon(Icons.Filled.Refresh, contentDescription = "Oppdater")
                }
            })
        },
    ) { padding ->
        val status = vm.gitStatus
        val files = jsonItems(status?.optJSONArray("files"))
        LazyColumn(
            modifier = Modifier.padding(padding).fillMaxSize(),
            contentPadding = PaddingValues(horizontal = 16.dp, vertical = 8.dp),
            verticalArrangement = Arrangement.spacedBy(4.dp),
        ) {
            item {
                Text(
                    "Gren: " + status?.optString("branch").orEmpty().ifBlank { "—" },
                    style = MaterialTheme.typography.bodyMedium,
                )
            }
            item { SectionTitle("ENDRINGER") }
            if (status == null) item { Muted("Ingen Git-data. Åpne en samtale eller velg et prosjekt.") }
            else if (files.isEmpty()) item { Muted("Ingen endringer.") }
            items(files) { file ->
                Text(
                    (file.optString("status") + "  " + file.optString("path")),
                    style = MaterialTheme.typography.bodySmall,
                    fontFamily = FontFamily.Monospace,
                )
            }
            item {
                OutlinedTextField(
                    value = message,
                    onValueChange = { message = it },
                    label = { Text("Commit-melding") },
                    singleLine = true,
                    modifier = Modifier.fillMaxWidth().padding(top = 10.dp),
                )
            }
            item {
                Row {
                    TextButton(onClick = { vm.stageAll() }, enabled = files.isNotEmpty()) { Text("Stage alle") }
                    TextButton(onClick = { vm.commit(message); message = "" }, enabled = message.isNotBlank()) { Text("Commit") }
                }
            }
            item { SectionTitle("SISTE COMMITS") }
            if (vm.gitLog.isEmpty()) item { Muted("Ingen commits.") }
            items(vm.gitLog) { commit ->
                val hash = commit.optString("hash").take(8)
                val subject = commit.optString("subject").ifBlank { commit.optString("message") }
                Text("$hash  $subject", style = MaterialTheme.typography.bodySmall, maxLines = 1)
            }
        }
    }
}


// ------------------------------------------------------------------ terminal

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun TerminalScreen(vm: AppViewModel, onBack: () -> Unit) {
    LaunchedEffect(Unit) { vm.terminalStart() }
    var command by remember { mutableStateOf("") }
    Scaffold(
        containerColor = MaterialTheme.colorScheme.background,
        topBar = {
            ToolBar("Terminal", onBack, actions = {
                TextButton(onClick = { vm.terminalStop() }) { Text("Stopp") }
            })
        },
    ) { padding ->
        Column(Modifier.padding(padding).fillMaxSize()) {
            LazyColumn(
                modifier = Modifier.weight(1f).fillMaxWidth(),
                contentPadding = PaddingValues(12.dp),
            ) {
                item {
                    Text(
                        vm.terminalOutput.ifBlank { "Starter terminal …" },
                        fontFamily = FontFamily.Monospace,
                        fontSize = 12.sp,
                        color = MaterialTheme.colorScheme.onBackground,
                    )
                }
            }
            Row(Modifier.fillMaxWidth().padding(10.dp), verticalAlignment = Alignment.CenterVertically) {
                OutlinedTextField(
                    value = command,
                    onValueChange = { command = it },
                    label = { Text("Kommando") },
                    singleLine = true,
                    modifier = Modifier.weight(1f),
                )
                Spacer(Modifier.width(8.dp))
                Button(onClick = { vm.terminalSend(command); command = "" }, enabled = command.isNotBlank()) {
                    Text("Send")
                }
            }
        }
    }
}

// ------------------------------------------------------------------ devices

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun DevicesScreen(vm: AppViewModel, onBack: () -> Unit) {
    LaunchedEffect(Unit) { vm.loadAdb() }
    Scaffold(
        containerColor = MaterialTheme.colorScheme.background,
        topBar = {
            ToolBar("Enheter", onBack, actions = {
                IconButton(onClick = { vm.loadAdb() }) {
                    Icon(Icons.Filled.Refresh, contentDescription = "Oppdater")
                }
            })
        },
    ) { padding ->
        val status = vm.adbStatus
        val devices = jsonItems(status?.optJSONArray("devices"))
        LazyColumn(
            modifier = Modifier.padding(padding).fillMaxSize(),
            contentPadding = PaddingValues(horizontal = 16.dp, vertical = 8.dp),
            verticalArrangement = Arrangement.spacedBy(4.dp),
        ) {
            item {
                Text(
                    "ADB " + (if (status?.optBoolean("installed") == true) "installert" else "mangler") +
                        " · " + (if (status?.optBoolean("running") == true) "kjører" else "stopper"),
                    style = MaterialTheme.typography.bodyMedium,
                )
            }
            item { Muted(status?.optString("version").orEmpty().ifBlank { "Ingen ADB-versjon." }) }
            if (status?.optBoolean("installed") != true) {
                item { TextButton(onClick = { vm.installAdb() }) { Text("Installer ADB") } }
            }
            item { SectionTitle("TILKOBLEDE ENHETER") }
            if (devices.isEmpty()) item { Muted("Ingen tilkoblede enheter.") }
            items(devices) { device ->
                Column(Modifier.padding(vertical = 6.dp)) {
                    Text(
                        device.optString("model").ifBlank { device.optString("serial") },
                        style = MaterialTheme.typography.bodyMedium,
                    )
                    Text(
                        device.optString("serial") + " · Android " + device.optString("android") +
                            " · " + device.optString("state"),
                        style = MaterialTheme.typography.labelSmall,
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                    )
                }
            }
        }
    }
}

// ------------------------------------------------------------------ voice

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun VoiceScreen(vm: AppViewModel, onBack: () -> Unit) {
    LaunchedEffect(Unit) { vm.loadVoice() }
    Scaffold(
        containerColor = MaterialTheme.colorScheme.background,
        topBar = {
            ToolBar("Tale", onBack, actions = {
                IconButton(onClick = { vm.loadVoice() }) {
                    Icon(Icons.Filled.Refresh, contentDescription = "Oppdater")
                }
            })
        },
    ) { padding ->
        val engines = vm.voiceEngines?.optJSONObject("engines")
        val local = vm.voiceLocal
        LazyColumn(
            modifier = Modifier.padding(padding).fillMaxSize(),
            contentPadding = PaddingValues(horizontal = 16.dp, vertical = 8.dp),
            verticalArrangement = Arrangement.spacedBy(4.dp),
        ) {
            item {
                Text(
                    "Lokal tale: " + (if (local?.optBoolean("ready") == true) "klar" else "ikke klar"),
                    style = MaterialTheme.typography.bodyMedium,
                )
            }
            item { SectionTitle("MOTORER") }
            val keys = engines?.keys()?.asSequence()?.toList() ?: emptyList()
            if (keys.isEmpty()) item { Muted("Ingen motorer funnet.") }
            items(keys) { key ->
                val engine = engines?.optJSONObject(key) ?: return@items
                Row(
                    Modifier.fillMaxWidth().padding(vertical = 7.dp),
                    verticalAlignment = Alignment.CenterVertically,
                ) {
                    Column(Modifier.weight(1f)) {
                        Text(engine.optString("name").ifBlank { key }, style = MaterialTheme.typography.bodyMedium)
                        Text(
                            (if (engine.optBoolean("installed")) "Installert" else "Ikke installert") +
                                " · " + engine.optString("hardware") + " · " + engine.optString("lang"),
                            style = MaterialTheme.typography.labelSmall,
                            color = MaterialTheme.colorScheme.onSurfaceVariant,
                        )
                    }
                }
            }
            item { SectionTitle("TEST") }
            item {
                TextButton(onClick = { vm.speak("Hei fra Chat OMP OMP") }) {
                    Text("Les opp en testsetning")
                }
            }
        }
    }
}

// ------------------------------------------------------------------ wake-on-lan

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun WolScreen(vm: AppViewModel, onBack: () -> Unit) {
    LaunchedEffect(Unit) { vm.loadWol() }
    Scaffold(
        containerColor = MaterialTheme.colorScheme.background,
        topBar = {
            ToolBar("Wake-on-LAN", onBack, actions = {
                IconButton(onClick = { vm.loadWol() }) {
                    Icon(Icons.Filled.Refresh, contentDescription = "Oppdater")
                }
            })
        },
    ) { padding ->
        val info = vm.wolInfo
        Column(Modifier.padding(padding).fillMaxSize().padding(16.dp)) {
            if (info == null) {
                Muted("Ikke konfigurert. Sett opp Wake-on-LAN i OMP Desktop først.")
            } else {
                Text("MAC: " + info.optString("mac").ifBlank { "—" }, style = MaterialTheme.typography.bodyMedium)
                Spacer(Modifier.height(4.dp))
                Text(
                    "Relé: " + info.optString("relayUrl").ifBlank { "ikke satt" },
                    style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                )
                Spacer(Modifier.height(4.dp))
                Text(
                    "Fjernavslåing: " + (if (info.optBoolean("allowShutdown")) "aktivert" else "av"),
                    style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                )
            }
        }
    }
}

// ------------------------------------------------------------------ tools menu

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun ToolsScreen(vm: AppViewModel, onBack: () -> Unit, onOpen: (String) -> Unit) {
    Scaffold(
        containerColor = MaterialTheme.colorScheme.background,
        topBar = { ToolBar("Verktøy", onBack) },
    ) { padding ->
        LazyColumn(
            modifier = Modifier.padding(padding).fillMaxSize(),
            contentPadding = PaddingValues(horizontal = 16.dp, vertical = 8.dp),
        ) {
            val tools = listOf(
                "Filer" to "files",
                "Git" to "git",
                "Terminal" to "terminal",
                "Enheter" to "devices",
                "Tale" to "voice",
                "Wake-on-LAN" to "wol",
                "Modeller og nøkler" to "providers",
            )
            items(tools) { tool ->
                Row(
                    Modifier.fillMaxWidth().clickable { onOpen(tool.second) }.padding(vertical = 12.dp),
                    verticalAlignment = Alignment.CenterVertically,
                ) {
                    Text(tool.first, style = MaterialTheme.typography.bodyMedium, modifier = Modifier.weight(1f))
                    Text("›", color = MaterialTheme.colorScheme.onSurfaceVariant)
                }
            }
            item { HorizontalDivider(Modifier.padding(top = 8.dp)) }
            item {
                Text(
                    "OM",
                    style = MaterialTheme.typography.labelSmall,
                    color = MaterialTheme.colorScheme.primary,
                    modifier = Modifier.padding(top = 12.dp, bottom = 4.dp),
                )
            }
            item {
                Row(Modifier.fillMaxWidth().padding(vertical = 8.dp), verticalAlignment = Alignment.CenterVertically) {
                    Text("Chat OMP OMP", style = MaterialTheme.typography.bodyMedium, modifier = Modifier.weight(1f))
                    Text(
                        "v" + BuildConfig.VERSION_NAME,
                        style = MaterialTheme.typography.bodySmall,
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                    )
                }
            }
            item {
                Row(Modifier.fillMaxWidth().padding(vertical = 8.dp), verticalAlignment = Alignment.CenterVertically) {
                    Text("Bridge", style = MaterialTheme.typography.bodyMedium, modifier = Modifier.weight(1f))
                    Text(
                        if (vm.bridgeVersion.isBlank()) "ukjent" else "v" + vm.bridgeVersion,
                        style = MaterialTheme.typography.bodySmall,
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                    )
                }
            }
            item { TextButton(onClick = { vm.checkUpdate() }) { Text("Se etter oppdatering") } }
            item {
                if (vm.updateStatus.isNotBlank()) {
                    Text(
                        vm.updateStatus,
                        style = MaterialTheme.typography.bodySmall,
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                    )
                }
            }        }
    }
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun ProvidersScreen(vm: AppViewModel, onBack: () -> Unit) {
    LaunchedEffect(Unit) { vm.loadProviders() }
    var showAdd by remember { mutableStateOf(false) }
    Scaffold(
        containerColor = MaterialTheme.colorScheme.background,
        topBar = { ToolBar(t("Modeller og nøkler", "Models and keys"), onBack) },
    ) { padding ->
        LazyColumn(
            Modifier.padding(padding).fillMaxSize(),
            contentPadding = PaddingValues(16.dp),
        ) {
            item {
                Text(
                    t("SKYLEVERANDØRER", "CLOUD PROVIDERS"),
                    style = MaterialTheme.typography.labelSmall,
                    color = MaterialTheme.colorScheme.primary,
                    modifier = Modifier.padding(bottom = 4.dp),
                )
            }
            if (vm.providers.isEmpty()) {
                item { Muted(t("Ingen leverandører ennå.", "No providers yet.")) }
            }
            items(vm.providers) { provider ->
                Row(Modifier.fillMaxWidth().padding(vertical = 8.dp), verticalAlignment = Alignment.CenterVertically) {
                    Column(Modifier.weight(1f)) {
                        Text(
                            provider.optString("provider"),
                            style = MaterialTheme.typography.bodyMedium,
                        )
                        Text(
                            (if (provider.optBoolean("hasKey")) "✓ " + t("nøkkel satt", "key set") + " " + provider.optString("hint") else "✗ " + t("mangler nøkkel", "no key")),
                            style = MaterialTheme.typography.labelSmall,
                            color = MaterialTheme.colorScheme.onSurfaceVariant,
                            maxLines = 1,
                        )
                    }
                    IconButton(onClick = { vm.deleteProvider(provider.optString("id")) }) {
                        Icon(
                            Icons.Filled.Delete,
                            contentDescription = "Slett",
                            tint = MaterialTheme.colorScheme.onSurfaceVariant,
                            modifier = Modifier.size(20.dp),
                        )
                    }
                }
            }
            item {
                TextButton(onClick = { showAdd = true }) {
                    Text(t("+ Legg til leverandør", "+ Add provider"))
                }
            }
            item { HorizontalDivider(Modifier.padding(vertical = 10.dp)) }
            item {
                Text(
                    t("LOKALE MODELLER", "LOCAL MODELS"),
                    style = MaterialTheme.typography.labelSmall,
                    color = MaterialTheme.colorScheme.primary,
                    modifier = Modifier.padding(bottom = 4.dp),
                )
            }
            item { Muted(t("Lokal modellstyring kommer i neste oppdatering.", "Local model controls arrive in the next update.")) }
        }
    }
    if (showAdd) {
        var id by remember { mutableStateOf("") }
        var key by remember { mutableStateOf("") }
        var baseUrl by remember { mutableStateOf("") }
        AlertDialog(
            onDismissRequest = { showAdd = false },
            title = { Text(t("Legg til leverandør", "Add provider")) },
            text = {
                Column {
                    OutlinedTextField(
                        value = id,
                        onValueChange = { id = it },
                        label = { Text(t("Leverandør (f.eks. deepseek)", "Provider (e.g. deepseek)")) },
                        singleLine = true,
                        modifier = Modifier.fillMaxWidth(),
                    )
                    OutlinedTextField(
                        value = key,
                        onValueChange = { key = it },
                        label = { Text(t("API-nøkkel", "API key")) },
                        singleLine = true,
                        modifier = Modifier.fillMaxWidth().padding(top = 6.dp),
                    )
                    OutlinedTextField(
                        value = baseUrl,
                        onValueChange = { baseUrl = it },
                        label = { Text(t("Base-URL (valgfritt)", "Base URL (optional)")) },
                        singleLine = true,
                        modifier = Modifier.fillMaxWidth().padding(top = 6.dp),
                    )
                }
            },
            confirmButton = {
                TextButton(
                    onClick = { vm.addProvider(id, key, baseUrl); showAdd = false },
                    enabled = id.isNotBlank() && key.isNotBlank(),
                ) { Text(t("Lagre", "Save")) }
            },
            dismissButton = { TextButton(onClick = { showAdd = false }) { Text(t("Avbryt", "Cancel")) } },
        )
    }
}