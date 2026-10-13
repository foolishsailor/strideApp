package dev.stride.hud

/**
 * A planned run as the run screen draws it: an ordered list of steps against
 * the plan's own clock — metres for a route, (estimated) seconds for a
 * workout. Running them is [WorkoutRunner]'s job for a workout and
 * MainActivity.routeTick's for a route; this is only the shape.
 *
 * The four hand-written incline templates that used to live here went with
 * spec 038: workouts and routes now come from TrailMate.
 */
object Plan {

    /** One step of the drawn profile. `startSec`/`endSec` are metres on a route. */
    data class Step(
        val startSec: Double,
        val endSec: Double,
        val incline: Double,
        val label: String,
    ) {
        val seconds: Double get() = endSec - startSec
    }
}
