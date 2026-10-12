import { useEffect } from 'react';
import { bridge } from '../../bridge/stride';
import { FAN_LEVELS } from '../../lib/session';
import { useField } from '../../store/session';
import { useUi } from '../../store/ui';
import { Button } from '../primitives';
import styles from './FanMenu.module.css';

/** Closes itself if nothing is chosen: it sits over the hero. */
const AUTO_CLOSE_MS = 5000;

/** The fan's actual levels in a slide-out, rather than cycling through them blind. */
export function FanMenu() {
  const open = useUi((s) => s.fanOpen);
  const close = () => useUi.getState().setFanOpen(false);
  const fan = useField('fan') ?? 0;

  useEffect(() => {
    if (!open) return;
    const t = setTimeout(close, AUTO_CLOSE_MS);
    return () => clearTimeout(t);
  }, [open]);

  if (!open) return null;
  return (
    <div className={styles.menu}>
      {FAN_LEVELS.map((name, level) => (
        <Button key={name} size="menu" selected={level === fan} onTap={() => { bridge().setFan(level); close(); }}>
          {name}
        </Button>
      ))}
    </div>
  );
}
