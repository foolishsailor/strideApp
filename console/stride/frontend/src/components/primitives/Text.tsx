import type { ReactNode } from 'react';
import { cx } from '../../lib/cx';
import styles from './Text.module.css';

export type Tone = 'ink' | 'dim' | 'faint' | 'accent' | 'warm' | 'alert';

const toneClass = (tone: Tone | undefined) => (tone ? styles[tone] : undefined);

/** Text that must fit its box: at most this many lines, then an ellipsis.
 *  The one way the console shortens text: give it to any element (a card's
 *  name, a title), or use the `lines` prop of the components below. */
export const fit = (lines: 1 | 2): string => (lines === 1 ? styles.line1 : styles.line2)!;
const fitClass = (lines: 1 | 2 | undefined) => (lines ? fit(lines) : undefined);

/** Small uppercase tracked text: the names of things. */
export function Label({ size = 'small', tone = 'dim', lines, className, children }: {
  size?: 'caption' | 'label' | 'small' | 'title';
  tone?: Tone;
  /** Fit to this many lines, then an ellipsis (see fit). */
  lines?: 1 | 2;
  className?: string;
  children: ReactNode;
}) {
  return <div className={cx(styles.label, styles[size], toneClass(tone), fitClass(lines), className)}>{children}</div>;
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
export function Heading({ size = 'page', lines, className, children }: {
  size?: 'page' | 'section';
  lines?: 1 | 2;
  className?: string;
  children: ReactNode;
}) {
  return <div className={cx(styles.heading, styles[size], fitClass(lines), className)}>{children}</div>;
}

export function Prose({ size = 'lead', tone = 'dim', lines, className, children }: {
  size?: 'small' | 'body' | 'lead' | 'ask';
  tone?: Tone;
  lines?: 1 | 2;
  className?: string;
  children: ReactNode;
}) {
  return <div className={cx(styles.prose, styles[size], toneClass(tone), fitClass(lines), className)}>{children}</div>;
}
