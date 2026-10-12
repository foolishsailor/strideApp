import { fixed1 } from '../../lib/format';
import { inclineTicks, speedTicks, TICKS } from '../../lib/session';
import { useField } from '../../store/session';
import { SideGauge } from '../molecules';

/* Each gauge subscribes to its own two numbers, so a speed change does not
   redraw the incline side. */

export function InclineGauge() {
  const incline = useField('incline') ?? 0;
  const target = useField('targetIncline');
  return (
    <SideGauge
      side="left" label="Incline" value={fixed1(incline)} unit="%"
      target={fixed1(target)} targetUnit="%"
      tickCount={TICKS} ticks={inclineTicks(incline)} tone="accent"
    />
  );
}

export function SpeedGauge() {
  const speed = useField('speed') ?? 0;
  const target = useField('targetSpeed');
  return (
    <SideGauge
      side="right" label="Speed" value={fixed1(speed)} unit="km/h"
      target={fixed1(target)}
      tickCount={TICKS} ticks={speedTicks(speed)} tone="warm"
    />
  );
}
