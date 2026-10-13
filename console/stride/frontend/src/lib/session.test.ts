import { describe, expect, it } from 'vitest';
import {
  canStop, DEFAULT_LIMITS, greeting, inclineStops, modeLabel, nearestStop, normaliseMode,
  paceSecPerKm, parseLimits, pausedWhere, phasePreview, phaseProgress, primaryAction, primaryLabel, screenFor,
  segmentSubtitle, speedStops, paceSec, paceText, stepPace, beltOffset,
} from './session';

describe('belt calibration', () => {
  it('reads pace the way a Stryd does', () => {
    expect(paceText(10.729, true)).toBe('9:00 /mi');
    expect(paceText(12, false)).toBe('5:00 /km');
    expect(paceText(0, true)).toBe('–');
  });

  it('steps pace onto a five-second grid', () => {
    const at = (secPerMi: number) => (3600 * 1.609344) / secPerMi;
    expect(paceSec(stepPace(at(540), true, true), true)).toBeCloseTo(535, 6);
    expect(paceSec(stepPace(at(540), true, false), true)).toBeCloseTo(545, 6);
    // Off the grid lands on it first.
    expect(paceSec(stepPace(at(543), true, true), true)).toBeCloseTo(540, 6);
    expect(paceSec(stepPace(at(543), true, false), true)).toBeCloseTo(545, 6);
  });

  it('takes bigger steps at a stroll, so a running pace is reachable', () => {
    // 2 km/h is about 48:17 /mi: the old 5 s step left it at 2.00 km/h.
    const from = 2;
    expect(paceSec(stepPace(from, true, true), true)).toBeCloseTo(48 * 60, 6);
    expect(stepPace(from, true, true)).toBeGreaterThan(2.005);
    // 15:30 → 15:00 → 14:55: the step shrinks on the way in.
    const at = (s: number) => (3600 * 1.609344) / s;
    expect(paceSec(stepPace(at(930), true, true), true)).toBeCloseTo(900, 6);
    expect(paceSec(stepPace(at(900), true, true), true)).toBeCloseTo(895, 6);
    expect(paceSec(stepPace(at(900), true, true, 3), true)).toBeCloseTo(885, 6);
  });

  it('signs the belt offset', () => {
    expect(beltOffset(10, 10.56)).toBe('+5.6%');
    expect(beltOffset(10, 9.8)).toBe('−2.0%');
    expect(beltOffset(0, 1)).toBe('–');
  });
});

describe('mode', () => {
  it('normalises Kotlin enum names and falls back to welcome', () => {
    expect(normaliseMode('RUNNING')).toBe('running');
    expect(normaliseMode(undefined)).toBe('welcome');
    expect(normaliseMode('sleep')).toBe('welcome');
  });

  it('maps every live phase onto the workout screen', () => {
    expect(screenFor('welcome')).toBe('welcome');
    expect(screenFor('summary')).toBe('summary');
    for (const m of ['warmup', 'running', 'paused', 'cooldown'] as const) expect(screenFor(m)).toBe('workout');
  });

  it('says what you are doing, not the internal state name', () => {
    expect(modeLabel('running')).toBe('working out');
    expect(modeLabel('running', 'resuming')).toBe('resuming');
    expect(modeLabel('warmup', 'resuming')).toBe('warming up');
    expect(modeLabel('paused')).toBe('paused');
  });
});

describe('the primary control', () => {
  it('skips, pauses or resumes by phase', () => {
    expect([primaryAction('warmup'), primaryLabel('warmup')]).toEqual(['skipWarmup', 'SKIP']);
    expect([primaryAction('cooldown'), primaryLabel('cooldown')]).toEqual(['skipCooldown', 'SKIP']);
    expect([primaryAction('running'), primaryLabel('running')]).toEqual(['pause', 'PAUSE']);
    expect([primaryAction('paused'), primaryLabel('paused')]).toEqual(['resume', 'RESUME']);
    expect(primaryAction('welcome')).toBeNull();
  });

  it('offers no second way out during cool-down', () => {
    expect(canStop('cooldown')).toBe(false);
    expect(canStop('running')).toBe(true);
  });
});

