package dev.stride.hud

import android.content.Context
import android.database.sqlite.SQLiteDatabase
import android.database.sqlite.SQLiteOpenHelper

/**
 * The console's one database, `stride.db`: people, settings, run summaries,
 * TrailMate links and the upload queue's index.
 *
 * Android's own SQLite, with no library on top, so it adds nothing to the APK.
 * Every write is a transaction and the journal is synced before a write
 * returns: the console is switched off at the wall as a matter of course, and
 * a setting changed a second before that must still be there afterwards.
 *
 * What stays out of it: the per-second trace of a run, which lives in a file
 * only until TrailMate has it (see [RunRecorder] and [TrailMate]), and routes,
 * which are a document from TrailMate rather than rows.
 */
class Db private constructor(context: Context) :
    SQLiteOpenHelper(context.applicationContext, NAME, null, VERSION) {

    companion object {
        const val NAME = "stride.db"
        const val VERSION = 1

        /** Settings that belong to the whole treadmill rather than a person. */
        const val CONSOLE = ""

        @Volatile private var one: Db? = null

        fun get(context: Context): Db =
            one ?: synchronized(this) { one ?: Db(context).also { one = it } }
    }

    override fun onConfigure(db: SQLiteDatabase) {
        db.enableWriteAheadLogging()
        // WAL's default (NORMAL) can drop the last transaction on power loss.
        db.execSQL("PRAGMA synchronous=FULL")
    }

    override fun onCreate(db: SQLiteDatabase) {
        db.execSQL("""
            CREATE TABLE people (
                id   TEXT PRIMARY KEY,
                name TEXT NOT NULL,
                age  INTEGER NOT NULL DEFAULT 0,
                pos  INTEGER NOT NULL DEFAULT 0
            )""")
        // scope is CONSOLE for the treadmill's own, or a person's id.
        db.execSQL("""
            CREATE TABLE settings (
                scope TEXT NOT NULL,
                key   TEXT NOT NULL,
                value TEXT NOT NULL,
                PRIMARY KEY (scope, key)
            ) WITHOUT ROWID""")
        // One row per finished run: what the summary, achievements and any
        // list of past runs need. Never the trace.
        db.execSQL("""
            CREATE TABLE runs (
                id          INTEGER PRIMARY KEY AUTOINCREMENT,
                workout_id  TEXT NOT NULL DEFAULT '',
                who         TEXT NOT NULL,
                started_at  INTEGER NOT NULL,
                elapsed     REAL NOT NULL,
                distance    REAL NOT NULL,
                calories    REAL NOT NULL,
                climb       REAL NOT NULL,
                avg_speed   REAL NOT NULL,
                max_speed   REAL NOT NULL,
                max_incline REAL NOT NULL,
                avg_pulse   INTEGER NOT NULL,
                max_pulse   INTEGER NOT NULL,
                plan        TEXT NOT NULL DEFAULT '',
                trailmate   TEXT NOT NULL DEFAULT ''
            )""")
        db.execSQL("CREATE INDEX runs_who ON runs (who, started_at DESC)")
        db.execSQL("CREATE INDEX runs_workout ON runs (workout_id)")
        // A person's TrailMate link. The token is encrypted (see Vault).
        db.execSQL("""
            CREATE TABLE links (
                person_id TEXT PRIMARY KEY,
                token     BLOB NOT NULL,
                device    TEXT NOT NULL DEFAULT '',
                account   TEXT NOT NULL DEFAULT '',
                reconnect INTEGER NOT NULL DEFAULT 0
            )""")
        // Runs waiting for TrailMate, or refused by it. The workout itself is
        // a file until it is sent; this is what the settings screen reads.
        db.execSQL("""
            CREATE TABLE uploads (
                workout_id TEXT PRIMARY KEY,
                person_id  TEXT NOT NULL,
                file       TEXT NOT NULL,
                started_at TEXT NOT NULL DEFAULT '',
                distance   REAL NOT NULL DEFAULT 0,
                state      TEXT NOT NULL,
                status     INTEGER NOT NULL DEFAULT 0,
                reason     TEXT NOT NULL DEFAULT ''
            )""")
    }

    override fun onUpgrade(db: SQLiteDatabase, old: Int, new: Int) {}

    /** [block] as one transaction: all of it lands, or none of it does. */
    fun <T> tx(block: (SQLiteDatabase) -> T): T {
        val db = writableDatabase
        db.beginTransaction()
        try {
            val r = block(db)
            db.setTransactionSuccessful()
            return r
        } finally {
            db.endTransaction()
        }
    }
}
