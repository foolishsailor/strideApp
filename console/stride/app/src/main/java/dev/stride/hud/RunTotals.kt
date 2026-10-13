package dev.stride.hud

/**
 * A run's totals, made robust to the board's own counters.
 *
 * The Gen 7 board restarts its distance and calorie counters when a paused
 * workout resumes. STRIDE used to take "counter now minus counter at the
 * start", so on 13 Oct 2026 a 13.7-mile run read 6.98: after each resume the
 * counter started again from zero, and the run's total fell back with it.
 *
 * So nothing here subtracts from a starting value. Live totals add up each
 * step the counter takes and ignore a step backwards (a reset); the totals
 * sent to TrailMate are built from the speed recorded every second, which no
 * board counter can disturb. Pure, so it is tested on the JVM.
 */
object RunTotals {

    /** The most a counter may honestly move between two polls at 5 Hz:
     *  20 km/h is 1.1 m a poll. More is a glitch, not running. */
    const val MAX_ODOMETER_STEP_M = 50.0
    const val MAX_CALORIE_STEP = 50.0

    /** Longest gap between two recorded seconds that still counts as running.
     *  A pause is a gap in `t`; nothing is credited across it. */
    const val MAX_SAMPLE_GAP_S = 3L

    /**
     * How far a board counter moved since [last]: never negative. A counter
     * that went backwards was reset, and a reset is not running backwards.
     */
    fun counterStep(now: Double, last: Double, max: Double): Double {
        val step = now - last
        return if (step < 0.0 || step > max) 0.0 else step
    }

    /**
     * Distance at each recorded second, in metres, from the speed recorded at
     * it ([speedMs], m/s): each sample's speed over the second before it.
     * Gaps longer than [MAX_SAMPLE_GAP_S] (pauses) credit nothing.
     */
    fun distanceFromSpeeds(t: LongArray, speedMs: DoubleArray): DoubleArray {
        val out = DoubleArray(t.size)
        for (i in 1 until t.size) {
            val dt = t[i] - t[i - 1]
            val step = if (dt in 1..MAX_SAMPLE_GAP_S) speedMs[i].coerceAtLeast(0.0) * dt else 0.0
            out[i] = out[i - 1] + step
        }
        return out
    }

    /** The total of a counter that restarts from zero now and then: every
     *  step it took upwards, added up. */
    fun resettingCounterTotal(values: List<Long>): Long {
        var total = 0L
        for (i in 1 until values.size) {
            val step = values[i] - values[i - 1]
            total += if (step < 0) values[i] else step
        }
        return total + (values.firstOrNull() ?: 0L)
    }
}
