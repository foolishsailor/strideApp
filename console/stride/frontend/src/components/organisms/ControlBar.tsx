import { bridge } from '../../bridge/stride';
import { canStop, fanButtonLabel, primaryAction, primaryLabel } from '../../lib/session';
import { useField, useMode } from '../../store/session';
import { useUi } from '../../store/ui';
import { Button, acknowledge } from '../primitives';
import styles from './ControlBar.module.css';

/** The control band, docked to the bottom edge between the two rails.
 *  Speed and incline live in the rails; this is start, fan and stop. Held
 *  clear of the panel edge: touches within ~15px of the bezel register
 *  unreliably on this digitiser. */
export function ControlBar() {
  const mode = useMode();
  const fan = useField('fan') ?? 0;
  const { fanOpen, setFanOpen, setConfirmOpen } = useUi();

  const onPrimary = (e: Event) => {
    setFanOpen(false);
    const action = primaryAction(mode);
    if (action) bridge()[action]();
    acknowledge(e.currentTarget as Element);
  };

  const onStop = () => {
    if (!canStop(mode)) return;
    setFanOpen(false);
    // Halt the belt first, ask second. Never the other way round.
    bridge().pause();
    setConfirmOpen(true);
  };

  return (
    <div className={styles.controls}>
      <Button tone="primary" active={mode === 'running'} onTap={onPrimary}>{primaryLabel(mode)}</Button>
      <Button onTap={() => setFanOpen(!fanOpen)}>{fanButtonLabel(fan)}</Button>
      <Button tone="stop" muted={mode === 'cooldown'} onTap={onStop}>STOP</Button>
    </div>
  );
}
