import { useEffect } from 'react';
import { bridge } from '../bridge/stride';
import { isRestful } from '../lib/session';
import { useSession } from '../store/session';
import { idleMs, markActivity, useUi } from '../store/ui';

/* The console lives in the room; at rest it should be dark, not a glowing
   slab. Only sleeps when no workout is in progress. */
export const SLEEP_AFTER_MS = 5 * 60 * 1000;
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
      if (!ui.asleep && isRestful(useSession.getState().mode) && idleMs() > SLEEP_AFTER_MS) {
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
