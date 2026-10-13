import type { HrState, PlanStep, SessionMode, SessionState, StepTarget, WorkoutStep } from '../bridge/types';
import type { Units } from '../store/settings';
import { mmss } from './format';
import { far, kphFrom, speedIn, distanceRun } from './units';

/* What the screen makes of a snapshot. Pure functions only, so every rule the
   old render() applied inline is named, tested, and shared by whichever
   component needs it. */

export type ScreenId = 'welcome' | 'workout' | 'summary';

const MODES: readonly SessionMode[] = ['welcome', 'warmup', 'running', 'paused', 'cooldown', 'summary'];

/** Kotlin sends the mode in whatever case its enum prints. Anything unknown is
 *  the welcome screen, which is the one place nothing can move the belt. */
export function normaliseMode(raw: string | undefined): SessionMode {
  const m = (raw || 'welcome').toLowerCase() as SessionMode;
  return MODES.indexOf(m) >= 0 ? m : 'welcome';
}

export function screenFor(mode: SessionMode): ScreenId {
  if (mode === 'welcome') return 'welcome';
  if (mode === 'summary') return 'summary';
  return 'workout';
}

/** Warm-up and cool-down: timed, and they get the centre panel. */
export const isTimed = (mode: SessionMode): boolean => mode === 'warmup' || mode === 'cooldown';

/** The belt is (or should be) turning. */
export const isMoving = (mode: SessionMode): boolean => mode === 'running' || isTimed(mode);

/** Welcome and summary: nothing in progress, so the panel may sleep. */
export const isRestful = (mode: SessionMode | null): boolean =>
  mode === null || mode === 'welcome' || mode === 'summary';

/** The chip says what you're *doing*. "running" is the internal name of the
 *  active session state, which read as wrong on every run. Colour still keys
 *  off the state, so running and running are both green. */
export function modeLabel(mode: SessionMode, ramping?: string): string {
  if (mode === 'warmup') return 'warming up';
  if (mode === 'cooldown') return 'cooling down';
  if (ramping === 'resuming') return 'resuming';
  if (mode === 'running') return 'working out';
  return mode;
}

/** The leftmost control changes job with the phase. Choosing a workout is what
 *  starts it, so there is no START — this slot is skip / pause / resume. */
export type PrimaryAction = 'skipWarmup' | 'skipCooldown' | 'resume' | 'pause' | null;

export function primaryAction(mode: SessionMode): PrimaryAction {
  switch (mode) {
    case 'warmup': return 'skipWarmup';
    case 'cooldown': return 'skipCooldown';
    case 'paused': return 'resume';
    case 'running': return 'pause';
    default: return null;
  }
}

export function primaryLabel(mode: SessionMode): string {
  if (isTimed(mode)) return 'SKIP';
  if (mode === 'paused') return 'RESUME';
  return 'PAUSE';
}

/** Cool-down is already the way out; STOP there would just be a second one. */
export const canStop = (mode: SessionMode): boolean =>
  mode === 'warmup' || mode === 'running' || mode === 'paused';

/** Says where you are, not just that you stopped. Someone coming back to a
 *  paused console after answering the door wants the run located again. */
export function pausedWhere(s: SessionState, u: Units = 'km'): string {
  const where = [mmss(s.elapsed ?? 0) + ' in'];
  const w = s.workoutStep;
  if (w) where.push(`${w.label} · step ${w.step} of ${w.steps}`);
  else if (s.segments) where.push(`${s.segmentLabel || 'segment ' + s.segment} · ${s.segment} of ${s.segments}`);
  else {
    const d = distanceRun(s.distance ?? 0, u);
    where.push(d.value + ' ' + d.unit);
  }
  where.push('the belt has stopped');
  return where.join(' · ');
}

/* ---- a workout under way (spec 038) ---------------------------------------- */

/** What heart-rate control is doing, in a few words, beside the heart rate.
 *  When the target is a zone it is named: "Holding zone 2" once the heart rate
 *  is in it, "Heading for zone 2" while control holds the speed and the heart
 *  rate is still on its way there. */
