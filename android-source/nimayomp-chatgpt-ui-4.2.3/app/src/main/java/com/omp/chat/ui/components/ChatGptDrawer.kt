package com.omp.chat.ui.components

import androidx.compose.animation.core.LinearEasing
import androidx.compose.animation.core.RepeatMode
import androidx.compose.animation.core.animateFloat
import androidx.compose.animation.core.infiniteRepeatable
import androidx.compose.animation.core.rememberInfiniteTransition
import androidx.compose.animation.core.tween
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
import androidx.compose.foundation.lazy.rememberLazyListState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.BasicTextField
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Close
import androidx.compose.material.icons.filled.Computer
import androidx.compose.material.icons.filled.Delete
import androidx.compose.material.icons.filled.Edit
import androidx.compose.material.icons.filled.List
import androidx.compose.material.icons.filled.MoreHoriz
import androidx.compose.material.icons.filled.Settings
import androidx.compose.material.icons.filled.Star
import androidx.compose.material.icons.outlined.StarBorder
import androidx.compose.material3.DropdownMenu
import androidx.compose.material3.DropdownMenuItem
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.draw.drawBehind
import androidx.compose.ui.draw.rotate
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.SolidColor
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.omp.chat.data.ActiveBridgeSession
import com.omp.chat.data.CwdPath
import com.omp.chat.data.RepoState
import com.omp.chat.data.SessionSummary
import com.omp.chat.ui.LocalStrings
import com.omp.chat.ui.theme.NimayAccent
import com.omp.chat.ui.theme.NimayDivider
import com.omp.chat.ui.theme.NimayInput
import com.omp.chat.ui.theme.NimaySidebar
import com.omp.chat.ui.theme.NimayTextPrimary
import com.omp.chat.ui.theme.NimayTextSecondary

private val RowHeight = 48.dp
private val RowShape = RoundedCornerShape(12.dp)
private val RowHighlight = Color(0xFF2A2A2A)

