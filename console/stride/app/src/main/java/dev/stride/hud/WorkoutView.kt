package dev.stride.hud

import org.json.JSONObject

/**
 * What the run screen is told about a workout under way (spec 038): the step,
 * its target, what is left of it, what comes next, and how heart-rate control
 * is doing. Built from a [WorkoutRunner] each frame; formatting (units, pace
 * per km or mile) is the screen's.
 */
data class WorkoutView(
    val plannedId: String,
    val name: String,
    /** 1-based. */
    val step: Int,
    val steps: Int,
    val label: String,
    val kind: String,
    val note: String,
    val repeat: Workout.Repeat?,
    val target: Workout.Target,
    val incline: Double?,
    /** Seconds or metres left, or null for an open step (ended by NEXT). */
    val left: Double?,
    val leftIsDistance: Boolean,
    val nextLabel: String,
    val nextTarget: Workout.Target?,
    val speedAuto: Boolean,
    val inclineAuto: Boolean,
    val hrState: HrControl.State?,
    /** The zone the heart rate is in now, when the runner's zones are known. */
    val hrZoneNow: Int?,
) {
    fun toJson(): String = JSONObject()
        .put("plannedId", plannedId)
        .put("name", name)
        .put("step", step)
        .put("steps", steps)
        .put("label", label)
        .put("kind", kind)
        .put("note", note)
        .put("repeat", repeat?.let { JSONObject().put("index", it.index).put("of", it.of) } ?: JSONObject.NULL)
        .put("target", target(target))
        .put("incline", incline ?: JSONObject.NULL)
        .put("left", left ?: JSONObject.NULL)
        .put("leftIsDistance", leftIsDistance)
        .put("open", left == null)
        .put("nextLabel", nextLabel)
        .put("nextTarget", nextTarget?.let(::target) ?: JSONObject.NULL)
        .put("speedAuto", speedAuto)
        .put("inclineAuto", inclineAuto)
        .put("hrState", hrState?.name?.lowercase() ?: JSONObject.NULL)
        .put("hrZoneNow", hrZoneNow ?: JSONObject.NULL)
        .toString()

    companion object {
        fun of(r: WorkoutRunner, p: WorkoutRunner.Progress, zones: Zones): WorkoutView? {
            val s = r.step ?: return null
            val left = r.left(p)
            return WorkoutView(
                plannedId = r.workout.plannedId,
                name = r.workout.name,
                step = r.index + 1,
                steps = r.workout.steps.size,
                label = s.label, kind = s.kind, note = s.note, repeat = s.repeat,
                target = s.target, incline = s.incline,
                left = left?.first, leftIsDistance = left?.second ?: false,
                nextLabel = r.next?.label ?: "", nextTarget = r.next?.target,
                speedAuto = r.speedAuto, inclineAuto = r.inclineAuto,
                hrState = r.hr?.state,
                hrZoneNow = if (p.bpm > 0) zones.hrZoneOf(p.bpm.toDouble()) else null,
            )
        }

        /** A target as the screen reads it, km/h and bpm. */
        private fun target(t: Workout.Target): JSONObject = when (t) {
            Workout.Target.None -> JSONObject().put("type", "none")
            is Workout.Target.Pace -> JSONObject().put("type", "pace")
                .put("minKph", t.band.minKph).put("maxKph", t.band.maxKph).put("zone", t.zone ?: JSONObject.NULL)
            is Workout.Target.HeartRate -> JSONObject().put("type", "hr")
                .put("minBpm", t.band.minBpm).put("maxBpm", t.band.maxBpm).put("zone", t.zone ?: JSONObject.NULL)
            is Workout.Target.Cadence -> JSONObject().put("type", "cadence")
                .put("minSpm", t.minSpm).put("maxSpm", t.maxSpm)
            is Workout.Target.Unresolved -> JSONObject().put("type", "zone")
                .put("of", t.kind).put("zone", t.zone)
        }
    }
}
