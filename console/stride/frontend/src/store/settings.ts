import { create } from 'zustand';
import { bridge } from '../bridge/stride';

/* The saved settings that change what this page shows (Settings.kt json()).
   Read at boot and again every time Settings closes, so a change shows up
   the moment Settings is put away. Settings itself (stride-settings.js) is
   what writes them; this page only reads. */

export type Units = 'km' | 'mi';

export interface DisplaySettings {
  units: Units;
  /** 24-hour clock, or 12 with am/pm. */
  clock24: boolean;
  /** Idle minutes before the panel sleeps between walks. */
  sleepMin: number;
  warmupMin: number;
  cooldownMin: number;
  /** The speed the belt eases up to in the warm-up, km/h. */
  warmupKph: number;
}

export const DEFAULTS: DisplaySettings = {
  units: 'km', clock24: true, sleepMin: 5, warmupMin: 2, cooldownMin: 2, warmupKph: 2,
};

const num = (v: unknown, d: number): number => (typeof v === 'number' && isFinite(v) ? v : d);

/** Settings.kt json() → what the page needs, with Kotlin's own defaults for
 *  anything missing (an older APK, or the desktop stub, which has none). */
export function readSettings(json: string | undefined): DisplaySettings {
  let o: Record<string, unknown> = {};
  try {
    o = JSON.parse(json || '{}') as Record<string, unknown>;
  } catch {
    /* defaults */
  }
  return {
    units: o.units === 'mi' ? 'mi' : 'km',
    clock24: o.clock_24 !== false,
    sleepMin: num(o.sleep_min, DEFAULTS.sleepMin),
    warmupMin: num(o.warmup_min, DEFAULTS.warmupMin),
    cooldownMin: num(o.cooldown_min, DEFAULTS.cooldownMin),
    warmupKph: num(o.warmup_kph, DEFAULTS.warmupKph),
  };
}

export const useSettings = create<DisplaySettings>()(() => DEFAULTS);

export function loadSettings(): void {
  useSettings.setState(readSettings(bridge().settingsJson?.()));
}

export const useUnits = (): Units => useSettings((s) => s.units);
