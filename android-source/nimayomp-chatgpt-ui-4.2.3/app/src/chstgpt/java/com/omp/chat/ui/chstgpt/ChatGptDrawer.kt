package com.omp.chat.ui.chstgpt

import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxHeight
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.navigationBarsPadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.statusBarsPadding
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.BasicTextField
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.outlined.Add
import androidx.compose.material.icons.outlined.Archive
import androidx.compose.material.icons.outlined.ChatBubbleOutline
import androidx.compose.material.icons.outlined.Close
import androidx.compose.material.icons.outlined.Computer
import androidx.compose.material.icons.outlined.Delete
import androidx.compose.material.icons.outlined.Edit
import androidx.compose.material.icons.outlined.Folder
import androidx.compose.material.icons.outlined.KeyboardArrowDown
import androidx.compose.material.icons.outlined.KeyboardArrowRight
import androidx.compose.material.icons.outlined.MoreHoriz
import androidx.compose.material.icons.outlined.PushPin
import androidx.compose.material.icons.outlined.Search
import androidx.compose.material.icons.outlined.Settings
import androidx.compose.material.icons.outlined.Terminal
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.DropdownMenu
import androidx.compose.material3.DropdownMenuItem
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.ModalDrawerSheet
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.OutlinedTextFieldDefaults
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.SolidColor
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import com.omp.chat.data.AppSettings
import com.omp.chat.data.PcProfile
import com.omp.chat.data.Project
import com.omp.chat.data.RepoState
import com.omp.chat.data.SessionSummary

private val RowH = 52.dp
private val RowShape = RoundedCornerShape(12.dp)

