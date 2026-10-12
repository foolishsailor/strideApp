package dev.stride.hud

import org.json.JSONArray
import org.json.JSONObject

/**
 * What this belt really does, measured against a foot pod, and the speed to
 * ask the board for so that it does what the screen says.
 *
 * **Why the board cannot be taken at its word.** The board turns the roller at
 * whatever it believes a speed to be, and nothing on this machine measures the
 * belt itself (see beltSpeed() in MainActivity). Roller wear, belt tension and,
 * above all, a runner landing on the deck all move the real speed away from
 * the requested one. Landing loads slow the belt at each footfall, more at
 * some paces than at others, so the error is not one percentage across the
 * range. That is why this is a table of points rather than a single factor.
 *
 * **What a point is.** "To really get [kph], send [belt]." Points are taken
 * with a pod on the shoe: hold a pace, nudge what is sent until the pod agrees
 * with the screen, and save. Everything else on the console (the dial, plans,
 * FTMS) keeps working in true speed. Only the number written to the
 * board is translated, in exactly one place.
 *
 * **Between and beyond the points.**
 *  - None: the board is believed. `toBelt(k) == k`.
 *  - One: one ratio for every speed.
 *  - Two or more: straight lines between neighbours. Past either end, the
 *    nearest segment's line carries on, with its ratio held within the range
 *    the points themselves measured. Two points close together can then never
 *    extrapolate into a correction nobody measured.
 *
 * Points must rise together: a faster true speed always needs a faster
 * command. [with] refuses a point that would break that, so [fromBelt] can
 * always invert [toBelt].
 */
class BeltCalibration(raw: List<Point>) {

    /** To really get [kph], send [belt]. Both km/h. */
    data class Point(val kph: Double, val belt: Double) {
        val ratio: Double get() = belt / kph
        fun json(): JSONObject = JSONObject()
            .put("kph", round2(kph)).put("belt", round2(belt))
    }

    companion object {
        /** Further off than this is a fault to fix, not a calibration. */
        const val MIN_RATIO = 0.80
        const val MAX_RATIO = 1.25

        /** Points closer than this are the same point; the newer one wins. */
        const val SAME_KPH = 0.15

        /** The board takes speed in hundredths. */
        private fun round2(v: Double) = Math.round(v * 100.0) / 100.0

        fun parse(json: String?): BeltCalibration {
            if (json.isNullOrBlank()) return BeltCalibration(emptyList())
            return try {
                val arr = JSONArray(json)
                BeltCalibration((0 until arr.length()).map {
                    val o = arr.getJSONObject(it)
                    Point(o.getDouble("kph"), o.getDouble("belt"))
                })
            } catch (e: Exception) {
                BeltCalibration(emptyList())
            }
        }
    }

    /** Sorted by true speed, sensible ratios only. */
    val points: List<Point> = raw
        .filter { it.kph > 0.0 && it.belt > 0.0 && it.ratio in MIN_RATIO..MAX_RATIO }
        .sortedBy { it.kph }

    val isEmpty: Boolean get() = points.isEmpty()

    private val minRatio = points.minOfOrNull { it.ratio } ?: 1.0
    private val maxRatio = points.maxOfOrNull { it.ratio } ?: 1.0

    /** The speed to send the board for a true [kph]. Zero stays zero. */
    fun toBelt(kph: Double): Double {
        if (kph <= 0.0) return 0.0
        val p = points
        if (p.isEmpty()) return kph
        if (p.size == 1) return kph * p[0].ratio

        val i = p.indexOfFirst { it.kph >= kph }
        return when {
            // Inside the measured range: between the two either side.
            i > 0 -> line(p[i - 1], p[i], kph)
            // Exactly the first point, or below it.
            i == 0 && p[0].kph == kph -> p[0].belt
            i == 0 -> extend(p[0], p[1], kph)
            // Above the last.
            else -> extend(p[p.size - 2], p[p.size - 1], kph)
        }
    }

    /** The true speed a board command [belt] gives. Zero stays zero. */
    fun fromBelt(belt: Double): Double {
        if (belt <= 0.0) return 0.0
        if (points.isEmpty()) return belt
        // toBelt rises with kph and is continuous, so halving converges.
        var lo = belt / MAX_RATIO / 1.01
        var hi = belt / MIN_RATIO * 1.01
        repeat(60) {
            val mid = (lo + hi) / 2
            if (toBelt(mid) < belt) lo = mid else hi = mid
        }
        return (lo + hi) / 2
    }

    /** True speed over commanded at [kph]: how far the belt is off there. */
    fun ratio(kph: Double): Double = if (kph > 0.0) toBelt(kph) / kph else 1.0

    private fun line(a: Point, b: Point, kph: Double): Double =
        a.belt + (b.belt - a.belt) * (kph - a.kph) / (b.kph - a.kph)

    /** [line] past the end of the measured range, its ratio held to what was measured. */
    private fun extend(a: Point, b: Point, kph: Double): Double =
        kph * (line(a, b, kph) / kph).coerceIn(minRatio, maxRatio)

    /**
     * This table with [p] added, replacing any point at nearly the same speed,
     * or a reason it cannot be.
     */
    fun with(p: Point): Result<BeltCalibration> {
        if (p.kph <= 0.0 || p.belt <= 0.0) return Result.failure(IllegalArgumentException("no speed"))
        if (p.ratio !in MIN_RATIO..MAX_RATIO) {
            return Result.failure(IllegalArgumentException(
                "That is ${"%.0f".format(Math.abs(p.ratio - 1) * 100)}% off, which is more than " +
                "calibration should cover. Check the pod is on the shoe and connected."))
        }
        val next = points.filter { Math.abs(it.kph - p.kph) >= SAME_KPH } + p
        val sorted = next.sortedBy { it.kph }
        for (j in 1 until sorted.size) {
            if (sorted[j].belt <= sorted[j - 1].belt) {
                return Result.failure(IllegalArgumentException(
                    "This would make ${"%.1f".format(sorted[j].kph)} km/h need a slower belt " +
                    "than ${"%.1f".format(sorted[j - 1].kph)} km/h. Re-check one of them."))
            }
        }
        return Result.success(BeltCalibration(sorted))
    }

    /** This table without the point nearest [kph]. */
    fun without(kph: Double): BeltCalibration {
        val drop = points.minByOrNull { Math.abs(it.kph - kph) } ?: return this
        return BeltCalibration(points - drop)
    }

    fun json(): JSONArray = JSONArray().apply { points.forEach { put(it.json()) } }
}
