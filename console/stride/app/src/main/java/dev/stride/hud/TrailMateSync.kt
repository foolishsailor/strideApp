package dev.stride.hud

import android.content.ContentValues
import android.content.Context
import android.database.sqlite.SQLiteDatabase
import android.net.ConnectivityManager
import android.net.Network
import android.util.Log
import org.json.JSONArray
import org.json.JSONObject
import java.time.LocalDate
import kotlin.concurrent.thread

/**
 * What TrailMate tells the console about each linked person (spec 038): their
 * planned workouts for the next week, their zones, and their starred routes
 * and race courses. Pulled, never pushed, and stored in [Db] so all of it is
 * there with the network down.
 *
 * **When.** At start-up, when the network comes back, when somebody is picked
 * on the home screen, after a link, and every half hour otherwise. Never while
 * the belt is moving: a sync mid-run would be work nobody can look at, on a
 * thread the run shares a radio with.
 *
 * **What it asks first.** `GET /devices/self` says what the person's link may
 * read. A link made before spec 038 may only upload, and gets
 * `403 insufficient_scope` for anything else; that is recorded as "scope" so
 * the screen can say "Reconnect TrailMate to see your workouts" rather than
 * treating the person as broken.
 *
 * **What it sends.** The `ETag` of what it already has, so an unchanged week is
 * a `304` with no body. The schedule is asked for by the console's own local
 * dates (`from` = today); TrailMate stores no time zone for anyone, and a
 * workout's date is a calendar date, so nothing is converted either side.
 */
