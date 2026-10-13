import { segmentSubtitle } from '../../lib/session';
import { useField, useSession } from '../../store/session';
import { useUnits } from '../../store/settings';
import { Label } from '../primitives';
import styles from './Hero.module.css';
import { RunChart } from './RunChart';

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

/** The live chart, for every run. A workout's own band (StepBand) names the
 *  step and a manual run has none, so the segment header and incline note are
 *  for a route alone. */
export function ChartHero() {
  const route = useSession((s) => !s.snapshot.workoutStep && (s.snapshot.segments || 0) > 0);
  return (
    <div className={styles.charted}>
      {route && <SegmentHeader />}
      <RunChart className={styles.chart} />
      {route && <InclineNote />}
    </div>
  );
}
