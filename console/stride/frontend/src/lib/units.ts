import type { StepTarget } from '../bridge/types';
import type { Units } from '../store/settings';
import type { PlannedStep, PlannedWorkout, StepEnd } from './schedule';
import { durationText, mmss, nf } from './format';

/* Kilometres or miles, from Settings → Display → Units. Only ever the
   display: the board, Kotlin, FTMS and TrailMate are metric
   throughout, and every number that goes back to Kotlin is converted to
   km/h on the way. */

export const KM_PER_MI = 1.609344;
const FT_PER_M = 3.28084;

/** A speed in the chosen unit, from km/h. */
export const speedIn = (kph: number, u: Units): number => (u === 'mi' ? kph / KM_PER_MI : kph);

/** A speed in the chosen unit, back to the km/h Kotlin takes. */
export const kphFrom = (v: number, u: Units): number => (u === 'mi' ? v * KM_PER_MI : v);

export const speedUnit = (u: Units): string => (u === 'mi' ? 'mph' : 'km/h');

/** One decimal place, the way the dial shows it. */
export const speedText = (kph: number | undefined, u: Units): string => speedIn(kph ?? 0, u).toFixed(1);

/** The distance run so far, as the strip and summary show it: whole metres,
 *  or miles to two places. */
export function distanceRun(m: number, u: Units): { value: string; unit: string } {
  return u === 'mi' ? { value: (m / 1000 / KM_PER_MI).toFixed(2), unit: 'mi' } : { value: nf(m), unit: 'm' };
}

/** A longer distance — a route, the ground left — in km or miles to two
 *  places, or metres / feet when it is under a tenth. */
export function far(m: number, u: Units): string {
  if (u === 'mi') {
    const mi = m / 1000 / KM_PER_MI;
    return mi >= 0.1 ? mi.toFixed(2) + ' mi' : Math.round(m * FT_PER_M) + ' ft';
  }
  return m >= 1000 ? (m / 1000).toFixed(2) + ' km' : Math.round(m) + ' m';
}

/** Height climbed: metres or feet. */
export function climb(m: number, u: Units): { value: string; unit: string } {
  return u === 'mi' ? { value: nf(Math.round(m * FT_PER_M)), unit: 'ft' } : { value: nf(m), unit: 'm' };
}

/** Stride length: metres to two places, or feet to one. */
export function stride(m: number, u: Units): { value: string; unit: string } {
  return u === 'mi' ? { value: (m * FT_PER_M).toFixed(1), unit: 'ft' } : { value: m.toFixed(2), unit: 'm' };
}

/** Seconds per km or per mile at a belt speed, or 0 when the belt is barely
 *  turning and a pace would read as hours. */
export function paceSec(kph: number | undefined, u: Units): number {
  if (!kph || kph < 0.5) return 0;
  return Math.round((3600 / kph) * (u === 'mi' ? KM_PER_MI : 1));
}

export const paceUnit = (u: Units): string => (u === 'mi' ? '/mi' : '/km');

/* ---- workouts (spec 038) ------------------------------------------------- */

/** A pace as m:ss, without its unit. */
export const paceClock = (kph: number, u: Units): string => mmss(paceSec(kph, u));

/** A speed band as paces, fastest first: "4:25–4:35 /km". The slower end is
 *  the lower speed. */
export function paceRange(minKph: number, maxKph: number, u: Units): string {
  const fast = paceClock(Math.max(minKph, maxKph), u), slow = paceClock(Math.min(minKph, maxKph), u);
  return `${fast === slow ? fast : fast + '–' + slow} ${paceUnit(u)}`;
}

/** What a step asks for, in the runner's units, or '' for nothing. */
export function targetText(t: StepTarget | null | undefined, u: Units): string {
  switch (t?.type) {
    case 'pace': return paceRange(t.minKph, t.maxKph, u);
    case 'hr': return `${Math.round(t.minBpm)}–${Math.round(t.maxBpm)} bpm`;
    case 'cadence': return `${Math.round(t.minSpm)}–${Math.round(t.maxSpm)} spm`;
    case 'zone': return `Zone ${t.zone}`;
    default: return '';
  }
}

/** How a step ends: "3 min", "800 m", or "until NEXT". */
export function stepEndText(end: StepEnd, u: Units): string {
  if (end.type === 'time') return durationText(end.seconds);
  if (end.type === 'distance') return far(end.metres, u);
  return 'until NEXT';
}

/** What is left of the step under way: "1:42" or "0.80 km". */
export const leftText = (left: number, isDistance: boolean, u: Units): string =>
  isDistance ? far(left, u) : mmss(left);

/** A step's incline: "8% incline". */
export const inclineText = (pct: number): string => `${Math.round(pct * 10) / 10}% incline`;

/** One step in a line: "Interval 3 min · 4:30–4:45 /km · 1% incline". */
export function stepText(step: PlannedStep, u: Units): string {
  const target = targetText(step.target, u);
  return [`${step.label} ${stepEndText(step.end, u)}`, target, step.incline !== null ? inclineText(step.incline) : '']
    .filter(Boolean).join(' · ');
}

/** A workout's steps as short lines, a repeat folded into one:
 *  "Warm up 10 min · …", "4 × Interval 3 min · … + Recovery 90 s", "Cool down until NEXT".
 *  TrailMate sends repeats laid out in full; this reads them back as the
 *  runner wrote them. */
export function stepLines(steps: readonly PlannedStep[], u: Units): string[] {
  const out: string[] = [];
  let i = 0;
  const repeatAt = (k: number) => steps[k]?.repeat ?? null;
  while (i < steps.length) {
    const step = steps[i]!;
    const r = step.repeat;
    if (!r || r.index !== 1) {
      out.push(stepText(step, u));
      i++;
      continue;
    }
    // The first round of the group is its pattern; the rest repeat it.
    const pattern: PlannedStep[] = [];
    while (i < steps.length && repeatAt(i)?.index === 1 && repeatAt(i)?.of === r.of) pattern.push(steps[i++]!);
    while (i < steps.length && (repeatAt(i)?.index ?? 0) > 1 && repeatAt(i)?.of === r.of) i++;
    out.push(`${r.of} × ${pattern.map((s) => stepText(s, u)).join(' + ')}`);
  }
  return out;
}

/** The planned length of a workout: "39 min · 6.80 km", either, or ''. */
export function plannedText(w: Pick<PlannedWorkout, 'durationS' | 'distanceM'>, u: Units): string {
  const parts: string[] = [];
  if (w.durationS) parts.push(durationText(w.durationS));
  if (w.distanceM) parts.push(far(w.distanceM, u));
  return parts.join(' · ');
}

/** A done workout: "Done · 6.82 km", or "Done" when nothing came back with it. */
export function doneText(done: NonNullable<PlannedWorkout['done']>, u: Units): string {
  return done.distanceM ? `Done · ${far(done.distanceM, u)}` : 'Done';
}
