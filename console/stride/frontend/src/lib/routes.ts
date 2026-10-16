import type { Route } from '../bridge/types';

/* A route's ground, for its card: where it climbs and falls, and the order
   a list of them is shown in. Pure, so it is tested. */

/** One point of the ground: metres along, metres up from the start. */
export interface GroundPoint {
  m: number;
  up: number;
}

/**
 * The route's height along its length, from its segments
 * ([startM, endM, grade %]). There and back, the way out is followed by the
 * same ground in reverse: the descents become the climbs.
 */
export function elevationProfile(segments: readonly [number, number, number][], looped = false): GroundPoint[] {
  if (!segments.length) return [];
  const out: GroundPoint[] = [{ m: segments[0]![0], up: 0 }];
  let up = 0;
  for (const [start, end, grade] of segments) {
    up += (end - start) * grade / 100;
    out.push({ m: end, up });
  }
  if (!looped) return out;
  const far = out[out.length - 1]!.m;
  for (let i = out.length - 2; i >= 0; i--) out.push({ m: 2 * far - out[i]!.m, up: out[i]!.up });
  return out;
}

export type RouteSortKey = 'name' | 'distance';
export interface RouteSort {
  key: RouteSortKey;
  /** Ascending: A to Z, shortest first. */
  asc: boolean;
}

/** The routes in the order asked for. Names compare as people read them
 *  ("Loop 2" before "Loop 10"); ties keep TrailMate's order. */
export function sortRoutes(routes: readonly Route[], sort: RouteSort): Route[] {
  const by = (a: Route, b: Route): number => (sort.key === 'name'
    ? (a.name || '').localeCompare(b.name || '', undefined, { numeric: true, sensitivity: 'base' })
    : (a.distance_m || 0) - (b.distance_m || 0));
  return routes
    .map((r, i) => ({ r, i }))
    .sort((x, y) => (sort.asc ? by(x.r, y.r) : by(y.r, x.r)) || x.i - y.i)
    .map((x) => x.r);
}
