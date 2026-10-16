import { create } from 'zustand';
import { bridge } from '../bridge/stride';
import type { Route, TrailMateKind } from '../bridge/types';
import { NO_ZONES, parseRoutes, parseSchedules, type PersonSchedule, type Zones } from '../lib/schedule';

/* What the console has from TrailMate (spec 038): everyone's schedule and
   the active person's routes. Kotlin fetches and stores them; this page reads
   them from the bridge here, parses them once (lib/schedule), and every
   screen reads the store.

   A page that shows one asks for it afresh on every visit (refresh), and
   shows the console's stored copy meanwhile. Kotlin says when TrailMate has
   answered (window.trailmateRead), and whether it could be reached. */

/** Where a kind stands: being asked for, fresh from TrailMate, or the
 *  console's last copy because TrailMate could not be reached. */
export type Freshness = 'checking' | 'fresh' | 'offline';

interface TrailmateStore {
  /** By person's name. Somebody absent has nothing from TrailMate. */
  schedules: Record<string, PersonSchedule>;
  /** The active person's: Kotlin answers for whoever setRunner last named. */
  routes: Route[];
  freshness: Partial<Record<TrailMateKind, Freshness>>;

  loadSchedules(): void;
  loadRoutes(): void;
  /** Show what is stored, and ask TrailMate for it now. */
  refresh(kind: TrailMateKind): void;
  /** Kotlin's answer to refresh: reload, and note where it came from. */
  read(kind: TrailMateKind, ok: boolean): void;
}

/** If Kotlin never answers, stop saying "checking" after this. */
const GIVE_UP_MS = 20_000;
const giveUp: Partial<Record<TrailMateKind, ReturnType<typeof setTimeout>>> = {};

export const useTrailmate = create<TrailmateStore>()((set, get) => {
  const load = (kind: TrailMateKind) => (kind === 'routes' ? get().loadRoutes() : get().loadSchedules());
  const mark = (kind: TrailMateKind, f: Freshness | undefined) => set({ freshness: { ...get().freshness, [kind]: f } });
  return {
    schedules: {},
    routes: [],
    freshness: {},
    loadSchedules: () => set({ schedules: parseSchedules(bridge().schedules?.()) }),
    loadRoutes: () => set({ routes: parseRoutes(bridge().routes()) }),
    refresh: (kind) => {
      load(kind);
      // An older console cannot be asked: what it has is all there is.
      if (!bridge().refreshTrailMate) return mark(kind, undefined);
      mark(kind, 'checking');
      bridge().refreshTrailMate!(kind);
      clearTimeout(giveUp[kind]);
      giveUp[kind] = setTimeout(() => {
        if (get().freshness[kind] === 'checking') mark(kind, 'offline');
      }, GIVE_UP_MS);
    },
    read: (kind, ok) => {
      clearTimeout(giveUp[kind]);
      load(kind);
      mark(kind, ok ? 'fresh' : 'offline');
    },
  };
});

export const useSchedule = (name: string): PersonSchedule | undefined => useTrailmate((s) => s.schedules[name]);

/** A person's zones, or none. */
export const zonesOf = (name: string): Zones => useTrailmate.getState().schedules[name]?.zones ?? NO_ZONES;
