package dev.stride.hud

/**
 * Steers the belt speed to hold a heart rate in [target] (spec 038, US5).
 *
 * Heart rate answers a change of speed slowly, over half a minute or more, so
 * this is a rate-limited proportional controller with a dead band: it waits for
 * the heart rate to settle, then changes the speed in proportion to how far
 * outside the range the heart rate is, by less than the whole gap (the heart
 * has not caught up yet), at most every [Tuning.everyMs]. It judges by where
 * the heart rate is heading, [Tuning.lookaheadS] on along its recent trend,
 * so a heart still climbing from a standing start is not pushed harder for
 * being below the range on its way into it. And it drops at once
 * when the heart rate is well over the range or past the runner's maximum.
 * That is the usual shape of treadmill heart-rate control. The numbers in
 * [Tuning] are tuned against a lagged-heart-rate model (HrControlTest) and are
 * to be checked on the belt.
 *
 * Pure: no clock, no board, no Android. It is given the time, the heart rate
 * and the speed, and answers with the speed it wants and why, so it can be
 * tested and tuned off the device. [WorkoutRunner] owns one per heart-rate step.
 *
 * @param start   where to begin, km/h: the slow end of the pace band this zone
 *                usually means for the runner (approaching from below is the
 *                safe side, and settles faster), or the current speed
 * @param bounds  the speeds it may choose between: the runner's [SpeedLimits].
 *                Not the pace band: a runner whose heart runs hotter than
 *                their zones say (heat, tiredness) has to be allowed slower.
 * @param ease    the speed to drop to at once when the heart rate is far too high
 */
class HrControl(
    private val target: HrBand,
    start: Double,
    private val bounds: SpeedBand,
    private val ease: Double,
    private val maxHr: Int?,
    private val startedAtMs: Long,
    private val tuning: Tuning = Tuning(),
) {
    data class Tuning(
        /** No change before this, from the start of the step: heart rate lags. */
        val settleMs: Long = 45_000,
        /** At most one change this often. */
        val everyMs: Long = 20_000,
        /**
         * km/h per bpm outside the range. A runner's heart rate moves roughly
         * 8–12 bpm per km/h, so 0.05 closes about half the gap each time,
         * leaving room for the part still on its way.
         */
        val gainKphPerBpm: Double = 0.05,
        /** The most one change may be, km/h. */
        val maxStepKph: Double = 0.6,
        /** Drop to [ease] at once when this many bpm over, or past the maximum. */
        val dropOverBpm: Int = 15,
        /** Where a drop goes when there is no pace band: this far below the start. */
        val dropKph: Double = 1.0,
        /** The trend is a straight line through this much of the recent heart rate. */
        val trendMs: Long = 20_000,
        /** And is followed this far ahead to judge where the heart rate is going. */
        val lookaheadS: Double = 30.0,
    )

    enum class State { SETTLING, HOLDING, RAISING, EASING, DROPPING, NO_HR }

    data class Decision(val speedKph: Double, val state: State)

    var speedKph: Double = bounds.let { start.coerceIn(it.minKph, it.maxKph) }
        private set
    var state: State = State.SETTLING
        private set
    private var lastChangeMs = startedAtMs
    /** Recent readings, (ms, bpm), for the trend. */
    private val recent = ArrayDeque<Pair<Long, Int>>()

    /**
     * One look at the heart rate. [bpm] is 0 when the strap has nothing fresh
     * (it reports nothing older than ten seconds).
     */
    fun update(nowMs: Long, bpm: Int): Decision {
        if (bpm <= 0) {
            state = State.NO_HR
            recent.clear()
            return Decision(speedKph, state)
        }
        recent.addLast(nowMs to bpm)
        while (nowMs - recent.first().first > tuning.trendMs) recent.removeFirst()
        val over = bpm - target.maxBpm
        // Far too high, or past the runner's maximum: at once, whatever the timers say.
        if (over > tuning.dropOverBpm || (maxHr != null && bpm > maxHr)) {
            if (speedKph > ease) {
                speedKph = ease.coerceIn(bounds.minKph, bounds.maxKph)
                lastChangeMs = nowMs
            }
            state = State.DROPPING
            return Decision(speedKph, state)
        }
        if (nowMs - startedAtMs < tuning.settleMs) {
            state = State.SETTLING
            return Decision(speedKph, state)
        }
        val heading = bpm + trendBpmPerS() * tuning.lookaheadS
        val outside = when {
            heading > target.maxBpm -> target.maxBpm - heading
            heading < target.minBpm -> target.minBpm - heading
            else -> 0.0
        }
        val change = (outside * tuning.gainKphPerBpm).coerceIn(-tuning.maxStepKph, tuning.maxStepKph)
        if (change == 0.0) {
            state = State.HOLDING
        } else if (nowMs - lastChangeMs >= tuning.everyMs) {
            speedKph = (speedKph + change).coerceIn(bounds.minKph, bounds.maxKph)
            lastChangeMs = nowMs
            state = if (change > 0) State.RAISING else State.EASING
        } else {
            state = if (change > 0) State.RAISING else State.EASING
        }
        return Decision(speedKph, state)
    }

    /** bpm per second over the recent readings, by least squares; 0 until there are enough. */
    private fun trendBpmPerS(): Double {
        if (recent.size < 3 || recent.last().first - recent.first().first < tuning.trendMs / 2) return 0.0
        val t0 = recent.first().first
        val xs = recent.map { (it.first - t0) / 1000.0 }
        val ys = recent.map { it.second.toDouble() }
        val mx = xs.average(); val my = ys.average()
        var num = 0.0; var den = 0.0
        for (i in xs.indices) { num += (xs[i] - mx) * (ys[i] - my); den += (xs[i] - mx) * (xs[i] - mx) }
        return if (den > 0) num / den else 0.0
    }

    companion object {
        /**
         * The controller for a heart-rate step: started and bounded by the pace
         * band that zone means for this runner when their profile has one,
         * otherwise from [currentKph] within the runner's limits.
         */
        fun forStep(target: HrBand, zone: Int?, zones: Zones, limits: SpeedLimits,
                    currentKph: Double, nowMs: Long, tuning: Tuning = Tuning()): HrControl {
            val z = zone ?: zones.hrZoneOf((target.minBpm + target.maxBpm) / 2.0)
            val pace = z?.let(zones::paceForHrZone)?.let(limits::clamp)
            val start = pace?.minKph ?: limits.clamp(currentKph)
            val ease = pace?.minKph ?: limits.clamp(start - tuning.dropKph)
            return HrControl(target, start, SpeedBand(limits.minKph, limits.maxKph), ease,
                zones.maxHr, nowMs, tuning)
        }
    }
}
