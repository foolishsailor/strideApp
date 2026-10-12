package dev.stride.hud

import android.os.SystemClock
import android.util.Log

/**
 * A FitPro 2 board in software, for testing without a belt. Debug builds only.
 *
 * It speaks the real wire format — FitPro2Board talks to it exactly as it
 * talks to the X22i, through FitProConnection — so everything above the USB
 * pipe is exercised: the FitPro 2 translation, the safety logic, metrics, the
 * hill drawing, guided walks, FTMS and Home Assistant.
 *
 * It behaves the way the X22i was measured to behave (protocol/FITPRO2_PROTOCOL.md):
 * no speed under ~1.5 km/h; an idle board refuses a target speed; PAUSED stops
 * the belt; the belt reading freezes rather than reporting 0; the latest frame
 * repeats every ~1.5 s, errors included; the safety key is SYSTEM_MODE 2; and
 * letting go of the board stops the belt while the state still says RUNNING.
 * Where the real board is unknown, this is a guess, and says so.
 *
 * Driven from the PC by tools/sim.py. See docs/TEST_HARNESS.md.
 */
class SimBoard {

    companion object {
        const val TAG = "StrideSim"

        const val MIN_KPH = 1.499f
        const val MAX_KPH = 20f
        const val MIN_GRADE = -6f
        const val MAX_GRADE = 40f

        /** The 61 features the X22i advertises, in its own order. */
        val FEATURES = intArrayOf(
            10, 102, 103, 105, 106, 109, 111, 113, 114, 129, 140, 150, 161, 202, 203, 204,
            205, 222, 223, 227, 228, 252, 253, 254, 255, 256, 265, 266, 267, 301, 302, 303,
            304, 307, 308, 401, 402, 403, 404, 407, 408, 411, 412, 415, 416, 602, 603, 604,
            605, 610, 615, 617, 618, 619, 621, 622, 623, 625, 2108, 2132, 2133,
        )

        /** Belt and deck rates. Guesses at the X22i's, close enough to watch. */
        const val ACCEL_KPH_S = 1.5f
        const val DECEL_KPH_S = 2.0f
        const val GRADE_PCT_S = 0.6f

        /** The X22i's belt reading stops changing below about this, after a stop. */
        const val FREEZE_BELOW_KPH = 1.8f

        const val REPEAT_MS = 1500L
        const val WEIGHT_KG = 75.0
    }

    private val v = HashMap<Int, Float>()
    private val subs = LinkedHashSet<Int>()
    private val out = ArrayDeque<ByteArray>()
    private var lastFrame: ByteArray? = null
    private var lastSentMs = 0L
    private var lastTickMs = 0L

    /** The belt as it really is; CURRENT_KPH is what the board admits to. */
    private var beltKph = 0f
    private var distanceM = 0.0
    private var runningS = 0.0
    private var kcal = 0.0
    private var lastWholeSecond = -1L
    /** Let go of by the host: the belt stops, the state does not say so. */
    private var released = false
    @Volatile var pulseOn = false

    init {
        for (id in FEATURES) v[id] = 0f
        v[FitPro2.Id.SYSTEM_MODE] = FitPro2.SystemMode.IDLE.toFloat()
        v[FitPro2.Id.MIN_KPH] = MIN_KPH
        v[FitPro2.Id.MAX_KPH] = MAX_KPH
        v[FitPro2.Id.MIN_GRADE] = MIN_GRADE
        v[FitPro2.Id.MAX_GRADE] = MAX_GRADE
        v[10] = 5f   // DEVICE_TYPE: incline trainer
    }

    // ---- the host side: what FitProConnection calls ------------------------

    /** The host opened the board. A fresh subscription starts empty. */
    @Synchronized fun attached() {
        released = false
        subs.clear()
        out.clear()
        lastTickMs = SystemClock.elapsedRealtime()
        Log.i(TAG, "sim: host attached")
    }

    /** The host let go — closed, crashed, or the watchdog. The belt stops at once. */
    @Synchronized fun released() {
        released = true
        beltKph = 0f
        subs.clear()
        Log.i(TAG, "sim: host released — belt stopped, state left at ${state()}")
    }

