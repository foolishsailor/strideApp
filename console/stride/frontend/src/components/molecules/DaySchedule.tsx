import { cx } from '../../lib/cx';
import { dayCaption, dayLabel, dayShortCaption, type PlannedWorkout, type ScheduleDay } from '../../lib/schedule';
import { WorkoutCard } from './WorkoutCard';
import styles from './DaySchedule.module.css';

/** One day of a plan, after TrailMate's DayActivitiesSection: "Today" with
 *  the date beside it, then that day's workouts, or "Rest day".
 *
 *  `compact` is a row of a week: the day in a narrow column on the left and
 *  slimmer cards beside it, so seven days fit without scrolling. */
export function DaySchedule({ day, today, selectedId, inList, detailed, compact, onPick }: {
  day: ScheduleDay;
  /** YYYY-MM-DD, to say "Today" and "Tomorrow". */
  today: string;
  selectedId?: string | null;
  inList?: boolean;
  /** The bigger cards, with description and steps (see WorkoutCard). */
  detailed?: boolean;
  compact?: boolean;
  onPick?: (w: PlannedWorkout) => void;
}) {
  return (
    <div className={cx(styles.day, compact && styles.compact)}>
      <div className={styles.header}>
        <span className={styles.label}>{dayLabel(day.date, today)}</span>
        <span className={styles.caption}>{compact ? dayShortCaption(day.date) : dayCaption(day.date, today)}</span>
      </div>
      <div className={styles.workouts}>
        {day.workouts.length ? (
          day.workouts.map((w) => (
            <div key={w.id} className={styles.item}>
              <WorkoutCard workout={w} selected={w.id === selectedId} inList={inList}
                detailed={detailed} compact={compact} onTap={onPick} />
            </div>
          ))
        ) : (
          <div className={styles.rest}>Rest day</div>
        )}
      </div>
    </div>
  );
}