describe('copy', () => {
  it('locates a paused guided run by segment, a casual one by distance', () => {
    expect(pausedWhere({ elapsed: 75, segments: 9, segment: 2, segmentLabel: 'First rise' }))
      .toBe('1:15 in · First rise · 2 of 9 · the belt has stopped');
    expect(pausedWhere({ elapsed: 75, distance: 1234 })).toBe('1:15 in · 1,234 m · the belt has stopped');
  });

  it('gives a route its remaining distance and a plan its remaining time', () => {
    const base = { plan: 'Rolling hills', segment: 3, segments: 11 };
    expect(segmentSubtitle({ ...base, segmentLeft: 80 })).toBe('Rolling hills · 3 of 11 · 1:20 left');
    expect(segmentSubtitle({ ...base, segmentLeft: 1530, segmentLeftIsDistance: true })).toContain('1.53 km left');
    expect(segmentSubtitle({ ...base, segmentLeft: 420.4, segmentLeftIsDistance: true })).toContain('420 m left');
  });

  it('previews the plan during warm-up and never during cool-down', () => {
    const steps = [{ start: 0, end: 60, incline: 0, label: 'Settle in' }, { start: 60, end: 120, incline: 4, label: 'Up' }];
    expect(phasePreview('warmup', steps)).toBe('2 stretches ahead · first up: Settle in');
    expect(phasePreview('warmup', [])).toBe('then the pace is yours');
    expect(phasePreview('warmup', [{ start: 0, end: 1800, incline: 0, label: 'Heart rate zone 2' }])).toBe('then Heart rate zone 2');
    expect(phasePreview('cooldown', steps)).toBe('');
  });

  it('greets by the time of day', () => {
    expect([greeting(7), greeting(13), greeting(20)]).toEqual(['Good morning', 'Good afternoon', 'Good evening']);
  });
});

describe('numbers', () => {
  it('offers whole speeds the belt can do, and only grades the board reaches', () => {
    expect(speedStops(DEFAULT_LIMITS)).toEqual([2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19]);
    expect(speedStops({ ...DEFAULT_LIMITS, minKph: 1, maxKph: 4.5 })).toEqual([1, 2, 3, 4]);
    // The full decline first, if the board has one.
    expect(inclineStops(DEFAULT_LIMITS)).toEqual([-3, 0, 3, 5, 8, 10]);
    expect(inclineStops({ ...DEFAULT_LIMITS, minGrade: 0, maxGrade: 20 })).toEqual([0, 3, 5, 8, 10, 15, 18, 20]);
    // Above 20 %, every 5 % the board can reach.
    expect(inclineStops({ ...DEFAULT_LIMITS, minGrade: -6, maxGrade: 40 })).toEqual([-6, 0, 3, 5, 8, 10, 15, 18, 20, 25, 30, 35, 40]);
    expect(inclineStops({ ...DEFAULT_LIMITS, minGrade: 0, maxGrade: 32 })).toEqual([0, 3, 5, 8, 10, 15, 18, 20, 25, 30]);
    expect(parseLimits('{"maxGrade":20}').maxGrade).toBe(20);
    expect(parseLimits('nonsense')).toEqual(DEFAULT_LIMITS);
    expect(nearestStop([0, 3, 5, 8], 6.9)).toBe(8);
  });

  it('turns belt speed into a pace, and a crawl into none', () => {
    expect([paceSecPerKm(6), paceSecPerKm(5.4), paceSecPerKm(0.2), paceSecPerKm(undefined)]).toEqual([600, 667, 0, 0]);
  });

  it('clamps phase progress', () => {
    expect([phaseProgress(120), phaseProgress(60), phaseProgress(-5), phaseProgress(500)]).toEqual([0, 0.5, 1, 0]);
  });
});