@Composable
fun ChatGptDrawer(
    state: RepoState,
    settings: AppSettings,
    filesRepo: com.omp.chat.data.FileManagerRepository? = null,
    pcProfiles: List<PcProfile>,
    activePcId: String,
    favoriteIds: Set<String>,
    onClose: () -> Unit,
    onNewChat: (String) -> Unit,
    onCreateProject: (String, String?) -> Unit = { _, _ -> },
    onHideProject: (String) -> Unit = {},
    onUnhideProject: (String) -> Unit = {},
    onRenameProject: (String, String) -> Unit = { _, _ -> },
    onDeleteProject: (String, Boolean) -> Unit = { _, _ -> },
    onOpenSession: (SessionSummary) -> Unit,
    onRename: (SessionSummary) -> Unit,
    onArchive: (SessionSummary, Boolean) -> Unit,
    onDelete: (SessionSummary) -> Unit,
    onToggleFavorite: (String) -> Unit,
    onSwitchPc: (String) -> Unit,
    onOpenPcs: () -> Unit,
    onOpenSettings: () -> Unit,
    onOpenFiles: () -> Unit,
    onOpenTasks: () -> Unit,
    onOpenTerminal: () -> Unit,
    onOpenGit: () -> Unit = {},
    onOpenCleanup: () -> Unit = {},
    onOpenArchived: () -> Unit = {}
) {
    val c = LocalChatGptColors.current
    val strings = com.omp.chat.ui.LocalStrings.current
    val english = settings.language == "en"
    val activePc = pcProfiles.firstOrNull { it.id == activePcId }
    var query by remember { mutableStateOf("") }
    var showCreateProject by remember { mutableStateOf(false) }
    var createProjectName by remember { mutableStateOf("") }
    var createProjectPath by remember { mutableStateOf("") }
    var showFolderPicker by remember { mutableStateOf(false) }
    var projectsOpen by remember { mutableStateOf(true) }
    var renameProjectTarget by remember { mutableStateOf<Project?>(null) }
    var showHiddenProjects by remember { mutableStateOf(false) }
    var expandedProjects by remember { mutableStateOf<Set<String>>(emptySet()) }
    var renameProjectName by remember { mutableStateOf("") }
    var pcDialog by remember { mutableStateOf(false) }
    var pendingPc by remember { mutableStateOf<PcProfile?>(null) }

    if (renameProjectTarget != null) {
        AlertDialog(
            onDismissRequest = { renameProjectTarget = null },
            title = { Text(if (english) "Rename" else "Gi nytt navn", color = c.textPrimary) },
            text = {
                OutlinedTextField(
                    value = renameProjectName, onValueChange = { renameProjectName = it }, singleLine = true,
                    colors = OutlinedTextFieldDefaults.colors(focusedTextColor = c.textPrimary, unfocusedTextColor = c.textPrimary, focusedBorderColor = c.accent, unfocusedBorderColor = c.divider)
                )
            },
            confirmButton = { TextButton(onClick = { renameProjectTarget?.let { onRenameProject(it.id, renameProjectName) }; renameProjectTarget = null }) { Text(if (english) "Save" else "Lagre", color = c.textPrimary) } },
            dismissButton = { TextButton(onClick = { renameProjectTarget = null }) { Text(strings.cancel, color = c.textSecondary) } },
            containerColor = c.surfaceElevated
        )
    }

    if (showCreateProject) {
        AlertDialog(
            onDismissRequest = { showCreateProject = false },
            title = { Text(if (english) "New project" else "Nytt prosjekt", color = c.textPrimary) },
            text = {
                Column(verticalArrangement = Arrangement.spacedBy(10.dp)) {
                    OutlinedTextField(
                        value = createProjectName, onValueChange = { createProjectName = it },
                        label = { Text(if (english) "Project name" else "Prosjektnavn", color = c.textSecondary) },
                        singleLine = true,
                        colors = OutlinedTextFieldDefaults.colors(focusedTextColor = c.textPrimary, unfocusedTextColor = c.textPrimary, focusedBorderColor = c.accent, unfocusedBorderColor = c.divider)
                    )
                    Row(verticalAlignment = Alignment.CenterVertically) {
                        Text(createProjectPath.ifBlank { if (english) "No folder selected" else "Ingen mappe valgt" }, style = MaterialTheme.typography.bodyMedium, color = if (createProjectPath.isNotBlank()) c.textPrimary else c.textTertiary, maxLines = 1, overflow = TextOverflow.Ellipsis, modifier = Modifier.weight(1f))
                        TextButton(onClick = { showFolderPicker = true }) { Text(if (english) "Choose" else "Velg", color = c.textPrimary) }
                    }
                }
            },
            confirmButton = { TextButton(onClick = { if (createProjectName.isNotBlank()) { onCreateProject(createProjectName, createProjectPath.ifBlank { null }); showCreateProject = false; createProjectName = ""; createProjectPath = "" } }, enabled = createProjectName.isNotBlank()) { Text(if (english) "Create" else "Opprett", color = c.textPrimary) } },
            dismissButton = { TextButton(onClick = { showCreateProject = false; createProjectName = ""; createProjectPath = "" }) { Text(strings.cancel, color = c.textSecondary) } },
            containerColor = c.surfaceElevated
        )
    }

    if (showFolderPicker && filesRepo != null) {
        com.omp.chat.ui.screens.PcFolderPickerDialog(repo = filesRepo, initial = createProjectPath, strings = com.omp.chat.ui.LocalStrings.current, onPick = { dir -> showFolderPicker = false; createProjectPath = dir }, onDismiss = { showFolderPicker = false })
    }

    val all = remember(state.sessions) { state.sessions }
    val searched = remember(all, query) {
        val q = query.trim()
        if (q.isBlank()) all else all.filter { it.title.contains(q, true) || it.cwd.contains(q, true) || it.model.contains(q, true) }
    }
    val projectPaths = state.projects.map { it.path.lowercase() }
    fun isProjectSession(s: SessionSummary) = projectPaths.any { s.cwd.lowercase().startsWith(it) }
    val isSearching = query.isNotBlank()
    val favorites = searched.filter { favoriteIds.contains(it.file) && it.messageCount > 0 }
    val rest = searched.filterNot { favoriteIds.contains(it.file) }.filter { it.messageCount > 0 }.filterNot { !isSearching && isProjectSession(it) }
    val groups = listOf(0 to strings.today, 1 to strings.yesterday, 2 to (if (english) "Previous 7 days" else "Siste 7 dager"), 3 to strings.older)

    ModalDrawerSheet(drawerContainerColor = c.sidebar, drawerContentColor = c.textPrimary, modifier = Modifier.width(340.dp)) {
        Column(Modifier.fillMaxHeight().statusBarsPadding()) {
            Row(Modifier.fillMaxWidth().padding(start = 12.dp, end = 6.dp, top = 8.dp, bottom = 4.dp), verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(4.dp)) {
                Row(Modifier.weight(1f).height(48.dp).clip(RoundedCornerShape(24.dp)).background(c.surfaceElevated).padding(horizontal = 14.dp), verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                    Icon(Icons.Outlined.Search, null, tint = c.textTertiary, modifier = Modifier.size(22.dp))
                    BasicTextField(value = query, onValueChange = { query = it }, singleLine = true, textStyle = MaterialTheme.typography.bodyLarge.copy(color = c.textPrimary), cursorBrush = SolidColor(c.textPrimary), modifier = Modifier.weight(1f), decorationBox = { inner ->
                        Box(contentAlignment = Alignment.CenterStart) { if (query.isEmpty()) Text(strings.searchChats, style = MaterialTheme.typography.bodyLarge, color = c.textTertiary); inner() }
                    })
                    if (query.isNotEmpty()) IconBtn(Icons.Outlined.Close, strings.close, 40, 20, c.textTertiary) { query = "" }
                }
                IconBtn(Icons.Outlined.Add, strings.newChat, 48, 24, c.textPrimary) { onNewChat(state.cwd); onClose() }
            }

            LazyColumn(modifier = Modifier.weight(1f), contentPadding = PaddingValues(horizontal = 8.dp, vertical = 4.dp), verticalArrangement = Arrangement.spacedBy(2.dp)) {
                if (query.isBlank()) {
                    if (state.cwd.isNotBlank()) {
                        item(key = "cwd-ctx") {
                            Row(
                                Modifier.fillMaxWidth().clip(RowShape).clickable { onOpenFiles(); onClose() }.padding(horizontal = 12.dp, vertical = 10.dp),
                                verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(12.dp)
                            ) {
                                Icon(Icons.Outlined.Folder, null, tint = c.textTertiary, modifier = Modifier.size(22.dp))
                                Column(Modifier.weight(1f)) {
                                    Text(if (english) "Working folder" else "Arbeidsmappe", style = MaterialTheme.typography.labelMedium, color = c.textTertiary)
                                    Text(shortCwd(state.cwd), style = MaterialTheme.typography.bodyMedium, color = c.textPrimary, maxLines = 1, overflow = TextOverflow.Ellipsis)
                                }
                            }
                        }
                    }
                    item { DrawerAction(Icons.Outlined.ChatBubbleOutline, strings.newChat) { onNewChat(state.cwd); onClose() } }
                    item { DrawerAction(Icons.Outlined.Folder, if (english) "Files" else "Filer") { onOpenFiles(); onClose() } }
                    item { DrawerAction(Icons.Outlined.Terminal, "Terminal") { onOpenTerminal(); onClose() } }
                    item { DrawerAction(Icons.Outlined.Archive, if (english) "Archived" else "Arkivert") { onOpenArchived(); onClose() } }

                    item {
                        Row(Modifier.fillMaxWidth().height(RowH).clip(RowShape).clickable { projectsOpen = !projectsOpen }.padding(start = 12.dp, end = 4.dp), verticalAlignment = Alignment.CenterVertically) {
                            Text(strings.projects, style = MaterialTheme.typography.labelLarge, color = c.textTertiary, modifier = Modifier.weight(1f))
                            IconBtn(if (projectsOpen) Icons.Outlined.KeyboardArrowDown else Icons.Outlined.KeyboardArrowRight, null, 44, 22, c.textTertiary) { projectsOpen = !projectsOpen }
                            IconBtn(Icons.Outlined.Add, if (english) "New project" else "Nytt prosjekt", 44, 22, c.textTertiary) { showCreateProject = true }
                        }
                    }
                    val visibleProjects = state.projects.filter { showHiddenProjects || !it.hidden }.distinctBy { it.id }
                    if (projectsOpen) {
                        items(visibleProjects, key = { "p-${it.id}-${it.path}" }) { project ->
                            val projectSessions = state.sessions.filter { s -> s.cwd.startsWith(project.path, true) }.sortedByDescending { it.updatedAt }
                            val isExpanded = expandedProjects.contains(project.id)
                            Column {
                                Row(Modifier.fillMaxWidth().height(RowH).clip(RowShape).clickable { expandedProjects = if (isExpanded) expandedProjects - project.id else expandedProjects + project.id }.padding(start = 12.dp, end = 4.dp), verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                                    Icon(Icons.Outlined.Folder, null, tint = c.textPrimary, modifier = Modifier.size(22.dp))
                                    Text(project.name, style = MaterialTheme.typography.bodyLarge, color = c.textPrimary, maxLines = 1, overflow = TextOverflow.Ellipsis, modifier = Modifier.weight(1f))
                                    if (project.sessionCount > 0) Text("${project.sessionCount}", style = MaterialTheme.typography.labelMedium, color = c.textTertiary)
                                    var pm by remember { mutableStateOf(false) }
                                    Box {
                                        IconBtn(Icons.Outlined.MoreHoriz, null, 44, 22, c.textTertiary) { pm = true }
                                        DropdownMenu(expanded = pm, onDismissRequest = { pm = false }, containerColor = c.surfaceElevated, shape = RoundedCornerShape(16.dp)) {
                                            DItem(Icons.Outlined.Add, strings.newChat, c.textPrimary) { pm = false; onNewChat(project.path); onClose() }
                                            DItem(Icons.Outlined.Edit, if (english) "Rename" else "Gi nytt navn", c.textPrimary) { pm = false; renameProjectTarget = project; renameProjectName = project.name }
                                            DItem(Icons.Outlined.Archive, if (project.hidden) (if (english) "Unhide" else "Vis") else (if (english) "Hide" else "Skjul"), c.textPrimary) { pm = false; if (project.hidden) onUnhideProject(project.id) else onHideProject(project.id) }
                                            DItem(Icons.Outlined.Delete, if (english) "Remove from list" else "Fjern fra listen", c.textPrimary) { pm = false; onDeleteProject(project.id, false) }
                                            DItem(Icons.Outlined.Delete, if (english) "Delete folder from PC" else "Slett mappe fra PC", c.error) { pm = false; onDeleteProject(project.id, true) }
                                        }
                                    }
                                }
                                if (isExpanded) {
                                    projectSessions.take(6).forEach { session ->
                                        SessionRow(session, session.file == state.sessionFile, session.file == state.sessionFile && state.streaming, favoriteIds.contains(session.file), true, { onOpenSession(session); onClose() }, { onToggleFavorite(session.file) }, { onRename(session) }, { onArchive(session, !session.archived) }, { onDelete(session) }, strings)
                                    }
                                    if (projectSessions.size > 6) Text(if (english) "Show ${projectSessions.size - 6} more" else "Vis ${projectSessions.size - 6} flere", style = MaterialTheme.typography.bodyMedium, color = c.textTertiary, modifier = Modifier.fillMaxWidth().height(44.dp).clip(RowShape).clickable { }.padding(start = 48.dp, top = 10.dp))
                                    if (projectSessions.isEmpty()) Text(if (english) "No chats yet" else "Ingen samtaler ennå", style = MaterialTheme.typography.bodyMedium, color = c.textTertiary, modifier = Modifier.padding(start = 48.dp, top = 6.dp, bottom = 10.dp))
                                }
                            }
                        }
                        if (state.projects.any { it.hidden }) item { Text(if (showHiddenProjects) (if (english) "Hide hidden projects" else "Skjul skjulte prosjekter") else (if (english) "Show hidden projects" else "Vis skjulte prosjekter"), style = MaterialTheme.typography.bodyMedium, color = c.textTertiary, modifier = Modifier.fillMaxWidth().height(44.dp).clip(RowShape).clickable { showHiddenProjects = !showHiddenProjects }.padding(start = 12.dp, top = 10.dp)) }
                    }
                }

                if (favorites.isNotEmpty()) {
                    item { Section(if (english) "Pinned" else "Festet") }
                    items(favorites.distinctBy { it.file }, key = { "fav-${it.file}" }) { s -> SessionRow(s, s.file == state.sessionFile, s.file == state.sessionFile && state.streaming, true, false, { onOpenSession(s); onClose() }, { onToggleFavorite(s.file) }, { onRename(s) }, { onArchive(s, !s.archived) }, { onDelete(s) }, strings) }
                }
                groups.forEach { (bucket, label) ->
                    val inBucket = rest.filter { dayBucket(it.updatedAt) == bucket }
                    if (inBucket.isNotEmpty()) {
                        item(key = "b-$bucket") { Section(label) }
                        items(inBucket.distinctBy { it.file }, key = { "s-${it.file}-${bucket}" }) { s -> SessionRow(s, s.file == state.sessionFile, s.file == state.sessionFile && state.streaming, favoriteIds.contains(s.file), false, { onOpenSession(s); onClose() }, { onToggleFavorite(s.file) }, { onRename(s) }, { onArchive(s, !s.archived) }, { onDelete(s) }, strings) }
                    }
                }
                if (rest.isEmpty() && favorites.isEmpty()) item { Text(if (query.isBlank()) (if (english) "No chats yet" else "Ingen samtaler ennå") else strings.searchChats, style = MaterialTheme.typography.bodyLarge, color = c.textTertiary, modifier = Modifier.padding(16.dp)) }
                item { Spacer(Modifier.height(8.dp)) }
            }

            HorizontalDivider(color = c.divider)
            Row(Modifier.fillMaxWidth().padding(horizontal = 8.dp, vertical = 8.dp), verticalAlignment = Alignment.CenterVertically) {
                Row(Modifier.weight(1f).height(56.dp).clip(RoundedCornerShape(16.dp)).clickable { pcDialog = true }.padding(horizontal = 8.dp), verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(12.dp)) {
                    Box(Modifier.size(40.dp).clip(CircleShape).background(c.surfaceElevated), contentAlignment = Alignment.Center) { Icon(Icons.Outlined.Computer, null, tint = c.textPrimary, modifier = Modifier.size(22.dp)) }
                    Column(Modifier.weight(1f)) {
                        Text(activePc?.name?.takeIf { it.isNotBlank() } ?: (if (english) "Select PC" else "Velg PC"), style = MaterialTheme.typography.bodyLarge, fontWeight = FontWeight.Medium, color = c.textPrimary, maxLines = 1, overflow = TextOverflow.Ellipsis)
                        Text(if (state.connected) strings.connected else strings.disconnected, style = MaterialTheme.typography.labelMedium, color = c.textTertiary)
                    }
                }
                IconBtn(Icons.Outlined.Settings, strings.settings, 48, 24, c.textPrimary) { onOpenSettings(); onClose() }
            }
            Row(Modifier.padding(horizontal = 12.dp).navigationBarsPadding(), horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                TextButton(onClick = { onOpenTasks(); onClose() }) { Text(if (english) "Tasks" else "Oppgaver", color = c.textTertiary) }
                TextButton(onClick = { onOpenGit(); onClose() }) { Text("Git", color = c.textTertiary) }
                TextButton(onClick = { onOpenCleanup(); onClose() }) { Text(if (english) "Clean up" else "Rydd opp", color = c.textTertiary) }
            }
            Spacer(Modifier.height(4.dp))
        }
    }

    if (pcDialog) {
        AlertDialog(onDismissRequest = { pcDialog = false }, containerColor = c.surfaceElevated, title = { Text(if (english) "Choose PC" else "Velg PC", color = c.textPrimary) }, text = {
            Column(verticalArrangement = Arrangement.spacedBy(4.dp)) {
                if (pcProfiles.isEmpty()) Text(if (english) "No PCs paired yet." else "Ingen PC-er er paret ennå.", color = c.textSecondary)
                pcProfiles.forEach { profile ->
                    val isActive = profile.id == activePcId
                    Row(Modifier.fillMaxWidth().height(52.dp).clip(RowShape).background(if (isActive) c.selected else androidx.compose.ui.graphics.Color.Transparent).clickable { if (isActive) pcDialog = false else { pcDialog = false; pendingPc = profile } }.padding(horizontal = 12.dp), verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(12.dp)) {
                        Box(Modifier.size(36.dp).clip(CircleShape).background(c.surface), contentAlignment = Alignment.Center) { Text(profile.name.take(1).uppercase().ifBlank { "P" }, color = c.textPrimary, style = MaterialTheme.typography.labelLarge) }
                        Column(Modifier.weight(1f)) { Text(profile.name.ifBlank { profile.baseUrl }, color = c.textPrimary, style = MaterialTheme.typography.bodyLarge, maxLines = 1, overflow = TextOverflow.Ellipsis); Text(profile.baseUrl, color = c.textTertiary, style = MaterialTheme.typography.labelMedium, maxLines = 1, overflow = TextOverflow.Ellipsis) }
                        if (isActive) Text(if (english) "Active" else "Aktiv", color = c.textSecondary, style = MaterialTheme.typography.labelMedium)
                    }
                }
            }
        }, confirmButton = { TextButton(onClick = { pcDialog = false; onOpenPcs() }) { Text(if (english) "Manage" else "Administrer", color = c.textPrimary) } }, dismissButton = { TextButton(onClick = { pcDialog = false }) { Text(strings.cancel, color = c.textSecondary) } })
    }
    pendingPc?.let { target ->
        AlertDialog(onDismissRequest = { pendingPc = null }, containerColor = c.surfaceElevated, title = { Text(if (english) "Switch to ${target.name}?" else "Bytt til ${target.name}?", color = c.textPrimary) }, text = { Text(if (english) "Current conversation closes. ${target.name} has its own history." else "Gjeldende samtale lukkes. ${target.name} har sin egen historikk.", color = c.textSecondary) }, confirmButton = { TextButton(onClick = { pendingPc = null; onSwitchPc(target.id); onClose() }) { Text(if (english) "Switch" else "Bytt", color = c.textPrimary) } }, dismissButton = { TextButton(onClick = { pendingPc = null }) { Text(strings.cancel, color = c.textSecondary) } })
    }
}