class TrailMateSync(
    context: Context,
    private val cfg: Settings,
    private val tm: TrailMate,
    private val routes: Routes,
    private val moving: () -> Boolean,
) {
    companion object {
        private const val TAG = "StrideSync"
        const val DAYS = 8
        const val EVERY_MS = 30 * 60_000L
        /** A person is not asked again sooner than this unless it is forced. */
        const val MIN_GAP_MS = 60_000L
        /** While the belt moves, look again this often. */
        const val MOVING_RECHECK_MS = 60_000L

        const val SCHEDULE_READ = "schedule:read"
        const val ROUTES_READ = "routes:read"
    }

    private val app = context.applicationContext
    private val db = Db.get(app)

    private val lock = Object()
    /** People asked for since the last pass; "" means everyone. */
    private val wanted = LinkedHashSet<String>()
    private val forced = HashSet<String>()

    /** person id → epoch ms of their last pass, to keep a burst of picks cheap. */
    private val lastPass = HashMap<String, Long>()

    // --- asking ---------------------------------------------------------------

    /** Sync [personId] soon; everyone when empty. [force] skips the minimum gap. */
    fun request(personId: String = "", force: Boolean = false) = synchronized(lock) {
        wanted += personId
        if (force) forced += personId
        lock.notifyAll()
    }

    fun start() {
        try {
            val cm = app.getSystemService(Context.CONNECTIVITY_SERVICE) as ConnectivityManager
            cm.registerDefaultNetworkCallback(object : ConnectivityManager.NetworkCallback() {
                override fun onAvailable(network: Network) { request() }
            })
        } catch (e: Exception) {
            Log.w(TAG, "no network callback (${e.message}) — timer only")
        }
        request()
        thread(name = "trailmate-sync", isDaemon = true) {
            while (true) {
                val batch: Set<String>
                val force: Set<String>
                synchronized(lock) {
                    if (wanted.isEmpty()) lock.wait(EVERY_MS)
                    if (wanted.isEmpty()) wanted += ""      // the half-hourly pass
                    batch = LinkedHashSet(wanted)
                    force = HashSet(forced)
                    wanted.clear(); forced.clear()
                }
                if (moving()) {
                    // Put them back and look again later; nothing is lost.
                    synchronized(lock) { wanted += batch; forced += force }
                    Thread.sleep(MOVING_RECHECK_MS)
                    continue
                }
                val people = if ("" in batch) cfg.people() else batch.mapNotNull { cfg.personById(it) }
                for (p in people) {
                    if (!tm.linked(p.id)) continue
                    val now = System.currentTimeMillis()
                    val f = p.id in force || "" in force
                    if (!f && now - (lastPass[p.id] ?: 0L) < MIN_GAP_MS) continue
                    lastPass[p.id] = now
                    try { pass(p.id) } catch (e: Exception) {
                        Log.w(TAG, "${p.id}: sync failed (${tm.why(e)})")
                        mark(p.id, "self", "error", tm.why(e))
                    }
                }
            }
        }
    }

    // --- one person -----------------------------------------------------------

    private fun pass(personId: String) {
        val self = tm.get(personId, "/devices/self") ?: return
        if (self.code != 200) {
            mark(personId, "self", "error", "TrailMate answered ${self.code}")
            return
        }
        val scopes = self.json()?.optJSONArray("scopes") ?: JSONArray()
        val granted = (0 until scopes.length()).map { scopes.optString(it) }.toSet()
        mark(personId, "self", "ok", scopes.toString())

        if (SCHEDULE_READ in granted) schedule(personId) else mark(personId, "schedule", "scope", SCHEDULE_READ)
        if (ROUTES_READ in granted) routes(personId) else mark(personId, "routes", "scope", ROUTES_READ)
    }

    private fun schedule(personId: String) {
        val from = LocalDate.now().toString()
        val prev = row(personId, "schedule")
        // The ETag is for one range; a new day is a new question.
        val etag = if (prev?.detail == from) prev.etag else ""
        val r = tm.get(personId, "/devices/schedule?from=$from&days=$DAYS", etag) ?: return
        when (r.code) {
            200 -> {
                val o = r.json() ?: return mark(personId, "schedule", "error", "unreadable answer")
                val workouts = o.optJSONArray("workouts") ?: JSONArray()
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
                        put("person_id", personId)
                        put("json", (o.optJSONObject("zones") ?: JSONObject()).toString())
                    }, SQLiteDatabase.CONFLICT_REPLACE)
                    put(d, personId, "schedule", r.etag, "ok", from)
                }
                Log.i(TAG, "$personId: ${workouts.length()} workout(s) from $from")
            }
            304 -> touch(personId, "schedule")
            403 -> mark(personId, "schedule", "scope", SCHEDULE_READ)
            401 -> {}   // TrailMate.get has marked them reconnect needed
            else -> mark(personId, "schedule", "error", "TrailMate answered ${r.code}")
        }
    }

    private fun routes(personId: String) {
        val r = tm.get(personId, "/devices/routes", row(personId, "routes")?.etag ?: "") ?: return
        when (r.code) {
            200 -> {
                val list = r.json()?.optJSONArray("routes")
                    ?: return mark(personId, "routes", "error", "unreadable answer")
                db.tx { d ->
                    routes.replace(d, personId, list)
                    put(d, personId, "routes", r.etag, "ok", "")
                }
                Log.i(TAG, "$personId: ${list.length()} route(s)")
            }
            304 -> touch(personId, "routes")
            403 -> mark(personId, "routes", "scope", ROUTES_READ)
            401 -> {}
            else -> mark(personId, "routes", "error", "TrailMate answered ${r.code}")
        }
    }

    // --- the sync table -------------------------------------------------------

    private class Row(val etag: String, val fetchedAt: Long, val state: String, val detail: String)

    private fun row(personId: String, kind: String): Row? =
        db.readableDatabase.rawQuery(
            "SELECT etag, fetched_at, state, detail FROM sync WHERE person_id = ? AND kind = ?",
            arrayOf(personId, kind)
        ).use { c -> if (c.moveToFirst()) Row(c.getString(0), c.getLong(1), c.getString(2), c.getString(3)) else null }

    private fun put(d: SQLiteDatabase, personId: String, kind: String, etag: String,
                    state: String, detail: String) {
        d.insertWithOnConflict("sync", null, ContentValues().apply {
            put("person_id", personId); put("kind", kind); put("etag", etag)
            put("fetched_at", System.currentTimeMillis()); put("state", state); put("detail", detail)
        }, SQLiteDatabase.CONFLICT_REPLACE)
    }

    /** A 304: what is here is current. */
    private fun touch(personId: String, kind: String) {
        db.tx { it.execSQL("UPDATE sync SET fetched_at = ?, state = 'ok' WHERE person_id = ? AND kind = ?",
            arrayOf<Any>(System.currentTimeMillis(), personId, kind)) }
    }

    /** A state with nothing new: keeps the last good data, its ETag and when it came. */
    private fun mark(personId: String, kind: String, state: String, detail: String) {
        val prev = row(personId, kind)
        db.tx { d ->
            d.insertWithOnConflict("sync", null, ContentValues().apply {
                put("person_id", personId); put("kind", kind)
                put("etag", if (state == "ok") prev?.etag ?: "" else "")
                put("fetched_at", prev?.fetchedAt ?: 0L); put("state", state); put("detail", detail)
            }, SQLiteDatabase.CONFLICT_REPLACE)
        }
    }

    // --- for the screens --------------------------------------------------------

    /**
     * Everything the console holds for a person, for the home screen, the
     * Workouts picker and My settings → TrailMate profile.
     *
     * `{ state, fetchedAt, scopes, zones, workouts: [...] }`, workouts in date
     * order. `state` is "ok", "scope" (needs a reconnect for this), "reconnect"
     * (the link was refused), "error", "never" or "unlinked".
     */
    fun scheduleJson(personId: String): JSONObject {
        val out = JSONObject()
        val sched = row(personId, "schedule")
        val self = row(personId, "self")
        out.put("state", when {
            !tm.linked(personId) -> "unlinked"
            tm.reconnectNeeded(personId) -> "reconnect"
            sched == null -> "never"
            else -> sched.state
        })
        out.put("fetchedAt", sched?.fetchedAt ?: 0L)
        out.put("from", sched?.detail ?: "")
        out.put("scopes", try { JSONArray(self?.detail ?: "[]") } catch (e: Exception) { JSONArray() })
        val rd = db.readableDatabase
        out.put("zones", rd.rawQuery("SELECT json FROM zones WHERE person_id = ?", arrayOf(personId))
            .use { c -> if (c.moveToFirst()) JSONObject(c.getString(0)) else JSONObject() })
        val list = JSONArray()
        rd.rawQuery("SELECT json FROM schedule WHERE person_id = ? ORDER BY date, pos", arrayOf(personId))
            .use { c -> while (c.moveToNext()) list.put(JSONObject(c.getString(0))) }
        out.put("workouts", list)
        return out
    }

    /** One planned workout by id, or null. */
    fun workout(personId: String, id: String): JSONObject? =
        db.readableDatabase.rawQuery(
            "SELECT json FROM schedule WHERE person_id = ? AND workout_id = ? LIMIT 1",
            arrayOf(personId, id)
        ).use { c -> if (c.moveToFirst()) JSONObject(c.getString(0)) else null }

    /** The person's zones, or an empty object. */
    fun zones(personId: String): JSONObject =
        db.readableDatabase.rawQuery("SELECT json FROM zones WHERE person_id = ?", arrayOf(personId))
            .use { c -> if (c.moveToFirst()) JSONObject(c.getString(0)) else JSONObject() }

    /** For TrailMate.statusJson: scopes, and how each kind of fetch last went. */
    fun info(personId: String): JSONObject {
        val o = JSONObject()
        val self = row(personId, "self")
        o.put("scopes", try { JSONArray(self?.detail ?: "[]") } catch (e: Exception) { JSONArray() })
        for (kind in listOf("schedule", "routes")) {
            val r = row(personId, kind)
            o.put(kind, JSONObject().put("state", r?.state ?: "never")
                .put("fetchedAt", r?.fetchedAt ?: 0L).put("detail", r?.detail ?: ""))
        }
        return o
    }
}
