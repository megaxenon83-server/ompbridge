package net.nimay.chatompomp.desktop

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.horizontalScroll
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxHeight
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.LazyRow
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.lazy.rememberLazyListState
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.BasicTextField
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.AccountTree
import androidx.compose.material.icons.filled.Add
import androidx.compose.material.icons.filled.Clear
import androidx.compose.material.icons.filled.Close
import androidx.compose.material.icons.filled.Folder
import androidx.compose.material.icons.filled.MoreVert
import androidx.compose.material.icons.filled.PhoneAndroid
import androidx.compose.material.icons.filled.RecordVoiceOver
import androidx.compose.material.icons.filled.Refresh
import androidx.compose.material.icons.filled.Send
import androidx.compose.material.icons.filled.Settings
import androidx.compose.material.icons.filled.Terminal
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.DropdownMenu
import androidx.compose.material3.DropdownMenuItem
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.focus.FocusRequester
import androidx.compose.ui.focus.focusRequester
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.SolidColor
import androidx.compose.ui.input.key.Key
import androidx.compose.ui.input.key.KeyEventType
import androidx.compose.ui.input.key.isShiftPressed
import androidx.compose.ui.input.key.key
import androidx.compose.ui.input.key.onPreviewKeyEvent
import androidx.compose.ui.input.key.type
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp

/**
 * Same screens as android-native, laid out for a desktop window: a permanent
 * session rail on the left and the chat on the right, with the same theme,
 * bubbles, reasoning card, context meter and approval dialogs.
 */
@Composable
fun RootScreen(vm: ChatViewModel) {
    if (vm.pairing == null || !vm.connected) ConnectScreen(vm) else ChatScreen(vm)
}

// ------------------------------------------------------------------ connect

@Composable
private fun ConnectScreen(vm: ChatViewModel) {
    var link by remember { mutableStateOf("") }
    val found = vm.detected

    Surface(Modifier.fillMaxSize(), color = MaterialTheme.colorScheme.background) {
        Box(Modifier.fillMaxSize().verticalScroll(rememberScrollState())) {
            Column(
                Modifier.fillMaxWidth().padding(horizontal = 28.dp, vertical = 40.dp),
                horizontalAlignment = Alignment.CenterHorizontally,
            ) {
                Surface(shape = RoundedCornerShape(16.dp), color = MaterialTheme.colorScheme.primary) {
                    Text(
                        "O",
                        modifier = Modifier.padding(horizontal = 16.dp, vertical = 8.dp),
                        style = MaterialTheme.typography.headlineSmall,
                        fontWeight = FontWeight.Bold,
                        color = MaterialTheme.colorScheme.onPrimary,
                    )
                }
                Spacer(Modifier.height(18.dp))
                Text("OMP Desktop", style = MaterialTheme.typography.headlineMedium, fontWeight = FontWeight.Bold)
                Spacer(Modifier.height(8.dp))
                Text(
                    t(
                        "Native Compose-klient for OMP Bridge. Bridgen gjør jobben – appen snakker med den over HTTP.",
                        "Native Compose client for OMP Bridge. The bridge does the work – the app talks to it over HTTP.",
                    ),
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                    style = MaterialTheme.typography.bodyMedium,
                    textAlign = TextAlign.Center,
                    modifier = Modifier.width(460.dp),
                )
                Spacer(Modifier.height(26.dp))

                Column(Modifier.width(460.dp)) {
                    if (found != null) {
                        Surface(
                            shape = RoundedCornerShape(14.dp),
                            color = MaterialTheme.colorScheme.surface,
                            border = androidx.compose.foundation.BorderStroke(1.dp, MaterialTheme.colorScheme.outline),
                            modifier = Modifier.fillMaxWidth(),
                        ) {
                            Column(Modifier.padding(16.dp)) {
                                Text(
                                    t("Fant bridgen på denne PC-en", "Found the bridge on this PC"),
                                    style = MaterialTheme.typography.labelSmall,
                                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                                )
                                Spacer(Modifier.height(4.dp))
                                Text(found.hostPort, style = MaterialTheme.typography.bodyLarge, fontWeight = FontWeight.SemiBold)
                                Text(
                                    found.source,
                                    style = MaterialTheme.typography.labelSmall,
                                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                                    maxLines = 1,
                                )
                                Spacer(Modifier.height(12.dp))
                                PrimaryButton(
                                    label = if (vm.connecting) t("Kobler til …", "Connecting …") else t("Koble til", "Connect"),
                                    busy = vm.connecting,
                                    enabled = !vm.connecting,
                                    onClick = { vm.connectDetected() },
                                )
                            }
                        }
                        Spacer(Modifier.height(18.dp))
                        Text(
                            t("eller lim inn en paringslenke", "or paste a pairing link"),
                            style = MaterialTheme.typography.labelSmall,
                            color = MaterialTheme.colorScheme.onSurfaceVariant,
                            modifier = Modifier.fillMaxWidth(),
                            textAlign = TextAlign.Center,
                        )
                        Spacer(Modifier.height(8.dp))
                    } else {
                        Text(
                            t(
                                "Fant ingen bridge-config.json lokalt. Lim inn paringslenken fra bridgen.",
                                "No local bridge config.json found. Paste the pairing link from the bridge.",
                            ),
                            color = MaterialTheme.colorScheme.onSurfaceVariant,
                            style = MaterialTheme.typography.bodySmall,
                        )
                        Spacer(Modifier.height(8.dp))
                    }

                    OutlinedTextField(
                        value = link,
                        onValueChange = { link = it },
                        placeholder = { Text("omp2://192.168.1.20:27778?token=…") },
                        singleLine = false,
                        modifier = Modifier.fillMaxWidth().heightIn(min = 72.dp),
                    )
                    Spacer(Modifier.height(10.dp))
                    PrimaryButton(
                        label = if (vm.connecting) t("Kobler til …", "Connecting …") else t("Koble til med lenke", "Connect with link"),
                        busy = vm.connecting,
                        enabled = link.isNotBlank() && !vm.connecting,
                        onClick = { vm.connectWithLink(link.trim()) },
                    )
                    if (vm.error.isNotBlank()) {
                        Spacer(Modifier.height(12.dp))
                        Surface(
                            shape = RoundedCornerShape(12.dp),
                            color = MaterialTheme.colorScheme.error.copy(alpha = 0.12f),
                            modifier = Modifier.fillMaxWidth(),
                        ) {
                            Text(
                                vm.error,
                                color = MaterialTheme.colorScheme.error,
                                style = MaterialTheme.typography.bodySmall,
                                modifier = Modifier.padding(12.dp),
                            )
                        }
                    }
                    if (vm.pairing != null && !vm.connected) {
                        Spacer(Modifier.height(10.dp))
                        TextButton(onClick = { vm.retry() }, modifier = Modifier.align(Alignment.End)) {
                            Text(t("Prøv igjen", "Try again"))
                        }
                    }
                    Spacer(Modifier.height(18.dp))
                    Text(
                        "v${APP_VERSION} · fork 14a",
                        style = MaterialTheme.typography.labelSmall,
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                        modifier = Modifier.fillMaxWidth(),
                        textAlign = TextAlign.Center,
                    )
                }
            }
        }
    }
}

