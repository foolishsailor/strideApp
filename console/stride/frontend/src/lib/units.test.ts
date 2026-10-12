import { describe, expect, it } from 'vitest';
import { readSettings } from '../store/settings';
import { DEFAULT_LIMITS, pausedWhere, segmentSubtitle, speedDelta, speedStops } from './session';
import { climb, far, KM_PER_MI, paceSec, speedText, stride, walked } from './units';

describe('units', () => {
  it('reads km or miles from Settings, km when it says nothing', () => {
    expect(readSettings('{"units":"mi"}').units).toBe('mi');
    expect(readSettings('{}').units).toBe('km');
    expect(readSettings('nonsense').units).toBe('km');
  });

  it('shows speed, distance, climb, stride and pace in miles', () => {
    expect(speedText(8, 'mi')).toBe('5.0');
    expect(speedText(8, 'km')).toBe('8.0');
    expect(walked(1609.344, 'mi')).toEqual({ value: '1.00', unit: 'mi' });
    expect(walked(1234, 'km')).toEqual({ value: '1,234', unit: 'm' });
    expect(far(3218.688, 'mi')).toBe('2.00 mi');
    expect(far(100, 'mi')).toBe('328 ft');
    expect(climb(100, 'mi')).toEqual({ value: '328', unit: 'ft' });
    expect(stride(0.75, 'mi')).toEqual({ value: '2.5', unit: 'ft' });
    // 6 mph is a ten-minute mile.
    expect(paceSec(6 * KM_PER_MI, 'mi')).toBe(600);
    expect(paceSec(6, 'km')).toBe(600);
  });

  it('offers every whole mph the belt can do', () => {
    // 1.6 – 19 km/h is 0.99 – 11.8 mph.
    expect(speedStops(DEFAULT_LIMITS, 'mi')).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11]);
  });

  it('steps a mph target onto the next tenth, whatever km/h it sits at', () => {
    const at = 3.2 * KM_PER_MI + 0.03; // the board's own rounding, off the grid
    expect((at + speedDelta(at, 0.1, 'mi')) / KM_PER_MI).toBeCloseTo(3.3, 6);
    expect((at + speedDelta(at, -0.5, 'mi')) / KM_PER_MI).toBeCloseTo(2.7, 6);
    expect(speedDelta(5, 0.1, 'km')).toBe(0.1);
  });

  it('says how far in miles when paused, and how much route is left', () => {
    expect(pausedWhere({ elapsed: 75, distance: 1609.344 }, 'mi')).toBe('1:15 in · 1.00 mi · the belt has stopped');
    expect(segmentSubtitle({ plan: 'River', segment: 1, segments: 4, segmentLeft: 3218.688, segmentLeftIsDistance: true }, 'mi'))
      .toBe('River · 1 of 4 · 2.00 mi left');
  });
});
