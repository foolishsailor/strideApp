package dev.stride.hud

import android.content.ContentValues
import android.content.Context
import android.database.sqlite.SQLiteDatabase
import android.util.Log
import org.json.JSONArray
import java.io.File

/**
 * Carries an older console's data into [Db], once. Each step reads the old
 * store, writes the database in one transaction, and only then removes the
 * old copy, so a power cut part-way leaves the old data to be read again.
 */
object Migration {
    private const val TAG = "StrideMigration"

    /** Left in the old preferences on purpose: read before anything else exists. */
    private val STAY = setOf(MainActivity.PREF_SIM)

    /** Keys from features since removed. Dropped, not carried. */
    private val DEAD = setOf("coach_on", "coach_talk", "coach_voice", "coach_remote",
        "coach_milestones", "seeded", "ha_enabled", "mqtt_host", "mqtt_port", "mqtt_user",
        "mqtt_pass", "mqtt_tls", "mqtt_prefix", "ui")

    /** Settings and people, from the `stride` preferences file. */
    fun fromPrefs(context: Context, db: Db) {
        val prefs = context.getSharedPreferences(MainActivity.PREFS, Context.MODE_PRIVATE)
        val all = prefs.all.filterKeys { it !in STAY }
        if (all.isEmpty()) return
        db.tx { d ->
            (all["people"] as? String)?.let { raw ->
                try {
                    val arr = JSONArray(raw)
                    for (i in 0 until arr.length()) {
                        val o = arr.getJSONObject(i)
                        val name = o.getString("name")
                        val id = o.optString("id").ifBlank {
                            name.lowercase().replace(Regex("[^a-z0-9]+"), "_").trim('_')
                        }
                        d.insertWithOnConflict("people", null, ContentValues().apply {
                            put("id", id); put("name", name); put("age", o.optInt("age", 0)); put("pos", i)
                        }, SQLiteDatabase.CONFLICT_IGNORE)
                    }
                } catch (e: Exception) {
                    Log.w(TAG, "people unreadable (${e.message}) — not carried")
                }
            }
            for ((k, v) in all) {
                if (k == "people" || k in DEAD || v == null) continue
                var scope = Db.CONSOLE
                var key = if (k == "default_walker") Settings.DEFAULT_RUNNER else k
                // Per-person settings were stored as p.<id>.<key>.
                if (k.startsWith("p.")) {
                    val dot = k.lastIndexOf('.')
                    if (dot <= 2) continue
                    scope = k.substring(2, dot)
                    key = k.substring(dot + 1)
                }
                d.insertWithOnConflict("settings", null, ContentValues().apply {
                    put("scope", scope); put("key", key); put("value", v.toString())
                }, SQLiteDatabase.CONFLICT_IGNORE)
            }
        }
        prefs.edit().apply { all.keys.forEach { remove(it) } }.commit()
        Log.i(TAG, "settings and people moved into ${Db.NAME} (${all.size} entries)")
    }

    /** Run summaries, from `history.json`. */
    fun fromHistoryFile(context: Context, db: Db) {
        val file = File(context.filesDir, "history.json")
        if (!file.exists()) return
        try {
            val arr = JSONArray(file.readText().trim().ifBlank { "[]" })
            db.tx { d ->
                // Stored newest first; inserted oldest first so ids follow time.
                for (i in arr.length() - 1 downTo 0) {
                    val run = History.Run.from(arr.optJSONObject(i) ?: continue)
                    d.insert("runs", null, History.values(run))
                }
            }
            Log.i(TAG, "${arr.length()} run(s) moved into ${Db.NAME}")
        } catch (e: Exception) {
            Log.w(TAG, "history unreadable (${e.message}) — not carried")
        }
        file.delete()
    }

    /** TrailMate links, from the `trailmate` preferences file, encrypting the tokens. */
    fun fromTrailMatePrefs(context: Context, db: Db) {
        val prefs = context.getSharedPreferences("trailmate", Context.MODE_PRIVATE)
        val all = prefs.all
        if (all.isEmpty()) return
        val ids = all.keys.filter { it.startsWith("token.") }.map { it.removePrefix("token.") }
        db.tx { d ->
            for (id in ids) {
                val token = all["token.$id"] as? String ?: continue
                d.insertWithOnConflict("links", null, ContentValues().apply {
                    put("person_id", id)
                    put("token", Vault.seal(token))
                    put("device", all["device.$id"] as? String ?: "")
                    put("account", all["account.$id"] as? String ?: "")
                    put("reconnect", if (all["reconnect.$id"] == true) 1 else 0)
                }, SQLiteDatabase.CONFLICT_REPLACE)
            }
        }
        prefs.edit().clear().commit()
        context.deleteSharedPreferences("trailmate")
        Log.i(TAG, "${ids.size} TrailMate link(s) moved into ${Db.NAME}, encrypted")
    }
}
