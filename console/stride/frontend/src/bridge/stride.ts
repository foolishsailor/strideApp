import type { Route, StrideBridge, StrideCore, StrideSettings } from './types';

/* Read at call time, never captured at import. The bridge is injected by
   Kotlin (or stubbed by the core in a desktop browser), and tests swap it. */
export const bridge = (): StrideBridge => window.Stride;
export const core = (): StrideCore => window.STRIDE;
export const settings = (): StrideSettings => window.STRIDE_SETTINGS;

/** The routes cached on this console. Kotlin reads them from disk at boot, so
 *  this answers with or without a network — see Routes.kt. */
export function myRoutes(): Route[] {
  try {
    return JSON.parse(bridge().routes() || '[]') as Route[];
  } catch {
    return [];
  }
}
