package dev.stride.hud

import android.content.ContentValues
import android.content.Context
import android.database.sqlite.SQLiteDatabase
import android.net.ConnectivityManager
import android.net.Network
import android.os.SystemClock
import android.util.Base64
import android.util.Log
import org.json.JSONArray
import org.json.JSONObject
import java.io.File
import java.io.IOException
import java.net.HttpURLConnection
import java.net.URL
import javax.net.ssl.SSLException
import kotlin.concurrent.thread

/**
 * The console's link to TrailMate: who is connected, and the runs waiting to
 * go there.
 *
 * TrailMate is where the runner's other training already lives, and it is
 * already connected to their Garmin account, so a treadmill run that lands
 * there goes on to Garmin Connect without the console ever having to know a
 * Garmin password. The whole contract — endpoints, codes, and the shape of a
 * workout — is spec 037's `contracts/api.md`, and this file is built to it.
 *
 * **Linking is a code on the screen, not a password on the keyboard.** The
 * console asks TrailMate for a short code and a QR, shows both, and waits;
 * the runner scans the QR with their phone, signs in there and taps Allow, and
 * the console's next poll comes back with a token. It is the "device
 * authorisation grant" a smart TV uses (RFC 8628), for the same reason: typing
 * an email address and password on a treadmill's on-screen keyboard is
 * miserable, and a console that held either would be holding something it has
 * no business with.
 *
 * **Tokens are secrets, so they are kept apart and encrypted.** One per
 * person, in [Db]'s `links` table rather than with the settings — so
 * [Settings.json], which is handed to the settings page, cannot carry one even
 * by accident — and encrypted with a key in the Android Keystore (see
 * [Vault]), so a copy of the database is no use anywhere else. Nothing here puts a token in a log line, in [statusJson],
 * in a Snapshot (which goes to the page and FTMS), or anywhere else that leaves
 * this class. The settings page learns whether somebody is linked and the
 * TrailMate first name they linked as, and that is all.
 *
 * **Runs wait on disk until they are taken.** The wifi drops, the site
 * deploys, the console is switched off at the wall mid-upload: none of those
 * may lose a run, so a finished workout is written to a queue directory
 * first and removed only once TrailMate has said it has it. After that only
 * the run's summary is kept (see [History]). The `uploads` table indexes the
 * queue, so showing it never means reading the workouts themselves. Oldest first, one
 * at a time, with a back-off while the network is down. TrailMate recognises a
 * workout it already has by its id, so sending one twice is safe — which is
 * what makes "retry until told otherwise" the right policy.
 *
 * Plain [HttpURLConnection] on background threads, so the link adds no
 * library to the APK.
 */
class TrailMate(context: Context, private val cfg: Settings) {

    companion object {
        private const val TAG = "StrideTrailMate"

        /** Long enough for a slow mobile hotspot, short enough to say so. */
        const val TIMEOUT_MS = 15_000

        /**
         * Back-off between attempts while TrailMate cannot be reached: half a
         * minute, doubling to a quarter of an hour. A treadmill has nothing
         * better to do with its network than this, but hammering a site that is
         * deploying is no way to help it come back.
         */
        const val BACKOFF_FIRST_MS = 30_000L
        const val BACKOFF_MAX_MS = 15 * 60_000L

        /** RFC 8628's own step when told to slow down. */
        const val SLOW_DOWN_S = 5
    }

    private val app = context.applicationContext
    private val db = Db.get(app)
    private val queueDir = File(app.filesDir, "trailmate/queue").apply { mkdirs() }
    private val failedDir = File(app.filesDir, "trailmate/failed").apply { mkdirs() }

    /** How a run's sending went: "queued", "sent" or "failed", by workout id. */
    @Volatile var onState: ((workoutId: String, state: String) -> Unit)? = null

    init {
        Migration.fromTrailMatePrefs(app, db)
        reconcile()
    }

    // --- who is linked --------------------------------------------------------

    private class LinkRow(val sealed: ByteArray, val account: String, val reconnect: Boolean)

    /** person id → link, read from the database and kept in memory. */
    @Volatile private var links: Map<String, LinkRow> = loadLinks()

    /** Decrypted tokens, in memory only, so the Keystore is asked once per person. */
    private val tokens = java.util.concurrent.ConcurrentHashMap<String, String>()

