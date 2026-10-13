import type {
  Route, ScheduleState, StepRepeat, StepTarget, WirePersonSchedule, WireStep, WireTarget, WireWorkout, WireZones,
} from '../bridge/types';

/* Each person's TrailMate plan, as the screens use it (spec 038). The bridge
   hands over TrailMate's own shapes (bridge/types.ts, Wire*); they are read
   here once, defensively, into these models, so no component guards a field
   or converts a unit. Pure: the store calls it, the tests call it. */

/** How a step ends. `open` is Garmin's lap button: the runner presses NEXT. */
export type StepEnd =
  | { type: 'time'; seconds: number }
  | { type: 'distance'; metres: number }
  | { type: 'open' };

export interface PlannedStep {
  kind: string;
  label: string;
  end: StepEnd;
  target: StepTarget;
  /** %, or null to leave the deck where it is. */
  incline: number | null;
  note: string;
  repeat: StepRepeat | null;
}

export interface PlannedWorkout {
  id: string;
  /** YYYY-MM-DD, the console's own calendar. */
  date: string;
  name: string;
  /** TrailMate's workoutType (easy, tempo, …), or '' for none. */
  type: string;
  sport: string;
  /** A run, so the treadmill can do it. Strength and the like are listed, not run. */
  runnable: boolean;
  description: string;
  durationS: number | null;
  distanceM: number | null;
  /** Done already (on a watch, or here): what was actually run. */
  done: { distanceM: number | null; durationS: number | null } | null;
  steps: PlannedStep[];
}

export interface HrZone { zone: number; minBpm: number; maxBpm: number }
export interface PaceZone { zone: number; minKph: number; maxKph: number }

export interface Zones {
  pace: PaceZone[];
  hr: HrZone[];
  maxHr: number | null;
  restingHr: number | null;
}

export interface PersonSchedule {
  state: ScheduleState;
  /** When TrailMate last answered, epoch ms; 0 for never. */
  fetchedAt: number;
  zones: Zones;
  workouts: PlannedWorkout[];
}

export const NO_ZONES: Zones = { pace: [], hr: [], maxHr: null, restingHr: null };

const KPH_PER_MS = 3.6;
const STATES: readonly ScheduleState[] = ['unlinked', 'reconnect', 'scope', 'never', 'ok', 'error'];

const num = (v: unknown): number | null => (typeof v === 'number' && isFinite(v) ? v : null);
const str = (v: unknown): string => (typeof v === 'string' ? v : '');

/** TrailMate's target, in the units the run snapshot uses. A pace or heart
 *  rate with a zone but no range is a zone the profile could not resolve. */
export function parseTarget(t: WireTarget | undefined | null): StepTarget {
  const zone = num(t?.zone);
  switch (t?.type) {
    case 'pace': {
      const lo = num(t.minMs), hi = num(t.maxMs);
      if (lo !== null && hi !== null) return { type: 'pace', minKph: lo * KPH_PER_MS, maxKph: hi * KPH_PER_MS, zone };
      return zone !== null ? { type: 'zone', of: 'pace', zone } : { type: 'none' };
    }
    case 'hr': {
      const lo = num(t.minBpm), hi = num(t.maxBpm);
      if (lo !== null && hi !== null) return { type: 'hr', minBpm: lo, maxBpm: hi, zone };
      return zone !== null ? { type: 'zone', of: 'hr', zone } : { type: 'none' };
    }
    case 'cadence': {
      const lo = num(t.minSpm), hi = num(t.maxSpm);
      return lo !== null && hi !== null ? { type: 'cadence', minSpm: lo, maxSpm: hi } : { type: 'none' };
    }
    default:
      return { type: 'none' };
  }
}

function parseEnd(e: WireStep['end']): StepEnd {
  const v = num(e?.value);
  if (e?.type === 'time' && v !== null) return { type: 'time', seconds: v };
  if (e?.type === 'distance' && v !== null) return { type: 'distance', metres: v };
  return { type: 'open' };
}

