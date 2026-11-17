package com.omp.chat.ui.theme

import android.os.Build
import androidx.compose.foundation.isSystemInDarkTheme
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Shapes
import androidx.compose.material3.Typography
import androidx.compose.material3.darkColorScheme
import androidx.compose.material3.dynamicDarkColorScheme
import androidx.compose.material3.dynamicLightColorScheme
import androidx.compose.material3.lightColorScheme
import androidx.compose.runtime.Composable
import androidx.compose.runtime.CompositionLocalProvider
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.platform.LocalDensity
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.Density
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp

// ---------------------------------------------------------------------------
// Nimay OMP Mobile - fargepalett (mørk modus)
// ---------------------------------------------------------------------------

val NimayBackground = Color(0xFF212121)
val NimaySidebar = Color(0xFF171717)
val NimaySurface = Color(0xFF2A2A2A)
val NimayInput = Color(0xFF303030)
val NimayUserBubble = Color(0xFF303030)
val NimayTextPrimary = Color(0xFFECECEC)
val NimayTextSecondary = Color(0xFFB4B4B4)
val NimayDivider = Color(0xFF3A3A3A)
val NimayAccent = Color(0xFFECECEC)
val NimayActive = Color(0xFF10A37F)
val NimayError = Color(0xFFFF6B6B)

private val DarkColors = darkColorScheme(
    primary = NimayAccent,
    onPrimary = Color(0xFF0D0D0D),
    primaryContainer = NimayUserBubble,
    onPrimaryContainer = NimayTextPrimary,
    inversePrimary = NimayAccent,
    secondary = NimayAccent,
    onSecondary = Color(0xFF0D0D0D),
    secondaryContainer = Color(0xFF2A2A2A),
    onSecondaryContainer = Color(0xFF86EFAC),
    tertiary = NimayTextSecondary,
    onTertiary = NimayBackground,
    tertiaryContainer = NimayInput,
    onTertiaryContainer = NimayTextPrimary,
    background = NimayBackground,
    onBackground = NimayTextPrimary,
    surface = NimayBackground,
    onSurface = NimayTextPrimary,
    surfaceVariant = NimaySidebar,
    onSurfaceVariant = NimayTextSecondary,
    surfaceTint = NimayAccent,
    inverseSurface = NimayTextPrimary,
    inverseOnSurface = NimayBackground,
    error = NimayError,
    onError = Color(0xFFFFFFFF),
    errorContainer = Color(0xFF4A1A1A),
    onErrorContainer = Color(0xFFFCA5A5),
    outline = NimayDivider,
    outlineVariant = NimayInput,
    scrim = Color(0xFF000000),
    surfaceBright = Color(0xFF353535),
    surfaceDim = NimayBackground,
    surfaceContainerLowest = Color(0xFF171717),
    surfaceContainerLow = Color(0xFF1C1C1C),
    surfaceContainer = NimaySidebar,
    surfaceContainerHigh = NimayInput,
    surfaceContainerHighest = Color(0xFF383838)
)