    @Synchronized fun fromHost(f: ByteArray) {
        tick()
        if (f.size < 3 || f[0] != FitPro2.CHANNEL) {
            Log.w(TAG, "sim: ignoring a frame on channel ${f.getOrNull(0)} — a real board might not: ${FitPro.hex(f)}")
            return
        }
        val type = f[1].toInt() and 0x0F
        val len = (f[2].toInt() and 0xFF).coerceAtMost(f.size - 3)
        val p = f.copyOfRange(3, 3 + len)
        when (type) {
            FitPro2.Req.EXTENDED -> if (p.isNotEmpty() && p[0] == FitPro2.INFO_PRODUCT) productInfo()
            FitPro2.Req.SUPPORTED_FEATURES -> features()
            FitPro2.Req.SUBSCRIBE -> {
                val ids = (0 until p.size / 2).map { FitPro2.u16(p, 2 * it) }
                subs.addAll(ids)
                send(byteArrayOf(2, 0x13, 1, 0x01))
                ids.forEach { emit(it) }
            }
            FitPro2.Req.WRITE -> if (p.size >= 6) write(FitPro2.u16(p, 0), FitPro2.f32(p, 2))
            else -> {
                Log.w(TAG, "sim: request type $type is not one a board accepts")
                send(byteArrayOf(2, 0x14, 2, f[1], 6))
            }
        }
    }

    /**
     * The next frame for the host, or null after [timeoutMs] — like a USB read.
     * Sleeps outside the lock, so control commands are never held up by it.
     */
    fun toHost(timeoutMs: Int): ByteArray? {
        val until = SystemClock.elapsedRealtime() + timeoutMs
        while (true) {
            synchronized(this) {
                tick()
                out.removeFirstOrNull()?.let { lastSentMs = SystemClock.elapsedRealtime(); return it }
                // The X22i repeats its latest frame when it has nothing new.
                val last = lastFrame
                if (last != null && !released && SystemClock.elapsedRealtime() - lastSentMs >= REPEAT_MS) {
                    lastSentMs = SystemClock.elapsedRealtime()
                    return last
                }
            }
            val left = until - SystemClock.elapsedRealtime()
            if (left <= 0) return null
            Thread.sleep(minOf(left, 20L))
        }
    }

    // ---- the PC side: what tools/sim.py drives -----------------------------

    /** Pull or replace the safety key. Out stops the belt, as the hardware does. */
    @Synchronized fun key(out: Boolean) {
        tick()
        if (out) {
            beltKph = 0f
            set(FitPro2.Id.SYSTEM_MODE, FitPro2.SystemMode.DMK.toFloat())
            if (running()) set(FitPro2.Id.WORKOUT_STATE, FitPro2.WorkoutState.PAUSED.toFloat())
        } else {
            val ws = state()
            set(FitPro2.Id.SYSTEM_MODE,
                (if (ws == FitPro2.WorkoutState.NONE) FitPro2.SystemMode.IDLE else FitPro2.SystemMode.WORKOUT).toFloat())
        }
        Log.i(TAG, "sim: safety key ${if (out) "out" else "in"}")
    }

    /**
     * A press of one of the console's own buttons: the board changes its own
     * target and reports it, the way the HUD's "follow the board" path sees a
     * physical press. Steps are guesses at the X22i's.
     */
    @Synchronized fun press(button: String) {
        tick()
        val code = when (button) {
            "speed_up" -> { if (running()) stepTarget(FitPro2.Id.TARGET_KPH, +0.1f, MIN_KPH, MAX_KPH); 3 }
            "speed_down" -> { if (running()) stepTarget(FitPro2.Id.TARGET_KPH, -0.1f, MIN_KPH, MAX_KPH); 4 }
            "incline_up" -> { stepTarget(FitPro2.Id.TARGET_GRADE, +0.5f, MIN_GRADE, MAX_GRADE); 5 }
            "incline_down" -> { stepTarget(FitPro2.Id.TARGET_GRADE, -0.5f, MIN_GRADE, MAX_GRADE); 6 }
            "stop" -> { if (running()) set(FitPro2.Id.WORKOUT_STATE, FitPro2.WorkoutState.PAUSED.toFloat()); 1 }
            "start" -> { if (state() == FitPro2.WorkoutState.NONE) set(FitPro2.Id.WORKOUT_STATE,
                FitPro2.WorkoutState.READY_TO_START.toFloat()); 2 }
            else -> { Log.w(TAG, "sim: no such button '$button'"); return }
        }
        set(FitPro2.Id.KEY_COOKED, code.toFloat())
        set(FitPro2.Id.KEY_COOKED, 0f)
        Log.i(TAG, "sim: pressed $button")
    }