function parseStep(s: WireStep): PlannedStep {
  return {
    kind: str(s.kind) || 'other',
    label: str(s.label) || 'Step',
    end: parseEnd(s.end),
    target: parseTarget(s.target),
    incline: num(s.inclinePct),
    note: str(s.note),
    repeat: s.repeat && num(s.repeat.index) !== null && num(s.repeat.of) !== null ? { index: s.repeat.index, of: s.repeat.of } : null,
  };
}

export function parseWorkout(w: WireWorkout): PlannedWorkout {
  const done = w.completed ? { distanceM: num(w.completedActivity?.distanceM), durationS: num(w.completedActivity?.durationS) } : null;
  return {
    id: str(w.id),
    date: str(w.date),
    name: str(w.name) || 'Workout',
    type: str(w.type),
    sport: str(w.sport) || 'running',
    runnable: w.runnable !== false,
    description: str(w.description),
    durationS: num(w.estimatedDurationS),
    distanceM: num(w.estimatedDistanceM),
    done,
    steps: Array.isArray(w.steps) ? w.steps.map(parseStep) : [],
  };
}

export function parseZones(z: WireZones | undefined | null): Zones {
  if (!z) return NO_ZONES;
  const maxHr = num(z.maxHr);
  return {
    pace: (z.pace || []).map((p) => ({ zone: p.zone, minKph: p.minMs * KPH_PER_MS, maxKph: p.maxMs * KPH_PER_MS })),
    // An open-ended top zone ends at the runner's maximum; with no maximum it cannot be held.
    hr: (z.hr || []).flatMap((h) => {
      const top = num(h.maxBpm) ?? maxHr;
      return top === null ? [] : [{ zone: h.zone, minBpm: h.minBpm, maxBpm: top }];
    }),
    maxHr,
    restingHr: num(z.restingHr),
  };
}

function parsePerson(p: WirePersonSchedule): PersonSchedule {
  return {
    state: p.state && STATES.indexOf(p.state) >= 0 ? p.state : 'never',
    fetchedAt: num(p.fetchedAt) ?? 0,
    zones: parseZones(p.zones),
    workouts: (p.workouts || []).filter((w) => w && w.id).map(parseWorkout),
  };
}

/** schedules() → everyone's plan, by name. Anything unreadable is nobody's. */
export function parseSchedules(json: string | undefined): Record<string, PersonSchedule> {
  try {
    const o = JSON.parse(json || '{}') as Record<string, WirePersonSchedule>;
    const out: Record<string, PersonSchedule> = {};
    for (const name of Object.keys(o)) if (o[name]) out[name] = parsePerson(o[name]!);
    return out;
  } catch {
    return {};
  }
}

/** routes() → the active person's routes. */
export function parseRoutes(json: string | undefined): Route[] {
  try {
    const list = JSON.parse(json || '[]') as Route[];
    return Array.isArray(list) ? list.filter((r) => r && r.id) : [];
  } catch {
    return [];
  }
}

/* ---- what a screen does with it ------------------------------------------ */

/** Whether a person's card says anything about TrailMate, and what.
 *  Nothing for a guest or someone not linked (or not fetched yet). */
export type ScheduleView = 'none' | 'reconnect' | 'schedule';

export function scheduleView(p: PersonSchedule | undefined): ScheduleView {
  if (!p || p.state === 'unlinked' || p.state === 'never') return 'none';
  if (p.state === 'scope' || p.state === 'reconnect') return 'reconnect';
  return 'schedule';
}

export const RECONNECT_TEXT = 'Reconnect TrailMate to see your workouts';

/** The local calendar date, YYYY-MM-DD: what TrailMate's dates mean. */
export function localDate(d: Date): string {
  const two = (n: number) => (n < 10 ? '0' : '') + n;
  return `${d.getFullYear()}-${two(d.getMonth() + 1)}-${two(d.getDate())}`;
}

