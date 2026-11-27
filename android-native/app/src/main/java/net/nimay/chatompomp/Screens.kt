package net.nimay.chatompomp

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.imePadding
import androidx.compose.foundation.layout.navigationBarsPadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.statusBarsPadding
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.lazy.rememberLazyListState
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.BasicTextField
import androidx.compose.foundation.text.KeyboardActions
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Add
import androidx.compose.material.icons.filled.Send
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material.icons.filled.Check
import androidx.compose.material.icons.filled.Close
import androidx.compose.material.icons.filled.Menu
import androidx.compose.material.icons.filled.Refresh
import androidx.compose.material.icons.filled.Settings
import androidx.compose.material.icons.filled.Clear
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.DrawerValue
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.ModalBottomSheet
import androidx.compose.material3.ModalDrawerSheet
import androidx.compose.material3.ModalNavigationDrawer
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Surface
import androidx.compose.material3.Switch
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.material3.TopAppBar
import androidx.compose.material3.TopAppBarDefaults
import androidx.compose.material3.rememberDrawerState
import androidx.compose.material3.rememberModalBottomSheetState
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.SolidColor
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.ImeAction
import androidx.compose.ui.platform.LocalSoftwareKeyboardController
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import kotlinx.coroutines.launch

// ------------------------------------------------------------------ pairing

@Composable
fun PairingScreen(vm: AppViewModel) {
    var link by remember { mutableStateOf("") }
    var working by remember { mutableStateOf(false) }
    var scanning by remember { mutableStateOf(false) }
    val scope = rememberCoroutineScope()

    if (scanning) {
        QrScanner(
            onFound = { text ->
                scanning = false
                scope.launch { vm.pair(text).onFailure { vm.reportError(it.message ?: "Paring feilet.") } }
            },
            onCancel = { scanning = false },
        )
        return
    }

    Surface(Modifier.fillMaxSize(), color = MaterialTheme.colorScheme.background) {
        Column(
            Modifier.fillMaxSize().padding(28.dp),
            verticalArrangement = Arrangement.Center,
            horizontalAlignment = Alignment.CenterHorizontally,
        ) {
            Surface(shape = RoundedCornerShape(16.dp), color = MaterialTheme.colorScheme.primary) {
                Text("O", modifier = Modifier.padding(horizontal = 16.dp, vertical = 8.dp),
                    style = MaterialTheme.typography.headlineSmall, fontWeight = FontWeight.Bold,
                    color = MaterialTheme.colorScheme.onPrimary)
            }
            Spacer(Modifier.height(18.dp))
            Text("Chat OMP OMP", style = MaterialTheme.typography.headlineMedium, fontWeight = FontWeight.Bold)
            Spacer(Modifier.height(8.dp))
            Text(
                "Åpne OMP Desktop, vis QR-koden (eller kopier paringslenken) og lim den inn her.",
                color = MaterialTheme.colorScheme.onSurfaceVariant, style = MaterialTheme.typography.bodyMedium,
            )
            Spacer(Modifier.height(20.dp))
            Surface(
                shape = RoundedCornerShape(14.dp),
                color = MaterialTheme.colorScheme.surfaceVariant,
                modifier = Modifier.fillMaxWidth().clickable { scanning = true },
            ) {
                Box(Modifier.padding(vertical = 15.dp), contentAlignment = Alignment.Center) {
                    Text("Skann QR-kode", fontWeight = FontWeight.SemiBold)
                }
            }
            Spacer(Modifier.height(22.dp))
            BasicTextField(
                value = link,
                onValueChange = { link = it },
                singleLine = false,
                textStyle = TextStyle(color = MaterialTheme.colorScheme.onSurface, fontSize = 14.sp),
                cursorBrush = SolidColor(MaterialTheme.colorScheme.primary),
                modifier = Modifier
                    .fillMaxWidth()
                    .clip(RoundedCornerShape(14.dp))
                    .background(MaterialTheme.colorScheme.surface)
                    .border(1.dp, MaterialTheme.colorScheme.outline, RoundedCornerShape(14.dp))
                    .padding(14.dp),
                decorationBox = { inner ->
                    if (link.isBlank()) Text("chatomp://pair/…", color = MaterialTheme.colorScheme.onSurfaceVariant)
                    inner()
                },
            )
            Spacer(Modifier.height(14.dp))
            if (vm.error.isNotBlank()) {
                Text(vm.error ?: "", color = MaterialTheme.colorScheme.error, style = MaterialTheme.typography.bodySmall)
                Spacer(Modifier.height(8.dp))
            }
            Surface(
                shape = RoundedCornerShape(14.dp),
                color = MaterialTheme.colorScheme.primary,
                modifier = Modifier.fillMaxWidth().clickable {
                    if (link.isNotBlank() && !working) {
                        working = true
                        scope.launch {
                            vm.pair(link.trim())
                            working = false
                        }
                    }
                },
            ) {
                Box(Modifier.padding(vertical = 14.dp), contentAlignment = Alignment.Center) {
                    if (working) CircularProgressIndicator(modifier = Modifier.size(18.dp), strokeWidth = 2.dp)
                    else Text("Koble til", color = MaterialTheme.colorScheme.onPrimary, fontWeight = FontWeight.SemiBold)
                }
            }
        }
    }
}