export function hrStateText(state: HrState | null | undefined, target?: StepTarget | null,
                            zoneNow?: number | null): string {
  const zone = target?.type === 'hr' ? target.zone : null;
  switch (state) {
    case 'settling': return 'Settling';
    case 'holding':
      if (!zone) return 'Holding';
      return zoneNow == null || zoneNow === zone ? `Holding zone ${zone}` : `Heading for zone ${zone}`;
    case 'raising': return 'Speeding up';
    case 'easing': return 'Easing off';
    case 'dropping': return 'Slowing: heart rate high';
    case 'no_hr': return 'No heart rate';
    default: return '';
  }
}

/** Heart-rate details belong beside the reading while the heart rate is
 *  what the step is about: an HR target, or control running. */
export const showsHeartRate = (w: WorkoutStep | null | undefined): w is WorkoutStep =>
  !!w && (w.target.type === 'hr' || (w.target.type === 'zone' && w.target.of === 'hr') || !!w.hrState);

/** Said once the runner has taken over a control the step was driving: the
 *  console leaves it alone until the next step. */
export function handNote(w: Pick<WorkoutStep, 'speedAuto' | 'inclineAuto' | 'incline'>): string {
  const speed = !w.speedAuto, incline = !w.inclineAuto && w.incline !== null;
  if (speed && incline) return 'speed and incline yours until the next step';
  if (speed) return 'speed yours until the next step';
  if (incline) return 'incline yours until the next step';
  return '';
}

/** "Step 3 of 10 · 2 of 4": where in the workout, and in its repeat. */
export function stepPosition(w: Pick<WorkoutStep, 'step' | 'steps' | 'repeat'>): string {
  const at = `Step ${w.step} of ${w.steps}`;
  return w.repeat ? `${at} · ${w.repeat.index} of ${w.repeat.of}` : at;
}

/** "Rolling hills · 3 of 11 · 1:20 left", or the ground left for a route. */
export function segmentSubtitle(s: SessionState, u: Units = 'km'): string {
  const left = s.segmentLeft || 0;
  const remaining = s.segmentLeftIsDistance ? far(left, u) : mmss(left);
  return `${s.plan} · ${s.segment} of ${s.segments} · ${remaining} left`;
}

/** Warm-up and cool-down are both two minutes — WARMUP_MS / COOLDOWN_MS. */
export const PHASE_SECONDS = 120;

export function phaseProgress(left: number): number {
  return Math.max(0, Math.min(1, 1 - left / PHASE_SECONDS));
}

/** What is coming, phrased as a preview and never as live plan state. A
 *  warm-up that reads "2 of 9 · 1:36 left" is claiming to be a run that has
 *  not started yet. */
export function phasePreview(mode: SessionMode, steps: readonly PlanStep[]): string {
  if (mode !== 'warmup') return '';
  const first = steps[0];
  return first ? `${steps.length} stretches ahead · first up: ${first.label}` : 'then the pace is yours';
}

/** What the board says it can do. Kotlin's defaults until it says otherwise. */
export interface Limits { minKph: number; maxKph: number; minGrade: number; maxGrade: number }
export const DEFAULT_LIMITS: Limits = { minKph: 1.6, maxKph: 19, minGrade: -3, maxGrade: 12 };

export function parseLimits(json: string | undefined): Limits {
  try {
    return { ...DEFAULT_LIMITS, ...(JSON.parse(json || '{}') as Partial<Limits>) };
  } catch {
    return DEFAULT_LIMITS;
  }
}

/** The speeds offered in a side rail: every whole km/h or mph the belt can
 *  do, in the unit shown. Below the board's minimum there is no slow, only
 *  stopped, so none of those. */
export function speedStops(l: Limits, u: Units = 'km'): number[] {
  const out: number[] = [];
  const lo = speedIn(l.minKph, u), hi = speedIn(l.maxKph, u);
  for (let v = Math.ceil(lo - 1e-9); v <= Math.floor(hi + 1e-9); v++) out.push(v);
  return out;
}

/** The km/h change that moves a target of `kph` by `step` in the unit shown,
 *  landing on that unit's 0.1 grid: 3.2 mph + 0.1 is 3.3 mph exactly, not
 *  3.2 mph + 0.161 km/h, which the board rounds to 3.4. In km/h it is the
 *  step itself. */
export function speedDelta(kph: number, step: number, u: Units): number {
  if (u === 'km') return step;
  const next = Math.round((speedIn(kph, u) + step) * 10) / 10;
  return kphFrom(next, u) - kph;
}

