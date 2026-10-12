import type { PlanStep } from '../../bridge/types';

/* The path ahead, as geometry. No canvas in this file, so it can be tested.

   A ribbon receding obliquely from the walker (bottom-left) up and to the
   right. For a point u metres ahead, a perspective factor p = K / (K + u)
   shrinks it towards the vanishing end. Lateral wander and the rise or fall
   of the ground are that one factor applied to a world-space offset, which is
   why a hill looks like it is approaching rather than like a graph scrolling
   sideways.

   Elevation comes from the *plan*, so an eight percent climb two minutes out is
   already visible, rising into the distance, before you reach it. */

export const PW = 732;
export const PH = 404;

/** Where the walker stands. */
export const X0 = PW * 0.12;
export const Y0 = PH * 0.82;
/** Screen length of the whole view. Pulled in from the corner so the far end
 *  has room for ridges on both sides of it. */
export const SPAN = 520;
/** Shallow on purpose. At 32° a flat walk looked like a hill; nearly level, so
 *  height on screen means height on the ground. */
const THETA = (19 * Math.PI) / 180;
export const CT = Math.cos(THETA);
export const ST = Math.sin(THETA);
const KDEPTH = 45; // metres to half perspective scale
export const SEE_AHEAD = 260; // metres of path drawn
const LAT_SCALE = 15; // px per metre of lateral wander, near
const ELEV_SCALE = 26; // px per metre of rise, near
const HALF_W = 1.5; // path half-width, metres
const WIDTH_SCALE = 15;
/** Exaggeration applied to the plan's rise so a 5 % stretch reads on screen. */
const RISE_GAIN = 1.5;

/** Distances sampled along the path: dense underfoot, sparse where a metre is
 *  worth a fraction of a pixel. */
export const SAMPLES_U: readonly number[] = (() => {
  const out: number[] = [];
  for (let u = 0; u < SEE_AHEAD; u = u < 4 ? u + 1 : u * 1.06) out.push(u);
  return out;
})();

/** Rise in metres at plan-time t (seconds). Flat with no plan, which is right
 *  for a casual walk. */
export type Elevation = (t: number) => number;

export function elevationFor(steps: readonly PlanStep[]): Elevation {
  if (!steps.length) return () => 0;
  const marks: number[] = [];
  let h = 0;
  for (const st of steps) {
    marks.push(h);
    h += (st.end - st.start) * st.incline * 0.01 * RISE_GAIN;
  }
  const top = h;
  return (t) => {
    if (t <= 0) return 0;
    for (let i = 0; i < steps.length; i++) {
      const st = steps[i]!;
      if (t < st.end) return marks[i]! + (t - st.start) * st.incline * 0.01 * RISE_GAIN;
    }
    return top;
  };
}

/** Lateral wander at a world position, metres. Two waves so it never reads as
 *  a sine test pattern. */
export const bendAt = (w: number): number => Math.sin(w / 34) * 9 + Math.sin(w / 79) * 5;

export interface View {
  world: number; // metres walked
  t0: number; // plan-time now, seconds
  paceMs: number; // metres per second, floored
  bend0: number;
  elev0: number;
  elevation: Elevation;
}

export function viewFor(distance: number, elapsed: number, speedKph: number, elevation: Elevation): View {
  return {
    world: distance,
    t0: elapsed,
    /* Floored so a stopped belt still draws a path rather than dividing by
       zero; the view simply stops moving. */
    paceMs: Math.max(0.6, speedKph / 3.6),
    bend0: bendAt(distance),
    elev0: elevation(elapsed),
    elevation,
  };
}

export interface ProjectedPoint {
  x: number;
  y: number;
  /** Half-width of the ribbon here, px. */
  hw: number;
  /** Perspective scale, 1 underfoot → 0 at the far end. */
  p: number;
}

/** Oblique projection of a point u metres ahead. `flat` ignores the ground. */
export function project(u: number, v: View, flat = false): ProjectedPoint {
  const p = KDEPTH / (KDEPTH + u);
  const along = SPAN * (1 - p);
  const lat = (bendAt(v.world + u) - v.bend0) * p * LAT_SCALE;
  const rise = flat ? 0 : (v.elevation(v.t0 + u / v.paceMs) - v.elev0) * p * ELEV_SCALE;
  return {
    // Lateral offset runs perpendicular to the direction of travel.
    x: X0 + along * CT + lat * ST,
    y: Y0 - along * ST + lat * CT - rise,
    hw: HALF_W * p * WIDTH_SCALE,
    p,
  };
}

/** Cheap deterministic noise for scenery placement. */
export function hash(i: number): number {
  const x = Math.sin(i * 12.9898) * 43758.5453;
  return x - Math.floor(x);
}
