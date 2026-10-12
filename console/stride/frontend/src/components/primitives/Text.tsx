import type { ReactNode } from 'react';
import { cx } from '../../lib/cx';
import styles from './Text.module.css';

export type Tone = 'ink' | 'dim' | 'faint' | 'accent' | 'warm' | 'alert';

const toneClass = (tone: Tone | undefined) => (tone ? styles[tone] : undefined);

/** Small uppercase tracked text: the names of things. */
export function Label({ size = 'small', tone = 'dim', className, children }: {
  size?: 'caption' | 'label' | 'small' | 'title';
  tone?: Tone;
  className?: string;
  children: ReactNode;
}) {
  return <div className={cx(styles.label, styles[size], toneClass(tone), className)}>{children}</div>;
}

/** A number to be read at a glance: light weight, tabular figures, optional
 *  unit set small beside it. */
export function Numeral({ size, unit, glow, className, children }: {
  size: 'metric' | 'display' | 'hero';
  unit?: string;
  glow?: boolean;
  className?: string;
  children: ReactNode;
}) {
  return (
    <div className={cx(styles.numeral, styles[size], glow && styles.glow, className)}>
      {children}
      {unit && <small className={styles.unit}>{unit}</small>}
    </div>
  );
}

/** Headings and sentences. */
export function Heading({ size = 'page', className, children }: {
  size?: 'page' | 'section';
  className?: string;
  children: ReactNode;
}) {
  return <div className={cx(styles.heading, styles[size], className)}>{children}</div>;
}

export function Prose({ size = 'lead', tone = 'dim', className, children }: {
  size?: 'small' | 'body' | 'lead' | 'ask';
  tone?: Tone;
  className?: string;
  children: ReactNode;
}) {
  return <div className={cx(styles.prose, styles[size], toneClass(tone), className)}>{children}</div>;
}
