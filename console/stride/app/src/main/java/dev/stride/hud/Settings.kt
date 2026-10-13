package dev.stride.hud

import android.content.ContentValues
import android.content.Context
import android.database.sqlite.SQLiteDatabase
import android.util.Log
import org.json.JSONArray
import org.json.JSONObject

/**
 * Everything about *this* installation, rather than about treadmills.
 *
 * Three rules this file exists to hold:
 *
 * * **A default must be a working treadmill.** Nothing here is required. With
 *   no people added, the deck still runs and still counts, so a fresh install
 *   is usable before it is configured.
 *
 * * **Preferences are not permissions.** Anything the *board* reports —
 *   incline range, speed range — is read from the machine and is not in here.
 *   Storing a max incline someone typed would be storing a way to ask the deck
 *   for something it cannot do.
 *
 * * **Per-person things belong to the person.** A runner's age, history,
 *   TrailMate link and [PERSONAL] settings are theirs, not the console's.
 *
 * Stored in [Db]: a `people` table, and a `settings` table whose `scope` is
 * [Db.CONSOLE] for the treadmill's own or a person's id for theirs. Everything
 * is held in memory as well, because the poll loop reads units and the heart
 * rate source five times a second; every change is written to the database
 * before it is taken into memory.
 */
class Settings(context: Context) {

    private val db = Db.get(context)

    /** scope → key → value. Replaced whole on every write, read without a lock. */
    @Volatile private var values: Map<String, Map<String, String>> = emptyMap()
    @Volatile private var everyone: List<Person> = emptyList()

    init {
        Migration.fromPrefs(context, db)
        load()
    }

    /**
     * The id of whoever is running, or blank for a guest or nobody yet.
     *
     * The [PERSONAL] settings are read and written for this person. Somebody
     * who has never changed one gets the console's own value, which is also
     * where a new person starts.
     */
    @Volatile var active: String = ""

    private fun load() {
        val rd = db.readableDatabase
        val v = HashMap<String, HashMap<String, String>>()
        rd.rawQuery("SELECT scope, key, value FROM settings", null).use { c ->
            while (c.moveToNext()) v.getOrPut(c.getString(0)) { HashMap() }[c.getString(1)] = c.getString(2)
        }
        values = v
        val p = ArrayList<Person>()
        rd.rawQuery("SELECT id, name, age FROM people ORDER BY pos, rowid", null).use { c ->
            while (c.moveToNext()) p += Person(c.getString(0), c.getString(1), c.getInt(2))
        }
        everyone = p
    }

    /** The scope a setting is read from: the runner's own value if they have one. */
    private fun get(key: String): String? {
        if (key in PERSONAL && active.isNotEmpty()) values[active]?.get(key)?.let { return it }
        return values[Db.CONSOLE]?.get(key)
    }

    /** The scope a setting is written to: the runner's own, or the console's. */
    private fun scopeFor(key: String): String =
        if (key in PERSONAL && active.isNotEmpty()) active else Db.CONSOLE

    private fun str(key: String, def: String) = get(key) ?: def
    private fun int(key: String, def: Int) = get(key)?.toDoubleOrNull()?.toInt() ?: def
    private fun dbl(key: String, def: Double) = get(key)?.toDoubleOrNull() ?: def
    private fun bool(key: String, def: Boolean) = get(key)?.let { it == "true" || it == "1" } ?: def

    /** Write several settings at once, then take them into memory. */
    private fun write(scope: String, kv: Map<String, String>) {
        db.tx { d ->
            kv.forEach { (k, v) ->
                d.insertWithOnConflict("settings", null, ContentValues().apply {
                    put("scope", scope); put("key", k); put("value", v)
                }, SQLiteDatabase.CONFLICT_REPLACE)
            }
        }
        val next = values.toMutableMap()
        next[scope] = (values[scope] ?: emptyMap()) + kv
        values = next
    }

