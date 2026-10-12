import { create } from 'zustand';
import { core } from '../bridge/stride';

/* who → how → which. Purely client side: nothing reaches Kotlin, and the belt
   cannot move, until a walk is committed to on the last step.

   The duration and shape survive between walks, as they always have; the
   step goes back to the first question every time the welcome screen is
   entered, so a finished walk never leaves a half-made choice sitting there. */

export type WelcomeStep = 1 | 2 | 3;
export type PlanMode = 'shapes' | 'routes';

interface WelcomeStore {
  step: WelcomeStep;
  /** Who is walking. '' for a guest. */
  walker: string;
  planMode: PlanMode;
  minutes: number;
  shape: string;
  /** A route's id when one is picked. Alternatives with `shape` for one slot. */
  route: string | null;
  /** Walk the chosen route out and home again. A decision about this walk, not
   *  the route, so it is never stored and does not follow you to another. */
  loop: boolean;

  goTo(step: WelcomeStep): void;
  back(): void;
  setWalker(name: string): void;
  chooseShapes(): void;
  chooseRoutes(): void;
  setMinutes(m: number): void;
  setShape(id: string): void;
  pickRoute(id: string): void;
  toggleLoop(id: string): void;
}

export const useWelcome = create<WelcomeStore>()((set, get) => ({
  step: 1,
  walker: '',
  planMode: 'shapes',
  minutes: 30,
  shape: 'rolling',
  route: null,
  loop: false,

  goTo: (step) => set({ step }),
  back: () => set({ step: Math.max(1, get().step - 1) as WelcomeStep }),
  setWalker: (walker) => set({ walker }),
  chooseShapes: () => set({ planMode: 'shapes', route: null, loop: false, step: 3 }),
  chooseRoutes: () => set({ planMode: 'routes', step: 3 }),
  setMinutes: (minutes) => set({ minutes }),
  setShape: (shape) => set({ shape }),

  /* Moving to a different route drops the loop rather than carrying it over:
     inheriting it silently is how somebody sets off on twice the walk they
     chose. */
  pickRoute: (id) => set({ route: id, loop: id === get().route ? get().loop : false }),

  /* Tapping the mark picks that route as well as looping it, the way repeat on
     a music player applies to what is playing. */
  toggleLoop: (id) => set({ route: id, loop: id === get().route ? !get().loop : true }),
}));

/** The walker Settings names as the default, read once at start. */
export function initWelcome(): void {
  useWelcome.setState({ walker: core().defaultWalker() });
}
