import type { CSSProperties, ReactNode } from 'react';
import { cx } from '../../lib/cx';
import styles from './Layout.module.css';

/** Fills the 1280x800 panel. Every screen and overlay is one of these. */
export function Fill({ centred, className, style, children }: {
  centred?: boolean;
  className?: string;
  style?: CSSProperties;
  children?: ReactNode;
}) {
  return <div className={cx(styles.fill, centred && styles.centred, className)} style={style}>{children}</div>;
}

/** A centred horizontal run. Spacing is a margin on each child, not `gap`:
 *  flexbox gap is Chromium 84, and Gen 6 consoles run 83. With no `space`,
 *  children keep their own margins. */
export function Row({ space = 0, className, children }: {
  space?: number;
  className?: string;
  children: ReactNode;
}) {
  return (
    <div
      className={cx(styles.row, space > 0 && styles.spaced, className)}
      style={space > 0 ? ({ '--row-half': `${space / 2}px` } as CSSProperties) : undefined}
    >
      {children}
    </div>
  );
}

/** A rounded translucent panel — cards, picks and the coach all sit on one. */
export function Surface({ radius = 'lg', className, children }: {
  radius?: 'md' | 'lg' | 'xl';
  className?: string;
  children: ReactNode;
}) {
  return <div className={cx(styles.surface, styles[radius], className)}>{children}</div>;
}
