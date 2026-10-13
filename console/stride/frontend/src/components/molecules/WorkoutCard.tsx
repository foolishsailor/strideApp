import { cx } from '../../lib/cx';
import type { PlannedWorkout } from '../../lib/schedule';
import { doneText, plannedText } from '../../lib/units';
import { useUnits } from '../../store/settings';
import { PressableCard, Surface } from '../primitives';
import { WorkoutTypeLabel, workoutToneClass } from './WorkoutTone';
import styles from './WorkoutCard.module.css';

/** One planned workout, the way TrailMate's sidebar card shows it: a wash of
 *  its type's colour, the type in capitals in that colour, its name, and its
 *  planned time and distance (or what was run, once done). Pressable when
 *  the treadmill can run it; a strength session is listed, not offered. */
export function WorkoutCard({ workout, selected, inList, onTap }: {
  workout: PlannedWorkout;
  selected?: boolean;
  /** In a list that scrolls (see PressableCard). */
  inList?: boolean;
  onTap?: (w: PlannedWorkout) => void;
}) {
  const u = useUnits();
  const meta = !workout.runnable ? 'Not for the treadmill' : workout.done ? doneText(workout.done, u) : plannedText(workout, u);
  const className = cx(styles.card, workoutToneClass(workout.type), !workout.runnable && styles.off);
  const body = (
    <>
      <WorkoutTypeLabel workout={workout} />
      <span className={styles.name}>{workout.name}</span>
      {meta && <span className={cx(styles.meta, workout.done && workout.runnable && styles.done)}>{meta}</span>}
    </>
  );
  if (!onTap || !workout.runnable) return <Surface className={className}>{body}</Surface>;
  return (
    <PressableCard inList={inList} selected={selected} onTap={() => onTap(workout)} className={className}>
      {body}
    </PressableCard>
  );
}
