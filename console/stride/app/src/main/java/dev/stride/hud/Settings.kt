package dev.stride.hud

import android.content.Context
import android.content.SharedPreferences
import org.json.JSONArray
import org.json.JSONObject

/**
 * Everything about *this* installation, rather than about treadmills.
 *
 * The console shipped with a household baked into it. Not as configuration
 * anyone had chosen to inline, but as the ordinary residue of building
 * something for one house: four names in an HTML array, a broker in
 * `local.properties`, kilometres everywhere, and behaviour gated on one
 * person's name, so a second person in the same house silently got a
 * different product.
 *
 * Three rules this file exists to hold:
 *
 * * **A default must be a working treadmill.** Nothing here is required. With
 *   no broker set and no people added, the deck still runs and still counts.
 *   Home Assistant is an addition, never a dependency — so a fresh install is
 *   usable before it is configured.
 *
 * * **Preferences are not permissions.** Anything the *board* reports —
 *   incline range, speed range — is read from the machine and is not in here.
 *   Storing a max incline someone typed would be storing a way to ask the deck
 *   for something it cannot do.
 *
 * * **Per-person things belong to the person.** Publishing is a property of a
 *   runner, not of the console, which is the whole fix for the name comparison.
 *
 * Stored in SharedPreferences because it is a handful of scalars and one small
 * list, read at start-up and on every settings save. A database would be a
 * database to maintain.
 */
class Settings(context: Context) {

    private val prefs: SharedPreferences =
        context.getSharedPreferences(MainActivity.PREFS, Context.MODE_PRIVATE)

    init { migrate() }

    /**
     * Carry an older console's preferences forward. The default person used
     * to be saved as `default_walker`, and the removed coach left five keys
     * behind; the first is moved, the rest are dropped. Once done, nothing
     * here finds anything to do.
     */
    private fun migrate() {
        val e = prefs.edit()
        var dirty = false
        if (!prefs.contains(DEFAULT_RUNNER) && prefs.contains("default_walker")) {
            e.putString(DEFAULT_RUNNER, prefs.getString("default_walker", ASK))
            dirty = true
        }
        for (old in listOf("default_walker", "coach_on", "coach_talk", "coach_voice",
                           "coach_remote", "coach_milestones")) {
            if (prefs.contains(old)) { e.remove(old); dirty = true }
        }
        if (dirty) e.apply()
    }

    companion object {
        // --- people ---
        const val PEOPLE = "people"
        const val DEFAULT_RUNNER = "default_runner"
        const val ALLOW_GUEST = "allow_guest"

        /** Sentinel for "do not assume, ask on the welcome screen". */
        const val ASK = ""

        // --- units ---
        const val UNITS = "units"           // "km" | "mi"

        // --- home assistant ---
        const val HA_ENABLED = "ha_enabled"
        const val MQTT_HOST = "mqtt_host"
        const val MQTT_PORT = "mqtt_port"
        const val MQTT_USER = "mqtt_user"
        const val MQTT_PASS = "mqtt_pass"
        const val MQTT_TLS = "mqtt_tls"
        const val MQTT_PREFIX = "mqtt_prefix"

        // --- deck ---
        const val WARMUP_MIN = "warmup_min"
        const val COOLDOWN_MIN = "cooldown_min"
        const val WARMUP_KPH = "warmup_kph"
        const val INCLINE_RATE = "incline_rate"   // "gentle" | "normal" | "quick"
        const val OPEN_LAP_MIN = "open_lap_min"
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
    }

    // --- people ---------------------------------------------------------------

