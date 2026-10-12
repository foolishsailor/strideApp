import type { ReactNode } from 'react';
import { useStepper, useTap } from '../../hooks/useTap';
import { cx } from '../../lib/cx';
import styles from './Button.module.css';

export type ButtonTone = 'default' | 'primary' | 'stop';
/** Size is the button's role on the panel, each sized for a finger mid-stride. */
export type ButtonSize = 'control' | 'overlay' | 'wide' | 'chip' | 'menu' | 'corner' | 'rail';

interface Common {
  tone?: ButtonTone;
  size?: ButtonSize;
  /** Dimmed: not useful in the current state, but still pressable. */
  muted?: boolean;
  /** Lit green: the thing that is happening now. */
  active?: boolean;
  /** Lit cyan: the current choice in a set. */
  selected?: boolean;
  /** Positioning from the parent layout. */
  className?: string;
  children: ReactNode;
}

interface Tappable extends Common {
  onTap?: (e: Event) => void;
  onStep?: never;
}

/** Fine step on a tap, accelerating coarse steps while held. */
interface Stepping extends Common {
  onTap?: never;
  onStep: (delta: number) => void;
  fine: number;
  coarse: number;
}

export type ButtonProps = Tappable | Stepping;

export function Button(props: ButtonProps) {
  const { tone = 'default', size = 'control', muted, active, selected, className, children } = props;
  const tapRef = useTap<HTMLButtonElement>(props.onTap);
  const stepRef = useStepper<HTMLButtonElement>(props.onStep ?? noop, 'fine' in props ? props.fine : 0, 'coarse' in props ? props.coarse : 0);

  return (
    <button
      ref={props.onStep ? stepRef : tapRef}
      className={cx(
        styles.button,
        styles[size],
        tone !== 'default' && styles[tone],
        muted && styles.muted,
        selected && styles.selected,
        active && styles.active,
        className,
      )}
    >
      {children}
    </button>
  );
}

function noop() {}

/** A short ring round a button, to acknowledge a press whose result takes a
 *  poll or two to show. */
export function acknowledge(el: Element | null): void {
  if (!(el instanceof HTMLElement)) return;
  el.classList.remove(styles.pulse!);
  void el.offsetWidth; // restart the animation
  el.classList.add(styles.pulse!);
}
