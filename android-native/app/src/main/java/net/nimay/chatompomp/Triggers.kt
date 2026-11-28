package net.nimay.chatompomp

import android.content.Context
import android.location.LocationManager
import kotlin.coroutines.resume
import org.json.JSONArray
import org.json.JSONObject
import java.util.Calendar
import java.util.Locale
import java.util.UUID

// ------------------------------------------------------------------ trigger

/**
 * Fase 16c/16d: en regel som starter en rutine. Triggeren er generisk – den vet
 * ingenting om Vy eller skift; den peker på tid, et sted eller en kalenderkilde.
 */
data class Trigger(
    val type: String = "manual",      // manual | time | place | shift
    val hour: Int = 8,
    val minute: Int = 0,
    val weekdays: Boolean = true,
    val minutesBefore: Int = 20,
    val placeId: String = "",
    val entering: Boolean = true,
) {
    fun toJson() = JSONObject().apply {
        put("type", type)
        put("hour", hour)
        put("minute", minute)
        put("weekdays", weekdays)
        put("minutesBefore", minutesBefore)
        put("placeId", placeId)
        put("entering", entering)
    }

    companion object {
        fun from(json: JSONObject?): Trigger {
            if (json == null) return Trigger()
            return Trigger(
                type = json.optString("type").ifBlank { "manual" },
                hour = json.optInt("hour", 8).coerceIn(0, 23),
                minute = json.optInt("minute", 0).coerceIn(0, 59),
                weekdays = json.optBoolean("weekdays", true),
                minutesBefore = json.optInt("minutesBefore", 20).coerceIn(0, 180),
                placeId = json.optString("placeId"),
                entering = json.optBoolean("entering", true),
            )
        }
    }
}

// ------------------------------------------------------------------ steder

data class Place(
    val id: String,
    val name: String,
    val lat: Double,
    val lng: Double,
    val radius: Int = 250,
) {
    fun toJson() = JSONObject().apply {
        put("id", id)
        put("name", name)
        put("lat", lat)
        put("lng", lng)
        put("radius", radius)
    }

    companion object {
        fun from(json: JSONObject) = Place(
            id = json.optString("id").ifBlank { UUID.randomUUID().toString() },
            name = json.optString("name").ifBlank { "Sted" },
            lat = json.optDouble("lat"),
            lng = json.optDouble("lng"),
            radius = json.optInt("radius", 250).coerceIn(50, 5000),
        )
    }
}

class PlaceStore(private val context: Context) {
    private val prefs = context.getSharedPreferences("omp-places", Context.MODE_PRIVATE)

    fun load(): List<Place> = runCatching {
        val raw = prefs.getString("places", "[]") ?: "[]"
        val array = JSONArray(raw)
        (0 until array.length()).mapNotNull { array.optJSONObject(it)?.let(Place::from) }
    }.getOrDefault(emptyList())

    fun save(places: List<Place>) {
        prefs.edit().putString("places", JSONArray().apply { places.forEach { put(it.toJson()) } }.toString()).apply()
    }
}

// ------------------------------------------------------------------ skift

data class Shift(
    val id: String,
    val start: Long,
    val end: Long,
    val label: String = "",
) {
    val hours: Double
        get() = ((end - start) / 3_600_000.0).coerceAtLeast(0.0)

    fun toJson() = JSONObject().apply {
        put("id", id)
        put("start", start)
        put("end", end)
        put("label", label)
    }

    companion object {
        fun from(json: JSONObject) = Shift(
            id = json.optString("id").ifBlank { UUID.randomUUID().toString() },
            start = json.optLong("start"),
            end = json.optLong("end"),
            label = json.optString("label"),
        )
    }
}

class ShiftStore(context: Context) {
    private val prefs = context.getSharedPreferences("omp-shifts", Context.MODE_PRIVATE)

    fun load(): List<Shift> = runCatching {
        val raw = prefs.getString("shifts", "[]") ?: "[]"
        val array = JSONArray(raw)
        (0 until array.length()).mapNotNull { array.optJSONObject(it)?.let(Shift::from) }
    }.getOrDefault(emptyList()).sortedBy { it.start }

    fun save(shifts: List<Shift>) {
        prefs.edit().putString("shifts", JSONArray().apply { shifts.forEach { put(it.toJson()) } }.toString()).apply()
    }

    /** The next shift starting within [window] ms from [now] (or already started <1 h ago). */
    fun nextWithin(now: Long, window: Long): Shift? =
        load().firstOrNull { it.start in now..(now + window) }

