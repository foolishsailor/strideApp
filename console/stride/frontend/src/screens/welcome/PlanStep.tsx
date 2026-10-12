import { useMemo } from 'react';
import { core, myRoutes } from '../../bridge/stride';
import type { Route } from '../../bridge/types';
import { DURATIONS, MAX_ROUTE_CARDS, TEMPLATES } from '../../lib/plans';
import { useWelcome } from '../../store/welcome';
import { Button, Prose, Row } from '../../components/primitives';
import { PlanCard } from '../../components/molecules';
import styles from './Welcome.module.css';

/** Step 3, shapes — how long, and which shape. Selecting, never starting:
 *  tapping a plan used to arm the belt, so choosing a duration after a shape
 *  was impossible. BEGIN commits. */
function ShapePicker() {
  const { minutes, shape, setMinutes, setShape } = useWelcome();
  return (
    <>
      <Prose size="ask">How long?</Prose>
      <Row className={styles.durations}>
        {DURATIONS.map((m) => (
          <Button key={m} size="chip" selected={m === minutes} onTap={() => setMinutes(m)}>{m} min</Button>
        ))}
      </Row>
      <Prose size="ask" className={styles.askShape}>Pick a shape</Prose>
      <Row space={22} className={styles.plans}>
        {TEMPLATES.map((t) => (
          <PlanCard key={t.id} name={t.name} blurb={t.blurb} points={t.shape} selected={t.id === shape} onTap={() => setShape(t.id)} />
        ))}
      </Row>
    </>
  );
}

/** Looped, a card describes the walk it will actually be: twice the ground,
 *  and the climb recomputed the way Route.outAndBack does it — an
 *  out-and-back's ascent is the outbound climb *plus* the outbound descent. */
function routeBlurb(r: Route, looped: boolean) {
  const km = ((r.distance_m || 0) / 1000) * (looped ? 2 : 1);
  const up = looped ? core().loopedClimb(r) : r.climb_m || 0;
  return (
    <>
      {km.toFixed(2)} km · {Math.round(up)} m up
      {looped && <><br />there and back</>}
    </>
  );
}

/** Step 3, routes — a walk already done. A route carries its own length, so
 *  there is no duration to choose. */
function RoutePicker() {
  const { route, loop, pickRoute, toggleLoop } = useWelcome();
  const routes = useMemo(() => myRoutes().slice(0, MAX_ROUTE_CARDS), []);
  return (
    <>
      <Prose size="ask">Which route?</Prose>
      <Row space={22} className={styles.plans}>
        {routes.map((r) => {
          const looped = loop && r.id === route;
          return (
            <PlanCard
              key={r.id}
              name={r.name || 'Route'}
              blurb={routeBlurb(r, looped)}
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

export function PlanStep() {
  const planMode = useWelcome((s) => s.planMode);
  return planMode === 'routes' ? <RoutePicker /> : <ShapePicker />;
}
