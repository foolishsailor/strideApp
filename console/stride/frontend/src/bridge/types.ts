/* The contract with Kotlin and with the shared core, typed once.

   Kotlin owns the treadmill; this page owns the screen. Everything that
   crosses between them is in this file: the `Stride` @JavascriptInterface
   object (page → Kotlin), the snapshot Kotlin pushes through `window.render`
   at ~5 Hz (Kotlin → page), and `window.STRIDE`, the core every interface
   shares (stride-core.js). If a field is not here, the page does not use it. */

export type SessionMode = 'welcome' | 'warmup' | 'running' | 'paused' | 'cooldown' | 'summary';

/** One snapshot from MainActivity. Every field is optional on purpose: an older
 *  APK may not send the newer ones, and the screen must still draw. */
export interface SessionState {
  mode?: string;
  dmk?: boolean;
  speed?: number;
  incline?: number;
  targetSpeed?: number;
  targetIncline?: number;
  elapsed?: number;
  distance?: number;
  calories?: number;
  pulse?: number;
  /** Foot pod: steps per minute, watts, metres per step, the pod's own km/h. */
  cadence?: number;
  power?: number;
  strideM?: number;
  podKph?: number;
  /** Metres climbed this run. */
  climbM?: number;
  fan?: number;
  ramping?: string;
  phaseLeft?: number;
  workout?: string;
  plan?: string;
  segment?: number;
  segments?: number;
  segmentLabel?: string;
  segmentLeft?: number;
  segmentLeftIsDistance?: boolean;
  /** Where the run is in its plan: seconds on a workout, metres on a route. */
  planElapsed?: number;
  /** The foot pod's steady km/h at this speed, ready for SYNC TO POD; 0 until
   *  it has ten steady seconds. */
  podSyncKph?: number;
  inclineAuto?: boolean;
  avgSpeed?: number;
  maxSpeed?: number;
  avgIncline?: number;
  /** The finished run on its way to TrailMate: sending | sent | waiting |
   *  failed | reconnect, or empty when it is not going (TrailMate.kt). */
  trailmate?: string;
  /** A belt calibration in progress, or null. */
  calib?: Calibration | null;
  /** A TrailMate workout or heart-rate run under way, or null (WorkoutView.kt). */
  workoutStep?: WorkoutStep | null;
}

/* ---- workouts (spec 038) ------------------------------------------------- */

/** A step's target as the screen reads it: km/h and bpm. The run snapshot
 *  sends it this way; schedules() sends pace in m/s, which lib/schedule turns
 *  into this on the way in, so one formatter serves both. `zone` is a zone
 *  the profile could not resolve: shown, never driven from. */
export type StepTarget =
  | { type: 'none' }
  | { type: 'pace'; minKph: number; maxKph: number; zone: number | null }
  | { type: 'hr'; minBpm: number; maxBpm: number; zone: number | null }
  | { type: 'cadence'; minSpm: number; maxSpm: number }
  | { type: 'zone'; of: 'pace' | 'hr'; zone: number };

/** How heart-rate control is doing (HrControl.State). */
export type HrState = 'settling' | 'holding' | 'raising' | 'easing' | 'dropping' | 'no_hr';

export interface StepRepeat {
  index: number;
  of: number;
}

/** The step of a workout under way (WorkoutView.kt), in every snapshot. */
export interface WorkoutStep {
  plannedId: string;
  name: string;
  /** 1-based. */
  step: number;
  steps: number;
  label: string;
  kind: string;
  note: string;
  repeat: StepRepeat | null;
  target: StepTarget;
  /** The incline the step sets, %, or null when it leaves the deck alone. */
  incline: number | null;
  /** Seconds or metres left, or null for an open step. */
  left: number | null;
  leftIsDistance: boolean;
  /** Ended by NEXT (Garmin's lap button), not by time or distance. */
  open: boolean;
  nextLabel: string;
  nextTarget: StepTarget | null;
  /** False once the runner has taken that control by hand, until the next step. */
  speedAuto: boolean;
  inclineAuto: boolean;
  hrState: HrState | null;
  /** The zone the heart rate is in now, when the runner's zones are known. */
  hrZoneNow: number | null;
}