/** The grades offered in a side rail: the board's full decline if it has
 *  one, the hand-picked ones up to 20 %, then every 5 % above that as far as
 *  this board goes. Trimmed to what it reaches — a stop it would silently
 *  clamp is a promise the screen can't keep. */
export const INCLINE_STOPS = [0, 3, 5, 8, 10, 15, 18, 20] as const;
const INCLINE_STEP_ABOVE = 5;
export function inclineStops(l: Limits): number[] {
  const out: number[] = l.minGrade < 0 ? [l.minGrade] : [];
  out.push(...INCLINE_STOPS.filter((v) => v >= l.minGrade && v <= l.maxGrade));
  const top = INCLINE_STOPS[INCLINE_STOPS.length - 1]!;
  for (let v = top + INCLINE_STEP_ABOVE; v <= l.maxGrade; v += INCLINE_STEP_ABOVE) out.push(v);
  return out;
}

/** The stop nearest a value: the one a rail keeps in view. */
export function nearestStop(stops: readonly number[], v: number): number | undefined {
  let best: number | undefined;
  for (const s of stops) if (best === undefined || Math.abs(s - v) < Math.abs(best - v)) best = s;
  return best;
}

export const FAN_LEVELS = ['OFF', 'LOW', 'MEDIUM', 'HIGH', 'AUTO'] as const;
const FAN_SHORT = ['', 'I', 'II', 'III', 'A'];
export const fanButtonLabel = (fan: number): string => (fan ? 'FAN ' + (FAN_SHORT[fan] ?? '') : 'FAN');

/** No name here: the welcome screen is the question "who is running". */
export function greeting(hour: number): string {
  if (hour < 12) return 'Good morning';
  if (hour < 18) return 'Good afternoon';
  return 'Good evening';
}

/** Seconds per kilometre at a belt speed, or 0 when the belt is barely
 *  turning and a pace would read as hours. */
export const paceSecPerKm = (kph: number | undefined): number =>
  kph && kph >= 0.5 ? Math.round(3600 / kph) : 0;

/* ---- belt calibration ----------------------------------------------------- */

export const KM_PER_MILE = 1.609344;

/** Seconds per mile or per kilometre at a speed, or 0 when barely moving. */
export const paceSec = (kph: number | undefined, miles: boolean): number =>
  kph && kph >= 0.5 ? (3600 / kph) * (miles ? KM_PER_MILE : 1) : 0;

/** "9:05 /mi" — the way a Stryd shows it. */
export function paceText(kph: number | undefined, miles: boolean): string {
  const s = Math.round(paceSec(kph, miles));
  if (!s) return '–';
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')} /${miles ? 'mi' : 'km'}`;
}

/**
 * The pace step the calibration panel moves in, seconds, for a pace. Five
 * seconds is the right grain at a running pace and useless at a stroll: from
 * 48 minutes a mile it is 0.004 km/h, which the belt rounds away, and reaching
 * 9:00 would take hundreds of presses. So the step grows with the pace.
 */
export function paceStepSec(sec: number): number {
  if (sec <= 15 * 60) return 5;
  if (sec <= 30 * 60) return 30;
  return 60;
}

/** The next round pace from here, faster or slower, as km/h, `count` steps
 *  on. A pace off the grid lands on it first, so 9:03 goes to 9:00 or 9:05,
 *  never 8:58. */
export function stepPace(kph: number, miles: boolean, faster: boolean, count = 1): number {
  let p = Math.round(paceSec(kph, miles));
  if (!p) return kph;
  for (let i = 0; i < count; i++) {
    // Faster takes the step of where it is going, so 15:30 → 15:00 → 14:55.
    const step = paceStepSec(faster ? p - 1 : p);
    const onGrid = p % step === 0;
    const base = onGrid ? p : (faster ? Math.ceil(p / step) : Math.floor(p / step)) * step;
    const next = faster ? base - step : base + step;
    if (next <= 0) break;
    p = next;
  }
  return (3600 * (miles ? KM_PER_MILE : 1)) / p;
}

/** How much more than the dial the board is sent, signed: "+5.6%" makes up a
 *  belt that runs 5.6% slow. */
export function beltOffset(kph: number, belt: number): string {
  if (!(kph > 0) || !(belt > 0)) return '–';
  const pct = (belt / kph - 1) * 100;
  return `${pct >= 0 ? '+' : '−'}${Math.abs(pct).toFixed(1)}%`;
}