    @Synchronized fun status(): String {
        tick()
        return "state=${state()} mode=${v[FitPro2.Id.SYSTEM_MODE]?.toInt()} " +
            "belt=${"%.2f".format(beltKph)} (reports ${"%.2f".format(v[FitPro2.Id.CURRENT_KPH])}) " +
            "target=${"%.2f".format(v[FitPro2.Id.TARGET_KPH])} " +
            "grade=${"%.1f".format(v[FitPro2.Id.CURRENT_GRADE])}→${"%.1f".format(v[FitPro2.Id.TARGET_GRADE])} " +
            "dist=${"%.0f".format(distanceM)} m time=${"%.0f".format(runningS)} s kcal=${"%.1f".format(kcal)} " +
            "released=$released subs=${subs.size}"
    }

    // ---- the board ----------------------------------------------------------

    private fun state() = v[FitPro2.Id.WORKOUT_STATE]?.toInt() ?: 0

    private fun running(): Boolean {
        val s = state()
        return s == FitPro2.WorkoutState.RUNNING || s == FitPro2.WorkoutState.WARM_UP ||
            s == FitPro2.WorkoutState.COOL_DOWN
    }

    private fun write(id: Int, value: Float) {
        val mode = v[FitPro2.Id.SYSTEM_MODE]?.toInt()
        val refused: Int? = when {
            mode == FitPro2.SystemMode.DMK -> 7                                  // key out: not allowed
            id == FitPro2.Id.TARGET_KPH && !running() -> 5                      // idle board: out of range
            id == FitPro2.Id.TARGET_KPH && (value < MIN_KPH || value > MAX_KPH) -> 5
            id == FitPro2.Id.TARGET_GRADE && (value < MIN_GRADE || value > MAX_GRADE) -> 5
            id == FitPro2.Id.WORKOUT_STATE && value.toInt() !in 0..7 -> 5
            id !in FitPro2.WRITABLE -> 4
            else -> null
        }
        if (refused != null) {
            // The X22i reports the value it holds, not the one refused — 0.0
            // for a target speed written to an idle board.
            val held = if (refused == 7) -1f else v[id] ?: 0f
            send(error(refused, id, held))
            Log.i(TAG, "sim: refused write $id=$value (${FitPro2.errorName(refused)})")
            return
        }
        send(byteArrayOf(2, 0x13, 1, 0x02))
        when (id) {
            FitPro2.Id.WORKOUT_STATE -> {
                val to = value.toInt()
                set(id, value)
                set(FitPro2.Id.SYSTEM_MODE, (if (to == FitPro2.WorkoutState.NONE)
                    FitPro2.SystemMode.IDLE else FitPro2.SystemMode.WORKOUT).toFloat())
                if (to == FitPro2.WorkoutState.RUNNING) released = false
            }
            else -> set(id, value)
        }
    }