@Composable
fun ChatGptDrawerContent(
    state: RepoState,
    currentSessionFile: String,
    pcName: String,
    onOpenSession: (SessionSummary) -> Unit,
    onNewChat: (String) -> Unit,
    onSelectProject: (String) -> Unit,
    onOpenModelPicker: () -> Unit,
    onRename: (SessionSummary) -> Unit,
    onArchive: (SessionSummary, Boolean) -> Unit,
    onDelete: (SessionSummary) -> Unit,
    onOpenSettings: () -> Unit,
    onOpenFiles: () -> Unit,
    onOpenPcs: () -> Unit,
    onOpenTasks: () -> Unit,
    onOpenTerminal: () -> Unit,
    onOpenGit: () -> Unit,
    onReconnect: () -> Unit,
    onOpenActiveChat: () -> Unit,
    onOpenCleanup: () -> Unit,
    onOpenProjectHistory: (String) -> Unit,
    loadActiveBridge: suspend () -> ActiveBridgeSession?,
    animatedActive: Boolean,
    onToggleFavorite: (String) -> Unit,
    isFavorite: (String) -> Boolean,
    onCloseDrawer: () -> Unit
) {
    val strings = LocalStrings.current
    var query by remember { mutableStateOf("") }
    val expandedProjects = remember { mutableStateOf(setOf<String>()) }
    val listState = rememberLazyListState()
    val activeBridgeFile = state.activeBridgeSession?.sessionFile

    val recentSessions = remember(state.sessions) { state.sessions.take(15) }
    val favoriteSessions = remember(state.sessions) { state.sessions.filter { isFavorite(it.file) } }
    val searchResults = remember(state.sessions, query) {
        if (query.isBlank()) emptyList()
        else state.sessions.filter {
            it.title.contains(query, ignoreCase = true) || it.cwd.contains(query, ignoreCase = true)
        }
    }

    fun row(session: SessionSummary, nested: Boolean = false): @Composable () -> Unit = {
        SessionRow(
            session = session,
            nested = nested,
            isActive = session.file == currentSessionFile,
            isLive = session.file == activeBridgeFile,
            isWorking = session.file == currentSessionFile && state.streaming,
            animatedActive = animatedActive,
            favorite = isFavorite(session.file),
            onOpen = { onOpenSession(session); onCloseDrawer() },
            onToggleFavorite = { onToggleFavorite(session.file) },
            onRename = { onRename(session); onCloseDrawer() },
            onArchive = { onArchive(session, true) },
            onDelete = { onDelete(session); onCloseDrawer() }
        )
    }

    Column(
        modifier = Modifier
            .fillMaxHeight()
            .width(336.dp)
            .background(NimaySidebar)
            .statusBarsPadding()
            .navigationBarsPadding()
    ) {
        // --------------------------------------------------------- Search row
        Row(
            modifier = Modifier
                .fillMaxWidth()
                .padding(start = 12.dp, end = 8.dp, top = 8.dp, bottom = 4.dp),
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.spacedBy(4.dp)
        ) {
            Row(
                modifier = Modifier
                    .weight(1f)
                    .height(48.dp)
                    .clip(RoundedCornerShape(24.dp))
                    .background(RowHighlight)
                    .padding(horizontal = 14.dp),
                verticalAlignment = Alignment.CenterVertically,
                horizontalArrangement = Arrangement.spacedBy(10.dp)
            ) {
                Icon(OmpIcons.Search, null, tint = NimayTextSecondary, modifier = Modifier.size(20.dp))
                BasicTextField(
                    value = query,
                    onValueChange = { query = it },
                    singleLine = true,
                    textStyle = MaterialTheme.typography.bodyLarge.copy(color = NimayTextPrimary),
                    cursorBrush = SolidColor(NimayAccent),
                    modifier = Modifier.weight(1f),
                    decorationBox = { inner ->
                        Box(contentAlignment = Alignment.CenterStart) {
                            if (query.isEmpty()) {
                                Text(
                                    strings.searchChats,
                                    style = MaterialTheme.typography.bodyLarge,
                                    color = NimayTextSecondary
                                )
                            }
                            inner()
                        }
                    }
                )
                if (query.isNotEmpty()) {
                    Box(
                        Modifier.size(32.dp).clip(CircleShape).clickable { query = "" },
                        contentAlignment = Alignment.Center
                    ) {
                        Icon(Icons.Default.Close, null, tint = NimayTextSecondary, modifier = Modifier.size(18.dp))
                    }
                }
            }
            Box(
                Modifier
                    .size(48.dp)
                    .clip(CircleShape)
                    .clickable { onNewChat(state.cwd); onCloseDrawer() },
                contentAlignment = Alignment.Center
            ) {
                Icon(OmpIcons.NewChat, strings.newChat, tint = NimayTextPrimary, modifier = Modifier.size(24.dp))
            }
        }

        LazyColumn(
            state = listState,
            modifier = Modifier.weight(1f),
            contentPadding = PaddingValues(horizontal = 8.dp, vertical = 4.dp),
            verticalArrangement = Arrangement.spacedBy(2.dp)
        ) {
            if (query.isNotBlank()) {
                items(searchResults, key = { it.file }) { row(it)() }
                if (searchResults.isEmpty()) {
                    item {
                        Text(
                            strings.noResults,
                            style = MaterialTheme.typography.bodyLarge,
                            color = NimayTextSecondary,
                            modifier = Modifier.padding(16.dp)
                        )
                    }
                }
            } else {
                // ---------------------------------------------- Navigation
                item { NavRow(OmpIcons.NewChat, strings.newChat) { onNewChat(state.cwd); onCloseDrawer() } }
                item { NavRow(OmpIcons.Folder, strings.fileManagerTitle) { onOpenFiles(); onCloseDrawer() } }
                item { NavRow(Icons.Default.List, "Oppgaver") { onOpenTasks(); onCloseDrawer() } }
                item { NavRow(OmpIcons.Terminal, strings.terminal) { onOpenTerminal(); onCloseDrawer() } }
                item { NavRow(OmpIcons.Git, "Git") { onOpenGit(); onCloseDrawer() } }

                // ------------------------------------------------ Aktiv
                state.activeBridgeSession?.let { active ->
                    val sess = state.sessions.firstOrNull { it.file == active.sessionFile }
                    item { SectionHeader(if (active.source == "omp-tui") "Aktiv på PC-en" else "Aktiv i Bridge") }
                    item {
                        NavRow(
                            icon = OmpIcons.Chat,
                            label = sess?.title?.ifBlank { active.sessionId } ?: active.sessionId
                        ) { onOpenActiveChat(); onCloseDrawer() }
                    }
                }

                // -------------------------------------------- Favoritter
                if (favoriteSessions.isNotEmpty()) {
                    item { SectionHeader("Favoritter") }
                    items(favoriteSessions, key = { "fav-" + it.file }) { row(it)() }
                }

                // ---------------------------------------------- Prosjekter
                if (state.projects.isNotEmpty()) {
                    item { SectionHeader("Prosjekter") }
                }
                items(state.projects, key = { it.path }) { project ->
                    val expanded = expandedProjects.value.contains(project.path)
                    Column {
                        Row(
                            modifier = Modifier
                                .fillMaxWidth()
                                .height(RowHeight)
                                .clip(RowShape)
                                .clickable {
                                    expandedProjects.value =
                                        if (expanded) expandedProjects.value - project.path
                                        else expandedProjects.value + project.path
                                }
                                .padding(start = 12.dp, end = 12.dp),
                            verticalAlignment = Alignment.CenterVertically,
                            horizontalArrangement = Arrangement.spacedBy(14.dp)
                        ) {
                            Icon(
                                OmpIcons.Folder,
                                null,
                                tint = if (project.exists) NimayTextPrimary else NimayTextSecondary,
                                modifier = Modifier.size(22.dp)
                            )
                            Text(
                                project.name,
                                style = MaterialTheme.typography.bodyLarge,
                                color = NimayTextPrimary,
                                maxLines = 1,
                                overflow = TextOverflow.Ellipsis,
                                modifier = Modifier.weight(1f)
                            )
                            if (project.sessionCount > 0) {
                                Text(
                                    "${project.sessionCount}",
                                    style = MaterialTheme.typography.labelMedium,
                                    color = NimayTextSecondary
                                )
                            }
                            Icon(
                                if (expanded) OmpIcons.ChevronDown else OmpIcons.ChevronRight,
                                null,
                                tint = NimayTextSecondary,
                                modifier = Modifier.size(20.dp)
                            )
                        }
                        if (expanded) {
                            val projectSessions = state.sessions
                                .filter { CwdPath.same(it.cwd, project.path) }
                                .take(5)
                            projectSessions.forEach { row(it, nested = true)() }
                            if (project.sessionCount > 5) {
                                Text(
                                    "Vis ${project.sessionCount - 5} eldre samtaler",
                                    style = MaterialTheme.typography.bodyMedium,
                                    color = NimayTextSecondary,
                                    modifier = Modifier
                                        .fillMaxWidth()
                                        .height(44.dp)
                                        .clip(RowShape)
                                        .clickable { onOpenProjectHistory(project.path); onCloseDrawer() }
                                        .padding(start = 48.dp, top = 11.dp)
                                )
                            }
                        }
                    }
                }
                if (state.projects.isEmpty()) {
                    item {
                        Text(
                            strings.noProjects,
                            style = MaterialTheme.typography.bodyMedium,
                            color = NimayTextSecondary,
                            modifier = Modifier.padding(16.dp)
                        )
                    }
                }

                // ------------------------------------------------ Samtaler
                item { SectionHeader(strings.chats) }
                items(recentSessions, key = { "recent-" + it.file }) { row(it)() }
                item { NavRow(OmpIcons.Archive, "Rydd opp i samtaler", muted = true) { onOpenCleanup(); onCloseDrawer() } }
            }
        }

        // ------------------------------------------------------ Bottom bar
        Row(
            modifier = Modifier
                .fillMaxWidth()
                .padding(horizontal = 8.dp, vertical = 8.dp),
            verticalAlignment = Alignment.CenterVertically
        ) {
            Row(
                modifier = Modifier
                    .weight(1f)
                    .height(56.dp)
                    .clip(RoundedCornerShape(16.dp))
                    .clickable { onOpenPcs(); onCloseDrawer() }
                    .padding(horizontal = 8.dp),
                verticalAlignment = Alignment.CenterVertically,
                horizontalArrangement = Arrangement.spacedBy(12.dp)
            ) {
                Box(
                    Modifier.size(40.dp).clip(CircleShape).background(Color(0xFF3A3A3A)),
                    contentAlignment = Alignment.Center
                ) {
                    Icon(Icons.Default.Computer, null, tint = NimayTextPrimary, modifier = Modifier.size(22.dp))
                    Box(
                        Modifier
                            .align(Alignment.BottomEnd)
                            .size(12.dp)
                            .background(NimaySidebar, CircleShape)
                            .padding(2.dp)
                            .background(if (state.connected) Color(0xFF10A37F) else Color(0xFF8E8E8E), CircleShape)
                    )
                }
                Column(Modifier.weight(1f)) {
                    Text(
                        pcName,
                        style = MaterialTheme.typography.bodyLarge,
                        fontWeight = FontWeight.Medium,
                        color = NimayTextPrimary,
                        maxLines = 1,
                        overflow = TextOverflow.Ellipsis
                    )
                    Text(
                        if (state.connected) strings.connected else strings.disconnected,
                        style = MaterialTheme.typography.labelMedium,
                        color = NimayTextSecondary,
                        maxLines = 1
                    )
                }
            }
            Box(
                Modifier
                    .size(48.dp)
                    .clip(CircleShape)
                    .clickable { onOpenSettings(); onCloseDrawer() },
                contentAlignment = Alignment.Center
            ) {
                Icon(Icons.Default.Settings, strings.settings, tint = NimayTextPrimary, modifier = Modifier.size(24.dp))
            }
        }
    }
}

