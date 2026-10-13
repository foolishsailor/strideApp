import { cx } from '../../lib/cx';
import { typeLabel, typeTone, type PlannedWorkout } from '../../lib/schedule';
import styles from './WorkoutTone.module.css';

/** The class that gives an element its workout type's colour as
 *  --workout-tone, for it and everything inside it. */
export const workoutToneClass = (type: string): string | undefined => styles[typeTone(type) ?? 'accent'];

/** "INTERVALS" in the intervals colour. Inside a workoutToneClass element. */
export function WorkoutTypeLabel({ workout, className }: {
  workout: Pick<PlannedWorkout, 'type' | 'sport' | 'runnable'>;
  className?: string;
}) {
  return <span className={cx(styles.label, className)}>{typeLabel(workout)}</span>;
}
