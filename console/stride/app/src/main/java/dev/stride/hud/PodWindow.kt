package dev.stride.hud

/**
 * The foot pod's average speed while the belt holds one speed, for "Sync to
 * pod" in the speed menu: the one-tap version of the calibration panel's
 * average (see MainActivity.calTick, which works the same way).
 *
 * A change of speed starts it again, and nothing is gathered until the belt
 * has had [settleMs] to get there. A missed reading is skipped, not a reason
 * to start again. Pure, so it is tested on the JVM.
 */
class PodWindow(private val settleMs: Long, private val windowMs: Long) {

    private val readings = ArrayDeque<Pair<Long, Double>>()
    private var speed = -1.0
    private var changedAt = 0L

    /** km/h, or 0 with nothing gathered. */
    var kph = 0.0
        private set

    /** Seconds of steady readings behind [kph]. */
    var secs = 0.0
        private set

    /**
     * One poll. [steady] says the belt is running at [targetKph] and not
     * ramping; [podKph] is 0 for no reading.
     */
    fun add(nowMs: Long, targetKph: Double, podKph: Double, steady: Boolean) {
        if (!steady || Math.abs(targetKph - speed) > 1e-6) {
            readings.clear()
            speed = if (steady) targetKph else -1.0
            changedAt = nowMs
        }
        if (steady && nowMs - changedAt >= settleMs && podKph > 0.0) readings.addLast(nowMs to podKph)
        while (readings.isNotEmpty() && nowMs - readings.first().first > windowMs) readings.removeFirst()
        kph = if (readings.isEmpty()) 0.0 else readings.sumOf { it.second } / readings.size
        secs = if (readings.isEmpty()) 0.0 else (nowMs - readings.first().first) / 1000.0
    }

    /** After the belt has been told to change: what was gathered no longer applies. */
    fun restart() {
        readings.clear()
        speed = -1.0
        kph = 0.0
        secs = 0.0
    }
}
