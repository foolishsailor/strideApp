import type { ReactNode } from 'react';
import { cx } from '../../lib/cx';
import { Label, Numeral, Surface } from '../primitives';
import styles from './Metric.module.css';

/** A named number: "DISTANCE / 1,240 m". `large` for the workout's top dock,
 *  read from the belt rather than at arm's length; `inline` for the dock's
 *  second row, label and number side by side; `compact` for the one-line
 *  strip over another app, inline and small. `aside` is a word or two set
 *  small beside the number: the heart rate's zone. */
export function Metric({ label, unit, large, inline, compact, aside, children }: {
  label: string;
  unit?: string;
  large?: boolean;
  inline?: boolean;
  compact?: boolean;
  aside?: ReactNode;
  children: ReactNode;
}) {
  const side = inline || compact;
  const labelClass = large ? styles.largeLabel : compact ? styles.compactLabel : inline ? styles.inlineLabel : styles.label;
  const valueClass = large ? styles.large : compact ? styles.compactValue : inline ? styles.inlineValue : undefined;
  const value = (
    <Numeral size="metric" unit={unit} className={valueClass}>
      {children}
    </Numeral>
  );
  return (
    <div className={cx(styles.metric, side && styles.inline, compact && styles.compact)}>
      <Label size="label" tone="faint" className={labelClass}>
        {label}
      </Label>
      {aside ? (
        <div className={styles.withAside}>
          {value}
          <div className={styles.aside}>{aside}</div>
        </div>
      ) : value}
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
