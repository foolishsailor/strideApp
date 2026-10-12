import { modeLabel } from '../../lib/session';
import { useField, useMode } from '../../store/session';
import { Fill } from '../../components/primitives';
import { StatusChip, TopBar } from '../../components/molecules';
import { ControlBar, FanMenu, Hero, InclineRail, MetricStrip, SpeedRail } from '../../components/organisms';

/** The screen the treadmill is actually walked on: warm-up, the walk, pause and
 *  cool-down. Metrics docked along the top, incline and speed docked down the
 *  left and right, the oval or path hero between them, and start, fan and
 *  stop beneath it. */
export function WorkoutScreen() {
  const mode = useMode();
  const ramping = useField('ramping');
  return (
    <Fill>
      <MetricStrip />
      {/* After the strip, so the clock row draws over its top. */}
      <TopBar>
        <StatusChip mode={mode} label={modeLabel(mode, ramping)} />
      </TopBar>
      <InclineRail />
      <SpeedRail />
      <Hero />
      <ControlBar />
      <FanMenu />
    </Fill>
  );
}
