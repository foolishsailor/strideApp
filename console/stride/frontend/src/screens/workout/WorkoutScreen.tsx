import { modeLabel } from '../../lib/session';
import { useField, useMode } from '../../store/session';
import { Fill } from '../../components/primitives';
import { StatusChip } from '../../components/molecules';
import {
  ControlBar, FanMenu, Hero, InclineRail, InclineReading, MetricStrip, SpeedRail, SpeedReading,
} from '../../components/organisms';

/** The screen the treadmill is actually walked on: warm-up, the walk, pause and
 *  cool-down. A bar docked along the top — incline at its left end, speed at
 *  its right, the walk's numbers between — and from its bottom edge the
 *  incline and speed rails down either side. The oval or path hero between
 *  them, and start, fan and stop beneath it. */
export function WorkoutScreen() {
  const mode = useMode();
  const ramping = useField('ramping');
  return (
    <Fill>
      <MetricStrip left={<InclineReading />} right={<SpeedReading />}>
        <StatusChip mode={mode} label={modeLabel(mode, ramping)} />
      </MetricStrip>
      <InclineRail />
      <SpeedRail />
      <Hero />
      <ControlBar />
      <FanMenu />
    </Fill>
  );
}
