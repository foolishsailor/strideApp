import type { ReactNode } from 'react';
import { cx } from '../../lib/cx';
import { fit, Icon, PressableCard, type IconName } from '../primitives';
import styles from './ChoiceCard.module.css';

/** A big answer to a question on the way to a run: a glyph, a name, a hint.
 *  The glyph is one of the console's icons in a theme colour (`tone`: the
 *  accent green unless said), or for `person`, a smaller card, an initial in
 *  a ring. `row` lays the glyph beside the words, for choices stacked down
 *  the side. `muted` when it can't be chosen now (the hint says why). */
export function ChoiceCard({ icon, initial, tone = 'accent', name, hint, person, row, selected, muted, onTap }: {
  icon?: IconName;
  /** For `person`: the letter in the ring. */
  initial?: ReactNode;
  tone?: 'accent' | 'warm' | 'alert';
  name: string;
  hint?: string;
  person?: boolean;
  row?: boolean;
  selected?: boolean;
  muted?: boolean;
  onTap: () => void;
}) {
  return (
    <PressableCard
      shape="choice"
      selected={selected}
      onTap={() => !muted && onTap()}
      className={cx(styles.card, person && styles.person, row && styles.row, muted && styles.muted)}
    >
      {person
        ? <span className={styles.initial}>{initial}</span>
        : icon && <span className={cx(styles.glyph, styles[tone])}><Icon name={icon} label={name} /></span>}
      {row ? (
        <span className={styles.words}>
          <span className={cx(styles.name, fit(1))}>{name}</span>
          {hint && <span className={cx(styles.hint, fit(2))}>{hint}</span>}
        </span>
      ) : (
        <>
          <span className={cx(styles.name, fit(1))}>{name}</span>
          {hint && <span className={cx(styles.hint, fit(2))}>{hint}</span>}
        </>
      )}
    </PressableCard>
  );
}
