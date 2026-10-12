import { useMemo } from 'react';
import { bridge } from '../../bridge/stride';
import { fixed1 } from '../../lib/format';
import { inclineStops, isMoving, nearestStop, parseLimits, speedStops } from '../../lib/session';
import { useField, useMode } from '../../store/session';
import { ValueRail } from '../molecules';

/** Speed steps 0.1 km/h on a tap, 0.5 while held; incline 0.5 % either way. */
const SPEED_STEP = { fine: 0.1, coarse: 0.5 };
const INCLINE_STEP = { fine: 0.5, coarse: 0.5 };

/* Read once per walk: the board has reported its range by the time anyone
   is on the belt, and it doesn't change mid-walk. */
const useLimits = () => useMemo(() => parseLimits(bridge().boardLimits?.()), []);

const exactly = (stops: number[], v: number) => stops.find((s) => Math.abs(s - v) < 0.05);

/* Each rail subscribes to its own two numbers, so a speed change does not
   redraw the incline side. */

export function InclineRail() {
  const incline = useField('incline') ?? 0;
  const target = useField('targetIncline') ?? incline;
  const limits = useLimits();
  const stops = useMemo(() => inclineStops(limits), [limits]);
  return (
    <ValueRail
      side="left" label="Incline" value={fixed1(incline)} unit="%" target={fixed1(target)}
      stops={stops} selected={exactly(stops, target)} focus={nearestStop(stops, target)}
      // The bridge only takes a step, so a stop is the step from the target.
      onPick={(v) => bridge().incline(v - target)}
      onStep={(d) => bridge().incline(d)} {...INCLINE_STEP}
    />
  );
}

export function SpeedRail() {
  const moving = isMoving(useMode());
  const speed = useField('speed') ?? 0;
  const target = useField('targetSpeed') ?? speed;
  const limits = useLimits();
  const stops = useMemo(() => speedStops(limits), [limits]);
  return (
    <ValueRail
      side="right" label="Speed" value={fixed1(speed)} unit="km/h" target={fixed1(target)}
      stops={stops} selected={exactly(stops, target)} focus={nearestStop(stops, target)}
      onPick={(v) => bridge().setSpeed(v)}
      onStep={(d) => bridge().speed(d)} {...SPEED_STEP}
      muted={!moving}
    />
  );
}
