import type { ReactNode } from 'react';
import { useTap } from '../../hooks/useTap';
import { cx } from '../../lib/cx';
import { useUi } from '../../store/ui';
import styles from './Drawers.module.css';

/* Over another app (APPS) the run screen's edges become drawers: the numbers
   slide up off the top, the rails off the sides and the dock off the bottom.
   Everything in a drawer sits on a translucent black panel, since the
   backdrop is a film.

   The metrics and the dock each have a grip on their inner edge that travels
   with them, so a closed drawer still shows where it went. The dock's also
   takes the rails, which have none of their own.

   What is in a drawer is what takes touches over the app (see
   useTouchRegion): a closed drawer is off screen, so the app underneath gets
   that space back. */

export type Edge = 'top' | 'left' | 'right' | 'bottom';

/** Slides its children off `edge` when closed. The children keep their own
 *  positions on the panel; each gets the translucent panel behind it. */
export function Drawer({ edge, open, children }: { edge: Edge; open: boolean; children: ReactNode }) {
  return <div data-drawer className={cx(styles.drawer, styles[edge], !open && styles.closed)}>{children}</div>;
}

export const toggleMetrics = (): void => {
  const ui = useUi.getState();
  ui.setMetricsOpen(!ui.metricsOpen);
};

export const toggleControls = (): void => {
  const ui = useUi.getState();
  ui.setFanOpen(false);
  ui.setControlsOpen(!ui.controlsOpen);
};

/** The bar on a drawer's inner edge: tap it to send the drawer away or bring
 *  it back. */
export function Grip({ edge, onTap }: { edge: 'top' | 'bottom'; onTap: () => void }) {
  const ref = useTap<HTMLButtonElement>(onTap);
  return (
    <button ref={ref} aria-label="drawer" className={cx(styles.grip, styles[`${edge}Grip`])}>
      <i />
    </button>
  );
}
