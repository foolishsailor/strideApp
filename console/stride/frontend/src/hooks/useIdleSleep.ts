import { useEffect } from 'react';
import { bridge } from '../bridge/stride';
import { isRestful } from '../lib/session';
import { useSession } from '../store/session';
import { useSettings } from '../store/settings';
import { idleMs, markActivity, useUi } from '../store/ui';

/* The console lives in the room; at rest it should be dark, not a glowing
   slab. After Settings → Display → Sleep after, with no workout in progress,
   it goes to standby: the backlight off (MainActivity.dim) until a tap. */
export const sleepAfterMs = (): number => Math.max(1, useSettings.getState().sleepMin) * 60 * 1000;
const CHECK_EVERY_MS = 5000;

export function useIdleSleep(): void {
  useEffect(() => {
    /* Every touch resets the idle timer. Capture phase, and never a wake: that
       is the sleep overlay's job, or a press could tear it away mid-gesture. */
    const opts: AddEventListenerOptions = { capture: true, passive: true };
    document.addEventListener('touchstart', markActivity, opts);
    document.addEventListener('mousedown', markActivity, opts);

    const timer = setInterval(() => {
      const ui = useUi.getState();
      if (!ui.asleep && isRestful(useSession.getState().mode) && idleMs() > sleepAfterMs()) {
        ui.setAsleep(true);
        bridge().dim(true);
      }
    }, CHECK_EVERY_MS);

    return () => {
      document.removeEventListener('touchstart', markActivity, opts);
      document.removeEventListener('mousedown', markActivity, opts);
      clearInterval(timer);
    };
  }, []);
}
