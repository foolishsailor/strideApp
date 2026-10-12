import { describe, expect, it } from 'vitest';
import {
  canStop, coachHoldMs, greeting, inclineTicks, modeLabel, normaliseMode, pausedWhere, phasePreview,
  phaseProgress, primaryAction, primaryLabel, screenFor, segmentSubtitle, speedTicks, suggestion,
} from './session';

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
  it('locates a paused guided walk by segment, a casual one by distance', () => {
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
    expect(phasePreview('cooldown', steps)).toBe('');
  });

  it('greets by the time of day', () => {
    expect([greeting(7), greeting(13), greeting(20)]).toEqual(['Good morning', 'Good afternoon', 'Good evening']);
  });
});

describe('numbers', () => {
  it('phrases the suggestion against the current target', () => {
    expect(suggestion({ suggestPace: 5.6, targetSpeed: 5.0, inclineAuto: true })).toEqual({ verb: 'lift to', kph: 5.6, manualIncline: false });
    expect(suggestion({ suggestPace: 5.0, targetSpeed: 5.6 })?.verb).toBe('ease to');
    expect(suggestion({ suggestPace: 5.0, targetSpeed: 5.1 })?.verb).toBe('hold');
    expect(suggestion({ suggestPace: 0 })).toBeNull();
  });

  it('maps speed and incline onto ten ticks', () => {
    expect([speedTicks(0), speedTicks(19), speedTicks(9.5)]).toEqual([0, 10, 5]);
    expect([inclineTicks(-3), inclineTicks(12), inclineTicks(4.5)]).toEqual([0, 10, 5]);
  });

  it('clamps phase progress', () => {
    expect([phaseProgress(120), phaseProgress(60), phaseProgress(-5), phaseProgress(500)]).toEqual([0, 0.5, 1, 0]);
  });

  it('holds a coach line between nine and eighteen seconds', () => {
    expect(coachHoldMs('Hi')).toBe(9000);
    expect(coachHoldMs('x'.repeat(100))).toBe(14000);
    expect(coachHoldMs('x'.repeat(1000))).toBe(18000);
  });
});
