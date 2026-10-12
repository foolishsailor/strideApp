import { useEffect, useRef } from 'react';
import { core } from '../bridge/stride';
import { timeOf, useNow } from '../hooks/useClock';
import { markActivity, useUi } from '../store/ui';
import styles from './SleepOverlay.module.css';

/** After the core's wake step: nothing counts as a press for this long, so the
 *  waking tap cannot also press whatever is now under the finger. */
const WAKE_SUPPRESS_MS = 500;

/** The dark panel. Only ever up between walks (see useIdleSleep). */
export function SleepOverlay() {
  const asleep = useUi((s) => s.asleep);
  const now = useNow();
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el || !asleep) return;
    /* The tap wakes the panel; the machine behind it is a second question,
       asked only when there is one to ask (the core's wakeStep).

       Handled on the overlay itself with preventDefault(), which suppresses
       the synthetic click that would otherwise reach the button sitting under
       the finger — how one tap used to both wake the console and start a
       workout. Listeners are native and non-passive for that reason. */
    const wake = (e: Event) => {
      e.preventDefault();
      markActivity();
      core().wakeStep(el, () => {
        core().suppress(WAKE_SUPPRESS_MS);
        useUi.getState().setAsleep(false);
      });
    };
    el.addEventListener('touchstart', wake, { passive: false });
    el.addEventListener('mousedown', wake);
    return () => {
      el.removeEventListener('touchstart', wake);
      el.removeEventListener('mousedown', wake);
    };
  }, [asleep]);

  if (!asleep) return null;
  return (
    /* The root is handed to the core's wakeStep, which draws its question
       inside it and hides these two children while it asks. */
    <div ref={ref} className={styles.sleep}>
      <div className={styles.clock}>{timeOf(now)}</div>
      <div className={styles.hint}>Tap to wake</div>
    </div>
  );
}
