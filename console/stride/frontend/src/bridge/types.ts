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
  /** Metres climbed this walk. */
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
  suggestPace?: number;
  inclineAuto?: boolean;
  avgSpeed?: number;
  maxSpeed?: number;
  avgIncline?: number;
  summaryLine?: string;
  /** The finished walk on its way to TrailMate: sending | sent | waiting |
   *  failed | reconnect, or empty when it is not going (TrailMate.kt). */
  trailmate?: string;
  /** A belt calibration in progress, or null. */
  calib?: Calibration | null;
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

/** One stretch of a guided walk, resolved by Plan.kt. Times in seconds. */
export interface PlanStep {
  start: number;
  end: number;
  incline: number;
  label: string;
}

export interface Plan {
  name?: string;
  steps?: PlanStep[];
}

export interface CoachLine {
  line?: string;
  kind?: string;
}

/** A route cached on the console (Routes.kt). Segments are [startM, endM, incline]. */
export interface Route {
  id: string;
  name?: string;
  distance_m?: number;
  climb_m?: number;
  segments?: [number, number, number][];
}

/** The @JavascriptInterface object MainActivity injects. */
export interface StrideBridge {
  choose(): void;
  chooseGuided(shape: string, minutes: number): void;
  chooseRoute(id: string, loop: boolean): void;
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
  setWalker(name: string): void;
  ackDmk(): void;
  hushCoach(): void;
  dim(on: boolean): void;
  routes(): string;
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
  /** Open an app, with the walk drawn over it. Kotlin answers with window.overApp. */
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

export interface TrackPoint {
  x: number;
  y: number;
  nx: number;
  ny: number;
}

/** STRIDE.track(): the 400 m stadium, measured by true arc-length. */
export interface Track {
  pathD(inset: number): string;
  atFraction(f: number): TrackPoint;
  dashFraction(f: number): number;
  laps(metres: number): number;
  lapFraction(metres: number): number;
}

export interface UiMeta {
  id: string;
  name: string;
  blurb: string;
  sketch: string;
}

/** window.STRIDE — only the parts this interface uses. */
export interface StrideCore {
  track(opts: { straight: number; radius: number; cx: number; cy: number; squash: number }): Track;
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
  defaultWalker(): string;
  routePoints(r: Route): number[];
  loopedClimb(r: Route): number;
  tappedLoop(e: Event): boolean;
  stub(): boolean;
  demo(opts?: object): unknown;
}

export interface StrideSettings {
  open(): void;
  close(): void;
}

declare global {
  interface Window {
    Stride: StrideBridge;
    STRIDE: StrideCore;
    STRIDE_SETTINGS: StrideSettings;
    render: (s: SessionState) => void;
    plan: (p: Plan) => void;
    coach: (c: CoachLine) => void;
    overApp: (on: boolean) => void;
    /** Calls Kotlin made before the app module ran; see trailmate.html. */
    __early?: { render?: SessionState; plan?: Plan; coach?: CoachLine };
  }
}