    companion object {
        private const val TAG = "StrideSettings"

        // --- people ---
        const val DEFAULT_RUNNER = "default_runner"
        const val ALLOW_GUEST = "allow_guest"

        /** Sentinel for "do not assume, ask on the welcome screen". */
        const val ASK = ""

        // --- units ---
        const val UNITS = "units"           // "km" | "mi"

        // --- deck ---
        const val WARMUP_MIN = "warmup_min"
        const val COOLDOWN_MIN = "cooldown_min"
        const val WARMUP_KPH = "warmup_kph"
        const val INCLINE_RATE = "incline_rate"   // "gentle" | "normal" | "quick"
        const val OPEN_LAP_MIN = "open_lap_min"
        /** The fastest a workout may drive the belt, km/h; 0 for no limit (spec 038). */
        const val WORKOUT_SPEED_LIMIT = "workout_speed_limit"
        /** The belt's measured speed table, as JSON. See [BeltCalibration].
         *  Written only through [saveBeltCalibration], never by [set]. */
        const val BELT_CAL = "belt_cal"

        // --- heart rate ---
        const val HR_SOURCE = "hr_source"         // "auto" | "strap" | "grips"
        const val HR_ADDR = "hr_addr"
        const val HR_NAME = "hr_name"

        // --- foot pod ---
        const val POD_ADDR = "pod_addr"
        const val POD_NAME = "pod_name"

        // --- headphones ---
        const val PHONES_ADDR = "phones_addr"
        const val PHONES_NAME = "phones_name"

        // --- trailmate ---
        const val TRAILMATE_URL = "trailmate_url"
        const val TRAILMATE_DEFAULT_URL = "https://www.foolishrunner.com/api"

        // --- display ---
        const val SLEEP_MIN = "sleep_min"
        const val CLOCK_24 = "clock_24"
        const val BRIGHTNESS = "brightness"       // "dim" | "normal" | "bright"
        const val KEEP_AWAKE = "keep_awake"

        /**
         * How fast a guided run may move the deck, as three named presets
         * rather than two millisecond fields.
         *
         * `INCLINE_STEP` and `INCLINE_EVERY_MS` are a safety-shaped pair: they
         * are the reason the biggest jump in any template takes half a minute
         * to arrive rather than landing under someone mid-stride. Exposed as
         * raw numbers, somebody eventually sets five percent every five hundred
         * milliseconds. Named presets keep the reasoning attached.
         */
        val INCLINE_RATES = mapOf(
            "gentle" to Pair(0.5, 4000L),
            "normal" to Pair(1.0, 3000L),
            "quick" to Pair(1.0, 1500L),
        )

        /**
         * Settings that belong to the runner rather than the console: how they
         * like to start and stop, the units they think in, and their own strap,
         * pod and headphones. Brightness, sleep, the clock and the belt are the
         * room's and the machine's, and stay shared.
         */
        val PERSONAL = setOf(
            UNITS, WARMUP_MIN, COOLDOWN_MIN, WARMUP_KPH, INCLINE_RATE, OPEN_LAP_MIN, WORKOUT_SPEED_LIMIT,
            HR_SOURCE, HR_ADDR, HR_NAME, POD_ADDR, POD_NAME, PHONES_ADDR, PHONES_NAME,
        )

        /** Every key [set] accepts. Anything else from the page is ignored. */
        val KNOWN = PERSONAL + setOf(
            DEFAULT_RUNNER, ALLOW_GUEST, TRAILMATE_URL, SLEEP_MIN, CLOCK_24, BRIGHTNESS, KEEP_AWAKE,
        )
    }

    // --- people ---------------------------------------------------------------

    /**
     * One runner.
     */
    data class Person(
        val id: String,
        val name: String,
        /**
         * Years, or 0 for "has not said" — which is the default and stays the
         * default. It buys one thing: heart-rate zones, via the usual
         * 220-minus-age, which is crude (±10-12 bpm between two people of the
         * same age). Nobody has to tell a treadmill their age.
         */
        val age: Int = 0,
    ) {
        fun json(): JSONObject = JSONObject()
            .put("id", id).put("name", name)
            .put("age", age)

        /**
         * Maximum heart rate, or 0 if unknown.
         *
         * Clamped to an age this formula means anything for. Below about 13 and
         * above about 100 it is extrapolation, and a zone floor built on it
         * would be a number the console had made up.
         */
        val maxPulse: Int get() = if (age in 13..100) 220 - age else 0
    }

    /**
     * A stable identity, fixed when somebody is added and never derived again,
     * so a rename keeps their history, settings and TrailMate link. The slug
     * of the name at creation.
     */
    private fun freshId(name: String, taken: Set<String>): String {
        val base = name.lowercase().replace(Regex("[^a-z0-9]+"), "_").trim('_')
            .ifBlank { "runner" }
        if (base !in taken) return base
        var n = 2
        while ("${base}_$n" in taken) n++
        return "${base}_$n"
    }

