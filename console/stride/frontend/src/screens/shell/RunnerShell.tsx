import type { ComponentType } from 'react';
import { settings } from '../../bridge/stride';
import { AppShell, SideRail, type RailItem } from '../../components/layout';
import { useNav, type Section } from '../../store/nav';
import { useWelcome } from '../../store/welcome';
import { HistoryPage } from '../history/HistoryPage';
import { RunPage } from '../run/RunPage';
import styles from './RunnerShell.module.css';

/** Home is not a page of the shell: it goes back to "Who's running?". */
const PAGES: RailItem[] = [
  { id: 'home', label: 'Home', icon: 'home' },
  { id: 'run', label: 'Run', icon: 'run' },
  { id: 'history', label: 'History', icon: 'history' },
];
const PINNED: RailItem[] = [{ id: 'settings', label: 'Settings', icon: 'settings' }];

const PAGE_FOR: Record<Section, ComponentType> = { run: RunPage, history: HistoryPage };

/** STRIDE's mark, from its launcher icon: the running track and its dot, in
 *  TrailMate's colours, on a tile like TrailMate's own logo. */
function StrideMark() {
  return (
    <svg className={styles.mark} viewBox="0 0 48 48" aria-hidden="true">
      <rect width="48" height="48" rx="10" className={styles.markTile} />
      <rect x="9" y="15" width="30" height="18" rx="9" className={styles.markTrack} />
      <circle cx="19" cy="15" r="3.6" className={styles.markDot} />
    </svg>
  );
}

/** Everything a runner reaches once they have said who they are: the rail,
 *  and the page it has chosen. */
export function RunnerShell() {
  const { section, go, railCollapsed, toggleRail } = useNav();
  const Page = PAGE_FOR[section];
  return (
    <AppShell
      rail={(
        <SideRail
          brand={{ mark: <StrideMark />, name: 'STRIDE' }}
          items={PAGES}
          bottom={PINNED}
          active={section}
          onSelect={(id) => {
            if (id === 'home') useWelcome.getState().goTo(1);
            else if (id === 'settings') settings().open('me');
            else go(id as Section);
          }}
          collapsed={railCollapsed}
          onToggle={toggleRail}
        />
      )}
    >
      <Page />
    </AppShell>
  );
}
