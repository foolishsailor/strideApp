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