private val LightColors = lightColorScheme(
    primary = NimayAccent,
    onPrimary = Color(0xFFFFFFFF),
    primaryContainer = Color(0xFFE8ECEF),
    onPrimaryContainer = Color(0xFF101314),
    inversePrimary = NimayAccent,
    secondary = NimayAccent,
    onSecondary = Color(0xFFFFFFFF),
    secondaryContainer = Color(0xFFE2F3EC),
    onSecondaryContainer = Color(0xFF0D6851),
    tertiary = Color(0xFF6B7280),
    onTertiary = Color(0xFFFFFFFF),
    tertiaryContainer = Color(0xFFF3F4F6),
    onTertiaryContainer = Color(0xFF111827),
    background = Color(0xFFFFFFFF),
    onBackground = Color(0xFF101314),
    surface = Color(0xFFFFFFFF),
    onSurface = Color(0xFF101314),
    surfaceVariant = Color(0xFFF7F7F8),
    onSurfaceVariant = Color(0xFF6B7280),
    surfaceTint = NimayAccent,
    inverseSurface = Color(0xFF202123),
    inverseOnSurface = Color(0xFFECECF1),
    error = NimayError,
    onError = Color(0xFFFFFFFF),
    errorContainer = Color(0xFFFEE2E2),
    onErrorContainer = Color(0xFF991B1B),
    outline = Color(0xFFE5E7EB),
    outlineVariant = Color(0xFFF3F4F6),
    scrim = Color(0xFF000000),
    surfaceBright = Color(0xFFFFFFFF),
    surfaceDim = Color(0xFFF9FAFB),
    surfaceContainerLowest = Color(0xFFFFFFFF),
    surfaceContainerLow = Color(0xFFF9FAFB),
    surfaceContainer = Color(0xFFF7F7F8),
    surfaceContainerHigh = Color(0xFFECECF1),
    surfaceContainerHighest = Color(0xFFE5E7EB)
)

private val BaseTypography = Typography().let { base ->
    base.copy(
        bodyLarge = base.bodyLarge.copy(fontSize = 16.sp, lineHeight = 24.sp),
        bodyMedium = base.bodyMedium.copy(fontSize = 15.sp, lineHeight = 22.sp),
        bodySmall = base.bodySmall.copy(fontSize = 12.sp, lineHeight = 16.sp),
        titleLarge = base.titleLarge.copy(fontSize = 17.sp, lineHeight = 24.sp, fontWeight = FontWeight.SemiBold),
        titleMedium = base.titleMedium.copy(fontSize = 16.sp, lineHeight = 21.sp, fontWeight = FontWeight.SemiBold),
        titleSmall = base.titleSmall.copy(fontSize = 13.sp, lineHeight = 18.sp, fontWeight = FontWeight.SemiBold),
        labelLarge = base.labelLarge.copy(fontSize = 15.sp, fontWeight = FontWeight.Medium),
        labelMedium = base.labelMedium.copy(fontSize = 13.sp, fontWeight = FontWeight.Medium),
        labelSmall = base.labelSmall.copy(fontSize = 12.sp, fontWeight = FontWeight.Normal)
    )
}

val MonoStyle = TextStyle(
    fontFamily = FontFamily.Monospace,
    fontSize = 13.sp,
    lineHeight = 19.sp
)

private val NimayShapes = Shapes(
    extraSmall = androidx.compose.foundation.shape.RoundedCornerShape(6.dp),
    small = androidx.compose.foundation.shape.RoundedCornerShape(10.dp),
    medium = androidx.compose.foundation.shape.RoundedCornerShape(14.dp),
    large = androidx.compose.foundation.shape.RoundedCornerShape(20.dp),
    extraLarge = androidx.compose.foundation.shape.RoundedCornerShape(26.dp)
)

@Composable
fun OmpTheme(
    theme: String,
    dynamicColor: Boolean,
    fontScale: Float,
    content: @Composable () -> Unit
) {
    val dark = when (theme) {
        "light" -> false
        "dark" -> true
        else -> isSystemInDarkTheme()
    }
    val context = LocalContext.current
    val scheme = when {
        dynamicColor && Build.VERSION.SDK_INT >= Build.VERSION_CODES.S && dark -> dynamicDarkColorScheme(context)
        dynamicColor && Build.VERSION.SDK_INT >= Build.VERSION_CODES.S -> dynamicLightColorScheme(context)
        dark -> DarkColors
        else -> LightColors
    }
    val density = LocalDensity.current
    CompositionLocalProvider(
        LocalDensity provides Density(density.density, density.fontScale * fontScale.coerceIn(0.8f, 1.35f))
    ) {
        MaterialTheme(
            colorScheme = scheme,
            typography = BaseTypography,
            shapes = NimayShapes,
            content = content
        )
    }
}
