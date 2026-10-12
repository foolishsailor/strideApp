import { bridge } from '../../bridge/stride';
import { canStop, fanButtonLabel, primaryAction, primaryLabel } from '../../lib/session';
import { useField, useMode } from '../../store/session';
import { useUi } from '../../store/ui';
import { Button, acknowledge } from '../primitives';
import styles from './ControlBar.module.css';

/** The control band, docked to the bottom edge between the two rails.
 *  Speed and incline live in the rails; this is apps, start, fan and stop.
 *  APPS sits at the far end from STOP, so a miss for one is never the other.
 *  Held clear of the panel edge: touches within ~15px of the bezel register
 *  unreliably on this digitiser. */
export function ControlBar() {
  const mode = useMode();
  const fan = useField('fan') ?? 0;
  const { fanOpen, setFanOpen, setConfirmOpen, setAppsOpen, overApp } = useUi();

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

  // Over another app, the same place is the way back to STRIDE.
  const onApps = () => {
    setFanOpen(false);
    if (overApp) bridge().closeApp?.();
    else setAppsOpen(true);
  };

  return (
    <div className={styles.controls}>
      {bridge().apps && <Button size="dock" className={styles.apps} onTap={onApps}>{overApp ? 'BACK' : 'APPS'}</Button>}
      <Button size="dock" tone="primary" active={mode === 'running'} onTap={onPrimary}>{primaryLabel(mode)}</Button>
      <Button size="dock" onTap={() => setFanOpen(!fanOpen)}>{fanButtonLabel(fan)}</Button>
      <Button size="dock" tone="stop" muted={mode === 'cooldown'} onTap={onStop}>STOP</Button>
    </div>
  );
}
