import type { PlannedStep, PlannedWorkout } from '../../lib/schedule';
import { inclineText, plannedText, stepEndText, targetText } from '../../lib/units';
import { useUnits } from '../../store/settings';
import { WorkoutTypeLabel, workoutToneClass } from '../molecules';
import { cx } from '../../lib/cx';
import styles from './WorkoutPreview.module.css';

function StepRow({ step }: { step: PlannedStep }) {
  const u = useUnits();
  const target = targetText(step.target, u);
  return (
    <li className={styles.step}>
      <div className={styles.what}>
        {step.label}
        {step.repeat && <span className={styles.repeat}>{step.repeat.index} of {step.repeat.of}</span>}
      </div>
      <div className={styles.end}>{stepEndText(step.end, u)}</div>
      <div className={styles.target}>
        {target || '—'}
        {step.incline !== null && <span className={styles.incline}>{inclineText(step.incline)}</span>}
        {step.note && <span className={styles.note}>{step.note}</span>}
      </div>
    </li>
  );
}

/** A planned workout before it is run: what it is, and every step of it as
 *  the console will run it (repeats already laid out by TrailMate). */
export function WorkoutPreview({ workout }: { workout: PlannedWorkout }) {
  const u = useUnits();
  const planned = plannedText(workout, u);
  return (
    <div className={cx(styles.preview, workoutToneClass(workout.type))}>
      <WorkoutTypeLabel workout={workout} />
      <div className={styles.name}>{workout.name}</div>
      {(planned || workout.description) && (
        <div className={styles.about}>{[planned, workout.description].filter(Boolean).join(' · ')}</div>
      )}
      <ol className={styles.steps}>
        {workout.steps.map((s, i) => <StepRow key={i} step={s} />)}
      </ol>
    </div>
  );
}
