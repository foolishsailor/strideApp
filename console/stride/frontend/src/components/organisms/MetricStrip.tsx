import type { ReactNode } from 'react';
import { mmss, nf } from '../../lib/format';
import { paceSecPerKm } from '../../lib/session';
import { useField } from '../../store/session';
import { Row } from '../primitives';
import { Metric } from '../molecules';
import styles from './MetricStrip.module.css';

const dash = '—';
/** A sensor's number, or a dash for "no reading" rather than a zero. */
const orDash = (n: number | undefined, show: (n: number) => string = String) => (n ? show(n) : dash);

/** The bar docked along the top, full width: `left` and `right` at its ends
 *  (the incline and speed readings, over their rails), and between them the
 *  walk's numbers in two rows — the ones read mid-stride large, the rest
 *  smaller beside the screen's status ("warming up"). Cadence, power, stride
 *  and pod speed come from a foot pod and show a dash without one. */
export function MetricStrip({ left, right, children }: { left?: ReactNode; right?: ReactNode; children?: ReactNode }) {
  const elapsed = useField('elapsed') ?? 0;
  const distance = useField('distance') ?? 0;
  const speed = useField('speed');
  const pulse = useField('pulse');
  const cadence = useField('cadence');
  const power = useField('power');
  const calories = useField('calories') ?? 0;
  const climb = useField('climbM') ?? 0;
  const stride = useField('strideM');
  const podKph = useField('podKph');
  const pace = paceSecPerKm(speed);
  return (
    <div className={styles.strip}>
      {left}
      <div className={styles.middle}>
        <Row className={styles.row}>
          <Metric large label="Elapsed">{mmss(elapsed)}</Metric>
          <Metric large label="Distance" unit="m">{nf(distance)}</Metric>
          <Metric large label="Pace" unit="/km">{pace ? mmss(pace) : dash}</Metric>
          <Metric large label="Heart rate" unit="bpm">{orDash(pulse)}</Metric>
          <Metric large label="Cadence" unit="spm">{orDash(cadence)}</Metric>
          <Metric large label="Power" unit="W">{orDash(power)}</Metric>
        </Row>
        <Row className={styles.second}>
          <Metric inline label="Calories" unit="kcal">{nf(calories)}</Metric>
          <Metric inline label="Climb" unit="m">{nf(climb)}</Metric>
          {children && <div className={styles.status}>{children}</div>}
          <Metric inline label="Stride" unit="m">{orDash(stride, (n) => n.toFixed(2))}</Metric>
          <Metric inline label="Pod speed" unit="km/h">{orDash(podKph, (n) => n.toFixed(1))}</Metric>
        </Row>
      </div>
      {right}
    </div>
  );
}
