package com.omp.chat.ui.chstgpt

import androidx.compose.animation.AnimatedVisibility
import androidx.compose.animation.core.animateFloatAsState
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.outlined.Check
import androidx.compose.material.icons.outlined.Checklist
import androidx.compose.material.icons.outlined.ExpandLess
import androidx.compose.material.icons.outlined.ExpandMore
import androidx.compose.material.icons.outlined.RadioButtonUnchecked
import androidx.compose.material3.Icon
import androidx.compose.material3.LinearProgressIndicator
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextDecoration
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import com.omp.chat.data.TodoPhase
import com.omp.chat.data.TodoTask
import com.omp.chat.ui.LocalStrings

@Composable
fun ChatGptTodoCard(
    phases: List<TodoPhase>,
    expanded: Boolean,
    onToggle: () -> Unit,
    modifier: Modifier = Modifier
) {
    if (phases.isEmpty()) return
    val c = LocalChatGptColors.current
    val strings = LocalStrings.current

    val tasks = phases.flatMap { it.tasks }
    val total = tasks.size
    val done = tasks.count { it.done }
    val inProgress = tasks.firstOrNull { it.status == "in_progress" }
    val progressTarget = if (total == 0) 0f else done.toFloat() / total.toFloat()
    val progress by animateFloatAsState(targetValue = progressTarget, label = "todo_progress")

    Column(
        modifier = modifier
            .fillMaxWidth()
            .padding(horizontal = 12.dp, vertical = 6.dp)
            .clip(RoundedCornerShape(16.dp))
            .background(c.surface)
            .border(1.dp, c.divider.copy(alpha = 0.8f), RoundedCornerShape(16.dp))
            .clickable { onToggle() }
            .padding(horizontal = 12.dp, vertical = 10.dp)
    ) {
        Row(
            modifier = Modifier.fillMaxWidth(),
            verticalAlignment = Alignment.CenterVertically
        ) {
            Icon(
                imageVector = Icons.Outlined.Checklist,
                contentDescription = null,
                tint = c.textSecondary,
                modifier = Modifier.size(18.dp)
            )
            Spacer(Modifier.width(8.dp))
            Column(Modifier.weight(1f)) {
                Row(verticalAlignment = Alignment.CenterVertically) {
                    Text(
                        text = strings.todoProgress,
                        style = MaterialTheme.typography.labelLarge,
                        color = c.textPrimary,
                        fontWeight = FontWeight.Medium
                    )
                    if (total > 0) {
                        Spacer(Modifier.width(8.dp))
                        Text(
                            text = "$done/$total",
                            style = MaterialTheme.typography.labelMedium,
                            color = c.textSecondary
                        )
                    }
                }
                if (!expanded && inProgress != null) {
                    Text(
                        text = inProgress.content,
                        style = MaterialTheme.typography.bodySmall,
                        color = c.textSecondary,
                        maxLines = 1,
                        overflow = TextOverflow.Ellipsis
                    )
                }
            }
            Icon(
                imageVector = if (expanded) Icons.Outlined.ExpandLess else Icons.Outlined.ExpandMore,
                contentDescription = null,
                tint = c.textTertiary,
                modifier = Modifier.size(20.dp)
            )
        }

        if (total > 0) {
            Spacer(Modifier.height(8.dp))
            LinearProgressIndicator(
                progress = { progress },
                modifier = Modifier
                    .fillMaxWidth()
                    .height(4.dp)
                    .clip(CircleShape),
                color = c.online,
                trackColor = c.surfaceElevated
            )
        }

        AnimatedVisibility(visible = expanded) {
            Column(
                modifier = Modifier
                    .padding(top = 10.dp)
                    .heightIn(max = 260.dp)
                    .verticalScroll(rememberScrollState()),
                verticalArrangement = Arrangement.spacedBy(6.dp)
            ) {
                phases.forEach { phase ->
                    val phaseName = phase.name.trim()
                    if (phaseName.isNotBlank()) {
                        Text(
                            text = phaseName,
                            style = MaterialTheme.typography.labelMedium,
                            color = c.textSecondary,
                            fontWeight = FontWeight.Medium,
                            modifier = Modifier.padding(top = 2.dp, bottom = 2.dp)
                        )
                    }
                    phase.tasks.forEach { task ->
                        TodoTaskRow(task = task)
                    }
                }
            }
        }
    }
}

@Composable
private fun TodoTaskRow(task: TodoTask) {
    val c = LocalChatGptColors.current
    val status = task.status.trim().lowercase()
    val done = task.done
    val inProgress = status == "in_progress" || status == "inprogress" || status == "doing"
    val abandoned = task.abandoned

    val icon = when {
        done -> Icons.Outlined.Check
        inProgress -> Icons.Outlined.RadioButtonUnchecked
        else -> Icons.Outlined.RadioButtonUnchecked
    }
    val iconTint = when {
        done -> c.online
        inProgress -> c.accent
        abandoned -> c.textTertiary
        else -> c.textTertiary
    }
    val textColor = when {
        abandoned -> c.textTertiary
        done -> c.textSecondary
        else -> c.textPrimary
    }
    val decoration = if (abandoned) TextDecoration.LineThrough else null

    Column(modifier = Modifier.fillMaxWidth()) {
        Row(
            modifier = Modifier.fillMaxWidth(),
            verticalAlignment = Alignment.Top
        ) {
            Box(
                modifier = Modifier
                    .padding(top = 2.dp)
                    .size(18.dp)
                    .clip(CircleShape)
                    .background(
                        when {
                            done -> c.online.copy(alpha = 0.15f)
                            inProgress -> c.accent.copy(alpha = 0.12f)
                            else -> c.surfaceElevated
                        }
                    ),
                contentAlignment = Alignment.Center
            ) {
                Icon(
                    imageVector = icon,
                    contentDescription = null,
                    tint = iconTint,
                    modifier = Modifier.size(12.dp)
                )
            }
            Spacer(Modifier.width(10.dp))
            Text(
                text = task.content,
                style = MaterialTheme.typography.bodyMedium,
                color = textColor,
                textDecoration = decoration,
                modifier = Modifier.weight(1f)
            )
        }
        val blocker = task.blocker.trim()
        if (blocker.isNotBlank()) {
            Text(
                text = blocker,
                style = MaterialTheme.typography.bodySmall,
                color = c.warning,
                modifier = Modifier.padding(start = 28.dp, top = 2.dp)
            )
        }
    }
}
