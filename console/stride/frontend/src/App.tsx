import { useIdleSleep } from './hooks/useIdleSleep';
import { screenFor } from './lib/session';
import { useMode } from './store/session';
import { CoachRibbon } from './components/organisms';
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
  const Screen = SCREENS[screenFor(useMode())];
  return (
    <>
      <Screen />
      {/* Outside the screens, so a line can fade on and off over the walk. */}
      <CoachRibbon />
      {/* In stacking order: each covers everything listed before it. */}
      <CalibrationOverlay />
      <PausedOverlay />
      <SafetyKeyOverlay />
      <SleepOverlay />
    </>
  );
}
