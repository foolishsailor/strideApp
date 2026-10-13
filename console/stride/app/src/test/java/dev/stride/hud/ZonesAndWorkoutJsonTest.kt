package dev.stride.hud

import org.json.JSONObject
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

class ZonesAndWorkoutJsonTest {

    @Test fun `pace zones arrive in km per hour`() {
        val z2 = Fixtures.zones.pace.getValue(2)
        assertEquals(2.86 * 3.6, z2.minKph, 1e-9)
        assertEquals(3.13 * 3.6, z2.maxKph, 1e-9)
    }

    @Test fun `an open-ended zone with no maximum is left out rather than guessed`() {
        assertNull(Fixtures.zones.hr[5])
        assertEquals(189, Fixtures.zones.maxHr)
    }

    @Test fun `hr zone N pairs with pace zone N`() {
        assertEquals(Fixtures.zones.pace[3], Fixtures.zones.paceForHrZone(3))
        assertEquals(2, Fixtures.zones.hrZoneOf(130.0))
        assertNull(Fixtures.zones.hrZoneOf(200.0))
    }

    @Test fun `no zones parses to nothing`() {
        assertTrue(Zones.parse(null).isEmpty)
        assertTrue(Zones.parse(JSONObject("{}")).isEmpty)
    }

    @Test fun `steps keep their ends, targets, incline and repeats`() {
        val w = WorkoutJson.parse(Fixtures.intervals)!!
        assertEquals("w1", w.plannedId)
        assertEquals(5, w.steps.size)
        assertEquals(Workout.End.Time(600.0), w.steps[0].end)
        assertTrue(w.steps[0].target is Workout.Target.Pace)
        assertEquals(1.0, w.steps[1].incline)
        assertEquals(Workout.Repeat(1, 2), w.steps[1].repeat)
        assertEquals(Workout.End.Distance(200.0), w.steps[2].end)
        assertEquals(Workout.Target.None, w.steps[2].target)
        assertEquals(Workout.Target.HeartRate(HrBand(119, 138), 2), w.steps[3].target)
        assertEquals(Workout.End.Open, w.steps[4].end)
        assertEquals(Workout.Target.Unresolved("pace", 4), w.steps[4].target)
    }

    @Test fun `a workout that is not for the treadmill is not runnable`() {
        val o = JSONObject(Fixtures.intervals.toString()).put("runnable", false)
        assertNull(WorkoutJson.parse(o))
    }

    @Test fun `steps that cannot be run are dropped, and nothing left is null`() {
        val o = JSONObject("""{"id":"x","steps":[{"kind":"interval","end":{"type":"time","value":0}}]}""")
        assertNull(WorkoutJson.parse(o))
    }

    @Test fun `a pace range the wrong way round is not a target`() {
        val o = JSONObject("""{"id":"x","steps":[{"kind":"interval","end":{"type":"time","value":60},
            "target":{"type":"pace","minMs":4.0,"maxMs":3.0}}]}""")
        assertEquals(Workout.Target.None, WorkoutJson.parse(o)!!.steps[0].target)
    }
}
