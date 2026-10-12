import type { SessionMode } from '../../bridge/types';
import { cx } from '../../lib/cx';
import styles from './StatusChip.module.css';

/** What the session is doing, in a pill. Colour keys off the mode, the words
 *  off what the runner would call it. */
export function StatusChip({ mode, label }: { mode: SessionMode; label: string }) {
  return <div className={cx(styles.chip, styles[mode])}>{label}</div>;
}
