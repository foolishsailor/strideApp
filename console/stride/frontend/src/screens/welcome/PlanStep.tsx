import { useWelcome } from '../../store/welcome';
import { ManualPicker } from './ManualPicker';
import { RoutePicker } from './RoutePicker';
import { WorkoutPicker } from './WorkoutPicker';

const PICKERS = { manual: ManualPicker, routes: RoutePicker, workouts: WorkoutPicker } as const;

/** Step 3 — which run, for the answer given on step 2. */
export function PlanStep() {
  const Picker = PICKERS[useWelcome((s) => s.planMode)];
  return <Picker />;
}
