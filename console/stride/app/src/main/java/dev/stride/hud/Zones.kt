package dev.stride.hud

import org.json.JSONObject

/**
 * A runner's training zones, as TrailMate keeps them on their profile (spec
 * 038, the `zones` block of `stride.schedule.v1`): five pace bands and five
 * heart-rate bands, and their maximum and resting heart rate. A zone their
 * profile has no band for is simply absent.
 */
data class Zones(
    val pace: Map<Int, SpeedBand>,
    val hr: Map<Int, HrBand>,
    val maxHr: Int?,
    val restingHr: Int?,
) {
    /**
     * The pace band heart-rate zone [zone] usually means for this runner: pace
     * zone N for HR zone N, the same pairing TrailMate's own pace estimator
     * makes. Where heart-rate control starts, and what it stays near.
     * The one place on the console that pairing is made.
     */
    fun paceForHrZone(zone: Int): SpeedBand? = pace[zone]

    /** The zone a heart rate falls in, or null. */
    fun hrZoneOf(bpm: Double): Int? = hr.entries.firstOrNull { bpm in it.value }?.key

    val isEmpty: Boolean get() = pace.isEmpty() && hr.isEmpty()

    companion object {
        val NONE = Zones(emptyMap(), emptyMap(), null, null)

        /** Lenient: anything malformed is left out rather than guessed. */
        fun parse(o: JSONObject?): Zones {
            if (o == null) return NONE
            val pace = HashMap<Int, SpeedBand>()
            o.optJSONArray("pace")?.let { a ->
                for (i in 0 until a.length()) {
                    val z = a.optJSONObject(i) ?: continue
                    val lo = z.optDouble("minMs"); val hi = z.optDouble("maxMs")
                    if (lo.isNaN() || hi.isNaN() || lo > hi) continue
                    pace[z.optInt("zone")] = SpeedBand.ofMs(lo, hi)
                }
            }
            val hr = HashMap<Int, HrBand>()
            o.optJSONArray("hr")?.let { a ->
                for (i in 0 until a.length()) {
                    val z = a.optJSONObject(i) ?: continue
                    if (!z.has("minBpm") || z.isNull("maxBpm")) continue
                    val lo = z.optInt("minBpm"); val hi = z.optInt("maxBpm")
                    if (lo > hi) continue
                    hr[z.optInt("zone")] = HrBand(lo, hi)
                }
            }
            fun int(k: String) = if (o.has(k) && !o.isNull(k)) o.optInt(k) else null
            return Zones(pace, hr, int("maxHr"), int("restingHr"))
        }
    }
}
