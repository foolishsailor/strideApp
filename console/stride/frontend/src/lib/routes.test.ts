import { describe, expect, it } from 'vitest';
import type { Route } from '../bridge/types';
import { elevationProfile, sortRoutes } from './routes';

describe('elevationProfile', () => {
  const segs: [number, number, number][] = [[0, 1000, 2], [1000, 1500, -4]];

  it('climbs and falls with the grades', () => {
    expect(elevationProfile(segs)).toEqual([
      { m: 0, up: 0 }, { m: 1000, up: 20 }, { m: 1500, up: 0 },
    ]);
  });

  it('there and back, comes home over the same ground', () => {
    expect(elevationProfile(segs, true).map((p) => [p.m, p.up])).toEqual([
      [0, 0], [1000, 20], [1500, 0], [2000, 20], [3000, 0],
    ]);
  });

  it('has nothing to draw without segments', () => {
    expect(elevationProfile([])).toEqual([]);
  });
});

describe('sortRoutes', () => {
  const routes: Route[] = [
    { id: 'a', name: 'Loop 10', distance_m: 3000 },
    { id: 'b', name: 'loop 2', distance_m: 9000 },
    { id: 'c', name: 'Avenue', distance_m: 5000 },
  ];
  const ids = (rs: Route[]) => rs.map((r) => r.id);

  it('by name, as people read them, either way', () => {
    expect(ids(sortRoutes(routes, { key: 'name', asc: true }))).toEqual(['c', 'b', 'a']);
    expect(ids(sortRoutes(routes, { key: 'name', asc: false }))).toEqual(['a', 'b', 'c']);
  });

  it('by distance, either way', () => {
    expect(ids(sortRoutes(routes, { key: 'distance', asc: true }))).toEqual(['a', 'c', 'b']);
    expect(ids(sortRoutes(routes, { key: 'distance', asc: false }))).toEqual(['b', 'c', 'a']);
  });
});
