import type { ReactNode } from 'react';
import { mmss, nf } from '../../lib/format';
import { useField } from '../../store/session';
import { Row } from '../primitives';
import { Metric } from '../molecules';
import styles from './MetricStrip.module.css';

/** The bar docked along the top, full width: `left` and `right` at its ends
 *  (the incline and speed readings, over their rails), the secondary numbers
 *  of a walk between them, and the screen's status ("warming up") beneath. */
export function MetricStrip({ left, right, children }: { left?: ReactNode; right?: ReactNode; children?: ReactNode }) {
  const elapsed = useField('elapsed') ?? 0;
  const distance = useField('distance') ?? 0;
  const calories = useField('calories') ?? 0;
  const pulse = useField('pulse');
  return (
    <div className={styles.strip}>
      {left}
      <div className={styles.middle}>
        <Row space={64} className={styles.row}>
          <Metric large label="Elapsed">{mmss(elapsed)}</Metric>
          <Metric large label="Distance" unit="m">{nf(distance)}</Metric>
          <Metric large label="Calories" unit="kcal">{nf(calories)}</Metric>
          <Metric large label="Heart rate" unit="bpm">{pulse ? pulse : '—'}</Metric>
        </Row>
        {children && <div className={styles.status}>{children}</div>}
      </div>
      {right}
    </div>
  );
}
