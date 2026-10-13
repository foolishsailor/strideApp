package dev.stride.hud

import org.junit.Assert.assertArrayEquals
import org.junit.Assert.assertEquals
import org.junit.Test

/** 13 Oct 2026: a 13.7-mile run read 6.98, because the board restarts its
 *  counters when a paused workout resumes. */
class RunTotalsTest {

    @Test
    fun `a counter that restarts on resume costs the run nothing`() {
        // Poll by poll: 4,000 m run, pause, the board restarts at 0, 3,000 m more.
        val odometer = listOf(0.0, 1.0, 2.0, 4000.0, 4000.0, 0.0, 1.0, 3000.0)
        var last = odometer.first()
        var run = 0.0
        for (now in odometer.drop(1)) {
            run += RunTotals.counterStep(now, last, max = 5000.0)
            last = now
        }
        assertEquals(7000.0, run, 1e-9)
    }

    @Test
    fun `a jump no runner could make is a glitch, not distance`() {
        assertEquals(0.0, RunTotals.counterStep(9000.0, 10.0, RunTotals.MAX_ODOMETER_STEP_M), 0.0)
        assertEquals(1.2, RunTotals.counterStep(11.2, 10.0, RunTotals.MAX_ODOMETER_STEP_M), 1e-9)
    }

    @Test
    fun `distance is built from each second's speed, and a pause credits nothing`() {
        // 3 m/s for 3 s, a 60 s pause, then 2 m/s for 2 s.
        val t = longArrayOf(0, 1, 2, 3, 63, 64, 65)
        val v = doubleArrayOf(3.0, 3.0, 3.0, 3.0, 2.0, 2.0, 2.0)
        assertArrayEquals(doubleArrayOf(0.0, 3.0, 6.0, 9.0, 9.0, 11.0, 13.0), RunTotals.distanceFromSpeeds(t, v), 1e-9)
    }

    @Test
    fun `calories add up across the board's restarts`() {
        // As recorded on 13 Oct: 435, back to 0, 651, back to 0, 1148.
        val kcal = listOf(0L, 200L, 435L, 0L, 300L, 651L, 0L, 600L, 1148L)
        assertEquals(435L + 651L + 1148L, RunTotals.resettingCounterTotal(kcal))
    }
}
