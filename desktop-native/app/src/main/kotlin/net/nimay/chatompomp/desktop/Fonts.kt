package net.nimay.chatompomp.desktop

import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.platform.Font

/** Bundled Inter: the same typeface Codex-style tools use, instead of the platform default. */
val AppFont: FontFamily = FontFamily(
    Font("fonts/Inter-Regular.ttf", FontWeight.Normal),
    Font("fonts/Inter-Medium.ttf", FontWeight.Medium),
    Font("fonts/Inter-SemiBold.ttf", FontWeight.SemiBold),
)
