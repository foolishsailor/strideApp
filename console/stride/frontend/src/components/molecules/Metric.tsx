import type { ReactNode } from 'react';
import { Label, Numeral, Surface } from '../primitives';
import styles from './Metric.module.css';

/** A named number: "DISTANCE / 1,240 m". `large` for the workout's top dock,
 *  read from the belt rather than at arm's length. */
export function Metric({ label, unit, large, children }: { label: string; unit?: string; large?: boolean; children: ReactNode }) {
  return (
    <div className={styles.metric}>
      <Label size="label" tone="faint" className={large ? styles.largeLabel : styles.label}>{label}</Label>
      <Numeral size="metric" unit={unit} className={large ? styles.large : undefined}>{children}</Numeral>
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
