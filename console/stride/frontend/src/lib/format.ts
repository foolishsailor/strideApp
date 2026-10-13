import { core } from '../bridge/stride';

/* Formatters come from the shared core so all five interfaces print numbers
   the same way (and none depends on this WebView's ICU data). */
export const mmss = (seconds: number): string => core().mmss(seconds);
export const nf = (n: number): string => core().nf(n);
export const fixed1 = (n: number | undefined): string => (n ?? 0).toFixed(1);

/** A planned length of time: "45 min", "1 h 05 min", or "1:30" when it is not
 *  whole minutes (a 90-second recovery). */
export function durationText(seconds: number): string {
  const s = Math.round(seconds);
  if (s % 60 !== 0 && s < 600) return mmss(s);
  const min = Math.round(s / 60);
  if (min < 60) return `${min} min`;
  const m = min % 60;
  return `${Math.floor(min / 60)} h ${m < 10 ? '0' : ''}${m} min`;
}
