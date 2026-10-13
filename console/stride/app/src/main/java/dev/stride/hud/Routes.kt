package dev.stride.hud

import android.content.ContentValues
import android.content.Context
import android.database.sqlite.SQLiteDatabase
import android.util.Log
import org.json.JSONArray
import org.json.JSONObject

/**
 * Each person's routes, from TrailMate: the routes they have starred there and
 * the courses of their upcoming races (spec 038, `stride.routes.v1`).
 *
 * **Stored in [Db] on arrival**, per person, which is the whole reason this
 * class exists rather than a field: the console can boot with no network at
 * all. A route fetched at workout time would not be there, and the failure
 * would arrive at the worst possible moment — standing on the belt, having
 * chosen a run.
 *
 * There is no GPS here and never will be. What arrives is a gradient profile:
 * `[startM, endM, incline]` triples against distance travelled, already worked
 * out by TrailMate from the route's elevation.
 */
class Routes(context: Context) {

    private val db = Db.get(context)

    /** person id → their routes as the UI gets them, read once and kept. */
    private val cache = java.util.concurrent.ConcurrentHashMap<String, String>()

    /**
     * A person's routes, replacing what was there, inside the caller's
     * transaction ([TrailMateSync] writes the sync row in the same one).
     * Entries without usable segments are dropped here rather than offered.
     */
    fun replace(d: SQLiteDatabase, personId: String, routes: JSONArray) {
        d.delete("person_routes", "person_id = ?", arrayOf(personId))
        var pos = 0
        for (i in 0 until routes.length()) {
            val o = routes.optJSONObject(i) ?: continue
            val id = o.optString("id")
            if (id.isEmpty() || parse(o) == null) continue
            d.insertWithOnConflict("person_routes", null, ContentValues().apply {
                put("person_id", personId); put("route_id", id)
                put("pos", pos++); put("json", o.toString())
            }, SQLiteDatabase.CONFLICT_REPLACE)
        }
        cache.remove(personId)
    }

    /** The person's routes as a JSON array, for the UI. "[]" for a guest. */
    fun json(personId: String): String {
        if (personId.isEmpty()) return "[]"
        return cache.getOrPut(personId) {
            val arr = JSONArray()
            db.readableDatabase.rawQuery(
                "SELECT json FROM person_routes WHERE person_id = ? ORDER BY pos",
                arrayOf(personId)
            ).use { c -> while (c.moveToNext()) arr.put(JSONObject(c.getString(0))) }
            arr.toString()
        }
    }

    fun count(personId: String): Int = try { JSONArray(json(personId)).length() } catch (e: Exception) { 0 }

    /**
     * One of the person's routes by id, or null.
     *
     * Kept here rather than in JavaScript because Kotlin has to resolve the
     * chosen route into plan steps anyway, and two parsers for one format is
     * one more than the format deserves.
     */
    fun byId(personId: String, id: String): Route? {
        if (personId.isEmpty()) return null
        return try {
            db.readableDatabase.rawQuery(
                "SELECT json FROM person_routes WHERE person_id = ? AND route_id = ?",
                arrayOf(personId, id)
            ).use { c -> if (c.moveToFirst()) parse(JSONObject(c.getString(0))) else null }
        } catch (e: Exception) {
            Log.w(TAG, "cannot read route $id (${e.message})")
            null
        }
    }

    private fun parse(o: JSONObject): Route? {
        val segs = o.optJSONArray("segments") ?: return null
        val out = ArrayList<Route.Segment>(segs.length())
        for (j in 0 until segs.length()) {
            val t = segs.optJSONArray(j) ?: continue
            if (t.length() < 3) continue
            out.add(Route.Segment(t.getDouble(0), t.getDouble(1), t.getDouble(2)))
        }
        if (out.isEmpty()) return null
        return Route(id = o.optString("id"),
                     name = o.optString("name", "Route"),
                     distanceM = o.optDouble("distance_m", out.last().endM),
                     climbM = o.optDouble("climb_m", 0.0),
                     segments = out)
    }

    companion object { private const val TAG = "StrideRoutes" }
}

/**
 * A route as the deck will run it.
 *
 * Segments are in **metres travelled**, not seconds elapsed, and that is the
 * substantive difference from `Plan.Template`. Replaying a route on a clock
 * while running slower indoors than out means hitting the hill late and never
 * finishing the route; driving it by distance means the ground arrives where it
 * did outdoors however fast you take it.
 */
data class Route(
    val id: String,
    val name: String,
    val distanceM: Double,
    val climbM: Double,
    val segments: List<Segment>,
) {
    data class Segment(val startM: Double, val endM: Double, val incline: Double)

    /**
     * The same route run out and then run home.
     *
     * A recorded run is usually one way — the 30 minutes from the hospital to
     * the front door is a fine run and a poor workout, because it is over when
     * you have done it once. Turning round is what you would do outdoors, and
     * it is a different run from going round twice: the hill you climbed on
     * the way out is the hill you come down on the way back, and the flat bit
     * you enjoyed at the start is the drag at the end.
     *
     * So the return leg is the outbound one **reversed and inverted**, not
     * repeated. At `distanceM + x` you are standing where you were at
     * `distanceM - x`, facing the other way, which is exactly what negating the
     * gradient means.
     *
     * Two honest limitations, both the machine's rather than this function's:
     *
     *  * **The deck stops at −3%.** Come back down anything steeper than that
     *    and the descent is clamped, by the same `coerceIn` every route goes
     *    through. A 9% climb on the way out is a 3% descent on the way home.
     *    The ascents are untouched, because nothing outdoors was steeper going
     *    down than the deck can climb going up.
     *  * **Climb is recomputed, not doubled.** Total ascent over an out-and-back
     *    is the outbound ascent plus the outbound *descent*, which for a route
     *    that does not end where it started is not twice anything. It comes out
     *    as the sum of the absolute rise of every segment.
     *
     * Per run, never stored: the loop button on the picker chooses it for this
     * session and the cached route is untouched.
     */
    fun outAndBack(): Route {
        val total = distanceM
        val back = segments.asReversed().map {
            Segment(startM = total + (total - it.endM),
                    endM = total + (total - it.startM),
                    incline = -it.incline)
        }
        val ascent = segments.sumOf { Math.abs(it.incline) / 100.0 * (it.endM - it.startM) }
        return copy(name = "$name, there and back",
                    distanceM = total * 2,
                    climbM = ascent,
                    segments = segments + back)
    }

    /** The incline at a given distance into the run. */
    fun inclineAt(metres: Double): Double {
        if (segments.isEmpty()) return 0.0
        for (s in segments) if (metres < s.endM) return s.incline
        return segments.last().incline
    }

    /** How far through, 0..1. Used for the progress the HUD already shows. */
    fun progressAt(metres: Double): Double =
        if (distanceM <= 0) 0.0 else (metres / distanceM).coerceIn(0.0, 1.0)
}
