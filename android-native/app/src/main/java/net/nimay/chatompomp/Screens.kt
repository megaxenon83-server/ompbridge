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
import androidx.compose.foundation.lazy.LazyRow
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
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.DrawerValue
import androidx.compose.material3.DropdownMenu
import androidx.compose.material3.DropdownMenuItem
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.ModalBottomSheet
import androidx.compose.material3.ModalDrawerSheet
import androidx.compose.material3.ModalNavigationDrawer
import androidx.compose.material3.OutlinedTextField
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
import androidx.compose.runtime.mutableStateMapOf
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
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.input.ImeAction
import androidx.compose.ui.platform.LocalSoftwareKeyboardController
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.platform.LocalClipboardManager
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
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
    vm.approval?.let { ApprovalDialog(vm, it) }


    when (screen) {
        "plugins" -> { PluginsScreen(vm, onBack = { screen = "chat" }); return }
        "projects" -> { ProjectsScreen(vm, onBack = { screen = "chat" }); return }
        "tools" -> { ToolsScreen(onBack = { screen = "chat" }, onOpen = { screen = it }); return }
        "files" -> { FilesScreen(vm, onBack = { screen = "tools" }); return }
        "git" -> { GitScreen(vm, onBack = { screen = "tools" }); return }
        "terminal" -> { TerminalScreen(vm, onBack = { screen = "tools" }); return }
        "devices" -> { DevicesScreen(vm, onBack = { screen = "tools" }); return }
        "voice" -> { VoiceScreen(vm, onBack = { screen = "tools" }); return }
        "wol" -> { WolScreen(vm, onBack = { screen = "tools" }); return }
    }

    ModalNavigationDrawer(
        drawerState = drawerState,
        drawerContent = {
            ModalDrawerSheet(drawerContainerColor = MaterialTheme.colorScheme.surface) {
                DrawerContent(vm, drawerState, scope, onOpenScreen = { screen = it }, onNewChat = { showNewChat = true })
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
                        IconButton(onClick = { vm.regenerate() }, enabled = !vm.busy && vm.messages.any { it.role == "user" }) {
                            Icon(Icons.Filled.Refresh, contentDescription = "Regenerer")
                        }
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
private fun sessionGroup(updatedAt: Long): String {
    val now = System.currentTimeMillis()
    val day = 86_400_000L
    return when {
        updatedAt >= now - day -> "I dag"
        updatedAt >= now - 2 * day -> "I går"
        updatedAt >= now - 7 * day -> "Siste 7 dager"
        else -> "Eldre"
    }
}

@Composable
private fun ChoiceChip(label: String, selected: Boolean, onClick: () -> Unit) {
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

@Composable
private fun DrawerContent(
    vm: AppViewModel,
    drawerState: androidx.compose.material3.DrawerState,
    scope: kotlinx.coroutines.CoroutineScope,
    onOpenScreen: (String) -> Unit,
    onNewChat: () -> Unit,
) {
    var query by remember { mutableStateOf("") }
    var projectFilter by remember { mutableStateOf<String?>(null) }
    var menuFor by remember { mutableStateOf<String?>(null) }
    var renameTarget by remember { mutableStateOf<SessionInfo?>(null) }

    val projects = vm.sessions.map { it.projectName }.distinct().sorted()
    val filtered = vm.sessions.filter {
        (projectFilter == null || it.projectName == projectFilter) &&
            (query.isBlank() || it.title.contains(query, true))
    }
    val groups = filtered.groupBy { sessionGroup(it.updatedAt) }

    Column(Modifier.fillMaxSize().statusBarsPadding().padding(horizontal = 14.dp, vertical = 10.dp)) {
        Row(verticalAlignment = Alignment.CenterVertically) {
            Text("OMP", style = MaterialTheme.typography.titleLarge, fontWeight = FontWeight.Bold)
            Spacer(Modifier.weight(1f))
            TextButton(onClick = { vm.forget() }) { Text("Koble fra") }
        }
        Surface(
            shape = RoundedCornerShape(14.dp),
            color = MaterialTheme.colorScheme.primary,
            modifier = Modifier.fillMaxWidth().clickable {
                scope.launch { drawerState.close() }
                onNewChat()
            },
        ) {
            Row(Modifier.padding(vertical = 12.dp), horizontalArrangement = Arrangement.Center) {
                Text("+  Ny samtale", color = MaterialTheme.colorScheme.onPrimary, fontWeight = FontWeight.SemiBold)
            }
        }
        OutlinedTextField(
            value = query,
            onValueChange = { query = it },
            placeholder = { Text("Søk i samtaler") },
            singleLine = true,
            modifier = Modifier.fillMaxWidth().padding(top = 8.dp),
        )
        LazyRow(
            horizontalArrangement = Arrangement.spacedBy(6.dp),
            contentPadding = androidx.compose.foundation.layout.PaddingValues(vertical = 8.dp),
        ) {
            item { ChoiceChip("Alle", projectFilter == null) { projectFilter = null } }
            items(projects) { name ->
                ChoiceChip(name, projectFilter == name) {
                    projectFilter = if (projectFilter == name) null else name
                }
            }
        }
        LazyColumn(Modifier.weight(1f).fillMaxWidth()) {
            for (label in listOf("I dag", "I går", "Siste 7 dager", "Eldre")) {
                val list = groups[label] ?: continue
                item(key = "h-$label") {
                    Text(
                        label,
                        style = MaterialTheme.typography.labelSmall,
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                        modifier = Modifier.padding(top = 10.dp, bottom = 4.dp),
                    )
                }
                items(list, key = { it.file }) { session ->
                    Row(
                        Modifier.fillMaxWidth()
                            .clip(RoundedCornerShape(12.dp))
                            .background(if (session.file == vm.activeFile) MaterialTheme.colorScheme.surfaceVariant else Color.Transparent)
                            .clickable {
                                vm.openSession(session)
                                scope.launch { drawerState.close() }
                            }
                            .padding(start = 10.dp, end = 2.dp, top = 8.dp, bottom = 8.dp),
                        verticalAlignment = Alignment.CenterVertically,
                    ) {
                        Column(Modifier.weight(1f)) {
                            Text(session.title, maxLines = 1, style = MaterialTheme.typography.bodyMedium)
                            Text(
                                if (projectFilter == null) session.projectName else session.model.ifBlank { "${session.messageCount} meldinger" },
                                maxLines = 1,
                                style = MaterialTheme.typography.labelSmall,
                                color = MaterialTheme.colorScheme.onSurfaceVariant,
                            )
                        }
                        if (session.activity == "working") {
                            CircularProgressIndicator(Modifier.size(14.dp), strokeWidth = 2.dp)
                        }
                        IconButton(onClick = { menuFor = session.file }) {
                            Text("⋯", style = MaterialTheme.typography.titleMedium,
                                color = MaterialTheme.colorScheme.onSurfaceVariant)
                        }
                        DropdownMenu(expanded = menuFor == session.file, onDismissRequest = { menuFor = null }) {
                            DropdownMenuItem(text = { Text("Døp om") }, onClick = { renameTarget = session; menuFor = null })
                            DropdownMenuItem(text = { Text("Arkiver") }, onClick = { vm.archiveSession(session.file, true); menuFor = null })
                        }
                    }
                }
            }
            if (filtered.isEmpty()) {
                item { Text("Ingen samtaler.", color = MaterialTheme.colorScheme.onSurfaceVariant) }
            }
        }
        HorizontalDivider(Modifier.padding(top = 4.dp))
        Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceEvenly) {
            TextButton(onClick = { onOpenScreen("files") }) { Text("Filer") }
            TextButton(onClick = { onOpenScreen("git") }) { Text("Git") }
            TextButton(onClick = { onOpenScreen("terminal") }) { Text("Terminal") }
            TextButton(onClick = { onOpenScreen("devices") }) { Text("Enheter") }
        }
        Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.Center) {
            TextButton(onClick = { vm.loadRegistry(); onOpenScreen("projects") }) { Text("Prosjekter") }
            TextButton(onClick = { onOpenScreen("tools") }) { Text("Verktøy og innstillinger") }
        }
    }
    renameTarget?.let { target ->
        var name by remember(target.file) { mutableStateOf(target.title) }
        AlertDialog(
            onDismissRequest = { renameTarget = null },
            title = { Text("Døp om samtalen") },
            text = { OutlinedTextField(value = name, onValueChange = { name = it }, label = { Text("Navn") }, singleLine = true) },
            confirmButton = {
                TextButton(onClick = { vm.renameSession(target.file, name); renameTarget = null }, enabled = name.isNotBlank()) {
                    Text("Lagre")
                }
            },
            dismissButton = { TextButton(onClick = { renameTarget = null }) { Text("Avbryt") } },
        )
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
        vm.updateTag?.let { tag ->
            item {
                Surface(
                    shape = RoundedCornerShape(12.dp),
                    color = MaterialTheme.colorScheme.surfaceVariant,
                    modifier = Modifier.fillMaxWidth(),
                ) {
                    Row(Modifier.padding(horizontal = 12.dp, vertical = 6.dp), verticalAlignment = Alignment.CenterVertically) {
                        Text("Ny versjon $tag tilgjengelig", style = MaterialTheme.typography.bodySmall, modifier = Modifier.weight(1f))
                        TextButton(onClick = { vm.dismissUpdate() }) { Text("Lukk") }
                    }
                }
            }
        }
        vm.todoPhases?.let { phases -> item { TodoPanel(phases) } }
        items(vm.messages, key = { it.id + it.role }) { entry -> EntryRow(entry) }
        vm.turnCards.forEach { card -> item { TurnCard(card) } }
        vm.projectChecks.forEach { check -> item { ProjectCheckRow(check) } }
        if (vm.noticeText.isNotBlank()) item { NoticeRow(vm, vm.noticeText) }
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
    val clipboard = LocalClipboardManager.current
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
            if (entry.text.isNotBlank()) {
                TextButton(onClick = { clipboard.setText(androidx.compose.ui.text.AnnotatedString(entry.text)) }) {
                    Text("Kopier")
                }
            }
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
    val context = LocalContext.current
    val picker = rememberLauncherForActivityResult(ActivityResultContracts.GetContent()) { uri ->
        if (uri != null && vm.activeCwd.isNotBlank()) {
            val bytes = runCatching { context.contentResolver.openInputStream(uri)?.use { it.readBytes() } }.getOrNull()
            val name = uri.lastPathSegment?.substringAfterLast('/') ?: "vedlegg"
            if (bytes != null) vm.uploadAttachment(name, bytes)
        }
    }
    var showSettings by remember { mutableStateOf(false) }
    var showModels by remember { mutableStateOf(false) }
    var light by remember { mutableStateOf(false) }
    var mode by remember { mutableStateOf("build") }
    val scope = rememberCoroutineScope()
    val keyboard = LocalSoftwareKeyboardController.current

    Column(Modifier.fillMaxWidth().imePadding().navigationBarsPadding().padding(horizontal = 10.dp, vertical = 4.dp)) {
        if (vm.attachments.isNotEmpty()) {
            Row(
                Modifier.fillMaxWidth().padding(horizontal = 4.dp, vertical = 2.dp),
                horizontalArrangement = Arrangement.spacedBy(6.dp),
                verticalAlignment = Alignment.CenterVertically,
            ) {
                vm.attachments.take(3).forEach { path ->
                    Surface(shape = RoundedCornerShape(999.dp), color = MaterialTheme.colorScheme.surfaceVariant) {
                        Text(
                            path.substringAfterLast('/'),
                            style = MaterialTheme.typography.labelSmall,
                            modifier = Modifier.padding(horizontal = 10.dp, vertical = 4.dp),
                            maxLines = 1,
                        )
                    }
                }
                TextButton(onClick = { vm.clearAttachments() }) { Text("Fjern") }
            }
        }
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
                    value = vm.draft,
                    onValueChange = { vm.updateDraft(it) },
                    maxLines = 6,
                    textStyle = TextStyle(color = MaterialTheme.colorScheme.onSurface, fontSize = 15.sp),
                    cursorBrush = SolidColor(MaterialTheme.colorScheme.primary),
                    keyboardOptions = KeyboardOptions(imeAction = ImeAction.Default),
                    modifier = Modifier.fillMaxWidth().padding(horizontal = 4.dp, vertical = 4.dp),
                    decorationBox = { inner ->
                        if (vm.draft.isBlank()) Text("Skriv en oppgave …", color = MaterialTheme.colorScheme.onSurfaceVariant, fontSize = 15.sp)
                        inner()
                    },
                )
                Spacer(Modifier.height(4.dp))
                Row(verticalAlignment = Alignment.CenterVertically) {
                    IconButton(onClick = { picker.launch("image/*") }) { Icon(Icons.Filled.Add, contentDescription = "Legg ved", tint = MaterialTheme.colorScheme.onSurfaceVariant) }
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
                                    vm.send(vm.draft)
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
                Row(Modifier.fillMaxWidth().padding(vertical = 6.dp), verticalAlignment = Alignment.CenterVertically) {
                    Text("Mørkt tema", modifier = Modifier.weight(1f))
                    Switch(checked = vm.darkTheme, onCheckedChange = { vm.toggleTheme() })
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

// ------------------------------------------------------------------ projects

@OptIn(ExperimentalMaterial3Api::class)
@Composable
private fun ProjectsScreen(vm: AppViewModel, onBack: () -> Unit) {
    LaunchedEffect(Unit) {
        if (vm.folderPath.isBlank()) vm.loadFolders(vm.activeCwd.ifBlank { "C:\\" })
        vm.loadRegistry()
    }
    var renameTarget by remember { mutableStateOf<FsEntry?>(null) }
    var menuFor by remember { mutableStateOf<String?>(null) }
    var showMkdir by remember { mutableStateOf(false) }
    Scaffold(
        containerColor = MaterialTheme.colorScheme.background,
        topBar = {
            TopAppBar(
                colors = TopAppBarDefaults.topAppBarColors(containerColor = MaterialTheme.colorScheme.background),
                navigationIcon = {
                    IconButton(onClick = {
                        val trimmed = vm.folderPath.trimEnd('\\', '/')
                        val parent = trimmed.substringBeforeLast('\\', "").substringBeforeLast('/', "")
                        if (parent.isNotBlank() && parent != trimmed) vm.loadFolders(parent) else onBack()
                    }) {
                        Icon(Icons.AutoMirrored.Filled.ArrowBack, contentDescription = "Tilbake")
                    }
                },
                title = { Text("Prosjekter", fontWeight = FontWeight.SemiBold) },
                actions = {
                    IconButton(onClick = { showMkdir = true }) {
                        Icon(Icons.Filled.Add, contentDescription = "Ny mappe")
                    }
                    IconButton(onClick = { vm.loadFolders(vm.folderPath); vm.loadRegistry() }) {
                        Icon(Icons.Filled.Refresh, contentDescription = "Oppdater")
                    }
                },
            )
        },
    ) { padding ->
        LazyColumn(
            Modifier.padding(padding).fillMaxSize(),
            contentPadding = androidx.compose.foundation.layout.PaddingValues(horizontal = 16.dp, vertical = 8.dp),
            verticalArrangement = Arrangement.spacedBy(2.dp),
        ) {
            item {
                Text("REGISTRERTE PROSJEKTER", style = MaterialTheme.typography.labelSmall,
                    color = MaterialTheme.colorScheme.primary, modifier = Modifier.padding(top = 8.dp, bottom = 4.dp))
            }
            if (vm.registry.isEmpty()) {
                item { Text("Ingen registrerte prosjekter.", style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant) }
            }
            items(vm.registry) { project ->
                Row(Modifier.fillMaxWidth().padding(vertical = 6.dp), verticalAlignment = Alignment.CenterVertically) {
                    Column(Modifier.weight(1f)) {
                        Text(project.name, style = MaterialTheme.typography.bodyMedium)
                        Text(project.path, style = MaterialTheme.typography.labelSmall,
                            color = MaterialTheme.colorScheme.onSurfaceVariant, maxLines = 1)
                    }
                    TextButton(onClick = { vm.setProjectHidden(project.id, !project.hidden) }) {
                        Text(if (project.hidden) "Vis" else "Skjul")
                    }
                }
            }
            item {
                Text("MAPPE", style = MaterialTheme.typography.labelSmall,
                    color = MaterialTheme.colorScheme.primary, modifier = Modifier.padding(top = 14.dp, bottom = 4.dp))
            }
            item {
                Text(vm.folderPath, style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant, maxLines = 1)
            }
            item {
                TextButton(onClick = { vm.registerProject(vm.folderPath) }) {
                    Text("Registrer denne mappen som prosjekt")
                }
            }
            if (vm.folders.isEmpty()) {
                item { Text("Ingen undermapper.", style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant) }
            }
            items(vm.folders) { folder ->
                Row(Modifier.fillMaxWidth().padding(vertical = 6.dp), verticalAlignment = Alignment.CenterVertically) {
                    Text(
                        "📁 " + folder.name,
                        style = MaterialTheme.typography.bodyMedium,
                        modifier = Modifier.weight(1f).clickable { vm.loadFolders(folder.path) },
                    )
                    TextButton(onClick = { vm.registerProject(folder.path) }) { Text("Bruk") }
                    IconButton(onClick = { menuFor = folder.path }) {
                        Text("⋯", style = MaterialTheme.typography.titleMedium,
                            color = MaterialTheme.colorScheme.onSurfaceVariant)
                    }
                    DropdownMenu(expanded = menuFor == folder.path, onDismissRequest = { menuFor = null }) {
                        DropdownMenuItem(text = { Text("Døp om") }, onClick = { renameTarget = folder; menuFor = null })
                        DropdownMenuItem(text = { Text("Slett") }, onClick = { vm.deleteFolder(folder.path); menuFor = null })
                    }
                }
            }
        }
    }
    if (showMkdir) {
        var name by remember { mutableStateOf("") }
        AlertDialog(
            onDismissRequest = { showMkdir = false },
            title = { Text("Ny mappe") },
            text = { OutlinedTextField(value = name, onValueChange = { name = it }, label = { Text("Navn") }, singleLine = true) },
            confirmButton = {
                TextButton(
                    onClick = {
                        if (name.isNotBlank()) {
                            vm.makeFolder(vm.folderPath.trimEnd('\\', '/') + "\\" + name.trim())
                            showMkdir = false
                        }
                    },
                    enabled = name.isNotBlank(),
                ) { Text("Opprett") }
            },
            dismissButton = { TextButton(onClick = { showMkdir = false }) { Text("Avbryt") } },
        )
    }
    renameTarget?.let { folder ->
        var name by remember(folder.path) { mutableStateOf(folder.name) }
        AlertDialog(
            onDismissRequest = { renameTarget = null },
            title = { Text("Døp om mappen") },
            text = { OutlinedTextField(value = name, onValueChange = { name = it }, label = { Text("Navn") }, singleLine = true) },
            confirmButton = {
                TextButton(
                    onClick = {
                        vm.renameFolder(folder.path, vm.folderPath.trimEnd('\\', '/') + "\\" + name.trim())
                        renameTarget = null
                    },
                    enabled = name.isNotBlank(),
                ) { Text("Lagre") }
            },
            dismissButton = { TextButton(onClick = { renameTarget = null }) { Text("Avbryt") } },
        )
    }
}

@Composable
private fun ProjectRow(vm: AppViewModel, project: ProjectInfo, onRename: () -> Unit) {
    Row(Modifier.fillMaxWidth().padding(vertical = 8.dp), verticalAlignment = Alignment.CenterVertically) {
        Column(Modifier.weight(1f).padding(end = 8.dp)) {
            Text(project.name.ifBlank { project.path }, style = MaterialTheme.typography.bodyMedium)
            Text(
                project.path + (if (project.hidden) " · skjult" else ""),
                style = MaterialTheme.typography.labelSmall,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
                maxLines = 1,
            )
        }
        TextButton(onClick = onRename) { Text("Døp om") }
        TextButton(onClick = { vm.setProjectHidden(project.id, !project.hidden) }) {
            Text(if (project.hidden) "Vis" else "Skjul")
        }
    }
}

@Composable
private fun CreateProjectDialog(onDismiss: () -> Unit, onCreate: (String) -> Unit) {
    var name by remember { mutableStateOf("") }
    AlertDialog(
        onDismissRequest = onDismiss,
        title = { Text("Nytt prosjekt") },
        text = {
            Column {
                OutlinedTextField(value = name, onValueChange = { name = it }, label = { Text("Navn") }, singleLine = true)
                Spacer(Modifier.height(8.dp))
                Text(
                    "Opprettes under Documents/OMP/Prosjekter.",
                    style = MaterialTheme.typography.labelSmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                )
            }
        },
        confirmButton = {
            TextButton(onClick = { if (name.isNotBlank()) onCreate(name) }, enabled = name.isNotBlank()) { Text("Opprett") }
        },
        dismissButton = { TextButton(onClick = onDismiss) { Text("Avbryt") } },
    )
}

@Composable
private fun RenameProjectDialog(project: ProjectInfo, onDismiss: () -> Unit, onRename: (String) -> Unit) {
    var name by remember { mutableStateOf(project.name) }
    AlertDialog(
        onDismissRequest = onDismiss,
        title = { Text("Døp om prosjekt") },
        text = { OutlinedTextField(value = name, onValueChange = { name = it }, label = { Text("Navn") }, singleLine = true) },
        confirmButton = {
            TextButton(onClick = { if (name.isNotBlank()) onRename(name) }, enabled = name.isNotBlank()) { Text("Lagre") }
        },
        dismissButton = { TextButton(onClick = onDismiss) { Text("Avbryt") } },
    )
}

// ------------------------------------------------------------------ approval

@Composable
private fun ApprovalDialog(vm: AppViewModel, request: org.json.JSONObject) {
    val method = request.optString("method")
    val title = request.optString("title").ifBlank { "OMP trenger godkjenning" }
    val message = request.optString("message")
    val allowAlways = request.optBoolean("allowAlways")
    val options = request.optJSONArray("options")
    val questions = request.optJSONArray("questions")
    var input by remember { mutableStateOf(request.optString("prefill")) }
    val answers = remember { mutableStateMapOf<Int, String>() }

    AlertDialog(
        onDismissRequest = { vm.respondApproval(cancelled = true) },
        title = { Text(title) },
        text = {
            Column {
                if (message.isNotBlank()) Text(message)
                if (questions != null) {
                    for (index in 0 until questions.length()) {
                        val question = questions.optJSONObject(index)
                        val label = question?.optString("question").orEmpty()
                            .ifBlank { question?.optString("title").orEmpty() }
                            .ifBlank { questions.optString(index) }
                        Text(label, style = MaterialTheme.typography.bodyMedium, modifier = Modifier.padding(top = 8.dp))
                        OutlinedTextField(
                            value = answers[index].orEmpty(),
                            onValueChange = { answers[index] = it },
                            label = { Text("Svar") },
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
                        label = { Text("Svar") },
                        modifier = Modifier.padding(top = 8.dp),
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
                        array.put(org.json.JSONObject().apply {
                            put("question", label)
                            put("answer", answers[index].orEmpty())
                        })
                    }
                    vm.respondApproval(answers = array)
                }) { Text("Svar") }
            } else if (method != "select") {
                TextButton(onClick = {
                    if (method == "input") vm.respondApproval(value = input) else vm.respondApproval(confirmed = true)
                }) { Text("Tillat") }
            }
            if (allowAlways && questions == null) {
                TextButton(onClick = { vm.respondApproval(allowAlways = true) }) { Text("Tillat alltid") }
            }
        },
        dismissButton = { TextButton(onClick = { vm.respondApproval(cancelled = true) }) { Text("Avbryt") } },
    )
}
// ------------------------------------------------------------------ work summary

@Composable
private fun TodoPanel(phases: org.json.JSONArray) {
    val tasks = (0 until phases.length()).flatMap { index ->
        val list = phases.optJSONObject(index)?.optJSONArray("tasks") ?: return@flatMap emptyList()
        (0 until list.length()).mapNotNull { list.optJSONObject(it) }
    }
    if (tasks.isEmpty()) return
    var expanded by remember { mutableStateOf(false) }
    val doneStatuses = setOf("done", "done*", "cancelled")
    val done = tasks.count { it.optString("status") in doneStatuses }
    Surface(shape = RoundedCornerShape(12.dp), color = MaterialTheme.colorScheme.surface, modifier = Modifier.fillMaxWidth()) {
        Column(Modifier.padding(horizontal = 12.dp, vertical = 8.dp)) {
            Row(
                Modifier.fillMaxWidth().clickable { expanded = !expanded },
                verticalAlignment = Alignment.CenterVertically,
            ) {
                Text("Oppgaver", fontWeight = FontWeight.SemiBold, modifier = Modifier.weight(1f))
                Text(
                    "$done av ${tasks.size} ferdig",
                    style = MaterialTheme.typography.labelSmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                )
            }
            if (expanded) {
                for (task in tasks) {
                    val finished = task.optString("status") in doneStatuses
                    Row(Modifier.padding(vertical = 2.dp), verticalAlignment = Alignment.CenterVertically) {
                        Text(
                            if (finished) "✓" else "○",
                            color = if (finished) MaterialTheme.colorScheme.primary else MaterialTheme.colorScheme.onSurfaceVariant,
                        )
                        Spacer(Modifier.width(6.dp))
                        Text(
                            task.optString("title").ifBlank { task.optString("name") },
                            style = MaterialTheme.typography.bodySmall,
                        )
                    }
                }
            }
        }
    }
}

@Composable
private fun TurnCard(card: org.json.JSONObject) {
    val files = card.optJSONArray("files") ?: return
    if (files.length() == 0) return
    Surface(shape = RoundedCornerShape(12.dp), color = MaterialTheme.colorScheme.surface, modifier = Modifier.fillMaxWidth()) {
        Column(Modifier.padding(12.dp)) {
            Text(
                if (files.length() == 1) "1 fil endret" else "${files.length()} filer endret",
                fontWeight = FontWeight.SemiBold,
                style = MaterialTheme.typography.bodyMedium,
            )
            for (index in 0 until files.length()) {
                val file = files.optJSONObject(index) ?: continue
                Text(
                    file.optString("path"),
                    style = MaterialTheme.typography.labelSmall,
                    fontFamily = FontFamily.Monospace,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                    maxLines = 1,
                )
            }
        }
    }
}

@Composable
private fun ProjectCheckRow(check: org.json.JSONObject) {
    val ok = check.optInt("exitCode", 0) == 0
    val duration = check.optLong("duration", 0)
    Surface(shape = RoundedCornerShape(12.dp), color = MaterialTheme.colorScheme.surface, modifier = Modifier.fillMaxWidth()) {
        Row(Modifier.padding(12.dp), verticalAlignment = Alignment.CenterVertically) {
            Text(if (ok) "✓" else "✗", color = if (ok) MaterialTheme.colorScheme.primary else MaterialTheme.colorScheme.error)
            Spacer(Modifier.width(8.dp))
            Text(if (ok) "Test OK" else "Test feilet", style = MaterialTheme.typography.bodySmall)
            if (duration > 0) {
                Text(" · ${duration} ms", style = MaterialTheme.typography.labelSmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
            }
        }
    }
}

@Composable
private fun NoticeRow(vm: AppViewModel, text: String) {
    Surface(shape = RoundedCornerShape(12.dp), color = MaterialTheme.colorScheme.surfaceVariant, modifier = Modifier.fillMaxWidth()) {
        Row(Modifier.padding(horizontal = 12.dp, vertical = 6.dp), verticalAlignment = Alignment.CenterVertically) {
            Text(text, style = MaterialTheme.typography.bodySmall, modifier = Modifier.weight(1f))
            TextButton(onClick = { vm.dismissNotice() }) { Text("Lukk") }
        }
    }
}