    /** Advance the belt, the deck and the counters to now. */
    private fun tick() {
        val now = SystemClock.elapsedRealtime()
        if (lastTickMs == 0L) lastTickMs = now
        val dt = ((now - lastTickMs) / 1000.0).coerceAtMost(1.0).toFloat()
        lastTickMs = now
        if (dt <= 0f) return

        val keyOut = v[FitPro2.Id.SYSTEM_MODE]?.toInt() == FitPro2.SystemMode.DMK
        val driven = running() && !keyOut && !released
        val goal = if (driven) v[FitPro2.Id.TARGET_KPH] ?: 0f else 0f
        beltKph = if (beltKph < goal) minOf(goal, beltKph + ACCEL_KPH_S * dt)
                  else maxOf(goal, beltKph - DECEL_KPH_S * dt)
        // What the board admits to: the real belt while driven, and on the way
        // down, until it freezes — the X22i never reports a stopped belt as 0.
        val shown = v[FitPro2.Id.CURRENT_KPH] ?: 0f
        if (driven || beltKph >= FREEZE_BELOW_KPH) {
            if (Math.abs(beltKph - shown) >= 0.02f) set(FitPro2.Id.CURRENT_KPH, beltKph)
        }

        if (!keyOut) {
            val tg = v[FitPro2.Id.TARGET_GRADE] ?: 0f
            val g = v[FitPro2.Id.CURRENT_GRADE] ?: 0f
            if (g != tg) set(FitPro2.Id.CURRENT_GRADE,
                if (g < tg) minOf(tg, g + GRADE_PCT_S * dt) else maxOf(tg, g - GRADE_PCT_S * dt))
        }

        val ms = beltKph / 3.6
        distanceM += ms * dt
        if (state() == FitPro2.WorkoutState.RUNNING) runningS += dt
        // ACSM walking equation, ml/kg/min → kcal.
        val mMin = ms * 60.0
        val grade = (v[FitPro2.Id.CURRENT_GRADE] ?: 0f) / 100.0
        val vo2 = 3.5 + 0.1 * mMin + 1.8 * mMin * maxOf(0.0, grade)
        if (beltKph > 0f) kcal += vo2 * WEIGHT_KG / 1000.0 * 5.0 / 60.0 * dt

        // Counters go out once a second, the way slow fields do.
        val second = now / 1000
        if (second != lastWholeSecond) {
            lastWholeSecond = second
            set(FitPro2.Id.DISTANCE, distanceM.toFloat())
            set(FitPro2.Id.RUNNING_TIME, Math.floor(runningS).toFloat())
            set(FitPro2.Id.CURRENT_CALORIES, kcal.toFloat())
            val pulse = if (pulseOn && beltKph > 0f) (68 + 7 * beltKph + 1.6f * (grade * 100).toFloat()) else 0f
            set(FitPro2.Id.PULSE, Math.round(pulse).toFloat())
        }
    }

    private fun stepTarget(id: Int, by: Float, lo: Float, hi: Float) =
        set(id, ((v[id] ?: 0f) + by).coerceIn(lo, hi))

    /** Change a value, and tell the host if it is listening and it changed. */
    private fun set(id: Int, value: Float) {
        if (v[id] == value) return
        v[id] = value
        emit(id)
    }

    private fun emit(id: Int) {
        if (id !in subs || released) return
        val bits = java.lang.Float.floatToIntBits(v[id] ?: 0f)
        send(byteArrayOf(2, 0x15, 6, id.toByte(), (id shr 8).toByte(),
            bits.toByte(), (bits shr 8).toByte(), (bits shr 16).toByte(), (bits shr 24).toByte()))
    }

    private fun error(code: Int, id: Int, value: Float): ByteArray {
        val bits = java.lang.Float.floatToIntBits(value)
        return byteArrayOf(2, 0x14, 8, 0x02, code.toByte(), id.toByte(), (id shr 8).toByte(),
            bits.toByte(), (bits shr 8).toByte(), (bits shr 16).toByte(), (bits shr 24).toByte())
    }

    private fun send(f: ByteArray) {
        out.addLast(f)
        lastFrame = f
    }

    private fun productInfo() {
        val items = listOf(1 to "1.19-sim", 2 to "SIM", 3 to "SIM", 4 to "SIM-X22I", 5 to "SIM-0000", 6 to "Tablet")
        for ((item, text) in items) {
            val b = text.toByteArray(Charsets.US_ASCII)
            send(byteArrayOf(2, 0x1E, (2 + b.size).toByte(), FitPro2.INFO_PRODUCT, item.toByte()) + b)
        }
        send(byteArrayOf(2, 0x1E, 2, FitPro2.INFO_PRODUCT, 0))
    }

    private fun features() {
        for (chunk in FEATURES.toList().chunked(8)) {
            val p = ByteArray(chunk.size * 2)
            chunk.forEachIndexed { i, id -> p[2 * i] = id.toByte(); p[2 * i + 1] = (id shr 8).toByte() }
            send(byteArrayOf(2, 0x11, p.size.toByte()) + p)
        }
        send(byteArrayOf(2, 0x11, 0))
    }
}
