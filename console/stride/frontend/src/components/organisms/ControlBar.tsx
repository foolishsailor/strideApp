import { bridge } from '../../bridge/stride';
import { canStop, fanButtonLabel, isMoving, primaryAction, primaryLabel } from '../../lib/session';
import { useField, useMode } from '../../store/session';
import { useUi } from '../../store/ui';
import { Button, acknowledge } from '../primitives';
import styles from './ControlBar.module.css';

/** Speed steps 0.1 km/h on a tap, 0.5 while held; incline 0.5 % either way. */
const SPEED_STEP = { fine: 0.1, coarse: 0.5 };
const INCLINE_STEP = { fine: 0.5, coarse: 0.5 };

/** The control band, 678 – 766. Held clear of the panel edge: touches within
 *  ~15px of the bezel register unreliably on this digitiser. */
export function ControlBar() {
  const mode = useMode();
  const fan = useField('fan') ?? 0;
  const { fanOpen, setFanOpen, setConfirmOpen } = useUi();
  const moving = isMoving(mode);

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
      <Button muted={!moving} onStep={(d) => bridge().speed(-d)} {...SPEED_STEP}>SPEED −</Button>
      <Button muted={!moving} onStep={(d) => bridge().speed(d)} {...SPEED_STEP}>SPEED +</Button>
      <Button onStep={(d) => bridge().incline(-d)} {...INCLINE_STEP}>INCLINE −</Button>
      <Button onStep={(d) => bridge().incline(d)} {...INCLINE_STEP}>INCLINE +</Button>
      <Button onTap={() => setFanOpen(!fanOpen)}>{fanButtonLabel(fan)}</Button>
      <Button tone="stop" muted={mode === 'cooldown'} onTap={onStop}>STOP</Button>
    </div>
  );
}
