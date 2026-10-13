import { describe, expect, it } from 'vitest';
import { domainFor, planAhead, timeTicks } from './layout';

describe('domainFor', () => {
  it('holds every value, rounded out', () => {
    expect(domainFor([131, 165], 30, 10)).toEqual([130, 170]);
  });

  it('keeps a steady line from filling its strip', () => {
    const [lo, hi] = domainFor([8, 8, 8], 2, 1);
    expect(hi - lo).toBeGreaterThanOrEqual(2);
    expect(lo).toBeLessThanOrEqual(8);
    expect(hi).toBeGreaterThanOrEqual(8);
  });

  it('never goes below its floor', () => {
    expect(domainFor([0.4], 2, 1, 0)[0]).toBe(0);
  });

  it('has a range with no values at all', () => {
    expect(domainFor([], 4, 1, -6)).toEqual([0, 4]);
  });
});

const steps = [
  { start: 0, end: 60, incline: 0, label: 'a' },
  { start: 60, end: 120, incline: 6, label: 'b' },
  { start: 120, end: 600, incline: 2, label: 'c' },
];

describe('planAhead', () => {
  it('reads a workout’s steps as seconds from where the run is', () => {
    expect(planAhead(steps, { byDistance: false, position: 30, speedKph: 9, horizonS: 120 })).toEqual([
      { from: 0, to: 30, incline: 0 },
      { from: 30, to: 90, incline: 6 },
      { from: 90, to: 120, incline: 2 },
    ]);
  });

  it('turns a route’s metres into seconds at the present speed', () => {
    // 3.6 km/h is a metre a second.
    expect(planAhead(steps, { byDistance: true, position: 60, speedKph: 7.2, horizonS: 60 })).toEqual([
      { from: 0, to: 30, incline: 6 },
      { from: 30, to: 60, incline: 2 },
    ]);
  });

  it('sees no ground ahead on a stopped belt', () => {
    expect(planAhead(steps, { byDistance: true, position: 0, speedKph: 0, horizonS: 60 })).toEqual([]);
  });
});

describe('timeTicks', () => {
  it('marks every two minutes over twelve', () => {
    expect(timeTicks(720)).toEqual([0, 120, 240, 360, 480, 600, 720]);
  });
});
