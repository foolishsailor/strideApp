import { create } from 'zustand';
import { bridge } from '../bridge/stride';
import type { Route } from '../bridge/types';
import { NO_ZONES, parseRoutes, parseSchedules, type PersonSchedule, type Zones } from '../lib/schedule';

/* What the console has from TrailMate (spec 038): everyone's schedule and
   the active person's routes. Kotlin fetches and stores them; this page reads
   them from the bridge here, parses them once (lib/schedule), and every
   screen reads the store. Reading is cheap and offline: it is what Kotlin
   last stored. */

interface TrailmateStore {
  /** By person's name. Somebody absent has nothing from TrailMate. */
  schedules: Record<string, PersonSchedule>;
  /** The active person's: Kotlin answers for whoever setRunner last named. */
  routes: Route[];

  loadSchedules(): void;
  loadRoutes(): void;
}

export const useTrailmate = create<TrailmateStore>()((set) => ({
  schedules: {},
  routes: [],
  loadSchedules: () => set({ schedules: parseSchedules(bridge().schedules?.()) }),
  loadRoutes: () => set({ routes: parseRoutes(bridge().routes()) }),
}));

export const useSchedule = (name: string): PersonSchedule | undefined => useTrailmate((s) => s.schedules[name]);

/** A person's zones, or none. */
export const zonesOf = (name: string): Zones => useTrailmate.getState().schedules[name]?.zones ?? NO_ZONES;
