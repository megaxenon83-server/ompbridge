package net.nimay.chatompomp.desktop

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
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
import androidx.compose.foundation.layout.widthIn
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.lazy.rememberLazyListState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.BasicTextField
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Add
import androidx.compose.material.icons.filled.ArrowUpward
import androidx.compose.material.icons.filled.ChevronRight
import androidx.compose.material.icons.filled.Close
import androidx.compose.material.icons.filled.ExpandLess
import androidx.compose.material.icons.filled.ExpandMore
import androidx.compose.material.icons.filled.Search
import androidx.compose.material.icons.filled.Settings
import androidx.compose.material.icons.filled.Stop
import androidx.compose.material.icons.filled.Terminal
import androidx.compose.material.icons.outlined.AccountTree
import androidx.compose.material.icons.outlined.Folder
import androidx.compose.material.icons.outlined.PhoneAndroid
import androidx.compose.material.icons.outlined.RecordVoiceOver
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.SolidColor
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.input.key.Key
import androidx.compose.ui.input.key.KeyEventType
import androidx.compose.ui.input.key.isShiftPressed
import androidx.compose.ui.input.key.key
import androidx.compose.ui.input.key.onPreviewKeyEvent
import androidx.compose.ui.input.key.type
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import java.text.SimpleDateFormat
import java.util.Date
import java.util.Locale

// ------------------------------------------------------------------ tokens

private object Ui {
    val SidebarWidth = 264.dp
    val TopBarHeight = 56.dp
    val ContentMax = 760.dp

    val body = TextStyle(fontSize = 15.sp, lineHeight = 23.sp)
    val small = TextStyle(fontSize = 13.sp, lineHeight = 19.sp)
    val meta = TextStyle(fontSize = 11.sp, lineHeight = 15.sp)
    val code = TextStyle(fontSize = 12.5.sp, fontFamily = FontFamily.Monospace)
}

/** Navigation and palette state shared with the window, so Ctrl+K works anywhere. */
class ShellState {
    var screen by mutableStateOf("chat")
    var palette by mutableStateOf(false)
    fun go(target: String) { screen = target; palette = false }
    fun openPalette() { palette = true }
    fun closePalette() { palette = false }
}

// ------------------------------------------------------------------- shell

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun CodexShell(vm: ChatViewModel, state: ShellState = ShellState()) {
    val theme = vm.theme
    val screen = state.screen
    val palette = state.palette
    var showModel by remember { mutableStateOf(false) }
    var showNew by remember { mutableStateOf(false) }
    var showSettings by remember { mutableStateOf(false) }
    var showTheme by remember { mutableStateOf(false) }

    vm.approval?.let { ApprovalDialog(vm, it) }
    if (showModel) ModelDialog(vm) { showModel = false }
    if (showNew) NewChatDialog(vm) { showNew = false }
    if (showSettings) SettingsDialog(vm, { showSettings = false }, { showSettings = false; showTheme = true })
    if (showTheme) ThemeDialog(vm) { showTheme = false }

    Box(Modifier.fillMaxSize().background(theme.background)) {
        Row(Modifier.fillMaxSize()) {
            CodexSidebar(
                vm = vm,
                screen = screen,
                onGo = { state.go(it) },
                onNew = { showNew = true },
                onSettings = { showSettings = true },
                onPalette = { state.openPalette() },
            )
            Column(Modifier.weight(1f).fillMaxHeight()) {
                if (screen == "chat") {
                    CodexTopBar(
                        vm = vm,
                        onBack = { state.go("chat") },
                        onOpenModels = { showModel = true },
                        onSettings = { showSettings = true },
                        onPalette = { state.openPalette() },
                    )
                }
                Box(Modifier.weight(1f).fillMaxWidth()) {
                    when (screen) {
                        "files" -> FilesScreen(vm, onBack = { state.go("chat") })
                        "git" -> GitScreen(vm, onBack = { state.go("chat") })
                        "terminal" -> TerminalScreen(vm, onBack = { state.go("chat") })
                        "devices" -> DevicesScreen(vm, onBack = { state.go("chat") })
                        "voice" -> VoiceScreen(vm, onBack = { state.go("chat") })
                        else -> CodexThread(vm)
                    }
                }
                if (screen == "chat") {
                    Column(Modifier.fillMaxWidth().background(theme.background)) {
                        CodexComposer(vm, onOpenModels = { showModel = true })
                        CodexStatusLine(vm)
                    }
                }
            }
        }
        if (palette) {
            CommandOverlay(vm, onDismiss = { state.closePalette() }, onGo = { state.go(it) })
        }
    }
}

