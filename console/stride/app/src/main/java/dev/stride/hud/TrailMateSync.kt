package dev.stride.hud

import android.content.Context
import android.net.ConnectivityManager
import android.net.Network
import android.util.Log
import org.json.JSONArray
import org.json.JSONObject
import java.time.LocalDate
import kotlin.concurrent.thread

/**
 * Pulls what TrailMate has for each linked person (spec 038) into
 * [TrailMateStore]: their planned workouts for the next week, their zones,
 * and their starred routes and race courses.
 *
 * **When.** At start-up, when the network comes back, when somebody is picked
 * on the home screen, after a link, and every half hour otherwise. Never while
 * the belt is moving: a sync mid-run is work nobody can look at.
 *
 * **What it asks first.** `GET /devices/self` says what the person's link may
 * read. A link made before spec 038 may only upload and gets
 * `403 insufficient_scope` for anything else; that is recorded as
 * [TrailMateStore.State.SCOPE], so the screen can say "Reconnect TrailMate to
 * see your workouts" rather than treating the person as broken.
 *
 * **What it sends.** The `ETag` of what it already has, so an unchanged week is
 * a `304` with no body. The schedule is asked for by the console's own local
 * dates; TrailMate stores no time zone, and a workout's date is a calendar
 * date, so nothing is converted either side.
 *
 * The HTTP itself is [TrailMate]'s ([TrailMate.get]): one client, one token
 * store, one place a 401 marks somebody "reconnect needed".
 */
