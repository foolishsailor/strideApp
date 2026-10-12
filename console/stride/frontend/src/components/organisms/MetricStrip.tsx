import type { ReactNode } from 'react';
import { mmss, nf } from '../../lib/format';
import { useField } from '../../store/session';
import { Row } from '../primitives';
import { Metric } from '../molecules';
import styles from './MetricStrip.module.css';

/** The metrics docked along the top: the secondary numbers of a walk, tight
 *  to the top edge, with the screen's status ("warming up") beneath them. */
export function MetricStrip({ children }: { children?: ReactNode }) {
  const elapsed = useField('elapsed') ?? 0;
  const distance = useField('distance') ?? 0;
  const calories = useField('calories') ?? 0;
  const pulse = useField('pulse');
  return (
    <div className={styles.strip}>
      <Row space={64} className={styles.row}>
        <Metric large label="Elapsed">{mmss(elapsed)}</Metric>
        <Metric large label="Distance" unit="m">{nf(distance)}</Metric>
        <Metric large label="Calories" unit="kcal">{nf(calories)}</Metric>
        <Metric large label="Heart rate" unit="bpm">{pulse ? pulse : '—'}</Metric>
      </Row>
      {children && <div className={styles.status}>{children}</div>}
    </div>
  );
}
