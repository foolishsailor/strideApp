package dev.stride.hud

import org.junit.Assert.assertArrayEquals
import org.junit.Test

/** The fan on a Gen 7 board: FAN_STATE (129) takes a level as a float, the
 *  way every FitPro 2 write does (docs/journal/gen7-fitpro2-notes.md). */
class FitPro2FanTest {

    @Test
    fun `a fan level goes out as feature 129 with the level as a float`() {
        val bits = java.lang.Float.floatToIntBits(2f) // MEDIUM
        val expected = byteArrayOf(
            FitPro2.CHANNEL, FitPro2.Req.WRITE.toByte(), 6,
            0x81.toByte(), 0x00,
            bits.toByte(), (bits shr 8).toByte(), (bits shr 16).toByte(), (bits shr 24).toByte(),
            0,
        )
        assertArrayEquals(expected, FitPro2.write(FitPro2.Id.FAN_STATE, 2f))
    }
}
