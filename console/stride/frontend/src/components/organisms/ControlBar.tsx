import { bridge } from '../../bridge/stride';
import { canStop, fanButtonLabel, fanLevelMark, primaryAction, primaryIcon, primaryLabel } from '../../lib/session';
import { useField, useMode } from '../../store/session';
import { useUi } from '../../store/ui';
import { Button, Icon } from '../primitives';
import styles from './ControlBar.module.css';

/** The control band, docked to the bottom edge, edge to edge, in glyphs.
 *  The fan's level rides beside its glyph.
 *  Speed and incline live in the rails; this is apps, start, fan and stop.
 *  APPS sits at the far end from STOP, so a miss for one is never the other.
 *  Held clear of the panel edge: touches within ~15px of the bezel register
 *  unreliably on this digitiser. */
export function ControlBar() {
  const mode = useMode();
  const fan = useField('fan') ?? 0;
  const { fanOpen, setFanOpen, setConfirmOpen, setAppsOpen, overApp } = useUi();

  const onPrimary = () => {
    setFanOpen(false);
    const action = primaryAction(mode);
    if (action) bridge()[action]();
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
      {bridge().apps && (
        <Button size="dock" onTap={onApps}>
          {overApp ? <Icon name="back" label="BACK" /> : <Icon name="apps" label="APPS" />}
        </Button>
      )}
      <Button size="dock" tone="primary" active={mode === 'running'} onTap={onPrimary}>
        <Icon name={primaryIcon(mode)} label={primaryLabel(mode)} />
      </Button>
      <Button size="dock" onTap={() => setFanOpen(!fanOpen)}>
        <Icon name="fan" label={fanButtonLabel(fan)} />
        {fan > 0 && <span className={styles.level}>{fanLevelMark(fan)}</span>}
      </Button>
      <Button size="dock" tone="stop" muted={mode === 'cooldown'} onTap={onStop}>
        <Icon name="stop" label="STOP" />
      </Button>
    </div>
  );
}
