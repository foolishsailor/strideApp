import { create } from 'zustand';

/* What this page is showing that Kotlin does not know about: menus, the
   pause question, sleep. Never sent anywhere. */

/** Idle time is a duration, so it is measured with performance.now(), not the
 *  wall clock. The board boots with its RTC at 2009 and NTP corrects it a
 *  minute later — a seventeen-year jump that once put the screen to sleep on
 *  the spot. Kept outside React state: it changes on every touch and nothing
 *  renders from it. */
let lastActivity = performance.now();
export const markActivity = (): void => {
  lastActivity = performance.now();
};
export const idleMs = (): number => performance.now() - lastActivity;

interface UiStore {
  fanOpen: boolean;
  confirmOpen: boolean;
  asleep: boolean;
  /** Bumped when Settings closes, since somebody may have just added themselves. */
  peopleVersion: number;

  setFanOpen(open: boolean): void;
  setConfirmOpen(open: boolean): void;
  setAsleep(asleep: boolean): void;
  peopleChanged(): void;
}

export const useUi = create<UiStore>()((set) => ({
  fanOpen: false,
  confirmOpen: false,
  asleep: false,
  peopleVersion: 0,

  setFanOpen: (fanOpen) => set({ fanOpen }),
  setConfirmOpen: (confirmOpen) => set({ confirmOpen }),
  setAsleep: (asleep) => set({ asleep }),
  peopleChanged: () => set((s) => ({ peopleVersion: s.peopleVersion + 1 })),
}));