// ------------------------------------------------------------------ main app

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun MainApp(vm: AppViewModel) {
    val drawerState = rememberDrawerState(DrawerValue.Closed)
    val scope = rememberCoroutineScope()
    var showNewChat by remember { mutableStateOf(false) }
    var screen by remember { mutableStateOf("chat") }
    LaunchedEffect(Unit) { vm.refresh() }

    if (screen == "plugins") {
        PluginsScreen(vm, onBack = { screen = "chat" })
        return
    }

    ModalNavigationDrawer(
        drawerState = drawerState,
        drawerContent = {
            ModalDrawerSheet(drawerContainerColor = MaterialTheme.colorScheme.surface) {
                DrawerContent(vm, drawerState, scope)
            }
        },
    ) {
        Scaffold(
            containerColor = MaterialTheme.colorScheme.background,
            topBar = {
                TopAppBar(
                    colors = TopAppBarDefaults.topAppBarColors(containerColor = MaterialTheme.colorScheme.background),
                    navigationIcon = {
                        IconButton(onClick = { scope.launch { drawerState.open() } }) {
                            Icon(Icons.Filled.Menu, contentDescription = "Samtaler")
                        }
                    },
                    title = {
                        Column {
                            Text(vm.activeTitle.ifBlank { "Chat OMP OMP" }, fontWeight = FontWeight.SemiBold)
                            val project = vm.activeCwd.trimEnd('\\', '/').split('\\', '/').lastOrNull().orEmpty()
                            if (project.isNotBlank()) Text(project, style = MaterialTheme.typography.labelSmall,
                                color = MaterialTheme.colorScheme.onSurfaceVariant)
                        }
                    },
                    actions = {
                        IconButton(onClick = { vm.loadProjects(); showNewChat = true }) {
                            Icon(Icons.Filled.Add, contentDescription = "Ny samtale")
                        }
                    },
                )
            },
            bottomBar = { ComposerBar(vm, onOpenPlugins = { screen = "plugins" }) },
        ) { padding ->
            ChatList(vm, Modifier.padding(padding))
        }
    }

    if (showNewChat) NewChatSheet(vm, onDismiss = { showNewChat = false })
}

