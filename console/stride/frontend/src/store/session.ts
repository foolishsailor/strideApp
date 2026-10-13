import { create } from 'zustand';
import type { Plan, PlanStep, SessionMode, SessionState } from '../bridge/types';
import { normaliseMode } from '../lib/session';
import { record } from './history';

/* What Kotlin has told us. Written only by the window.render / plan entry
   points (see bridge/kotlin.ts); read through narrow selectors so a 5 Hz
   snapshot re-renders only the numbers that actually changed. */

interface SessionStore {
  snapshot: SessionState;
  mode: SessionMode;
  planName: string;
  planSteps: PlanStep[];
  /** A route's steps are metres; a workout's are seconds. */
  planByDistance: boolean;

  render(s: SessionState): void;
  setPlan(p: Plan | null | undefined): void;
}

export const useSession = create<SessionStore>()((set) => ({
  snapshot: {},
  mode: 'welcome',
  planName: '',
  planSteps: [],
  planByDistance: false,

  render(s) {
    const mode = normaliseMode(s && s.mode);
    set({ snapshot: s || {}, mode });
    record(s || {}, mode);
  },

  setPlan(p) {
    set({ planName: (p && p.name) || '', planSteps: (p && p.steps) || [], planByDistance: !!(p && p.byDistance) });
  },
}));

/** One field of the latest snapshot. Primitive in, primitive out, so the
 *  component re-renders only when that value changes. */
export function useField<K extends keyof SessionState>(key: K): SessionState[K] {
  return useSession((st) => st.snapshot[key]);
}

export const useMode = (): SessionMode => useSession((st) => st.mode);
