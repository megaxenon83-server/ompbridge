package net.nimay.chatompomp

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.AnnotatedString
import androidx.compose.ui.text.SpanStyle
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.buildAnnotatedString
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.font.FontStyle
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextDecoration
import androidx.compose.ui.text.withStyle
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp

/**
 * Compact Markdown renderer for chat answers. Same coverage as the WebView
 * client's turn-ui.markdown(): fences (including an unclosed one while
 * streaming), headings, lists, quotes, inline code, bold/italic and links.
 */
private sealed interface MdBlock {
    data class Paragraph(val text: String) : MdBlock
    data class Heading(val text: String) : MdBlock
    data class Code(val text: String) : MdBlock
    data class Bullet(val text: String) : MdBlock
    data class Ordered(val number: Int, val text: String) : MdBlock
    data class Quote(val text: String) : MdBlock
}

private val fenceOpen = Regex("^```[\\w+-]*\\s*$")
private val fenceClose = Regex("^```\\s*$")
private val headingLine = Regex("^(#{1,6})\\s+(.+)$")
private val quoteLine = Regex("^>\\s?(.*)$")
private val bulletLine = Regex("^[-*+]\\s+(.+)$")
private val orderedLine = Regex("^(\\d+)[.)]\\s+(.+)$")

private fun parseBlocks(source: String): List<MdBlock> {
    val blocks = ArrayList<MdBlock>()
    val paragraph = ArrayList<String>()
    fun flush() {
        if (paragraph.isNotEmpty()) {
            blocks.add(MdBlock.Paragraph(paragraph.joinToString("\n")))
            paragraph.clear()
        }
    }
    val lines = source.replace("\r\n", "\n").split('\n')
    var index = 0
    while (index < lines.size) {
        val line = lines[index]
        if (fenceOpen.matches(line)) {
            flush()
            val code = ArrayList<String>()
            index++
            while (index < lines.size && !fenceClose.matches(lines[index])) {
                code.add(lines[index])
                index++
            }
            index++
            blocks.add(MdBlock.Code(code.joinToString("\n")))
            continue
        }
        if (line.isBlank()) { flush(); index++; continue }
        val heading = headingLine.find(line)
        if (heading != null) { flush(); blocks.add(MdBlock.Heading(heading.groupValues[2])); index++; continue }
        if (quoteLine.matches(line)) {
            flush()
            val quoted = ArrayList<String>()
            while (index < lines.size) {
                val match = quoteLine.find(lines[index]) ?: break
                quoted.add(match.groupValues[1])
                index++
            }
            blocks.add(MdBlock.Quote(quoted.joinToString("\n")))
            continue
        }
        if (bulletLine.matches(line)) {
            flush()
            while (index < lines.size) {
                val match = bulletLine.find(lines[index]) ?: break
                blocks.add(MdBlock.Bullet(match.groupValues[1]))
                index++
            }
            continue
        }
        if (orderedLine.matches(line)) {
            flush()
            while (index < lines.size) {
                val match = orderedLine.find(lines[index]) ?: break
                blocks.add(MdBlock.Ordered(match.groupValues[1].toIntOrNull() ?: 1, match.groupValues[2]))
                index++
            }
            continue
        }
        paragraph.add(line)
        index++
    }
    flush()
    return blocks
}

private fun inline(text: String, linkColor: androidx.compose.ui.graphics.Color, codeBackground: androidx.compose.ui.graphics.Color): AnnotatedString =
    buildAnnotatedString {
        var index = 0
        while (index < text.length) {
            val ch = text[index]
            when {
                text.startsWith("**", index) -> {
                    val end = text.indexOf("**", index + 2)
                    if (end > index) {
                        withStyle(SpanStyle(fontWeight = FontWeight.Bold)) { append(text.substring(index + 2, end)) }
                        index = end + 2
                    } else { append(ch); index++ }
                }
                ch == '*' -> {
                    val end = text.indexOf('*', index + 1)
                    if (end > index) {
                        withStyle(SpanStyle(fontStyle = FontStyle.Italic)) { append(text.substring(index + 1, end)) }
                        index = end + 1
                    } else { append(ch); index++ }
                }
                ch == '`' -> {
                    val end = text.indexOf('`', index + 1)
                    if (end > index) {
                        withStyle(SpanStyle(fontFamily = FontFamily.Monospace, background = codeBackground)) {
                            append(text.substring(index + 1, end))
                        }
                        index = end + 1
                    } else { append(ch); index++ }
                }
                ch == '[' -> {
                    val close = text.indexOf(']', index + 1)
                    val open = if (close > index) text.indexOf('(', close + 1) else -1
                    val end = if (open == close + 1) text.indexOf(')', open + 1) else -1
                    if (close > index && open == close + 1 && end > open) {
                        withStyle(SpanStyle(color = linkColor, textDecoration = TextDecoration.Underline)) {
                            append(text.substring(index + 1, close))
                        }
                        index = end + 1
                    } else { append(ch); index++ }
                }
                else -> { append(ch); index++ }
            }
        }
    }

@Composable
fun MarkdownText(text: String, modifier: Modifier = Modifier) {
    val colors = MaterialTheme.colorScheme
    val linkColor = colors.primary
    val codeBackground = colors.surfaceVariant
    Column(modifier.fillMaxWidth()) {
        for (block in parseBlocks(text)) {
            when (block) {
                is MdBlock.Code -> Surface(
                    color = colors.surfaceVariant,
                    shape = RoundedCornerShape(8.dp),
                    modifier = Modifier.fillMaxWidth().padding(vertical = 3.dp),
                ) {
                    Text(
                        block.text,
                        fontFamily = FontFamily.Monospace,
                        fontSize = 13.sp,
                        modifier = Modifier.padding(10.dp),
                        color = colors.onSurface,
                    )
                }
                is MdBlock.Heading -> Text(
                    inline(block.text, linkColor, codeBackground),
                    fontWeight = FontWeight.Bold,
                    fontSize = 16.sp,
                    modifier = Modifier.padding(vertical = 2.dp),
                    color = colors.onBackground,
                )
                is MdBlock.Bullet -> Row(Modifier.padding(vertical = 1.dp)) {
                    Text("• ", color = colors.onSurfaceVariant)
                    Text(inline(block.text, linkColor, codeBackground), color = colors.onBackground)
                }
                is MdBlock.Ordered -> Row(Modifier.padding(vertical = 1.dp)) {
                    Text("${block.number}. ", color = colors.onSurfaceVariant)
                    Text(inline(block.text, linkColor, codeBackground), color = colors.onBackground)
                }
                is MdBlock.Quote -> Row(Modifier.padding(vertical = 2.dp)) {
                    Box(Modifier.width(3.dp).height(18.dp).background(colors.primary.copy(alpha = 0.5f)))
                    Text(
                        inline(block.text, linkColor, codeBackground),
                        color = colors.onSurfaceVariant,
                        modifier = Modifier.padding(start = 8.dp),
                    )
                }
                is MdBlock.Paragraph -> Text(
                    inline(block.text, linkColor, codeBackground),
                    modifier = Modifier.padding(vertical = 2.dp),
                    color = colors.onBackground,
                )
            }
        }
    }
}
