import { create } from 'zustand';
import type { CoachLine, Plan, PlanStep, SessionMode, SessionState } from '../bridge/types';
import { elevationFor, type Elevation } from '../lib/path/geometry';
import { normaliseMode, screenFor } from '../lib/session';

/* What Kotlin has told us. Written only by the window.render / plan / coach
   entry points (see bridge/kotlin.ts); read through narrow selectors so a 5 Hz
   snapshot re-renders only the numbers that actually changed. */

export interface CoachState {
  line: string;
  /** Bumped per line, so the ribbon restarts its timer on a repeat. */
  seq: number;
  shown: boolean;
}

interface SessionStore {
  snapshot: SessionState;
  mode: SessionMode;
  planName: string;
  planSteps: PlanStep[];
  elevation: Elevation;
  coach: CoachState;

  render(s: SessionState): void;
  setPlan(p: Plan | null | undefined): void;
  sayCoach(c: CoachLine | null | undefined): void;
  hideCoach(): void;
}

export const useSession = create<SessionStore>()((set, get) => ({
  snapshot: {},
  mode: 'welcome',
  planName: '',
  planSteps: [],
  elevation: elevationFor([]),
  coach: { line: '', seq: 0, shown: false },

  render(s) {
    set({ snapshot: s || {}, mode: normaliseMode(s && s.mode) });
  },

  setPlan(p) {
    const steps = (p && p.steps) || [];
    set({ planName: (p && p.name) || '', planSteps: steps, elevation: elevationFor(steps) });
  },

  sayCoach(c) {
    const line = (c && c.line) || '';
    if (!line) return;
    /* Only over the walk. A line Home Assistant answers a few seconds late,
       after the belt has stopped, used to land on top of the summary. The
       closing line has its own place there and comes by another road
       (summaryLine). */
    if (screenFor(get().mode) !== 'workout') return;
    set({ coach: { line, seq: get().coach.seq + 1, shown: true } });
  },

  hideCoach() {
    if (get().coach.shown) set({ coach: { ...get().coach, shown: false } });
  },
}));

/** One field of the latest snapshot. Primitive in, primitive out, so the
 *  component re-renders only when that value changes. */
export function useField<K extends keyof SessionState>(key: K): SessionState[K] {
  return useSession((st) => st.snapshot[key]);
}

export const useMode = (): SessionMode => useSession((st) => st.mode);
