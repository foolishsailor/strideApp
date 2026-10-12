import { useEffect, useRef } from 'react';
import { PH, PW, viewFor } from '../../lib/path/geometry';
import { drawPath } from '../../lib/path/scene';
import { segmentSubtitle, suggestion } from '../../lib/session';
import { bridge } from '../../bridge/stride';
import { useTap } from '../../hooks/useTap';
import { useField, useSession } from '../../store/session';
import { useUnits } from '../../store/settings';
import { speedText, speedUnit } from '../../lib/units';
import { cx } from '../../lib/cx';
import { Label } from '../primitives';
import styles from './Hero.module.css';

/* The path ahead, for a guided walk. An oval cannot show a hill; a path
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

/** The coach's suggested pace. Tapping it takes it — accepting the number used
 *  to mean holding + until you reached it. */
function Suggestion() {
  const suggestPace = useField('suggestPace');
  const targetSpeed = useField('targetSpeed');
  const inclineAuto = useField('inclineAuto');
  const u = useUnits();
  const s = suggestion({ suggestPace, targetSpeed, inclineAuto });
  const ref = useTap<HTMLDivElement>(() => {
    if (s) bridge().setSpeed(s.kph);
  });
  return (
    <div ref={ref} className={cx(styles.suggest, s?.manualIncline && styles.manual)}>
      {s && (
        <>
          {s.verb} <b>{speedText(s.kph, u)}</b> {speedUnit(u)}
          {s.manualIncline && ' · incline yours until the next stretch'}
        </>
      )}
    </div>
  );
}

export function PathHero() {
  return (
    <div className={styles.hero}>
      <PathCanvas />
      <SegmentHeader />
      <Suggestion />
    </div>
  );
}
