package dev.stride.hud

import android.content.Context
import android.os.SystemClock
import android.util.Log
import org.json.JSONArray
import org.json.JSONObject
import java.io.File
import java.io.FileOutputStream
import java.text.SimpleDateFormat
import java.util.Date
import java.util.Locale
import java.util.TimeZone
import java.util.UUID
import kotlin.concurrent.thread

/**
 * A second-by-second recording of one run, kept so it can go to TrailMate
 * (and from there to Garmin Connect) as a real activity.
 *
 * **Why a trace, when History deliberately is not one.** History keeps a
 * dozen figures per run because all it has to do is say what a run beat. An
 * activity in TrailMate has charts — pace, incline, heart rate, cadence and
 * power against time — and an elevation profile built from the incline, and
 * none of that can be rebuilt from a summary. So this keeps the trace, for
 * exactly as long as it takes to hand it over, in the `stride.workout.v1`
 * shape the TrailMate contract defines (spec 037, `contracts/api.md`).
 *
 * **Written as it goes.** The console is switched off at the wall and has been
 * seen to freeze mid-run, so a recording held in memory until the end would
 * be lost in exactly the cases that end runs early. Each second is appended
 * to `current.rec` and flushed, one JSON value per line. A power cut costs the
 * line being written, which [finalise] skips; at the next start-up [recover]
 * finds the file and turns it into a workout like any other.
 *
 * **One sample a second from a five-a-second loop.** The poll loop calls
 * [tick] every frame and a sample is kept the first time each whole second
 * comes round, on the monotonic clock. `t` counts from the start of the run
 * *including* pauses, which is what the contract asks for: a pause is a gap in
 * `t` plus an entry in `pauses`, the way a watch records one, and moving time
 * is worked out from the two rather than counted separately.
 *
 * **Guests are not recorded**, and neither is anybody running under a name
 * Settings does not know — MainActivity only calls [begin] with a profile id.
 * Whether a recording then leaves the console is TrailMate's business, not
 * this class's: see [TrailMate.enqueue].
 */
