import { useEffect } from 'react';
import type { TrailMateKind } from '../bridge/types';
import { useTrailmate } from '../store/trailmate';

/** Ask TrailMate for [kind] afresh each time the calling page opens. */
export function useFreshFromTrailMate(kind: TrailMateKind): void {
  useEffect(() => useTrailmate.getState().refresh(kind), [kind]);
}
