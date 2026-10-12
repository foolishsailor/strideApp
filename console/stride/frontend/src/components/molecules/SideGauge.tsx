import { memo } from 'react';
import { cx } from '../../lib/cx';
import { Label, Numeral } from '../primitives';
import styles from './SideGauge.module.css';

/** A column of ticks lit from the bottom. Stands in for an arc gauge, and ends
 *  clear of the coach band — a column running under the ribbon looked severed. */
export const TickColumn = memo(function TickColumn({ count, lit, tone }: {
  count: number;
  lit: number;
  tone: 'accent' | 'warm';
}) {
  return (
    <div className={styles.ticks}>
      {Array.from({ length: count }, (_, i) => (
        <i key={i} className={cx(i < lit && styles[tone])} />
      ))}
    </div>
  );
});

/** One of the two big readouts flanking the hero: incline left, speed right. */
export function SideGauge({ side, label, value, unit, target, targetUnit, ticks, tickCount, tone }: {
  side: 'left' | 'right';
  label: string;
  value: string;
  unit: string;
  target: string;
  targetUnit?: string;
  ticks: number;
  tickCount: number;
  tone: 'accent' | 'warm';
}) {
  return (
    <div className={cx(styles.side, styles[side])}>
      <Label className={styles.label}>{label}</Label>
      <Numeral size="display">{value}</Numeral>
      <div className={styles.unit}>{unit}</div>
      <div className={styles.target}>
        target <b>{target}</b>{targetUnit}
      </div>
      <TickColumn count={tickCount} lit={ticks} tone={tone} />
    </div>
  );
}
