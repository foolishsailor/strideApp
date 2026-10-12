import type { ReactNode } from 'react';
import { dateOf, timeOf, useNow } from '../../hooks/useClock';
import styles from './TopBar.module.css';

/** Time on the left, date on the right, and whatever the screen puts between. */
export function TopBar({ children }: { children?: ReactNode }) {
  const now = useNow();
  return (
    <div className={styles.bar}>
      <div>{timeOf(now)}</div>
      <div>{children}</div>
      <div>{dateOf(now)}</div>
    </div>
  );
}
