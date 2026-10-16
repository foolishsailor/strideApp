import type { TrailMateKind } from '../../bridge/types';
import { useTrailmate } from '../../store/trailmate';
import { Button } from '../primitives';
import styles from './TrailMateStatus.module.css';

/** Under a page's clock: TrailMate is being asked, or could not be reached
 *  and what shows is the treadmill's last copy (with another go). Nothing
 *  once the list is fresh. */
export function TrailMateStatus({ kind }: { kind: TrailMateKind }) {
  const f = useTrailmate((s) => s.freshness[kind]);
  if (f === 'checking') return <div className={styles.status}>Checking TrailMate…</div>;
  if (f !== 'offline') return null;
  return (
    <div className={styles.status}>
      Offline: showing the treadmill’s last copy
      <Button size="chip" className={styles.retry} onTap={() => useTrailmate.getState().refresh(kind)}>RETRY</Button>
    </div>
  );
}