@Composable
private fun PrimaryButton(label: String, busy: Boolean, enabled: Boolean, onClick: () -> Unit) {
    Surface(
        shape = RoundedCornerShape(14.dp),
        color = if (enabled) MaterialTheme.colorScheme.primary else MaterialTheme.colorScheme.surfaceVariant,
        modifier = Modifier.fillMaxWidth().clickable(enabled = enabled, onClick = onClick),
    ) {
        Box(Modifier.padding(vertical = 13.dp), contentAlignment = Alignment.Center) {
            if (busy) {
                CircularProgressIndicator(modifier = Modifier.size(18.dp), strokeWidth = 2.dp)
            } else {
                Text(
                    label,
                    color = if (enabled) MaterialTheme.colorScheme.onPrimary else MaterialTheme.colorScheme.onSurfaceVariant,
                    fontWeight = FontWeight.SemiBold,
                )
            }
        }
    }
}

// ------------------------------------------------------------------ chat

@Composable
private fun ChatScreen(vm: ChatViewModel) {
    var dialog by remember { mutableStateOf<String?>(null) }
    var menuFor by remember { mutableStateOf<String?>(null) }
    var renameTarget by remember { mutableStateOf<SessionInfo?>(null) }
    var archiveTarget by remember { mutableStateOf<SessionInfo?>(null) }
    var screen by remember { mutableStateOf("chat") }

    Row(Modifier.fillMaxSize().background(MaterialTheme.colorScheme.background)) {
        Sidebar(
            vm = vm,
            modifier = Modifier.width(312.dp).fillMaxHeight(),
            menuFor = menuFor,
            onMenu = { menuFor = it },
            onRename = { renameTarget = it },
            onArchive = { archiveTarget = it },
            onNewChat = { vm.loadProjects(); dialog = "new" },
            onSettings = { dialog = "settings" },
            screen = screen,
            onOpenScreen = { screen = it },
        )
        Box(Modifier.width(1.dp).fillMaxHeight().background(MaterialTheme.colorScheme.outline))
        Box(Modifier.weight(1f).fillMaxHeight()) {
            when (screen) {
                "files" -> FilesScreen(vm, onBack = { screen = "chat" })
                "git" -> GitScreen(vm, onBack = { screen = "chat" })
                "terminal" -> TerminalScreen(vm, onBack = { screen = "chat" })
                "devices" -> DevicesScreen(vm, onBack = { screen = "chat" })
                "voice" -> VoiceScreen(vm, onBack = { screen = "chat" })
                else -> ChatPane(
                    vm = vm,
                    onNewChat = { vm.loadProjects(); dialog = "new" },
                    onOpenModels = { vm.loadModels(); dialog = "model" },
                    onOpenSettings = { dialog = "settings" },
                )
            }
        }
    }

    vm.approval?.let { request -> ApprovalDialog(vm, request) }
    when (dialog) {
        "theme" -> ThemeDialog(vm, onClose = { dialog = null })
        "model" -> ModelDialog(vm, onClose = { dialog = null })
        "new" -> NewChatDialog(vm, onClose = { dialog = null })
        "settings" -> SettingsDialog(vm, onClose = { dialog = null }, onOpenTheme = { dialog = "theme" })
    }
    renameTarget?.let { session -> RenameDialog(vm, session, onClose = { renameTarget = null }) }
    archiveTarget?.let { session -> ArchiveDialog(vm, session, onClose = { archiveTarget = null }) }
}

