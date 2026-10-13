package dev.stride.hud

import org.json.JSONObject

/**
 * Reads `stride.plannedWorkout.v1` (spec 038, contracts/api.md §3) into a
 * [Workout]. Lenient in the one direction that is safe: a step it cannot make
 * sense of is dropped, and a workout with nothing left to run is null.
 */
object WorkoutJson {

    fun parse(o: JSONObject): Workout? {
        if (!o.optBoolean("runnable", true)) return null
        val arr = o.optJSONArray("steps") ?: return null
        val steps = (0 until arr.length()).mapNotNull { arr.optJSONObject(it)?.let(::step) }
        if (steps.isEmpty()) return null
        return Workout(o.optString("id"), o.optString("name").ifBlank { "Workout" }, steps)
    }

    private fun step(s: JSONObject): Workout.Step? {
        val end = end(s.optJSONObject("end") ?: JSONObject()) ?: return null
        val kind = s.optString("kind").ifBlank { "other" }
        return Workout.Step(
            kind = kind,
            label = s.optString("label").ifBlank { kind.replaceFirstChar { it.uppercase() } },
            end = end,
            target = target(s.optJSONObject("target")),
            incline = if (s.isNull("inclinePct") || !s.has("inclinePct")) null else s.optDouble("inclinePct"),
            note = if (s.isNull("note")) "" else s.optString("note"),
            repeat = s.optJSONObject("repeat")?.let { Workout.Repeat(it.optInt("index"), it.optInt("of")) },
        )
    }

    private fun end(e: JSONObject): Workout.End? {
        val v = e.optDouble("value")
        return when (e.optString("type")) {
            "time" -> if (v > 0) Workout.End.Time(v) else null
            "distance" -> if (v > 0) Workout.End.Distance(v) else null
            else -> Workout.End.Open
        }
    }

    private fun target(t: JSONObject?): Workout.Target {
        if (t == null) return Workout.Target.None
        val zone = if (t.has("zone") && !t.isNull("zone")) t.optInt("zone") else null
        return when (t.optString("type")) {
            "pace" -> if (t.has("minMs") && t.has("maxMs") && t.getDouble("minMs") <= t.getDouble("maxMs"))
                Workout.Target.Pace(SpeedBand.ofMs(t.getDouble("minMs"), t.getDouble("maxMs")), zone)
            else unresolved("pace", zone)
            "hr" -> if (t.has("minBpm") && t.has("maxBpm") && t.getInt("minBpm") <= t.getInt("maxBpm"))
                Workout.Target.HeartRate(HrBand(t.getInt("minBpm"), t.getInt("maxBpm")), zone)
            else unresolved("hr", zone)
            "cadence" -> if (t.has("minSpm") && t.has("maxSpm"))
                Workout.Target.Cadence(t.getInt("minSpm"), t.getInt("maxSpm"))
            else Workout.Target.None
            else -> Workout.Target.None
        }
    }

    private fun unresolved(kind: String, zone: Int?): Workout.Target =
        if (zone != null) Workout.Target.Unresolved(kind, zone) else Workout.Target.None
}
