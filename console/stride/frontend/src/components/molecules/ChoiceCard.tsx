import type { ReactNode } from 'react';
import { cx } from '../../lib/cx';
import { PressableCard } from '../primitives';
import styles from './ChoiceCard.module.css';

/** A big answer to the welcome screen's question: an icon, a name, a hint.
 *  `person` is the smaller card with an initial in a ring. `selected` when
 *  it is one of a set chosen from before BEGIN; `muted` when it can't be
 *  chosen now (the hint says why). */
export function ChoiceCard({ icon, name, hint, person, selected, muted, onTap }: {
  icon: ReactNode;
  name: string;
  hint?: string;
  person?: boolean;
  selected?: boolean;
  muted?: boolean;
  onTap: () => void;
}) {
  return (
    <PressableCard
      shape="choice"
      selected={selected}
      onTap={() => !muted && onTap()}
      className={cx(styles.card, person && styles.person, muted && styles.muted)}
    >
      {person ? <span className={styles.initial}>{icon}</span> : <span className={styles.glyph}>{icon}</span>}
      <span className={styles.name}>{name}</span>
      {hint && <span className={styles.hint}>{hint}</span>}
    </PressableCard>
  );
}