class RunRecorder(
    context: Context,
    /** Handed each finished workout, on a background thread. */
    private val onFinished: (personId: String, workout: JSONObject) -> Unit,
) {

    companion object {
        private const val TAG = "StrideRecorder"

        /** The contract's minimum run. Shorter is a press of START by mistake. */
        const val MIN_SECONDS = 60L
        const val MIN_DISTANCE_M = 100.0

        /** And its maximum: six hours at one a second. Beyond it TrailMate says 413. */
        const val MAX_SAMPLES = 21_600

        /**
         * How often the wall clock is written beside the monotonic one.
         *
         * This board boots in 2010 and is corrected by NTP some minutes later —
         * see MainActivity.sessionStartWall. Rather than trusting the time the
         * run began at, the recording keeps writing down "the wall clock says
         * W, and the run is U milliseconds old", and the start is the last
         * such pair that was sane, minus its age. A run that starts before
         * NTP and ends after it dates itself, and so does one recovered from a
         * crash, which has no monotonic clock left to compare against.
         */
        const val ANCHOR_EVERY_MS = 30_000L
    }

    /** What a guided run looked like, written into the recording at the start. */
    data class PlanInfo(
        val name: String,
        val steps: List<Plan.Step>,
        /** A route's steps are metres, not seconds — see MainActivity.routeTick. */
        val isRoute: Boolean,
        /** An open circuit: the steps come round again until STOP. */
        val loops: Boolean,
        /** TrailMate's id for the planned workout this run is, or "" (spec 038). */
        val plannedWorkoutId: String = "",
        /**
         * The steps are only a forecast: the real ones are written as they
         * start, with [mark], and the upload's laps come from those. A
         * workout's steps end on distance or on NEXT as well as on time.
         */
        val marked: Boolean = false,
    )

    private val dir = File(context.filesDir, "trailmate/rec").apply { mkdirs() }
    private val current = File(dir, "current.rec")

    /**
     * The last workout finalised, whoever it was for and whether or not it was
     * sent. Kept for inspection — `tools/sim.py workout` reads it — and
     * overwritten by the next one.
     */
    val lastFile = File(context.filesDir, "trailmate/last.json")

    private var out: FileOutputStream? = null
    private var startUptime = 0L
    private var lastT = -1L
    private var lastDistance = 0.0
    /** The `t` a pause began at, or -1 when the belt is not paused. */
    private var pausedAt = -1L
    private var lastAnchorAt = 0L

    val recording: Boolean @Synchronized get() = out != null

    /** The workout id of the run being recorded, or "" between runs. */
    @Volatile var currentId = ""
        private set

    /**
     * Start recording a run for [personId].
     *
     * A recording still open at this point is a run nobody finished — the
     * screen went home without passing the summary — and it is finished now
     * rather than overwritten.
     */
    @Synchronized
    fun begin(personId: String, plan: PlanInfo?, board: String) {
        if (out != null) finish()
        startUptime = SystemClock.elapsedRealtime()
        lastT = -1L
        lastDistance = 0.0
        pausedAt = -1L
        currentId = UUID.randomUUID().toString()
        val head = JSONObject()
            .put("h", 1)
            .put("id", currentId)
            .put("person", personId)
            .put("board", board)
            .put("version", BuildConfig.VERSION_NAME)
            .put("plan", plan?.let { p ->
                JSONObject().put("name", p.name).put("route", p.isRoute).put("loops", p.loops)
                    .put("planned", p.plannedWorkoutId).put("marked", p.marked)
                    .put("steps", JSONArray().apply {
                        p.steps.forEach {
                            put(JSONArray().put(it.startSec).put(it.endSec)
                                .put(it.label).put(it.incline))
                        }
                    })
            } ?: JSONObject.NULL)
        try {
            out = FileOutputStream(current, false)
            write(head.toString())
            anchor(startUptime)
            Log.i(TAG, "recording a run for $personId")
        } catch (e: Exception) {
            Log.w(TAG, "cannot record this run (${e.message})")
            out = null
        }
    }

    /**
     * One frame from the poll loop. Keeps a sample the first time each second
     * comes round while the belt is live, notes pauses, and dates the run now
     * and then.
     *
     * @param strap  true when the pulse in [s] came from a chest strap rather
     *               than the board's grips — the contract asks which.
     */
    @Synchronized
    fun tick(s: Snapshot, strap: Boolean) {
        if (out == null) return
        val now = SystemClock.elapsedRealtime()
        val t = (now - startUptime) / 1000
        if (now - lastAnchorAt >= ANCHOR_EVERY_MS) anchor(now)

        if (s.session == Session.PAUSED) {
            if (pausedAt < 0) pausedAt = t
            return
        }
        if (!Session.isMoving(s.session)) return
        if (pausedAt >= 0) {
            // Written when it ends, not when it starts: a pause the run ends
            // in is not a pause, it is the end, and the contract wants pauses
            // inside the run.
            if (t > pausedAt) write("{\"p\":[$pausedAt,$t]}")
            pausedAt = -1L
        }
        if (t <= lastT) return
        lastT = t

        // The odometer is whole metres and resets with the board's own
        // counter now and then; the contract wants distance that never falls.
        val d = maxOf(lastDistance, s.distance)
        lastDistance = d
        val line = JSONArray()
            .put(t)
            .put(round(d, 1))
            .put(round(s.speed / 3.6, 2))
            .put(round(s.incline.coerceIn(-10.0, 45.0), 1))
            .put(if (s.pulse > 0) s.pulse else JSONObject.NULL)
            .put(if (s.cadence > 0) s.cadence else JSONObject.NULL)
            .put(if (s.power > 0) s.power else JSONObject.NULL)
            .put(if (s.strideM > 0.0) round(s.strideM, 2) else JSONObject.NULL)
            .put(Math.round(s.calories))
            .put(if (s.pulse > 0 && strap) 1 else 0)
        write(line.toString())
    }

    /** A step of a marked plan has begun, now (see [PlanInfo.marked]). */
    @Synchronized
    fun mark(label: String, incline: Double) {
        if (out == null) return
        val t = (SystemClock.elapsedRealtime() - startUptime) / 1000
        write(JSONObject().put("m", t).put("l", label).put("i", incline).toString())
    }

    /**
     * The run is over: close the file and turn it into a workout, off this
     * thread. Safe to call when nothing is recording.
     */
    @Synchronized
    fun finish() {
        if (out == null) return
        anchor(SystemClock.elapsedRealtime())
        close()
        currentId = ""
        val done = File(dir, "run-${System.currentTimeMillis()}.rec")
        if (!current.renameTo(done)) {
            Log.w(TAG, "could not set the recording aside — leaving it for recovery")
            return
        }
        thread(name = "run-finalise") { finalise(done) }
    }

    /**
     * At start-up: anything still here is a run the console did not live to
     * finish, or one it finished and did not live to send on. Both become
     * workouts now.
     */
    @Synchronized
    fun recover() {
        if (out != null) return
        if (current.exists()) {
            val moved = File(dir, "run-${System.currentTimeMillis()}-recovered.rec")
            if (current.renameTo(moved)) Log.i(TAG, "recovering a run that was cut off")
        }
        val pending = dir.listFiles { f -> f.name.endsWith(".rec") }?.sortedBy { it.name }
            ?: return
        if (pending.isEmpty()) return
        thread(name = "run-recover") { pending.forEach { finalise(it) } }
    }

    private fun anchor(now: Long) {
        lastAnchorAt = now
        write("{\"w\":${System.currentTimeMillis()},\"u\":${now - startUptime}}")
    }

    private fun write(line: String) {
        val o = out ?: return
        try {
            o.write((line + "\n").toByteArray(Charsets.UTF_8))
            o.flush()
        } catch (e: Exception) {
            // A full disk or a dying card. The run goes on; the recording
            // simply stops here rather than taking the poll loop with it.
            Log.w(TAG, "recording stopped (${e.message})")
            close()
        }
    }

    private fun close() {
        try { out?.close() } catch (_: Exception) {}
        out = null
    }

    // --- the workout ----------------------------------------------------------

    private class Sample(
        val t: Long, val d: Double, val v: Double, val inc: Double,
        val hr: Int?, val cad: Int?, val pw: Int?, val st: Double?,
        val kcal: Long, val strap: Boolean,
    )

    /**
     * Read one recording back and build `stride.workout.v1` from it, to the
     * letter of the contract's rules — TrailMate answers a broken one with 400
     * and the run is parked, so they are kept here rather than hoped for.
     * `tools/workout_check.py` checks the same rules from the other side.
     */
    private fun finalise(file: File) {
        try {
            val built = build(file)
            if (built != null) {
                val (person, workout) = built
                writeLast(workout)
                onFinished(person, workout)
            }
            file.delete()
        } catch (e: Exception) {
            Log.w(TAG, "could not finalise ${file.name} (${e.message}) — kept as .bad")
            file.renameTo(File(file.path + ".bad"))
        }
    }

    private fun build(file: File): Pair<String, JSONObject>? {
        var head: JSONObject? = null
        val samples = ArrayList<Sample>()
        val pauses = ArrayList<LongArray>()
        val marks = ArrayList<JSONObject>()
        var anchorWall = 0L
        var anchorAge = 0L
        file.forEachLine { raw ->
            val line = raw.trim()
            if (line.isEmpty()) return@forEachLine
            try {
                if (line.startsWith("[")) {
                    val a = JSONArray(line)
                    samples.add(Sample(
                        t = a.getLong(0), d = a.getDouble(1), v = a.getDouble(2),
                        inc = a.getDouble(3),
                        hr = if (a.isNull(4)) null else a.getInt(4),
                        cad = if (a.isNull(5)) null else a.getInt(5),
                        pw = if (a.isNull(6)) null else a.getInt(6),
                        st = if (a.isNull(7)) null else a.getDouble(7),
                        kcal = a.optLong(8, 0L),
                        strap = a.optInt(9, 0) == 1,
                    ))
                } else {
                    val o = JSONObject(line)
                    when {
                        o.has("h") -> head = o
                        o.has("m") -> marks.add(o)
                        o.has("p") -> o.getJSONArray("p").let {
                            pauses.add(longArrayOf(it.getLong(0), it.getLong(1)))
                        }
                        o.has("w") -> {
                            val w = o.getLong("w")
                            if (w >= MainActivity.SANE_EPOCH_MS) {
                                anchorWall = w; anchorAge = o.getLong("u")
                            }
                        }
                    }
                }
            } catch (e: Exception) {
                // The half-line a power cut leaves behind. Everything before
                // it is good; it is the only thing lost.
                Log.i(TAG, "${file.name}: skipped an unreadable line")
            }
        }
        val h = head ?: run { Log.w(TAG, "${file.name}: no header, dropped"); return null }
        val person = h.optString("person")
        if (person.isEmpty()) return null

        val elapsed = samples.lastOrNull()?.t ?: 0L
        val distance = samples.lastOrNull()?.d ?: 0.0
        if (elapsed < MIN_SECONDS || distance < MIN_DISTANCE_M || samples.size < MIN_SECONDS) {
            Log.i(TAG, "run too short to send (${elapsed} s, ${"%.0f".format(distance)} m)")
            return null
        }
        if (anchorWall == 0L) {
            // Never once a believable date. Sent anyway it would land in
            // TrailMate in 2010; kept, it can at least be looked at.
            Log.w(TAG, "run has no believable date — not sent")
            file.renameTo(File(file.path + ".undated"))
            return null
        }
        val startMs = anchorWall - anchorAge
        // Floored to the second, the resolution of `t`.
        val startedAt = startMs / 1000 * 1000

        // Pauses inside the run only, in order, never overlapping.
        val cleanPauses = ArrayList<LongArray>()
        for (p in pauses.sortedBy { it[0] }) {
            val s = maxOf(p[0], cleanPauses.lastOrNull()?.get(1) ?: 0L)
            val e = minOf(p[1], elapsed)
            if (e > s) cleanPauses.add(longArrayOf(s, e))
        }
        val paused = cleanPauses.sumOf { it[1] - it[0] }

        val t = JSONArray(); val dist = JSONArray(); val speed = JSONArray(); val incline = JSONArray()
        val hr = JSONArray(); val cad = JSONArray(); val pw = JSONArray(); val st = JSONArray()
        var climb = 0.0
        var prev: Sample? = null
        for (s in samples) {
            t.put(s.t); dist.put(s.d); speed.put(s.v); incline.put(s.inc)
            hr.put(s.hr ?: JSONObject.NULL); cad.put(s.cad ?: JSONObject.NULL)
            pw.put(s.pw ?: JSONObject.NULL); st.put(s.st ?: JSONObject.NULL)
            // The contract's climb, to the letter: rise over the ground covered
            // since the last sample, at this sample's incline, never negative.
            prev?.let { climb += maxOf(0.0, (s.d - it.d) * s.inc / 100.0) }
            prev = s
        }
        val beats = samples.mapNotNull { it.hr }
        val anyPod = samples.any { it.cad != null || it.pw != null || it.st != null }

        val sampleObj = JSONObject()
            .put("t", t).put("distanceM", dist).put("speedMs", speed).put("inclinePct", incline)
        // An absent array means "no such sensor"; an array of nulls would claim
        // one that never said anything.
        if (beats.isNotEmpty()) sampleObj.put("hr", hr)
        if (samples.any { it.cad != null }) sampleObj.put("cadenceSpm", cad)
        if (samples.any { it.pw != null }) sampleObj.put("powerW", pw)
        if (samples.any { it.st != null }) sampleObj.put("strideM", st)

        val totals = JSONObject()
            .put("elapsedS", elapsed)
            .put("movingS", elapsed - paused)
            .put("distanceM", round(distance, 1))
            .put("climbM", round(climb, 1))
            .put("calories", samples.last().kcal)
        if (beats.isNotEmpty()) {
            totals.put("avgHr", Math.round(beats.average()).toInt())
            totals.put("maxHr", beats.maxOrNull() ?: 0)
        }

        val iso = SimpleDateFormat("yyyy-MM-dd'T'HH:mm:ss'Z'", Locale.US)
            .apply { timeZone = TimeZone.getTimeZone("UTC") }
        val hrSource = when {
            beats.isEmpty() -> "none"
            samples.count { it.hr != null && it.strap } * 2 >= beats.size -> "strap"
            else -> "grips"
        }

        val workout = JSONObject()
            .put("schema", "stride.workout.v1")
            .put("workoutId", h.getString("id"))
            .put("app", JSONObject()
                .put("name", "STRIDE")
                .put("version", h.optString("version", BuildConfig.VERSION_NAME))
                .put("board", h.optString("board")))
            .put("startedAt", iso.format(Date(startedAt)))
            .put("utcOffsetMin", TimeZone.getDefault().getOffset(startedAt) / 60_000)
            .put("totals", totals)
            .put("plan", planJson(h.optJSONObject("plan"), samples, cleanPauses, elapsed, marks))
            .put("samples", sampleObj)
            .put("pauses", JSONArray().apply {
                cleanPauses.forEach { put(JSONObject().put("startS", it[0]).put("endS", it[1])) }
            })
            .put("sources", JSONObject().put("hr", hrSource).put("footpod", anyPod))
        h.optJSONObject("plan")?.optString("planned")?.takeIf { it.isNotEmpty() }
            ?.let { workout.put("plannedWorkoutId", it) }

        if (samples.size > MAX_SAMPLES) {
            Log.w(TAG, "run has ${samples.size} samples, over TrailMate's limit — it will be refused")
        }
        Log.i(TAG, "workout ${h.getString("id")}: ${elapsed} s, " +
                "${"%.0f".format(distance)} m, ${"%.1f".format(climb)} m climb, " +
                "${samples.size} samples, ${cleanPauses.size} pause(s)")
        return person to workout
    }

    /**
     * The plan's segments on the recording's clock.
     *
     * A template's steps are in *moving* seconds — the plan stands still while
     * the belt does — so each is pushed later by the pauses before it. A
     * route's steps are metres, so each starts at the first second the belt
     * had covered that much ground. A circuit comes round again for as long as
     * the run lasted. Anything the run never reached is left out, and what
     * it reached only part of is cut at the end of the run.
     */
    private fun planJson(
        p: JSONObject?, samples: List<Sample>, pauses: List<LongArray>, elapsed: Long,
        marks: List<JSONObject>,
    ): Any {
        if (p == null) return JSONObject.NULL
        if (p.optBoolean("marked")) return markedPlan(p.optString("name"), marks, elapsed)
        val steps = p.optJSONArray("steps") ?: return JSONObject.NULL
        val isRoute = p.optBoolean("route")
        val loops = p.optBoolean("loops")

        fun movingToT(m: Double): Double {
            var shift = 0L
            for (q in pauses) if (m + shift >= q[0]) shift += q[1] - q[0] else break
            return m + shift
        }
        fun metresToT(m: Double): Double =
            (samples.firstOrNull { it.d >= m }?.t ?: (elapsed + 1)).toDouble()

        val lap = if (steps.length() > 0) steps.getJSONArray(steps.length() - 1).getDouble(1) else 0.0
        val out = JSONArray()
        var lapNo = 0
        var lastEnd = 0L
        while (lapNo < 1000) {
            var reached = false
            for (i in 0 until steps.length()) {
                val s = steps.getJSONArray(i)
                val offset = if (loops) lapNo * lap else 0.0
                val a = s.getDouble(0) + offset
                val b = s.getDouble(1) + offset
                val startS = Math.round(if (isRoute) metresToT(a) else movingToT(a))
                    .coerceIn(lastEnd, elapsed)
                val endS = Math.round(if (isRoute) metresToT(b) else movingToT(b))
                    .coerceIn(startS, elapsed)
                if (endS <= startS) continue
                reached = true
                lastEnd = endS
                out.put(JSONObject()
                    .put("startS", startS).put("endS", endS)
                    .put("label", s.optString(2))
                    .put("incline", s.optDouble(3, 0.0)))
            }
            if (!loops || !reached || lap <= 0.0 || lastEnd >= elapsed) break
            lapNo++
        }
        return JSONObject().put("name", p.optString("name")).put("segments", out)
    }

    /** A marked plan's segments: each mark to the next, the last to the end of the run. */
    private fun markedPlan(name: String, marks: List<JSONObject>, elapsed: Long): JSONObject {
        val out = JSONArray()
        for ((i, m) in marks.withIndex()) {
            val start = m.optLong("m").coerceIn(0L, elapsed)
            val end = (marks.getOrNull(i + 1)?.optLong("m") ?: elapsed).coerceIn(start, elapsed)
            if (end <= start) continue
            out.put(JSONObject().put("startS", start).put("endS", end)
                .put("label", m.optString("l")).put("incline", m.optDouble("i", 0.0)))
        }
        return JSONObject().put("name", name).put("segments", out)
    }

    private fun writeLast(workout: JSONObject) {
        // Release builds keep no copy: once TrailMate has the run, only its
        // summary stays on the console.
        if (!BuildConfig.DEBUG) return
        try {
            lastFile.parentFile?.mkdirs()
            lastFile.writeText(workout.toString())
        } catch (e: Exception) {
            Log.w(TAG, "could not keep a copy of the last workout (${e.message})")
        }
    }

    private fun round(v: Double, dp: Int): Double {
        val f = Math.pow(10.0, dp.toDouble())
        return Math.round(v * f) / f
    }
}
