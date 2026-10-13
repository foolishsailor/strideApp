import { useNow } from '../../hooks/useClock';
import { localDate, RECONNECT_TEXT, scheduleDays, scheduleView, staleness, type PlannedWorkout } from '../../lib/schedule';
import { useSchedule } from '../../store/trailmate';
import { DaySchedule } from '../../components/molecules';
import styles from './Welcome.module.css';

/** A runner's Today and Tomorrow from TrailMate (spec 038, US1), stacked, in
 *  the bigger cards that carry the description and steps. Beside the run
 *  choices once they have said who they are; nothing for somebody who isn't
 *  linked, and a prompt for a link that may not read the plan. */
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
          <DaySchedule day={day} today={today} inList detailed onPick={onPick} />
        </div>
      ))}
      {stale && <div className={styles.stale}>{stale}</div>}
    </div>
  );
}

/** Whether [PersonSchedule] has anything to show for [name]. */
export function useHasSchedule(name: string): boolean {
  return scheduleView(useSchedule(name)) !== 'none';
}
