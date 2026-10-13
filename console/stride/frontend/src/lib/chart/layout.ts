import type { PlanStep } from '../../bridge/types';

/* The live chart's maths. No canvas in this file, so it can be tested. */

export type Domain = [lo: number, hi: number];

/** A y range that holds every value given, at least `minSpan` tall so a
 *  steady line does not fill its strip with noise, rounded out to `step`.
 *  Never below `floor`: no negative speed. */
export function domainFor(values: readonly number[], minSpan: number, step: number, floor = -Infinity): Domain {
  if (!values.length) return [Math.max(floor, 0), Math.max(floor, 0) + minSpan];
  let lo = Infinity;
  let hi = -Infinity;
  for (const v of values) {
    if (v < lo) lo = v;
    if (v > hi) hi = v;
  }
  const pad = Math.max(0, minSpan - (hi - lo)) / 2;
  lo = Math.max(floor, Math.floor((lo - pad) / step) * step);
  hi = Math.ceil((hi + pad) / step) * step;
  if (hi - lo < minSpan) hi = lo + Math.ceil(minSpan / step) * step;
  return [lo, hi];
}

/** One stretch of the plan still to come, in seconds from now. */
export interface Ahead {
  from: number;
  to: number;
  incline: number;
}

/** The plan's inclines over the next `horizonS` seconds. A route's steps are
 *  metres, so they become seconds at the present speed; a workout's are
 *  seconds already. A stopped belt sees no ground ahead. */
export function planAhead(
  steps: readonly PlanStep[],
  opts: { byDistance: boolean; position: number; speedKph: number; horizonS: number },
): Ahead[] {
  const perSecond = opts.byDistance ? opts.speedKph / 3.6 : 1;
  if (perSecond <= 0) return [];
  const out: Ahead[] = [];
  for (const st of steps) {
    if (st.end <= opts.position) continue;
    const from = Math.max(0, (st.start - opts.position) / perSecond);
    if (from >= opts.horizonS) break;
    out.push({ from, to: Math.min(opts.horizonS, (st.end - opts.position) / perSecond), incline: st.incline });
  }
  return out;
}

/** Time-axis marks, seconds before now: every two minutes over ten. */
export function timeTicks(windowS: number): number[] {
  const every = windowS > 20 * 60 ? 5 * 60 : windowS > 6 * 60 ? 2 * 60 : 60;
  const out: number[] = [];
  for (let s = 0; s <= windowS; s += every) out.push(s);
  return out;
}
