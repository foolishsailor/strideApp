package dev.stride.hud

import org.junit.Assert.assertEquals
import org.junit.Test

class PodWindowTest {

    private val w = PodWindow(settleMs = 6_000, windowMs = 20_000)

    @Test
    fun `nothing counts until the belt has settled at the speed`() {
        w.add(0, 10.0, 10.5, steady = true)
        w.add(5_000, 10.0, 10.5, steady = true)
        assertEquals(0.0, w.kph, 0.0)
        w.add(6_000, 10.0, 10.5, steady = true)
        w.add(16_000, 10.0, 10.3, steady = true)
        assertEquals(10.4, w.kph, 1e-9)
        assertEquals(10.0, w.secs, 1e-9)
    }

    @Test
    fun `a change of speed starts it again`() {
        w.add(0, 10.0, 10.5, steady = true)
        w.add(10_000, 10.0, 10.5, steady = true)
        w.add(11_000, 11.0, 11.5, steady = true)
        assertEquals(0.0, w.kph, 0.0)
    }

    @Test
    fun `a missed reading is skipped, a ramp is not steady`() {
        w.add(0, 10.0, 10.5, steady = true)
        w.add(6_000, 10.0, 10.5, steady = true)
        w.add(7_000, 10.0, 0.0, steady = true)
        assertEquals(10.5, w.kph, 1e-9)
        w.add(8_000, 10.0, 10.5, steady = false)
        assertEquals(0.0, w.kph, 0.0)
    }

    @Test
    fun `only the last window counts`() {
        w.add(0, 10.0, 9.0, steady = true)
        w.add(6_000, 10.0, 9.0, steady = true)
        w.add(30_000, 10.0, 11.0, steady = true)
        assertEquals(11.0, w.kph, 1e-9)
    }
}
