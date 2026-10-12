package dev.stride.hud

import android.content.Context
import android.os.SystemClock
import java.util.UUID

/**
 * A Bluetooth chest strap, read directly by the console.
 *
 * The board has a pulse field, and on machines that wire contact grips into
 * it the number is real, but it costs both hands on the bar — so on a hill,
 * exactly when the number is worth having, it is not there. Plenty of machines
 * have no grips at all, including the C 1750 this was built on, where the field
 * sits at zero through an entire walk. A strap reads continuously, does not
 * care what your arms are doing, and is the only source that works everywhere.
 *
 * **Standard service, no brand support.** `0x180D` and `0x2A37` are the
 * Bluetooth SIG's Heart Rate Service and Measurement characteristic, and every
 * strap worth buying implements them — Polar, Garmin, Wahoo, Coospo, the lot.
 * A Garmin watch's "broadcast heart rate" is this same service. Scanning
 * filters on the service UUID rather than on names, so the list is "straps",
 * not "Bluetooth devices near a treadmill", and a strap nobody has heard of
 * works on the day it is unboxed.
 *
 * Holding the link is [BleSensor]'s job; this class only reads the beats.
 */
class HeartRate(
    context: Context,
    busy: () -> Boolean = { false },
) : BleSensor(context, "hr", "Heart rate strap", listOf(SERVICE), busy) {

    companion object {
        val SERVICE: UUID = uuid16(0x180D)
        val MEASUREMENT: UUID = uuid16(0x2A37)
    }

    override val subscriptions = listOf(SERVICE to MEASUREMENT)

    @Volatile private var lastBpm = 0
    @Volatile private var lastAt = 0L

    /** The current pulse, or 0 if there has not been one recently. */
    fun bpm(): Int = if (lastBpm > 0 && fresh(lastAt)) lastBpm else 0

    override fun clearReadings() {
        lastBpm = 0
    }

    override fun onNotify(characteristic: UUID, data: ByteArray) {
        if (characteristic == MEASUREMENT) parse(data)
    }

    /**
     * Decode a Heart Rate Measurement.
     *
     * Byte 0 is flags; bit 0 says whether the value that follows is one byte or
     * two. Most straps send one, some send two, and reading a two-byte strap as
     * one byte gives a plausible-looking wrong number rather than an obvious
     * failure — which is why this reads the flag rather than assuming.
     */
    private fun parse(data: ByteArray) {
        if (data.isEmpty()) return
        val wide = (data[0].toInt() and 0x01) != 0
        val bpm = if (wide) {
            if (data.size < 3) return
            (data[1].toInt() and 0xFF) or ((data[2].toInt() and 0xFF) shl 8)
        } else {
            if (data.size < 2) return
            data[1].toInt() and 0xFF
        }
        // A strap that has just been put on, or has lost skin contact, reports
        // zero. That is "no reading", not a heart that has stopped.
        if (bpm <= 0 || bpm > 250) return
        // One line, once, when a strap starts reading: the difference between
        // "subscribed" and "actually delivering" is the whole feature.
        if (lastBpm == 0) log("reading $bpm bpm")
        lastBpm = bpm
        lastAt = SystemClock.elapsedRealtime()
    }
}