@Composable
private fun DrawerContent(vm: AppViewModel, drawerState: androidx.compose.material3.DrawerState, scope: kotlinx.coroutines.CoroutineScope) {
    Column(Modifier.fillMaxSize().statusBarsPadding().padding(14.dp)) {
        Row(verticalAlignment = Alignment.CenterVertically) {
            Text("Samtaler", style = MaterialTheme.typography.titleMedium, fontWeight = FontWeight.Bold)
            Spacer(Modifier.weight(1f))
            TextButton(onClick = { vm.forget() }) { Text("Koble fra") }
        }
        Spacer(Modifier.height(8.dp))
        if (vm.sessions.isEmpty()) {
            Text("Ingen samtaler ennå.", color = MaterialTheme.colorScheme.onSurfaceVariant)
        }
        LazyColumn(Modifier.fillMaxSize()) {
            val groups = vm.sessions.groupBy { it.cwd }
            for ((cwd, list) in groups) {
                item(key = "h-$cwd") {
                    Text(
                        cwd.trimEnd('\\', '/').split('\\', '/').lastOrNull().orEmpty(),
                        style = MaterialTheme.typography.labelMedium,
                        color = MaterialTheme.colorScheme.primary,
                        modifier = Modifier.padding(top = 12.dp, bottom = 4.dp),
                    )
                }
                items(list, key = { it.file }) { session ->
                    Row(
                        Modifier
                            .fillMaxWidth()
                            .clip(RoundedCornerShape(12.dp))
                            .clickable {
                                vm.openSession(session)
                                scope.launch { drawerState.close() }
                            }
                            .padding(vertical = 10.dp, horizontal = 8.dp),
                        verticalAlignment = Alignment.CenterVertically,
                    ) {
                        Column(Modifier.weight(1f)) {
                            Text(session.title, maxLines = 1, style = MaterialTheme.typography.bodyMedium)
                            Text(
                                session.model.ifBlank { "${session.messageCount} meldinger" },
                                maxLines = 1, style = MaterialTheme.typography.labelSmall,
                                color = MaterialTheme.colorScheme.onSurfaceVariant,
                            )
                        }
                        if (session.activity == "working") {
                            CircularProgressIndicator(Modifier.size(14.dp), strokeWidth = 2.dp)
                        }
                    }
                }
            }
        }
    }
}

// ------------------------------------------------------------------ chat

@Composable
private fun ChatList(vm: AppViewModel, modifier: Modifier = Modifier) {
    val listState = rememberLazyListState()
    LaunchedEffect(vm.messages.size, vm.messages.lastOrNull()?.text?.length) {
        if (vm.messages.isNotEmpty()) listState.animateScrollToItem(vm.messages.size - 1)
    }
    LazyColumn(
        state = listState,
        modifier = modifier.fillMaxSize().padding(horizontal = 14.dp),
        verticalArrangement = Arrangement.spacedBy(10.dp),
        contentPadding = androidx.compose.foundation.layout.PaddingValues(vertical = 12.dp),
    ) {
        if (vm.activeFile.isBlank()) {
            item {
                Column(Modifier.fillMaxWidth().padding(top = 60.dp), horizontalAlignment = Alignment.CenterHorizontally) {
                    Text("Hva bygger vi?", style = MaterialTheme.typography.headlineSmall, fontWeight = FontWeight.Bold)
                    Spacer(Modifier.height(6.dp))
                    Text("Velg en samtale fra menyen for å begynne.", color = MaterialTheme.colorScheme.onSurfaceVariant)
                }
            }
        }
        items(vm.messages, key = { it.id + it.role }) { entry -> EntryRow(entry) }
        if (vm.error.isNotBlank()) {
            item {
                Row(Modifier.fillMaxWidth().clip(RoundedCornerShape(12.dp))
                    .background(MaterialTheme.colorScheme.error.copy(alpha = 0.12f)).padding(10.dp),
                    verticalAlignment = Alignment.CenterVertically) {
                    Text(vm.error, color = MaterialTheme.colorScheme.error, modifier = Modifier.weight(1f),
                        style = MaterialTheme.typography.bodySmall)
                    TextButton(onClick = { vm.dismissError() }) { Text("Lukk") }
                }
            }
        }
    }
}

