package dev.stride.hud

/**
 * Runs a [Workout] step by step (spec 038, US2 and US5): decides which step the
 * run is in, when it ends, and what the belt and deck should be doing now.
 *
 * It does not touch the board. Each [tick] answers with a [Command]; the
 * console carries it out through the same ramp and incline stepping everything
 * else uses, so the board's limits, the ramp rate and the safety key keep
 * working as they always have.
 *
 * **The runner outranks the plan.** A hand on the speed hands the speed back to
 * the runner until the next step ([speedTakenOver]); the same for the incline
 * ([inclineTakenOver]). Each new step takes both again.
 *
 * Pure, apart from the clock it is given, so it can be tested off the device.
 *
 * @param fallbackKph  the speed a heart-rate step starts at when the runner's
 *                     profile has no pace band for it and the belt is still
 * @param onStep       told each time a step begins, with its index (for the
 *                     recording, so the upload's laps are the steps as run)
 */
class WorkoutRunner(
    val workout: Workout,
    private val zones: Zones,
    private val limits: SpeedLimits,
    private val fallbackKph: Double,
    private val onStep: (index: Int, step: Workout.Step) -> Unit = { _, _ -> },
    private val hrTuning: HrControl.Tuning = HrControl.Tuning(),
) {
    /** Where the run is, as the console measures it. */
    data class Progress(
        /** Seconds the belt has been running, pauses excluded. */
        val movingS: Double,
        val metres: Double,
        /** From the strap; 0 when there is no fresh reading. */
        val bpm: Int,
        val nowMs: Long,
        val currentKph: Double,
    )

    /** What to drive now. A null leaves that control where it is. */
    data class Command(val speedKph: Double?, val incline: Double?)

    var index = -1
        private set
    var finished = false
        private set
    var speedAuto = true
        private set
    var inclineAuto = true
        private set
    /** The heart-rate controller for the current step, if it has a heart-rate target. */
    var hr: HrControl? = null
        private set

    private var stepStartS = 0.0
    private var stepStartM = 0.0

    val step: Workout.Step? get() = workout.steps.getOrNull(index)
    val next: Workout.Step? get() = workout.steps.getOrNull(index + 1)

    fun tick(p: Progress): Command {
        if (finished) return Command(null, null)
        if (index < 0) enter(0, p)
        while (!finished && ended(p)) {
            if (index + 1 >= workout.steps.size) finished = true else enter(index + 1, p)
        }
        if (finished) return Command(null, null)
        val s = step ?: return Command(null, null)
        return Command(speedFor(s, p), if (inclineAuto) s.incline else null)
    }

    /** NEXT: end the current step now. Ends the workout from its last step. */
    fun next(p: Progress) {
        if (finished || index < 0) return
        if (index + 1 >= workout.steps.size) finished = true else enter(index + 1, p)
    }

    fun speedTakenOver() { speedAuto = false }

    /**
     * The speed menu's AUTO: the step takes the speed back now rather than at
     * the next step. A heart-rate step starts its controller again from the
     * speed the runner chose, not from where it last decided.
     */
    fun speedBackToAuto(p: Progress) {
        if (finished || speedAuto) return
        speedAuto = true
        val s = step ?: return
        hr = (s.target as? Workout.Target.HeartRate)?.let {
            val from = if (p.currentKph > 0) p.currentKph else fallbackKph
            HrControl.forStep(it.band, it.zone, zones, limits, from, p.nowMs, hrTuning)
        }
    }
    fun inclineTakenOver() { inclineAuto = false }

    /** What is left of the current step: seconds or metres, and which; null for an open step. */
    fun left(p: Progress): Pair<Double, Boolean>? = when (val e = step?.end) {
        is Workout.End.Time -> (e.seconds - (p.movingS - stepStartS)).coerceAtLeast(0.0) to false
        is Workout.End.Distance -> (e.metres - (p.metres - stepStartM)).coerceAtLeast(0.0) to true
        else -> null
    }

    /**
     * Where the run is on [profile]'s clock: the current step's start there,
     * plus how far through the step it is. An open step creeps towards its
     * drawn end but never reaches it, since nobody knows when NEXT will come.
     */
    fun profilePosition(p: Progress, profile: List<Plan.Step>): Double {
        val drawn = profile.getOrNull(index) ?: return 0.0
        val through = when (val e = step?.end) {
            is Workout.End.Time -> ((p.movingS - stepStartS) / e.seconds).coerceIn(0.0, 1.0)
            is Workout.End.Distance -> ((p.metres - stepStartM) / e.metres).coerceIn(0.0, 1.0)
            else -> ((p.movingS - stepStartS) / OPEN_ESTIMATE_S).coerceIn(0.0, 0.95)
        }
        return drawn.startSec + drawn.seconds * through
    }

    /**
     * The workout as a profile against time, for drawing it: each step's
     * estimated length, and the incline it holds (carried on from the step
     * before when it sets none).
     */
    fun profile(): List<Plan.Step> {
        var at = 0.0
        var incline = 0.0
        return workout.steps.map { s ->
            val len = estimatedSeconds(s)
            incline = s.incline ?: incline
            Plan.Step(at, at + len, incline, s.label).also { at += len }
        }
    }

    private fun enter(i: Int, p: Progress) {
        index = i
        stepStartS = p.movingS
        stepStartM = p.metres
        speedAuto = true
        inclineAuto = true
        val s = workout.steps[i]
        hr = (s.target as? Workout.Target.HeartRate)?.let {
            val from = if (p.currentKph > 0) p.currentKph else fallbackKph
            HrControl.forStep(it.band, it.zone, zones, limits, from, p.nowMs, hrTuning)
        }
        onStep(i, s)
    }

    private fun ended(p: Progress): Boolean = when (val e = step?.end) {
        is Workout.End.Time -> p.movingS - stepStartS >= e.seconds
        is Workout.End.Distance -> p.metres - stepStartM >= e.metres
        else -> false
    }

    private fun speedFor(s: Workout.Step, p: Progress): Double? {
        val control = hr
        // The controller keeps watching even while the runner has the speed,
        // so the screen can still say how the heart rate is doing.
        val decided = control?.update(p.nowMs, p.bpm)
        if (!speedAuto) return null
        return when (val t = s.target) {
            is Workout.Target.Pace -> limits.clamp(t.band.midKph)
            is Workout.Target.HeartRate -> decided?.speedKph
            else -> null
        }
    }

    private fun estimatedSeconds(s: Workout.Step): Double = when (val e = s.end) {
        is Workout.End.Time -> e.seconds
        is Workout.End.Distance -> {
            val kph = when (val t = s.target) {
                is Workout.Target.Pace -> limits.clamp(t.band.midKph)
                else -> fallbackKph.coerceAtLeast(limits.minKph)
            }
            e.metres / (kph / 3.6)
        }
        Workout.End.Open -> OPEN_ESTIMATE_S
    }

    companion object {
        /** How long an open step is drawn as, before anyone knows. */
        const val OPEN_ESTIMATE_S = 300.0
    }
}
