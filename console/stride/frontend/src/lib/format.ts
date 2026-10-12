import { core } from '../bridge/stride';

/* Formatters come from the shared core so all five interfaces print numbers
   the same way (and none depends on this WebView's ICU data). */
export const mmss = (seconds: number): string => core().mmss(seconds);
export const nf = (n: number): string => core().nf(n);
export const fixed1 = (n: number | undefined): string => (n ?? 0).toFixed(1);
