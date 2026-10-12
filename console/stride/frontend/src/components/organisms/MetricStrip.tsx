import type { ReactNode } from 'react';
import { mmss, nf } from '../../lib/format';
import { climb as climbIn, paceSec, paceUnit, speedIn, speedUnit, stride as strideIn, walked } from '../../lib/units';
import { useField } from '../../store/session';
import { useUnits } from '../../store/settings';
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
  const u = useUnits();
  const pace = paceSec(speed, u);
  const dist = walked(distance, u);
  const up = climbIn(climb, u);
  return (
    <div className={styles.strip}>
      {left}
      <div className={styles.middle}>
        <Row className={styles.row}>
          <Metric large label="Elapsed">{mmss(elapsed)}</Metric>
          <Metric large label="Distance" unit={dist.unit}>{dist.value}</Metric>
          <Metric large label="Pace" unit={paceUnit(u)}>{pace ? mmss(pace) : dash}</Metric>
          <Metric large label="Heart rate" unit="bpm">{orDash(pulse)}</Metric>
          <Metric large label="Cadence" unit="spm">{orDash(cadence)}</Metric>
          <Metric large label="Power" unit="W">{orDash(power)}</Metric>
        </Row>
        <Row className={styles.second}>
          <Metric inline label="Calories" unit="kcal">{nf(calories)}</Metric>
          <Metric inline label="Climb" unit={up.unit}>{up.value}</Metric>
          {children && <div className={styles.status}>{children}</div>}
          <Metric inline label="Stride" unit={stride ? strideIn(stride, u).unit : u === 'mi' ? 'ft' : 'm'}>{orDash(stride, (n) => strideIn(n, u).value)}</Metric>
          <Metric inline label="Pod speed" unit={speedUnit(u)}>{orDash(podKph, (n) => speedIn(n, u).toFixed(1))}</Metric>
        </Row>
      </div>
      {right}
    </div>
  );
}