@Composable private fun Section(text: String) { val c = LocalChatGptColors.current; Text(text, style = MaterialTheme.typography.labelLarge, color = c.textTertiary, modifier = Modifier.padding(start = 12.dp, top = 18.dp, bottom = 6.dp)) }

@Composable private fun DrawerAction(icon: ImageVector, label: String, onClick: () -> Unit) {
    val c = LocalChatGptColors.current
    Row(Modifier.fillMaxWidth().height(RowH).clip(RowShape).clickable(onClick = onClick).padding(horizontal = 12.dp), verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(14.dp)) {
        Icon(icon, null, tint = c.textPrimary, modifier = Modifier.size(24.dp))
        Text(label, style = MaterialTheme.typography.bodyLarge, color = c.textPrimary, maxLines = 1, overflow = TextOverflow.Ellipsis)
    }
}

@Composable private fun SessionRow(session: SessionSummary, active: Boolean, streaming: Boolean, favorite: Boolean, nested: Boolean, onOpen: () -> Unit, onFav: () -> Unit, onRename: () -> Unit, onArchive: () -> Unit, onDelete: () -> Unit, strings: com.omp.chat.ui.Strings) {
    val c = LocalChatGptColors.current; var menu by remember { mutableStateOf(false) }
    Row(Modifier.fillMaxWidth().height(RowH).clip(RowShape).background(if (active) c.selected else androidx.compose.ui.graphics.Color.Transparent).clickable(onClick = onOpen).padding(start = if (nested) 36.dp else 12.dp, end = 2.dp), verticalAlignment = Alignment.CenterVertically) {
        if (streaming) Box(Modifier.size(8.dp).clip(CircleShape).background(c.online)) else if (favorite) Icon(Icons.Outlined.PushPin, null, tint = c.textTertiary, modifier = Modifier.size(16.dp))
        if (streaming || favorite) Spacer(Modifier.width(8.dp))
        Text(session.title.ifBlank { strings.newChat }, style = MaterialTheme.typography.bodyLarge, color = if (active) c.textPrimary else c.textSecondary, maxLines = 1, overflow = TextOverflow.Ellipsis, modifier = Modifier.weight(1f))
        Box {
            IconBtn(Icons.Outlined.MoreHoriz, null, 48, 22, c.textTertiary) { menu = true }
            DropdownMenu(expanded = menu, onDismissRequest = { menu = false }, containerColor = c.surfaceElevated, shape = RoundedCornerShape(16.dp)) {
                DItem(Icons.Outlined.PushPin, if (favorite) "Løsne" else "Fest", c.textPrimary) { menu = false; onFav() }
                DItem(Icons.Outlined.Edit, strings.rename, c.textPrimary) { menu = false; onRename() }
                DItem(Icons.Outlined.Archive, if (session.archived) strings.unarchive else strings.archive, c.textPrimary) { menu = false; onArchive() }
                DItem(Icons.Outlined.Delete, strings.delete, c.error) { menu = false; onDelete() }
            }
        }
    }
}

@Composable private fun IconBtn(icon: ImageVector, desc: String?, size: Int, iconSize: Int, tint: androidx.compose.ui.graphics.Color, onClick: () -> Unit) {
    Box(Modifier.size(size.dp).clip(CircleShape).clickable(onClick = onClick), contentAlignment = Alignment.Center) { Icon(icon, desc, tint = tint, modifier = Modifier.size(iconSize.dp)) }
}

@Composable private fun DItem(icon: ImageVector, label: String, tint: androidx.compose.ui.graphics.Color, onClick: () -> Unit) {
    DropdownMenuItem(text = { Text(label, style = MaterialTheme.typography.bodyLarge, color = tint) }, leadingIcon = { Icon(icon, null, tint = tint, modifier = Modifier.size(22.dp)) }, onClick = onClick, modifier = Modifier.height(52.dp))
}
private fun shortCwd(path: String): String {
    val p = path.trim().trimEnd('/','\\')
    if (p.isEmpty()) return ""
    val parts = p.split('/','\\').filter { it.isNotBlank() }
    return when {
        parts.isEmpty() -> p
        parts.size <= 2 -> parts.joinToString(" / ")
        else -> "… / "
    }
}