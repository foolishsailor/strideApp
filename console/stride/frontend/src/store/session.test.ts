import { beforeEach, describe, expect, it } from 'vitest';
import { installKotlinEntryPoints, installModeWatcher } from '../bridge/kotlin';
import { useSession } from './session';
import { useUi } from './ui';
import { useWelcome } from './welcome';

describe('Kotlin entry points', () => {
  beforeEach(() => {
    installKotlinEntryPoints();
    window.render({ mode: 'welcome' });
  });

  it('stores the snapshot and a normalised mode', () => {
    window.render({ mode: 'RUNNING', speed: 5.4 });
    expect(useSession.getState().mode).toBe('running');
    expect(useSession.getState().snapshot.speed).toBe(5.4);
  });

  it('builds the elevation from the plan', () => {
    window.plan({ name: 'Hill', steps: [{ start: 0, end: 100, incline: 10, label: 'up' }] });
    expect(useSession.getState().planName).toBe('Hill');
    expect(useSession.getState().elevation(100)).toBeCloseTo(15);
  });
});

describe('changing screen', () => {
  it('tidies up what belonged to the run', () => {
    installKotlinEntryPoints();
    const stop = installModeWatcher();
    window.render({ mode: 'running' });
    useUi.setState({ fanOpen: true, confirmOpen: true });
    useWelcome.setState({ step: 3 });

    window.render({ mode: 'summary' });
    expect(useUi.getState()).toMatchObject({ fanOpen: false, confirmOpen: false });
    expect(window.STRIDE_SETTINGS.close).toHaveBeenCalled();

    window.render({ mode: 'welcome' });
    expect(useWelcome.getState().step).toBe(1);
    stop();
  });
});
