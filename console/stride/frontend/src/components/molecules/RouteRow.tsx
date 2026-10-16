import type { Route } from '../../bridge/types';
import { core } from '../../bridge/stride';
import { cx } from '../../lib/cx';
import { elevationProfile } from '../../lib/routes';
import { dayCaption } from '../../lib/schedule';
import { climb, far } from '../../lib/units';
import { useUnits } from '../../store/settings';
import { Button, fit, PressableCard } from '../primitives';
import { ElevationChart } from './ElevationChart';
import styles from './RouteRow.module.css';

/** One route in the list: its name (and a race's date), how far, how much
 *  climbing, how often it has been run, and its ground drawn beside. Pressing
 *  the row starts it; THERE AND BACK, at the end, doubles it first. */
export function RouteRow({ route, looped, onStart, onLoop }: {
  route: Route;
  looped: boolean;
  onStart: () => void;
  onLoop: () => void;
}) {
  const u = useUnits();
  const metres = (route.distance_m || 0) * (looped ? 2 : 1);
  const up = climb(looped ? core().loopedClimb(route) : route.climb_m || 0, u);
  const race = route.kind === 'race';
  const facts = [
    far(metres, u),
    `${up.value} ${up.unit} up`,
    race && route.date ? `race · ${dayCaption(route.date)}` : '',
    !race && route.run_count ? `run ${route.run_count} time${route.run_count === 1 ? '' : 's'}` : '',
  ].filter(Boolean).join(' · ');
  return (
    <div className={styles.row}>
      <PressableCard inList className={styles.card} onTap={onStart}>
        <span className={styles.words}>
          <span className={cx(styles.name, fit(1))}>{route.name || 'Route'}</span>
          <span className={cx(styles.facts, fit(1))}>{facts}</span>
        </span>
        <ElevationChart className={styles.chart} points={elevationProfile(route.segments || [], looped)} />
      </PressableCard>
      <Button size="chip" selected={looped} className={styles.loop} onTap={onLoop}>THERE AND BACK</Button>
    </div>
  );
}
