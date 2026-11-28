package net.nimay.chatompomp

import android.content.Context
import android.view.accessibility.AccessibilityEvent
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow

/**
 * Fase 16b: spiller inn brukerens egne handlinger som rutinesteg.
 * Bare aktiv mens brukeren selv har trykket «Spill inn», og tjenesten slår av
 * registreringen med en gang brukeren stopper.
 */
object RoutineRecorder {

    private val state = MutableStateFlow<List<RoutineStep>>(emptyList())
    val steps: StateFlow<List<RoutineStep>> = state

    @Volatile
    var active: Boolean = false
        private set

    private var lastKey = ""
    private var lastAt = 0L
    private var lastPackage = ""

    fun start() {
        state.value = emptyList()
        lastKey = ""
        lastAt = 0L
        lastPackage = ""
        active = true
    }

    fun stop(): List<RoutineStep> {
        active = false
        return state.value
    }

    fun cancel() {
        active = false
        state.value = emptyList()
    }

    fun onEvent(context: Context, event: AccessibilityEvent) {
        if (!active) return
        val now = System.currentTimeMillis()
        when (event.eventType) {
            AccessibilityEvent.TYPE_WINDOW_STATE_CHANGED -> {
                val pkg = event.packageName?.toString().orEmpty()
                if (pkg.isBlank() || pkg == OWN_PACKAGE) return
                // Input methods, SystemUI and Settings search raise window events
                // without the user opening them; only real apps belong in a routine.
                if (!hasLauncher(context, pkg)) return
                if (pkg == lastPackage) return
                lastPackage = pkg
                add(RoutineStep(type = "open_app", packageName = pkg), now)
            }
            AccessibilityEvent.TYPE_VIEW_CLICKED -> {
                val raw = event.text.joinToString("\n").ifBlank { event.contentDescription?.toString().orEmpty() }
                // Settings rows send title + summary on separate lines; the title
                // is the stable part the routine should click on later.
                val label = raw.lineSequence().map { it.trim() }.firstOrNull { it.isNotBlank() }.orEmpty()
                if (label.isNotBlank()) add(RoutineStep(type = "tap", text = label.take(60)), now)
            }
            AccessibilityEvent.TYPE_VIEW_TEXT_CHANGED -> {
                val value = event.text.joinToString("").trim()
                if (value.isNotBlank()) add(RoutineStep(type = "type", text = value.take(200)), now)
            }
        }
    }

    private fun add(step: RoutineStep, now: Long) {
        val key = step.type + "|" + step.text + "|" + step.packageName
        if (key == lastKey && now - lastAt < 900) return
        lastKey = key
        lastAt = now
        val next = state.value + step
        // Never grow without bound while the user explores the phone.
        state.value = if (next.size > 60) next.takeLast(60) else next
    }

    private fun hasLauncher(context: Context, packageName: String): Boolean =
        runCatching { context.packageManager.getLaunchIntentForPackage(packageName) != null }.getOrDefault(false)

    private const val OWN_PACKAGE = "net.nimay.chatompomp"
}
