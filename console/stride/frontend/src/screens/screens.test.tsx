import { act, fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it } from 'vitest';
import { App } from '../App';
import { installKotlinEntryPoints } from '../bridge/kotlin';
import { useUi } from '../store/ui';
import { useWelcome } from '../store/welcome';
import { mockBridge } from '../test/setup';

const ROUTES = JSON.stringify([
  { id: 'r1', name: 'River', distance_m: 5000, climb_m: 18, segments: [[0, 2500, 2], [2500, 5000, -1]] },
]);

beforeEach(() => {
  installKotlinEntryPoints();
  useWelcome.setState({ step: 1, walker: '', planMode: 'shapes', minutes: 30, shape: 'rolling', route: null, loop: false });
  useUi.setState({ fanOpen: false, confirmOpen: false, asleep: false });
  act(() => window.render({ mode: 'welcome' }));
});

const press = (text: string | RegExp) => fireEvent.click(screen.getByText(text));

describe('welcome', () => {
  it('walks who → how → which and begins the chosen guided walk', () => {
    const b = mockBridge();
    render(<App />);
    press('Sam');
    expect(b.setWalker).toHaveBeenCalledWith('Sam');
    press('Guided');
    press('45 min');
    press('Pyramid');
    expect(b.chooseGuided).not.toHaveBeenCalled(); // choosing never starts the belt
    press('BEGIN →');
    expect(b.chooseGuided).toHaveBeenCalledWith('pyramid', 45);
  });

  it('offers routes only when there are some, and loops one there and back', () => {
    const b = mockBridge({ routes: () => ROUTES });
    render(<App />);
    press('Sam');
    press('My routes');
    expect(screen.getByText(/5\.00 km · 18 m up/)).toBeTruthy();
    fireEvent.click(document.querySelector('.loop')!);
    // Out and back: the 2 % climb and the 1 % descent are both climbed once.
    expect(screen.getByText(/10\.00 km · 75 m up/)).toBeTruthy();
    press('BEGIN →');
    expect(b.chooseRoute).toHaveBeenCalledWith('r1', true);
  });

  it('hides My routes when the console has none', () => {
    render(<App />);
    press('Sam');
    expect(screen.queryByText('My routes')).toBeNull();
  });
});

describe('workout', () => {
  it('pauses on STOP before asking, then ends', () => {
    const b = mockBridge();
    render(<App />);
    act(() => window.render({ mode: 'running', speed: 5 }));
    press('STOP');
    expect(b.pause).toHaveBeenCalled();
    act(() => window.render({ mode: 'paused', elapsed: 60, distance: 80 }));
    expect(screen.getByText('1:00 in · 80 m · the belt has stopped')).toBeTruthy();
    press('END WORKOUT');
    expect(b.end).toHaveBeenCalled();
  });

  it('shows the lap track on a casual walk and the path on a guided one', () => {
    render(<App />);
    act(() => window.render({ mode: 'running', distance: 900 }));
    expect(screen.getByText('laps · 400 m')).toBeTruthy();
    expect(screen.getByText('2')).toBeTruthy();
    act(() => window.render({ mode: 'running', segments: 4, segment: 1, segmentLabel: 'Settle in', plan: 'Steady' }));
    expect(screen.getByText('Settle in')).toBeTruthy();
    expect(screen.queryByText('laps · 400 m')).toBeNull();
  });

  it('gives warm-up the centre panel and SKIP', () => {
    const b = mockBridge();
    render(<App />);
    act(() => window.render({ mode: 'warmup', phaseLeft: 90 }));
    expect(screen.getByText('Warm up')).toBeTruthy();
    expect(screen.getByText('1:30')).toBeTruthy();
    press('SKIP');
    expect(b.skipWarmup).toHaveBeenCalled();
  });

  it('sets the fan from its menu', () => {
    const b = mockBridge();
    render(<App />);
    act(() => window.render({ mode: 'running', fan: 0 }));
    press('FAN');
    press('HIGH');
    expect(b.setFan).toHaveBeenCalledWith(3);
    expect(screen.queryByText('HIGH')).toBeNull();
  });

  it('raises the safety-key overlay over everything', () => {
    const b = mockBridge();
    render(<App />);
    act(() => window.render({ mode: 'running', dmk: true }));
    press('KEY IS BACK IN');
    expect(b.ackDmk).toHaveBeenCalled();
  });
});

describe('summary', () => {
  it('congratulates the walker by name', () => {
    useWelcome.setState({ walker: 'Sam' });
    render(<App />);
    act(() => window.render({ mode: 'summary', workout: 'walk', avgSpeed: 5.24 }));
    expect(screen.getByText('Nice work, Sam')).toBeTruthy();
    expect(screen.getByText('walk complete')).toBeTruthy();
    expect(screen.getByText('5.2')).toBeTruthy();
  });
});