// ----------------------------------------------------------------- sidebar

@Composable
private fun CodexSidebar(
    vm: ChatViewModel,
    screen: String,
    onGo: (String) -> Unit,
    onNew: () -> Unit,
    onSettings: () -> Unit,
    onPalette: () -> Unit,
) {
    val theme = vm.theme
    val groups = remember(vm.sessions) { groupSessions(vm.sessions) }

    Column(
        Modifier
            .width(Ui.SidebarWidth)
            .fillMaxHeight()
            .background(theme.surface)
            .border(width = 1.dp, color = theme.border),
    ) {
        Row(
            Modifier.fillMaxWidth().height(Ui.TopBarHeight).padding(horizontal = 14.dp),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            Box(
                Modifier.size(24.dp).clip(CircleShape).background(theme.brand),
                contentAlignment = Alignment.Center,
            ) { Text("O", color = theme.background, fontWeight = FontWeight.Bold, fontSize = 13.sp) }
            Spacer(Modifier.width(8.dp))
            Text("OMP", color = theme.ink, fontWeight = FontWeight.SemiBold, fontSize = 14.sp)
            Spacer(Modifier.weight(1f))
            IconButton(onClick = onSettings, modifier = Modifier.size(28.dp)) {
                Icon(Icons.Filled.Settings, contentDescription = t("Innstillinger", "Settings"),
                    tint = theme.muted, modifier = Modifier.size(17.dp))
            }
        }

        Surface(
            onClick = onNew,
            shape = RoundedCornerShape(8.dp),
            color = theme.raised,
            modifier = Modifier.fillMaxWidth().padding(horizontal = 12.dp).height(36.dp),
        ) {
            Row(Modifier.fillMaxSize(), verticalAlignment = Alignment.CenterVertically) {
                Spacer(Modifier.width(12.dp))
                Icon(Icons.Filled.Add, contentDescription = null, tint = theme.ink, modifier = Modifier.size(16.dp))
                Spacer(Modifier.width(8.dp))
                Text(t("Ny samtale", "New chat"), color = theme.ink, fontSize = 13.sp, fontWeight = FontWeight.Medium)
            }
        }

        Spacer(Modifier.height(10.dp))
        Row(
            Modifier.fillMaxWidth().padding(horizontal = 12.dp).height(32.dp)
                .clip(RoundedCornerShape(8.dp)).background(theme.raised)
                .clickable { onPalette() }
                .padding(horizontal = 8.dp),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            Icon(Icons.Filled.Search, contentDescription = null, tint = theme.muted, modifier = Modifier.size(14.dp))
            Spacer(Modifier.width(6.dp))
            Text(t("Søk eller hopp til …", "Search or jump to …"), color = theme.muted, fontSize = 12.5.sp, modifier = Modifier.weight(1f))
            Text("Ctrl+K", color = theme.muted.copy(alpha = 0.55f), fontSize = 10.sp)
        }

        LazyColumn(Modifier.weight(1f).fillMaxWidth().padding(top = 8.dp)) {
            if (vm.projects.isNotEmpty()) {
                item { SectionLabel(t("PROSJEKTER", "PROJECTS"), theme) }
                items(vm.projects) { project -> ProjectRow(vm, project) }
            }
            groups.forEach { (label, list) ->
                item { SectionLabel(label, theme) }
                items(list) { session -> SessionRow(vm, session, active = session.file == vm.activeFile) }
            }
            if (vm.sessions.isEmpty()) {
                item {
                    Text(
                        t("Ingen samtaler ennå", "No chats yet"),
                        color = theme.muted, fontSize = 12.5.sp,
                        modifier = Modifier.padding(horizontal = 16.dp, vertical = 12.dp),
                    )
                }
            }
            item { Spacer(Modifier.height(8.dp)) }
        }

        ToolRail(theme, screen, onGo)
    }
}

