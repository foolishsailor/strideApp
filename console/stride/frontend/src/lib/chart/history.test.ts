import { describe, expect, it } from 'vitest';
import { KEEP_S, RunHistory, sampleOf, type Sample } from './history';

const at = (t: number, speed = 8): Sample => ({ t, speed, incline: 0, pulse: null, hr: null, pace: null });

describe('sampleOf', () => {
  it('takes the step’s heart-rate band, and no pulse from a zero', () => {
    const s = sampleOf({
      elapsed: 61.8, speed: 9, incline: 2, pulse: 0,
      workoutStep: { target: { type: 'hr', minBpm: 140, maxBpm: 150, zone: 2 } } as never,
    });
    expect(s).toMatchObject({ t: 61, speed: 9, incline: 2, pulse: null, hr: { min: 140, max: 150 }, pace: null });
  });

  it('takes a pace band in km/h', () => {
    const s = sampleOf({ elapsed: 5, workoutStep: { target: { type: 'pace', minKph: 9, maxKph: 10, zone: null } } as never });
    expect(s?.pace).toEqual({ min: 9, max: 10 });
  });

  it('has nothing to say before the run has a clock', () => {
    expect(sampleOf({ speed: 3 })).toBeNull();
  });
});

describe('RunHistory', () => {
  it('keeps one sample a second', () => {
    const h = new RunHistory();
    expect(h.add(at(1))).toBe(true);
    expect(h.add(at(1, 9))).toBe(false);
    expect(h.add(at(2))).toBe(true);
    expect(h.samples.map((s) => s.t)).toEqual([1, 2]);
  });

  it('starts again when the clock goes back: a new run', () => {
    const h = new RunHistory();
    h.add(at(300));
    h.add(at(0));
    expect(h.samples.map((s) => s.t)).toEqual([0]);
  });

  it('forgets what is older than it keeps', () => {
    const h = new RunHistory();
    for (let t = 0; t <= KEEP_S + 10; t++) h.add(at(t));
    expect(h.samples[0]!.t).toBe(10);
    expect(h.samples).toHaveLength(KEEP_S + 1);
  });
});
