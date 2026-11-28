package net.nimay.chatompomp.desktop

import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.RowScope
import androidx.compose.foundation.layout.Spacer
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
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.BasicTextField
import androidx.compose.foundation.text.selection.SelectionContainer
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material.icons.filled.AccountTree
import androidx.compose.material.icons.filled.Create
import androidx.compose.material.icons.filled.Delete
import androidx.compose.material.icons.filled.Description
import androidx.compose.material.icons.filled.Folder
import androidx.compose.material.icons.filled.MoreVert
import androidx.compose.material.icons.filled.PhoneAndroid
import androidx.compose.material.icons.filled.RecordVoiceOver
import androidx.compose.material.icons.filled.Refresh
import androidx.compose.material.icons.filled.Terminal
import androidx.compose.material.icons.filled.VolumeUp
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
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.SolidColor
import androidx.compose.ui.input.key.Key
import androidx.compose.ui.input.key.KeyEventType
import androidx.compose.ui.input.key.key
import androidx.compose.ui.input.key.onPreviewKeyEvent
import androidx.compose.ui.input.key.type
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Button
import org.json.JSONObject

// ------------------------------------------------------------------ shared bits

/** Tool screen header: back arrow, title + subtitle, and per-screen actions. */
@Composable
fun ToolBar(
    title: String,
    onBack: () -> Unit,
    subtitle: String = "",
    actions: @Composable RowScope.() -> Unit = {},
) {
    Row(
        Modifier.fillMaxWidth().height(56.dp).padding(start = 6.dp, end = 10.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        IconButton(onClick = onBack, modifier = Modifier.size(28.dp)) {
            Icon(
                Icons.AutoMirrored.Filled.ArrowBack,
                contentDescription = t("Tilbake", "Back"),
                tint = MaterialTheme.colorScheme.onSurfaceVariant,
                modifier = Modifier.size(18.dp),
            )
        }
        Spacer(Modifier.width(6.dp))
        Column(Modifier.weight(1f)) {
            Text(
                title,
                fontSize = 13.5.sp,
                fontWeight = FontWeight.SemiBold,
                color = MaterialTheme.colorScheme.onBackground,
                maxLines = 1,
                overflow = androidx.compose.ui.text.style.TextOverflow.Ellipsis,
            )
            if (subtitle.isNotBlank()) {
                Text(
                    subtitle,
                    fontSize = 11.sp,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                    maxLines = 1,
                    overflow = androidx.compose.ui.text.style.TextOverflow.Ellipsis,
                )
            }
        }
        actions()
    }
}

@Composable
fun ToolDivider() {
    Box(Modifier.fillMaxWidth().height(1.dp).background(MaterialTheme.colorScheme.outline))
}

@Composable
private fun SectionTitle(text: String) {
    Text(
        text,
        style = MaterialTheme.typography.labelSmall,
        color = MaterialTheme.colorScheme.primary,
        modifier = Modifier.padding(top = 14.dp, bottom = 4.dp),
    )
}

@Composable
private fun Muted(text: String) {
    Text(
        text,
        style = MaterialTheme.typography.bodySmall,
        color = MaterialTheme.colorScheme.onSurfaceVariant,
        modifier = Modifier.padding(vertical = 6.dp),
    )
}

/** Inline message strip; `error` switches to the error palette. */
@Composable
fun ToolBanner(text: String, error: Boolean, onDismiss: () -> Unit) {
    Row(
        Modifier.fillMaxWidth().padding(horizontal = 12.dp, vertical = 6.dp)
            .clip(RoundedCornerShape(10.dp))
            .background(
                if (error) MaterialTheme.colorScheme.error.copy(alpha = 0.12f)
                else MaterialTheme.colorScheme.surfaceVariant,
            )
            .padding(horizontal = 10.dp, vertical = 6.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Text(
            text,
            style = MaterialTheme.typography.bodySmall,
            color = if (error) MaterialTheme.colorScheme.error else MaterialTheme.colorScheme.onSurfaceVariant,
            modifier = Modifier.weight(1f),
        )
        TextButton(onClick = onDismiss) { Text(t("Lukk", "Close"), style = MaterialTheme.typography.labelSmall) }
    }
}

private fun humanSize(bytes: Long): String = when {
    bytes >= 1024L * 1024 * 1024 -> String.format(java.util.Locale.US, "%.1f GB", bytes / (1024.0 * 1024 * 1024))
    bytes >= 1024L * 1024 -> String.format(java.util.Locale.US, "%.1f MB", bytes / (1024.0 * 1024))
    bytes >= 1024L -> String.format(java.util.Locale.US, "%.0f kB", bytes / 1024.0)
    else -> "$bytes B"
}

@Composable
private fun MonoText(text: String, size: Int = 12, color: Color = MaterialTheme.colorScheme.onSurface) {
    Text(text, fontFamily = FontFamily.Monospace, fontSize = size.sp, color = color)
}

@Composable
private fun EmptyHint(text: String) {
    Box(Modifier.fillMaxWidth().padding(vertical = 24.dp), contentAlignment = Alignment.Center) {
        Text(text, style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
    }
}

// ------------------------------------------------------------------ files

@Composable
fun FilesScreen(vm: ChatViewModel, onBack: () -> Unit) {
    val file = vm.fsFile
    val editing = vm.editingContent
    var showMkdir by remember { mutableStateOf(false) }
    var showGoTo by remember { mutableStateOf(false) }
    var menuFor by remember { mutableStateOf<String?>(null) }
    var renameTarget by remember { mutableStateOf<FsEntry?>(null) }
    var deleteTarget by remember { mutableStateOf<FsEntry?>(null) }

    LaunchedEffect(Unit) {
        if (vm.fsPath.isBlank() && vm.fsEntries.isEmpty() && vm.fsRoots.isEmpty() && vm.fsFile == null) {
            vm.loadFs("")
        }
    }

    Column(Modifier.fillMaxSize()) {
        ToolBar(
            title = when {
                editing != null -> t("Redigerer", "Editing") + " " + (file?.name ?: "")
                file != null -> file.name
                vm.fsPath.isBlank() -> t("Denne PC-en", "This PC")
                else -> vm.fsPath.substringAfterLast('\\').substringAfterLast('/').ifBlank { vm.fsPath }
            },
            subtitle = when {
                editing != null -> t("Endringer lagres ikke før du trykker Lagre.", "Changes are kept until you press Save.")
                file != null -> file.path
                vm.fsPath.isBlank() -> t("Velg en stasjon eller mappe", "Pick a drive or folder")
                else -> vm.fsPath
            },
            onBack = {
                when {
                    editing != null -> vm.cancelEditing()
                    file != null -> vm.closeFile()
                    vm.canGoUp() -> vm.fsUp()
                    else -> onBack()
                }
            },
            actions = {
                if (file != null) {
                    if (editing == null) {
                        TextButton(onClick = { vm.startEditing() }) { Text(t("Rediger", "Edit")) }
                        TextButton(onClick = { deleteTarget = file.toFsEntry() }) {
                            Text(t("Slett", "Delete"), color = MaterialTheme.colorScheme.error)
                        }
                    } else {
                        TextButton(onClick = { vm.saveFile() }) { Text(t("Lagre", "Save")) }
                        TextButton(onClick = { vm.cancelEditing() }) { Text(t("Avbryt", "Cancel")) }
                    }
                } else {
                    TextButton(onClick = { showGoTo = true }) { Text(t("Gå til", "Go to")) }
                    TextButton(onClick = { showMkdir = true }, enabled = vm.fsPath.isNotBlank()) {
                        Text(t("Ny mappe", "New folder"))
                    }
                    IconButton(onClick = { vm.loadFs(vm.fsPath) }) {
                        Icon(Icons.Filled.Refresh, contentDescription = t("Oppdater", "Refresh"), tint = MaterialTheme.colorScheme.onSurfaceVariant)
                    }
                }
            },
        )
        ToolDivider()

        if (vm.fsError.isNotBlank()) ToolBanner(vm.fsError, error = true) { vm.dismissFsError() }
        if (vm.fsNotice.isNotBlank()) ToolBanner(vm.fsNotice, error = false) { vm.dismissFsNotice() }

        when {
            editing != null -> FileEditor(value = editing, onValueChange = { vm.updateEditing(it) })
            file != null -> FileViewer(file)
            else -> {
                if (vm.fsBusy) {
                    Row(Modifier.fillMaxWidth().padding(12.dp), verticalAlignment = Alignment.CenterVertically) {
                        CircularProgressIndicator(Modifier.size(14.dp), strokeWidth = 2.dp)
                        Spacer(Modifier.width(8.dp))
                        Muted(t("Leser mappen …", "Reading folder …"))
                    }
                }
                LazyColumn(Modifier.fillMaxSize(), contentPadding = PaddingValues(vertical = 6.dp)) {
                    if (vm.fsPath.isBlank()) {
                        if (vm.fsRoots.isNotEmpty()) {
                            item { SectionTitle(t("STASJONER", "DRIVES")) }
                            items(vm.fsRoots, key = { it.path }) { entry ->
                                FileRow(
                                    entry = entry,
                                    subtitle = t("stasjon", "drive"),
                                    onClick = { vm.loadFs(entry.path) },
                                    menuFor = null,
                                    onMenu = {},
                                    onRename = {},
                                    onDelete = {},
                                )
                            }
                        }
                        if (vm.fsPlaces.isNotEmpty()) {
                            item { SectionTitle(t("PLASSER", "PLACES")) }
                            items(vm.fsPlaces, key = { "place-" + it.path }) { entry ->
                                FileRow(
                                    entry = entry,
                                    subtitle = entry.path,
                                    onClick = { vm.loadFs(entry.path) },
                                    menuFor = null,
                                    onMenu = {},
                                    onRename = {},
                                    onDelete = {},
                                )
                            }
                        }
                    } else {
                        if (vm.fsEntries.isEmpty() && !vm.fsBusy) {
                            item { EmptyHint(t("Tom mappe.", "Empty folder.")) }
                        }
                        items(vm.fsEntries, key = { it.path }) { entry ->
                            FileRow(
                                entry = entry,
                                subtitle = if (entry.isDir) {
                                    t("mappe", "folder")
                                } else {
                                    humanSize(entry.size) + " · " + relativeTime(entry.mtime)
                                },
                                onClick = { if (entry.isDir) vm.loadFs(entry.path) else vm.openFile(entry.path) },
                                menuFor = menuFor,
                                onMenu = { menuFor = it },
                                onRename = { renameTarget = it },
                                onDelete = { deleteTarget = it },
                            )
                        }
                    }
                }
            }
        }
    }

    if (showGoTo) {
        var path by remember { mutableStateOf(vm.fsPath) }
        AlertDialog(
            onDismissRequest = { showGoTo = false },
            containerColor = MaterialTheme.colorScheme.surface,
            title = { Text(t("Gå til mappe", "Go to folder")) },
            text = {
                OutlinedTextField(
                    value = path,
                    onValueChange = { path = it },
                    label = { Text(t("Sti", "Path")) },
                    placeholder = { Text("C:\\Prosjekter\\…") },
                    singleLine = true,
                )
            },
            confirmButton = {
                TextButton(
                    onClick = { vm.loadFs(path.trim()); showGoTo = false },
                    enabled = path.isNotBlank(),
                ) { Text(t("Åpne", "Open")) }
            },
            dismissButton = { TextButton(onClick = { showGoTo = false }) { Text(t("Avbryt", "Cancel")) } },
        )
    }

    if (showMkdir) {
        var name by remember { mutableStateOf("") }
        AlertDialog(
            onDismissRequest = { showMkdir = false },
            containerColor = MaterialTheme.colorScheme.surface,
            title = { Text(t("Ny mappe", "New folder")) },
            text = {
                Column {
                    Muted(vm.fsPath)
                    OutlinedTextField(
                        value = name,
                        onValueChange = { name = it },
                        label = { Text(t("Navn", "Name")) },
                        singleLine = true,
                    )
                }
            },
            confirmButton = {
                TextButton(
                    onClick = { vm.makeDir(name); showMkdir = false },
                    enabled = name.isNotBlank(),
                ) { Text(t("Opprett", "Create")) }
            },
            dismissButton = { TextButton(onClick = { showMkdir = false }) { Text(t("Avbryt", "Cancel")) } },
        )
    }

    renameTarget?.let { target ->
        var name by remember(target.path) { mutableStateOf(target.name) }
        AlertDialog(
            onDismissRequest = { renameTarget = null },
            containerColor = MaterialTheme.colorScheme.surface,
            title = { Text(t("Endre navn", "Rename")) },
            text = {
                Column {
                    Muted(target.path)
                    OutlinedTextField(
                        value = name,
                        onValueChange = { name = it },
                        label = { Text(t("Nytt navn", "New name")) },
                        singleLine = true,
                    )
                }
            },
            confirmButton = {
                TextButton(onClick = { vm.renameEntry(target.path, name); renameTarget = null }, enabled = name.isNotBlank()) {
                    Text(t("Lagre", "Save"))
                }
            },
            dismissButton = { TextButton(onClick = { renameTarget = null }) { Text(t("Avbryt", "Cancel")) } },
        )
    }

    deleteTarget?.let { target ->
        AlertDialog(
            onDismissRequest = { deleteTarget = null },
            containerColor = MaterialTheme.colorScheme.surface,
            title = { Text(t("Slette?", "Delete?")) },
            text = { Text(t("«${target.name}» slettes permanent fra PC-en.", "\"${target.name}\" is permanently deleted from the PC.")) },
            confirmButton = {
                TextButton(onClick = { vm.deleteEntry(target.path); deleteTarget = null }) {
                    Text(t("Slett", "Delete"), color = MaterialTheme.colorScheme.error)
                }
            },
            dismissButton = { TextButton(onClick = { deleteTarget = null }) { Text(t("Avbryt", "Cancel")) } },
        )
    }
}

private fun FileContent.toFsEntry() = FsEntry(
    name = name,
    path = path,
    isDir = false,
    size = size,
    mtime = mtime,
)

@Composable
private fun FileRow(
    entry: FsEntry,
    subtitle: String,
    onClick: () -> Unit,
    menuFor: String?,
    onMenu: (String?) -> Unit,
    onRename: (FsEntry) -> Unit,
    onDelete: (FsEntry) -> Unit,
) {
    Row(
        Modifier.fillMaxWidth()
            .clip(RoundedCornerShape(10.dp))
            .clickable(onClick = onClick)
            .padding(start = 14.dp, end = 4.dp, top = 8.dp, bottom = 8.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Icon(
            if (entry.isDir) Icons.Filled.Folder else Icons.Filled.Description,
            contentDescription = null,
            tint = if (entry.isDir) MaterialTheme.colorScheme.primary else MaterialTheme.colorScheme.onSurfaceVariant,
            modifier = Modifier.size(18.dp),
        )
        Spacer(Modifier.width(10.dp))
        Column(Modifier.weight(1f)) {
            Text(entry.name, style = MaterialTheme.typography.bodyMedium, maxLines = 1)
            Text(
                subtitle,
                style = MaterialTheme.typography.labelSmall,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
                maxLines = 1,
            )
        }
        if (menuFor != null) {
            Box {
                IconButton(onClick = { onMenu(entry.path) }) {
                    Icon(
                        Icons.Filled.MoreVert,
                        contentDescription = t("Mer", "More"),
                        tint = MaterialTheme.colorScheme.onSurfaceVariant,
                        modifier = Modifier.size(18.dp),
                    )
                }
                DropdownMenu(expanded = menuFor == entry.path, onDismissRequest = { onMenu(null) }) {
                    DropdownMenuItem(
                        text = { Text(t("Endre navn", "Rename")) },
                        onClick = { onRename(entry); onMenu(null) },
                    )
                    DropdownMenuItem(
                        text = { Text(t("Slett", "Delete"), color = MaterialTheme.colorScheme.error) },
                        onClick = { onDelete(entry); onMenu(null) },
                    )
                }
            }
        } else {
            Spacer(Modifier.width(8.dp))
        }
    }
}

@Composable
private fun FileViewer(file: FileContent) {
    val shown = if (file.content.length > 300_000) {
        file.content.take(300_000) + "\n\n… (" + t("filen er avkortet", "file truncated") + ")"
    } else {
        file.content
    }
    Column(Modifier.fillMaxSize()) {
        Row(Modifier.fillMaxWidth().padding(horizontal = 14.dp, vertical = 6.dp)) {
            Text(
                humanSize(file.size) + " · " + relativeTime(file.mtime),
                style = MaterialTheme.typography.labelSmall,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
            )
            Spacer(Modifier.weight(1f))
            TextButton(onClick = { copyToClipboard(file.content) }) {
                Text(t("Kopier alt", "Copy all"), style = MaterialTheme.typography.labelSmall)
            }
        }
        Box(Modifier.fillMaxSize().verticalScroll(rememberScrollState()).padding(horizontal = 14.dp, vertical = 4.dp)) {
            SelectionContainer {
                Text(
                    shown,
                    fontFamily = FontFamily.Monospace,
                    fontSize = 12.sp,
                    color = MaterialTheme.colorScheme.onBackground,
                )
            }
        }
    }
}

@Composable
private fun FileEditor(value: String, onValueChange: (String) -> Unit) {
    Box(
        Modifier.fillMaxSize().padding(10.dp)
            .clip(RoundedCornerShape(10.dp))
            .background(MaterialTheme.colorScheme.surface)
            .padding(1.dp),
    ) {
        Box(Modifier.fillMaxSize().verticalScroll(rememberScrollState()).padding(12.dp)) {
            BasicTextField(
                value = value,
                onValueChange = onValueChange,
                modifier = Modifier.fillMaxWidth(),
                textStyle = TextStyle(
                    fontFamily = FontFamily.Monospace,
                    fontSize = 13.sp,
                    color = MaterialTheme.colorScheme.onSurface,
                ),
                cursorBrush = SolidColor(MaterialTheme.colorScheme.primary),
            )
        }
    }
}

// ------------------------------------------------------------------ git

@Composable
fun GitScreen(vm: ChatViewModel, onBack: () -> Unit) {
    LaunchedEffect(Unit) { vm.loadGit() }
    var message by remember { mutableStateOf("") }
    var showRepo by remember { mutableStateOf(false) }
    val diff = vm.gitDiffText

    if (diff != null) {
        Column(Modifier.fillMaxSize()) {
            ToolBar(
                title = vm.gitDiffTitle.substringAfterLast('\\').substringAfterLast('/'),
                subtitle = vm.gitDiffTitle,
                onBack = { vm.closeDiff() },
            )
            ToolDivider()
            LazyColumn(Modifier.fillMaxSize(), contentPadding = PaddingValues(horizontal = 12.dp, vertical = 6.dp)) {
                items(diff.lines()) { line -> DiffLine(line) }
            }
        }
        return
    }

    Column(Modifier.fillMaxSize()) {
        ToolBar(
            title = t("Git", "Git"),
            subtitle = vm.gitPath,
            onBack = onBack,
            actions = {
                TextButton(onClick = { showRepo = true }) { Text(t("Bytt repo", "Change repo")) }
                IconButton(onClick = { vm.loadGit() }) {
                    Icon(Icons.Filled.Refresh, contentDescription = t("Oppdater", "Refresh"), tint = MaterialTheme.colorScheme.onSurfaceVariant)
                }
            },
        )
        ToolDivider()
        if (vm.gitError.isNotBlank()) ToolBanner(vm.gitError, error = true) { vm.dismissGitError() }

        val status = vm.gitStatus
        val files = vm.gitFiles()
        LazyColumn(Modifier.fillMaxSize(), contentPadding = PaddingValues(horizontal = 14.dp, vertical = 4.dp)) {
            item {
                Row(verticalAlignment = Alignment.CenterVertically, modifier = Modifier.padding(top = 10.dp)) {
                    Icon(
                        Icons.Filled.AccountTree,
                        contentDescription = null,
                        tint = MaterialTheme.colorScheme.primary,
                        modifier = Modifier.size(16.dp),
                    )
                    Spacer(Modifier.width(8.dp))
                    Text(
                        status?.optString("branch").orEmpty().ifBlank { "—" },
                        style = MaterialTheme.typography.bodyMedium,
                        fontWeight = FontWeight.SemiBold,
                    )
                    Spacer(Modifier.width(10.dp))
                    val ahead = status?.optInt("ahead", 0) ?: 0
                    val behind = status?.optInt("behind", 0) ?: 0
                    if (ahead > 0 || behind > 0) {
                        Text(
                            "↑$ahead ↓$behind",
                            style = MaterialTheme.typography.labelSmall,
                            color = MaterialTheme.colorScheme.onSurfaceVariant,
                        )
                    }
                    if (vm.gitBusy) {
                        Spacer(Modifier.width(10.dp))
                        CircularProgressIndicator(Modifier.size(12.dp), strokeWidth = 2.dp)
                    }
                }
            }
            item { SectionTitle(t("ENDRINGER", "CHANGES")) }
            if (status == null && vm.gitError.isBlank()) item { Muted(t("Leser Git-status …", "Reading Git status …")) }
            if (status != null && files.isEmpty()) item { Muted(t("Arbeidstreet er rent.", "Working tree is clean.")) }
            items(files, key = { it.optString("path") }) { file ->
                val path = file.optString("path")
                val state = file.optString("status")
                Row(
                    Modifier.fillMaxWidth()
                        .clip(RoundedCornerShape(8.dp))
                        .clickable { vm.openDiff(path) }
                        .padding(horizontal = 8.dp, vertical = 7.dp),
                    verticalAlignment = Alignment.CenterVertically,
                ) {
                    Surface(
                        shape = RoundedCornerShape(6.dp),
                        color = MaterialTheme.colorScheme.surfaceVariant,
                        modifier = Modifier.widthIn(min = 32.dp),
                    ) {
                        Text(
                            state.ifBlank { "·" },
                            style = MaterialTheme.typography.labelSmall,
                            fontFamily = FontFamily.Monospace,
                            color = if (state.contains("D")) MaterialTheme.colorScheme.error else MaterialTheme.colorScheme.onSurfaceVariant,
                            modifier = Modifier.padding(horizontal = 6.dp, vertical = 2.dp),
                        )
                    }
                    Spacer(Modifier.width(10.dp))
                    Text(path, style = MaterialTheme.typography.bodySmall, fontFamily = FontFamily.Monospace, maxLines = 1)
                }
            }
            item {
                Row(Modifier.fillMaxWidth().padding(top = 10.dp), horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                    TextButton(onClick = { vm.stageAll() }, enabled = files.isNotEmpty()) {
                        Text(t("Stage alle", "Stage all"))
                    }
                }
            }
            item {
                OutlinedTextField(
                    value = message,
                    onValueChange = { message = it },
                    label = { Text(t("Commit-melding", "Commit message")) },
                    singleLine = true,
                    modifier = Modifier.fillMaxWidth().padding(top = 2.dp),
                )
            }
            item {
                Row(Modifier.fillMaxWidth().padding(vertical = 6.dp), horizontalArrangement = Arrangement.End) {
                    Button(
                        onClick = { vm.commit(message); message = "" },
                        enabled = message.isNotBlank(),
                    ) { Text(t("Commit", "Commit")) }
                }
            }
            item { SectionTitle(t("SISTE COMMITS", "LATEST COMMITS")) }
            if (vm.gitLog.isEmpty()) item { Muted(t("Ingen commits ennå.", "No commits yet.")) }
            items(vm.gitLog) { commit ->
                val hash = commit.optString("hash").take(8)
                val subject = commit.optString("message").ifBlank { commit.optString("subject") }
                Column(Modifier.fillMaxWidth().padding(vertical = 5.dp)) {
                    Text(subject, style = MaterialTheme.typography.bodySmall, maxLines = 1)
                    Text(
                        "$hash · ${commit.optString("author")} · ${commit.optString("date").take(16)}",
                        style = MaterialTheme.typography.labelSmall,
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                        maxLines = 1,
                    )
                }
            }
        }
    }

    if (showRepo) {
        var path by remember { mutableStateOf(vm.gitPath) }
        AlertDialog(
            onDismissRequest = { showRepo = false },
            containerColor = MaterialTheme.colorScheme.surface,
            title = { Text(t("Velg repo", "Pick repository")) },
            text = {
                Column {
                    if (vm.projects.isNotEmpty()) {
                        Text(
                            t("Prosjekter fra bridgen", "Projects from the bridge"),
                            style = MaterialTheme.typography.labelSmall,
                            color = MaterialTheme.colorScheme.onSurfaceVariant,
                        )
                        for (project in vm.projects) {
                            TextButton(onClick = {
                                vm.loadGit(project.path)
                                showRepo = false
                            }) { Text(project.name) }
                        }
                    }
                    OutlinedTextField(
                        value = path,
                        onValueChange = { path = it },
                        label = { Text(t("Sti til repo", "Repository path")) },
                        singleLine = true,
                    )
                }
            },
            confirmButton = {
                TextButton(
                    onClick = { vm.loadGit(path.trim()); showRepo = false },
                    enabled = path.isNotBlank(),
                ) { Text(t("Åpne", "Open")) }
            },
            dismissButton = { TextButton(onClick = { showRepo = false }) { Text(t("Avbryt", "Cancel")) } },
        )
    }
}

@Composable
private fun DiffLine(line: String) {
    val isAdd = line.startsWith("+") && !line.startsWith("+++")
    val isDel = line.startsWith("-") && !line.startsWith("---")
    val foreground = when {
        isAdd -> Color(0xFF66BB6A)
        isDel -> Color(0xFFEF5350)
        line.startsWith("@@") -> MaterialTheme.colorScheme.onSurfaceVariant
        line.startsWith("diff ") || line.startsWith("index ") -> MaterialTheme.colorScheme.onSurfaceVariant
        else -> MaterialTheme.colorScheme.onSurface
    }
    val background = when {
        isAdd -> Color(0x2234A853)
        isDel -> Color(0x22D64545)
        else -> Color.Transparent
    }
    Text(
        line.ifBlank { " " },
        color = foreground,
        style = MaterialTheme.typography.labelSmall.copy(fontFamily = FontFamily.Monospace),
        modifier = Modifier.fillMaxWidth().background(background).padding(horizontal = 4.dp, vertical = 1.dp),
    )
}

// ------------------------------------------------------------------ terminal

@Composable
fun TerminalScreen(vm: ChatViewModel, onBack: () -> Unit) {
    LaunchedEffect(Unit) { if (!vm.terminalRunning) vm.terminalStart() }
    var command by remember { mutableStateOf("") }
    val scroll = rememberScrollState()

    LaunchedEffect(vm.terminalOutput.length) {
        scroll.animateScrollTo(scroll.maxValue)
    }

    Column(Modifier.fillMaxSize()) {
        ToolBar(
            title = t("Terminal", "Terminal"),
            subtitle = vm.terminalCwd + " · " + if (vm.terminalRunning) t("kjører", "running") else t("stoppet", "stopped"),
            onBack = {
                vm.terminalStop()
                onBack()
            },
            actions = {
                TextButton(onClick = { vm.terminalCtrlC() }, enabled = vm.terminalRunning) { Text("Ctrl+C") }
                TextButton(onClick = { vm.terminalClear() }) { Text(t("Tøm", "Clear")) }
                IconButton(onClick = {
                    vm.terminalStop()
                    vm.terminalStart()
                }) {
                    Icon(Icons.Filled.Refresh, contentDescription = t("Start på nytt", "Restart"), tint = MaterialTheme.colorScheme.onSurfaceVariant)
                }
            },
        )
        ToolDivider()
        if (vm.terminalError.isNotBlank()) ToolBanner(vm.terminalError, error = true) { vm.dismissTerminalError() }

        Surface(
            color = MaterialTheme.colorScheme.surface,
            shape = RoundedCornerShape(10.dp),
            border = BorderStroke(1.dp, MaterialTheme.colorScheme.outline),
            modifier = Modifier.weight(1f).fillMaxWidth().padding(horizontal = 12.dp, vertical = 8.dp),
        ) {
            Box(Modifier.fillMaxSize().verticalScroll(scroll).padding(10.dp)) {
                SelectionContainer {
                    Text(
                        vm.terminalOutput.ifBlank {
                            if (vm.terminalRunning) t("Terminal klar.", "Terminal ready.") else t("Starter terminal …", "Starting terminal …")
                        },
                        fontFamily = FontFamily.Monospace,
                        fontSize = 12.sp,
                        color = MaterialTheme.colorScheme.onSurface,
                    )
                }
            }
        }

        Row(
            Modifier.fillMaxWidth().padding(horizontal = 12.dp, vertical = 6.dp),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            OutlinedTextField(
                value = command,
                onValueChange = { command = it },
                placeholder = { Text(t("Kommando", "Command"), style = MaterialTheme.typography.bodySmall) },
                singleLine = true,
                textStyle = MaterialTheme.typography.bodySmall.copy(fontFamily = FontFamily.Monospace),
                modifier = Modifier.weight(1f).onPreviewKeyEvent { event ->
                    if (event.type == KeyEventType.KeyDown && event.key == Key.Enter) {
                        vm.terminalSendLine(command)
                        command = ""
                        true
                    } else {
                        false
                    }
                },
            )
            Spacer(Modifier.width(8.dp))
            Button(
                onClick = { vm.terminalSendLine(command); command = "" },
                enabled = command.isNotBlank() && vm.terminalRunning,
            ) { Text(t("Send", "Send")) }
        }
    }
}

// ------------------------------------------------------------------ devices

@Composable
fun DevicesScreen(vm: ChatViewModel, onBack: () -> Unit) {
    LaunchedEffect(Unit) { vm.loadAdb() }
    val status = vm.adbStatus
    val devices = vm.adbDevices()

    Column(Modifier.fillMaxSize()) {
        ToolBar(
            title = t("Enheter", "Devices"),
            subtitle = "ADB",
            onBack = onBack,
            actions = {
                IconButton(onClick = { vm.loadAdb() }) {
                    Icon(Icons.Filled.Refresh, contentDescription = t("Oppdater", "Refresh"), tint = MaterialTheme.colorScheme.onSurfaceVariant)
                }
            },
        )
        ToolDivider()
        if (vm.adbError.isNotBlank()) ToolBanner(vm.adbError, error = true) { vm.dismissAdbError() }

        Column(Modifier.fillMaxSize().verticalScroll(rememberScrollState()).padding(horizontal = 16.dp, vertical = 8.dp)) {
            Row(verticalAlignment = Alignment.CenterVertically) {
                Icon(
                    Icons.Filled.PhoneAndroid,
                    contentDescription = null,
                    tint = MaterialTheme.colorScheme.primary,
                    modifier = Modifier.size(18.dp),
                )
                Spacer(Modifier.width(10.dp))
                Column(Modifier.weight(1f)) {
                    Text(
                        "ADB " + (if (status?.optBoolean("installed") == true) t("installert", "installed") else t("mangler", "missing")) +
                            " · " + (if (status?.optBoolean("running") == true) t("kjører", "running") else t("stopper", "stopped")),
                        style = MaterialTheme.typography.bodyMedium,
                    )
                    Text(
                        status?.optString("version").orEmpty().ifBlank { t("Ingen ADB-versjon funnet.", "No ADB version found.") },
                        style = MaterialTheme.typography.labelSmall,
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                    )
                }
                if (vm.adbBusy) CircularProgressIndicator(Modifier.size(14.dp), strokeWidth = 2.dp)
            }

            if (status?.optBoolean("installed") != true) {
                Spacer(Modifier.height(8.dp))
                Button(
                    onClick = { vm.installAdb() },
                    enabled = !vm.adbBusy,
                ) { Text(t("Installer ADB", "Install ADB")) }
            }
            status?.optString("error")?.takeIf { it.isNotBlank() }?.let { error ->
                Spacer(Modifier.height(8.dp))
                Text(error, style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.error)
            }

            SectionTitle(t("TILKOBLEDE ENHETER", "CONNECTED DEVICES"))
            if (devices.isEmpty()) Muted(t("Ingen tilkoblede enheter.", "No connected devices."))
            for (device in devices) {
                Row(Modifier.fillMaxWidth().padding(vertical = 7.dp), verticalAlignment = Alignment.CenterVertically) {
                    Icon(
                        Icons.Filled.PhoneAndroid,
                        contentDescription = null,
                        tint = MaterialTheme.colorScheme.onSurfaceVariant,
                        modifier = Modifier.size(18.dp),
                    )
                    Spacer(Modifier.width(10.dp))
                    Column(Modifier.weight(1f)) {
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
            Spacer(Modifier.height(16.dp))
        }
    }
}

// ------------------------------------------------------------------ voice

@Composable
fun VoiceScreen(vm: ChatViewModel, onBack: () -> Unit) {
    LaunchedEffect(Unit) { vm.loadVoice() }
    val defaultLine = t("Hei fra OMP Desktop", "Hello from OMP Desktop")
    var test by remember { mutableStateOf(defaultLine) }
    val local = vm.voiceLocal
    val engines = vm.voiceEngines?.optJSONObject("engines")
    val keys = engines?.keys()?.asSequence()?.toList() ?: emptyList()

    Column(Modifier.fillMaxSize()) {
        ToolBar(
            title = t("Tale", "Voice"),
            subtitle = if (local?.optBoolean("ready") == true) t("lokal tale klar", "local voice ready") else t("ikke klar", "not ready"),
            onBack = onBack,
            actions = {
                IconButton(onClick = { vm.loadVoice() }) {
                    Icon(Icons.Filled.Refresh, contentDescription = t("Oppdater", "Refresh"), tint = MaterialTheme.colorScheme.onSurfaceVariant)
                }
            },
        )
        ToolDivider()
        if (vm.voiceNotice.isNotBlank()) ToolBanner(vm.voiceNotice, error = false) { vm.dismissVoiceNotice() }

        Column(Modifier.fillMaxSize().verticalScroll(rememberScrollState()).padding(horizontal = 16.dp, vertical = 8.dp)) {
            Row(verticalAlignment = Alignment.CenterVertically) {
                Icon(
                    Icons.Filled.RecordVoiceOver,
                    contentDescription = null,
                    tint = MaterialTheme.colorScheme.primary,
                    modifier = Modifier.size(18.dp),
                )
                Spacer(Modifier.width(10.dp))
                Column(Modifier.weight(1f)) {
                    Text(
                        t("Lokal tale: ", "Local voice: ") + (if (local?.optBoolean("ready") == true) t("klar", "ready") else t("ikke klar", "not ready")),
                        style = MaterialTheme.typography.bodyMedium,
                    )
                    local?.optString("error")?.takeIf { it.isNotBlank() }?.let {
                        Text(it, style = MaterialTheme.typography.labelSmall, color = MaterialTheme.colorScheme.error)
                    }
                }
            }
            Spacer(Modifier.height(8.dp))
            Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                Button(onClick = { vm.voiceStart() }) { Text(t("Lytt", "Listen")) }
                TextButton(onClick = { vm.voiceStop() }) { Text(t("Stopp", "Stop")) }
            }

            SectionTitle(t("MOTORER", "ENGINES"))
            if (keys.isEmpty()) Muted(t("Ingen motorer funnet.", "No engines found."))
            for (key in keys) {
                val engine = engines?.optJSONObject(key) ?: continue
                Row(Modifier.fillMaxWidth().padding(vertical = 6.dp), verticalAlignment = Alignment.CenterVertically) {
                    Column(Modifier.weight(1f)) {
                        Text(engine.optString("name").ifBlank { key }, style = MaterialTheme.typography.bodyMedium)
                        Text(
                            (if (engine.optBoolean("installed")) t("Installert", "Installed") else t("Ikke installert", "Not installed")) +
                                " · " + engine.optString("hardware") + " · " + engine.optString("lang"),
                            style = MaterialTheme.typography.labelSmall,
                            color = MaterialTheme.colorScheme.onSurfaceVariant,
                        )
                    }
                }
            }

            SectionTitle(t("TEST", "TEST"))
            OutlinedTextField(
                value = test,
                onValueChange = { test = it },
                label = { Text(t("Tekst å lese opp", "Text to speak")) },
                modifier = Modifier.fillMaxWidth(),
            )
            Row(Modifier.fillMaxWidth().padding(top = 8.dp), horizontalArrangement = Arrangement.End) {
                Button(onClick = { vm.speak(test) }, enabled = test.isNotBlank() && !vm.voiceBusy) {
                    Icon(Icons.Filled.VolumeUp, contentDescription = null, modifier = Modifier.size(16.dp))
                    Spacer(Modifier.width(6.dp))
                    Text(t("Les opp", "Speak"))
                }
            }
            Spacer(Modifier.height(16.dp))
        }
    }
}
