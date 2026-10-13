package dev.stride.hud

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

class WorkoutRunnerTest {

    private val workout = WorkoutJson.parse(Fixtures.intervals)!!

    private fun runner(onStep: (Int, Workout.Step) -> Unit = { _, _ -> }) =
        WorkoutRunner(workout, Fixtures.zones, Fixtures.limits, fallbackKph = 6.0, onStep = onStep)

    private fun at(s: Double, m: Double = 0.0, bpm: Int = 0, kph: Double = 8.0) =
        WorkoutRunner.Progress(s, m, bpm, (s * 1000).toLong(), kph)

    @Test fun `a pace step drives the belt to the middle of its range`() {
        val r = runner()
        val c = r.tick(at(0.0))
        assertEquals(0, r.index)
        assertEquals((2.5 + 2.78) / 2 * 3.6, c.speedKph!!, 1e-9)
        assertNull(c.incline)
    }

    @Test fun `time steps end on moving time, distance steps on belt distance`() {
        val r = runner()
        r.tick(at(0.0))
        r.tick(at(600.0, 1800.0))
        assertEquals(1, r.index)
        assertEquals(1.0, r.tick(at(700.0, 2100.0)).incline)
        r.tick(at(780.0, 2400.0))
        assertEquals(2, r.index)
        r.tick(at(860.0, 2599.0))
        assertEquals(2, r.index)
        r.tick(at(870.0, 2600.0))
        assertEquals(3, r.index)
    }

    @Test fun `a step with no target leaves the speed alone`() {
        val r = runner()
        r.tick(at(0.0)); r.tick(at(600.0, 1800.0)); r.tick(at(780.0, 2400.0))
        assertNull(r.tick(at(790.0, 2420.0)).speedKph)
    }

    @Test fun `a hand on the speed keeps it until the next step`() {
        val r = runner()
        r.tick(at(0.0))
        r.speedTakenOver()
        assertNull(r.tick(at(10.0)).speedKph)
        assertTrue(r.tick(at(600.0, 1800.0)).speedKph != null)
    }

    @Test fun `AUTO hands the speed back before the next step`() {
        val r = runner()
        r.tick(at(0.0))
        r.speedTakenOver()
        assertNull(r.tick(at(10.0)).speedKph)
        r.speedBackToAuto(at(20.0))
        assertTrue(r.speedAuto)
        assertEquals((2.5 + 2.78) / 2 * 3.6, r.tick(at(21.0)).speedKph!!, 1e-9)
    }

    @Test fun `a hand on the incline keeps it until the next step`() {
        val r = runner()
        r.tick(at(0.0)); r.tick(at(600.0, 1800.0))
        r.inclineTakenOver()
        assertNull(r.tick(at(610.0, 1830.0)).incline)
    }

    @Test fun `an open step waits for NEXT, and NEXT on the last step finishes`() {
        val r = runner()
        r.tick(at(0.0)); r.tick(at(600.0, 1800.0)); r.tick(at(780.0, 2400.0))
        r.tick(at(870.0, 2600.0)); r.tick(at(1050.0, 3100.0))
        assertEquals(4, r.index)
        r.tick(at(5000.0, 9000.0))
        assertFalse(r.finished)
        assertNull(r.left(at(5000.0)))
        r.next(at(5001.0))
        assertTrue(r.finished)
    }

    @Test fun `what is left is seconds or metres`() {
        val r = runner()
        r.tick(at(0.0))
        assertEquals(400.0 to false, r.left(at(200.0)))
        r.tick(at(600.0, 1800.0)); r.tick(at(780.0, 2400.0))
        assertEquals(150.0 to true, r.left(at(800.0, 2450.0)))
    }

    @Test fun `each step is announced once, in order`() {
        val seen = ArrayList<Int>()
        val r = runner { i, _ -> seen += i }
        r.tick(at(0.0)); r.tick(at(1.0)); r.tick(at(600.0, 1800.0))
        assertEquals(listOf(0, 1), seen)
    }

    @Test fun `the profile spans every step, carrying incline forward`() {
        val p = runner().profile()
        assertEquals(5, p.size)
        assertEquals(0.0, p[0].startSec, 0.0)
        assertEquals(p[0].endSec, p[1].startSec, 0.0)
        assertEquals(1.0, p[2].incline, 0.0)   // recovery sets none: carries the interval's 1 %
        assertEquals(0.0, p[4].incline, 0.0)
    }

    @Test fun `a heart-rate step starts at the slow end of the matching pace zone`() {
        val r = runner()
        r.tick(at(0.0)); r.tick(at(600.0, 1800.0)); r.tick(at(780.0, 2400.0))
        val c = r.tick(at(870.0, 2600.0, bpm = 125))
        assertEquals(Fixtures.zones.pace.getValue(2).minKph, c.speedKph!!, 1e-9)
    }

    @Test fun `driven speeds are held to the runner's limits`() {
        val capped = WorkoutRunner(workout, Fixtures.zones, SpeedLimits(1.5, 9.0), 6.0)
        capped.tick(at(0.0)); val c = capped.tick(at(600.0, 1800.0))
        assertEquals(9.0, c.speedKph!!, 0.0)
    }
}