@Composable
private fun EntryRow(entry: Entry) {
    when (entry.role) {
        "user" -> Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.End) {
            Surface(
                color = MaterialTheme.colorScheme.primaryContainer,
                shape = RoundedCornerShape(18.dp),
                modifier = Modifier.fillMaxWidth(0.86f),
            ) {
                Text(entry.text, modifier = Modifier.padding(horizontal = 14.dp, vertical = 10.dp),
                    color = MaterialTheme.colorScheme.onPrimaryContainer)
            }
        }
        "tool" -> ToolRow(entry)
        else -> Column(Modifier.fillMaxWidth()) {
            if (entry.thinking.isNotBlank()) {
                var expanded by remember { mutableStateOf(false) }
                val showThinking = expanded || entry.streaming
                Text(
                    if (entry.streaming) "Resonnering · ${entry.thinking.length} tegn"
                    else if (expanded) "Skjul resonnering" else "Vis resonnering",
                    style = MaterialTheme.typography.labelSmall,
                    color = MaterialTheme.colorScheme.primary,
                    modifier = Modifier.clickable { expanded = !expanded }.padding(vertical = 4.dp),
                )
                if (showThinking) {
                    Text(entry.thinking, style = MaterialTheme.typography.bodySmall,
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                        modifier = Modifier.clip(RoundedCornerShape(10.dp))
                            .background(MaterialTheme.colorScheme.surface).padding(10.dp).fillMaxWidth())
                }
            }
            MarkdownText(entry.text)
            if (entry.streaming) {
                Text("▍", color = MaterialTheme.colorScheme.primary, style = MaterialTheme.typography.bodySmall)
            }
        }
    }
}

@Composable
private fun ToolRow(entry: Entry) {
    var open by remember { mutableStateOf(false) }
    Surface(
        color = MaterialTheme.colorScheme.surface,
        shape = RoundedCornerShape(12.dp),
        modifier = Modifier.fillMaxWidth().clickable { open = !open },
    ) {
        Column(Modifier.padding(10.dp)) {
            Row(verticalAlignment = Alignment.CenterVertically) {
                Text(
                    entry.toolName.ifBlank { "Verktøy" } + (entry.command.takeIf { it.isNotBlank() }?.let { " · " + it.lineSequence().first() } ?: ""),
                    style = MaterialTheme.typography.labelMedium,
                    color = if (entry.isError) MaterialTheme.colorScheme.error else MaterialTheme.colorScheme.onSurfaceVariant,
                    maxLines = 1,
                    modifier = Modifier.weight(1f),
                )
                if (entry.streaming) CircularProgressIndicator(Modifier.size(12.dp), strokeWidth = 2.dp)
            }
            if (open && entry.text.isNotBlank()) {
                Spacer(Modifier.height(6.dp))
                Text(entry.text.take(4000), style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant)
            }
        }
    }
}

// ------------------------------------------------------------------ composer

