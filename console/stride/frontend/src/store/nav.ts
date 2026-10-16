import { create } from 'zustand';
import type { RouteSort } from '../lib/routes';

/* Where a runner is in the shell (components/layout/AppShell): the pages on
   the side rail, and whether the rail is folded to its icons. */

export type Section = 'run' | 'history';

const COLLAPSED_KEY = 'stride.railCollapsed';

/** Kept across starts: the WebView has local storage (MainActivity turns it on). */
function readCollapsed(): boolean {
  try {
    return localStorage.getItem(COLLAPSED_KEY) === 'true';
  } catch {
    return false;
  }
}

interface NavStore {
  section: Section;
  railCollapsed: boolean;
  /** How the Routes list is ordered, kept while the console is on. */
  routeSort: RouteSort;
  go(section: Section): void;
  toggleRail(): void;
  setRouteSort(sort: RouteSort): void;
}

export const useNav = create<NavStore>()((set, get) => ({
  section: 'run',
  railCollapsed: readCollapsed(),
  routeSort: { key: 'name', asc: true },
  go: (section) => set({ section }),
  setRouteSort: (routeSort) => set({ routeSort }),
  toggleRail: () => {
    const railCollapsed = !get().railCollapsed;
    try {
      localStorage.setItem(COLLAPSED_KEY, String(railCollapsed));
    } catch {
      /* No storage: it folds for this session only. */
    }
    set({ railCollapsed });
  },
}));