class TrailMateSync(
    context: Context,
    private val cfg: Settings,
    private val tm: TrailMate,
    private val store: TrailMateStore,
    private val moving: () -> Boolean,
) {
    companion object {
        private const val TAG = "StrideSync"
        const val DAYS = 8
        const val EVERY_MS = 30 * 60_000L
        /** A person is not asked again sooner than this unless it is forced. */
        const val MIN_GAP_MS = 60_000L
        /**
         * Routes at most this often, unless forced (refresh, a new link).
         * TrailMate allows a console 12 route reads an hour, and every start
         * and every runner picked is a pass: on 16 Oct 2026 a morning of
         * restarts used the hour up and the starred routes stopped coming.
         */
        const val ROUTES_EVERY_MS = 15 * 60_000L
        /** A page that shows a list asks for it on every visit, but the same
         *  list is not fetched twice in a minute. */
        const val ASKED_GAP_MS = 60_000L
        /** What a page can ask for: each is stored, and fetched, on its own. */
        const val SCHEDULE = "schedule"
        const val ROUTES = "routes"
        /** While the belt moves, look again this often. */
        const val MOVING_RECHECK_MS = 60_000L

        const val SCHEDULE_READ = "schedule:read"
        const val ROUTES_READ = "routes:read"
    }

    private val app = context.applicationContext

    private val lock = Object()
    /** People asked for since the last pass; "" means everyone. */
    private val wanted = LinkedHashSet<String>()
    private val forced = HashSet<String>()
    /** person id → epoch ms of their last pass, to keep a burst of picks cheap. */
    private val lastPass = HashMap<String, Long>()
    /** person id → kind → epoch ms of their last read of it, answered or not. */
    private val lastRead = HashMap<String, HashMap<String, Long>>()
    /** person id → the kinds a page has asked for and is waiting on. */
    private val asked = HashMap<String, MutableSet<String>>()

    /**
     * After a kind a page asked for has been read (or could not be): the
     * page reloads what is stored, and [ok] says whether that came from
     * TrailMate just now or is the console's last copy.
     */
    var onRead: ((personId: String, kind: String, ok: Boolean) -> Unit)? = null

    /** A page showing [kind] is open: fetch it for [personId] now. */
    fun requestNow(personId: String, kind: String) = synchronized(lock) {
        asked.getOrPut(personId) { HashSet() } += kind
        request(personId, force = true)
    }

    private fun answered(personId: String, kinds: Set<String>, ok: (String) -> Boolean) {
        for (k in kinds) onRead?.invoke(personId, k, ok(k))
    }

    private fun stored(personId: String, kind: String) =
        store.fetch(personId, kind)?.state == TrailMateStore.State.OK

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
        thread(name = "trailmate-sync", isDaemon = true) { while (true) loop() }
    }

    private fun loop() {
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
            return
        }
        val people = if ("" in batch) cfg.people() else batch.mapNotNull { cfg.personById(it) }
        for (p in people) {
            val kinds: Set<String> = synchronized(lock) { asked.remove(p.id) } ?: emptySet()
            if (!tm.linked(p.id)) { answered(p.id, kinds) { false }; continue }
            val now = System.currentTimeMillis()
            if (p.id !in force && "" !in force && now - (lastPass[p.id] ?: 0L) < MIN_GAP_MS) continue
            lastPass[p.id] = now
            try {
                pass(p.id, forced = p.id in force || "" in force, asked = kinds)
            } catch (e: Exception) {
                Log.w(TAG, "${p.id}: sync failed (${tm.why(e)})")
                store.fail(p.id, "self", TrailMateStore.State.ERROR, tm.why(e))
                answered(p.id, kinds) { false }    // no network: the last copy stands
            }
        }
    }

    private fun pass(personId: String, forced: Boolean, asked: Set<String> = emptySet()) {
        val self = tm.get(personId, "/devices/self")
        if (self == null || self.code != 200) {
            if (self != null) store.fail(personId, "self", TrailMateStore.State.ERROR, "TrailMate answered ${self.code}")
            answered(personId, asked) { false }
            return
        }
        val scopes = self.json()?.optJSONArray("scopes") ?: JSONArray()
        store.putScopes(personId, scopes)
        val granted = (0 until scopes.length()).map { scopes.optString(it) }.toSet()

        // The schedule on every pass, as ever; routes no oftener than
        // ROUTES_EVERY_MS. Either one a page asked for: now, unless it was
        // read in the last minute.
        read(personId, SCHEDULE, SCHEDULE_READ in granted, SCHEDULE_READ, asked, everyMs = 0L, forced) { schedule(it) }
        read(personId, ROUTES, ROUTES_READ in granted, ROUTES_READ, asked, ROUTES_EVERY_MS, forced) { routes(it) }
    }

    private fun read(
        personId: String, kind: String, granted: Boolean, scope: String,
        asked: Set<String>, everyMs: Long, forced: Boolean, fetch: (String) -> Unit,
    ) {
        if (!granted) {
            store.fail(personId, kind, TrailMateStore.State.SCOPE, scope)
        } else {
            val reads = lastRead.getOrPut(personId) { HashMap() }
            val since = System.currentTimeMillis() - (reads[kind] ?: 0L)
            val due = if (kind in asked) since >= ASKED_GAP_MS else forced || since >= everyMs
            if (due) {
                reads[kind] = System.currentTimeMillis()
                fetch(personId)
            }
        }
        // A page is waiting on it: say how it stands, fetched or not.
        if (kind in asked) answered(personId, setOf(kind)) { stored(personId, it) }
    }

    private fun schedule(personId: String) {
        val from = LocalDate.now().toString()
        val prev = store.fetch(personId, "schedule")
        // The ETag is for one range; a new day is a new question.
        val etag = if (prev?.detail == from) prev.etag else ""
        val r = tm.get(personId, "/devices/schedule?from=$from&days=$DAYS", etag) ?: return
        answer(personId, "schedule", r.code, SCHEDULE_READ) {
            val o = r.json() ?: throw IllegalStateException("unreadable answer")
            val workouts = o.optJSONArray("workouts") ?: JSONArray()
            store.putSchedule(personId, workouts, o.optJSONObject("zones") ?: JSONObject(), r.etag, from)
            Log.i(TAG, "$personId: ${workouts.length()} workout(s) from $from")
        }
    }

    private fun routes(personId: String) {
        val etag = store.fetch(personId, "routes")?.etag ?: ""
        val r = tm.get(personId, "/devices/routes", etag) ?: return
        answer(personId, "routes", r.code, ROUTES_READ) {
            val list = r.json()?.optJSONArray("routes") ?: throw IllegalStateException("unreadable answer")
            store.putRoutes(personId, list, r.etag)
            Log.i(TAG, "$personId: ${list.length()} route(s)")
        }
    }

    /** The answers every read shares; [ok] stores a 200. */
    private fun answer(personId: String, kind: String, code: Int, scope: String, ok: () -> Unit) {
        when (code) {
            200 -> try { ok() } catch (e: Exception) {
                store.fail(personId, kind, TrailMateStore.State.ERROR, e.message ?: "unreadable answer")
            }
            304 -> store.confirm(personId, kind)
            403 -> store.fail(personId, kind, TrailMateStore.State.SCOPE, scope)
            401 -> {}   // TrailMate.get has marked them reconnect needed
            else -> store.fail(personId, kind, TrailMateStore.State.ERROR, "TrailMate answered $code")
        }
    }
}
