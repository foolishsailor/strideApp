import { useEffect } from 'react';
import { bridge } from '../bridge/stride';
import { useSession } from '../store/session';
import { useUi } from '../store/ui';

/** Often enough to follow a drawer as it slides, cheap enough to run all
 *  walk: a handful of getBoundingClientRect calls, and Kotlin hears only
 *  about a change. */
const EVERY_MS = 150;

/** What takes touches over another app, for OverApp.kt: the drawers' contents,
 *  their handles and anything marked `data-touch`, as [x, y, w, h] boxes in
 *  screen pixels, clipped to the window. Screen pixels, not page ones: the two
 *  differ by devicePixelRatio, which Kotlin can't see. "all" while something
 *  covers the whole screen (a question, the picker, sleep), because then
 *  nothing should reach the app. */
export function touchableBoxes(doc: Document = document): string {
  const view = doc.defaultView ?? window;
  const W = view.innerWidth, H = view.innerHeight, px = view.devicePixelRatio || 1;
  const ui = useUi.getState();
  if (ui.confirmOpen || ui.appsOpen || ui.asleep || useSession.getState().snapshot.dmk) return 'all';
  const boxes: number[][] = [];
  for (const el of doc.querySelectorAll('[data-drawer] > *, [data-touch]')) {
    const r = el.getBoundingClientRect();
    const x0 = Math.max(0, r.left), y0 = Math.max(0, r.top);
    const x1 = Math.min(W, r.right), y1 = Math.min(H, r.bottom);
    if (x1 > x0 && y1 > y0) boxes.push([x0, y0, x1 - x0, y1 - y0].map((v) => Math.round(v * px)));
  }
  return JSON.stringify(boxes);
}

/** While over another app, keeps Kotlin told which parts of the page take
 *  touches; everything else goes to the app underneath. */
export function useTouchRegion(): void {
  const overApp = useUi((s) => s.overApp);
  useEffect(() => {
    if (!overApp || !bridge().touchable) return;
    let last = '';
    const report = () => {
      const now = touchableBoxes();
      if (now !== last) bridge().touchable?.((last = now));
    };
    report();
    const timer = setInterval(report, EVERY_MS);
    return () => clearInterval(timer);
  }, [overApp]);
}
