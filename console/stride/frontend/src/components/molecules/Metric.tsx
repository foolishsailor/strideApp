import type { ReactNode } from 'react';
import { cx } from '../../lib/cx';
import { Label, Numeral, Surface } from '../primitives';
import styles from './Metric.module.css';

/** A named number: "DISTANCE / 1,240 m". `large` for the workout's top dock,
 *  read from the belt rather than at arm's length; `inline` for the dock's
 *  second row, label and number side by side. */
export function Metric({ label, unit, large, inline, children }: {
  label: string;
  unit?: string;
  large?: boolean;
  inline?: boolean;
  children: ReactNode;
}) {
  return (
    <div className={cx(styles.metric, inline && styles.inline)}>
      <Label size="label" tone="faint" className={large ? styles.largeLabel : inline ? styles.inlineLabel : styles.label}>
        {label}
      </Label>
      <Numeral size="metric" unit={unit} className={large ? styles.large : inline ? styles.inlineValue : undefined}>
        {children}
      </Numeral>
    </div>
  );
}

/** A Metric on its own card — the summary's results. */
export function StatCard(props: { label: string; unit?: string; children: ReactNode }) {
  return (
    <Surface className={styles.card}>
      <Metric {...props} />
    </Surface>
  );
}
