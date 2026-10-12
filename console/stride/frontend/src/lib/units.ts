import type { Units } from '../store/settings';
import { nf } from './format';

/* Kilometres or miles, from Settings → Display → Units. Only ever the
   display: the board, Kotlin, Home Assistant and TrailMate are metric
   throughout, and every number that goes back to Kotlin is converted to
   km/h on the way. */

export const KM_PER_MI = 1.609344;
const FT_PER_M = 3.28084;

/** A speed in the chosen unit, from km/h. */
export const speedIn = (kph: number, u: Units): number => (u === 'mi' ? kph / KM_PER_MI : kph);

/** A speed in the chosen unit, back to the km/h Kotlin takes. */
export const kphFrom = (v: number, u: Units): number => (u === 'mi' ? v * KM_PER_MI : v);

export const speedUnit = (u: Units): string => (u === 'mi' ? 'mph' : 'km/h');

/** One decimal place, the way the dial shows it. */
export const speedText = (kph: number | undefined, u: Units): string => speedIn(kph ?? 0, u).toFixed(1);

/** The distance walked so far, as the strip and summary show it: whole metres,
 *  or miles to two places. */
export function walked(m: number, u: Units): { value: string; unit: string } {
  return u === 'mi' ? { value: (m / 1000 / KM_PER_MI).toFixed(2), unit: 'mi' } : { value: nf(m), unit: 'm' };
}

/** A longer distance — a route, the ground left — in km or miles to two
 *  places, or metres / feet when it is under a tenth. */
export function far(m: number, u: Units): string {
  if (u === 'mi') {
    const mi = m / 1000 / KM_PER_MI;
    return mi >= 0.1 ? mi.toFixed(2) + ' mi' : Math.round(m * FT_PER_M) + ' ft';
  }
  return m >= 1000 ? (m / 1000).toFixed(2) + ' km' : Math.round(m) + ' m';
}

/** Height climbed: metres or feet. */
export function climb(m: number, u: Units): { value: string; unit: string } {
  return u === 'mi' ? { value: nf(Math.round(m * FT_PER_M)), unit: 'ft' } : { value: nf(m), unit: 'm' };
}

/** Stride length: metres to two places, or feet to one. */
export function stride(m: number, u: Units): { value: string; unit: string } {
  return u === 'mi' ? { value: (m * FT_PER_M).toFixed(1), unit: 'ft' } : { value: m.toFixed(2), unit: 'm' };
}

/** Seconds per km or per mile at a belt speed, or 0 when the belt is barely
 *  turning and a pace would read as hours. */
export function paceSec(kph: number | undefined, u: Units): number {
  if (!kph || kph < 0.5) return 0;
  return Math.round((3600 / kph) * (u === 'mi' ? KM_PER_MI : 1));
}

export const paceUnit = (u: Units): string => (u === 'mi' ? '/mi' : '/km');
