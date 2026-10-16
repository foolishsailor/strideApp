import { act, fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { App } from '../App';
import { installKotlinEntryPoints } from '../bridge/kotlin';
import type { WorkoutStep } from '../bridge/types';
import { addDays, localDate } from '../lib/schedule';
import { useUi } from '../store/ui';
import { touchableBoxes } from '../hooks/useTouchRegion';
import { loadSettings, useSettings } from '../store/settings';
import { useTrailmate } from '../store/trailmate';
import { useWelcome } from '../store/welcome';
import { mockBridge } from '../test/setup';

const ROUTES = JSON.stringify([
  { id: 'r1', kind: 'route', name: 'River', distance_m: 5000, climb_m: 18, segments: [[0, 2500, 2], [2500, 5000, -1]] },
]);

const TODAY = localDate(new Date());
const ZONES = {
  pace: [{ zone: 2, minMs: 2.86, maxMs: 3.13 }],
  hr: [{ zone: 1, minBpm: 98, maxBpm: 118 }, { zone: 2, minBpm: 119, maxBpm: 138 }],
  maxHr: 189, restingHr: 48,
};
const INTERVALS = {
  id: 'w1', date: TODAY, name: '4 × 3 min @ threshold', type: 'intervals', sport: 'running', runnable: true,
  estimatedDurationS: 2340, estimatedDistanceM: 6800, completed: false, completedActivity: null,
  steps: [
    { kind: 'warmup', label: 'Warm up', end: { type: 'time', value: 600 }, target: { type: 'none' }, inclinePct: null, note: null, repeat: null },
    { kind: 'interval', label: 'Interval', end: { type: 'time', value: 180 }, target: { type: 'pace', minMs: 3.64, maxMs: 3.77 }, inclinePct: 1, note: null, repeat: { index: 1, of: 4 } },
    { kind: 'cooldown', label: 'Cool down', end: { type: 'open', value: null }, target: { type: 'hr', zone: 2 }, inclinePct: null, note: null, repeat: null },
  ],
};
const STRENGTH = {
  id: 'w2', date: addDays(TODAY, 2), name: 'Core', type: null, sport: 'strength_training', runnable: false, steps: [],
};
const person = (over: object = {}) => ({ state: 'ok', fetchedAt: Date.now(), from: TODAY, scopes: [], zones: ZONES, workouts: [INTERVALS, STRENGTH], ...over });
const schedules = (sam: object) => () => JSON.stringify({ Sam: sam });

beforeEach(() => {
  installKotlinEntryPoints();
  useWelcome.setState({ step: 1, runner: '', planMode: 'manual', manual: 'free', hrZone: null, route: null, loop: false, workout: null });
  useTrailmate.setState({ schedules: {}, routes: [] });
  useUi.setState({ fanOpen: false, confirmOpen: false, asleep: false, appsOpen: false });
  act(() => window.overApp(false));
  act(() => window.render({ mode: 'welcome' }));
});

/** By its words, or by the name of the glyph that stands for them (the dock). */
const press = (text: string | RegExp) =>
  fireEvent.click(screen.queryByText(text) ?? screen.getByLabelText(text));

describe('welcome', () => {
  it('puts the runner in a shell: Run and History on the rail, Settings at the bottom', () => {
    mockBridge();
    render(<App />);
    press('Sam');
    expect(screen.getByText('How do you want to run?')).toBeTruthy();
    press('History');
    expect(screen.getByText('No runs to show yet')).toBeTruthy();
    press('Run');
    expect(screen.getByText('How do you want to run?')).toBeTruthy();
    press('Settings');
    expect(window.STRIDE_SETTINGS.open).toHaveBeenCalledWith('me');
  });

  it('folds the rail to its icons, and remembers it', () => {
    mockBridge();
    render(<App />);
    press('Sam');
    press('Collapse'); // the chevron by STRIDE's name
    expect(screen.queryByText('History')).toBeNull(); // the label goes; the icon stays
    expect(screen.getByLabelText('History')).toBeTruthy();
    expect(screen.queryByText('STRIDE')).toBeNull();
    expect(localStorage.getItem('stride.railCollapsed')).toBe('true');
    press('Expand'); // the mark, folded
    expect(screen.getByText('History')).toBeTruthy();
    press('STRIDE'); // the name folds it too: the whole row is the button
    expect(screen.queryByText('History')).toBeNull();
    press('Expand');
    expect(screen.getByText('History')).toBeTruthy();
  });

  it('goes back to the people from Home, at the top of the rail', () => {
    mockBridge();
    render(<App />);
    press('Sam');
    press('Home');
    expect(screen.getByText("Who's running?")).toBeTruthy();
  });

  it('asks Manual, Routes or Workouts, and Free starts a free run', () => {
    const b = mockBridge();
    render(<App />);
    press('Sam');
    expect(b.setRunner).toHaveBeenCalledWith('Sam');
    expect(screen.getByText('Manual')).toBeTruthy();
    expect(screen.getByText('Routes')).toBeTruthy();
    expect(screen.getByText('Workouts')).toBeTruthy();
    press('Manual');
    expect(b.choose).not.toHaveBeenCalled(); // the way to run is not the run
    expect(screen.queryByText('BEGIN →')).toBeNull();
    press('Free');
    expect(b.choose).toHaveBeenCalled();
  });

  it('goes back from the app bar', () => {
    mockBridge();
    render(<App />);
    press('Sam');
    press('Manual');
    fireEvent.click(screen.getByLabelText('Back'));
    expect(screen.getByText('How do you want to run?')).toBeTruthy();
  });

  it('holds a heart-rate zone from the runner’s own zones', () => {
    const b = mockBridge({ schedules: schedules(person()) });
    render(<App />);
    press('Sam');
    press('Manual');
    press('Heart rate');
    expect(screen.getByText('119–138 bpm')).toBeTruthy();
    expect(b.chooseHeartRate).not.toHaveBeenCalled(); // no zone picked yet
    press('Zone 2');
    expect(b.chooseHeartRate).toHaveBeenCalledWith(2, 119, 138);
  });

  it('says heart rate needs zones when TrailMate sent none', () => {
    mockBridge();
    render(<App />);
    press('Sam');
    press('Manual');
    expect(screen.getByText('no heart-rate zones yet')).toBeTruthy();
    press('Heart rate');
    expect(useWelcome.getState().manual).toBe('free');
  });

  it('lists the runner’s routes and loops one there and back', () => {
    const b = mockBridge({ routes: () => ROUTES });
    render(<App />);
    press('Sam');
    press('Routes');
    expect(screen.getByText(/5\.00 km · 18 m up/)).toBeTruthy();
    fireEvent.click(document.querySelector('.loop')!);
    // Out and back: the 2 % climb and the 1 % descent are both climbed once.
    expect(screen.getByText(/10\.00 km · 75 m up/)).toBeTruthy();
    expect(b.chooseRoute).not.toHaveBeenCalled(); // the loop half only sets there-and-back
    press(/10\.00 km · 75 m up/);
    expect(b.chooseRoute).toHaveBeenCalledWith('r1', true);
  });

  it('sorts the routes by name or distance, either way', () => {
    const many = JSON.stringify([
      { id: 'long', kind: 'route', name: 'Bay loop', distance_m: 9000, climb_m: 40, segments: [[0, 9000, 1]] },
      { id: 'short', kind: 'route', name: 'Canal', distance_m: 3000, climb_m: 10, segments: [[0, 3000, 1]] },
    ]);
    mockBridge({ routes: () => many });
    render(<App />);
    press('Sam');
    press('Routes');
    const order = () => screen.getAllByText(/^(Bay loop|Canal)$/).map((e) => e.textContent);
    expect(order()).toEqual(['Bay loop', 'Canal']); // name, A to Z
    press('Distance');
    expect(order()).toEqual(['Canal', 'Bay loop']); // shortest first
    press('Distance');
    expect(order()).toEqual(['Bay loop', 'Canal']); // and turned round
  });

  it('asks TrailMate for the routes on every visit, and shows them when it answers', () => {
    let stored = '[]';
    const b = mockBridge({ routes: () => stored, refreshTrailMate: vi.fn() });
    render(<App />);
    press('Sam');
    press('Routes');
    expect(b.refreshTrailMate).toHaveBeenCalledWith('routes');
    expect(screen.getByText('Checking TrailMate…')).toBeTruthy();
    expect(screen.getByText('Looking for your routes')).toBeTruthy();
    stored = JSON.stringify([{ id: 'new', kind: 'route', name: 'Starred a minute ago', distance_m: 4000, climb_m: 20, segments: [[0, 4000, 0.5]] }]);
    act(() => window.trailmateRead('routes', true));
    expect(screen.getByText('Starred a minute ago')).toBeTruthy();
    expect(screen.queryByText('Checking TrailMate…')).toBeNull();
    fireEvent.click(screen.getByLabelText('Back'));
    press('Routes');
    const routeAsks = () => b.refreshTrailMate!.mock.calls.filter(([k]) => k === 'routes').length;
    expect(routeAsks()).toBe(2); // and again next time
  });

  it('says when TrailMate could not be reached, keeps the last copy, and tries again', () => {
    const b = mockBridge({ routes: () => ROUTES, refreshTrailMate: vi.fn() });
    render(<App />);
    press('Sam');
    press('Routes');
    act(() => window.trailmateRead('routes', false));
    expect(screen.getByText(/Offline: showing the treadmill’s last copy/)).toBeTruthy();
    expect(screen.getByText(/5\.00 km · 18 m up/)).toBeTruthy();
    press('RETRY');
    expect(b.refreshTrailMate!.mock.calls.filter(([k]) => k === 'routes').length).toBe(2);
  });

  it('asks TrailMate for the schedule when Workouts opens', () => {
    const b = mockBridge({ schedules: schedules(person()), refreshTrailMate: vi.fn() });
    render(<App />);
    press('Sam');
    press('Workouts');
    expect(b.refreshTrailMate).toHaveBeenCalledWith('schedule');
  });

  it('shows a race course with its date', () => {
    mockBridge({ routes: () => JSON.stringify([{ id: 'x', kind: 'race', name: 'Hill race course', date: '2026-11-08', distance_m: 3000, climb_m: 60, segments: [[0, 3000, 2]] }]) });
    render(<App />);
    press('Sam');
    press('Routes');
    expect(screen.getByText(/race · Sunday 8 November/)).toBeTruthy();
  });

  it('says how to get routes when there are none', () => {
    render(<App />);
    press('Sam');
    press('Routes');
    expect(screen.getByText('Star routes in TrailMate to run them here.')).toBeTruthy();
  });

  it('lists the week’s workouts, previews the first, and START runs it', () => {
    const b = mockBridge({ schedules: schedules(person()) });
    render(<App />);
    press('Sam');
    press('Workouts');
    expect(screen.getByText('Today')).toBeTruthy();
    expect(screen.getAllByText('Rest day').length).toBe(5); // seven days, two with something
    expect(screen.getByText('Not for the treadmill')).toBeTruthy();
    // Nothing tapped: the first runnable workout is already in the preview.
    expect(useWelcome.getState().workout).toBe('w1');
    expect(screen.getByText('1 of 4')).toBeTruthy();
    expect(screen.getByText('4:25–4:35 /km')).toBeTruthy();
    expect(screen.getByText('1% incline')).toBeTruthy();
    expect(screen.getByText('until NEXT')).toBeTruthy();
    expect(screen.getByText('Zone 2')).toBeTruthy(); // a zone TrailMate could not resolve
    expect(b.chooseWorkout).not.toHaveBeenCalled(); // previewing is not running
    press('START');
    expect(b.chooseWorkout).toHaveBeenCalledWith('w1');
  });

  it('asks to reconnect when the link may not read the plan, once the runner has picked themselves', () => {
    mockBridge({ schedules: schedules(person({ state: 'scope' })) });
    render(<App />);
    expect(screen.queryByText('Reconnect TrailMate to see your workouts')).toBeNull();
    press('Sam');
    expect(screen.getByText('Reconnect TrailMate to see your workouts')).toBeTruthy();
  });
});

describe('home', () => {
  it('shows only the people until somebody picks themselves', () => {
    mockBridge({ schedules: schedules(person()) });
    render(<App />);
    expect(screen.getByText('Sam')).toBeTruthy();
    expect(screen.queryByText('Today')).toBeNull();
    expect(screen.queryByText('4 × 3 min @ threshold')).toBeNull();
  });

  it('shows the runner’s today and tomorrow beside the ways to run, and opens a workout from there', () => {
    const b = mockBridge({ schedules: schedules(person()) });
    render(<App />);
    press('Sam');
    expect(screen.getByText('Manual')).toBeTruthy();
    expect(screen.getByText('Today')).toBeTruthy();
    expect(screen.getByText('Tomorrow')).toBeTruthy();
    expect(screen.getByText('Intervals')).toBeTruthy();
    expect(screen.getByText('39 min · 6.80 km')).toBeTruthy();
    expect(screen.getByText('Rest day')).toBeTruthy();
    // The bigger card carries the steps, a repeat folded into one line.
    expect(screen.getByText(/^4 × Interval 3 min/)).toBeTruthy();
    press('4 × 3 min @ threshold');
    expect(b.setRunner).toHaveBeenCalledWith('Sam');
    expect(useWelcome.getState()).toMatchObject({ step: 3, planMode: 'workouts', workout: 'w1', runner: 'Sam' });
    expect(screen.getByText('Warm up')).toBeTruthy(); // its preview
  });

  it('marks a workout done with what was run, in miles when Settings says so', () => {
    useSettings.setState({ units: 'mi' });
    mockBridge({
      schedules: schedules(person({ workouts: [{ ...INTERVALS, completed: true, completedActivity: { distanceM: 3218.688 } }] })),
      settingsJson: () => JSON.stringify({ people: [{ name: 'Sam' }], units: 'mi' }),
    });
    render(<App />);
    press('Sam');
    expect(screen.getByText('Done · 2.00 mi')).toBeTruthy();
    useSettings.setState({ units: 'km' });
  });

  it('shows nothing for a runner who is not linked', () => {
    mockBridge({ schedules: schedules(person({ state: 'unlinked' })) });
    render(<App />);
    press('Sam');
    expect(screen.queryByText('Today')).toBeNull();
    expect(screen.queryByText(/Reconnect/)).toBeNull();
  });
});

const STEP: WorkoutStep = {
  plannedId: 'w1', name: '4 × 3 min', step: 3, steps: 10, label: 'Interval', kind: 'interval', note: 'Strong but controlled',
  repeat: { index: 2, of: 4 }, target: { type: 'pace', minKph: 13.1, maxKph: 13.57, zone: null }, incline: 1,
  left: 102, leftIsDistance: false, open: false, nextLabel: 'Recovery', nextTarget: { type: 'none' },
  speedAuto: true, inclineAuto: true, hrState: null, hrZoneNow: null,
};

describe('a workout under way', () => {
  it('shows the step, its target, what is left and what is next', () => {
    render(<App />);
    act(() => window.render({ mode: 'running', workoutStep: STEP }));
    expect(screen.getByText('Step 3 of 10 · 2 of 4')).toBeTruthy();
    expect(screen.getByText('Interval')).toBeTruthy();
    expect(screen.getByText('4:25–4:35 /km · 1% incline')).toBeTruthy();
    expect(screen.getByText('1:42')).toBeTruthy();
    expect(screen.getByText('Recovery')).toBeTruthy();
    expect(screen.getByText('Strong but controlled')).toBeTruthy();
  });

  it('says when the runner has the speed, rather than the step', () => {
    render(<App />);
    act(() => window.render({ mode: 'running', workoutStep: { ...STEP, speedAuto: false } }));
    expect(screen.getByText('speed yours until the next step')).toBeTruthy();
  });

  it('ends an open step with NEXT', () => {
    const b = mockBridge();
    render(<App />);
    act(() => window.render({ mode: 'running', workoutStep: { ...STEP, open: true, left: null } }));
    expect(screen.getByText('ends on NEXT')).toBeTruthy();
    press('NEXT');
    expect(b.nextStep).toHaveBeenCalled();
  });

  it('ends a timed step early with NEXT, and the workout with FINISH', () => {
    const b = mockBridge();
    render(<App />);
    act(() => window.render({ mode: 'running', workoutStep: STEP }));
    press('NEXT');
    expect(b.nextStep).toHaveBeenCalledTimes(1);
    act(() => window.render({ mode: 'running', workoutStep: { ...STEP, step: 10, nextLabel: '', nextTarget: null } }));
    expect(screen.getByText('Last step')).toBeTruthy();
    press('FINISH');
    expect(b.nextStep).toHaveBeenCalledTimes(2);
  });

  it('has no steps to move through on a manual heart-rate run', () => {
    render(<App />);
    act(() => window.render({ mode: 'running', workoutStep: { ...STEP, plannedId: '', steps: 1, step: 1, open: true, left: null, nextLabel: '', nextTarget: null } }));
    expect(screen.getByText('Heart rate run')).toBeTruthy();
    expect(screen.queryByLabelText('NEXT')).toBeNull();
    expect(screen.queryByLabelText('FINISH')).toBeNull();
    expect(screen.queryByText('Last step')).toBeNull();
  });

  it('puts the zone and heart-rate control beside the heart rate', () => {
    render(<App />);
    act(() => window.render({
      mode: 'running', pulse: 131,
      workoutStep: { ...STEP, target: { type: 'hr', minBpm: 139, maxBpm: 155, zone: 3 }, hrState: 'holding', hrZoneNow: 2 },
    }));
    expect(screen.getByText('131')).toBeTruthy();
    expect(screen.getByText('Zone 2')).toBeTruthy();
    expect(screen.getByText('Heading for zone 3')).toBeTruthy();
    act(() => window.render({ mode: 'running', workoutStep: { ...STEP, target: { type: 'hr', minBpm: 139, maxBpm: 155, zone: 3 }, hrState: 'no_hr' } }));
    expect(screen.getByText('No heart rate')).toBeTruthy();
  });

  it('rides in the bottom drawer over another app', () => {
    render(<App />);
    act(() => window.render({ mode: 'running', workoutStep: STEP }));
    act(() => window.overApp(true));
    expect(screen.getByText('Interval').closest('[data-drawer]')).toBe(screen.getByLabelText('STOP').closest('[data-drawer]'));
  });

  it('says where the workout was when paused', () => {
    render(<App />);
    act(() => window.render({ mode: 'paused', elapsed: 60, workoutStep: STEP }));
    act(() => useUi.getState().setConfirmOpen(true));
    expect(screen.getByText('1:00 in · Interval · step 3 of 10 · the belt has stopped')).toBeTruthy();
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

  it('shows whose the speed is, and hands it back from the speed menu', () => {
    const b = mockBridge();
    render(<App />);
    act(() => window.render({ mode: 'running', workoutStep: { ...STEP, speedAuto: false } }));
    expect(screen.getByLabelText('Speed: manual')).toBeTruthy();
    press('Speed: manual');
    press('AUTO');
    expect(b.setSpeedAuto).toHaveBeenCalledWith(true);
    act(() => window.render({ mode: 'running', workoutStep: STEP }));
    expect(screen.getByLabelText('Speed: auto')).toBeTruthy();
  });

  it('matches the belt to the pod from the speed menu, on any run', () => {
    const b = mockBridge();
    render(<App />);
    act(() => window.render({ mode: 'running', speed: 10, podSyncKph: 10.4 }));
    expect(screen.queryByLabelText(/Speed: /)).toBeNull(); // no step sets the speed
    press('Speed');
    expect(screen.queryByText('AUTO')).toBeNull();
    press('SYNC TO POD');
    expect(b.syncToPod).toHaveBeenCalled();
    expect(screen.getByText('Belt matched to the pod.')).toBeTruthy();
  });

  it("shows the chart on every run, and names a route's stretch above it", () => {
    render(<App />);
    act(() => window.render({ mode: 'running', distance: 900 }));
    expect(screen.getByLabelText('Heart rate, speed and incline')).toBeTruthy();
    expect(screen.queryByText('laps · 400 m')).toBeNull();
    act(() => window.render({ mode: 'running', segments: 4, segment: 1, segmentLabel: 'Settle in', plan: 'Steady' }));
    expect(screen.getByText('Settle in')).toBeTruthy();
    expect(screen.getByLabelText('Heart rate, speed and incline')).toBeTruthy();
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
  it('congratulates the runner by name', () => {
    useWelcome.setState({ runner: 'Sam' });
    render(<App />);
    act(() => window.render({ mode: 'summary', workout: 'run', avgSpeed: 5.24 }));
    expect(screen.getByText('Nice work, Sam')).toBeTruthy();
    expect(screen.getByText('run complete')).toBeTruthy();
    expect(screen.getByText('5.2')).toBeTruthy();
  });
});

describe('belt calibration', () => {
  const CAL = {
    kph: 10.73, belt: 11.33, tableBelt: 11.0, podKph: 10.16, podSecs: 14, ready: true,
    pod: true, miles: true, points: [{ kph: 6, belt: 6.3 }], note: '',
  };

  /* Miles, from Settings → Display, the way the run screen gets it. */
  beforeEach(() => useSettings.setState({ units: 'mi' }));

  it('shows the set pace beside the Stryd, and what the belt is sent', () => {
    render(<App />);
    act(() => window.render({ mode: 'running', calib: CAL }));
    expect(screen.getByText('Belt calibration')).toBeTruthy();
    expect(screen.getByText('9:00 /mi')).toBeTruthy();
    expect(screen.getByText('9:30 /mi')).toBeTruthy();
    expect(screen.getByText('6.67 mph')).toBeTruthy();
    expect(screen.getByText('7.04')).toBeTruthy();   // belt sent, mph
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
    const faster = screen.getByText('FASTER PACE');
    fireEvent.mouseDown(faster);
    fireEvent.mouseUp(faster);
    expect(b.setSpeed.mock.calls[0]![0]).toBeCloseTo((3600 * 1.609344) / 535, 3);
    // A second press before the dial has moved steps on from the first.
    fireEvent.mouseDown(faster);
    fireEvent.mouseUp(faster);
    expect(b.setSpeed.mock.calls[1]![0]).toBeCloseTo((3600 * 1.609344) / 530, 3);
  });

  it('stops like the run screen does', () => {
    const b = mockBridge();
    render(<App />);
    act(() => window.render({ mode: 'running', calib: CAL }));
    // The panel's own, in words; the run screen's is the dock's glyph.
    expect(screen.getByLabelText('STOP')).toBeTruthy();
    fireEvent.click(screen.getByText('STOP'));
    expect(b.pause).toHaveBeenCalled();
    expect(useUi.getState().confirmOpen).toBe(true);
  });

  it('follows kilometres when Settings says so', () => {
    useSettings.setState({ units: 'km' });
    render(<App />);
    act(() => window.render({ mode: 'running', calib: CAL }));
    expect(screen.getByText('5:36 /km')).toBeTruthy();
    expect(screen.getByText('10.73 km/h')).toBeTruthy();
  });

  it('is not there without a calibration running', () => {
    render(<App />);
    act(() => window.render({ mode: 'running', calib: null }));
    expect(screen.queryByText('Belt calibration')).toBeNull();
  });
});

describe('units', () => {
  it('shows the run in miles when Settings says so, and still sends km/h', () => {
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
    expect(screen.queryByLabelText('Heart rate, speed and incline')).toBeNull();
    expect(screen.getByLabelText('STOP')).toBeTruthy();
    press('BACK');
    expect(b.closeApp).toHaveBeenCalled();

    act(() => window.overApp(false));
    expect(document.documentElement.classList.contains('over-app')).toBe(false);
    expect(screen.getByLabelText('Heart rate, speed and incline')).toBeTruthy();
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

  it('makes the metrics one small line over an app, and back', () => {
    useUi.setState({ metricsCompact: false });
    render(<App />);
    act(() => window.render({ mode: 'running', elapsed: 65, podKph: 9.6 }));
    act(() => window.overApp(true));
    expect(screen.queryByText('Pod')).toBeNull();
    fireEvent.click(screen.getByText('SMALL'));
    expect(useUi.getState().metricsCompact).toBe(true);
    expect(screen.getByText('Pod')).toBeTruthy();        // the one-line strip
    expect(screen.queryByText('Heart rate')).toBeNull(); // not the full one
    fireEvent.click(screen.getByText('LARGE'));
    expect(useUi.getState().metricsCompact).toBe(false);
    expect(screen.getByText('Heart rate')).toBeTruthy();
    // Metrics hidden: only the grip is left, not the size toggle.
    act(() => useUi.getState().setMetricsOpen(false));
    expect(screen.queryByText('SMALL')).toBeNull();
  });

  it('has no APPS on a console whose app cannot open them', () => {
    render(<App />);
    act(() => window.render({ mode: 'running' }));
    expect(screen.queryByLabelText('APPS')).toBeNull();
  });
});