@Composable
private fun SectionHeader(text: String) {
    Text(
        text,
        style = MaterialTheme.typography.labelLarge,
        color = NimayTextSecondary,
        modifier = Modifier.padding(start = 12.dp, top = 18.dp, bottom = 6.dp)
    )
}

@Composable
private fun NavRow(icon: ImageVector, label: String, muted: Boolean = false, onClick: () -> Unit) {
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .height(RowHeight)
            .clip(RowShape)
            .clickable(onClick = onClick)
            .padding(horizontal = 12.dp),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(14.dp)
    ) {
        Icon(icon, null, tint = if (muted) NimayTextSecondary else NimayTextPrimary, modifier = Modifier.size(22.dp))
        Text(
            label,
            style = MaterialTheme.typography.bodyLarge,
            color = if (muted) NimayTextSecondary else NimayTextPrimary,
            maxLines = 1,
            overflow = TextOverflow.Ellipsis
        )
    }
}

@Composable
private fun SessionRow(
    session: SessionSummary,
    nested: Boolean,
    isActive: Boolean,
    isLive: Boolean,
    isWorking: Boolean,
    animatedActive: Boolean,
    favorite: Boolean,
    onOpen: () -> Unit,
    onToggleFavorite: () -> Unit,
    onRename: () -> Unit,
    onArchive: () -> Unit,
    onDelete: () -> Unit
) {
    var menuOpen by remember { mutableStateOf(false) }
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .height(RowHeight)
            .clip(RowShape)
            .background(if (isActive) RowHighlight else Color.Transparent)
            .clickable(onClick = onOpen)
            .padding(start = if (nested) 36.dp else 12.dp),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(10.dp)
    ) {
        if (isLive) ActiveSessionIndicator(animated = animatedActive, working = isWorking)
        Text(
            text = session.title.ifBlank { session.file.substringAfterLast('/') },
            style = MaterialTheme.typography.bodyLarge,
            color = NimayTextPrimary,
            maxLines = 1,
            overflow = TextOverflow.Ellipsis,
            modifier = Modifier.weight(1f)
        )
        if (favorite) {
            Icon(Icons.Default.Star, null, tint = NimayTextSecondary, modifier = Modifier.size(16.dp))
        }
        Box {
            Box(
                Modifier
                    .size(48.dp)
                    .clip(CircleShape)
                    .clickable { menuOpen = true },
                contentAlignment = Alignment.Center
            ) {
                Icon(
                    Icons.Default.MoreHoriz,
                    contentDescription = null,
                    tint = NimayTextSecondary,
                    modifier = Modifier.size(24.dp)
                )
            }
            DropdownMenu(
                expanded = menuOpen,
                onDismissRequest = { menuOpen = false },
                shape = RoundedCornerShape(16.dp),
                containerColor = Color(0xFF2F2F2F)
            ) {
                MenuItem(
                    icon = if (favorite) Icons.Default.Star else Icons.Outlined.StarBorder,
                    label = if (favorite) "Fjern favoritt" else "Favoritt"
                ) { menuOpen = false; onToggleFavorite() }
                MenuItem(Icons.Default.Edit, "Gi nytt navn") { menuOpen = false; onRename() }
                MenuItem(OmpIcons.Archive, "Arkiver") { menuOpen = false; onArchive() }
                MenuItem(Icons.Default.Delete, "Slett", destructive = true) { menuOpen = false; onDelete() }
            }
        }
    }
}

