package net.nimay.chatompomp

import android.content.Context
import androidx.work.CoroutineWorker
import androidx.work.ExistingPeriodicWorkPolicy
import androidx.work.PeriodicWorkRequestBuilder
import androidx.work.WorkManager
import androidx.work.WorkerParameters
import java.util.concurrent.TimeUnit

/** Fase 16d: planlegger den periodiske trigger-sjekken (WorkManager). */
object TriggerScheduler {
    private const val WORK = "omp-trigger-check"

    fun schedule(context: Context) {
        val request = PeriodicWorkRequestBuilder<TriggerWorker>(15, TimeUnit.MINUTES)
            .setInitialDelay(1, TimeUnit.MINUTES)
            .build()
        runCatching {
            WorkManager.getInstance(context)
                .enqueueUniquePeriodicWork(WORK, ExistingPeriodicWorkPolicy.UPDATE, request)
        }
    }
}

/**
 * Fase 16d: vurderer tid, skift og sted hvert 15. minutt – også når appen er lukket.
 * Kjører rutinen automatisk når brukeren har slått på «Kjør automatisk» og
 * tilgjengelighetstjenesten er på; ellers sendes et varsel med en kjør-knapp.
 */
class TriggerWorker(context: Context, params: WorkerParameters) : CoroutineWorker(context, params) {

    override suspend fun doWork(): Result {
        val context = applicationContext
        val store = RoutineStore(context)
        val routines = store.load()
        if (routines.none { it.trigger.type != "manual" }) return Result.success()

        val shifts = ShiftStore(context).load()
        val places = PlaceStore(context).load()
        val location = TriggerEngine.lastLocation(context)
        val state = context.getSharedPreferences("omp-trigger-state", Context.MODE_PRIVATE)
        val now = System.currentTimeMillis()

        val due = routines.filter { routine ->
            when (routine.trigger.type) {
                "time", "shift" -> TriggerEngine.dueNow(routine.trigger, now, shifts, places, location, routine.lastRunAt)
                "place" -> placeTransition(routine.trigger, location, places, state)
                else -> false
            }
        }

        for (routine in due) {
            if (routine.autoRun && RoutineDevice.isReady()) {
                Notifications.routineRunning(context, routine.name)
                val result = RoutineRunner.run(context, routine)
                Notifications.routineFinished(context)
                store.save(
                    store.load().map {
                        if (it.id == routine.id) it.copy(lastRunAt = now, lastResult = result) else it
                    }
                )
            } else {
                Notifications.triggerReady(context, routine)
            }
        }
        return Result.success()
    }

    /** Fires only when the phone crosses the radius, not on every check. */
    private fun placeTransition(
        trigger: Trigger,
        location: Pair<Double, Double>?,
        places: List<Place>,
        state: android.content.SharedPreferences,
    ): Boolean {
        val place = places.firstOrNull { it.id == trigger.placeId } ?: return false
        val point = location ?: return false
        val inside = TriggerEngine.distanceMeters(point.first, point.second, place.lat, place.lng) <= place.radius
        val key = "inside:" + place.id
        val wasInside = state.getBoolean(key, false)
        val crossed = if (trigger.entering) inside && !wasInside else !inside && wasInside
        if (inside != wasInside) state.edit().putBoolean(key, inside).apply()
        return crossed
    }
}
