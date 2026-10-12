#!/usr/bin/env python3
"""
Check a STRIDE workout against the stride.workout.v1 rules TrailMate enforces.

TrailMate answers a payload that breaks any of these with 400, and the console
then parks the run for good, so they are worth checking from this side before
one is ever sent. The rules are spec 037's `contracts/api.md`, section 4, one
check per rule; RunRecorder.kt builds to the same list.

    python tools/workout_check.py workout.json      # a file
    python tools/sim.py workout | python tools/workout_check.py -   # the console's last one

Exit status 0 when it passes, 1 with every broken rule listed when it does not.
"""
import datetime as dt
import json
import re
import sys

UUID = re.compile(r"^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$", re.I)
OPTIONAL = ("hr", "cadenceSpm", "powerW", "strideM")
REQUIRED = ("distanceM", "speedMs", "inclinePct")


def is_num(v):
    return isinstance(v, (int, float)) and not isinstance(v, bool)


def check(w):
    """Every broken rule, as a list of lines. Empty means it would be accepted."""
    errs = []
    err = errs.append

    if w.get("schema") != "stride.workout.v1":
        err(f"schema is {w.get('schema')!r}, not 'stride.workout.v1'")
    if not isinstance(w.get("workoutId"), str) or not UUID.match(w["workoutId"]):
        err(f"workoutId {w.get('workoutId')!r} is not a UUID")

    started = w.get("startedAt")
    try:
        when = dt.datetime.strptime(started, "%Y-%m-%dT%H:%M:%SZ").replace(tzinfo=dt.timezone.utc)
        if when > dt.datetime.now(dt.timezone.utc) + dt.timedelta(days=7):
            err(f"startedAt {started} is more than 7 days in the future")
    except (TypeError, ValueError):
        err(f"startedAt {started!r} is not ISO 8601 UTC (YYYY-MM-DDTHH:MM:SSZ)")
    off = w.get("utcOffsetMin")
    if not isinstance(off, int) or isinstance(off, bool) or not -840 <= off <= 840:
        err(f"utcOffsetMin {off!r} is not an integer in -840..840")

    s = w.get("samples")
    if not isinstance(s, dict):
        err("samples is missing")
        return errs
    t = s.get("t")
    if not isinstance(t, list) or not all(isinstance(x, int) and not isinstance(x, bool) for x in t):
        err("samples.t is not a list of whole seconds")
        return errs
    if not 60 <= len(t) <= 21600:
        err(f"samples.t has {len(t)} entries, outside 60..21600")
    if t and t[0] < 0:
        err("samples.t starts before startedAt")
    for i in range(1, len(t)):
        if t[i] <= t[i - 1]:
            err(f"samples.t is not strictly increasing at index {i} ({t[i - 1]} then {t[i]})")
            break

    for k in REQUIRED:
        a = s.get(k)
        if not isinstance(a, list):
            err(f"samples.{k} is missing")
            continue
        if len(a) != len(t):
            err(f"samples.{k} has {len(a)} entries, t has {len(t)}")
        if not all(is_num(x) for x in a):
            err(f"samples.{k} has a null or non-number")
    for k in OPTIONAL:
        if k not in s:
            continue
        a = s[k]
        if not isinstance(a, list) or len(a) != len(t):
            err(f"samples.{k} is not a list as long as t")
        elif not all(x is None or is_num(x) for x in a):
            err(f"samples.{k} has something other than a number or null")
    for k in s:
        if k not in ("t",) + REQUIRED + OPTIONAL:
            err(f"samples.{k} is not in the schema")

    d = s.get("distanceM") or []
    inc = s.get("inclinePct") or []
    if all(is_num(x) for x in d):
        for i in range(1, len(d)):
            if d[i] < d[i - 1]:
                err(f"distanceM decreases at index {i} ({d[i - 1]} then {d[i]})")
                break
    if all(is_num(x) for x in inc) and any(not -10 <= x <= 45 for x in inc):
        err("inclinePct leaves -10..45")

    tot = w.get("totals")
    if not isinstance(tot, dict):
        err("totals is missing")
        tot = {}
    elapsed = t[-1] if t else 0
    if tot.get("elapsedS") != elapsed:
        err(f"totals.elapsedS {tot.get('elapsedS')} is not the last t ({elapsed})")
    if d and all(is_num(x) for x in d):
        if not is_num(tot.get("distanceM")) or abs(tot["distanceM"] - d[-1]) > 1:
            err(f"totals.distanceM {tot.get('distanceM')} is not the last distanceM ({d[-1]}) ±1 m")
    if len(d) == len(inc) and all(is_num(x) for x in d + inc):
        climb = sum(max(0.0, (d[i] - d[i - 1]) * inc[i] / 100) for i in range(1, len(d)))
        if not is_num(tot.get("climbM")) or abs(tot["climbM"] - climb) > 1:
            err(f"totals.climbM {tot.get('climbM')} is not the integrated climb ({climb:.1f}) ±1 m")

    pauses = w.get("pauses", [])
    paused = 0
    if not isinstance(pauses, list):
        err("pauses is not a list")
        pauses = []
    last_end = 0
    for i, p in enumerate(pauses):
        a, b = p.get("startS"), p.get("endS")
        if not (is_num(a) and is_num(b)) or not 0 <= a < b <= elapsed:
            err(f"pause {i} ({a}..{b}) is not inside 0..{elapsed}")
            continue
        if a < last_end:
            err(f"pause {i} overlaps or is out of order")
        last_end = b
        paused += b - a
    if tot.get("movingS") != elapsed - paused:
        err(f"totals.movingS {tot.get('movingS')} is not elapsedS minus paused time ({elapsed - paused})")
    for k in ("calories", "avgHr", "maxHr"):
        if k in tot and tot[k] is not None and not is_num(tot[k]):
            err(f"totals.{k} is not a number")

    plan = w.get("plan")
    if plan is not None:
        if not isinstance(plan, dict) or not isinstance(plan.get("name"), str) \
                or not isinstance(plan.get("segments"), list):
            err("plan is neither null nor {name, segments}")
        else:
            for i, g in enumerate(plan["segments"]):
                if not (is_num(g.get("startS")) and is_num(g.get("endS"))
                        and isinstance(g.get("label"), str) and is_num(g.get("incline"))):
                    err(f"plan segment {i} is not {{startS, endS, label, incline}}")
                elif not 0 <= g["startS"] < g["endS"] <= elapsed:
                    err(f"plan segment {i} ({g['startS']}..{g['endS']}) is not inside the run")

    src = w.get("sources")
    if not isinstance(src, dict) or src.get("hr") not in ("strap", "grips", "none"):
        err(f"sources.hr is {None if not isinstance(src, dict) else src.get('hr')!r}, "
            "not strap | grips | none")
    elif not isinstance(src.get("footpod"), bool):
        err("sources.footpod is not true or false")
    if "hr" in s and isinstance(src, dict) and src.get("hr") == "none":
        err("samples.hr is present but sources.hr says none")

    app = w.get("app")
    if not isinstance(app, dict) or not isinstance(app.get("name"), str):
        err("app is missing its name")
    return errs


def describe(w):
    tot = w.get("totals", {})
    s = w.get("samples", {})
    sensors = [k for k in OPTIONAL if k in s] or ["none"]
    plan = (w.get("plan") or {}).get("name") or "free run"
    return (f"{w.get('workoutId')}  {w.get('startedAt')}  {tot.get('elapsedS')} s "
            f"({tot.get('movingS')} moving), {tot.get('distanceM')} m, climb {tot.get('climbM')} m, "
            f"{len(s.get('t', []))} samples, {len(w.get('pauses', []))} pause(s), "
            f"sensors: {', '.join(sensors)}, hr from {w.get('sources', {}).get('hr')}, plan: {plan}")


def main():
    if len(sys.argv) != 2:
        sys.exit(__doc__.strip())
    src = sys.stdin if sys.argv[1] == "-" else open(sys.argv[1], encoding="utf-8")
    w = json.load(src)
    errs = check(w)
    print(describe(w))
    if errs:
        print(f"FAIL: {len(errs)} rule(s) broken")
        for e in errs:
            print("  - " + e)
        sys.exit(1)
    print("PASS: stride.workout.v1")


if __name__ == "__main__":
    main()
