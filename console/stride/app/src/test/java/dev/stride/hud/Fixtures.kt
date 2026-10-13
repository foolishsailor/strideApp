package dev.stride.hud

import org.json.JSONObject

/** Spec-038 shapes for the unit tests: the same ones tools/trailmate_fixtures.py serves. */
object Fixtures {
    val zonesJson = JSONObject("""
        { "pace": [ {"zone":1,"minMs":2.53,"maxMs":2.86}, {"zone":2,"minMs":2.86,"maxMs":3.13},
                    {"zone":3,"minMs":3.13,"maxMs":3.45} ],
          "hr":   [ {"zone":1,"minBpm":98,"maxBpm":118}, {"zone":2,"minBpm":119,"maxBpm":138},
                    {"zone":3,"minBpm":139,"maxBpm":155}, {"zone":5,"minBpm":172,"maxBpm":null} ],
          "maxHr": 189, "restingHr": 48 }
    """)

    val zones: Zones = Zones.parse(zonesJson)

    val limits = SpeedLimits(1.5, 20.0)

    /** Warm-up by pace, two repeats of interval + recovery, an open cool-down. */
    val intervals = JSONObject("""
        { "id":"w1", "name":"2 × 3 min", "runnable":true, "steps":[
          {"kind":"warmup","label":"Warm up","end":{"type":"time","value":600},
           "target":{"type":"pace","minMs":2.5,"maxMs":2.78},"inclinePct":null,"note":null,"repeat":null},
          {"kind":"interval","label":"Interval","end":{"type":"time","value":180},
           "target":{"type":"pace","minMs":3.64,"maxMs":3.77},"inclinePct":1.0,"note":"Strong",
           "repeat":{"index":1,"of":2}},
          {"kind":"recovery","label":"Recovery","end":{"type":"distance","value":200},
           "target":{"type":"none"},"inclinePct":null,"note":null,"repeat":{"index":1,"of":2}},
          {"kind":"interval","label":"Interval","end":{"type":"time","value":180},
           "target":{"type":"hr","minBpm":119,"maxBpm":138,"zone":2},"inclinePct":null,"note":null,
           "repeat":{"index":2,"of":2}},
          {"kind":"cooldown","label":"Cool down","end":{"type":"open","value":null},
           "target":{"type":"pace","zone":4},"inclinePct":0,"note":null,"repeat":null} ] }
    """)
}