@Composable
private fun MenuItem(icon: ImageVector, label: String, destructive: Boolean = false, onClick: () -> Unit) {
    val tint = if (destructive) Color(0xFFFF6B6B) else NimayTextPrimary
    DropdownMenuItem(
        text = { Text(label, style = MaterialTheme.typography.bodyLarge, color = tint) },
        leadingIcon = { Icon(icon, null, tint = tint, modifier = Modifier.size(22.dp)) },
        onClick = onClick,
        modifier = Modifier.height(52.dp)
    )
}
@Composable
private fun ActiveSessionIndicator(animated: Boolean, working: Boolean) {
    val angle = if (animated) {
        val transition = rememberInfiniteTransition(label = "live")
        transition.animateFloat(
            initialValue = 0f,
            targetValue = 360f,
            animationSpec = infiniteRepeatable(
                animation = tween(durationMillis = if (working) 1400 else 3200, easing = LinearEasing),
                repeatMode = RepeatMode.Restart
            ),
            label = "angle"
        ).value
    } else {
        0f
    }
    val colors = listOf(
        Color(0xFF007AFF),
        Color(0xFF5AC8FA),
        Color(0xFFBF5AF2),
        Color(0xFF007AFF)
    )
    val brush = if (animated) Brush.sweepGradient(colors) else SolidColor(NimayAccent)
    Box(
        modifier = Modifier
            .size(12.dp)
            .rotate(angle)
            .drawBehind {
                drawCircle(
                    brush = brush,
                    radius = size.minDimension / 2f,
                    style = Stroke(width = 2.dp.toPx())
                )
            }
    )
}
