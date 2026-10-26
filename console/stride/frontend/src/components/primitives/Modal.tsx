import type { ReactNode } from 'react';
import { cx } from '../../lib/cx';
import { Button } from './Button';
import { Icon } from './Icon';
import { fit } from './Text';
import styles from './Modal.module.css';

/**
 * A popup: a panel over the page, the page dimmed behind it. A title, a
 * close in the corner, whatever the choice is, and optional actions along
 * the bottom. Pressing outside the panel closes it, as the close does.
 *
 * Not Overlay: that is a whole-panel question the run stops for (paused,
 * the safety key). This is a choice made on the way, and the page it was
 * opened from stays in view.
 */
export function Modal({ title, label, onClose, actions, className, children }: {
  title?: ReactNode;
  /** The dialog's name when it has no title. */
  label?: string;
  onClose: () => void;
  actions?: ReactNode;
  className?: string;
  children?: ReactNode;
}) {
  return (
    <div data-touch className={styles.scrim} onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className={cx(styles.panel, className)} role="dialog" aria-label={typeof title === 'string' ? title : label}>
        <div className={styles.head}>
          <div className={cx(styles.title, fit(1))}>{title}</div>
          <Button size="nav" className={styles.close} onTap={onClose}><Icon name="close" label="Close" /></Button>
        </div>
        {children && <div className={styles.body}>{children}</div>}
        {actions && <div className={styles.actions}>{actions}</div>}
      </div>
    </div>
  );
}
