import { memo, useEffect, useRef } from 'react';
import { useScrollTap } from '../../hooks/useTap';
import { cx } from '../../lib/cx';
import { Button, Label, Numeral } from '../primitives';
import styles from './ValueRail.module.css';

/** One value in a rail's list. Pressing it goes straight there. */
export const RailStop = memo(function RailStop({ value, selected, onPick }: {
  value: number;
  selected: boolean;
  onPick: (v: number) => void;
}) {
  const ref = useScrollTap<HTMLButtonElement>(() => onPick(value));
  return (
    <button ref={ref} data-stop={value} className={cx(styles.stop, selected && styles.selected)}>
      {value}
    </button>
  );
});

/** A side of the screen given to one control: incline on the left, speed on
 *  the right. The reading on top, then + and − fixed at either end of a list
 *  of stops you can scroll and press. Higher is up, so + sits over the list. */
export function ValueRail({
  side, label, value, unit, target, stops, selected, focus, onPick, onStep, fine, coarse, muted,
}: {
  side: 'left' | 'right';
  label: string;
  value: string;
  unit: string;
  target: string;
  /** Ascending; drawn highest first. */
  stops: readonly number[];
  /** The stop the target is exactly on, if any. */
  selected?: number;
  /** The stop to keep in view: the nearest to the target. */
  focus?: number;
  onPick: (v: number) => void;
  onStep: (delta: number) => void;
  fine: number;
  coarse: number;
  /** Dimmed: not useful in the current state, but still pressable. */
  muted?: boolean;
}) {
  const list = useRef<HTMLDivElement>(null);
  const touching = useRef(false);
  const placed = useRef(false);

  // Follow the target as it moves, so a held + scrolls the list along with it.
  // Never while a finger is on the list: that's somebody looking for a stop.
  // Opens already there; only later moves glide.
  useEffect(() => {
    const el = list.current;
    const item = el?.querySelector<HTMLElement>(`[data-stop="${focus}"]`);
    if (!el || !item || touching.current) return;
    const top = item.offsetTop - (el.clientHeight - item.offsetHeight) / 2;
    if (placed.current && typeof el.scrollTo === 'function') el.scrollTo({ top, behavior: 'smooth' });
    else el.scrollTop = top;
    placed.current = true;
  }, [focus]);

  return (
    <div className={cx(styles.rail, styles[side], muted && styles.muted)}>
      <div className={styles.reading}>
        <Label className={styles.label}>{label}</Label>
        <Numeral size="display" className={styles.value}>{value}</Numeral>
        <div className={styles.target}>
          {unit} · target <b>{target}</b>
        </div>
      </div>
      <Button size="rail" onStep={onStep} fine={fine} coarse={coarse}>+</Button>
      <div
        ref={list}
        className={styles.list}
        onTouchStart={() => { touching.current = true; }}
        onTouchEnd={() => { touching.current = false; }}
        onTouchCancel={() => { touching.current = false; }}
      >
        {[...stops].reverse().map((v) => (
          <RailStop key={v} value={v} selected={v === selected} onPick={onPick} />
        ))}
      </div>
      <Button size="rail" onStep={(d) => onStep(-d)} fine={fine} coarse={coarse}>−</Button>
    </div>
  );
}
