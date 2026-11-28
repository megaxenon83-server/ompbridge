package net.nimay.chatompomp

import android.accessibilityservice.AccessibilityService
import android.content.Intent
import android.view.accessibility.AccessibilityEvent
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow

/**
 * Fase 16b: lar rutinene kjøre uten PC. Tjenesten gjør ingenting av seg selv –
 * den utfører bare handlinger når brukeren starter en rutine i appen, og den
 * registrerer hendelser når brukeren selv spiller inn en rutine.
 */
class OmpAccessibilityService : AccessibilityService() {

    override fun onServiceConnected() {
        super.onServiceConnected()
        instance = this
        connected.value = true
    }

    override fun onAccessibilityEvent(event: AccessibilityEvent?) {
        val item = event ?: return
        if (!RoutineRecorder.active) return
        val before = RoutineRecorder.steps.value.size
        RoutineRecorder.onEvent(this, item)
        val after = RoutineRecorder.steps.value.size
        if (after != before) Notifications.recording(this, after)
    }

    override fun onInterrupt() {
        // Ingen løpende tale/feedback å avbryte.
    }

    override fun onUnbind(intent: Intent?): Boolean {
        instance = null
        connected.value = false
        return super.onUnbind(intent)
    }

    override fun onDestroy() {
        instance = null
        connected.value = false
        super.onDestroy()
    }

    companion object {
        @Volatile
        var instance: OmpAccessibilityService? = null

        private val connected = MutableStateFlow(false)

        /** True når brukeren har slått på tjenesten i Android-innstillinger. */
        val isReady: StateFlow<Boolean> = connected

        fun current(): OmpAccessibilityService? = instance
    }
}
