import type { ReactNode } from 'react';
import { Prose } from '../primitives';
import styles from './EmptyState.module.css';

/** A page with nothing to show yet: what is missing, and what to do about it. */
export function EmptyState({ title, children }: { title: ReactNode; children?: ReactNode }) {
  return (
    <div className={styles.empty}>
      <Prose size="ask">{title}</Prose>
      {children && <Prose size="body" className={styles.note}>{children}</Prose>}
    </div>
  );
}
