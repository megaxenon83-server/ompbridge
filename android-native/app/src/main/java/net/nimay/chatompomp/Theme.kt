package net.nimay.chatompomp

import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.darkColorScheme
import androidx.compose.material3.lightColorScheme
import androidx.compose.runtime.Composable
import androidx.compose.ui.graphics.Color

private val Background = Color(0xFF0B0D10)
private val Surface = Color(0xFF14171C)
private val SurfaceVariant = Color(0xFF1D222A)
private val Primary = Color(0xFF6BC0A0)
private val OnPrimary = Color(0xFF08130E)
private val OnBackground = Color(0xFFE8EAED)
private val Muted = Color(0xFF9AA3AE)

private val colors = darkColorScheme(
    primary = Primary,
    onPrimary = OnPrimary,
    primaryContainer = Color(0xFF1E3A2C),
    onPrimaryContainer = Color(0xFFCDEEDF),
    secondary = Muted,
    onSecondary = Background,
    background = Background,
    onBackground = OnBackground,
    surface = Surface,
    onSurface = OnBackground,
    surfaceVariant = SurfaceVariant,
    onSurfaceVariant = Muted,
    outline = Color(0x1FFFFFFF),
    outlineVariant = Color(0x14FFFFFF),
    error = Color(0xFFFF8A80),
)

private val lightColors = lightColorScheme(
    primary = Color(0xFF2F6D54),
    onPrimary = Color.White,
    primaryContainer = Color(0xFFCFE9DC),
    onPrimaryContainer = Color(0xFF0B2418),
    background = Color(0xFFF4F6F2),
    onBackground = Color(0xFF14181C),
    surface = Color(0xFFFFFFFF),
    onSurface = Color(0xFF14181C),
    surfaceVariant = Color(0xFFE8EDE7),
    onSurfaceVariant = Color(0xFF5A6560),
    outline = Color(0x22000000),
    error = Color(0xFFB3261E),
)

@Composable
fun ChatOmpTheme(dark: Boolean = true, content: @Composable () -> Unit) {
    MaterialTheme(colorScheme = if (dark) colors else lightColors, content = content)
}
