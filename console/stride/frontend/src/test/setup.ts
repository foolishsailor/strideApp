import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { cleanup } from '@testing-library/react';
import { afterEach, beforeEach, vi } from 'vitest';
import type { StrideBridge } from '../bridge/types';

/* The real shared core, not a mock of it: the track maths, touch handling and
   formatters under test are the ones the console runs. */
const CORE = resolve(process.cwd(), '../app/src/main/assets/ui/stride-core.js'); // vitest runs from frontend/
(0, eval)(readFileSync(CORE, 'utf8'));

/** A bridge of spies, fresh for every test. */
export function mockBridge(overrides: Partial<Record<keyof StrideBridge | string, unknown>> = {}) {
  const b: Record<string, unknown> = {};
  for (const name of [
    'choose', 'chooseGuided', 'chooseRoute', 'skipWarmup', 'skipCooldown', 'pause', 'resume', 'end',
    'home', 'speed', 'incline', 'setSpeed', 'setIncline', 'setFan', 'setWalker', 'ackDmk', 'dim',
    'calibrate', 'calNudge', 'calUseStryd', 'calSave', 'calDone',
  ]) b[name] = vi.fn();
  b.routes = vi.fn(() => '[]');
  b.settingsJson = vi.fn(() => JSON.stringify({ people: [{ name: 'Sam' }], default_walker: '' }));
  b.wakeState = vi.fn(() => 'awake');
  Object.assign(b, overrides);
  window.Stride = b as unknown as StrideBridge;
  return b as unknown as { [K in keyof StrideBridge]: ReturnType<typeof vi.fn> };
}

beforeEach(() => {
  mockBridge();
  window.STRIDE_SETTINGS = { open: vi.fn(), close: vi.fn() };
});

afterEach(() => cleanup());
