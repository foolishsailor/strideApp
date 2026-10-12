import type { ReactNode } from 'react';
import { Label, Numeral, Surface } from '../primitives';
import styles from './Metric.module.css';

/** A named number: "DISTANCE / 1,240 m". */
export function Metric({ label, unit, children }: { label: string; unit?: string; children: ReactNode }) {
  return (
    <div className={styles.metric}>
      <Label size="label" tone="faint" className={styles.label}>{label}</Label>
      <Numeral size="metric" unit={unit}>{children}</Numeral>
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
