import type { StrideBridge, StrideCore, StrideSettings } from './types';

/* Read at call time, never captured at import. The bridge is injected by
   Kotlin (or stubbed by the core in a desktop browser), and tests swap it.
   What the bridge returns as JSON is parsed by the stores, not here. */
export const bridge = (): StrideBridge => window.Stride;
export const core = (): StrideCore => window.STRIDE;
export const settings = (): StrideSettings => window.STRIDE_SETTINGS;
