import { useIdleSleep } from './hooks/useIdleSleep';
import { useTouchRegion } from './hooks/useTouchRegion';
import { screenFor } from './lib/session';
import { useMode } from './store/session';
import { AppsOverlay } from './overlays/AppsOverlay';
import { CalibrationOverlay } from './overlays/CalibrationOverlay';
import { PausedOverlay } from './overlays/PausedOverlay';
import { SafetyKeyOverlay } from './overlays/SafetyKeyOverlay';
import { SleepOverlay } from './overlays/SleepOverlay';
import { SummaryScreen } from './screens/summary/SummaryScreen';
import { WelcomeScreen } from './screens/welcome/WelcomeScreen';
import { WorkoutScreen } from './screens/workout/WorkoutScreen';

/* Three screens — welcome, workout, summary — chosen by the session mode,
   which Kotlin owns. See Session.kt for why the board's own mode can't be
   trusted for this. */
const SCREENS = {
  welcome: WelcomeScreen,
  workout: WorkoutScreen,
  summary: SummaryScreen,
} as const;

export function App() {
  useIdleSleep();
  useTouchRegion();
  const Screen = SCREENS[screenFor(useMode())];
  return (
    <>
      <Screen />
      {/* In stacking order: each covers everything listed before it. */}
      <AppsOverlay />
      <CalibrationOverlay />
      <PausedOverlay />
      <SafetyKeyOverlay />
      <SleepOverlay />
    </>
  );
}
