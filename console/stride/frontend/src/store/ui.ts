import { create } from 'zustand';

/* What this page is showing that Kotlin does not know about: menus, the
   pause question, sleep. Never sent anywhere. The one exception is overApp,
   which Kotlin owns and tells us about through window.overApp. */

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
  /** The APPS picker. */
  appsOpen: boolean;
  /** Drawn over another app (OverApp.kt), rather than STRIDE's own screen. */
  overApp: boolean;
  /** Over another app, the two drawers: the numbers along the top, and the
   *  rails and dock. Both open each time an app is opened. */
  metricsOpen: boolean;
  controlsOpen: boolean;
  /** Bumped when Settings closes, since somebody may have just added themselves. */
  peopleVersion: number;

  setFanOpen(open: boolean): void;
  setConfirmOpen(open: boolean): void;
  setAsleep(asleep: boolean): void;
  setAppsOpen(open: boolean): void;
  setOverApp(on: boolean): void;
  setMetricsOpen(open: boolean): void;
  setControlsOpen(open: boolean): void;
  peopleChanged(): void;
}

export const useUi = create<UiStore>()((set) => ({
  fanOpen: false,
  confirmOpen: false,
  asleep: false,
  appsOpen: false,
  overApp: false,
  metricsOpen: true,
  controlsOpen: true,
  peopleVersion: 0,

  setFanOpen: (fanOpen) => set({ fanOpen }),
  setConfirmOpen: (confirmOpen) => set({ confirmOpen }),
  setAsleep: (asleep) => set({ asleep }),
  setAppsOpen: (appsOpen) => set({ appsOpen }),
  setOverApp: (overApp) => set({ overApp, metricsOpen: true, controlsOpen: true }),
  setMetricsOpen: (metricsOpen) => set({ metricsOpen }),
  setControlsOpen: (controlsOpen) => set({ controlsOpen }),
  peopleChanged: () => set((s) => ({ peopleVersion: s.peopleVersion + 1 })),
}));
