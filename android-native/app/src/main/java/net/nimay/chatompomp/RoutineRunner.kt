package net.nimay.chatompomp

import android.content.Context

/**
 * Fase 16c/16d: felles utførelse av rutinesteg. Brukes både fra appen (Test/Kjør)
 * og fra bakgrunnsjobben, slik at en trigger kan kjøre en rutine uten at appen er åpen.
 */
object RoutineRunner {

    /** Runs one step. Throws with a user-facing message when the step fails. */
    suspend fun runStep(context: Context, step: RoutineStep) {
        val local = RoutineDevice.isReady()
        when (step.type) {
            "wait" -> kotlinx.coroutines.delay(step.ms.coerceIn(0, 60_000).toLong())
            "check" -> {
                if (local) {
                    if (!RoutineDevice.check(step.text)) {
                        throw IllegalStateException("Fant ikke «${step.text}» på skjermen.")
                    }
                } else {
                    val data = devicePost(context, "check") { put("text", step.text) }
                    if (!data.optBoolean("found")) {
                        throw IllegalStateException("Fant ikke «${step.text}» på skjermen.")
                    }
                }
            }
            "open_app" -> {
                if (local) {
                    if (!RoutineDevice.openApp(context, step.packageName)) {
                        throw IllegalStateException("Fant ikke appen «${shortPackage(step.packageName)}».")
                    }
                } else {
                    devicePost(context, "open") { put("package", step.packageName) }
                }
            }
            "open_url" -> {
                if (local) {
                    if (!RoutineDevice.openUrl(context, step.url)) {
                        throw IllegalStateException("Kunne ikke åpne ${step.url}.")
                    }
                } else {
                    devicePost(context, "open") { put("url", step.url) }
                }
            }
            "tap" -> {
                if (local) {
                    val ok = if (step.usesPoint) RoutineDevice.tapPoint(step.rx, step.ry)
                    else RoutineDevice.tapText(step.text)
                    if (!ok) throw IllegalStateException("Fant ikke «${step.text}» å trykke på.")
                } else if (step.usesPoint) {
                    devicePost(context, "tap") {
                        put("x", step.rx.toDouble())
                        put("y", step.ry.toDouble())
                    }
                } else {
                    devicePost(context, "tap") { put("text", step.text) }
                }
            }
            "type" -> {
                if (local) {
                    if (!RoutineDevice.typeText(step.text)) {
                        throw IllegalStateException("Fant ikke noe felt å skrive i.")
                    }
                } else {
                    devicePost(context, "type") { put("text", step.text) }
                }
            }
            "key" -> {
                if (local) {
                    if (!RoutineDevice.pressKey(step.key)) {
                        throw IllegalStateException("Tasten «${step.key}» støttes ikke uten PC.")
                    }
                } else {
                    devicePost(context, "key") { put("key", step.key) }
                }
            }
            else -> throw IllegalStateException("Ukjent stegtype: ${step.type}")
        }
    }

    /** Runs every step and returns "OK", "Stoppet" or "Feil". */
    suspend fun run(context: Context, routine: Routine, onStep: (Int, RoutineStep) -> Unit = { _, _ -> }): String {
        var result = "OK"
        try {
            for ((index, step) in routine.steps.withIndex()) {
                onStep(index + 1, step)
                runStep(context, step)
                kotlinx.coroutines.delay(220)
            }
        } catch (cancelled: kotlinx.coroutines.CancellationException) {
            result = "Stoppet"
            throw cancelled
        } catch (_: Exception) {
            result = "Feil"
        }
        return result
    }

    private suspend fun devicePost(context: Context, action: String, extra: org.json.JSONObject.() -> Unit): org.json.JSONObject {
        val bridge = BridgeClient(context)
        return bridge.post("/api/device/action", org.json.JSONObject().apply {
            put("device", "android")
            put("action", action)
            extra()
        })
    }
}
