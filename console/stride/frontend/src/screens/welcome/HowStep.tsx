import { useScheduleFeed } from '../../hooks/useScheduleFeed';
import { cx } from '../../lib/cx';
import { openWorkout, useWelcome } from '../../store/welcome';
import { ChoiceCard } from '../../components/molecules';
import { PersonSchedule, useHasSchedule } from './PersonSchedule';
import styles from './Welcome.module.css';

/** Step 2 — how to run (spec 038, S-001): Manual, Routes or Workouts,
 *  stacked down the left; and on the right what TrailMate has planned for
 *  today and tomorrow, a workout there being the quickest way in. Nothing
 *  here moves the belt. */
export function HowStep() {
  const { runner, chooseManual, chooseRoutes, chooseWorkouts } = useWelcome();
  useScheduleFeed();
  const planned = useHasSchedule(runner);
  return (
    <>
      <div className={cx(styles.how, planned && styles.withPlan)}>
        <div className={styles.ways}>
          <ChoiceCard row icon="🚶" name="Manual" hint="free, or held to a heart rate" onTap={chooseManual} />
          <ChoiceCard row icon="🗺️" name="Routes" hint="your starred routes and races" onTap={chooseRoutes} />
          <ChoiceCard row icon="📅" name="Workouts" hint="your plan from TrailMate" onTap={chooseWorkouts} />
        </div>
        {planned && (
          <div className={styles.plan}>
            <PersonSchedule name={runner} onPick={(w) => openWorkout(runner, w.id)} />
          </div>
        )}
      </div>
    </>
  );
}