    private fun loadLinks(): Map<String, LinkRow> {
        val m = HashMap<String, LinkRow>()
        db.readableDatabase.rawQuery("SELECT person_id, token, account, reconnect FROM links", null)
            .use { c -> while (c.moveToNext()) m[c.getString(0)] = LinkRow(c.getBlob(1), c.getString(2), c.getInt(3) != 0) }
        return m
    }

    private fun token(personId: String): String? {
        tokens[personId]?.let { return it }
        val row = links[personId] ?: return null
        val t = Vault.open(row.sealed) ?: run {
            Log.w(TAG, "$personId: token could not be decrypted — reconnect needed")
            return null
        }
        tokens[personId] = t
        return t
    }

    fun linked(personId: String): Boolean = links.containsKey(personId)

    /**
     * TrailMate turned this person's token down: revoked from the website, or
     * the account gone. The token is kept — it might be a TrailMate fault that
     * clears — but nothing more is sent with it until they connect again.
     */
    fun reconnectNeeded(personId: String): Boolean = links[personId]?.reconnect == true

    /** The first name TrailMate gave when the link was approved. */
    private fun account(personId: String): String = links[personId]?.account ?: ""

    private fun setReconnect(personId: String) {
        db.tx { it.update("links", ContentValues().apply { put("reconnect", 1) },
            "person_id = ?", arrayOf(personId)) }
        links = loadLinks()
    }

    /**
     * Forget a person's link, and tell TrailMate to revoke it.
     *
     * In that order on purpose. The runner has asked for the console to stop
     * being able to upload as them, and that is true the moment the token is
     * gone from here, whether or not TrailMate hears about it. The `DELETE` is
     * a courtesy so the device drops off their list; a revoked token answers
     * 401, which counts as done too. If the site cannot be reached the token
     * is still forgotten and they can remove the device from TrailMate's side.
     */
    fun disconnect(personId: String) {
        if (link?.personId == personId) cancelLink()
        val t = token(personId)
        db.tx { it.delete("links", "person_id = ?", arrayOf(personId)) }
        tokens.remove(personId)
        links = loadLinks()
        if (t == null) return
        Log.i(TAG, "$personId: disconnected")
        thread(name = "trailmate-revoke") {
            try {
                val r = call("DELETE", "/devices/self", null, t)
                Log.i(TAG, "$personId: revoke answered ${r.code}")
            } catch (e: Exception) {
                Log.i(TAG, "$personId: revoke not sent (${why(e)}) — forgotten here anyway")
            }
        }
    }

    // --- linking --------------------------------------------------------------

    /**
     * One link in progress. Only ever one at a time — there is one screen and
     * one person standing at it — and starting another cancels this one.
     *
     * The device code is the secret half of the pair and stays in here. The
     * page gets the user code and the QR, which are meant to be seen.
     */
    private inner class Link(val personId: String) {
        @Volatile var state = "starting"   // starting | waiting | connected | denied | expired | error
        @Volatile var userCode = ""
        @Volatile var qrSvg = ""
        @Volatile var uri = ""
        @Volatile var expiresAt = 0L
        @Volatile var message = ""
        @Volatile var cancelled = false
    }

    @Volatile private var link: Link? = null

    fun startLink(person: Settings.Person) {
        cancelLink()
        val l = Link(person.id)
        link = l
        thread(name = "trailmate-link") { runLink(l, person) }
    }

    fun cancelLink() {
        link?.cancelled = true
        link = null
    }