/** Chat column: header, transcript and composer. Shown when no tool screen is open. */
@Composable
private fun ChatPane(vm: ChatViewModel, onNewChat: () -> Unit, onOpenModels: () -> Unit, onOpenSettings: () -> Unit) {
    Column(Modifier.fillMaxSize()) {
        TopBar(vm, onNewChat = onNewChat)
        Box(Modifier.fillMaxWidth().height(1.dp).background(MaterialTheme.colorScheme.outline))
        ChatList(vm, Modifier.weight(1f))
        Composer(vm = vm, onOpenModels = onOpenModels, onOpenSettings = onOpenSettings)
    }
}

@Composable
private fun TopBar(vm: ChatViewModel, onNewChat: () -> Unit) {
    Row(
        Modifier.fillMaxWidth().padding(horizontal = 16.dp, vertical = 12.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Column(Modifier.weight(1f)) {
            Text(
                vm.activeTitle.ifBlank { "OMP Desktop" },
                style = MaterialTheme.typography.titleMedium,
                fontWeight = FontWeight.SemiBold,
                maxLines = 1,
            )
            val subtitle = buildString {
                val project = vm.activeCwd.trimEnd('\\', '/').split('\\', '/').lastOrNull().orEmpty()
                if (project.isNotBlank()) append(project)
                if (vm.activeModelName.isNotBlank()) {
                    if (isNotEmpty()) append(" · ")
                    append(vm.activeModelName)
                }
            }
            if (subtitle.isNotBlank()) {
                Text(
                    subtitle,
                    style = MaterialTheme.typography.labelSmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                    maxLines = 1,
                )
            }
        }
        ConnectionPill(vm)
        IconButton(onClick = { vm.refresh() }) {
            Icon(Icons.Filled.Refresh, contentDescription = t("Oppdater", "Refresh"), tint = MaterialTheme.colorScheme.onSurfaceVariant)
        }
        IconButton(onClick = onNewChat) {
            Icon(Icons.Filled.Add, contentDescription = t("Ny samtale", "New chat"), tint = MaterialTheme.colorScheme.onSurfaceVariant)
        }
    }
}

@Composable
private fun ConnectionPill(vm: ChatViewModel) {
    Surface(shape = RoundedCornerShape(999.dp), color = MaterialTheme.colorScheme.surfaceVariant) {
        Row(
            Modifier.padding(horizontal = 10.dp, vertical = 5.dp),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            Box(Modifier.size(7.dp).background(if (vm.connected) MaterialTheme.colorScheme.primary else Color(0xFFE0A800), CircleShape))
            Spacer(Modifier.width(6.dp))
            Text(
                (if (vm.connected) t("Live", "Live") else t("Frakoblet", "Offline")) +
                    (if (vm.bridgeVersion.isNotBlank()) " · v${vm.bridgeVersion}" else ""),
                style = MaterialTheme.typography.labelSmall,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
            )
        }
    }
}

// ------------------------------------------------------------------ sidebar

@Composable
private fun Sidebar(
    vm: ChatViewModel,
    modifier: Modifier = Modifier,
    menuFor: String?,
    onMenu: (String?) -> Unit,
    onRename: (SessionInfo) -> Unit,
    onArchive: (SessionInfo) -> Unit,
    onNewChat: () -> Unit,
    onSettings: () -> Unit,
    screen: String,
    onOpenScreen: (String) -> Unit,
) {
    var query by remember { mutableStateOf("") }
    var projectFilter by remember { mutableStateOf<String?>(null) }

    val projectNames = vm.sessions.map { it.projectName }.distinct().sorted()
    val filtered = vm.sessions.filter {
        (projectFilter == null || it.projectName == projectFilter) &&
            (query.isBlank() || it.title.contains(query, true))
    }
    val working = filtered.filter { it.activity == "working" }
    val unread = filtered.filter { it.activity != "working" && vm.isUnread(it) }
    val pinnedList = filtered.filter { it.activity != "working" && !vm.isUnread(it) && it.file in vm.pinned }
    val rest = filtered.filter { it.activity != "working" && !vm.isUnread(it) && it.file !in vm.pinned }
    val grouped = rest.groupBy { sessionGroup(it.updatedAt) }
    val sections = ArrayList<Pair<String, List<SessionInfo>>>()
    if (working.isNotEmpty()) sections.add(t("AKTIVE", "ACTIVE") to working)
    if (unread.isNotEmpty()) sections.add(t("ULESTE SVAR", "UNREAD") to unread)
    if (pinnedList.isNotEmpty()) sections.add(t("FESTET", "PINNED") to pinnedList)
    for (label in listOf("I dag", "I går", "Siste 7 dager", "Eldre")) {
        grouped[label]?.let { list -> sections.add(sectionLabel(label) to list) }
    }

    Column(modifier.padding(horizontal = 12.dp, vertical = 10.dp)) {
        Row(verticalAlignment = Alignment.CenterVertically) {
            Text("OMP", style = MaterialTheme.typography.titleLarge, fontWeight = FontWeight.Bold)
            Spacer(Modifier.width(8.dp))
            Text(
                "Desktop",
                style = MaterialTheme.typography.labelSmall,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
            )
            Spacer(Modifier.weight(1f))
            IconButton(onClick = onSettings) {
                Icon(Icons.Filled.Settings, contentDescription = t("Innstillinger", "Settings"), tint = MaterialTheme.colorScheme.onSurfaceVariant)
            }
        }
        Surface(
            shape = RoundedCornerShape(14.dp),
            color = MaterialTheme.colorScheme.primary,
            modifier = Modifier.fillMaxWidth().clickable(onClick = onNewChat),
        ) {
            Row(Modifier.padding(vertical = 11.dp), horizontalArrangement = Arrangement.Center) {
                Text(
                    t("+  Ny samtale", "+  New chat"),
                    color = MaterialTheme.colorScheme.onPrimary,
                    fontWeight = FontWeight.SemiBold,
                )
            }
        }
        OutlinedTextField(
            value = query,
            onValueChange = { query = it },
            placeholder = { Text(t("Søk i samtaler", "Search chats"), style = MaterialTheme.typography.bodySmall) },
            singleLine = true,
            textStyle = MaterialTheme.typography.bodySmall,
            modifier = Modifier.fillMaxWidth().padding(top = 8.dp),
            trailingIcon = {
                if (query.isNotBlank()) {
                    IconButton(onClick = { query = "" }) {
                        Icon(Icons.Filled.Close, contentDescription = null, modifier = Modifier.size(16.dp))
                    }
                }
            },
        )
        if (projectNames.isNotEmpty()) {
            LazyRow(
                Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.spacedBy(6.dp),
                contentPadding = PaddingValues(vertical = 8.dp),
            ) {
                item { ChoiceChip(t("Alle", "All"), projectFilter == null) { projectFilter = null } }
                items(projectNames, key = { it }) { name ->
                    ChoiceChip(name, projectFilter == name) {
                        projectFilter = if (projectFilter == name) null else name
                    }
                }
            }
        }
        LazyColumn(Modifier.weight(1f).fillMaxWidth()) {
            for ((label, list) in sections) {
                item(key = "h-$label") {
                    Text(
                        label,
                        style = MaterialTheme.typography.labelSmall,
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                        modifier = Modifier.padding(top = 12.dp, bottom = 2.dp),
                    )
                }
                items(list, key = { it.file }) { session ->
                    SessionRow(
                        vm = vm,
                        session = session,
                        showProject = projectFilter == null,
                        menuFor = menuFor,
                        onMenu = onMenu,
                        onRename = onRename,
                        onArchive = onArchive,
                    )
                }
            }
            if (sections.isEmpty()) {
                item {
                    Text(
                        t("Ingen samtaler ennå.", "No chats yet."),
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                        style = MaterialTheme.typography.bodySmall,
                        modifier = Modifier.padding(top = 12.dp),
                    )
                }
            }
            if (unread.isNotEmpty()) {
                item {
                    TextButton(onClick = { vm.markAllRead() }) { Text(t("Merk alle som lest", "Mark all as read")) }
                }
            }
        }
        HorizontalDivider(Modifier.padding(top = 4.dp))
        Row(
            Modifier.fillMaxWidth().padding(top = 2.dp),
            horizontalArrangement = Arrangement.SpaceEvenly,
        ) {
            SidebarIcon(Icons.Filled.Folder, t("Filer", "Files"), screen == "files") { onOpenScreen("files") }
            SidebarIcon(Icons.Filled.AccountTree, "Git", screen == "git") { onOpenScreen("git") }
            SidebarIcon(Icons.Filled.Terminal, "Terminal", screen == "terminal") { onOpenScreen("terminal") }
            SidebarIcon(Icons.Filled.PhoneAndroid, t("Enheter", "Devices"), screen == "devices") { onOpenScreen("devices") }
            SidebarIcon(Icons.Filled.RecordVoiceOver, t("Tale", "Voice"), screen == "voice") { onOpenScreen("voice") }
        }
        Row(
            Modifier.fillMaxWidth().padding(top = 6.dp),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            Text(
                "v$APP_VERSION",
                style = MaterialTheme.typography.labelSmall,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
            )
            Spacer(Modifier.weight(1f))
            Text(
                vm.pairing?.origin.orEmpty(),
                style = MaterialTheme.typography.labelSmall,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
                maxLines = 1,
            )
        }
    }
}

@Composable
private fun SidebarIcon(
    icon: androidx.compose.ui.graphics.vector.ImageVector,
    label: String,
    selected: Boolean,
    onClick: () -> Unit,
) {
    Column(
        Modifier.clip(RoundedCornerShape(10.dp))
            .background(if (selected) MaterialTheme.colorScheme.surfaceVariant else Color.Transparent)
            .clickable(onClick = onClick)
            .padding(horizontal = 8.dp, vertical = 6.dp),
        horizontalAlignment = Alignment.CenterHorizontally,
    ) {
        Icon(
            icon,
            contentDescription = label,
            tint = if (selected) MaterialTheme.colorScheme.primary else MaterialTheme.colorScheme.onSurfaceVariant,
            modifier = Modifier.size(20.dp),
        )
        Spacer(Modifier.height(3.dp))
        Text(
            label,
            style = MaterialTheme.typography.labelSmall,
            color = if (selected) MaterialTheme.colorScheme.primary else MaterialTheme.colorScheme.onSurfaceVariant,
            fontSize = 9.sp,
            maxLines = 1,
        )
    }
}

@Composable
private fun SessionRow(
    vm: ChatViewModel,
    session: SessionInfo,
    showProject: Boolean,
    menuFor: String?,
    onMenu: (String?) -> Unit,
    onRename: (SessionInfo) -> Unit,
    onArchive: (SessionInfo) -> Unit,
) {
    val unread = vm.isUnread(session)
    val working = session.activity == "working"
    val active = session.file == vm.activeFile
    Row(
        Modifier.fillMaxWidth()
            .clip(RoundedCornerShape(12.dp))
            .background(if (active) MaterialTheme.colorScheme.surfaceVariant else Color.Transparent)
            .clickable { vm.openSession(session) }
            .padding(start = 8.dp, end = 2.dp, top = 7.dp, bottom = 7.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Box(Modifier.width(18.dp), contentAlignment = Alignment.Center) {
            when {
                working -> CircularProgressIndicator(
                    Modifier.size(13.dp),
                    strokeWidth = 1.75.dp,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                )
                unread -> Box(Modifier.size(9.dp).border(1.75.dp, MaterialTheme.colorScheme.primary, CircleShape))
                active -> Box(Modifier.size(7.dp).background(MaterialTheme.colorScheme.primary, CircleShape))
                else -> Spacer(Modifier.size(9.dp))
            }
        }
        Column(Modifier.weight(1f).padding(start = 10.dp)) {
            Text(
                session.title,
                maxLines = 1,
                style = MaterialTheme.typography.bodyMedium,
                fontWeight = if (unread) FontWeight.SemiBold else FontWeight.Normal,
            )
            Text(
                if (showProject) session.projectName else session.model.ifBlank { "${session.messageCount} meldinger" },
                maxLines = 1,
                style = MaterialTheme.typography.labelSmall,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
            )
        }
        Text(
            relativeTime(session.updatedAt),
            style = MaterialTheme.typography.labelSmall,
            color = MaterialTheme.colorScheme.onSurfaceVariant,
        )
        Box {
            IconButton(onClick = { onMenu(session.file) }) {
                Icon(
                    Icons.Filled.MoreVert,
                    contentDescription = t("Mer", "More"),
                    tint = MaterialTheme.colorScheme.onSurfaceVariant,
                    modifier = Modifier.size(18.dp),
                )
            }
            DropdownMenu(expanded = menuFor == session.file, onDismissRequest = { onMenu(null) }) {
                DropdownMenuItem(
                    text = { Text(if (session.file in vm.pinned) t("Løsne", "Unpin") else t("Fest", "Pin")) },
                    onClick = { vm.togglePin(session.file); onMenu(null) },
                )
                DropdownMenuItem(
                    text = { Text(t("Endre navn", "Rename")) },
                    onClick = { onRename(session); onMenu(null) },
                )
                DropdownMenuItem(
                    text = { Text(t("Merk som lest", "Mark as read")) },
                    onClick = { vm.markSeen(session.file, session.messageCount); onMenu(null) },
                )
                DropdownMenuItem(
                    text = { Text(t("Arkiver", "Archive")) },
                    onClick = { onArchive(session); onMenu(null) },
                )
            }
        }
    }
}

// ------------------------------------------------------------------ chat list

@Composable
private fun ChatList(vm: ChatViewModel, modifier: Modifier = Modifier) {
    val listState = rememberLazyListState()
    val tail = vm.messages.lastOrNull()
    LaunchedEffect(vm.messages.size, tail?.text?.length, tail?.thinking?.length, vm.stream.active) {
        if (vm.messages.isNotEmpty()) {
            val count = listState.layoutInfo.totalItemsCount
            if (count > 0) listState.scrollToItem(count - 1)
        }
    }
    LazyColumn(
        state = listState,
        modifier = modifier.fillMaxSize().padding(horizontal = 20.dp),
        verticalArrangement = Arrangement.spacedBy(10.dp),
        contentPadding = PaddingValues(vertical = 14.dp),
    ) {
        if (vm.activeFile.isBlank()) {
            item {
                Column(
                    Modifier.fillMaxWidth().padding(top = 60.dp),
                    horizontalAlignment = Alignment.CenterHorizontally,
                ) {
                    Text(
                        t("Hva bygger vi?", "What are we building?"),
                        style = MaterialTheme.typography.headlineSmall,
                        fontWeight = FontWeight.Bold,
                    )
                    Spacer(Modifier.height(6.dp))
                    Text(
                        t("Velg en samtale i listen for å begynne.", "Pick a chat in the list to begin."),
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                    )
                }
            }
        }
        items(vm.messages, key = { it.id + it.role }) { entry -> EntryRow(entry) }
        if (vm.noticeText.isNotBlank()) {
            item {
                Row(
                    Modifier.fillMaxWidth().clip(RoundedCornerShape(12.dp))
                        .background(MaterialTheme.colorScheme.surfaceVariant).padding(10.dp),
                    verticalAlignment = Alignment.CenterVertically,
                ) {
                    Text(
                        vm.noticeText,
                        style = MaterialTheme.typography.bodySmall,
                        modifier = Modifier.weight(1f),
                    )
                    TextButton(onClick = { vm.dismissNotice() }) { Text(t("Lukk", "Close")) }
                }
            }
        }
        if (vm.error.isNotBlank()) {
            item {
                Row(
                    Modifier.fillMaxWidth().clip(RoundedCornerShape(12.dp))
                        .background(MaterialTheme.colorScheme.error.copy(alpha = 0.12f)).padding(10.dp),
                    verticalAlignment = Alignment.CenterVertically,
                ) {
                    Text(
                        vm.error,
                        color = MaterialTheme.colorScheme.error,
                        modifier = Modifier.weight(1f),
                        style = MaterialTheme.typography.bodySmall,
                    )
                    TextButton(onClick = { vm.dismissError() }) { Text(t("Lukk", "Close")) }
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
                modifier = Modifier.fillMaxWidth(0.80f),
            ) {
                Text(
                    entry.text,
                    modifier = Modifier.padding(horizontal = 14.dp, vertical = 10.dp),
                    color = MaterialTheme.colorScheme.onPrimaryContainer,
                )
            }
        }
        "tool" -> ToolRow(entry)
        "terminal" -> Surface(
            color = MaterialTheme.colorScheme.surfaceVariant,
            shape = RoundedCornerShape(10.dp),
            modifier = Modifier.fillMaxWidth(),
        ) {
            Text(
                entry.text,
                fontFamily = FontFamily.Monospace,
                fontSize = 12.sp,
                modifier = Modifier.padding(10.dp),
                color = MaterialTheme.colorScheme.onSurface,
            )
        }
        else -> Column(Modifier.fillMaxWidth()) {
            if (entry.thinking.isNotBlank()) {
                var userExpanded by remember(entry.id) { mutableStateOf<Boolean?>(null) }
                val showThinking = userExpanded ?: entry.streaming
                Surface(
                    shape = RoundedCornerShape(10.dp),
                    color = MaterialTheme.colorScheme.surface,
                    modifier = Modifier.fillMaxWidth(),
                ) {
                    Column(Modifier.padding(horizontal = 12.dp, vertical = 8.dp)) {
                        Row(
                            Modifier.fillMaxWidth().clickable { userExpanded = !showThinking },
                            verticalAlignment = Alignment.CenterVertically,
                        ) {
                            Text(
                                if (entry.streaming) t("Resonnerer …", "Reasoning …") else t("Resonnering", "Reasoning"),
                                style = MaterialTheme.typography.labelSmall,
                                color = MaterialTheme.colorScheme.primary,
                                modifier = Modifier.weight(1f),
                            )
                            Text(
                                t("${entry.thinking.length} tegn", "${entry.thinking.length} chars"),
                                style = MaterialTheme.typography.labelSmall,
                                color = MaterialTheme.colorScheme.onSurfaceVariant,
                            )
                            Text(
                                if (showThinking) "▾" else "▸",
                                color = MaterialTheme.colorScheme.onSurfaceVariant,
                                modifier = Modifier.padding(start = 6.dp),
                            )
                        }
                        if (showThinking) {
                            Box(
                                Modifier
                                    .heightIn(max = 240.dp)
                                    .verticalScroll(rememberScrollState())
                                    .padding(top = 6.dp),
                            ) {
                                Text(
                                    entry.thinking,
                                    style = MaterialTheme.typography.bodySmall,
                                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                                )
                            }
                        }
                    }
                }
                Spacer(Modifier.height(6.dp))
            }
            if (entry.text.isNotBlank()) MarkdownText(entry.text)
            if (entry.text.isNotBlank()) {
                TextButton(onClick = { copyToClipboard(entry.text) }) {
                    Text(t("Kopier", "Copy"), style = MaterialTheme.typography.labelSmall)
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
    var open by remember(entry.id) { mutableStateOf(false) }
    Surface(
        color = MaterialTheme.colorScheme.surface,
        shape = RoundedCornerShape(12.dp),
        modifier = Modifier.fillMaxWidth().clickable { open = !open },
    ) {
        Column(Modifier.padding(10.dp)) {
            Row(verticalAlignment = Alignment.CenterVertically) {
                Text(
                    entry.toolName.ifBlank { t("Verktøy", "Tool") } +
                        (entry.command.takeIf { it.isNotBlank() }?.let { " · " + it.lineSequence().first() } ?: ""),
                    style = MaterialTheme.typography.labelMedium,
                    color = if (entry.isError) MaterialTheme.colorScheme.error else MaterialTheme.colorScheme.onSurfaceVariant,
                    maxLines = 1,
                    modifier = Modifier.weight(1f),
                )
                if (entry.streaming) CircularProgressIndicator(Modifier.size(12.dp), strokeWidth = 2.dp)
            }
            if (open && entry.text.isNotBlank()) {
                Spacer(Modifier.height(6.dp))
                Text(
                    entry.text.take(4000),
                    style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                )
            }
        }
    }
}

// ------------------------------------------------------------------ composer

@Composable
private fun Composer(vm: ChatViewModel, onOpenModels: () -> Unit, onOpenSettings: () -> Unit) {
    val focus = remember { FocusRequester() }
    LaunchedEffect(vm.activeFile) {
        if (vm.activeFile.isNotBlank()) runCatching { focus.requestFocus() }
    }
    Column(Modifier.fillMaxWidth().padding(horizontal = 20.dp, vertical = 8.dp)) {
        if (vm.contextWindow > 0) {
            val fraction = (vm.contextTokens.toFloat() / vm.contextWindow).coerceIn(0f, 1f)
            Row(
                Modifier.fillMaxWidth().padding(horizontal = 4.dp, vertical = 2.dp),
                verticalAlignment = Alignment.CenterVertically,
            ) {
                val meterColor = when {
                    fraction >= 0.85f -> MaterialTheme.colorScheme.error
                    fraction >= 0.60f -> Color(0xFFE0A800)
                    else -> MaterialTheme.colorScheme.primary
                }
                Box(
                    Modifier.weight(1f).height(3.dp).clip(RoundedCornerShape(999.dp))
                        .background(MaterialTheme.colorScheme.surfaceVariant),
                ) {
                    Box(Modifier.fillMaxWidth(fraction).fillMaxHeight().background(meterColor))
                }
                Spacer(Modifier.width(8.dp))
                Text(
                    formatTokens(vm.contextTokens) + " / " + formatTokens(vm.contextWindow) + " tok" +
                        (if (fraction >= 0.85f) " · " + (fraction * 100).toInt() + " %" else ""),
                    style = MaterialTheme.typography.labelSmall,
                    color = if (fraction >= 0.85f) MaterialTheme.colorScheme.error else MaterialTheme.colorScheme.onSurfaceVariant,
                )
            }
        }
        if (vm.modelSwitchText.isNotBlank()) {
            Row(
                Modifier.fillMaxWidth().padding(horizontal = 4.dp, vertical = 5.dp),
                verticalAlignment = Alignment.CenterVertically,
            ) {
                CircularProgressIndicator(Modifier.size(12.dp), strokeWidth = 2.dp)
                Spacer(Modifier.width(8.dp))
                Text(
                    vm.modelSwitchText,
                    style = MaterialTheme.typography.labelSmall,
                    color = MaterialTheme.colorScheme.primary,
                    maxLines = 1,
                )
            }
        }
        if (vm.stream.active || vm.busy) {
            Row(
                Modifier.fillMaxWidth().padding(horizontal = 4.dp, vertical = 5.dp),
                verticalAlignment = Alignment.CenterVertically,
            ) {
                CircularProgressIndicator(Modifier.size(12.dp), strokeWidth = 2.dp)
                Spacer(Modifier.width(8.dp))
                Text(
                    vm.stream.phase.ifBlank { t("OMP arbeider", "OMP is working") },
                    style = MaterialTheme.typography.labelSmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                    maxLines = 1,
                )
                if (vm.stream.tokensPerSecond > 0) {
                    Spacer(Modifier.width(8.dp))
                    Text(
                        "${vm.stream.tokensPerSecond.toInt()} tok/s",
                        style = MaterialTheme.typography.labelSmall,
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                    )
                }
                Spacer(Modifier.weight(1f))
                TextButton(onClick = { vm.stop() }) { Text(t("Stopp", "Stop"), style = MaterialTheme.typography.labelSmall) }
            }
        }
        Surface(
            shape = RoundedCornerShape(26.dp),
            color = MaterialTheme.colorScheme.surface,
            border = androidx.compose.foundation.BorderStroke(1.dp, MaterialTheme.colorScheme.outline),
            modifier = Modifier.fillMaxWidth(),
        ) {
            Column(Modifier.padding(horizontal = 10.dp, vertical = 8.dp)) {
                Box(Modifier.fillMaxWidth().padding(horizontal = 4.dp, vertical = 4.dp)) {
                    if (vm.draft.isBlank()) {
                        Text(
                            t("Skriv en oppgave …  (Enter = send, Shift+Enter = ny linje)", "Write a task …  (Enter = send, Shift+Enter = new line)"),
                            color = MaterialTheme.colorScheme.onSurfaceVariant,
                            fontSize = 15.sp,
                        )
                    }
                    BasicTextField(
                        value = vm.draft,
                        onValueChange = { vm.updateDraft(it) },
                        maxLines = 6,
                        textStyle = TextStyle(color = MaterialTheme.colorScheme.onSurface, fontSize = 15.sp),
                        cursorBrush = SolidColor(MaterialTheme.colorScheme.primary),
                        modifier = Modifier.fillMaxWidth().focusRequester(focus).onPreviewKeyEvent { event ->
                            if (event.type == KeyEventType.KeyDown && event.key == Key.Enter && !event.isShiftPressed) {
                                if (vm.busy) vm.stop() else vm.send(vm.draft)
                                true
                            } else {
                                false
                            }
                        },
                    )
                }
                Spacer(Modifier.height(4.dp))
                Row(verticalAlignment = Alignment.CenterVertically) {
                    Surface(
                        shape = RoundedCornerShape(999.dp),
                        color = MaterialTheme.colorScheme.surfaceVariant,
                        modifier = Modifier.clickable(onClick = onOpenModels),
                    ) {
                        Text(
                            vm.activeModelName.ifBlank { t("Velg modell", "Choose model") } +
                                (if (vm.thinkingLevel.isNotBlank()) " · " + vm.thinkingLabel(vm.thinkingLevel) else ""),
                            modifier = Modifier.padding(horizontal = 12.dp, vertical = 6.dp),
                            style = MaterialTheme.typography.labelMedium,
                            maxLines = 1,
                        )
                    }
                    Spacer(Modifier.weight(1f))
                    IconButton(onClick = onOpenSettings) {
                        Icon(Icons.Filled.Settings, contentDescription = t("Innstillinger", "Settings"), tint = MaterialTheme.colorScheme.onSurfaceVariant)
                    }
                    Spacer(Modifier.width(2.dp))
                    Box(
                        modifier = Modifier
                            .size(36.dp)
                            .clip(CircleShape)
                            .background(MaterialTheme.colorScheme.primary)
                            .clickable { if (vm.busy) vm.stop() else vm.send(vm.draft) },
                        contentAlignment = Alignment.Center,
                    ) {
                        Icon(
                            if (vm.busy) Icons.Filled.Clear else Icons.Filled.Send,
                            contentDescription = if (vm.busy) t("Stopp", "Stop") else t("Send", "Send"),
                            tint = MaterialTheme.colorScheme.onPrimary,
                            modifier = Modifier.size(18.dp),
                        )
                    }
                }
            }
        }
    }
}

// ------------------------------------------------------------------ helpers

private const val APP_VERSION = "0.14.0"

fun copyToClipboard(text: String) {
    runCatching {
        java.awt.Toolkit.getDefaultToolkit().systemClipboard
            .setContents(java.awt.datatransfer.StringSelection(text), null)
    }
}

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

/** Localised header for the sidebar buckets, keeping the group keys stable. */
@Composable
private fun sectionLabel(label: String): String = when (label) {
    "I dag" -> t("I DAG", "TODAY")
    "I går" -> t("I GÅR", "YESTERDAY")
    "Siste 7 dager" -> t("SISTE 7 DAGER", "LAST 7 DAYS")
    else -> t("ELDRE", "OLDER")
}

fun relativeTime(ts: Long): String {
    if (ts <= 0) return ""
    val diff = System.currentTimeMillis() - ts
    return when {
        diff < 60_000 -> "nå"
        diff < 3_600_000 -> "${diff / 60_000} min"
        diff < 86_400_000 -> "${diff / 3_600_000} t"
        diff < 7 * 86_400_000L -> "${diff / 86_400_000} d"
        else -> java.text.SimpleDateFormat("dd.MM", java.util.Locale.getDefault()).format(java.util.Date(ts))
    }
}

private fun formatTokens(value: Int): String = when {
    value >= 1_000_000 -> String.format(java.util.Locale.US, "%.1fM", value / 1_000_000.0)
    value >= 1_000 -> String.format(java.util.Locale.US, "%.0fK", value / 1_000.0)
    else -> value.toString()
}
