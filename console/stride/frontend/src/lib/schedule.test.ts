import { describe, expect, it } from 'vitest';
import { hrStateText, handNote, stepPosition } from './session';
import {
  addDays, dayCaption, dayLabel, parseRoutes, parseSchedules, parseTarget, scheduleDays, scheduleView, staleness, typeLabel, typeTone,
} from './schedule';
import { durationText } from './format';
import { doneText, paceRange, plannedText, stepEndText, targetText } from './units';

describe('reading schedules()', () => {
  const json = JSON.stringify({
    Sam: {
      state: 'ok', fetchedAt: 5, from: '2026-10-13',
      zones: { pace: [{ zone: 2, minMs: 2.5, maxMs: 3 }], hr: [{ zone: 5, minBpm: 172, maxBpm: null }], maxHr: 189, restingHr: 48 },
      workouts: [{ id: 'a', date: '2026-10-13', name: 'Easy', type: 'easy', sport: 'running', runnable: true,
        steps: [{ kind: 'interval', label: 'Easy', end: { type: 'distance', value: 5000 }, target: { type: 'pace', minMs: 2.5, maxMs: 3, zone: 2 }, inclinePct: null, note: null, repeat: null }] }],
    },
    Alex: { state: 'nonsense' },
  });

  it('turns TrailMate’s m/s into the km/h the run screen uses', () => {
    const sam = parseSchedules(json).Sam!;
    expect(sam.zones.pace[0]).toEqual({ zone: 2, minKph: 9, maxKph: 10.8 });
    expect(sam.workouts[0]!.steps[0]).toMatchObject({
      end: { type: 'distance', metres: 5000 },
      target: { type: 'pace', minKph: 9, maxKph: 10.8, zone: 2 },
      incline: null, note: '',
    });
  });

  it('ends an open top heart-rate zone at the runner’s maximum', () => {
    expect(parseSchedules(json).Sam!.zones.hr).toEqual([{ zone: 5, minBpm: 172, maxBpm: 189 }]);
  });

  it('copes with anything it does not understand', () => {
    expect(parseSchedules(json).Alex).toEqual({ state: 'never', fetchedAt: 0, zones: { pace: [], hr: [], maxHr: null, restingHr: null }, workouts: [] });
    expect(parseSchedules('not json')).toEqual({});
    expect(parseSchedules(undefined)).toEqual({});
    expect(parseRoutes('{}')).toEqual([]);
  });

  it('keeps a zone the profile could not resolve as a zone, to show and not drive', () => {
    expect(parseTarget({ type: 'hr', zone: 3 })).toEqual({ type: 'zone', of: 'hr', zone: 3 });
    expect(parseTarget({ type: 'pace' })).toEqual({ type: 'none' });
    expect(parseTarget({ type: 'cadence', minSpm: 170, maxSpm: 180 })).toEqual({ type: 'cadence', minSpm: 170, maxSpm: 180 });
  });

  it('says what a person’s card shows', () => {
    const p = parseSchedules(json).Sam!;
    expect(scheduleView(p)).toBe('schedule');
    expect(scheduleView({ ...p, state: 'error' })).toBe('schedule'); // last fetched, still worth showing
    expect(scheduleView({ ...p, state: 'scope' })).toBe('reconnect');
    expect(scheduleView({ ...p, state: 'reconnect' })).toBe('reconnect');
    expect(scheduleView({ ...p, state: 'unlinked' })).toBe('none');
    expect(scheduleView(undefined)).toBe('none');
  });
});

describe('days', () => {
  it('counts calendar days, across a month end', () => {
    expect(addDays('2026-10-31', 1)).toBe('2026-11-01');
    expect(dayLabel('2026-10-13', '2026-10-13')).toBe('Today');
    expect(dayLabel('2026-10-14', '2026-10-13')).toBe('Tomorrow');
    expect(dayLabel('2026-10-15', '2026-10-13')).toBe('Thursday');
    expect(dayCaption('2026-10-13', '2026-10-13')).toBe('Tuesday 13 October');
    expect(dayCaption('2026-10-15', '2026-10-13')).toBe('15 October');
  });

  it('fills the days with nothing as rest days', () => {
    const w = parseSchedules(JSON.stringify({ S: { workouts: [{ id: 'a', date: '2026-10-14' }] } })).S!.workouts;
    expect(scheduleDays(w, '2026-10-13', 3).map((d) => d.workouts.length)).toEqual([0, 1, 0]);
  });

  it('says how old a schedule is only past a day', () => {
    const day = 24 * 3600 * 1000;
    expect(staleness(1000, 1000 + day / 2)).toBe('');
    expect(staleness(1000, 1000 + day)).toBe('Last updated a day ago');
    expect(staleness(1000, 1000 + 3 * day)).toBe('Last updated 3 days ago');
    expect(staleness(0, day * 9)).toBe('');
  });
});

