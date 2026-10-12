import { create } from 'zustand';
import type { Plan, PlanStep, SessionMode, SessionState } from '../bridge/types';
import { elevationFor, type Elevation } from '../lib/path/geometry';
import { normaliseMode } from '../lib/session';

/* What Kotlin has told us. Written only by the window.render / plan entry
   points (see bridge/kotlin.ts); read through narrow selectors so a 5 Hz
   snapshot re-renders only the numbers that actually changed. */

interface SessionStore {
  snapshot: SessionState;
  mode: SessionMode;
  planName: string;
  planSteps: PlanStep[];
  elevation: Elevation;

  render(s: SessionState): void;
  setPlan(p: Plan | null | undefined): void;
}

export const useSession = create<SessionStore>()((set) => ({
  snapshot: {},
  mode: 'welcome',
  planName: '',
  planSteps: [],
  elevation: elevationFor([]),

  render(s) {
    set({ snapshot: s || {}, mode: normaliseMode(s && s.mode) });
  },

  setPlan(p) {
    const steps = (p && p.steps) || [];
    set({ planName: (p && p.name) || '', planSteps: steps, elevation: elevationFor(steps) });
  },
}));

/** One field of the latest snapshot. Primitive in, primitive out, so the
 *  component re-renders only when that value changes. */
export function useField<K extends keyof SessionState>(key: K): SessionState[K] {
  return useSession((st) => st.snapshot[key]);
}

export const useMode = (): SessionMode => useSession((st) => st.mode);
