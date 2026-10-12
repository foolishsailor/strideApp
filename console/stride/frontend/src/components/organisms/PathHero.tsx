import { useEffect, useRef } from 'react';
import { PH, PW, viewFor } from '../../lib/path/geometry';
import { drawPath } from '../../lib/path/scene';
import { segmentSubtitle } from '../../lib/session';
import { useField, useSession } from '../../store/session';
import { useUnits } from '../../store/settings';
import { Label } from '../primitives';
import styles from './Hero.module.css';

/* The path ahead, for a guided run. An oval cannot show a hill; a path
   receding into the distance can, so the climb is visible before it arrives. */

function PathCanvas() {
  const ref = useRef<HTMLCanvasElement>(null);
  const distance = useField('distance') ?? 0;
  const elapsed = useField('elapsed') ?? 0;
  const speed = useField('speed') ?? 0;
  const steps = useSession((s) => s.planSteps);
  const elevation = useSession((s) => s.elevation);

  useEffect(() => {
    const c = ref.current?.getContext('2d');
    if (c) drawPath(c, viewFor(distance, elapsed, speed, elevation), steps);
  }, [distance, elapsed, speed, steps, elevation]);

  return <canvas ref={ref} width={PW} height={PH} className={styles.canvas} />;
}

function SegmentHeader() {
  const snapshot = useSession((s) => s.snapshot);
  const u = useUnits();
  return (
    <div className={styles.segment}>
      <Label tone="accent" className={styles.segName}>{snapshot.segmentLabel || ''}</Label>
      <div className={styles.segSub}>{segmentSubtitle(snapshot, u)}</div>
    </div>
  );
}

/** Said once the incline has been taken over by hand: the plan leaves it
 *  alone until the next stretch. */
function InclineNote() {
  const manual = useField('inclineAuto') === false;
  return <div className={styles.inclineNote}>{manual && 'incline yours until the next stretch'}</div>;
}

export function PathHero() {
  return (
    <div className={styles.hero}>
      <PathCanvas />
      <SegmentHeader />
      <InclineNote />
    </div>
  );
}
