import { dayCaption, dayLabel, type PlannedWorkout, type ScheduleDay } from '../../lib/schedule';
import { WorkoutCard } from './WorkoutCard';
import styles from './DaySchedule.module.css';

/** One day of a plan, after TrailMate's DayActivitiesSection: "Today" with
 *  the date beside it, then that day's workouts, or "Rest day". */
export function DaySchedule({ day, today, selectedId, inList, detailed, onPick }: {
  day: ScheduleDay;
  /** YYYY-MM-DD, to say "Today" and "Tomorrow". */
  today: string;
  selectedId?: string | null;
  inList?: boolean;
  /** The bigger cards, with description and steps (see WorkoutCard). */
  detailed?: boolean;
  onPick?: (w: PlannedWorkout) => void;
}) {
  return (
    <div className={styles.day}>
      <div className={styles.header}>
        <span className={styles.label}>{dayLabel(day.date, today)}</span>
        <span className={styles.caption}>{dayCaption(day.date, today)}</span>
      </div>
      {day.workouts.length ? (
        day.workouts.map((w) => (
          <div key={w.id} className={styles.item}>
            <WorkoutCard workout={w} selected={w.id === selectedId} inList={inList} detailed={detailed} onTap={onPick} />
          </div>
        ))
      ) : (
        <div className={styles.rest}>Rest day</div>
      )}
    </div>
  );
}