    private fun runLink(l: Link, person: Settings.Person) {
        val label = "STRIDE treadmill — ${person.name}".take(60)
        val code: String
        var interval: Int
        try {
            val r = call("POST", "/device-link/start",
                JSONObject().put("client", "stride").put("deviceLabel", label), null)
            if (r.code == 429) return fail(l, "error", "Too many tries. Wait a few minutes and try again.")
            if (r.code != 200) return fail(l, "error", "TrailMate answered ${r.code}.")
            val o = r.json() ?: return fail(l, "error", "TrailMate's answer made no sense.")
            code = o.getString("deviceCode")
            interval = o.optInt("interval", 5).coerceAtLeast(1)
            l.userCode = o.optString("userCode")
            l.qrSvg = o.optString("qrSvg")
            l.uri = o.optString("verificationUri")
            l.expiresAt = SystemClock.elapsedRealtime() + o.optInt("expiresIn", 600) * 1000L
            l.state = "waiting"
            Log.i(TAG, "${person.id}: link started, code ${l.userCode}")
        } catch (e: Exception) {
            return fail(l, "error", "Could not reach TrailMate (${why(e)}).")
        }

        while (!l.cancelled) {
            Thread.sleep(interval * 1000L)
            if (l.cancelled) return
            if (SystemClock.elapsedRealtime() > l.expiresAt) return fail(l, "expired", "")
            val r = try {
                call("POST", "/device-link/token", JSONObject().put("deviceCode", code), null)
            } catch (e: Exception) {
                // A dropped poll is not a failed link. The code is good for
                // ten minutes and the next poll may well get through.
                Log.i(TAG, "${person.id}: link poll failed (${why(e)}), still waiting")
                continue
            }
            if (l.cancelled) return
            if (r.code == 200) {
                val o = r.json()
                val token = o?.optString("deviceToken").orEmpty()
                if (token.isEmpty()) return fail(l, "error", "TrailMate approved, but sent no token.")
                db.tx { d ->
                    d.insertWithOnConflict("links", null, ContentValues().apply {
                        put("person_id", person.id)
                        put("token", Vault.seal(token))
                        put("device", o?.optString("deviceId").orEmpty())
                        put("account", o?.optJSONObject("user")?.optString("firstName").orEmpty())
                        put("reconnect", 0)
                    }, SQLiteDatabase.CONFLICT_REPLACE)
                }
                tokens[person.id] = token
                links = loadLinks()
                l.state = "connected"
                Log.i(TAG, "${person.id}: connected to TrailMate")
                // Anything that was waiting for this person can go now.
                kick()
                return
            }
            when (r.json()?.optString("error")) {
                "authorization_pending" -> {}
                "slow_down" -> interval += SLOW_DOWN_S
                "access_denied" -> return fail(l, "denied", "")
                "expired_token" -> return fail(l, "expired", "")
                else -> if (r.code >= 500 || r.code == 429) {
                    interval += SLOW_DOWN_S
                } else {
                    return fail(l, "error", "TrailMate answered ${r.code}.")
                }
            }
        }
    }

    private fun fail(l: Link, state: String, message: String) {
        l.state = state
        l.message = message
        Log.i(TAG, "${l.personId}: link $state${if (message.isNotEmpty()) " — $message" else ""}")
    }

    // --- the queue ------------------------------------------------------------

    /**
     * What the summary screen says about the run just finished. Empty when
     * there is nothing to say — a guest, a run too short to send, or someone
     * who has not connected TrailMate and has not asked to be told about it.
     */
    @Volatile private var summaryId = ""
    @Volatile private var summary = ""

    fun summaryState(): String = summary

    fun clearSummary() {
        summaryId = ""
        summary = ""
    }

    /**
     * A finished workout, from [RunRecorder]. Kept on disk before anything is
     * attempted, so the attempt can fail in any way it likes.
     *
     * Only for somebody who has connected TrailMate. Everyone else's runs
     * stay on the console, as the spec's edge cases put it — connecting later
     * does not send old runs, because nobody asked for that.
     */
    fun enqueue(personId: String, workout: JSONObject) {
        if (!linked(personId)) {
            Log.i(TAG, "$personId is not connected to TrailMate — run kept on the console")
            return
        }
        val id = workout.optString("workoutId")
        val stamp = "%013d".format(startedMs(workout))
        val file = File(queueDir, "$stamp-$id.json")
        val tmp = File(queueDir, "$stamp-$id.tmp")
        try {
            tmp.writeText(JSONObject().put("personId", personId).put("workout", workout).toString())
            if (!tmp.renameTo(file)) throw IOException("rename failed")
            index(file, personId, workout, "queued", 0, "")
        } catch (e: Exception) {
            Log.w(TAG, "could not queue workout $id (${e.message})")
            return
        }
        onState?.invoke(id, "queued")
        summaryId = id
        summary = if (reconnectNeeded(personId)) "reconnect" else "sending"
        Log.i(TAG, "queued workout $id for $personId")
        kick()
    }

