package dev.stride.hud

import android.content.Context
import android.util.Log
import org.json.JSONArray
import org.json.JSONException
import org.json.JSONObject
import java.io.File

/**
 * Every run this console has recorded, per runner, kept on the console.
 *
 * **Why this is on the treadmill and not in Home Assistant.** The summary screen
 * is the one place a run gets looked at, and it is looked at while standing on
 * the belt, three seconds after stopping. Anything it needs has to be there with
 * no broker, no phone and no network — the same rule the rest of the console
 * follows. Home Assistant still gets every session over MQTT and still keeps the
 * long-term picture; this is the copy that makes "most climb you have done"
 * answerable when the wifi is out.
 *
 * It is also, incidentally, the first workout log the console has ever kept. Up
 * to 17 August 2026 the only thing it persisted was the route cache, so a run
 * that was not published to HA left no trace anywhere once the ring buffer
 * rolled — which is exactly what happened to the first thirty-five minutes of
 * that day's session.
 *
 * **Guests are not recorded.** A run with no profile has nobody to compare it
 * to and nobody who has agreed to be remembered, so it is summarised and then
 * forgotten. See [record].
 */
class History(context: Context) {

    private val file = File(context.filesDir, "history.json")

    /**
     * Newest first, so the reads that matter — "the last few runs" — are the
     * front of the list, and the trim is a single drop from the tail.
     */
    @Volatile
    private var runs: List<Run> = emptyList()

    /**
     * One finished run, reduced to the figures a later run can be measured
     * against.
     *
     * Deliberately not a full trace. A per-second recording of five hundred
     * runs is a database, and the console has a summary screen to draw, not a
     * dataset to serve. What is here is what an achievement can be built from.
     */
    data class Run(
        val who: String,
        val startedAt: Long,
        val elapsed: Double,
        val distance: Double,
        val calories: Double,
        val climbM: Double,
        val avgSpeed: Double,
        val maxSpeed: Double,
        val maxIncline: Double,
        val avgPulse: Int,
        val maxPulse: Int,
        val plan: String,
    ) {
        fun json(): JSONObject = JSONObject()
            .put("who", who)
            .put("startedAt", startedAt)
            .put("elapsed", Math.round(elapsed))
            .put("distance", Math.round(distance))
            .put("calories", Math.round(calories))
            .put("climbM", Math.round(climbM))
            .put("avgSpeed", round1(avgSpeed))
            .put("maxSpeed", round1(maxSpeed))
            .put("maxIncline", round1(maxIncline))
            .put("avgPulse", avgPulse)
            .put("maxPulse", maxPulse)
            .put("plan", plan)

        companion object {
            private fun round1(v: Double) = Math.round(v * 10.0) / 10.0

            fun from(o: JSONObject) = Run(
                who = o.optString("who"),
                startedAt = o.optLong("startedAt"),
                elapsed = o.optDouble("elapsed", 0.0),
                distance = o.optDouble("distance", 0.0),
                calories = o.optDouble("calories", 0.0),
                climbM = o.optDouble("climbM", 0.0),
                avgSpeed = o.optDouble("avgSpeed", 0.0),
                maxSpeed = o.optDouble("maxSpeed", 0.0),
                maxIncline = o.optDouble("maxIncline", 0.0),
                avgPulse = o.optInt("avgPulse", 0),
                maxPulse = o.optInt("maxPulse", 0),
                plan = o.optString("plan"),
            )
        }
    }

    init {
        runs = try {
            if (file.exists()) parse(file.readText()) else emptyList()
        } catch (e: Exception) {
            Log.w(TAG, "history unreadable (${e.message}) — starting empty")
            emptyList()
        }
        Log.i(TAG, "loaded ${runs.size} recorded run(s)")
    }

    private fun parse(text: String): List<Run> {
        val arr = JSONArray(text.trim().ifBlank { "[]" })
        val out = ArrayList<Run>(arr.length())
        for (i in 0 until arr.length()) {
            arr.optJSONObject(i)?.let { out.add(Run.from(it)) }
        }
        return out
    }

    /**
     * Add a finished run and work out what was notable about it.
     *
     * The comparison happens **before** the run is stored, because a run
     * compared against a list that already contains it beats nothing and every
     * session would come back with no achievements at all.
     *
     * Returns the achievement lines, newest run already accounted for.
     */
    @Synchronized
    fun record(run: Run): List<String> {
        if (run.who.isBlank()) {
            Log.i(TAG, "guest run — summarised but not recorded")
            return emptyList()
        }
        if (run.distance < MIN_DISTANCE_M || run.elapsed < MIN_ELAPSED_S) {
            Log.i(TAG, "run too short to record (${"%.0f".format(run.distance)} m)")
            return emptyList()
        }
        val previous = runs.filter { it.who == run.who }
        val earned = achievements(run, previous)

        runs = (listOf(run) + runs).take(KEEP)
        save()
        Log.i(TAG, "recorded run for ${run.who} " +
                "(${previous.size + 1} total), ${earned.size} achievement(s)")
        return earned
    }