/** A YYYY-MM-DD read as local midnight, never as UTC. */
export function dateOfIso(iso: string): Date {
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(y ?? 1970, (m ?? 1) - 1, d ?? 1);
}

export function addDays(iso: string, n: number): string {
  const d = dateOfIso(iso);
  d.setDate(d.getDate() + n);
  return localDate(d);
}

/** "Today", "Tomorrow", then the weekday. */
export function dayLabel(iso: string, today: string): string {
  if (iso === today) return 'Today';
  if (iso === addDays(today, 1)) return 'Tomorrow';
  return dateOfIso(iso).toLocaleDateString('en-GB', { weekday: 'long' });
}

/** The caption beside a day's label: "Tuesday 13 October" beside "Today",
 *  "15 October" beside "Thursday", which has said the weekday already. */
export function dayCaption(iso: string, today?: string): string {
  const named = today !== undefined && dayLabel(iso, today) !== 'Today' && dayLabel(iso, today) !== 'Tomorrow';
  return dateOfIso(iso).toLocaleDateString('en-GB', named ? { day: 'numeric', month: 'long' } : { weekday: 'long', day: 'numeric', month: 'long' });
}

/** The date alone, short, under a day's name in a compact list: "13 Oct". */
export function dayShortCaption(iso: string): string {
  return dateOfIso(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
}

export interface ScheduleDay {
  date: string;
  workouts: PlannedWorkout[];
}

/** `days` days from `today`, each with its workouts in TrailMate's order;
 *  a day with none is a rest day. */
export function scheduleDays(workouts: readonly PlannedWorkout[], today: string, days: number): ScheduleDay[] {
  const out: ScheduleDay[] = [];
  for (let i = 0; i < days; i++) {
    const date = addDays(today, i);
    out.push({ date, workouts: workouts.filter((w) => w.date === date) });
  }
  return out;
}

/** Older than a day, the schedule says how old: it may be out of date. */
const STALE_MS = 24 * 3600 * 1000;
export function staleness(fetchedAt: number, now: number): string {
  if (!fetchedAt || now - fetchedAt < STALE_MS) return '';
  const days = Math.floor((now - fetchedAt) / STALE_MS);
  return `Last updated ${days === 1 ? 'a day' : days + ' days'} ago`;
}

/* ---- workout types ---------------------------------------------------------- */

/** TrailMate's workout types with a colour of their own (theme `workout`). */
export type ToneType = 'easy' | 'tempo' | 'intervals' | 'hills' | 'longRun' | 'recovery' | 'threshold' | 'speed';

const TONES: Record<string, ToneType> = {
  easy: 'easy', tempo: 'tempo', intervals: 'intervals', hills: 'hills', long_run: 'longRun',
  recovery: 'recovery', threshold: 'threshold', speed: 'speed',
};

/** The type's colour, or null for the accent (race, park run, anything else). */
export const typeTone = (type: string): ToneType | null => TONES[type] ?? null;

/** TrailMate's own names for its types (WORKOUT_TYPE_CONFIGS). */
const TYPE_LABELS: Record<string, string> = {
  easy: 'Easy run', tempo: 'Tempo run', intervals: 'Intervals', hills: 'Hill repeats', long_run: 'Long run',
  park_run: 'Park run', recovery: 'Recovery run', threshold: 'Threshold', speed: 'Speed work', race: 'Race',
  strength: 'Strength', rest: 'Rest day', cross_training: 'Cross training', fitness_test: 'Fitness test',
};

const words = (key: string): string => {
  const s = key.split('_').join(' ');
  return s.charAt(0).toUpperCase() + s.slice(1);
};

/** The label over a workout's name: its type, or its sport when it is not a run. */
export function typeLabel(w: Pick<PlannedWorkout, 'type' | 'sport' | 'runnable'>): string {
  if (w.type) return TYPE_LABELS[w.type] ?? words(w.type);
  return w.runnable ? 'Run' : words(w.sport);
}