    /** A parked run goes back in the queue, for after whatever was wrong is fixed. */
    fun retry(workoutId: String) {
        val f = failedDir.listFiles()?.firstOrNull { it.name.endsWith("-$workoutId.json") } ?: return
        if (f.renameTo(File(queueDir, f.name))) {
            db.tx { it.update("uploads", ContentValues().apply {
                put("state", "queued"); put("status", 0); put("reason", "")
            }, "workout_id = ?", arrayOf(workoutId)) }
            Log.i(TAG, "workout $workoutId back in the queue")
            onState?.invoke(workoutId, "queued")
            kick()
        }
    }

    // --- the queue's index ----------------------------------------------------

    private class Upload(
        val workoutId: String, val personId: String, val file: String, val startedAt: String,
        val distance: Double, val state: String, val status: Int, val reason: String,
    )

    private fun index(file: File, personId: String, workout: JSONObject, state: String,
                      status: Int, reason: String) {
        db.tx { d ->
            d.insertWithOnConflict("uploads", null, ContentValues().apply {
                put("workout_id", workout.optString("workoutId"))
                put("person_id", personId)
                put("file", file.name)
                put("started_at", workout.optString("startedAt"))
                put("distance", workout.optJSONObject("totals")?.optDouble("distanceM", 0.0) ?: 0.0)
                put("state", state); put("status", status); put("reason", reason)
            }, SQLiteDatabase.CONFLICT_REPLACE)
        }
    }

    private fun uploads(state: String): List<Upload> {
        val out = ArrayList<Upload>()
        db.readableDatabase.rawQuery(
            "SELECT workout_id, person_id, file, started_at, distance, state, status, reason " +
                "FROM uploads WHERE state = ? ORDER BY file", arrayOf(state)
        ).use { c ->
            while (c.moveToNext()) out += Upload(c.getString(0), c.getString(1), c.getString(2),
                c.getString(3), c.getDouble(4), c.getString(5), c.getInt(6), c.getString(7))
        }
        return out
    }

    /**
     * At start-up, make the index match the files: a file with no row (queued
     * by an older console, or before a power cut) is read once and indexed; a
     * row with no file is dropped.
     */
    private fun reconcile() {
        try {
            for ((dir, state) in listOf(queueDir to "queued", failedDir to "failed")) {
                val known = uploads(state).map { it.file }.toSet()
                val files = dir.listFiles { f -> f.name.endsWith(".json") }?.toList() ?: emptyList()
                for (f in files) {
                    if (f.name in known) continue
                    val env = try { JSONObject(f.readText()) } catch (e: Exception) { continue }
                    val w = env.optJSONObject("workout") ?: continue
                    index(f, env.optString("personId"), w, state, env.optInt("status", 0), env.optString("reason"))
                }
                val names = files.map { it.name }.toSet()
                for (gone in known - names) {
                    db.tx { it.delete("uploads", "file = ?", arrayOf(gone)) }
                }
            }
        } catch (e: Exception) {
            Log.w(TAG, "could not reconcile the upload queue (${e.message})")
        }
    }

    private val lock = Object()
    private var kicked = false
    private var backoffMs = 0L
    @Volatile private var nextTryAt = 0L
    @Volatile private var lastError = ""

    /** Try now: a run was queued, someone connected, or the network came back. */
    fun kick() = synchronized(lock) {
        kicked = true
        lock.notifyAll()
    }

    /**
     * Start the sender, and listen for the network coming back so a run
     * queued with the wifi down goes the moment it returns rather than at
     * the end of a back-off.
     */
    fun start() {
        try {
            val cm = app.getSystemService(Context.CONNECTIVITY_SERVICE) as ConnectivityManager
            cm.registerDefaultNetworkCallback(object : ConnectivityManager.NetworkCallback() {
                override fun onAvailable(network: Network) { kick() }
            })
        } catch (e: Exception) {
            Log.w(TAG, "no network callback (${e.message}) — back-off only")
        }
        thread(name = "trailmate-upload", isDaemon = true) {
            while (true) {
                val wait = try { send() } catch (e: Exception) {
                    Log.w(TAG, "upload pass failed (${e.message})"); BACKOFF_FIRST_MS
                }
                synchronized(lock) {
                    if (!kicked) {
                        nextTryAt = if (wait > 0) SystemClock.elapsedRealtime() + wait else 0L
                        lock.wait(wait)
                    }
                    kicked = false
                    nextTryAt = 0L
                }
            }
        }
    }