    fun addPerson(name: String): Person? {
        val clean = name.trim().take(20)
        if (clean.isBlank()) return null
        val list = people()
        if (list.any { it.name.equals(clean, ignoreCase = true) }) return null
        val p = Person(id = freshId(clean, list.map { it.id }.toSet()), name = clean)
        savePeople(list + p)
        return p
    }

    /**
     * Empty by default, and deliberately so: when the list is empty the UI
     * offers a single guest run and a way to add somebody.
     */
    fun people(): List<Person> = everyone

    /**
     * The whole list, in order. Anyone no longer in it is removed with their
     * own settings, in the same transaction.
     */
    fun savePeople(list: List<Person>) {
        val gone = everyone.map { it.id } - list.map { it.id }.toSet()
        // A default that no longer names anybody would silently start every
        // run as a guest. Drop it and let the welcome screen ask instead.
        val dropDefault = list.none { it.name == defaultRunner() }
        db.tx { d ->
            d.delete("people", null, null)
            list.forEachIndexed { i, p ->
                d.insert("people", null, ContentValues().apply {
                    put("id", p.id); put("name", p.name); put("age", p.age); put("pos", i)
                })
            }
            gone.forEach { id ->
                d.delete("settings", "scope = ?", arrayOf(id))
                // What TrailMate sent about them goes too (spec 038).
                for (t in listOf("schedule", "zones", "person_routes", "sync"))
                    d.delete(t, "person_id = ?", arrayOf(id))
            }
            if (dropDefault) d.insertWithOnConflict("settings", null, ContentValues().apply {
                put("scope", Db.CONSOLE); put("key", DEFAULT_RUNNER); put("value", ASK)
            }, SQLiteDatabase.CONFLICT_REPLACE)
        }
        load()
    }

    fun person(name: String): Person? = everyone.firstOrNull { it.name == name }
    fun personById(id: String): Person? = everyone.firstOrNull { it.id == id }

    fun defaultRunner(): String = values[Db.CONSOLE]?.get(DEFAULT_RUNNER) ?: ASK
    fun allowGuest(): Boolean = bool(ALLOW_GUEST, true)

    // --- units ----------------------------------------------------------------

    fun units(): String = str(UNITS, "km")
    fun metric(): Boolean = units() == "km"

    // --- deck -----------------------------------------------------------------

    fun warmupMin(): Int = int(WARMUP_MIN, 2)
    fun cooldownMin(): Int = int(COOLDOWN_MIN, 2)
    fun warmupMs(): Long = warmupMin() * 60_000L
    fun cooldownMs(): Long = cooldownMin() * 60_000L
    fun warmupKph(): Double = dbl(WARMUP_KPH, 2.0)
    fun openLapMin(): Int = int(OPEN_LAP_MIN, 20)
    fun inclineRate(): String = str(INCLINE_RATE, "normal")
    /** km/h, or 0 when the runner has set no limit. */
    fun workoutSpeedLimit(): Double = dbl(WORKOUT_SPEED_LIMIT, 0.0)

    fun inclineStep(): Double = INCLINE_RATES[inclineRate()]?.first ?: 1.0

    fun inclineEveryMs(): Long = INCLINE_RATES[inclineRate()]?.second ?: 3000L

    /**
     * How far this belt is from the speed it is asked for, measured with a foot
     * pod. A property of the machine, not of a person, and it outlives
     * [resetSettings] the way people do: it was measured, not chosen.
     */
    fun beltCalibration(): BeltCalibration =
        BeltCalibration.parse(values[Db.CONSOLE]?.get(BELT_CAL))

    fun saveBeltCalibration(cal: BeltCalibration) {
        write(Db.CONSOLE, mapOf(BELT_CAL to cal.json().toString()))
    }

    // --- heart rate, foot pod, headphones -------------------------------------

    fun hrSource(): String = str(HR_SOURCE, "auto")
    fun hrAddr(): String = str(HR_ADDR, "")
    fun hrName(): String = str(HR_NAME, "")

    // Forgetting writes blanks rather than removing them: removed, a runner's
    // own device would give way to the console's, and "forget" would not.
    fun saveStrap(addr: String, name: String) =
        write(scopeFor(HR_ADDR), mapOf(HR_ADDR to addr, HR_NAME to name))
    fun forgetStrap() = saveStrap("", "")

    fun podAddr(): String = str(POD_ADDR, "")
    fun podName(): String = str(POD_NAME, "")
    fun savePod(addr: String, name: String) =
        write(scopeFor(POD_ADDR), mapOf(POD_ADDR to addr, POD_NAME to name))
    fun forgetPod() = savePod("", "")