    companion object {
        private val PATTERNS = listOf(
            Regex("""^(\d{4})-(\d{2})-(\d{2})\s+(\d{1,2})[:.](\d{2})\s*[-–]\s*(\d{1,2})[:.](\d{2})$"""),
            Regex("""^(\d{1,2})[.](\d{1,2})\s+(\d{1,2})[:.](\d{2})\s*[-–]\s*(\d{1,2})[:.](\d{2})$"""),
        )

        /**
         * Parses lines like "2026-12-01 14:00-22:00" or "1.12 14:00-22:00".
         * Unknown lines are returned in [rejects] so the UI can say what failed.
         */
        fun parse(text: String, now: Long = System.currentTimeMillis()): Pair<List<Shift>, List<String>> {
            val shifts = mutableListOf<Shift>()
            val rejects = mutableListOf<String>()
            val thisYear = Calendar.getInstance().apply { timeInMillis = now }.get(Calendar.YEAR)
            for (line in text.lineSequence().map { it.trim() }.filter { it.isNotEmpty() }) {
                val full = PATTERNS[0].find(line)
                if (full != null) {
                    val (y, mo, d, sh, sm, eh, em) = full.destructured
                    val shift = buildShift(y.toInt(), mo.toInt(), d.toInt(), sh.toInt(), sm.toInt(), eh.toInt(), em.toInt())
                    if (shift != null) shifts += shift else rejects += line
                    continue
                }
                val short = PATTERNS[1].find(line)
                if (short != null) {
                    val (d, mo, sh, sm, eh, em) = short.destructured
                    val shift = buildShift(thisYear, mo.toInt(), d.toInt(), sh.toInt(), sm.toInt(), eh.toInt(), em.toInt())
                    if (shift != null) shifts += shift else rejects += line
                    continue
                }
                rejects += line
            }
            return shifts.sortedBy { it.start } to rejects
        }

        private fun buildShift(year: Int, month: Int, day: Int, sh: Int, sm: Int, eh: Int, em: Int): Shift? {
            if (month !in 1..12 || day !in 1..31 || sh !in 0..23 || eh !in 0..24) return null
            val calendar = Calendar.getInstance().apply {
                set(Calendar.YEAR, year)
                set(Calendar.MONTH, month - 1)
                set(Calendar.DAY_OF_MONTH, day)
                set(Calendar.HOUR_OF_DAY, sh)
                set(Calendar.MINUTE, sm)
                set(Calendar.SECOND, 0)
                set(Calendar.MILLISECOND, 0)
            }
            val start = calendar.timeInMillis
            var end = start + ((eh - sh) * 60L + (em - sm)) * 60_000L
            if (end <= start) end += 24 * 3_600_000L // overnight shift, e.g. 22:00-06:00
            return Shift(UUID.randomUUID().toString(), start, end)
        }

        /** Builds shifts for [weeks] weeks starting Monday, for the chosen days. */
        fun pattern(
            days: Set<Int>,          // Calendar.MONDAY..SUNDAY
            startHour: Int,
            endHour: Int,
            weeks: Int,
            now: Long = System.currentTimeMillis(),
        ): List<Shift> {
            if (days.isEmpty() || endHour <= startHour || weeks <= 0) return emptyList()
            val out = mutableListOf<Shift>()
            val day = Calendar.getInstance().apply {
                timeInMillis = now
                set(Calendar.HOUR_OF_DAY, 0)
                set(Calendar.MINUTE, 0)
                set(Calendar.SECOND, 0)
                set(Calendar.MILLISECOND, 0)
                // Start from this week's Monday.
                while (get(Calendar.DAY_OF_WEEK) != Calendar.MONDAY) add(Calendar.DAY_OF_MONTH, -1)
            }
            repeat(weeks * 7) {
                if (day.get(Calendar.DAY_OF_WEEK) in days) {
                    val start = day.clone() as Calendar
                    start.set(Calendar.HOUR_OF_DAY, startHour)
                    start.set(Calendar.MINUTE, 0)
                    val s = start.timeInMillis
                    val e = s + (endHour - startHour) * 3_600_000L
                    if (e > now) out += Shift(UUID.randomUUID().toString(), s, e)
                }
                day.add(Calendar.DAY_OF_MONTH, 1)
            }
            return out
        }
    }
}

// ------------------------------------------------------------------ motor

object TriggerEngine {

