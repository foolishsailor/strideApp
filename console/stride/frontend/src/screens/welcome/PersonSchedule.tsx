import { useNow } from '../../hooks/useClock';
import { localDate, RECONNECT_TEXT, scheduleDays, scheduleView, staleness, type PlannedWorkout } from '../../lib/schedule';
import { useSchedule } from '../../store/trailmate';
import { DaySchedule } from '../../components/molecules';
import styles from './Welcome.module.css';

/** Under a person's card on the home screen: their Today and Tomorrow from
 *  TrailMate (spec 038, US1). Nothing for somebody who isn't linked; a
 *  prompt for a link that may not read the plan. */
export function PersonSchedule({ name, onPick }: { name: string; onPick: (w: PlannedWorkout) => void }) {
  const schedule = useSchedule(name);
  const now = useNow();
  const view = scheduleView(schedule);
  if (view === 'none' || !schedule) return null;
  if (view === 'reconnect') return <div className={styles.reconnect}>{RECONNECT_TEXT}</div>;

  const today = localDate(now);
  const stale = staleness(schedule.fetchedAt, now.getTime());
  return (
    <div className={styles.schedule}>
      {scheduleDays(schedule.workouts, today, 2).map((day) => (
        <div key={day.date} className={styles.scheduleDay}>
          <DaySchedule day={day} today={today} onPick={onPick} />
        </div>
      ))}
      {stale && <div className={styles.stale}>{stale}</div>}
    </div>
  );
}
