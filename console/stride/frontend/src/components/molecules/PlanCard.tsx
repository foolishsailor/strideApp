import type { ReactNode } from 'react';
import { cx } from '../../lib/cx';
import { PressableCard } from '../primitives';
import { Sparkline } from './Sparkline';
import styles from './PlanCard.module.css';

/* The loop mark: the repeat arrows from a music player, which is what it
   means. Same glyph and class as the core's loopMark(), so the core's
   tappedLoop() can tell a press on it from a press on the card around it. It
   is a span inside the card's button, not a button of its own — a button in a
   button is invalid and Chromium does the obvious wrong thing with the tap. */
const LOOP_PATH = 'M7 7h10v3l4-4-4-4v3H5v6h2V7zm10 10H7v-3l-4 4 4 4v-3h12v-6h-2v4z';

function LoopMark({ on }: { on: boolean }) {
  return (
    <span className={cx('loop', styles.loop, on && styles.loopOn)}>
      <svg viewBox="0 0 24 24"><path d={LOOP_PATH} /></svg>
    </span>
  );
}

/** A walk to choose: its name, a line about it, and the shape of its ground.
 *  Pass `loop` to offer the there-and-back mark (routes only). */
export function PlanCard({ name, blurb, points, selected, loop, onTap }: {
  name: string;
  blurb: ReactNode;
  points: readonly number[];
  selected: boolean;
  loop?: { on: boolean };
  onTap: (e: Event) => void;
}) {
  return (
    <PressableCard onTap={onTap} selected={selected} className={cx(styles.card, loop && styles.route)}>
      <div className={styles.name}>{name}</div>
      <div className={styles.blurb}>{blurb}</div>
      <Sparkline points={points} className={styles.spark} />
      {loop && <LoopMark on={loop.on} />}
    </PressableCard>
  );
}
