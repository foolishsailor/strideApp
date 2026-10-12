package dev.stride.hud

import android.content.Context
import android.os.SystemClock
import java.util.UUID

/**
 * A Bluetooth foot pod — a Stryd, or any pod that speaks the standard
 * services — read directly by the console.
 *
 * **Why the pod and not the watch.** A Garmin's "broadcast" mode sends heart
 * rate and nothing else (see [HeartRate]); the cadence, power and stride its
 * screen shows come from a pod or strap paired to the watch, and the watch
 * does not pass them on. So the console goes to the pod itself, the same way
 * the watch does.
 *
 * **Standard services, no brand support.** Two Bluetooth SIG services carry
 * everything shown here:
 *  - Running Speed and Cadence (`0x1814`), measurement `0x2A53`: speed,
 *    cadence and, if the pod sends it, stride length.
 *  - Cycling Power (`0x1818`), measurement `0x2A63`: power in watts. It was
 *    written for bikes; Stryd and other running power meters reuse it, and
 *    every watch and app reads running power from it.
 * A pod that has only one of them still works for that half. Stryd's form
 * metrics (ground contact, vertical oscillation, leg spring stiffness) live in
 * its own private service and are not read.
 *
 * **One radio, one pod.** A pod takes a limited number of Bluetooth
 * connections. A Garmin usually holds a Stryd over ANT+, which leaves
 * Bluetooth free for this; a watch or phone holding it over Bluetooth may not.
 */
class Footpod(
    context: Context,
    busy: () -> Boolean = { false },
) : BleSensor(context, "pod", "Foot pod", listOf(RSC_SERVICE, POWER_SERVICE), busy) {

    companion object {
        val RSC_SERVICE: UUID = uuid16(0x1814)
        val RSC_MEASUREMENT: UUID = uuid16(0x2A53)
        val POWER_SERVICE: UUID = uuid16(0x1818)
        val POWER_MEASUREMENT: UUID = uuid16(0x2A63)

        /**
         * Steps per minute for each unit of RSC cadence.
         *
         * The specification says only "per minute", not per step or per
         * stride. Stryd's own app shows steps per minute, so this assumes the
         * pod sends the same, and the first reading is logged raw (`pod:
         * reading … spm`) so it can be checked against the app. If it comes in
         * at half — ~85 for what the app calls 170 — this is 2.
         */
        const val CADENCE_SCALE = 1
    }

    override val subscriptions = listOf(
        RSC_SERVICE to RSC_MEASUREMENT,
        POWER_SERVICE to POWER_MEASUREMENT,
    )

    @Volatile private var lastCadence = 0
    @Volatile private var lastSpeedMs = 0.0
    @Volatile private var lastStrideM = 0.0
    @Volatile private var rscAt = 0L
    @Volatile private var lastWatts = 0
    @Volatile private var powerAt = 0L

    /** Steps per minute, or 0 with no recent reading. */
    fun cadence(): Int = if (fresh(rscAt)) lastCadence else 0

    /** The pod's own speed, km/h, or 0. Beside the belt's, a check on both. */
    fun speedKph(): Double = if (fresh(rscAt)) lastSpeedMs * 3.6 else 0.0

    /**
     * Metres per step, or 0. The pod's own figure when it sends one,
     * otherwise worked out from its speed and cadence.
     */
    fun strideM(): Double {
        if (!fresh(rscAt)) return 0.0
        if (lastStrideM > 0.0) return lastStrideM
        return if (lastCadence > 0) lastSpeedMs * 60.0 / lastCadence else 0.0
    }

    /** Running power, watts, or 0. */
    fun watts(): Int = if (fresh(powerAt)) lastWatts else 0

    override fun clearReadings() {
        lastCadence = 0; lastSpeedMs = 0.0; lastStrideM = 0.0; rscAt = 0L
        lastWatts = 0; powerAt = 0L
    }

    override fun onNotify(characteristic: UUID, data: ByteArray) {
        when (characteristic) {
            RSC_MEASUREMENT -> parseRsc(data)
            POWER_MEASUREMENT -> parsePower(data)
        }
    }

    private fun u8(d: ByteArray, i: Int) = d[i].toInt() and 0xFF
    private fun u16(d: ByteArray, i: Int) = u8(d, i) or (u8(d, i + 1) shl 8)

    /**
     * RSC Measurement: flags (1), speed (2, 1/256 m/s), cadence (1, per
     * minute), then stride length (2, 1/100 m) if flag bit 0 is set. Total
     * distance (flag bit 1) may follow and is not used: the belt's own
     * odometer is the distance of record.
     */
    private fun parseRsc(d: ByteArray) {
        if (d.size < 4) return
        val flags = u8(d, 0)
        val speed = u16(d, 1) / 256.0
        val cadence = u8(d, 3) * CADENCE_SCALE
        val stride = if (flags and 0x01 != 0 && d.size >= 6) u16(d, 4) / 100.0 else 0.0
        if (rscAt == 0L) log("reading $cadence spm (raw ${u8(d, 3)}), ${"%.1f".format(speed * 3.6)} km/h")
        lastSpeedMs = speed
        lastCadence = cadence
        lastStrideM = stride
        rscAt = SystemClock.elapsedRealtime()
    }

    /** Cycling Power Measurement: flags (2), instantaneous power (2, signed W). */
    private fun parsePower(d: ByteArray) {
        if (d.size < 4) return
        val watts = (d[2].toInt() and 0xFF) or (d[3].toInt() shl 8)   // signed high byte
        if (watts < 0 || watts > 2_000) return
        if (powerAt == 0L) log("reading $watts W")
        lastWatts = watts
        powerAt = SystemClock.elapsedRealtime()
    }
}
