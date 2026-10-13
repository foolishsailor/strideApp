import { bridge } from '../../bridge/stride';
import type { WorkoutStep } from '../../bridge/types';
import { handNote, stepPosition } from '../../lib/session';
import { inclineText, leftText, targetText } from '../../lib/units';
import { useField } from '../../store/session';
import { useUnits } from '../../store/settings';
import { Button, Label, Numeral, acknowledge } from '../primitives';
import styles from './StepBand.module.css';

/** The step under way: where it sits in the workout, its name, what it asks
 *  for, and a word if the runner has taken a control over. */
function NowStep({ w }: { w: WorkoutStep }) {
  const u = useUnits();
  const target = [targetText(w.target, u), w.incline !== null ? inclineText(w.incline) : ''].filter(Boolean).join(' · ');
  const aside = handNote(w) || w.note;
  return (
    <div className={styles.now}>
      <Label size="caption" tone="faint">{stepPosition(w)}</Label>
      <div className={styles.label}>{w.label}</div>
      {target && <div className={styles.target}>{target}</div>}
      {aside && <div className={styles.aside}>{aside}</div>}
    </div>
  );
}

/** What is left of it, or NEXT for a step that only ends when told to. */
function StepLeft({ w }: { w: WorkoutStep }) {
  const u = useUnits();
  if (w.open || w.left === null) {
    const next = (e: Event) => {
      bridge().nextStep();
      acknowledge(e.currentTarget as Element);
    };
    return (
      <div className={styles.left}>
        <Button size="dock" tone="primary" className={styles.next} onTap={next}>NEXT</Button>
      </div>
    );
  }
  return (
    <div className={styles.left}>
      <Numeral size="metric" className={styles.leftValue}>{leftText(w.left, w.leftIsDistance, u)}</Numeral>
      <Label size="caption" tone="faint">left</Label>
    </div>
  );
}

/** What comes after, so a change of pace is never a surprise. */
function UpNext({ w }: { w: WorkoutStep }) {
  const u = useUnits();
  return (
    <div className={styles.upNext}>
      <Label size="caption" tone="faint">{w.nextLabel ? 'Next' : 'Last step'}</Label>
      {w.nextLabel && <div className={styles.nextLabel}>{w.nextLabel}</div>}
      {w.nextTarget && <div className={styles.nextTarget}>{targetText(w.nextTarget, u)}</div>}
    </div>
  );
}

/** A workout's step, docked along the bottom on top of the controls: now,
 *  what is left, and next (spec 038, US2). Nothing while there is no
 *  workout. Over another app it rides in the bottom drawer with the dock. */
export function StepBand() {
  const w = useField('workoutStep');
  if (!w) return null;
  return (
    <div className={styles.band}>
      <NowStep w={w} />
      <StepLeft w={w} />
      <UpNext w={w} />
    </div>
  );
}
