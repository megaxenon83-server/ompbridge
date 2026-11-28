package net.nimay.chatompomp.desktop

import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.WindowInsets
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.padding
import androidx.compose.runtime.CompositionLocalProvider
import androidx.compose.runtime.remember
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.input.key.Key
import androidx.compose.ui.input.key.KeyEventType
import androidx.compose.ui.input.key.isCtrlPressed
import androidx.compose.ui.input.key.key
import androidx.compose.ui.input.key.type
import androidx.compose.ui.unit.DpSize
import androidx.compose.ui.unit.dp
import androidx.compose.ui.window.Window
import androidx.compose.ui.window.WindowPosition
import androidx.compose.ui.window.application
import androidx.compose.ui.window.rememberWindowState
import java.awt.Frame

/**
 * OMP Desktop.
 *
 * The window is frameless on purpose: Windows' own caption would be a white band
 * above a near-black app, which is exactly the "web page in a browser" look we
 * are replacing. The app draws its own 36 dp strip instead, so the sidebar colour
 * reaches the top edge the way a native tool does.
 */
fun main() = application {
    val vm = remember { ChatViewModel() }
    val shell = remember { ShellState() }
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
        undecorated = true,
        resizable = true,
        onPreviewKeyEvent = { event ->
            if (event.type == KeyEventType.KeyDown) {
                when {
                    event.isCtrlPressed && event.key == Key.K -> { shell.openPalette(); true }
                    event.key == Key.Escape && shell.palette -> { shell.closePalette(); true }
                    event.key == Key.Escape && vm.busy -> { vm.stop(); true }
                    else -> false
                }
            } else false
        },
    ) {
        val controls = WindowControls(
            minimize = { window.extendedState = window.extendedState or Frame.ICONIFIED },
            toggleMaximize = {
                window.extendedState = if ((window.extendedState and Frame.MAXIMIZED_BOTH) == Frame.MAXIMIZED_BOTH) {
                    Frame.NORMAL
                } else {
                    Frame.MAXIMIZED_BOTH
                }
            },
            close = { exitApplication() },
            dragBy = { dx, dy ->
                val location = window.location
                window.location = java.awt.Point(location.x + dx, location.y + dy)
            },
            resizeBy = { edge, dx, dy ->
                val location = window.location
                var x = location.x
                var y = location.y
                var w = window.size.width
                var h = window.size.height
                if (edge == ResizeEdge.W || edge == ResizeEdge.NW || edge == ResizeEdge.SW) {
                    x += dx
                    w -= dx
                }
                if (edge == ResizeEdge.E || edge == ResizeEdge.NE || edge == ResizeEdge.SE) {
                    w += dx
                }
                if (edge == ResizeEdge.N || edge == ResizeEdge.NW || edge == ResizeEdge.NE) {
                    y += dy
                    h -= dy
                }
                if (edge == ResizeEdge.S || edge == ResizeEdge.SW || edge == ResizeEdge.SE) {
                    h += dy
                }
                w = w.coerceAtLeast(900)
                h = h.coerceAtLeast(600)
                window.setBounds(x, y, w, h)
            },
        )
        ChatOmpTheme(vm.theme) {
            CompositionLocalProvider(LocalLang provides vm.lang) {
                RootScreen(vm = vm, shell = shell, controls = controls)
            }
        }
    }
}
