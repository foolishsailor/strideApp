import { useEffect, useState } from 'react';
import { bridge } from '../../bridge/stride';
import type { WorkoutStep } from '../../bridge/types';
import { speedText, speedUnit } from '../../lib/units';
import { useField } from '../../store/session';
import { useUnits } from '../../store/settings';
import { useUi } from '../../store/ui';
import { Button } from '../primitives';
import styles from './SpeedMenu.module.css';

/** Closes itself if nothing is chosen, like the fan's: it sits over the chart. */
const AUTO_CLOSE_MS = 6000;

/** A step that sets the speed, by pace or heart rate: the only time AUTO
 *  means anything. */
export const drivesSpeed = (w: WorkoutStep | null | undefined): boolean =>
  !!w && (w.target.type === 'pace' || w.target.type === 'hr');

/** Says what came of SYNC TO POD: Kotlin answers {ok, note}. */
function readSync(json: string | undefined): string {
  try {
    return (JSON.parse(json || '{}') as { note?: string }).note || '';
  } catch {
    return '';
  }
}

/** Opened by tapping the speed reading: hand the speed back to the workout,
 *  or take it, and match the belt to the foot pod. */
export function SpeedMenu() {
  const open = useUi((s) => s.speedMenuOpen);
  const close = () => useUi.getState().setSpeedMenuOpen(false);
  const step = useField('workoutStep');
  const podKph = useField('podSyncKph') ?? 0;
  const u = useUnits();
  const [note, setNote] = useState('');

  useEffect(() => {
    if (!open) return;
    setNote('');
    const t = setTimeout(close, AUTO_CLOSE_MS);
    return () => clearTimeout(t);
  }, [open]);

  if (!open) return null;
  const auto = step?.speedAuto ?? false;
  const setAuto = (on: boolean) => {
    bridge().setSpeedAuto?.(on);
    close();
  };
  const sync = () => setNote(readSync(bridge().syncToPod?.()));

  return (
    <div data-touch className={styles.menu}>
      {drivesSpeed(step) && (
        <div className={styles.pair}>
          <Button size="menu" selected={auto} onTap={() => setAuto(true)}>AUTO</Button>
          <Button size="menu" selected={!auto} onTap={() => setAuto(false)}>MANUAL</Button>
        </div>
      )}
      <Button size="menu" muted={podKph <= 0} onTap={sync}>SYNC TO POD</Button>
      <div className={styles.hint}>
        {note || (podKph > 0
          ? `Pod reads ${speedText(podKph, u)} ${speedUnit(u)}`
          : 'Needs 10 steady seconds of pod readings')}
      </div>
    </div>
  );
}