    /**
     * One pass over the queue, oldest first. Returns how long to wait before
     * the next, or 0 for "until something changes".
     *
     * The answers, per the contract:
     *  - **200, 201** (and 409, which the spec also counts as "already have
     *    it"): sent. Removed from the queue.
     *  - **400, 413**: TrailMate will never take this one. Parked in
     *    `failed/`, shown in Settings, and the runs behind it carry on.
     *  - **401**: this person's token is no good. They are marked
     *    "reconnect needed", their runs stay queued, and everybody else's
     *    still go.
     *  - **429, 5xx, no answer at all**: try again later — and stop this pass,
     *    because whatever is wrong is wrong for every run behind it too.
     */
    private fun send(): Long {
        for (u in uploads("queued")) {
            val person = u.personId
            val token = token(person)
            if (token == null || reconnectNeeded(person)) continue   // waits for them to connect
            val f = File(queueDir, u.file)
            val id = u.workoutId
            if (!f.exists()) { db.tx { it.delete("uploads", "workout_id = ?", arrayOf(id)) }; continue }
            // Read only now, one at a time: the workout is the big part.
            val workout = try { JSONObject(f.readText()).optJSONObject("workout") } catch (e: Exception) { null }
            if (workout == null) {
                Log.w(TAG, "${f.name} unreadable — parked"); park(f, id, 0, "unreadable on the console"); continue
            }
            val r = try {
                call("POST", "/devices/workouts", workout, token)
            } catch (e: Exception) {
                lastError = "Could not reach TrailMate (${why(e)})"
                Log.i(TAG, "upload of $id failed (${why(e)}) — will retry")
                return backoff(id)
            }
            when (r.code) {
                200, 201, 409 -> {
                    // TrailMate has it: the trace goes, the summary in History stays.
                    f.delete()
                    db.tx { it.delete("uploads", "workout_id = ?", arrayOf(id)) }
                    onState?.invoke(id, "sent")
                    backoffMs = 0L
                    lastError = ""
                    if (id == summaryId) summary = "sent"
                    val dup = r.json()?.optBoolean("duplicate") == true || r.code == 409
                    Log.i(TAG, "workout $id sent${if (dup) " (TrailMate already had it)" else ""}")
                }
                400, 413 -> {
                    val why = r.json()?.optString("message").orEmpty().ifEmpty {
                        if (r.code == 413) "too long for TrailMate" else "TrailMate refused it"
                    }
                    park(f, id, r.code, why)
                    if (id == summaryId) summary = "failed"
                }
                401 -> {
                    setReconnect(person)
                    if (id == summaryId) summary = "reconnect"
                    Log.w(TAG, "$person: TrailMate refused the token — reconnect needed")
                }
                else -> {
                    lastError = "TrailMate answered ${r.code}"
                    Log.i(TAG, "upload of $id answered ${r.code} — will retry")
                    return backoff(id)
                }
            }
        }
        // Everything that could go has gone. Whatever is left is waiting for
        // somebody to connect, and connecting kicks the next pass.
        return 0L
    }

    private fun backoff(id: String): Long {
        if (id == summaryId && summary == "sending") summary = "waiting"
        backoffMs = if (backoffMs == 0L) BACKOFF_FIRST_MS
                    else (backoffMs * 2).coerceAtMost(BACKOFF_MAX_MS)
        return backoffMs
    }

    /** Kept, with its detail, so it can be retried once whatever was wrong is fixed. */
    private fun park(f: File, workoutId: String, code: Int, reason: String) {
        try {
            if (!f.renameTo(File(failedDir, f.name))) throw IOException("rename failed")
            db.tx { it.update("uploads", ContentValues().apply {
                put("state", "failed"); put("status", code); put("reason", reason)
            }, "workout_id = ?", arrayOf(workoutId)) }
            onState?.invoke(workoutId, "failed")
            Log.w(TAG, "parked ${f.name}: $code $reason")
        } catch (e: Exception) {
            Log.w(TAG, "could not park ${f.name} (${e.message})")
        }
    }

    private fun startedMs(workout: JSONObject): Long = try {
        val iso = java.text.SimpleDateFormat("yyyy-MM-dd'T'HH:mm:ss'Z'", java.util.Locale.US)
            .apply { timeZone = java.util.TimeZone.getTimeZone("UTC") }
        iso.parse(workout.optString("startedAt"))?.time ?: 0L
    } catch (e: Exception) { 0L }

