import { useCallback, useRef } from 'react';
import { core } from '../bridge/stride';

/* Touch goes through the core, never React's onClick.

   The core fires on touchstart (a click waits for touch-end and gesture
   disambiguation, which reads as an ignored press mid-stride), ignores the
   tap that woke the screen, and adds `.down` while pressed. It also has to
   preventDefault on a non-passive listener, which React's root-level
   touch listeners cannot do.

   Each hook returns a ref callback. The listener is attached once per element
   and always calls the latest handler, so callers can pass inline lambdas. */

function useLatest<T>(value: T) {
  const ref = useRef(value);
  ref.current = value;
  return ref;
}

export function useTap<E extends HTMLElement>(onTap: ((e: Event) => void) | undefined) {
  const latest = useLatest(onTap);
  return useCallback((el: E | null) => {
    if (el) core().tap(el, (e) => latest.current?.(e));
  }, [latest]);
}

/** Fine step on a tap, accelerating coarse steps on a hold — the way the
 *  physical buttons behave. */
export function useStepper<E extends HTMLElement>(onStep: (delta: number) => void, fine: number, coarse: number) {
  const latest = useLatest(onStep);
  return useCallback((el: E | null) => {
    if (el) core().stepper(el, (d) => latest.current(d), fine, coarse);
  }, [latest, fine, coarse]);
}

/** Distance a finger may travel and still count as a tap rather than a scroll. */
const SLOP_PX = 10;

/** A tap that lets the page scroll. `useTap` fires on touchstart and swallows
 *  the gesture, which is right for a fixed button and wrong for a row in a
 *  list you drag: here the press only counts on touchend, and only if the
 *  finger stayed put. Still ignores the tap that woke the screen. */
export function useScrollTap<E extends HTMLElement>(onTap: ((e: Event) => void) | undefined) {
  const latest = useLatest(onTap);
  return useCallback((el: E | null) => {
    if (!el) return;
    let x = 0, y = 0, moved = false, handled = false;
    el.addEventListener('touchstart', (e) => {
      handled = true;
      moved = false;
      x = e.touches[0]!.clientX;
      y = e.touches[0]!.clientY;
      el.classList.add('down');
    }, { passive: true });
    el.addEventListener('touchmove', (e) => {
      const t = e.touches[0]!;
      if (Math.abs(t.clientX - x) > SLOP_PX || Math.abs(t.clientY - y) > SLOP_PX) {
        moved = true;
        el.classList.remove('down');
      }
    }, { passive: true });
    el.addEventListener('touchend', (e) => {
      el.classList.remove('down');
      if (moved || core().justWoke()) return;
      e.preventDefault(); // no synthetic click after
      latest.current?.(e);
    });
    el.addEventListener('touchcancel', () => el.classList.remove('down'));
    el.addEventListener('click', (e) => { if (!handled && !core().justWoke()) latest.current?.(e); });
  }, [latest]);
}