/* What schedules() carries: TrailMate's own shapes (contracts/api.md §3),
   stored by Kotlin as they came. Parsed once, by lib/schedule. */

/** A step's target as TrailMate sends it: pace in m/s. */
export interface WireTarget {
  type: string;
  minMs?: number | null;
  maxMs?: number | null;
  minBpm?: number | null;
  maxBpm?: number | null;
  minSpm?: number | null;
  maxSpm?: number | null;
  zone?: number | null;
}

/** One flattened step of stride.plannedWorkout.v1. */
export interface WireStep {
  kind?: string;
  label?: string;
  end?: { type?: string; value?: number | null };
  target?: WireTarget;
  inclinePct?: number | null;
  note?: string | null;
  repeat?: StepRepeat | null;
}

/** stride.plannedWorkout.v1. */
export interface WireWorkout {
  id: string;
  /** The console's local calendar date, YYYY-MM-DD. */
  date: string;
  name?: string;
  type?: string | null;
  sport?: string;
  runnable?: boolean;
  description?: string | null;
  estimatedDurationS?: number | null;
  estimatedDistanceM?: number | null;
  completed?: boolean;
  completedActivity?: { distanceM?: number | null; durationS?: number | null } | null;
  steps?: WireStep[];
}

export interface WireZones {
  pace?: { zone: number; minMs: number; maxMs: number }[];
  hr?: { zone: number; minBpm: number; maxBpm: number | null }[];
  maxHr?: number | null;
  restingHr?: number | null;
}

/** How a person's TrailMate link and last fetch stand (TrailMateView.kt). */
export type ScheduleState = 'unlinked' | 'reconnect' | 'scope' | 'never' | 'ok' | 'error';

/** One person in schedules(). */
export interface WirePersonSchedule {
  state?: ScheduleState;
  fetchedAt?: number;
  from?: string;
  scopes?: string[];
  zones?: WireZones;
  workouts?: WireWorkout[];
}

/** A saved calibration point: to really get `kph`, the board is sent `belt`. */
export interface CalibrationPoint {
  kph: number;
  belt: number;
}

/** A belt calibration in progress (CalibrationLive in Session.kt). km/h throughout. */
export interface Calibration {
  /** The true speed being calibrated: what the dial says. */
  kph: number;
  /** What the board is being sent for it. */
  belt: number;
  /** What the saved table would send for `kph`. */
  tableBelt: number;
  /** The pod's average since the belt last changed, or 0. */
  podKph: number;
  /** Seconds of steady readings behind `podKph`. */
  podSecs: number;
  /** Enough readings for "Use Stryd reading". */
  ready: boolean;
  /** A pod is connected and reading. */
  pod: boolean;
  /** Paces per mile rather than per kilometre. */
  miles: boolean;
  points: CalibrationPoint[];
  note: string;
}

/** One stretch of a guided run, resolved by Plan.kt. Times in seconds. */
export interface PlanStep {
  start: number;
  end: number;
  incline: number;
  label: string;
}

export interface Plan {
  name?: string;
  /** A route's steps are metres; a workout's are seconds. */
  byDistance?: boolean;
  steps?: PlanStep[];
}

/** One of the active person's routes (Routes.kt): a route they starred in
 *  TrailMate, or an upcoming race's course. Segments are [startM, endM, incline]. */
export interface Route {
  id: string;
  kind?: 'route' | 'race';
  name?: string;
  /** A race's date, YYYY-MM-DD. */
  date?: string;
  run_count?: number;
  distance_m?: number;
  climb_m?: number;
  segments?: [number, number, number][];
}

/** What a page can ask TrailMate for afresh (TrailMateSync.SCHEDULE, ROUTES). */
export type TrailMateKind = 'schedule' | 'routes';

