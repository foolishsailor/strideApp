import type { ReactNode } from 'react';
import { cx } from '../../lib/cx';
import { Fill, Row } from './Layout';
import { Heading, Prose, type Tone } from './Text';
import styles from './Overlay.module.css';

/** A question over the whole panel: a heading, a sentence, and the answers.
 *
 *  The scrim is nearly opaque on purpose. At 0.92 the live layer showed through
 *  enough to compete with the headline over it — the one thing a paused screen
 *  cannot afford. Not fully opaque either: the workout has not gone anywhere,
 *  and a faint ghost of it says so. */
export function Overlay({ title, titleTone, message, actions, children }: {
  title: ReactNode;
  titleTone?: Tone;
  message?: ReactNode;
  actions?: ReactNode;
  /** Anything between the message and the answers: the APPS picker's apps. */
  children?: ReactNode;
}) {
  return (
    <Fill centred className={styles.scrim}>
      <Heading size="section" className={cx(titleTone === 'alert' && styles.alert)}>{title}</Heading>
      {message && <Prose className={styles.message}>{message}</Prose>}
      {children}
      {actions && <Row className={styles.actions}>{actions}</Row>}
    </Fill>
  );
}
