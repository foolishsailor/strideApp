import { modeLabel } from '../../lib/session';
import { useField, useMode } from '../../store/session';
import { Fill } from '../../components/primitives';
import { StatusChip, TopBar } from '../../components/molecules';
import { ControlBar, FanMenu, Hero, InclineGauge, MetricStrip, SpeedGauge } from '../../components/organisms';

/** The screen the treadmill is actually walked on: warm-up, the walk, pause and
 *  cool-down. Oval or path hero, incline and speed flanking, secondary
 *  metrics along the bottom (after inspiration-UI/Nice.webp). */
export function WorkoutScreen() {
  const mode = useMode();
  const ramping = useField('ramping');
  return (
    <Fill>
      <TopBar>
        <StatusChip mode={mode} label={modeLabel(mode, ramping)} />
      </TopBar>
      <InclineGauge />
      <SpeedGauge />
      <Hero />
      <MetricStrip />
      <ControlBar />
      <FanMenu />
    </Fill>
  );
}
