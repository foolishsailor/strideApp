import { core } from '../../bridge/stride';
import type { Route } from '../../bridge/types';
import { dayCaption } from '../../lib/schedule';
import { climb, far } from '../../lib/units';
import { useUnits, type Units } from '../../store/settings';
import { useTrailmate } from '../../store/trailmate';
import { useWelcome } from '../../store/welcome';
import { Prose, Row } from '../../components/primitives';
import { PlanCard } from '../../components/molecules';
import styles from './Welcome.module.css';

/** Two rows of four is as many as the step holds above BACK and BEGIN. */
const MAX_ROUTE_CARDS = 8;

/** Looped, a card describes the run it will actually be: twice the ground,
 *  and the climb recomputed the way Route.outAndBack does it — an
 *  out-and-back's ascent is the outbound climb *plus* the outbound descent.
 *  A race course says when the race is. */
function RouteBlurb({ route, looped, u }: { route: Route; looped: boolean; u: Units }) {
  const up = climb(looped ? core().loopedClimb(route) : route.climb_m || 0, u);
  const second = looped ? 'there and back' : route.kind === 'race' && route.date ? `race · ${dayCaption(route.date)}` : '';
  return (
    <>
      {far((route.distance_m || 0) * (looped ? 2 : 1), u)} · {up.value} {up.unit} up
      {second && <><br />{second}</>}
    </>
  );
}

/** Step 3, Routes — the runner's starred routes, then their upcoming race
 *  courses (spec 038, US3), as Kotlin orders them. A route carries its own
 *  length, so there is no duration to choose. */
export function RoutePicker() {
  const { route, loop, pickRoute, toggleLoop } = useWelcome();
  const routes = useTrailmate((s) => s.routes).slice(0, MAX_ROUTE_CARDS);
  const u = useUnits();
  if (!routes.length) {
    return (
      <>
        <Prose size="ask">No routes yet</Prose>
        <Prose size="body" className={styles.note}>Star routes in TrailMate to run them here.</Prose>
      </>
    );
  }
  return (
    <>
      <Prose size="ask">Which route?</Prose>
      <Row space={22} className={styles.routes}>
        {routes.map((r) => {
          const looped = loop && r.id === route;
          return (
            <PlanCard
              key={r.id}
              name={r.name || 'Route'}
              blurb={<RouteBlurb route={r} looped={looped} u={u} />}
              points={core().routePoints(r)}
              selected={r.id === route}
              loop={{ on: looped }}
              /* One handler for both halves of the card; the core says which
                 half was hit. */
              onTap={(e) => (core().tappedLoop(e) ? toggleLoop(r.id) : pickRoute(r.id))}
            />
          );
        })}
      </Row>
    </>
  );
}
