import { act, fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { App } from '../App';
import { installKotlinEntryPoints } from '../bridge/kotlin';
import { useUi } from '../store/ui';
import { touchableBoxes } from '../hooks/useTouchRegion';
import { loadSettings, useSettings } from '../store/settings';
import { useWelcome } from '../store/welcome';
import { mockBridge } from '../test/setup';

const ROUTES = JSON.stringify([
  { id: 'r1', name: 'River', distance_m: 5000, climb_m: 18, segments: [[0, 2500, 2], [2500, 5000, -1]] },
]);

beforeEach(() => {
  installKotlinEntryPoints();
  useWelcome.setState({ step: 1, walker: '', planMode: 'shapes', minutes: 30, shape: 'rolling', route: null, loop: false });
  useUi.setState({ fanOpen: false, confirmOpen: false, asleep: false, appsOpen: false });
  act(() => window.overApp(false));
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
    // The lap count, not the 2 km/h stop in the speed rail.
    expect(screen.getByText('laps · 400 m').previousElementSibling?.textContent).toBe('2');
    act(() => window.render({ mode: 'running', segments: 4, segment: 1, segmentLabel: 'Settle in', plan: 'Steady' }));
    expect(screen.getByText('Settle in')).toBeTruthy();
    expect(screen.queryByText('laps · 400 m')).toBeNull();
  });

  it('goes straight to a stop picked from a rail, and steps from + and −', () => {
    const b = mockBridge({ boardLimits: () => JSON.stringify({ minKph: 1.6, maxKph: 16, minGrade: -3, maxGrade: 15 }) });
    render(<App />);
    act(() => window.render({ mode: 'running', speed: 5, targetSpeed: 5, incline: 2, targetIncline: 2 }));
    const stop = (v: number) => document.querySelector(`[data-stop="${v}"]`)!;
    fireEvent.click(stop(12));
    expect(b.setSpeed).toHaveBeenCalledWith(12);
    fireEvent.click(stop(8));
    expect(b.setIncline).toHaveBeenCalledWith(8);
    // Only what this board reaches: up to 15 %, up to 16 km/h.
    expect(stop(15)).toBeTruthy();
    expect(document.querySelector('[data-stop="18"]')).toBeNull();
    expect(document.querySelectorAll('[data-stop="16"]')).toHaveLength(1);
    fireEvent.mouseDown(screen.getAllByText('+')[1]!);
    fireEvent.mouseUp(screen.getAllByText('+')[1]!);
    expect(b.speed).toHaveBeenCalledWith(0.1);
    fireEvent.mouseDown(screen.getAllByText('−')[0]!);
    fireEvent.mouseUp(screen.getAllByText('−')[0]!);
    expect(b.incline).toHaveBeenCalledWith(-0.5);
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

  it('shows the foot pod and the worked-out numbers, and dashes without a pod', () => {
    render(<App />);
    act(() => window.render({ mode: 'running', speed: 6, cadence: 136, power: 212, strideM: 0.73, podKph: 5.9, climbM: 42 }));
    expect(screen.getByText('10:00')).toBeTruthy();     // pace at 6 km/h
    expect(screen.getByText('136')).toBeTruthy();
    expect(screen.getByText('212')).toBeTruthy();
    expect(screen.getByText('0.73')).toBeTruthy();
    expect(screen.getByText('5.9')).toBeTruthy();
    expect(screen.getByText('42')).toBeTruthy();
    act(() => window.render({ mode: 'running', speed: 6 }));
    // Heart rate, cadence, power, stride and pod speed: no reading, not zero.
    expect(screen.getAllByText('—')).toHaveLength(5);
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

describe('belt calibration', () => {
  const CAL = {
    kph: 10.73, belt: 11.33, tableBelt: 11.0, podKph: 10.16, podSecs: 14, ready: true,
    pod: true, miles: true, points: [{ kph: 6, belt: 6.3 }], note: '',
  };

  it('shows the set pace beside the Stryd, and what the belt is sent', () => {
    render(<App />);
    act(() => window.render({ mode: 'running', calib: CAL }));
    expect(screen.getByText('Belt calibration')).toBeTruthy();
    expect(screen.getByText('9:00 /mi')).toBeTruthy();
    expect(screen.getByText('9:30 /mi')).toBeTruthy();
    expect(screen.getByText(/\+5\.6%/)).toBeTruthy();
    expect(screen.getByText(/Saved: 16:06 \/mi \+5\.0%/)).toBeTruthy();
  });

  it('takes the Stryd reading, saves, and finishes', () => {
    const b = mockBridge();
    render(<App />);
    act(() => window.render({ mode: 'running', calib: CAL }));
    press('USE STRYD READING');
    press('SAVE POINT');
    press('FINISH');
    expect(b.calUseStryd).toHaveBeenCalled();
    expect(b.calSave).toHaveBeenCalled();
    expect(b.calDone).toHaveBeenCalled();
  });

  it('steps the pace to the next round number', () => {
    const b = mockBridge();
    render(<App />);
    act(() => window.render({ mode: 'running', calib: CAL }));
    press('FASTER PACE');
    expect(b.setSpeed.mock.calls[0]![0]).toBeCloseTo((3600 * 1.609344) / 535, 3);
  });

  it('stops like the walk screen does', () => {
    const b = mockBridge();
    render(<App />);
    act(() => window.render({ mode: 'running', calib: CAL }));
    // The panel's own, over the walk screen's.
    const stops = screen.getAllByText('STOP');
    fireEvent.click(stops[stops.length - 1]!);
    expect(b.pause).toHaveBeenCalled();
    expect(useUi.getState().confirmOpen).toBe(true);
  });

  it('is not there without a calibration running', () => {
    render(<App />);
    act(() => window.render({ mode: 'running', calib: null }));
    expect(screen.queryByText('Belt calibration')).toBeNull();
  });
});

describe('units', () => {
  it('shows the walk in miles when Settings says so, and still sends km/h', () => {
    const b = mockBridge({ settingsJson: () => JSON.stringify({ units: 'mi' }) });
    loadSettings();
    render(<App />);
    act(() => window.render({ mode: 'running', speed: 8, targetSpeed: 8, distance: 1609.344 }));
    expect(screen.getAllByText('mph').length).toBeGreaterThan(0);
    expect(screen.getByText('1.00')).toBeTruthy();
    expect(screen.getByText('/mi')).toBeTruthy();
    // The 6 mph stop goes to Kotlin as km/h.
    fireEvent.click(document.querySelector('[data-stop="6"]')!);
    expect(b.setSpeed.mock.calls[0]![0]).toBeCloseTo(6 * 1.609344, 6);
    useSettings.setState({ units: 'km' });
  });
});

describe('apps', () => {
  const APPS = JSON.stringify([{ pkg: 'com.netflix.mediaclient', name: 'Netflix', icon: '' }]);

  it('opens Netflix from APPS, and over it drops the hero and the backdrop', () => {
    const b = mockBridge({ apps: () => APPS, openApp: vi.fn(), closeApp: vi.fn() });
    render(<App />);
    act(() => window.render({ mode: 'running', distance: 900 }));
    press('APPS');
    press('Netflix');
    expect(b.openApp).toHaveBeenCalledWith('com.netflix.mediaclient');
    expect(screen.queryByText('Netflix')).toBeNull(); // the picker has closed

    act(() => window.overApp(true));
    expect(document.documentElement.classList.contains('over-app')).toBe(true);
    expect(screen.queryByText('laps · 400 m')).toBeNull();
    expect(screen.getByText('STOP')).toBeTruthy();
    press('BACK');
    expect(b.closeApp).toHaveBeenCalled();

    act(() => window.overApp(false));
    expect(document.documentElement.classList.contains('over-app')).toBe(false);
    expect(screen.getByText('laps · 400 m')).toBeTruthy();
  });

  it('slides the metrics and the controls away from their grips, and back', () => {
    render(<App />);
    act(() => window.render({ mode: 'running' }));
    act(() => window.overApp(true));
    const [dockGrip, stripGrip] = screen.getAllByLabelText('drawer');
    fireEvent.click(stripGrip!);
    expect(useUi.getState().metricsOpen).toBe(false);
    fireEvent.click(dockGrip!);
    expect(useUi.getState().controlsOpen).toBe(false);
    fireEvent.click(dockGrip!);
    fireEvent.click(stripGrip!);
    expect(useUi.getState()).toMatchObject({ metricsOpen: true, controlsOpen: true });
  });

  it('tells Kotlin what takes touches, and everything while a question is up', () => {
    const b = mockBridge({ apps: () => APPS, touchable: vi.fn() });
    render(<App />);
    act(() => window.render({ mode: 'running' }));
    act(() => window.overApp(true));
    expect(b.touchable).toHaveBeenLastCalledWith(expect.stringMatching(/^\[/));
    press('STOP');
    expect(touchableBoxes()).toBe('all');
  });

  it('has no APPS on a console whose app cannot open them', () => {
    render(<App />);
    act(() => window.render({ mode: 'running' }));
    expect(screen.queryByText('APPS')).toBeNull();
  });
});
