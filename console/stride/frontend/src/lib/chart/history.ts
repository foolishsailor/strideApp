import type { SessionState, StepTarget } from '../../bridge/types';

/* The run so far, one sample a second of moving time, for the live chart.

   Keyed by the snapshot's `elapsed`, which stops while the belt is paused, so
   a pause leaves no flat stretch in the chart and the time axis is the run's
   own clock. Kotlin pushes about five snapshots a second; only the first in
   each new second is kept. */

export interface Sample {
  /** Moving seconds. */
  t: number;
  /** km/h. */
  speed: number;
  /** %. */
  incline: number;
  /** bpm, or null with no reading. */
  pulse: number | null;
  /** The step's heart-rate band at the time, bpm, when it had one. */
  hr: { min: number; max: number } | null;
  /** The step's pace band at the time, km/h, when it had one. */
  pace: { min: number; max: number } | null;
}

/** Thirty minutes. The chart shows ten; the rest lets a longer window be
 *  chosen later without a change here. */
export const KEEP_S = 30 * 60;

const band = (t: StepTarget | undefined, type: 'hr' | 'pace'): { min: number; max: number } | null => {
  if (!t) return null;
  if (type === 'hr' && t.type === 'hr') return { min: t.minBpm, max: t.maxBpm };
  if (type === 'pace' && t.type === 'pace') return { min: t.minKph, max: t.maxKph };
  return null;
};

export function sampleOf(s: SessionState): Sample | null {
  if (s.elapsed == null) return null;
  const target = s.workoutStep?.target;
  return {
    t: Math.floor(s.elapsed),
    speed: s.speed ?? 0,
    incline: s.incline ?? 0,
    pulse: s.pulse && s.pulse > 0 ? s.pulse : null,
    hr: band(target, 'hr'),
    pace: band(target, 'pace'),
  };
}

export class RunHistory {
  private items: Sample[] = [];

  get samples(): readonly Sample[] {
    return this.items;
  }

  /** True when the sample was kept. An earlier time than the last means a
   *  new run, so what was there goes. */
  add(s: Sample): boolean {
    const last = this.items[this.items.length - 1];
    if (last && s.t < last.t) this.items = [];
    else if (last && s.t === last.t) return false;
    this.items.push(s);
    const from = s.t - KEEP_S;
    while (this.items[0]!.t < from) this.items.shift();
    return true;
  }

  clear(): void {
    this.items = [];
  }
}
