import type { ReactNode } from 'react';
import styles from './AppShell.module.css';

/** The side rail and, beside it, the page. Every screen a runner reaches
 *  after choosing themselves sits in one of these. */
export function AppShell({ rail, children }: { rail: ReactNode; children: ReactNode }) {
  return (
    <div className={styles.shell}>
      {rail}
      <main className={styles.main}>{children}</main>
    </div>
  );
}
