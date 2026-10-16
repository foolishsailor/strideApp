import { cx } from '../../lib/cx';
import type { PlannedWorkout } from '../../lib/schedule';
import { doneText, plannedText, stepLines } from '../../lib/units';
import { useUnits } from '../../store/settings';
import { fit, PressableCard, Surface } from '../primitives';
import { WorkoutTypeLabel, workoutToneClass } from './WorkoutTone';
import styles from './WorkoutCard.module.css';

/** One planned workout, the way TrailMate's sidebar card shows it: a wash of
 *  its type's colour, the type in capitals in that colour, its name, and its
 *  planned time and distance (or what was run, once done). Pressable when
 *  the treadmill can run it; a strength session is listed, not offered.
 *
 *  `detailed` is the bigger card beside the run choices: it also carries the
 *  description and the steps, a repeat folded into one line. */
export function WorkoutCard({ workout, selected, inList, detailed, compact, onTap }: {
  workout: PlannedWorkout;
  selected?: boolean;
  /** In a list that scrolls (see PressableCard). */
  inList?: boolean;
  detailed?: boolean;
  /** Slimmer, for a row of a week: the type and the time on one line, the name under. */
  compact?: boolean;
  onTap?: (w: PlannedWorkout) => void;
}) {
  const u = useUnits();
  const meta = !workout.runnable ? 'Not for the treadmill' : workout.done ? doneText(workout.done, u) : plannedText(workout, u);
  const className = cx(styles.card, detailed && styles.detailed, compact && styles.compact,
    workoutToneClass(workout.type), !workout.runnable && styles.off);
  const lines = detailed && workout.runnable ? stepLines(workout.steps, u) : [];
  const metaEl = meta && <span className={cx(styles.meta, workout.done && workout.runnable && styles.done)}>{meta}</span>;
  const body = compact ? (
    <>
      <span className={styles.top}>
        <WorkoutTypeLabel workout={workout} />
        {metaEl}
      </span>
      <span className={cx(styles.name, fit(1))}>{workout.name}</span>
    </>
  ) : (
    <>
      <WorkoutTypeLabel workout={workout} />
      <span className={cx(styles.name, fit(2))}>{workout.name}</span>
      {metaEl}
      {detailed && workout.description && <span className={styles.description}>{workout.description}</span>}
      {lines.length > 0 && (
        <span className={styles.steps}>
          {lines.map((line, i) => <span key={i} className={styles.step}>{line}</span>)}
        </span>
      )}
    </>
  );
  if (!onTap || !workout.runnable) return <Surface className={className}>{body}</Surface>;
  return (
    <PressableCard inList={inList} selected={selected} onTap={() => onTap(workout)} className={className}>
      {body}
    </PressableCard>
  );
}