@Composable
private fun SectionLabel(label: String, theme: ThemeSpec) {
    Text(
        label,
        color = theme.muted,
        fontSize = 10.5.sp,
        fontWeight = FontWeight.SemiBold,
        letterSpacing = 0.8.sp,
        modifier = Modifier.padding(start = 16.dp, end = 12.dp, top = 14.dp, bottom = 6.dp),
    )
}

@Composable
private fun ProjectRow(vm: ChatViewModel, project: ProjectInfo) {
    val theme = vm.theme
    val active = project.path == vm.activeCwd
    Row(
        Modifier.fillMaxWidth().padding(horizontal = 8.dp, vertical = 1.dp)
            .clip(RoundedCornerShape(7.dp))
            .background(if (active) theme.raised else Color.Transparent)
            .clickable { vm.newSession(project.path) }
            .padding(horizontal = 8.dp, vertical = 6.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Icon(Icons.Outlined.Folder, contentDescription = null, tint = theme.muted, modifier = Modifier.size(14.dp))
        Spacer(Modifier.width(8.dp))
        Text(
            project.name,
            color = if (active) theme.ink else theme.muted,
            fontSize = 12.5.sp,
            maxLines = 1,
            overflow = TextOverflow.Ellipsis,
            modifier = Modifier.weight(1f),
        )
        if (project.sessionCount > 0) {
            Text(project.sessionCount.toString(), color = theme.muted, fontSize = 11.sp)
        }
    }
}

@Composable
private fun SessionRow(vm: ChatViewModel, session: SessionInfo, active: Boolean) {
    val theme = vm.theme
    val unread = vm.isUnread(session)
    Row(
        Modifier.fillMaxWidth().padding(horizontal = 8.dp, vertical = 1.dp)
            .clip(RoundedCornerShape(7.dp))
            .background(if (active) theme.raised else Color.Transparent)
            .clickable { vm.openSession(session) }
            .padding(horizontal = 8.dp, vertical = 7.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Column(Modifier.weight(1f)) {
            Row(verticalAlignment = Alignment.CenterVertically) {
                if (unread) {
                    Box(Modifier.size(5.dp).clip(CircleShape).background(theme.brand))
                    Spacer(Modifier.width(6.dp))
                }
                Text(
                    session.title,
                    color = if (active) theme.ink else theme.muted,
                    fontSize = 12.5.sp,
                    fontWeight = if (active) FontWeight.Medium else FontWeight.Normal,
                    maxLines = 1,
                    overflow = TextOverflow.Ellipsis,
                )
            }
            Text(
                session.projectName,
                color = theme.muted.copy(alpha = 0.75f),
                fontSize = 11.sp,
                maxLines = 1,
                overflow = TextOverflow.Ellipsis,
            )
        }
        Text(relative(session.updatedAt), color = theme.muted.copy(alpha = 0.7f), fontSize = 10.5.sp)
    }
}

@Composable
private fun ToolRail(theme: ThemeSpec, screen: String, onGo: (String) -> Unit) {
    val items = listOf(
        Triple("files", t("Filer", "Files"), Icons.Outlined.Folder),
        Triple("git", t("Git", "Git"), Icons.Outlined.AccountTree),
        Triple("terminal", t("Terminal", "Terminal"), Icons.Filled.Terminal),
        Triple("devices", t("Enheter", "Devices"), Icons.Outlined.PhoneAndroid),
        Triple("voice", t("Tale", "Voice"), Icons.Outlined.RecordVoiceOver),
    )
    Row(
        Modifier.fillMaxWidth().height(44.dp).border(width = 1.dp, color = theme.border),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.SpaceEvenly,
    ) {
        items.forEach { (id, label, icon) ->
            val selected = screen == id
            Box(
                Modifier.size(34.dp).clip(RoundedCornerShape(7.dp))
                    .background(if (selected) theme.raised else Color.Transparent)
                    .clickable { onGo(if (selected) "chat" else id) },
                contentAlignment = Alignment.Center,
            ) {
                Icon(icon, contentDescription = label,
                    tint = if (selected) theme.ink else theme.muted,
                    modifier = Modifier.size(17.dp))
            }
        }
    }
}

// ------------------------------------------------------------------ topbar

@Composable
private fun CodexTopBar(
    vm: ChatViewModel,
    onBack: () -> Unit,
    onOpenModels: () -> Unit,
    onSettings: () -> Unit,
    onPalette: () -> Unit,
) {
    val theme = vm.theme
    val project = vm.activeCwd.trimEnd('\\', '/').split('\\', '/').lastOrNull().orEmpty()
    Row(
        Modifier.fillMaxWidth().height(Ui.TopBarHeight).background(theme.background)
            .padding(horizontal = 20.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Text(
            vm.activeTitle.ifBlank { t("Ny samtale", "New chat") },
            color = theme.ink, fontSize = 13.5.sp, fontWeight = FontWeight.SemiBold,
            maxLines = 1, overflow = TextOverflow.Ellipsis,
        )
        if (project.isNotBlank()) {
            Text("  ·  " + project, color = theme.muted, fontSize = 12.sp, maxLines = 1)
        }
        Spacer(Modifier.weight(1f))
        IconButton(onClick = onPalette, modifier = Modifier.size(28.dp)) {
            Icon(Icons.Filled.Search, contentDescription = t("Søk (Ctrl+K)", "Search (Ctrl+K)"),
                tint = theme.muted, modifier = Modifier.size(16.dp))
        }
        Spacer(Modifier.width(4.dp))
        ModelChip(vm, onOpenModels)
        Spacer(Modifier.width(8.dp))
        StatusDot(theme, vm)
        Spacer(Modifier.width(8.dp))
        IconButton(onClick = onSettings, modifier = Modifier.size(28.dp)) {
            Icon(Icons.Filled.Settings, contentDescription = t("Innstillinger", "Settings"),
                tint = theme.muted, modifier = Modifier.size(17.dp))
        }
    }
}

@Composable
private fun ModelChip(vm: ChatViewModel, onOpen: () -> Unit) {
    val theme = vm.theme
    val label = vm.activeModelName.ifBlank { t("Velg modell", "Choose model") }
    val effort = vm.thinkingLabel(vm.thinkingLevel)
    Surface(
        onClick = onOpen,
        shape = RoundedCornerShape(999.dp),
        color = theme.surface,
        border = androidx.compose.foundation.BorderStroke(1.dp, theme.border),
    ) {
        Row(Modifier.padding(horizontal = 12.dp, vertical = 6.dp), verticalAlignment = Alignment.CenterVertically) {
            if (vm.modelSwitchText.isNotBlank()) {
                CircularProgressIndicator(Modifier.size(11.dp), strokeWidth = 1.5.dp, color = theme.brand)
            } else {
                Box(Modifier.size(6.dp).clip(CircleShape).background(theme.brand))
            }
            Spacer(Modifier.width(7.dp))
            Text(label, color = theme.ink, fontSize = 12.sp, maxLines = 1)
            if (effort.isNotBlank()) {
                Text(" · $effort", color = theme.muted, fontSize = 11.5.sp, maxLines = 1)
            }
            Spacer(Modifier.width(4.dp))
            Icon(Icons.Filled.ExpandMore, contentDescription = null, tint = theme.muted, modifier = Modifier.size(14.dp))
        }
    }
}

@Composable
private fun StatusDot(theme: ThemeSpec, vm: ChatViewModel) {
    val color = when {
        vm.busy -> theme.brand
        vm.connected -> theme.brand.copy(alpha = 0.6f)
        else -> theme.muted.copy(alpha = 0.5f)
    }
    Box(Modifier.size(7.dp).clip(CircleShape).background(color))
}

// ------------------------------------------------------------------ thread

@Composable
private fun CodexThread(vm: ChatViewModel) {
    val state = rememberLazyListState()
    LaunchedEffect(vm.messages.size, vm.messages.lastOrNull()?.text?.length) {
        if (vm.messages.isNotEmpty()) state.animateScrollToItem(vm.messages.lastIndex)
    }
    Box(Modifier.fillMaxSize(), contentAlignment = Alignment.TopCenter) {
        if (vm.messages.isEmpty()) {
            EmptyThread(vm)
        } else {
            LazyColumn(
                state = state,
                modifier = Modifier.fillMaxHeight().fillMaxWidth().widthIn(max = Ui.ContentMax).padding(horizontal = 24.dp),
                verticalArrangement = Arrangement.spacedBy(14.dp),
                contentPadding = PaddingValues(vertical = 18.dp),
            ) {
                items(vm.messages, key = { it.id }) { entry -> MessageEntry(vm, entry) }
            }
        }
    }
}

@Composable
private fun EmptyThread(vm: ChatViewModel) {
    val theme = vm.theme
    Column(
        Modifier.fillMaxSize().padding(horizontal = 32.dp),
        verticalArrangement = Arrangement.Center,
        horizontalAlignment = Alignment.CenterHorizontally,
    ) {
        Text(t("Hva bygger vi?", "What are we building?"), color = theme.ink,
            fontSize = 22.sp, fontWeight = FontWeight.SemiBold)
        Spacer(Modifier.height(8.dp))
        Text(
            t("Velg en samtale i sidemenyen, eller skriv en oppgave nedenfor.",
                "Pick a chat in the sidebar, or describe a task below."),
            color = theme.muted, fontSize = 13.sp,
        )
        Spacer(Modifier.height(20.dp))
        Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
            Suggestion(vm, t("Forklar denne kodebasen", "Explain this codebase"))
            Suggestion(vm, t("Finn og fiks en bug", "Find and fix a bug"))
            Suggestion(vm, t("Skriv tester", "Write tests"))
        }
    }
}

@Composable
private fun Suggestion(vm: ChatViewModel, text: String) {
    val theme = vm.theme
    Surface(
        onClick = { vm.send(text) },
        shape = RoundedCornerShape(999.dp),
        color = theme.surface,
        border = androidx.compose.foundation.BorderStroke(1.dp, theme.border),
    ) {
        Text(text, color = theme.muted, fontSize = 12.sp, modifier = Modifier.padding(horizontal = 14.dp, vertical = 8.dp))
    }
}

@Composable
private fun MessageEntry(vm: ChatViewModel, entry: Entry) {
    val theme = vm.theme
    when (entry.role) {
        "user" -> Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.End) {
            Surface(
                shape = RoundedCornerShape(14.dp),
                color = theme.raised,
                modifier = Modifier.widthIn(max = 560.dp),
            ) {
                Text(entry.text, color = theme.ink, style = Ui.body, modifier = Modifier.padding(horizontal = 14.dp, vertical = 10.dp))
            }
        }
        "tool" -> ToolEntry(theme, entry)
        "system" -> Text(entry.text, color = theme.muted, style = Ui.small)
        else -> Column(Modifier.fillMaxWidth()) {
            if (entry.thinking.isNotBlank()) ReasoningCard(theme, entry)
            if (entry.text.isNotBlank()) {
                MarkdownText(entry.text, Modifier.fillMaxWidth())
                if (entry.streaming) Text("▍", color = theme.brand, fontSize = 13.sp)
            }
        }
    }
}

@Composable
private fun ReasoningCard(theme: ThemeSpec, entry: Entry) {
    var open by remember(entry.id) { mutableStateOf(entry.streaming) }
    Surface(shape = RoundedCornerShape(10.dp), color = theme.surface, modifier = Modifier.fillMaxWidth()) {
        Column {
            Row(
                Modifier.fillMaxWidth().clickable { open = !open }.padding(horizontal = 12.dp, vertical = 8.dp),
                verticalAlignment = Alignment.CenterVertically,
            ) {
                Text(t("Tenker", "Thinking"), color = theme.muted, fontSize = 11.5.sp, fontWeight = FontWeight.Medium)
                Spacer(Modifier.width(6.dp))
                Text("${entry.thinking.length} " + t("tegn", "chars"), color = theme.muted.copy(alpha = 0.7f), fontSize = 10.5.sp)
                Spacer(Modifier.weight(1f))
                Icon(
                    if (open) Icons.Filled.ExpandLess else Icons.Filled.ExpandMore,
                    contentDescription = null, tint = theme.muted, modifier = Modifier.size(15.dp),
                )
            }
            if (open) {
                Text(
                    entry.thinking,
                    color = theme.muted,
                    style = Ui.small,
                    modifier = Modifier.padding(start = 12.dp, end = 12.dp, bottom = 10.dp),
                )
            }
        }
    }
}

@Composable
private fun ToolEntry(theme: ThemeSpec, entry: Entry) {
    var open by remember(entry.id) { mutableStateOf(false) }
    Surface(shape = RoundedCornerShape(10.dp), color = theme.surface, modifier = Modifier.fillMaxWidth()) {
        Column {
            Row(
                Modifier.fillMaxWidth().clickable { open = !open }.padding(horizontal = 12.dp, vertical = 8.dp),
                verticalAlignment = Alignment.CenterVertically,
            ) {
                Box(Modifier.size(6.dp).clip(CircleShape).background(if (entry.isError) Color(0xFFE5534B) else theme.brand))
                Spacer(Modifier.width(8.dp))
                Text(entry.toolName.ifBlank { t("verktøy", "tool") }, color = theme.ink, fontSize = 12.sp, fontWeight = FontWeight.Medium)
                if (entry.command.isNotBlank()) {
                    Spacer(Modifier.width(8.dp))
                    Text(entry.command, color = theme.muted, style = Ui.code, maxLines = 1, overflow = TextOverflow.Ellipsis,
                        modifier = Modifier.weight(1f))
                }
                Spacer(Modifier.weight(1f))
                Icon(
                    if (open) Icons.Filled.ExpandLess else Icons.Filled.ExpandMore,
                    contentDescription = null, tint = theme.muted, modifier = Modifier.size(15.dp),
                )
            }
            if (open && entry.text.isNotBlank()) {
                Text(entry.text, color = theme.muted, style = Ui.code,
                    modifier = Modifier.padding(start = 26.dp, end = 12.dp, bottom = 10.dp))
            }
        }
    }
}

// ---------------------------------------------------------------- composer

@Composable
private fun CodexComposer(vm: ChatViewModel, onOpenModels: () -> Unit) {
    val theme = vm.theme
    Box(Modifier.fillMaxWidth(), contentAlignment = Alignment.TopCenter) {
        Column(Modifier.widthIn(max = Ui.ContentMax).fillMaxWidth().padding(horizontal = 24.dp, vertical = 10.dp)) {
            if (vm.error.isNotBlank()) {
                Row(
                    Modifier.fillMaxWidth().padding(bottom = 8.dp)
                        .clip(RoundedCornerShape(8.dp)).background(Color(0x22E5534B))
                        .padding(horizontal = 12.dp, vertical = 8.dp),
                    verticalAlignment = Alignment.CenterVertically,
                ) {
                    Text(vm.error, color = Color(0xFFE5534B), fontSize = 12.sp, modifier = Modifier.weight(1f))
                    IconButton(onClick = { vm.clearError() }, modifier = Modifier.size(22.dp)) {
                        Icon(Icons.Filled.Close, contentDescription = null, tint = Color(0xFFE5534B), modifier = Modifier.size(14.dp))
                    }
                }
            }
            Surface(
                shape = RoundedCornerShape(14.dp),
                color = theme.surface,
                border = androidx.compose.foundation.BorderStroke(1.dp, theme.border),
            ) {
                Column(Modifier.padding(horizontal = 12.dp, vertical = 10.dp)) {
                    Box(Modifier.fillMaxWidth().heightIn(min = 24.dp, max = 160.dp)) {
                        if (vm.draft.isBlank()) {
                            Text(t("Skriv en oppgave …", "Write a task …"), color = theme.muted, fontSize = 14.sp)
                        }
                        BasicTextField(
                            value = vm.draft,
                            onValueChange = { vm.updateDraft(it) },
                            textStyle = Ui.body.copy(color = theme.ink),
                            cursorBrush = SolidColor(theme.brand),
                            modifier = Modifier.fillMaxWidth().onPreviewKeyEvent { event ->
                                if (event.type == KeyEventType.KeyDown && event.key == Key.Enter && !event.isShiftPressed) {
                                    if (vm.busy) vm.stop() else vm.send(vm.draft)
                                    true
                                } else false
                            },
                        )
                    }
                    Spacer(Modifier.height(8.dp))
                    Row(verticalAlignment = Alignment.CenterVertically) {
                        Surface(
                            onClick = onOpenModels,
                            shape = RoundedCornerShape(999.dp),
                            color = theme.raised,
                        ) {
                            Row(Modifier.padding(horizontal = 10.dp, vertical = 5.dp), verticalAlignment = Alignment.CenterVertically) {
                                Text(
                                    vm.activeModelName.ifBlank { t("Velg modell", "Choose model") },
                                    color = theme.muted, fontSize = 11.5.sp, maxLines = 1,
                                )
                                if (vm.thinkingLevel.isNotBlank()) {
                                    Text(" · " + vm.thinkingLabel(vm.thinkingLevel), color = theme.muted, fontSize = 11.5.sp)
                                }
                                Spacer(Modifier.width(4.dp))
                                Icon(Icons.Filled.ExpandMore, contentDescription = null, tint = theme.muted, modifier = Modifier.size(13.dp))
                            }
                        }
                        Spacer(Modifier.weight(1f))
                        Surface(
                            onClick = { if (vm.busy) vm.stop() else vm.send(vm.draft) },
                            shape = CircleShape,
                            color = if (vm.busy) theme.raised else theme.brand,
                            modifier = Modifier.size(30.dp),
                        ) {
                            Box(contentAlignment = Alignment.Center) {
                                Icon(
                                    if (vm.busy) Icons.Filled.Stop else Icons.Filled.ArrowUpward,
                                    contentDescription = if (vm.busy) t("Stopp", "Stop") else t("Send", "Send"),
                                    tint = if (vm.busy) theme.ink else theme.background,
                                    modifier = Modifier.size(16.dp),
                                )
                            }
                        }
                    }
                }
            }
        }
    }
}

@Composable
private fun CodexStatusLine(vm: ChatViewModel) {
    val theme = vm.theme
    val rate = vm.stream.tokensPerSecond
    val context = buildString {
        if (vm.activeModelName.isNotBlank()) append(vm.activeModelName)
        if (rate > 0) { if (isNotEmpty()) append(" · "); append("${rate.toInt()} tok/s") }
        if (vm.contextTokens > 0) {
            if (isNotEmpty()) append(" · ")
            append(formatTokenCount(vm.contextTokens))
            if (vm.contextWindow > 0) append(" / " + formatTokenCount(vm.contextWindow))
            append(" tok")
        }
        if (vm.busy && vm.stream.phase.isNotBlank()) { if (isNotEmpty()) append(" · "); append(vm.stream.phase) }
    }
    Row(
        Modifier.fillMaxWidth().height(26.dp).padding(horizontal = 24.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Text(
            vm.modelSwitchText.ifBlank { context },
            color = if (vm.modelSwitchText.isNotBlank()) theme.brand else theme.muted.copy(alpha = 0.8f),
            fontSize = 10.5.sp,
            maxLines = 1,
        )
    }
}

// ---------------------------------------------------------- command overlay

@Composable
private fun CommandOverlay(vm: ChatViewModel, onDismiss: () -> Unit, onGo: (String) -> Unit) {
    val theme = vm.theme
    var query by remember { mutableStateOf("") }
    val actions = listOf(
        Triple(t("Ny samtale", "New chat"), "chat", Icons.Filled.Add),
        Triple(t("Filer", "Files"), "files", Icons.Outlined.Folder),
        Triple(t("Git", "Git"), "git", Icons.Outlined.AccountTree),
        Triple(t("Terminal", "Terminal"), "terminal", Icons.Filled.Terminal),
        Triple(t("Enheter", "Devices"), "devices", Icons.Outlined.PhoneAndroid),
        Triple(t("Tale", "Voice"), "voice", Icons.Outlined.RecordVoiceOver),
    )
    val sessions = remember(vm.sessions, query) {
        if (query.isBlank()) emptyList() else vm.sessions.filter { it.title.contains(query, true) }.take(6)
    }
    Box(Modifier.fillMaxSize().background(Color(0xB3000000)).clickable { onDismiss() }, contentAlignment = Alignment.TopCenter) {
        Column(
            Modifier.padding(top = 96.dp).width(560.dp)
                .clip(RoundedCornerShape(14.dp))
                .background(Color(0xFF202227))
                .border(1.dp, theme.border, RoundedCornerShape(14.dp))
                .clickable { },
        ) {
            BasicTextField(
                value = query,
                onValueChange = { query = it },
                singleLine = true,
                textStyle = Ui.body.copy(color = theme.ink),
                cursorBrush = SolidColor(theme.brand),
                modifier = Modifier.fillMaxWidth().padding(horizontal = 16.dp, vertical = 14.dp),
                decorationBox = { inner ->
                    if (query.isBlank()) Text(t("Søk eller hopp til …", "Search or jump to …"), color = theme.muted, fontSize = 14.sp)
                    inner()
                },
            )
            Box(Modifier.fillMaxWidth().height(1.dp).background(theme.border))
            LazyColumn(Modifier.heightIn(max = 380.dp)) {
                items(actions.filter { query.isBlank() || it.first.contains(query, true) }) { action ->
                    PaletteRow(theme, action.first, action.third) {
                        onDismiss()
                        if (action.second == "chat") vm.newSession(vm.activeCwd) else onGo(action.second)
                    }
                }
                if (sessions.isNotEmpty()) {
                    item { SectionLabel(t("SAMTALER", "CHATS"), theme) }
                    items(sessions) { session ->
                        PaletteRow(theme, session.title, Icons.Filled.ChevronRight) {
                            onDismiss()
                            vm.openSession(session)
                        }
                    }
                }
            }
        }
    }
}

@Composable
private fun PaletteRow(theme: ThemeSpec, label: String, icon: ImageVector, onClick: () -> Unit) {
    Row(
        Modifier.fillMaxWidth().clickable(onClick = onClick).padding(horizontal = 14.dp, vertical = 10.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Icon(icon, contentDescription = null, tint = theme.muted, modifier = Modifier.size(15.dp))
        Spacer(Modifier.width(10.dp))
        Text(label, color = theme.ink, fontSize = 13.sp, maxLines = 1, overflow = TextOverflow.Ellipsis)
    }
}

// ------------------------------------------------------------------ helpers

private fun groupSessions(sessions: List<SessionInfo>): List<Pair<String, List<SessionInfo>>> {
    if (sessions.isEmpty()) return emptyList()
    val now = System.currentTimeMillis()
    val day = 86_400_000L
    val labels = linkedMapOf<String, MutableList<SessionInfo>>()
    sessions.sortedByDescending { it.updatedAt }.forEach { session ->
        val age = now - session.updatedAt
        val label = when {
            age < day -> "I DAG"
            age < 2 * day -> "I GÅR"
            age < 7 * day -> "SISTE 7 DAGER"
            else -> "ELDRE"
        }
        labels.getOrPut(label) { mutableListOf() }.add(session)
    }
    return labels.map { it.key to it.value.toList() }
}

private fun relative(ts: Long): String {
    if (ts <= 0) return ""
    val diff = System.currentTimeMillis() - ts
    val minutes = diff / 60_000
    return when {
        minutes < 1 -> "nå"
        minutes < 60 -> "${minutes} m"
        minutes < 24 * 60 -> "${minutes / 60} t"
        else -> SimpleDateFormat("d.MM", Locale.getDefault()).format(Date(ts))
    }
}

private fun formatTokenCount(value: Int): String = when {
    value >= 1_000_000 -> String.format(Locale.US, "%.1fM", value / 1_000_000.0)
    value >= 1_000 -> String.format(Locale.US, "%.0fK", value / 1_000.0)
    else -> value.toString()
}
