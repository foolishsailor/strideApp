import { useCallback, useRef, type ReactNode } from 'react';
import { useStepper, useTap } from '../../hooks/useTap';
import { cx } from '../../lib/cx';
import { acknowledge } from './acknowledge';
import styles from './Button.module.css';

export type ButtonTone = 'default' | 'primary' | 'stop';
/** Size is the button's role on the panel, each sized for a finger mid-stride. */
export type ButtonSize = 'control' | 'overlay' | 'wide' | 'chip' | 'menu' | 'corner' | 'rail' | 'dock' | 'reading' | 'nav';

/** The run screen's controls are text only: no fill, edge or shadow. */
const BARE: readonly ButtonSize[] = ['rail', 'dock', 'reading'];

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

/** Every press is acknowledged here, once for all: the ring goes round the
 *  button before its handler runs, whatever the handler does. */
export function Button(props: ButtonProps) {
  const { tone = 'default', size = 'control', muted, active, selected, className, children } = props;
  const el = useRef<HTMLButtonElement | null>(null);
  const tapRef = useTap<HTMLButtonElement>(props.onTap && ((e) => {
    acknowledge(el.current);
    props.onTap?.(e);
  }));
  const stepRef = useStepper<HTMLButtonElement>((d) => {
    acknowledge(el.current);
    (props.onStep ?? noop)(d);
  }, 'fine' in props ? props.fine : 0, 'coarse' in props ? props.coarse : 0);
  const stepping = !!props.onStep;
  const ref = useCallback((node: HTMLButtonElement | null) => {
    el.current = node;
    (stepping ? stepRef : tapRef)(node);
  }, [stepping, stepRef, tapRef]);

  return (
    <button
      ref={ref}
      className={cx(
        styles.button,
        styles[size],
        BARE.includes(size) && styles.bare,
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

