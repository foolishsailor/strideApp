package dev.stride.hud

/**
 * A workout as the deck runs it: a planned workout from TrailMate (see
 * [WorkoutJson]), or Manual → Heart rate (see [heartRate]).
 *
 * The model only. Running it is [WorkoutRunner]'s job, steering by heart rate
 * [HrControl]'s, and clamping speeds to the board and the runner's limit
 * happens there too, at run time, so the model holds what the plan asked for.
 */
data class Workout(
    /** TrailMate's workout id, sent back with the run so it is marked done; "" for one made here. */
    val plannedId: String,
    val name: String,
    val steps: List<Step>,
) {
    init { require(steps.isNotEmpty()) { "a workout needs a step" } }

    data class Step(
        val kind: String,
        val label: String,
        val end: End,
        val target: Target,
        /** Incline to set, %, or null to leave the deck where it is. */
        val incline: Double?,
        val note: String,
        val repeat: Repeat?,
    )

    /** How a step ends. */
    sealed class End {
        /** After this many seconds of moving time (pauses excluded). */
        data class Time(val seconds: Double) : End()
        /** After this much belt distance. */
        data class Distance(val metres: Double) : End()
        /** When the runner taps NEXT (Garmin's lap button), or STOP. */
        object Open : End()
    }

    /** What a step asks of the runner, and so what the console drives. */
    sealed class Target {
        object None : Target()
        /** Hold this speed range: the belt goes to its middle. */
        data class Pace(val band: SpeedBand, val zone: Int?) : Target()
        /** Hold this heart rate: the belt is steered to keep it there (see [HrControl]). */
        data class HeartRate(val band: HrBand, val zone: Int?) : Target()
        /** Shown, not driven. */
        data class Cadence(val minSpm: Int, val maxSpm: Int) : Target()
        /** A zone the runner's profile has no band for: shown as "Zone N", not driven. */
        data class Unresolved(val kind: String, val zone: Int) : Target()
    }

    /** "3 of 4" for a step inside a repeat. */
    data class Repeat(val index: Int, val of: Int)

    companion object {
        /** Manual → Heart rate: hold [band] until STOP, as one open step. */
        fun heartRate(band: HrBand, zone: Int?): Workout {
            val name = if (zone != null) "Heart rate zone $zone" else "Heart rate ${band.minBpm}–${band.maxBpm}"
            return Workout("", name, listOf(
                Step("interval", name, End.Open, Target.HeartRate(band, zone), null, "", null)))
        }
    }
}
