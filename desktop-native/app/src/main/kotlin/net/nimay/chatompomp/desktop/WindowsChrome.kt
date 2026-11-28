package net.nimay.chatompomp.desktop

import androidx.compose.ui.graphics.Color
import com.sun.jna.Library
import com.sun.jna.Native
import com.sun.jna.Pointer
import com.sun.jna.platform.win32.User32
import com.sun.jna.platform.win32.WinDef.HWND
import com.sun.jna.ptr.IntByReference

/**
 * Windows 11 draws the caption bar; a default white caption on a near-black app
 * is what makes a desktop app feel like a web page in a frame. This paints the
 * caption, its text and the window border with the app's own colours.
 */
object WindowsChrome {

    private const val DWMWA_USE_IMMERSIVE_DARK_MODE = 20
    private const val DWMWA_BORDER_COLOR = 34
    private const val DWMWA_CAPTION_COLOR = 35
    private const val DWMWA_TEXT_COLOR = 36

    interface DwmApi : Library {
        fun DwmSetWindowAttribute(hwnd: HWND?, attribute: Int, value: Pointer, size: Int): Int
    }

    interface User32Api : Library {
        fun FindWindowW(className: String?, windowName: String): HWND?
    }

    private val dwm: DwmApi? by lazy {
        runCatching { Native.load("dwmapi", DwmApi::class.java) }.getOrNull()
    }

    private val user32: User32Api? by lazy {
        runCatching { Native.load("user32", User32Api::class.java) }.getOrNull()
    }

    /** COLORREF is 0x00BBGGRR, not 0x00RRGGBB. */
    private fun colorRef(color: Color): Int {
        val r = (color.red * 255).toInt() and 0xFF
        val g = (color.green * 255).toInt() and 0xFF
        val b = (color.blue * 255).toInt() and 0xFF
        return (b shl 16) or (g shl 8) or r
    }

    suspend fun apply(windowTitle: String, theme: ThemeSpec) {
        if (!System.getProperty("os.name").lowercase().contains("win")) return
        val api = dwm ?: return
        // The window is not created the instant the composition starts; retry briefly.
        var hwnd: HWND? = null
        repeat(25) {
            hwnd = runCatching { user32?.FindWindowW(null, windowTitle) }.getOrNull()
            if (hwnd != null) return@repeat
            kotlinx.coroutines.delay(200)
        }
        val handle = hwnd
        if (handle == null) {
            applyViaPowerShell(windowTitle, theme)
            return
        }
        fun set(attribute: Int, value: Int) {
            runCatching {
                val reference = IntByReference(value)
                api.DwmSetWindowAttribute(handle, attribute, reference.pointer, 4)
            }
        }
        val dark = if (theme.dark) 1 else 0
        set(DWMWA_USE_IMMERSIVE_DARK_MODE, dark)
        set(DWMWA_CAPTION_COLOR, colorRef(theme.background))
        set(DWMWA_TEXT_COLOR, colorRef(theme.ink))
        set(DWMWA_BORDER_COLOR, colorRef(theme.background))
        // JNA silently no-ops on some packaged runtimes; the hidden helper is idempotent.
        applyViaPowerShell(windowTitle, theme)
    }
    /**
     * JNA reaches the window only sometimes (module access differs per runtime);
     * a hidden PowerShell one-shot is the dependable fallback.
     */
    private fun applyViaPowerShell(windowTitle: String, theme: ThemeSpec) {
        val caption = String.format("0x%06X", colorRef(theme.background))
        val text = String.format("0x%06X", colorRef(theme.ink))
        val title = windowTitle.replace("'", "''")
        val script = "Add-Type -TypeDefinition 'using System;using System.Text;using System.Runtime.InteropServices;" +
            "public class DshDwm{public delegate bool E(IntPtr h,IntPtr l);" +
            "[DllImport(\"user32.dll\")]public static extern bool EnumWindows(E p,IntPtr l);" +
            "[DllImport(\"user32.dll\",CharSet=CharSet.Unicode)]public static extern int GetWindowText(IntPtr h,StringBuilder s,int c);" +
            "[DllImport(\"user32.dll\")]public static extern bool IsWindowVisible(IntPtr h);" +
            "[DllImport(\"dwmapi.dll\")]public static extern int DwmSetWindowAttribute(IntPtr h,int a,ref int v,int s);" +
            "public static IntPtr Find(string t){IntPtr f=IntPtr.Zero;EnumWindows((h,l)=>{if(IsWindowVisible(h)){var sb=new StringBuilder(512);GetWindowText(h,sb,512);if(sb.ToString()==t){f=h;return false;}}return true;},IntPtr.Zero);return f;}}';" +
            "\$h=[DshDwm]::Find('" + title + "');" +
            "if(\$h -ne [IntPtr]::Zero){\$d=1;[DshDwm]::DwmSetWindowAttribute(\$h,20,[ref]\$d,4)|Out-Null;" +
            "\$c=" + caption + ";[DshDwm]::DwmSetWindowAttribute(\$h,35,[ref]\$c,4)|Out-Null;" +
            "\$t=" + text + ";[DshDwm]::DwmSetWindowAttribute(\$h,36,[ref]\$t,4)|Out-Null;" +
            "\$b=" + caption + ";[DshDwm]::DwmSetWindowAttribute(\$h,34,[ref]\$b,4)|Out-Null}"
        runCatching {
            val encoded = java.util.Base64.getEncoder()
                .encodeToString(script.toByteArray(Charsets.UTF_16LE))
            ProcessBuilder("powershell.exe", "-NoProfile", "-NonInteractive", "-WindowStyle", "Hidden", "-EncodedCommand", encoded)
                .redirectErrorStream(true)
                .start()
        }
    }}
