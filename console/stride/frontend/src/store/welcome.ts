import { create } from 'zustand';
import { bridge, core } from '../bridge/stride';
import { loadSettings } from './settings';
import { useTrailmate, zonesOf } from './trailmate';

/* who → how → which. Purely client side: nothing reaches Kotlin, and the belt
   cannot move, until a run is committed to with BEGIN on the last step.

   The step goes back to the first question every time the welcome screen is
   entered, so a finished run never leaves a half-made choice sitting there. */

export type WelcomeStep = 1 | 2 | 3;
/** Step 2's three answers (spec 038, S-001). */
export type PlanMode = 'manual' | 'routes' | 'workouts';
/** Manual: the pace is yours, or your heart rate sets it. */
export type ManualMode = 'free' | 'hr';

interface WelcomeStore {
  step: WelcomeStep;
  /** Who is running. '' for a guest. */
  runner: string;
  planMode: PlanMode;
  manual: ManualMode;
  /** Manual → Heart rate: the zone to hold, 1–5. */
  hrZone: number | null;
  /** A route's id when one is picked. */
  route: string | null;
  /** Run the chosen route out and home again. A decision about this run, not
   *  the route, so it is never stored and does not follow you to another. */
  loop: boolean;
  /** A planned workout's id when one is picked. */
  workout: string | null;

  goTo(step: WelcomeStep): void;
  back(): void;
  setRunner(name: string): void;
  chooseManual(): void;
  chooseRoutes(): void;
  chooseWorkouts(): void;
  setManual(mode: ManualMode): void;
  setHrZone(zone: number): void;
  pickRoute(id: string): void;
  toggleLoop(id: string): void;
  pickWorkout(id: string): void;
}

export const useWelcome = create<WelcomeStore>()((set, get) => ({
  step: 1,
  runner: '',
  planMode: 'manual',
  manual: 'free',
  hrZone: null,
  route: null,
  loop: false,
  workout: null,

  goTo: (step) => set({ step }),
  back: () => set({ step: Math.max(1, get().step - 1) as WelcomeStep }),
  setRunner: (runner) => set({ runner }),
  chooseManual: () => set({ planMode: 'manual', manual: 'free', hrZone: null, step: 3 }),
  chooseRoutes: () => set({ planMode: 'routes', step: 3 }),
  chooseWorkouts: () => set({ planMode: 'workouts', step: 3 }),
  setManual: (manual) => set({ manual }),
  setHrZone: (hrZone) => set({ manual: 'hr', hrZone }),

  /* Moving to a different route drops the loop rather than carrying it over:
     inheriting it silently is how somebody sets off on twice the run they
     chose. */
  pickRoute: (id) => set({ route: id, loop: id === get().route ? get().loop : false }),

  /* Tapping the mark picks that route as well as looping it, the way repeat on
     a music player applies to what is playing. */
  toggleLoop: (id) => set({ route: id, loop: id === get().route ? !get().loop : true }),

  pickWorkout: (workout) => set({ workout }),
}));

/** The runner Settings names as the default, read once at start. */
export function initWelcome(): void {
  useWelcome.setState({ runner: core().defaultRunner() });
}

/** Somebody says who they are: Kotlin makes them the active person, and
 *  their units, warm-up and routes replace the last runner's. */
export function selectRunner(name: string): void {
  useWelcome.getState().setRunner(name);
  bridge().setRunner(name);
  loadSettings();
  useTrailmate.getState().loadRoutes();
}

/** Straight from a workout on the home screen to its preview, as that person. */
export function openWorkout(name: string, id: string): void {
  selectRunner(name);
  useWelcome.setState({ planMode: 'workouts', workout: id, step: 3 });
}

/** The heart-rate band Manual → Heart rate would hold, or null without one. */
export function chosenHrBand(s: Pick<WelcomeStore, 'runner' | 'hrZone'>) {
  return zonesOf(s.runner).hr.find((z) => z.zone === s.hrZone) ?? null;
}

/** BEGIN has something to begin. */
export function canBegin(s: WelcomeStore): boolean {
  if (s.planMode === 'routes') return !!s.route;
  if (s.planMode === 'workouts') return !!s.workout;
  return s.manual === 'free' || !!chosenHrBand(s);
}

/** BEGIN: the one place a run is committed to. */
export function begin(): void {
  const s = useWelcome.getState();
  if (!canBegin(s)) return;
  const b = bridge();
  if (s.planMode === 'routes') b.chooseRoute(s.route!, s.loop);
  else if (s.planMode === 'workouts') b.chooseWorkout(s.workout!);
  else if (s.manual === 'hr') {
    const z = chosenHrBand(s)!;
    b.chooseHeartRate(z.zone, z.minBpm, z.maxBpm);
  } else b.choose();
}
