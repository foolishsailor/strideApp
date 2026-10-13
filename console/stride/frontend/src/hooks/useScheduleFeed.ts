import { useEffect } from 'react';
import { useTrailmate } from '../store/trailmate';
import { useUi } from '../store/ui';

/** Re-read every minute: Kotlin refreshes in the background, and a workout
 *  added in TrailMate should show up without anyone touching the screen. */
const EVERY_MS = 60_000;

/** Keeps the schedule fresh while a screen that shows it is up: read now,
 *  every minute, and whenever Settings closes (a person linked, or added). */
export function useScheduleFeed(): void {
  const peopleVersion = useUi((s) => s.peopleVersion);
  useEffect(() => {
    const load = useTrailmate.getState().loadSchedules;
    load();
    const timer = setInterval(load, EVERY_MS);
    return () => clearInterval(timer);
  }, [peopleVersion]);
}
