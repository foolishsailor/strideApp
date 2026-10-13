package dev.stride.hud

import android.content.ContentValues
import android.content.Context
import android.database.sqlite.SQLiteDatabase
import org.json.JSONArray
import org.json.JSONObject

/**
 * What TrailMate has sent about each person (spec 038), in [Db]: their planned
 * workouts by date, their zones, and how each kind of fetch last went. Their
 * routes are [Routes]'.
 *
 * Storage only. When to fetch, and from where, is [TrailMateSync]'s business;
 * what a workout means is [WorkoutJson]'s.
 */
class TrailMateStore(context: Context, private val routes: Routes) {

    private val db = Db.get(context)

    /** One kind of fetch for one person: "self", "schedule" or "routes". */
    data class Fetch(val etag: String, val fetchedAt: Long, val state: State, val detail: String)

    /** How a fetch last went. NEVER: not tried yet. SCOPE: the link may not read this. */
    enum class State(val key: String) {
        NEVER("never"), OK("ok"), SCOPE("scope"), ERROR("error");
        companion object { fun of(k: String) = values().firstOrNull { it.key == k } ?: NEVER }
    }

    // --- writing ----------------------------------------------------------------

    /** A person's week replaces what was there, with its zones and the fetch's record, together. */
    fun putSchedule(personId: String, workouts: JSONArray, zones: JSONObject, etag: String, from: String) {
        db.tx { d ->
            d.delete("schedule", "person_id = ?", arrayOf(personId))
            val pos = HashMap<String, Int>()
            for (i in 0 until workouts.length()) {
                val w = workouts.optJSONObject(i) ?: continue
                val date = w.optString("date")
                if (date.isEmpty()) continue
                val n = pos[date] ?: 0
                pos[date] = n + 1
                d.insert("schedule", null, ContentValues().apply {
                    put("person_id", personId); put("date", date); put("pos", n)
                    put("workout_id", w.optString("id")); put("json", w.toString())
                })
            }
            d.insertWithOnConflict("zones", null, ContentValues().apply {
                put("person_id", personId); put("json", zones.toString())
            }, SQLiteDatabase.CONFLICT_REPLACE)
            putFetch(d, personId, "schedule", Fetch(etag, now(), State.OK, from))
        }
    }

    /** A person's routes replace what was there, with the fetch's record, together. */
    fun putRoutes(personId: String, list: JSONArray, etag: String) {
        db.tx { d ->
            routes.replace(d, personId, list)
            putFetch(d, personId, "routes", Fetch(etag, now(), State.OK, ""))
        }
    }

    /** What the link may read, from `GET /devices/self`. */
    fun putScopes(personId: String, scopes: JSONArray) {
        db.tx { putFetch(it, personId, "self", Fetch("", now(), State.OK, scopes.toString())) }
    }

    /** A 304: what is here is current. */
    fun confirm(personId: String, kind: String) {
        db.tx {
            it.execSQL("UPDATE sync SET fetched_at = ?, state = ? WHERE person_id = ? AND kind = ?",
                arrayOf<Any>(now(), State.OK.key, personId, kind))
        }
    }

    /**
     * A fetch that brought nothing new: the last good data stays, with when it
     * came. Its ETag goes, so the next fetch asks for everything.
     */
    fun fail(personId: String, kind: String, state: State, detail: String) {
        val prev = fetch(personId, kind)
        db.tx { putFetch(it, personId, kind, Fetch("", prev?.fetchedAt ?: 0L, state, detail)) }
    }

    private fun putFetch(d: SQLiteDatabase, personId: String, kind: String, f: Fetch) {
        d.insertWithOnConflict("sync", null, ContentValues().apply {
            put("person_id", personId); put("kind", kind); put("etag", f.etag)
            put("fetched_at", f.fetchedAt); put("state", f.state.key); put("detail", f.detail)
        }, SQLiteDatabase.CONFLICT_REPLACE)
    }

    // --- reading ----------------------------------------------------------------

    fun fetch(personId: String, kind: String): Fetch? =
        db.readableDatabase.rawQuery(
            "SELECT etag, fetched_at, state, detail FROM sync WHERE person_id = ? AND kind = ?",
            arrayOf(personId, kind)
        ).use { c ->
            if (c.moveToFirst()) Fetch(c.getString(0), c.getLong(1), State.of(c.getString(2)), c.getString(3)) else null
        }

    fun scopes(personId: String): JSONArray {
        val f = fetch(personId, "self") ?: return JSONArray()
        return if (f.state == State.OK) try { JSONArray(f.detail) } catch (e: Exception) { JSONArray() } else JSONArray()
    }

    fun zonesJson(personId: String): JSONObject =
        db.readableDatabase.rawQuery("SELECT json FROM zones WHERE person_id = ?", arrayOf(personId))
            .use { c -> if (c.moveToFirst()) JSONObject(c.getString(0)) else JSONObject() }

    fun zones(personId: String): Zones = Zones.parse(zonesJson(personId))

    /** The person's workouts in date order, as TrailMate sent them. */
    fun workoutsJson(personId: String): JSONArray {
        val list = JSONArray()
        db.readableDatabase.rawQuery(
            "SELECT json FROM schedule WHERE person_id = ? ORDER BY date, pos", arrayOf(personId)
        ).use { c -> while (c.moveToNext()) list.put(JSONObject(c.getString(0))) }
        return list
    }

    /** One planned workout, ready to run, or null if there is none or nothing in it to run. */
    fun workout(personId: String, id: String): Workout? =
        db.readableDatabase.rawQuery(
            "SELECT json FROM schedule WHERE person_id = ? AND workout_id = ? LIMIT 1",
            arrayOf(personId, id)
        ).use { c -> if (c.moveToFirst()) WorkoutJson.parse(JSONObject(c.getString(0))) else null }

    private fun now() = System.currentTimeMillis()
}
