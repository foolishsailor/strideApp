import { describe, expect, it } from 'vitest';
import { SAMPLES_U, SEE_AHEAD, X0, Y0, elevationFor, project, viewFor } from './geometry';

const steps = [
  { start: 0, end: 100, incline: 0, label: 'flat' },
  { start: 100, end: 200, incline: 10, label: 'climb' },
];

describe('elevation', () => {
  it('is flat with no plan', () => {
    expect(elevationFor([])(500)).toBe(0);
  });

  it('rises through a climb and holds at the top', () => {
    const e = elevationFor(steps);
    expect(e(50)).toBe(0);
    expect(e(150)).toBeCloseTo(50 * 0.1 * 1.5);
    expect(e(200)).toBeCloseTo(100 * 0.1 * 1.5);
    expect(e(9999)).toBeCloseTo(100 * 0.1 * 1.5);
  });
});

describe('projection', () => {
  it('puts the walker at the anchor, at full scale', () => {
    const p = project(0, viewFor(0, 0, 5, elevationFor([])));
    expect(p.x).toBeCloseTo(X0);
    expect(p.y).toBeCloseTo(Y0);
    expect(p.p).toBe(1);
  });

  it('draws a hill ahead higher on screen than the level line', () => {
    // Elapsed 90 s at 3.6 km/h: the climb starts 10 m ahead.
    const v = viewFor(0, 90, 3.6, elevationFor(steps));
    expect(project(60, v).y).toBeLessThan(project(60, v, true).y);
  });

  it('never stalls on a stopped belt', () => {
    expect(viewFor(0, 0, 0, elevationFor([])).paceMs).toBeGreaterThan(0);
  });

  it('samples densely underfoot and stops at the horizon', () => {
    expect(SAMPLES_U.slice(0, 5)).toEqual([0, 1, 2, 3, 4]);
    expect(SAMPLES_U[SAMPLES_U.length - 1]!).toBeLessThan(SEE_AHEAD);
  });
});