    /** True when the trigger wants the routine to run right now. */
    fun dueNow(
        trigger: Trigger,
        now: Long,
        shifts: List<Shift>,
        places: List<Place>,
        location: Pair<Double, Double>?,
        lastRunAt: Long,
    ): Boolean {
        if (trigger.type == "manual") return false
        // Never run the same routine twice within ten minutes.
        if (now - lastRunAt < 10 * 60_000L) return false
        return when (trigger.type) {
            "time" -> timeMatches(trigger, now)
            "shift" -> shifts.any { it.start in now..(now + trigger.minutesBefore * 60_000L) }
            "place" -> {
                val place = places.firstOrNull { it.id == trigger.placeId } ?: return false
                val point = location ?: return false
                distanceMeters(point.first, point.second, place.lat, place.lng) <= place.radius
            }
            else -> false
        }
    }

    fun timeMatches(trigger: Trigger, now: Long): Boolean {
        val calendar = Calendar.getInstance().apply { timeInMillis = now }
        if (trigger.weekdays) {
            val day = calendar.get(Calendar.DAY_OF_WEEK)
            if (day == Calendar.SATURDAY || day == Calendar.SUNDAY) return false
        }
        val minutes = calendar.get(Calendar.HOUR_OF_DAY) * 60 + calendar.get(Calendar.MINUTE)
        val target = trigger.hour * 60 + trigger.minute
        return minutes == target
    }

    fun distanceMeters(lat1: Double, lng1: Double, lat2: Double, lng2: Double): Double {
        val r = 6_371_000.0
        val dLat = Math.toRadians(lat2 - lat1)
        val dLng = Math.toRadians(lng2 - lng1)
        val a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
            Math.cos(Math.toRadians(lat1)) * Math.cos(Math.toRadians(lat2)) *
            Math.sin(dLng / 2) * Math.sin(dLng / 2)
        return r * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
    }

    /** Plain-language summary used in the routine list and detail screen. */
    fun describe(trigger: Trigger, places: List<Place>, nb: Boolean): String = when (trigger.type) {
        "time" -> {
            val time = String.format(Locale.getDefault(), "%02d:%02d", trigger.hour, trigger.minute)
            if (nb) "Kl. $time" + if (trigger.weekdays) " (hverdager)" else " (alle dager)"
            else "At $time" + if (trigger.weekdays) " (weekdays)" else " (every day)"
        }
        "shift" -> if (nb) "${trigger.minutesBefore} min før skift" else "${trigger.minutesBefore} min before a shift"
        "place" -> {
            val place = places.firstOrNull { it.id == trigger.placeId }
            val name = place?.name ?: if (nb) "et sted" else "a place"
            if (nb) (if (trigger.entering) "Når jeg kommer til " else "Når jeg forlater ") + name
            else (if (trigger.entering) "When I arrive at " else "When I leave ") + name
        }
        else -> if (nb) "Manuelt" else "Manual"
    }

    /** Last known position from GPS, network or fused; null when location is off. */
    fun lastLocation(context: Context): Pair<Double, Double>? {
        return runCatching {
            val manager = context.getSystemService(LocationManager::class.java) ?: return null
            val providers = listOf(LocationManager.GPS_PROVIDER, LocationManager.NETWORK_PROVIDER, "fused")
            providers.mapNotNull { provider -> runCatching { manager.getLastKnownLocation(provider) }.getOrNull() }
                .maxByOrNull { it.time }
                ?.let { it.latitude to it.longitude }
        }.getOrNull()
    }

    /** Asks the system for one fresh fix (starts GPS briefly). Null on timeout. */
    suspend fun currentLocation(context: Context, timeoutMs: Long = 15_000): Pair<Double, Double>? {
        val manager = context.getSystemService(LocationManager::class.java) ?: return null
        if (android.os.Build.VERSION.SDK_INT >= android.os.Build.VERSION_CODES.R) {
            return kotlinx.coroutines.suspendCancellableCoroutine { continuation ->
                val handler = android.os.Handler(android.os.Looper.getMainLooper())
                runCatching {
                    val executor = java.util.concurrent.Executor { command -> handler.post(command) }
                    manager.getCurrentLocation(LocationManager.GPS_PROVIDER, null, executor) { location ->
                        if (continuation.isActive) {
                            continuation.resume(if (location != null) location.latitude to location.longitude else null)
                        }
                    }
                }.onFailure { if (continuation.isActive) continuation.resume(null) }
                handler.postDelayed({
                    if (continuation.isActive) continuation.resume(null)
                }, timeoutMs)
            }
        }
        return lastLocation(context)
    }
}
