package dev.stride.hud

/**
 * A runner's heart, for the simulator and for tuning [HrControl] (spec 038
 * plan, Phase 0.2). Not physiology to rely on: enough of its shape that a
 * controller which works against it is not obviously wrong.
 *
 * - It heads for `restingBpm + perKph × km/h + perGradePct × incline`.
 * - It feels a change of effort [delayS] late, then follows it with a time
 *   constant of [tauS] — the lag that makes chasing heart rate hard.
 * - It drifts up [driftBpmPerMin] while the effort goes on (cardiac drift).
 *
 * Stepped by the caller, with whatever interval it runs at.
 */
class SimHeart(
    private val restingBpm: Double = 30.0,
    private val perKph: Double = 10.0,
    private val perGradePct: Double = 1.6,
    private val tauS: Double = 45.0,
    private val delayS: Double = 15.0,
    private val driftBpmPerMin: Double = 0.6,
    startBpm: Double = 95.0,
) {
    var bpm: Double = startBpm
        private set

    private val felt = ArrayDeque<Pair<Double, Double>>()   // (seconds, effort)
    private var clockS = 0.0
    private var movingS = 0.0

    fun step(kph: Double, gradePct: Double, dtS: Double) {
        clockS += dtS
        if (kph > 0) movingS += dtS else movingS = 0.0
        felt.addLast(clockS to (perKph * kph + perGradePct * gradePct.coerceAtLeast(0.0)))
        while (felt.size > 1 && felt[1].first <= clockS - delayS) felt.removeFirst()
        // The oldest effort still within the delay window, or the first one known.
        val effort = felt.first().second
        val goal = if (kph > 0) restingBpm + effort + driftBpmPerMin * movingS / 60 else restingBpm + 40
        bpm += (goal - bpm) * (dtS / tauS).coerceAtMost(1.0)
    }
}
