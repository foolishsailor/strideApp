import type { CSSProperties } from 'react';
import { modeLabel } from '../../lib/session';
import { useField, useMode } from '../../store/session';
import { useUi } from '../../store/ui';
import { Fill } from '../../components/primitives';
import { StatusChip } from '../../components/molecules';
import {
  CompactStrip, ControlBar, Drawer, FanMenu, Grip, Hero, InclineRail, InclineReading, MetricStrip,
  SettingsModal, SizeToggle, SpeedMenu, SpeedRail, SpeedReading, StepBand, toggleControls, toggleMetrics,
} from '../../components/organisms';

/** The screen the treadmill is actually run on: warm-up, the run, pause and
 *  cool-down. A bar docked along the top — incline at its left end, speed at
 *  its right, the run's numbers between — and from its bottom edge the
 *  incline and speed rails down either side. The oval or path hero between
 *  them, and apps, start, fan and stop beneath it. A TrailMate workout's
 *  step (now, left, next) docks on top of those.
 *
 *  Over another app (APPS) the hero goes, the middle is the app's picture, and
 *  the edges are drawers: the numbers slide off the top, the rails and dock
 *  off the sides and bottom. The numbers can be made one short line along the
 *  top (SMALL, beside their grip), so the film keeps more of the screen. */
/** How deep the bottom edge is: the dock, and a workout's step band on it.
 *  Everything that stops above it (rails, chart, drawer grip) reads this. */
const dockDepth = (workout: boolean) => ({ '--dock-h': workout ? '220px' : '104px' }) as CSSProperties;

export function WorkoutScreen() {
  const mode = useMode();
  const ramping = useField('ramping');
  const { overApp, metricsOpen, controlsOpen, metricsCompact } = useUi();
  const workout = !!useField('workoutStep');
  const strip = (
    <MetricStrip left={<InclineReading />} right={<SpeedReading />}>
      <StatusChip mode={mode} label={modeLabel(mode, ramping)} />
    </MetricStrip>
  );
  if (!overApp) {
    return (
      <Fill style={dockDepth(workout)}>
        {strip}
        <InclineRail />
        <SpeedRail />
        <Hero />
        <StepBand />
        <ControlBar />
        <FanMenu />
        <SpeedMenu />
        <SettingsModal />
      </Fill>
    );
  }
  return (
    <Fill className={metricsCompact ? 'metrics-small' : undefined} style={dockDepth(workout)}>
      <Drawer edge="left" open={controlsOpen}><InclineRail /></Drawer>
      <Drawer edge="right" open={controlsOpen}><SpeedRail /></Drawer>
      <Drawer edge="bottom" open={controlsOpen}>
        <StepBand />
        <ControlBar />
        <Grip edge="bottom" onTap={toggleControls} />
      </Drawer>
      {/* The dock's grip moves the rails with it: they are one set of
          controls. Last, so the strip and its grip are over the rails. */}
      <Drawer edge="top" open={metricsOpen} small={metricsCompact}>
        {metricsCompact ? <CompactStrip /> : strip}
        <Grip edge="top" onTap={toggleMetrics} />
        {/* Only with the numbers showing: a closed drawer leaves its grip and nothing else. */}
        {metricsOpen && <SizeToggle compact={metricsCompact} />}
      </Drawer>
      <FanMenu />
      <SpeedMenu />
      <SettingsModal />
    </Fill>
  );
}
