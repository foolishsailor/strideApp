import { beforeEach, describe, expect, it } from 'vitest';
import { installKotlinEntryPoints, installModeWatcher } from '../bridge/kotlin';
import { historySamples } from './history';
import { useSession } from './session';
import { useNav } from './nav';
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

  it('keeps the plan, and whether its steps are metres', () => {
    window.plan({ name: 'Hill', byDistance: true, steps: [{ start: 0, end: 100, incline: 10, label: 'up' }] });
    expect(useSession.getState().planName).toBe('Hill');
    expect(useSession.getState().planSteps).toHaveLength(1);
    expect(useSession.getState().planByDistance).toBe(true);
  });

  it('records the run for the chart, and forgets it at the welcome screen', () => {
    window.render({ mode: 'running', elapsed: 1, speed: 8 });
    window.render({ mode: 'running', elapsed: 1.4, speed: 8.2 });
    window.render({ mode: 'running', elapsed: 2, speed: 8.4 });
    expect(historySamples().map((s) => s.speed)).toEqual([8, 8.4]);
    window.render({ mode: 'welcome' });
    expect(historySamples()).toHaveLength(0);
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

  it('comes back from a run on Run, as the same runner', () => {
    installKotlinEntryPoints();
    const stop = installModeWatcher();
    useWelcome.setState({ runner: 'Sam', step: 3 });
    useNav.setState({ section: 'history' });
    window.render({ mode: 'running' });
    window.render({ mode: 'summary' });
    window.render({ mode: 'welcome' });
    expect(useWelcome.getState()).toMatchObject({ runner: 'Sam', step: 2 });
    expect(useNav.getState().section).toBe('run');
    useWelcome.setState({ runner: '' });
    stop();
  });
});