@OptIn(ExperimentalMaterial3Api::class)
@Composable
private fun ComposerBar(vm: AppViewModel, onOpenPlugins: () -> Unit = {}) {
    var text by remember { mutableStateOf("") }
    var showSettings by remember { mutableStateOf(false) }
    var showModels by remember { mutableStateOf(false) }
    var light by remember { mutableStateOf(false) }
    var mode by remember { mutableStateOf("build") }
    val scope = rememberCoroutineScope()
    val keyboard = LocalSoftwareKeyboardController.current

    Column(Modifier.fillMaxWidth().imePadding().navigationBarsPadding().padding(horizontal = 10.dp, vertical = 4.dp)) {
        val metrics = vm.metricsLabel()
        if (vm.stream.active || metrics.isNotBlank()) {
            Row(
                Modifier.fillMaxWidth().padding(horizontal = 6.dp, vertical = 6.dp),
                verticalAlignment = Alignment.CenterVertically,
            ) {
                CircularProgressIndicator(Modifier.size(12.dp), strokeWidth = 2.dp)
                Spacer(Modifier.width(8.dp))
                Text(metrics.ifBlank { vm.stream.phase.ifBlank { "OMP arbeider" } },
                    style = MaterialTheme.typography.labelSmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                    maxLines = 1)
                if (metrics.isBlank() && vm.stream.tokensPerSecond > 0) {
                    Spacer(Modifier.width(8.dp))
                    Text("${vm.stream.tokensPerSecond.toInt()} tok/s", style = MaterialTheme.typography.labelSmall,
                        color = MaterialTheme.colorScheme.onSurfaceVariant)
                }
            }
        }
        Surface(
            shape = RoundedCornerShape(26.dp),
            color = MaterialTheme.colorScheme.surface,
            border = androidx.compose.foundation.BorderStroke(1.dp, MaterialTheme.colorScheme.outline),
            modifier = Modifier.fillMaxWidth(),
        ) {
            Column(Modifier.padding(horizontal = 10.dp, vertical = 8.dp)) {
                BasicTextField(
                    value = text,
                    onValueChange = { text = it },
                    maxLines = 6,
                    textStyle = TextStyle(color = MaterialTheme.colorScheme.onSurface, fontSize = 15.sp),
                    cursorBrush = SolidColor(MaterialTheme.colorScheme.primary),
                    keyboardOptions = KeyboardOptions(imeAction = ImeAction.Default),
                    modifier = Modifier.fillMaxWidth().padding(horizontal = 4.dp, vertical = 4.dp),
                    decorationBox = { inner ->
                        if (text.isBlank()) Text("Skriv en oppgave …", color = MaterialTheme.colorScheme.onSurfaceVariant, fontSize = 15.sp)
                        inner()
                    },
                )
                Spacer(Modifier.height(4.dp))
                Row(verticalAlignment = Alignment.CenterVertically) {
                    IconButton(onClick = { }) { Icon(Icons.Filled.Add, contentDescription = "Legg ved", tint = MaterialTheme.colorScheme.onSurfaceVariant) }
                    Surface(
                        shape = RoundedCornerShape(999.dp),
                        color = MaterialTheme.colorScheme.surfaceVariant,
                        modifier = Modifier.clickable { vm.loadModels(); showModels = true },
                    ) {
                        Text(
                            vm.activeModelName.ifBlank { "Velg modell" },
                            modifier = Modifier.padding(horizontal = 12.dp, vertical = 6.dp),
                            style = MaterialTheme.typography.labelMedium,
                            maxLines = 1,
                        )
                    }
                    Spacer(Modifier.weight(1f))
                    IconButton(onClick = { showSettings = true }) {
                        Icon(Icons.Filled.Settings, contentDescription = "Innstillinger", tint = MaterialTheme.colorScheme.onSurfaceVariant)
                    }
                    Spacer(Modifier.width(2.dp))
                    Box(
                        modifier = Modifier
                            .size(36.dp)
                            .clip(CircleShape)
                            .background(MaterialTheme.colorScheme.primary)
                            .clickable {
                                if (vm.busy) vm.stop() else {
                                    vm.send(text)
                                    text = ""
                                    keyboard?.hide()
                                }
                            },
                        contentAlignment = Alignment.Center,
                    ) {
                        Icon(
                            if (vm.busy) Icons.Filled.Clear else Icons.Filled.Send,
                            contentDescription = if (vm.busy) "Stopp" else "Send",
                            tint = MaterialTheme.colorScheme.onPrimary,
                            modifier = Modifier.size(18.dp),
                        )
                    }
                }
            }
        }
    }

    if (showSettings) {
        val sheetState = rememberModalBottomSheetState()
        ModalBottomSheet(onDismissRequest = { showSettings = false }, sheetState = sheetState,
            containerColor = MaterialTheme.colorScheme.surface) {
            Column(Modifier.padding(horizontal = 20.dp, vertical = 8.dp)) {
                Text("Samtaleinnstillinger", style = MaterialTheme.typography.titleMedium, fontWeight = FontWeight.Bold)
                Spacer(Modifier.height(16.dp))
                Text("KONTEKST", style = MaterialTheme.typography.labelSmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
                Row(Modifier.fillMaxWidth().padding(vertical = 6.dp), verticalAlignment = Alignment.CenterVertically) {
                    Text("Light context", modifier = Modifier.weight(1f))
                    Switch(checked = light, onCheckedChange = { light = it })
                }
                HorizontalDivider()
                Text("ARBEIDSMODUS", style = MaterialTheme.typography.labelSmall, color = MaterialTheme.colorScheme.onSurfaceVariant,
                    modifier = Modifier.padding(top = 12.dp))
                Row(Modifier.fillMaxWidth().padding(vertical = 6.dp), horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                    for (option in listOf("chat" to "Chat", "plan" to "Plan", "build" to "Bygg")) {
                        val selected = mode == option.first
                        Surface(
                            shape = RoundedCornerShape(12.dp),
                            color = if (selected) MaterialTheme.colorScheme.primary else MaterialTheme.colorScheme.surfaceVariant,
                            modifier = Modifier.weight(1f).clickable { mode = option.first },
                        ) {
                            Text(option.second, modifier = Modifier.padding(vertical = 9.dp), textAlign = androidx.compose.ui.text.style.TextAlign.Center,
                                color = if (selected) MaterialTheme.colorScheme.onPrimary else MaterialTheme.colorScheme.onSurface,
                                style = MaterialTheme.typography.bodyMedium)
                        }
                    }
                }
                HorizontalDivider()
                Text("UTVIDELSER", style = MaterialTheme.typography.labelSmall, color = MaterialTheme.colorScheme.onSurfaceVariant,
                    modifier = Modifier.padding(top = 12.dp))
                Row(
                    Modifier.fillMaxWidth()
                        .clip(RoundedCornerShape(12.dp))
                        .clickable { showSettings = false; onOpenPlugins() }
                        .padding(vertical = 12.dp),
                    verticalAlignment = Alignment.CenterVertically,
                ) {
                    Text("Plugins og skills", modifier = Modifier.weight(1f))
                    Text("›", style = MaterialTheme.typography.titleMedium, color = MaterialTheme.colorScheme.onSurfaceVariant)
                }
                Spacer(Modifier.height(20.dp))
            }
        }
    }

    if (showModels) ModelSheet(vm, onDismiss = { showModels = false })
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
private fun ModelSheet(vm: AppViewModel, onDismiss: () -> Unit) {
    val sheetState = rememberModalBottomSheetState()
    ModalBottomSheet(onDismissRequest = onDismiss, sheetState = sheetState, containerColor = MaterialTheme.colorScheme.surface) {
        Column(Modifier.padding(horizontal = 20.dp, vertical = 8.dp)) {
            Text("Velg modell", style = MaterialTheme.typography.titleMedium, fontWeight = FontWeight.Bold)
            Spacer(Modifier.height(12.dp))
            if (vm.models.isEmpty()) {
                Text("Henter modeller …", color = MaterialTheme.colorScheme.onSurfaceVariant, style = MaterialTheme.typography.bodySmall)
            }
            LazyColumn(Modifier.heightIn(max = 420.dp)) {
                items(vm.models) { model ->
                    val provider = model.optString("provider")
                    val id = model.optString("id")
                    val name = model.optString("name").ifBlank { id }
                    val current = name == vm.activeModelName
                    Row(
                        Modifier.fillMaxWidth().clickable { vm.chooseModel(provider, id, name); onDismiss() }.padding(vertical = 11.dp),
                        verticalAlignment = Alignment.CenterVertically,
                    ) {
                        Column(Modifier.weight(1f)) {
                            Text(name, style = MaterialTheme.typography.bodyMedium)
                            Text("$provider/$id", style = MaterialTheme.typography.labelSmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
                        }
                        if (current) {
                            Icon(Icons.Filled.Check, contentDescription = null, tint = MaterialTheme.colorScheme.primary,
                                modifier = Modifier.size(18.dp))
                        }
                    }
                }
            }
            Spacer(Modifier.height(16.dp))
        }
    }
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
private fun NewChatSheet(vm: AppViewModel, onDismiss: () -> Unit) {
    val sheetState = rememberModalBottomSheetState()
    ModalBottomSheet(onDismissRequest = onDismiss, sheetState = sheetState, containerColor = MaterialTheme.colorScheme.surface) {
        Column(Modifier.padding(horizontal = 20.dp, vertical = 8.dp)) {
            Text("Ny samtale", style = MaterialTheme.typography.titleMedium, fontWeight = FontWeight.Bold)
            Spacer(Modifier.height(4.dp))
            Text("Velg prosjektmappen samtalen skal ligge i.", color = MaterialTheme.colorScheme.onSurfaceVariant,
                style = MaterialTheme.typography.bodySmall)
            Spacer(Modifier.height(12.dp))
            if (vm.projects.isEmpty()) {
                Text("Ingen prosjekter funnet. Åpne en mappe i OMP Desktop først.",
                    color = MaterialTheme.colorScheme.onSurfaceVariant, style = MaterialTheme.typography.bodySmall)
            }
            LazyColumn(Modifier.heightIn(max = 400.dp)) {
                items(vm.projects) { project ->
                    Row(
                        Modifier.fillMaxWidth().clickable { vm.newSession(project.path); onDismiss() }.padding(vertical = 11.dp),
                        verticalAlignment = Alignment.CenterVertically,
                    ) {
                        Column(Modifier.weight(1f)) {
                            Text(project.name, style = MaterialTheme.typography.bodyMedium)
                            Text(project.path, style = MaterialTheme.typography.labelSmall,
                                color = MaterialTheme.colorScheme.onSurfaceVariant, maxLines = 1)
                        }
                        Text("${project.sessionCount}", style = MaterialTheme.typography.labelSmall,
                            color = MaterialTheme.colorScheme.onSurfaceVariant)
                    }
                }
            }
            Spacer(Modifier.height(16.dp))
        }
    }
}

// ------------------------------------------------------------------ plugins

@OptIn(ExperimentalMaterial3Api::class)
@Composable
private fun PluginsScreen(vm: AppViewModel, onBack: () -> Unit) {
    LaunchedEffect(Unit) { vm.loadPlugins() }
    Scaffold(
        containerColor = MaterialTheme.colorScheme.background,
        topBar = {
            TopAppBar(
                colors = TopAppBarDefaults.topAppBarColors(containerColor = MaterialTheme.colorScheme.background),
                navigationIcon = {
                    IconButton(onClick = onBack) {
                        Icon(Icons.AutoMirrored.Filled.ArrowBack, contentDescription = "Tilbake")
                    }
                },
                title = { Text("Plugins og skills", fontWeight = FontWeight.SemiBold) },
                actions = {
                    IconButton(onClick = { vm.loadPlugins() }) {
                        Icon(Icons.Filled.Refresh, contentDescription = "Oppdater")
                    }
                },
            )
        },
    ) { padding ->
        val data = vm.plugins
        when {
            vm.activeCwd.isBlank() -> Box(
                Modifier.padding(padding).fillMaxSize().padding(24.dp),
                contentAlignment = Alignment.Center,
            ) {
                Text(
                    "Åpne en samtale først for å se plugins og skills.",
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                    textAlign = androidx.compose.ui.text.style.TextAlign.Center,
                )
            }
            data == null -> Box(
                Modifier.padding(padding).fillMaxSize().padding(24.dp),
                contentAlignment = Alignment.Center,
            ) {
                if (vm.pluginsBusy) CircularProgressIndicator()
                else Text("Ingen data.", color = MaterialTheme.colorScheme.onSurfaceVariant)
            }
            else -> {
                val skills = jsonObjects(data.optJSONArray("skills"))
                val builtIn = jsonObjects(data.optJSONArray("builtIn"))
                val packages = jsonObjects(data.optJSONArray("npm")) + jsonObjects(data.optJSONArray("marketplace"))
                LazyColumn(
                    modifier = Modifier.padding(padding).fillMaxSize(),
                    contentPadding = androidx.compose.foundation.layout.PaddingValues(horizontal = 16.dp, vertical = 6.dp),
                    verticalArrangement = Arrangement.spacedBy(2.dp),
                ) {
                    item { SectionHeader("SKILLS") }
                    if (skills.isEmpty()) item { Hint("OMP fant ingen skills.") }
                    items(skills) { SkillRow(vm, it) }
                    item { SectionHeader("PROSJEKTUTVIDELSER") }
                    if (builtIn.isEmpty()) item { Hint("Ingen medfølgende plugins.") }
                    items(builtIn) { PluginRow(vm, it) }
                    item { SectionHeader("INSTALLERTE PAKKER") }
                    if (packages.isEmpty()) item { Hint("Ingen eksterne pakker installert.") }
                    items(packages) { PackageRow(it) }
                }
            }
        }
    }
}

private fun jsonObjects(array: org.json.JSONArray?): List<org.json.JSONObject> {
    if (array == null) return emptyList()
    return (0 until array.length()).mapNotNull { array.optJSONObject(it) }
}

@Composable
private fun SectionHeader(text: String) {
    Text(
        text,
        style = MaterialTheme.typography.labelSmall,
        color = MaterialTheme.colorScheme.primary,
        modifier = Modifier.padding(top = 12.dp, bottom = 4.dp),
    )
}

@Composable
private fun Hint(text: String) {
    Text(
        text,
        style = MaterialTheme.typography.bodySmall,
        color = MaterialTheme.colorScheme.onSurfaceVariant,
        modifier = Modifier.padding(vertical = 6.dp),
    )
}

@Composable
private fun SkillRow(vm: AppViewModel, skill: org.json.JSONObject) {
    val name = skill.optString("name")
    val detail = skill.optString("detail")
    val enabled = skill.optBoolean("enabled")
    val scope = skill.optString("scope").ifBlank { "project" }
    Row(
        Modifier.fillMaxWidth().padding(vertical = 7.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Column(Modifier.weight(1f).padding(end = 12.dp)) {
            Text(name, style = MaterialTheme.typography.bodyMedium)
            if (detail.isNotBlank()) {
                Text(
                    detail,
                    style = MaterialTheme.typography.labelSmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                    maxLines = 2,
                )
            }
        }
        Switch(checked = enabled, onCheckedChange = { vm.toggleSkill(name, scope, it) })
    }
}

@Composable
private fun PluginRow(vm: AppViewModel, plugin: org.json.JSONObject) {
    val id = plugin.optString("id").ifBlank { plugin.optString("name") }
    val name = plugin.optString("name").ifBlank { id }
    val description = plugin.optString("description")
    val enabled = plugin.optBoolean("enabled")
    val scope = plugin.optString("scope")
    Row(
        Modifier.fillMaxWidth().padding(vertical = 7.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Column(Modifier.weight(1f).padding(end = 12.dp)) {
            Text(name, style = MaterialTheme.typography.bodyMedium)
            if (description.isNotBlank()) {
                Text(
                    description,
                    style = MaterialTheme.typography.labelSmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                    maxLines = 2,
                )
            }
        }
        Switch(checked = enabled, onCheckedChange = { vm.togglePlugin(id, it, scope) })
    }
}

@Composable
private fun PackageRow(pkg: org.json.JSONObject) {
    val name = pkg.optString("name").ifBlank { pkg.optString("packageName") }
    val version = pkg.optString("version")
    val status = pkg.optString("status")
    Row(Modifier.fillMaxWidth().padding(vertical = 7.dp), verticalAlignment = Alignment.CenterVertically) {
        Column(Modifier.weight(1f)) {
            Text(name.ifBlank { "Pakke" }, style = MaterialTheme.typography.bodyMedium)
            val sub = listOf(version, status).filter { it.isNotBlank() }.joinToString(" · ")
            if (sub.isNotBlank()) {
                Text(sub, style = MaterialTheme.typography.labelSmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
            }
        }
    }
}
