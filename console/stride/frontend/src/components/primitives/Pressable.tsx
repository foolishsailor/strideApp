import type { ReactNode } from 'react';
import { useTap } from '../../hooks/useTap';
import { cx } from '../../lib/cx';
import styles from './Pressable.module.css';

/** A card you press: the welcome screen's choices and the plan cards. A
 *  Surface that is also a button, sized by whoever uses it. */
export function PressableCard({ onTap, selected, radius = 'lg', className, children }: {
  onTap: (e: Event) => void;
  selected?: boolean;
  radius?: 'lg' | 'xl';
  className?: string;
  children: ReactNode;
}) {
  const ref = useTap<HTMLButtonElement>(onTap);
  return (
    <button ref={ref} className={cx(styles.card, styles[radius], selected && styles.selected, className)}>
      {children}
    </button>
  );
}
