package net.nimay.chatompomp.desktop

import androidx.compose.runtime.CompositionLocalProvider
import androidx.compose.runtime.remember
import androidx.compose.ui.Alignment
import androidx.compose.ui.unit.DpSize
import androidx.compose.ui.unit.dp
import androidx.compose.ui.window.Window
import androidx.compose.ui.window.WindowPosition
import androidx.compose.ui.window.application
import androidx.compose.ui.window.rememberWindowState

/**
 * OMP Desktop – fase 14a spike.
 *
 * The window is a thin shell: ChatViewModel owns the bridge conversation and
 * RootScreen decides between the connect screen and the chat.
 */
fun main() = application {
    val vm = remember { ChatViewModel() }
    val windowState = rememberWindowState(
        size = DpSize(vm.prefs.windowWidth().dp, vm.prefs.windowHeight().dp),
        position = WindowPosition(Alignment.Center),
    )
    Window(
        onCloseRequest = {
            vm.saveWindow(windowState.size.width.value.toInt(), windowState.size.height.value.toInt())
            exitApplication()
        },
        title = "OMP Desktop",
        state = windowState,
    ) {
        ChatOmpTheme(vm.theme) {
            CompositionLocalProvider(LocalLang provides vm.lang) {
                RootScreen(vm)
            }
        }
    }
}