    /**
     * What this run did that the ones before it did not.
     *
     * Rules, in order of how much they are worth saying out loud. Capped at
     * [MAX_SHOWN] because a summary listing six records is a summary nobody
     * reads, and because a first big run after a quiet month genuinely does
     * beat everything at once.
     *
     * A runner with fewer than [MIN_FOR_RECORDS] previous runs gets no
     * record-breaking lines. Everything is a personal best when there is one
     * run to compare against, and being told so is worth nothing — so early
     * sessions get the consistency lines instead, which are true from the start.
     */
    private fun achievements(run: Run, previous: List<Run>): List<String> {
        val out = ArrayList<String>()
        val n = previous.size

        if (n >= MIN_FOR_RECORDS) {
            if (run.distance > previous.maxOf { it.distance })
                out.add("Furthest you have gone")
            if (run.climbM > previous.maxOf { it.climbM } && run.climbM >= MIN_CLIMB_M)
                out.add("Most climb in one workout")
            if (run.elapsed > previous.maxOf { it.elapsed })
                out.add("Longest time on the belt")
            if (run.maxIncline > previous.maxOf { it.maxIncline } && run.maxIncline > 0)
                out.add("Steepest you have taken it")
            if (run.avgSpeed > previous.maxOf { it.avgSpeed })
                out.add("Fastest average pace")

            // Worth more than any single record: the same work at a lower heart
            // rate is the one number here that means fitness rather than effort.
            // Guarded hard — it needs a strap on both runs, a comparable pace,
            // and a gap big enough not to be a warm day.
            val comparable = previous.filter {
                it.avgPulse > 0 && Math.abs(it.avgSpeed - run.avgSpeed) < 0.4
            }
            if (run.avgPulse > 0 && comparable.size >= 3) {
                val was = comparable.take(5).map { it.avgPulse }.average()
                if (was - run.avgPulse >= HR_IMPROVEMENT_BPM) {
                    out.add("Same pace, ${Math.round(was - run.avgPulse)} bpm lower")
                }
            }
        }

        // Cadence, which is true from the very first workout and is the thing
        // most worth reinforcing early on.
        //
        // Both lines are arithmetic on dates, so both are skipped when this
        // workout has none — see MainActivity.sessionStartWall. A console that
        // powered up minutes before the belt did cannot say what day it is, and
        // "3 days in a row" computed from a clock reading 2010 is not a smaller
        // version of the truth, it is a different number.
        if (run.startedAt > 0L) {
            val week = runsSince(run.who, run.startedAt - WEEK_MS) + 1
            if (week >= 3) out.add("$week workouts this week")
            val streak = dayStreak(run.who, run.startedAt)
            if (streak >= 3) out.add("$streak days in a row")
        }

        return out.take(MAX_SHOWN)
    }

    private fun runsSince(who: String, since: Long) =
        runs.count { it.who == who && it.startedAt >= since }

    /**
     * Consecutive days ending today, counting the run just finished.
     *
     * Calendar days rather than 24-hour blocks: a run at 7 am and the next at
     * 9 pm the following day is two days in a row to anybody who runs, whatever
     * the thirty-eight hours between them say.
     */
    private fun dayStreak(who: String, endingAt: Long): Int {
        // Undated workouts carry no day, so they cannot extend or break a
        // streak — see MainActivity.sessionStartWall.
        val days = runs.filter { it.who == who && it.startedAt > 0L }
                        .map { dayOf(it.startedAt) }.toHashSet()
        var streak = 1
        var day = dayOf(endingAt)
        while (days.contains(day - 1)) { streak++; day-- }
        return streak
    }

    private fun dayOf(epochMs: Long): Long {
        val cal = java.util.Calendar.getInstance()
        cal.timeInMillis = epochMs
        cal.set(java.util.Calendar.HOUR_OF_DAY, 0)
        cal.set(java.util.Calendar.MINUTE, 0)
        cal.set(java.util.Calendar.SECOND, 0)
        cal.set(java.util.Calendar.MILLISECOND, 0)
        return cal.timeInMillis / 86_400_000L
    }

    /** The most recent runs for one person, newest first. */
    @Synchronized
    fun recent(who: String, limit: Int): List<Run> =
        runs.filter { it.who == who }.take(limit)

    private fun save() {
        val arr = JSONArray()
        for (w in runs) arr.put(w.json())
        try {
            // Written whole and moved into place: a console losing power
            // mid-write is an ordinary event here, and a half-written history
            // would be thrown away wholesale on the next boot.
            val tmp = File(file.parentFile, "history.json.tmp")
            tmp.writeText(arr.toString())
            if (!tmp.renameTo(file)) {
                file.writeText(arr.toString())
                tmp.delete()
            }
        } catch (e: Exception) {
            Log.w(TAG, "could not save history (${e.message})")
        }
    }

    companion object {
        private const val TAG = "StrideHistory"

        /**
         * How many runs to keep.
         *
         * Two years of daily running, and about 120 KB of JSON. The trim exists
         * so the file cannot grow without limit on a console that never gets
         * looked at, not because anything here is expensive.
         */
        const val KEEP = 750

        /** Shorter than this is an interruption, not a session. */
        const val MIN_DISTANCE_M = 300.0
        const val MIN_ELAPSED_S = 180.0

        /** Below this a "most climb" record is measuring a flat run's rounding. */
        const val MIN_CLIMB_M = 10.0

        /** Records need something to be a record against. */
        const val MIN_FOR_RECORDS = 3

        /** A drop this size at the same pace is a real change, not a warm room. */
        const val HR_IMPROVEMENT_BPM = 4.0

        const val MAX_SHOWN = 3
        const val WEEK_MS = 7 * 24 * 60 * 60 * 1000L
    }
}
