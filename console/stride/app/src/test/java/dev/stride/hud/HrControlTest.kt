package dev.stride.hud

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

class HrControlTest {

    private val zone2 = HrBand(119, 138)

    /**
     * Ten minutes of a zone-2 step against [SimHeart], read with ±2 bpm of
     * noise: when the heart rate first stays in range for a minute, and the
     * worst it went over. With the fixture zones, a resting offset of 30 is a
     * runner whose heart matches their zones; 45–50 is one running 15–20 bpm
     * hot (heat, tiredness).
     */
    private fun run(tuning: HrControl.Tuning, offset: Int, startBpm: Double = 95.0): Run {
        val c = HrControl.forStep(zone2, 2, Fixtures.zones, Fixtures.limits, 6.0, 0L, tuning)
        val heart = SimHeart(restingBpm = offset.toDouble(), startBpm = startBpm)
        var inSince: Int? = null
        var settled: Int? = null
        var worst = 0.0
        for (t in 0..600) {
            val d = c.update(t * 1000L, (heart.bpm + 2 * Math.sin(t / 7.0)).toInt())
            heart.step(d.speedKph, 0.0, 1.0)
            val bpm = heart.bpm
            if (t > 30) worst = maxOf(worst, bpm - zone2.maxBpm)
            if (bpm >= zone2.minBpm && bpm <= zone2.maxBpm) {
                if (inSince == null) inSince = t
                if (settled == null && t - inSince >= 60) settled = inSince
            } else inSince = null
        }
        return Run(settled, worst)
    }

    private data class Run(val settledByS: Int?, val worstOverBpm: Double)

    /** US5's test, over runners whose heart matches their zones to within 10 bpm. */
    private fun meetsUs5(tuning: HrControl.Tuning) = (20..40 step 5).all { off ->
        val r = run(tuning, off)
        r.settledByS != null && r.settledByS <= 300 && r.worstOverBpm <= 5.0
    }

    @Test fun `a zone-2 step settles inside five minutes without overshooting more than 5 bpm`() {
        for (off in 20..40 step 5) {
            val r = run(HrControl.Tuning(), off)
            assertTrue("offset $off: never settled", r.settledByS != null)
            assertTrue("offset $off: settled at ${r.settledByS} s", r.settledByS!! <= 300)
            assertTrue("offset $off: overshot by ${r.worstOverBpm} bpm", r.worstOverBpm <= 5.0)
        }
    }

    @Test fun `from a standing start it waits for the climbing heart rather than chasing it`() {
        for (off in 20..40 step 5) {
            val r = run(HrControl.Tuning(), off, startBpm = 70.0)
            assertTrue("offset $off: settled at ${r.settledByS}", r.settledByS != null && r.settledByS <= 300)
            assertTrue("offset $off: overshot by ${r.worstOverBpm} bpm", r.worstOverBpm <= 5.0)
        }
    }

    @Test fun `a heart running 20 bpm hot still settles, without tripping the drop`() {
        for (off in listOf(45, 50)) {
            val r = run(HrControl.Tuning(), off)
            assertTrue("offset $off: settled at ${r.settledByS}", r.settledByS != null && r.settledByS <= 300)
            assertTrue("offset $off: overshot by ${r.worstOverBpm}", r.worstOverBpm < HrControl.Tuning().dropOverBpm)
        }
    }

    @Test fun `the same check fails a controller that ignores the lag`() {
        // Planted: no settling time, ten times the gain, a change every second.
        assertFalse(meetsUs5(HrControl.Tuning(settleMs = 0, everyMs = 1_000,
            gainKphPerBpm = 0.5, maxStepKph = 3.0)))
    }

    @Test fun `nothing changes while the heart rate settles`() {
        val c = HrControl.forStep(zone2, 2, Fixtures.zones, Fixtures.limits, 6.0, 0L)
        val start = c.speedKph
        val d = c.update(44_000, 100)
        assertEquals(HrControl.State.SETTLING, d.state)
        assertEquals(start, d.speedKph, 0.0)
    }

    @Test fun `far over the range drops at once to the bottom of the pace band`() {
        val c = HrControl.forStep(zone2, 2, Fixtures.zones, Fixtures.limits, 6.0, 0L)
        val d = c.update(5_000, 160)
        assertEquals(HrControl.State.DROPPING, d.state)
        assertEquals(Fixtures.zones.pace.getValue(2).minKph, d.speedKph, 1e-9)
    }

    @Test fun `past the runner's maximum drops at once`() {
        val c = HrControl.forStep(HrBand(172, 200), null, Fixtures.zones, Fixtures.limits, 12.0, 0L)
        assertEquals(HrControl.State.DROPPING, c.update(1_000, 190).state)
    }

    @Test fun `no heart rate holds the speed`() {
        val c = HrControl.forStep(zone2, 2, Fixtures.zones, Fixtures.limits, 6.0, 0L)
        val start = c.speedKph
        val d = c.update(120_000, 0)
        assertEquals(HrControl.State.NO_HR, d.state)
        assertEquals(start, d.speedKph, 0.0)
    }

    @Test fun `changes come no more often than every 20 s`() {
        val c = HrControl.forStep(zone2, 2, Fixtures.zones, Fixtures.limits, 6.0, 0L)
        val a = c.update(46_000, 100).speedKph
        val b = c.update(60_000, 100).speedKph
        val e = c.update(67_000, 100).speedKph
        assertEquals(a, b, 0.0)
        assertTrue(e > b)
    }

    @Test fun `without zones it starts from the current speed, within the limits`() {
        val c = HrControl.forStep(zone2, 2, Zones.NONE, SpeedLimits(1.5, 9.0), 12.0, 0L)
        assertEquals(9.0, c.speedKph, 0.0)
    }
}
