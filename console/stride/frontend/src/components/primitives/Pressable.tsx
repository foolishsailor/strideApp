import type { ReactNode } from 'react';
import { useTap } from '../../hooks/useTap';
import { cx } from '../../lib/cx';
import styles from './Pressable.module.css';

/** A card you press: the welcome screen's choices and the plan cards. A
 *  surface that is also a button, sized by whoever uses it. `choice` takes the
 *  theme's radius for the big welcome cards. */
export function PressableCard({ onTap, selected, shape = 'card', className, children }: {
  onTap: (e: Event) => void;
  selected?: boolean;
  shape?: 'card' | 'choice';
  className?: string;
  children: ReactNode;
}) {
  const ref = useTap<HTMLButtonElement>(onTap);
  return (
    <button ref={ref} className={cx(styles.pressable, styles[shape], selected && styles.selected, className)}>
      {children}
    </button>
  );
}