/** The @JavascriptInterface object MainActivity injects. */
export interface StrideBridge {
  /** Manual, free: the pace is the runner's. */
  choose(): void;
  chooseRoute(id: string, loop: boolean): void;
  /** A route with the speed held to a heart-rate band, as chooseHeartRate. */
  chooseRouteHeartRate?(id: string, loop: boolean, zone: number, minBpm: number, maxBpm: number): void;
  /** One of the active person's planned workouts, by id. */
  chooseWorkout(id: string): void;
  /** Manual, heart rate: hold zone 1–5 of their zones, or with 0 the bpm range. */
  chooseHeartRate(zone: number, minBpm: number, maxBpm: number): void;
  /** End the workout's current step: an open step's only way out. */
  nextStep(): void;
  /** The speed menu: hand the speed back to the workout's step, or take it. */
  setSpeedAuto?(auto: boolean): void;
  /** The speed menu: match the belt to the foot pod. Answers {ok, note}. */
  syncToPod?(): string;
  skipWarmup(): void;
  skipCooldown(): void;
  pause(): void;
  resume(): void;
  end(): void;
  home(): void;
  speed(delta: number): void;
  incline(delta: number): void;
  setSpeed(kph: number): void;
  setIncline(pct: number): void;
  setFan(level: number): void;
  setRunner(name: string): void;
  ackDmk(): void;
  dim(on: boolean): void;
  /** The active person's routes, as JSON Route[]. */
  routes(): string;
  /** Ask TrailMate for the active runner's schedule or routes now;
   *  window.trailmateRead follows. */
  refreshTrailMate?(kind: TrailMateKind): void;
  /** Everyone's TrailMate schedule, JSON { [name]: WirePersonSchedule }.
   *  Optional, with refreshSchedules: an older APK has neither. */
  schedules?(): string;
  /** Ask TrailMate again for everyone, now. */
  refreshSchedules?(): void;
  /** Belt calibration — see BeltCalibration.kt. The panel drives these. */
  calNudge(delta: number): void;
  calUseStryd(): void;
  calSave(): void;
  calDone(): void;
  /** Settings.kt json(): every saved setting, as JSON. */
  settingsJson?(): string;
  /** {minGrade, maxGrade, minKph, maxKph} as JSON. Not stubbed in a browser. */
  boardLimits?(): string;
  /** Apps the console can open, as JSON AppEntry[] (OverApp.kt). Optional:
   *  an older APK has none of these four. */
  apps?(): string;
  /** Open an app, with the run drawn over it. Kotlin answers with window.overApp. */
  openApp?(pkg: string): void;
  /** Over an app: the boxes that take touches, as JSON [[x, y, w, h], …] in
   *  screen pixels, or "all". Touches anywhere else go to the app underneath. */
  touchable?(json: string): void;
  /** Over an app: back to STRIDE full screen. */
  closeApp?(): void;
}

/** One app the console can open. `icon` is a PNG data URL, or empty. */
export interface AppEntry {
  pkg: string;
  name: string;
  icon?: string;
}

export interface UiMeta {
  id: string;
  name: string;
  blurb: string;
  sketch: string;
}

/** window.STRIDE — only the parts this interface uses. */
export interface StrideCore {
  tap(el: Element, fn: (e: Event) => void): Element;
  stepper(el: Element, fn: (delta: number) => void, fine: number, coarse: number): Element;
  suppress(ms: number): void;
  /** True in the moment after the screen woke, when no tap should count. */
  justWoke(): boolean;
  wakeStep(overlay: Element, done: () => void): void;
  mmss(seconds: number): string;
  nf(n: number): string;
  profiles(): string[];
  people(): unknown[];
  defaultRunner(): string;
  loopedClimb(r: Route): number;
  stub(): boolean;
  demo(opts?: object): unknown;
}

export interface StrideSettings {
  /** "me": the runner's own settings; "treadmill" (the default): the machine's. */
  open(which?: 'me' | 'treadmill'): void;
  close(): void;
}

declare global {
  interface Window {
    Stride: StrideBridge;
    STRIDE: StrideCore;
    STRIDE_SETTINGS: StrideSettings;
    render: (s: SessionState) => void;
    plan: (p: Plan) => void;
    /** Kotlin calls this when the treadmill's own STOP is pressed. */
    stopPressed: () => void;
    overApp: (on: boolean) => void;
    /** Kotlin: a kind the page asked for has been read; ok is false when
     *  TrailMate could not be reached and the console's last copy stands. */
    trailmateRead: (kind: TrailMateKind, ok: boolean) => void;
    /** Calls Kotlin made before the app module ran; see trailmate.html. */
    __early?: { render?: SessionState; plan?: Plan };
  }
}