describe('workout types', () => {
  it('names types as TrailMate does, and sports when it is not a run', () => {
    expect(typeLabel({ type: 'long_run', sport: 'running', runnable: true })).toBe('Long run');
    expect(typeLabel({ type: '', sport: 'strength_training', runnable: false })).toBe('Strength training');
    expect(typeLabel({ type: '', sport: 'running', runnable: true })).toBe('Run');
  });

  it('colours the eight with colours, and leaves races to the accent', () => {
    expect(typeTone('long_run')).toBe('longRun');
    expect(typeTone('race')).toBeNull();
    expect(typeTone('park_run')).toBeNull();
  });
});

describe('workout text', () => {
  it('shows a pace band fastest first, in km or miles', () => {
    expect(paceRange(12, 13.33, 'km')).toBe('4:30–5:00 /km');
    expect(paceRange(9.656, 9.656, 'mi')).toBe('10:00 /mi');
  });

  it('shows every kind of target', () => {
    expect(targetText({ type: 'hr', minBpm: 119, maxBpm: 138, zone: 2 }, 'km')).toBe('119–138 bpm');
    expect(targetText({ type: 'cadence', minSpm: 170, maxSpm: 180 }, 'km')).toBe('170–180 spm');
    expect(targetText({ type: 'zone', of: 'pace', zone: 4 }, 'km')).toBe('Zone 4');
    expect(targetText({ type: 'none' }, 'km')).toBe('');
  });

  it('says how a step ends and how long a workout is', () => {
    expect(stepEndText({ type: 'time', seconds: 180 }, 'km')).toBe('3 min');
    expect(stepEndText({ type: 'time', seconds: 90 }, 'km')).toBe('1:30');
    expect(stepEndText({ type: 'distance', metres: 800 }, 'km')).toBe('800 m');
    expect(stepEndText({ type: 'open' }, 'km')).toBe('until NEXT');
    expect(durationText(4500)).toBe('1 h 15 min');
    expect(plannedText({ durationS: 2340, distanceM: null }, 'km')).toBe('39 min');
    expect(plannedText({ durationS: null, distanceM: 8046.72 }, 'mi')).toBe('5.00 mi');
    expect(doneText({ distanceM: null, durationS: 100 }, 'km')).toBe('Done');
  });

  it('puts heart-rate control into a few words', () => {
    expect(hrStateText('holding', { type: 'hr', minBpm: 1, maxBpm: 2, zone: 2 })).toBe('Holding zone 2');
    expect(hrStateText('holding', { type: 'hr', minBpm: 1, maxBpm: 2, zone: null })).toBe('Holding');
    expect(hrStateText('holding', { type: 'hr', minBpm: 1, maxBpm: 2, zone: 2 }, 1)).toBe('Heading for zone 2');
    expect(hrStateText('holding', { type: 'hr', minBpm: 1, maxBpm: 2, zone: 2 }, 2)).toBe('Holding zone 2');
    expect(hrStateText('easing')).toBe('Easing off');
    expect(hrStateText('no_hr')).toBe('No heart rate');
    expect(hrStateText(null)).toBe('');
  });

  it('says where a step is and who has the controls', () => {
    expect(stepPosition({ step: 2, steps: 9, repeat: null })).toBe('Step 2 of 9');
    expect(handNote({ speedAuto: false, inclineAuto: false, incline: 4 })).toBe('speed and incline yours until the next step');
    // A step that sets no incline never had it to give up.
    expect(handNote({ speedAuto: true, inclineAuto: false, incline: null })).toBe('');
  });
});
