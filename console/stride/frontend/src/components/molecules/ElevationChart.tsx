import type { GroundPoint } from '../../lib/routes';
import { climb } from '../../lib/units';
import { useUnits } from '../../store/settings';
import { cx } from '../../lib/cx';
import styles from './ElevationChart.module.css';

/** A route's height along its length: the ground as a filled shape, and how
 *  far its highest point is above its lowest. Stretches to its box. */
export function ElevationChart({ points, className }: { points: readonly GroundPoint[]; className?: string }) {
  const u = useUnits();
  if (points.length < 2) return null;
  const first = points[0]!.m;
  const span = points[points.length - 1]!.m - first || 1;
  let lo = Infinity;
  let hi = -Infinity;
  for (const p of points) {
    lo = Math.min(lo, p.up);
    hi = Math.max(hi, p.up);
  }
  // A flat route still draws as ground, not as a line along the bottom edge.
  const rise = Math.max(hi - lo, 10);
  const x = (m: number) => ((m - first) / span) * 1000;
  const y = (up: number) => 92 - ((up - lo) / rise) * 84;
  const line = points.map((p, i) => `${i ? 'L' : 'M'}${x(p.m).toFixed(1)},${y(p.up).toFixed(1)}`).join('');
  const top = climb(hi - lo, u);
  return (
    <div className={cx(styles.chart, className)}>
      <svg viewBox="0 0 1000 100" preserveAspectRatio="none" className={styles.plot} aria-hidden="true">
        <path d={`${line}L1000,100L0,100Z`} className={styles.ground} />
        <path d={line} className={styles.edge} vectorEffect="non-scaling-stroke" />
      </svg>
      <span className={styles.range}>{top.value} {top.unit} high to low</span>
    </div>
  );
}
