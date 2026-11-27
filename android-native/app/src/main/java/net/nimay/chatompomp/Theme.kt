package net.nimay.chatompomp

import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.darkColorScheme
import androidx.compose.material3.lightColorScheme
import androidx.compose.runtime.Composable
import androidx.compose.ui.graphics.Color

/**
 * One designed palette. Every colour in the app comes from here, which keeps the
 * light and dark variants of all presets consistent.
 */
data class ThemeSpec(
    val id: String,
    val name: String,
    val dark: Boolean,
    val background: Color,
    val surface: Color,
    val raised: Color,
    val ink: Color,
    val muted: Color,
    val border: Color,
    val brand: Color,
    val wash: Color,
)

private fun c(value: Long) = Color(0xFF000000L or value)

val themes: List<ThemeSpec> = listOf(
    ThemeSpec(
        id = "omp", name = "OMP", dark = true,
        background = c(0x0B1410), surface = c(0x111C17), raised = c(0x17241D),
        ink = c(0xE8F2EC), muted = c(0xA5B8AC), border = c(0x27382F),
        brand = c(0x4ADE80), wash = c(0x1A3327),
    ),
    ThemeSpec(
        id = "claude", name = "Claude", dark = false,
        background = c(0xFBF3E8), surface = c(0xFFFAF3), raised = c(0xF1E4D4),
        ink = c(0x352A26), muted = c(0x6E574A), border = c(0xE3D2C2),
        brand = c(0x914B35), wash = c(0xF5DFD3),
    ),
    ThemeSpec(
        id = "claude-dark", name = "Claude mørk", dark = true,
        background = c(0x1F1E1D), surface = c(0x262523), raised = c(0x302E2B),
        ink = c(0xF5F2EC), muted = c(0xB7B0A5), border = c(0x3D3A35),
        brand = c(0xD97757), wash = c(0x3A2C24),
    ),
    ThemeSpec(
        id = "chatgpt", name = "ChatGPT", dark = true,
        background = c(0x212121), surface = c(0x2B2B2B), raised = c(0x353535),
        ink = c(0xF5F5F5), muted = c(0xB9BDC7), border = c(0x4A4D54),
        brand = c(0x8BA8EB), wash = c(0x343D51),
    ),
    ThemeSpec(
        id = "qwen", name = "Qwen", dark = true,
        background = c(0x1A1A2E), surface = c(0x222238), raised = c(0x2C2C45),
        ink = c(0xF2F1FA), muted = c(0xA9A7C4), border = c(0x3A3A55),
        brand = c(0x8B5CF6), wash = c(0x2E2A4A),
    ),
    ThemeSpec(
        id = "deepseek", name = "DeepSeek", dark = true,
        background = c(0x0B1220), surface = c(0x121B2E), raised = c(0x1A2740),
        ink = c(0xE8EEFA), muted = c(0x9FB0CC), border = c(0x26344F),
        brand = c(0x4D6BFE), wash = c(0x1C2B4D),
    ),
    ThemeSpec(
        id = "graphite", name = "Grafitt", dark = true,
        background = c(0x17181C), surface = c(0x202227), raised = c(0x2A2D33),
        ink = c(0xF1F2F5), muted = c(0xB3B8C3), border = c(0x383C45),
        brand = c(0xC8CDE0), wash = c(0x343947),
    ),
    ThemeSpec(
        id = "midnight", name = "Midnatt", dark = true,
        background = c(0x101727), surface = c(0x182236), raised = c(0x232F47),
        ink = c(0xECF1FC), muted = c(0xABB9D4), border = c(0x303F59),
        brand = c(0xA9BFFF), wash = c(0x2B3D64),
    ),
    ThemeSpec(
        id = "forest", name = "Dyp skog", dark = true,
        background = c(0x101B17), surface = c(0x17251F), raised = c(0x20362B),
        ink = c(0xEAF5EE), muted = c(0xA9C0B2), border = c(0x345042),
        brand = c(0x9BE1BE), wash = c(0x244637),
    ),
    ThemeSpec(
        id = "amethyst", name = "Ametyst", dark = true,
        background = c(0x1D1726), surface = c(0x292035), raised = c(0x392C48),
        ink = c(0xF5EEFB), muted = c(0xCAB7D8), border = c(0x4B395C),
        brand = c(0xE1B9FA), wash = c(0x49345E),
    ),
    ThemeSpec(
        id = "bluehour", name = "Blåtime", dark = true,
        background = c(0x151922), surface = c(0x202633), raised = c(0x292F3D),
        ink = c(0xE9EDF4), muted = c(0xAAB4C5), border = c(0x384253),
        brand = c(0x8FA9E6), wash = c(0x303E58),
    ),
    ThemeSpec(
        id = "paper", name = "Papir", dark = false,
        background = c(0xFAF9F5), surface = c(0xFFFDFA), raised = c(0xEEEAE2),
        ink = c(0x282622), muted = c(0x615B54), border = c(0xDED9D0),
        brand = c(0x694637), wash = c(0xF2E1D6),
    ),
    ThemeSpec(
        id = "frost", name = "Frost", dark = false,
        background = c(0xF0F4FA), surface = c(0xFBFDFF), raised = c(0xE3EBF7),
        ink = c(0x202C40), muted = c(0x4F5F75), border = c(0xCFDBEA),
        brand = c(0x345383), wash = c(0xDAE7FA),
    ),
)

fun themeById(id: String): ThemeSpec = themes.firstOrNull { it.id == id } ?: themes.first()

@Composable
fun ChatOmpTheme(spec: ThemeSpec, content: @Composable () -> Unit) {
    val colors = if (spec.dark) {
        darkColorScheme(
            primary = spec.brand,
            onPrimary = spec.background,
            background = spec.background,
            onBackground = spec.ink,
            surface = spec.surface,
            onSurface = spec.ink,
            surfaceVariant = spec.raised,
            onSurfaceVariant = spec.muted,
            outline = spec.border,
            error = Color(0xFFFF7B72),
        )
    } else {
        lightColorScheme(
            primary = spec.brand,
            onPrimary = Color.White,
            background = spec.background,
            onBackground = spec.ink,
            surface = spec.surface,
            onSurface = spec.ink,
            surfaceVariant = spec.raised,
            onSurfaceVariant = spec.muted,
            outline = spec.border,
            error = Color(0xFFB3261E),
        )
    }
    MaterialTheme(colorScheme = colors, content = content)
}