    fun phonesAddr(): String = str(PHONES_ADDR, "")
    fun phonesName(): String = str(PHONES_NAME, "")
    fun savePhones(addr: String, name: String) =
        write(scopeFor(PHONES_ADDR), mapOf(PHONES_ADDR to addr, PHONES_NAME to name))
    fun forgetPhones() = savePhones("", "")

    // --- trailmate ------------------------------------------------------------

    /**
     * Where TrailMate's API is. Production unless somebody says otherwise.
     * Only the address lives here; the tokens are in [TrailMate]'s own table,
     * encrypted, so [json] cannot hand one to the settings page.
     */
    fun trailmateUrl(): String = str(TRAILMATE_URL, "").trim().ifBlank { TRAILMATE_DEFAULT_URL }

    // --- display --------------------------------------------------------------

    fun sleepMs(): Long = int(SLEEP_MIN, 5) * 60_000L
    fun clock24(): Boolean = bool(CLOCK_24, true)
    fun keepAwake(): Boolean = bool(KEEP_AWAKE, true)

    fun brightness(): Float = when (str(BRIGHTNESS, "normal")) {
        "dim" -> 0.35f
        "bright" -> 1.0f
        else -> 0.7f
    }

    // --- the whole thing, for the settings screen ------------------------------

    /**
     * One object the settings UI renders from, so the screen cannot drift from
     * the store by holding its own idea of a default.
     */
    fun json(): JSONObject = JSONObject()
        .put("people", JSONArray().apply { people().forEach { put(it.json()) } })
        // Whose settings the personal values below are; blank for a guest.
        .put("active", personById(active)?.name ?: "")
        .put(DEFAULT_RUNNER, defaultRunner())
        .put(ALLOW_GUEST, allowGuest())
        .put(UNITS, units())
        .put(WARMUP_MIN, warmupMin())
        .put(COOLDOWN_MIN, cooldownMin())
        .put(WARMUP_KPH, warmupKph())
        .put(INCLINE_RATE, inclineRate())
        .put(OPEN_LAP_MIN, openLapMin())
        .put(WORKOUT_SPEED_LIMIT, workoutSpeedLimit())
        .put(HR_SOURCE, hrSource())
        .put(HR_ADDR, hrAddr())
        .put(HR_NAME, hrName())
        .put(POD_ADDR, podAddr())
        .put(POD_NAME, podName())
        .put(PHONES_ADDR, phonesAddr())
        .put(PHONES_NAME, phonesName())
        .put(TRAILMATE_URL, trailmateUrl())
        .put(SLEEP_MIN, int(SLEEP_MIN, 5))
        .put(CLOCK_24, clock24())
        .put(BRIGHTNESS, str(BRIGHTNESS, "normal"))
        .put(KEEP_AWAKE, keepAwake())

    /**
     * Save one value from the settings page. Stored as text and typed where it
     * is read, so nothing the page sends can make a later read throw.
     */
    fun set(key: String, value: String) {
        if (key !in KNOWN) {
            Log.w(TAG, "ignoring unknown setting '$key'")
            return
        }
        val clean = when (key) {
            ALLOW_GUEST, CLOCK_24, KEEP_AWAKE -> (value == "true" || value == "1").toString()
            WARMUP_MIN, COOLDOWN_MIN, OPEN_LAP_MIN, SLEEP_MIN -> (value.toIntOrNull() ?: 0).toString()
            WARMUP_KPH -> (value.toDoubleOrNull() ?: 2.0).toString()
            WORKOUT_SPEED_LIMIT -> (value.toDoubleOrNull()?.coerceAtLeast(0.0) ?: 0.0).toString()
            else -> value
        }
        write(scopeFor(key), mapOf(key to clean))
    }

    /** The runner's own settings go back to the console's. */
    fun resetMine() {
        val id = active
        if (id.isEmpty()) return
        db.tx { it.delete("settings", "scope = ?", arrayOf(id)) }
        values = values - id
    }

    /**
     * The console's settings. People, everybody's own settings, totals,
     * history and the belt calibration are kept.
     */
    fun resetSettings() {
        db.tx {
            it.delete("settings", "scope = ? AND key NOT IN (?, ?)",
                arrayOf(Db.CONSOLE, BELT_CAL, DEFAULT_RUNNER))
        }
        load()
    }
}
