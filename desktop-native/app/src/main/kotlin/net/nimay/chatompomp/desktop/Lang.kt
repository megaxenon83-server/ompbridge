package net.nimay.chatompomp.desktop

import androidx.compose.runtime.Composable
import androidx.compose.runtime.compositionLocalOf

/** The two UI languages the app ships with. */
enum class AppLang { NB, EN }

val LocalLang = compositionLocalOf { AppLang.NB }

/**
 * Pick the string for the current UI language. Keeping both variants next to the
 * call site makes new strings impossible to forget in one language only.
 */
@Composable
fun t(nb: String, en: String): String = if (LocalLang.current == AppLang.EN) en else nb
