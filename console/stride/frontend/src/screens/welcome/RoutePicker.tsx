import { sortRoutes, type RouteSortKey } from '../../lib/routes';
import { useNav } from '../../store/nav';
import { useTrailmate } from '../../store/trailmate';
import { chooseAndBegin, useWelcome } from '../../store/welcome';
import { EmptyState, RouteRow, SortBar, type SortOption } from '../../components/molecules';
import styles from './Welcome.module.css';

const SORTS: SortOption<RouteSortKey>[] = [
  { key: 'name', label: 'Name' },
  { key: 'distance', label: 'Distance' },
];

/** Step 3, Routes — the runner's starred routes and upcoming race courses
 *  (spec 038, US3), as a list to scroll, sorted by name or distance either
 *  way. Pressing a route starts it; THERE AND BACK doubles it first. A route
 *  carries its own length, so there is no duration to choose. */
export function RoutePicker() {
  const { route, loop, toggleLoop } = useWelcome();
  const routes = useTrailmate((s) => s.routes);
  const refreshing = useTrailmate((s) => s.freshness.routes === 'checking');
  const sort = useNav((s) => s.routeSort);
  const setSort = useNav((s) => s.setRouteSort);
  if (!routes.length) {
    return (
      <EmptyState title={refreshing ? 'Looking for your routes' : 'No routes yet'}>
        {refreshing ? 'Fetching your starred routes from TrailMate.' : 'Star routes in TrailMate to run them here.'}
      </EmptyState>
    );
  }
  return (
    <div className={styles.routeList}>
      <div className={styles.listBar}>
        <SortBar options={SORTS} sort={sort} onSort={setSort} />
      </div>
      <div className={styles.listScroll}>
        {sortRoutes(routes, sort).map((r) => {
          const looped = loop && r.id === route;
          return (
            <RouteRow
              key={r.id}
              route={r}
              looped={looped}
              onLoop={() => toggleLoop(r.id)}
              onStart={() => chooseAndBegin({ route: r.id, loop: looped })}
            />
          );
        })}
      </div>
    </div>
  );
}
