package dev.stride.hud

import org.junit.Assert.assertEquals
import org.junit.Test

class DeclineLimitTest {
    @Test fun `steep decline holds the speed under 6 mph`() {
        assertEquals(9.6, DeclineLimit.cap(9.9, -6.0, -6.0), 0.0)
    }

    @Test fun `heading onto the decline caps it before the deck gets there`() {
        assertEquals(9.6, DeclineLimit.cap(11.0, -2.0, -6.0), 0.0)
    }

    @Test fun `gentle declines and flats are left alone`() {
        assertEquals(10.9, DeclineLimit.cap(10.9, -4.5, -4.5), 0.0)
        assertEquals(12.0, DeclineLimit.cap(12.0, 0.0, 2.0), 0.0)
    }

    @Test fun `a slower speed is never raised`() {
        assertEquals(8.0, DeclineLimit.cap(8.0, -8.0, -8.0), 0.0)
    }
}
