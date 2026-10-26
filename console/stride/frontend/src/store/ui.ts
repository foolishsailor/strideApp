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
  /** The speed menu: AUTO / MANUAL and SYNC TO POD. */
  speedMenuOpen: boolean;
  /** The settings popup, mid-run: My settings or Treadmill settings. */
  settingsOpen: boolean;
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
  /** Over another app, the numbers as one short line rather than the full
   *  strip. Kept for the session: chosen once, it holds across apps. */
  metricsCompact: boolean;
  /** Bumped when Settings closes, since somebody may have just added themselves. */
  peopleVersion: number;

  setFanOpen(open: boolean): void;
  setSpeedMenuOpen(open: boolean): void;
  setSettingsOpen(open: boolean): void;
  setConfirmOpen(open: boolean): void;
  setAsleep(asleep: boolean): void;
  setAppsOpen(open: boolean): void;
  setOverApp(on: boolean): void;
  setMetricsOpen(open: boolean): void;
  setControlsOpen(open: boolean): void;
  setMetricsCompact(compact: boolean): void;
  peopleChanged(): void;
}

export const useUi = create<UiStore>()((set) => ({
  fanOpen: false,
  speedMenuOpen: false,
  settingsOpen: false,
  confirmOpen: false,
  asleep: false,
  appsOpen: false,
  overApp: false,
  metricsOpen: true,
  controlsOpen: true,
  metricsCompact: false,
  peopleVersion: 0,

  setFanOpen: (fanOpen) => set({ fanOpen }),
  setSpeedMenuOpen: (speedMenuOpen) => set({ speedMenuOpen }),
  setSettingsOpen: (settingsOpen) => set({ settingsOpen }),
  setConfirmOpen: (confirmOpen) => set({ confirmOpen }),
  setAsleep: (asleep) => set({ asleep }),
  setAppsOpen: (appsOpen) => set({ appsOpen }),
  setOverApp: (overApp) => set({ overApp, metricsOpen: true, controlsOpen: true }),
  setMetricsOpen: (metricsOpen) => set({ metricsOpen }),
  setControlsOpen: (controlsOpen) => set({ controlsOpen }),
  setMetricsCompact: (metricsCompact) => set({ metricsCompact }),
  peopleChanged: () => set((s) => ({ peopleVersion: s.peopleVersion + 1 })),
}));