    // --- for the settings page ------------------------------------------------

    /**
     * Everything the settings page shows about TrailMate, and nothing it does
     * not. No token, no device code: whether somebody is linked, what name
     * they linked as, the code and QR while a link is waiting, and the queue.
     */
    fun statusJson(): String {
        val people = JSONArray()
        val queue = uploads("queued")
        val failed = uploads("failed")
        for (p in cfg.people()) {
            people.put(JSONObject()
                .put("id", p.id)
                .put("linked", linked(p.id))
                .put("account", account(p.id))
                .put("reconnect", reconnectNeeded(p.id))
                .put("queued", queue.count { it.personId == p.id })
                .put("failed", failed.count { it.personId == p.id }))
        }
        val l = link
        val linkJson = if (l == null) JSONObject.NULL else JSONObject()
            .put("personId", l.personId)
            .put("state", l.state)
            .put("userCode", l.userCode)
            .put("uri", l.uri)
            // As base64, for an <img src="data:…">: an SVG from the network is
            // drawn as a picture, never parsed into the page.
            .put("qr", if (l.qrSvg.isEmpty()) "" else
                Base64.encodeToString(l.qrSvg.toByteArray(Charsets.UTF_8), Base64.NO_WRAP))
            .put("left", ((l.expiresAt - SystemClock.elapsedRealtime()) / 1000).coerceAtLeast(0))
            .put("message", l.message)
        fun brief(u: Upload) = JSONObject()
            .put("personId", u.personId)
            .put("workoutId", u.workoutId)
            .put("startedAt", u.startedAt)
            .put("distanceM", u.distance)
            .put("status", u.status)
            .put("reason", u.reason)
        return JSONObject()
            .put("people", people)
            .put("link", linkJson)
            .put("queued", JSONArray().apply { queue.forEach { put(brief(it)) } })
            .put("failed", JSONArray().apply { failed.forEach { put(brief(it)) } })
            .put("lastError", lastError)
            .put("retryIn", if (nextTryAt > 0L)
                ((nextTryAt - SystemClock.elapsedRealtime()) / 1000).coerceAtLeast(0) else 0)
            .toString()
    }

    // --- the wire -------------------------------------------------------------

    private class Reply(val code: Int, val body: String) {
        fun json(): JSONObject? = try { JSONObject(body) } catch (e: Exception) { null }
    }

    /**
     * One request. Throws on no answer at all; any answer, 500 included, comes
     * back as a [Reply] for the caller to judge.
     */
    private fun call(method: String, path: String, body: JSONObject?, token: String?): Reply {
        val url = URL(cfg.trailmateUrl().trimEnd('/') + path)
        val c = url.openConnection() as HttpURLConnection
        try {
            c.connectTimeout = TIMEOUT_MS
            c.readTimeout = TIMEOUT_MS
            c.requestMethod = method
            c.setRequestProperty("Accept", "application/json")
            c.setRequestProperty("User-Agent", "STRIDE/${BuildConfig.VERSION_NAME}")
            if (token != null) c.setRequestProperty("Authorization", "Bearer $token")
            if (body != null) {
                val bytes = body.toString().toByteArray(Charsets.UTF_8)
                c.doOutput = true
                c.setRequestProperty("Content-Type", "application/json; charset=utf-8")
                c.setFixedLengthStreamingMode(bytes.size)
                c.outputStream.use { it.write(bytes) }
            }
            val code = c.responseCode
            val stream = if (code >= 400) c.errorStream else c.inputStream
            val text = stream?.bufferedReader(Charsets.UTF_8)?.use { it.readText() } ?: ""
            return Reply(code, text)
        } finally {
            c.disconnect()
        }
    }

    /**
     * A failure in words a person at a treadmill can act on.
     *
     * The TLS one is worth singling out. This board boots believing it is
     * 2010 and is put right by NTP minutes later (see
     * MainActivity.sessionStartWall); until then every certificate on the
     * internet is "not yet valid", and the error says nothing about clocks.
     */
    private fun why(e: Exception): String = when (e) {
        is SSLException -> "secure connection failed — is the console's clock right?"
        is java.net.UnknownHostException -> "no network, or no such server"
        is java.net.SocketTimeoutException -> "timed out"
        else -> e.message ?: e.javaClass.simpleName
    }
}
