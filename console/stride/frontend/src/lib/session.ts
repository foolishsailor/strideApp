import type { PlanStep, SessionMode, SessionState } from '../bridge/types';
import { mmss, nf } from './format';

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
 *  active session state, which read as wrong on every walk. Colour still keys
 *  off the state, so walking and running are both green. */
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
 *  paused console after answering the door wants the walk located again. */
export function pausedWhere(s: SessionState): string {
  const where = [mmss(s.elapsed ?? 0) + ' in'];
  if (s.segments) where.push(`${s.segmentLabel || 'segment ' + s.segment} · ${s.segment} of ${s.segments}`);
  else where.push(nf(s.distance ?? 0) + ' m');
  where.push('the belt has stopped');
  return where.join(' · ');
}

/** "Rolling hills · 3 of 11 · 1:20 left", or metres/km for a route. */
export function segmentSubtitle(s: SessionState): string {
  const left = s.segmentLeft || 0;
  const remaining = s.segmentLeftIsDistance
    ? (left >= 1000 ? (left / 1000).toFixed(2) + ' km' : Math.round(left) + ' m')
    : mmss(left);
  return `${s.plan} · ${s.segment} of ${s.segments} · ${remaining} left`;
}

export interface Suggestion {
  verb: 'lift to' | 'ease to' | 'hold';
  kph: number;
  /** The hill is the walker's until the next stretch. */
  manualIncline: boolean;
}

/** The coach's suggested pace, phrased against the current target. */
export function suggestion(s: SessionState): Suggestion | null {
  const kph = s.suggestPace ?? 0;
  if (!(kph > 0)) return null;
  const delta = kph - (s.targetSpeed || 0);
  const verb = delta > 0.15 ? 'lift to' : delta < -0.15 ? 'ease to' : 'hold';
  return { verb, kph, manualIncline: !s.inclineAuto };
}

/** Warm-up and cool-down are both two minutes — WARMUP_MS / COOLDOWN_MS. */
export const PHASE_SECONDS = 120;

export function phaseProgress(left: number): number {
  return Math.max(0, Math.min(1, 1 - left / PHASE_SECONDS));
}

/** What is coming, phrased as a preview and never as live plan state. A
 *  warm-up that reads "2 of 9 · 1:36 left" is claiming to be a walk that has
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

/** The speeds offered in a side rail: every whole km/h the belt can do.
 *  Below the board's minimum there is no slow, only stopped, so none of those. */
export function speedStops(l: Limits): number[] {
  const out: number[] = [];
  for (let v = Math.ceil(l.minKph); v <= Math.floor(l.maxKph); v++) out.push(v);
  return out;
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

/** No name here: the welcome screen is the question "who is walking". */
export function greeting(hour: number): string {
  if (hour < 12) return 'Good morning';
  if (hour < 18) return 'Good afternoon';
  return 'Good evening';
}

/** How long a coach line stays up: long enough to read twice at a walk, and
 *  scaled with the sentence so a long line is never cut short. */
export const coachHoldMs = (line: string): number => Math.min(18000, Math.max(9000, 5000 + line.length * 90));

/** Seconds per kilometre at a belt speed, or 0 when the belt is barely
 *  turning and a pace would read as hours. */
export const paceSecPerKm = (kph: number | undefined): number =>
  kph && kph >= 0.5 ? Math.round(3600 / kph) : 0;