    /**
     * One runner.
     *
     * @param publish  do their runs leave the console for Home Assistant
     *
     * Publishing is closer to consent than to a preference, and it is the
     * reason a household member can use the treadmill without appearing on
     * somebody else's dashboard.
     */
    data class Person(
        val id: String,
        val name: String,
        val publish: Boolean,
        /** `person.jane_doe`, or empty for somebody who exists only here. */
        val haPerson: String = "",
        /**
         * Years, or 0 for "has not said" — which is the default and stays the
         * default. It buys one thing: heart-rate zones, via the usual
         * 220-minus-age, which is crude (±10-12 bpm between two people of the
         * same age). Nobody has to tell a treadmill their age.
         *
         * Per person, not per console: there is a person registry here because
         * more than one person runs on this machine, and one shared age would
         * be wrong for all but one of them.
         */
        val age: Int = 0,
    ) {
        fun json(): JSONObject = JSONObject()
            .put("id", id).put("name", name)
            .put("publish", publish)
            .put("ha_person", haPerson)
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
     * A stable identity, fixed when somebody is added and never derived again.
     *
     * The id used to *be* the name — `slug(who)` at publish time — which meant
     * a rename silently orphaned every reading taken under the old spelling.
     * "Kez" becoming "Sam" started a second person's history and left the
     * first one frozen in Home Assistant looking like somebody who had stopped
     * running.
     *
     * The name is now a label. The id is the thing, and it is deliberately
     * still the slug *at creation*, so existing devices — `stride_person_sam`
     * and `stride_person_alex`, with real history behind them — keep working
     * untouched rather than needing a migration.
     */
    private fun freshId(name: String, taken: Set<String>): String {
        val base = name.lowercase().replace(Regex("[^a-z0-9]+"), "_").trim('_')
            .ifBlank { "runner" }
        if (base !in taken) return base
        var n = 2
        while ("${base}_$n" in taken) n++
        return "${base}_$n"
    }

    fun addPerson(name: String, haPerson: String = ""): Person? {
        val clean = name.trim().take(20)
        if (clean.isBlank()) return null
        val list = people().toMutableList()
        if (list.any { it.name.equals(clean, ignoreCase = true) }) return null
        val p = Person(
            id = freshId(clean, list.map { it.id }.toSet()),
            name = clean,
            // Somebody who is not in Home Assistant has nothing there to be
            // recorded against, so it starts off. It can be turned on — it
            // simply creates a device with no matching person, which is a
            // reasonable thing to want for a housemate with no HA account.
            publish = haPerson.isNotEmpty(),
            haPerson = haPerson,
        )
        list += p
        savePeople(list)
        return p
    }

    /**
     * Empty by default, and deliberately so.
     *
     * A console that ships with four strangers' names on the welcome screen is
     * worse than one that asks. When the list is empty the UI offers a single
     * guest run and a way to add somebody.
     */
    fun people(): List<Person> {
        val raw = prefs.getString(PEOPLE, null) ?: return emptyList()
        return try {
            val arr = JSONArray(raw)
            (0 until arr.length()).map { i ->
                val o = arr.getJSONObject(i)
                val name = o.getString("name")
                Person(
                    // Older entries predate stable ids; fall back to the slug
                    // they were already being published under.
                    id = o.optString("id").ifBlank {
                        name.lowercase().replace(Regex("[^a-z0-9]+"), "_").trim('_')
                    },
                    name = name,
                    publish = o.optBoolean("publish", true),
                    haPerson = o.optString("ha_person"),
                    // Absent for everyone who existed before zones did, which
                    // is the same as declining to say — see Person.age.
                    age = o.optInt("age", 0),
                )
            }
        } catch (e: Exception) {
            emptyList()
        }
    }

    fun savePeople(list: List<Person>) {
        prefs.edit().putString(
            PEOPLE, JSONArray().apply { list.forEach { put(it.json()) } }.toString()
        ).apply()
        // A default that no longer names anybody would silently start every
        // run as a guest. Drop it and let the welcome screen ask instead.
        if (list.none { it.name == defaultRunner() }) {
            prefs.edit().putString(DEFAULT_RUNNER, ASK).apply()
        }
    }

    fun person(name: String): Person? = people().firstOrNull { it.name == name }
    fun personById(id: String): Person? = people().firstOrNull { it.id == id }

    /**
     * May this runner's run be published.
     *
     * **Unknown runners may not.** A guest is someone who has not agreed to
     * anything, so their run stays on the console.
     */
    fun publishFor(name: String): Boolean = person(name)?.publish ?: false

    fun defaultRunner(): String = prefs.getString(DEFAULT_RUNNER, ASK) ?: ASK
    fun allowGuest(): Boolean = prefs.getBoolean(ALLOW_GUEST, true)

    // --- units ----------------------------------------------------------------

    fun units(): String = prefs.getString(UNITS, "km") ?: "km"
    fun metric(): Boolean = units() == "km"

    // --- home assistant -------------------------------------------------------

    /**
     * Off until somebody sets a broker.
     *
     * The old build compiled credentials in from `local.properties`, so a clone
     * without those keys produced an app that could not connect — which the
     * comment there called "the right way to fail", and was, for one house. For
     * anyone else it is an app that ships someone else's password or does not
     * work. Runtime configuration is the only version of this that can be
     * released.
     */
    fun haEnabled(): Boolean = prefs.getBoolean(HA_ENABLED, false) && mqttHost().isNotBlank()

    fun mqttHost(): String = prefs.getString(MQTT_HOST, "") ?: ""
    fun mqttPort(): Int = prefs.getInt(MQTT_PORT, 1883)
    fun mqttUser(): String = prefs.getString(MQTT_USER, "") ?: ""
    fun mqttPass(): String = prefs.getString(MQTT_PASS, "") ?: ""
    fun mqttTls(): Boolean = prefs.getBoolean(MQTT_TLS, false)
    fun mqttPrefix(): String = (prefs.getString(MQTT_PREFIX, "stride") ?: "stride")
        .trim().trim('/').ifBlank { "stride" }

    fun brokerUri(): String =
        "${if (mqttTls()) "ssl" else "tcp"}://${mqttHost()}:${mqttPort()}"

    /**
     * First run only: adopt whatever was compiled in, then never look again.
     *
     * Moving the broker from `BuildConfig` to settings would otherwise take a
     * working console offline the moment it was updated — Home Assistant would
     * simply stop hearing from a treadmill that had been publishing happily for
     * a week, with nothing on screen to say why. That is a bad way to ship an
     * improvement.
     *
     * So `local.properties` becomes a *seed* rather than the source. A dev
     * build carries it in and this copies it to settings once, where it can
     * then be edited on the console like everything else. A public build has no
     * such keys, so `secret()` yields empty strings, nothing is seeded, and
     * Home Assistant stays off until somebody fills it in — which is the
     * behaviour that made the compiled-in version defensible in the first
     * place, now without shipping anyone's password.
     *
     * Keyed on a marker rather than on the fields being blank, so clearing the
     * broker on purpose is not undone at the next start-up.
     */
    fun seedFromBuildConfig() {
        if (prefs.getBoolean("seeded", false)) return
        prefs.edit().putBoolean("seeded", true).apply()

        val uri = BuildConfig.MQTT_BROKER
        if (uri.isBlank()) return

        // "tcp://host:1883" — the shape build.gradle.kts writes.
        val bare = uri.substringAfter("://")
        val host = bare.substringBefore(":")
        val port = bare.substringAfter(":", "1883").toIntOrNull() ?: 1883
        if (host.isBlank()) return

        prefs.edit()
            .putString(MQTT_HOST, host)
            .putInt(MQTT_PORT, port)
            .putString(MQTT_USER, BuildConfig.MQTT_USER)
            .putString(MQTT_PASS, BuildConfig.MQTT_PASS)
            .putBoolean(MQTT_TLS, uri.startsWith("ssl"))
            .putBoolean(HA_ENABLED, true)
            .apply()
    }

    // --- deck -----------------------------------------------------------------

    fun warmupMs(): Long = prefs.getInt(WARMUP_MIN, 2) * 60_000L
    fun cooldownMs(): Long = prefs.getInt(COOLDOWN_MIN, 2) * 60_000L
    fun warmupKph(): Double = prefs.getFloat(WARMUP_KPH, 2.0f).toDouble()
    fun openLapMin(): Int = prefs.getInt(OPEN_LAP_MIN, 20)

    fun inclineStep(): Double =
        INCLINE_RATES[prefs.getString(INCLINE_RATE, "normal")]?.first ?: 1.0

    fun inclineEveryMs(): Long =
        INCLINE_RATES[prefs.getString(INCLINE_RATE, "normal")]?.second ?: 3000L

    /**
     * How far this belt is from the speed it is asked for, measured with a foot
     * pod. A property of the machine, not of a person, and it outlives
     * [resetSettings] the way people do: it was measured, not chosen.
     */
    fun beltCalibration(): BeltCalibration = BeltCalibration.parse(prefs.getString(BELT_CAL, null))

    fun saveBeltCalibration(cal: BeltCalibration) {
        prefs.edit().putString(BELT_CAL, cal.json().toString()).apply()
    }

    // --- heart rate -----------------------------------------------------------

    fun hrSource(): String = prefs.getString(HR_SOURCE, "auto") ?: "auto"
    fun hrAddr(): String = prefs.getString(HR_ADDR, "") ?: ""
    fun hrName(): String = prefs.getString(HR_NAME, "") ?: ""

    fun saveStrap(addr: String, name: String) {
        prefs.edit().putString(HR_ADDR, addr).putString(HR_NAME, name).apply()
    }

    fun forgetStrap() {
        prefs.edit().remove(HR_ADDR).remove(HR_NAME).apply()
    }

    // --- foot pod -------------------------------------------------------------

    fun podAddr(): String = prefs.getString(POD_ADDR, "") ?: ""
    fun podName(): String = prefs.getString(POD_NAME, "") ?: ""

    fun savePod(addr: String, name: String) {
        prefs.edit().putString(POD_ADDR, addr).putString(POD_NAME, name).apply()
    }

    fun forgetPod() {
        prefs.edit().remove(POD_ADDR).remove(POD_NAME).apply()
    }

    // --- headphones -----------------------------------------------------------

    fun phonesAddr(): String = prefs.getString(PHONES_ADDR, "") ?: ""
    fun phonesName(): String = prefs.getString(PHONES_NAME, "") ?: ""

    fun savePhones(addr: String, name: String) {
        prefs.edit().putString(PHONES_ADDR, addr).putString(PHONES_NAME, name).apply()
    }

    fun forgetPhones() {
        prefs.edit().remove(PHONES_ADDR).remove(PHONES_NAME).apply()
    }

    // --- trailmate ------------------------------------------------------------

    /**
     * Where TrailMate's API is. Production unless somebody says otherwise —
     * a setting rather than a constant so a console can be pointed at a dev
     * server (or `tools/trailmate_mock.py`) without a rebuild.
     *
     * Only the address lives here. The per-person tokens are secrets and are
     * kept apart from these preferences on purpose — see [TrailMate] — so
     * [json] cannot hand one to the settings page.
     */
    fun trailmateUrl(): String =
        (prefs.getString(TRAILMATE_URL, "") ?: "").trim().ifBlank { TRAILMATE_DEFAULT_URL }

    // --- display --------------------------------------------------------------

    fun sleepMs(): Long = prefs.getInt(SLEEP_MIN, 5) * 60_000L
    fun clock24(): Boolean = prefs.getBoolean(CLOCK_24, true)
    fun keepAwake(): Boolean = prefs.getBoolean(KEEP_AWAKE, true)

    fun brightness(): Float = when (prefs.getString(BRIGHTNESS, "normal")) {
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
        .put(DEFAULT_RUNNER, defaultRunner())
        .put(ALLOW_GUEST, allowGuest())
        .put(UNITS, units())
        .put(HA_ENABLED, prefs.getBoolean(HA_ENABLED, false))
        .put(MQTT_HOST, mqttHost())
        .put(MQTT_PORT, mqttPort())
        .put(MQTT_USER, mqttUser())
        // Deliberately not the password.
        //
        // This object is handed to the settings page, and anything that can
        // read the page can read it — which on a debug build is anyone with
        // the DevTools socket. The screen only ever needed to know *whether*
        // a password is stored, so that is all it gets. The key is absent
        // rather than empty on purpose: a reader that wants the password now
        // gets `undefined` and fails loudly, where "" would quietly read as
        // "no password set". See field() in stride-settings.js for the other
        // half — an untouched box does not clear what it cannot see.
        .put("mqtt_pass_set", mqttPass().isNotEmpty())
        .put(MQTT_TLS, mqttTls())
        .put(MQTT_PREFIX, mqttPrefix())
        .put(WARMUP_MIN, prefs.getInt(WARMUP_MIN, 2))
        .put(COOLDOWN_MIN, prefs.getInt(COOLDOWN_MIN, 2))
        .put(WARMUP_KPH, prefs.getFloat(WARMUP_KPH, 2.0f).toDouble())
        .put(INCLINE_RATE, prefs.getString(INCLINE_RATE, "normal"))
        .put(OPEN_LAP_MIN, openLapMin())
        .put(HR_SOURCE, hrSource())
        .put(HR_ADDR, hrAddr())
        .put(HR_NAME, hrName())
        .put(POD_ADDR, podAddr())
        .put(POD_NAME, podName())
        .put(PHONES_ADDR, phonesAddr())
        .put(PHONES_NAME, phonesName())
        // The address, never a token: those are not in these preferences at
        // all (see TrailMate), for the same reason the MQTT password is
        // withheld above.
        .put(TRAILMATE_URL, trailmateUrl())
        .put(SLEEP_MIN, prefs.getInt(SLEEP_MIN, 5))
        .put(CLOCK_24, clock24())
        .put(BRIGHTNESS, prefs.getString(BRIGHTNESS, "normal"))
        .put(KEEP_AWAKE, keepAwake())

    /**
     * Save one value, typed by what the key expects rather than by what
     * JavaScript happened to send. A WebView bridge hands everything over as a
     * string, and `getInt` on a key written as a String throws at read time —
     * a long way from the settings screen that caused it.
     */
    fun set(key: String, value: String) {
        val e = prefs.edit()
        when (key) {
            ALLOW_GUEST, HA_ENABLED, MQTT_TLS,
            CLOCK_24, KEEP_AWAKE ->
                e.putBoolean(key, value == "true" || value == "1")

            MQTT_PORT, WARMUP_MIN, COOLDOWN_MIN, OPEN_LAP_MIN, SLEEP_MIN ->
                e.putInt(key, value.toIntOrNull() ?: 0)

            WARMUP_KPH ->
                e.putFloat(key, value.toFloatOrNull() ?: 2.0f)

            else -> e.putString(key, value)
        }
        e.apply()
    }

    /** Settings only. People, totals, history and the belt calibration are not touched. */
    fun resetSettings() {
        val keep = prefs.getString(PEOPLE, null)
        val belt = prefs.getString(BELT_CAL, null)
        prefs.edit().clear()
            .putString(PEOPLE, keep)
            .putString(BELT_CAL, belt)
            .apply()
    }
}
