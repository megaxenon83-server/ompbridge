package net.nimay.chatompomp

import android.accessibilityservice.AccessibilityService
import android.accessibilityservice.GestureDescription
import android.content.Context
import android.content.Intent
import android.graphics.Path
import android.graphics.Rect
import android.net.Uri
import android.os.Build
import android.os.Bundle
import android.view.accessibility.AccessibilityNodeInfo

/**
 * Fase 16b: utfører rutinesteg direkte på telefonen via tilgjengelighetstjenesten,
 * uten PC eller ADB. Speiler handlingene bridgen tilbyr, men treffer knapper etter
 * tekst/rolle i stedet for faste koordinater.
 */
object RoutineDevice {

    fun isReady(): Boolean = OmpAccessibilityService.current() != null

    fun openApp(context: Context, packageName: String): Boolean {
        val pkg = packageName.trim()
        if (pkg.isBlank()) return false
        val intent = context.packageManager.getLaunchIntentForPackage(pkg) ?: return false
        intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_RESET_TASK_IF_NEEDED)
        return runCatching { context.startActivity(intent) }.isSuccess
    }

    fun openUrl(context: Context, url: String): Boolean {
        val target = url.trim()
        if (target.isBlank()) return false
        val intent = Intent(Intent.ACTION_VIEW, Uri.parse(target))
            .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
        return runCatching { context.startActivity(intent) }.isSuccess
    }

    fun tapText(text: String): Boolean {
        val service = OmpAccessibilityService.current() ?: return false
        val root = service.rootInActiveWindow ?: return false
        val node = findNode(root) { matches(it, text) } ?: return false
        if (node.isClickable && node.performAction(AccessibilityNodeInfo.ACTION_CLICK)) return true
        var parent = node.parent
        while (parent != null) {
            if (parent.isClickable && parent.performAction(AccessibilityNodeInfo.ACTION_CLICK)) return true
            parent = parent.parent
        }
        return tapCenter(service, node)
    }

    fun tapPoint(rx: Float, ry: Float): Boolean {
        val service = OmpAccessibilityService.current() ?: return false
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.N) return false
        val size = screenSize(service)
        val x = (rx.coerceIn(0f, 1f) * size.first).toInt()
        val y = (ry.coerceIn(0f, 1f) * size.second).toInt()
        val path = Path().apply { moveTo(x.toFloat(), y.toFloat()) }
        val gesture = GestureDescription.Builder()
            .addStroke(GestureDescription.StrokeDescription(path, 0, 80))
            .build()
        return service.dispatchGesture(gesture, null, null)
    }

    fun typeText(text: String): Boolean {
        val service = OmpAccessibilityService.current() ?: return false
        val root = service.rootInActiveWindow
        val focused = runCatching { service.findFocus(AccessibilityNodeInfo.FOCUS_INPUT) }.getOrNull()
        val target = focused?.takeIf { it.isEditable }
            ?: root?.let { findNode(it) { node -> node.isEditable } }
            ?: return false
        val args = Bundle().apply {
            putCharSequence(AccessibilityNodeInfo.ACTION_ARGUMENT_SET_TEXT_CHARSEQUENCE, text)
        }
        if (target.performAction(AccessibilityNodeInfo.ACTION_SET_TEXT, args)) return true
        // Some fields reject ACTION_SET_TEXT; fall back to ACTION_FOCUS + paste-less input.
        target.performAction(AccessibilityNodeInfo.ACTION_FOCUS)
        return false
    }

    fun pressKey(key: String): Boolean {
        val service = OmpAccessibilityService.current() ?: return false
        return when (key.trim().lowercase()) {
            "back" -> service.performGlobalAction(AccessibilityService.GLOBAL_ACTION_BACK)
            "home" -> service.performGlobalAction(AccessibilityService.GLOBAL_ACTION_HOME)
            "recents" -> service.performGlobalAction(AccessibilityService.GLOBAL_ACTION_RECENTS)
            "notifications" -> service.performGlobalAction(AccessibilityService.GLOBAL_ACTION_NOTIFICATIONS)
            else -> false
        }
    }

    fun screenText(): String {
        val service = OmpAccessibilityService.current() ?: return ""
        val root = service.rootInActiveWindow ?: return ""
        val out = StringBuilder()
        collectText(root, out)
        return out.toString()
    }

    fun check(text: String): Boolean {
        val wanted = text.trim()
        if (wanted.isBlank()) return false
        return screenText().contains(wanted, ignoreCase = true)
    }

    fun foregroundPackage(): String {
        val service = OmpAccessibilityService.current() ?: return ""
        return runCatching { service.rootInActiveWindow?.packageName?.toString().orEmpty() }.getOrDefault("")
    }

    private fun tapCenter(service: AccessibilityService, node: AccessibilityNodeInfo): Boolean {
        val bounds = Rect()
        node.getBoundsInScreen(bounds)
        if (bounds.width() <= 0 || bounds.height() <= 0) return false
        val path = Path().apply { moveTo(bounds.exactCenterX(), bounds.exactCenterY()) }
        val gesture = GestureDescription.Builder()
            .addStroke(GestureDescription.StrokeDescription(path, 0, 60))
            .build()
        return service.dispatchGesture(gesture, null, null)
    }

    private fun screenSize(service: AccessibilityService): Pair<Int, Int> {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.R) {
            val manager = service.getSystemService(android.view.WindowManager::class.java)
            val bounds = manager?.currentWindowMetrics?.bounds
            if (bounds != null && bounds.width() > 0 && bounds.height() > 0) {
                return bounds.width() to bounds.height()
            }
        }
        val metrics = service.resources.displayMetrics
        return metrics.widthPixels to metrics.heightPixels
    }

    private fun findNode(
        root: AccessibilityNodeInfo,
        predicate: (AccessibilityNodeInfo) -> Boolean,
    ): AccessibilityNodeInfo? {
        if (predicate(root)) return root
        for (index in 0 until root.childCount) {
            val child = root.getChild(index) ?: continue
            val found = findNode(child, predicate)
            if (found != null) return found
        }
        return null
    }

    private fun matches(node: AccessibilityNodeInfo, text: String): Boolean {
        val label = text.trim()
        if (label.isBlank()) return false
        val values = listOfNotNull(
            node.text?.toString(),
            node.contentDescription?.toString(),
            runCatching { node.hintText?.toString() }.getOrNull(),
        )
        // Exact match first so "Network & internet" does not hit "Network & internet Mobile, Wi-Fi".
        if (values.any { it.equals(label, ignoreCase = true) }) return true
        return values.any { it.contains(label, ignoreCase = true) }
    }

    private fun collectText(node: AccessibilityNodeInfo, out: StringBuilder) {
        node.text?.toString()?.takeIf { it.isNotBlank() }?.let { out.append(it).append('\n') }
        node.contentDescription?.toString()?.takeIf { it.isNotBlank() }?.let { out.append(it).append('\n') }
        for (index in 0 until node.childCount) {
            val child = node.getChild(index) ?: continue
            collectText(child, out)
        }
    }
}
