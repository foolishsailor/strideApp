"""
Spec 038 fixtures for the TrailMate mock: a week of planned workouts, the
athlete's zones and a couple of routes, in the shapes of spec 038's
`contracts/api.md` (`stride.schedule.v1`, `stride.routes.v1`).

Dated relative to the `from` the console asks for, so "today" always has a
workout on it. Covers each step kind the console has to run: pace targets with
repeats and incline, a heart-rate zone step, a lap-button step, an unresolved
zone, a rest day and a workout that is not for the treadmill.
"""
import datetime as dt


def _pace(min_per_km_fast, min_per_km_slow):
    """'4:30', '4:45' -> (minMs, maxMs): the slower pace is the smaller speed."""
    def ms(p):
        m, s = p.split(":")
        return round(1000 / (int(m) * 60 + int(s)), 2)
    return {"type": "pace", "minMs": ms(min_per_km_slow), "maxMs": ms(min_per_km_fast)}


def _step(kind, label, end, target, incline=None, note=None, repeat=None):
    return {"kind": kind, "label": label, "end": end, "target": target,
            "inclinePct": incline, "note": note, "repeat": repeat}


def _secs(s):
    return {"type": "time", "value": s}


ZONES = {
    "pace": [
        {"zone": 1, "minMs": 2.53, "maxMs": 2.86},
        {"zone": 2, "minMs": 2.86, "maxMs": 3.13},
        {"zone": 3, "minMs": 3.13, "maxMs": 3.45},
        {"zone": 4, "minMs": 3.45, "maxMs": 3.77},
        {"zone": 5, "minMs": 3.77, "maxMs": 4.35},
    ],
    "hr": [
        {"zone": 1, "minBpm": 98, "maxBpm": 118},
        {"zone": 2, "minBpm": 119, "maxBpm": 138},
        {"zone": 3, "minBpm": 139, "maxBpm": 155},
        {"zone": 4, "minBpm": 156, "maxBpm": 171},
        {"zone": 5, "minBpm": 172, "maxBpm": 189},
    ],
    "maxHr": 189,
    "restingHr": 48,
}


def _intervals(date):
    steps = [_step("warmup", "Warm up", _secs(600), _pace("6:00", "6:30"))]
    for i in range(1, 5):
        steps.append(_step("interval", "Interval", _secs(180), _pace("4:30", "4:45"),
                           incline=1.0, note="Strong but controlled",
                           repeat={"index": i, "of": 4}))
        if i < 4:   # skipLastRestStep
            steps.append(_step("recovery", "Recovery", _secs(90), {"type": "none"},
                               repeat={"index": i, "of": 4}))
    steps.append(_step("cooldown", "Cool down", {"type": "open", "value": None},
                       {"type": "none"}, note="Until you are ready"))
    return {"id": "b1c7a0f2-0000-4000-8000-000000000001", "date": date,
            "name": "4 × 3 min @ threshold", "type": "intervals", "sport": "running",
            "runnable": True, "description": "Keep the recoveries easy.",
            "estimatedDurationS": 2340, "estimatedDistanceM": 6800,
            "completed": False, "completedActivity": None, "steps": steps}


def _easy(date):
    return {"id": "b1c7a0f2-0000-4000-8000-000000000002", "date": date,
            "name": "Easy 40 in zone 2", "type": "easy", "sport": "running",
            "runnable": True, "description": "Conversational.",
            "estimatedDurationS": 2400, "estimatedDistanceM": 7000,
            "completed": False, "completedActivity": None,
            "steps": [
                _step("interval", "Easy", _secs(2400),
                      {"type": "hr", "minBpm": 119, "maxBpm": 138, "zone": 2}),
            ]}


def _hills(date):
    steps = [_step("warmup", "Warm up", _secs(300), {"type": "pace", "zone": 1})]
    for i in range(1, 7):
        steps.append(_step("interval", "Climb", {"type": "distance", "value": 200},
                           _pace("5:15", "5:30"), incline=8.0, note="Drive the arms",
                           repeat={"index": i, "of": 6}))
        steps.append(_step("recovery", "Walk down", _secs(90), {"type": "none"},
                           incline=0.0, repeat={"index": i, "of": 6}))
    steps.append(_step("cooldown", "Cool down", _secs(300), {"type": "none"}))
    return {"id": "b1c7a0f2-0000-4000-8000-000000000003", "date": date,
            "name": "Treadmill hills 6 × 200 m", "type": "hills", "sport": "running",
            "runnable": True, "description": "@tm", "estimatedDurationS": 2100,
            "estimatedDistanceM": 5200, "completed": False, "completedActivity": None,
            "steps": steps}


def _strength(date):
    return {"id": "b1c7a0f2-0000-4000-8000-000000000004", "date": date,
            "name": "Core and glutes", "type": None, "sport": "strength_training",
            "runnable": False, "description": None, "estimatedDurationS": 1500,
            "estimatedDistanceM": None, "completed": False, "completedActivity": None,
            "steps": []}


def schedule(from_date, days):
    start = dt.date.fromisoformat(from_date)
    # day 0 intervals, 1 easy (HR), 2 rest, 3 hills, 4 strength, then repeat
    makers = [_intervals, _easy, None, _hills, _strength]
    workouts = []
    for d in range(days):
        make = makers[d % len(makers)]
        if make is None:
            continue
        w = make((start + dt.timedelta(days=d)).isoformat())
        if d >= len(makers):
            w["id"] = w["id"][:-4] + "%04d" % d
        workouts.append(w)
    return {"schema": "stride.schedule.v1", "from": from_date, "days": days,
            "zones": ZONES, "workouts": workouts}


def routes():
    race_day = (dt.date.today() + dt.timedelta(days=11)).isoformat()
    return {"schema": "stride.routes.v1", "routes": [
        {"id": "7d1e0c55-0000-4000-8000-0000000000a1", "kind": "route", "name": "Hill loop",
         "distance_m": 6400, "climb_m": 74, "run_count": 37,
         "segments": [[0, 800, 0.5], [800, 1600, 3.0], [1600, 2200, 5.5],
                      [2200, 3200, -2.0], [3200, 4800, 1.0], [4800, 6400, -1.5]]},
        {"id": "race:5f2a9e10-0000-4000-8000-0000000000b2", "kind": "race",
         "name": "Snowdon Marathon course", "date": race_day,
         "distance_m": 42195, "climb_m": 790, "run_count": 0,
         "segments": [[0, 5000, 1.0], [5000, 11000, 4.5], [11000, 15000, -4.0],
                      [15000, 22000, 1.5], [22000, 26000, 6.0], [26000, 34000, -1.0],
                      [34000, 38000, 7.5], [38000, 42195, -9.0]]},
    ]}
