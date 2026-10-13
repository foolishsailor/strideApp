import type { ReactNode } from 'react';
import { useScrollTap, useTap } from '../../hooks/useTap';
import { cx } from '../../lib/cx';
import styles from './Pressable.module.css';

/** A card you press: the welcome screen's choices, the plan and workout
 *  cards. A surface that is also a button, sized by whoever uses it. `choice`
 *  takes the theme's radius for the big welcome cards. `inList` is a card in
 *  a list that scrolls: it counts on lifting the finger, so a drag scrolls. */
export function PressableCard({ onTap, selected, shape = 'card', inList, className, children }: {
  onTap: (e: Event) => void;
  selected?: boolean;
  shape?: 'card' | 'choice';
  inList?: boolean;
  className?: string;
  children: ReactNode;
}) {
  const tapRef = useTap<HTMLButtonElement>(inList ? undefined : onTap);
  const scrollRef = useScrollTap<HTMLButtonElement>(inList ? onTap : undefined);
  return (
    <button ref={inList ? scrollRef : tapRef} className={cx(styles.pressable, styles[shape], selected && styles.selected, className)}>
      {children}
    </button>
  );
}
