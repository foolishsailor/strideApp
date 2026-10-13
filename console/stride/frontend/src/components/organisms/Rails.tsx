import { useMemo, useRef } from 'react';
import { bridge } from '../../bridge/stride';
import { cx } from '../../lib/cx';
import { fixed1 } from '../../lib/format';
import { inclineStops, isMoving, nearestStop, parseLimits, speedDelta, speedStops } from '../../lib/session';
import { kphFrom, speedIn, speedText, speedUnit } from '../../lib/units';
import { useField, useMode, useSession } from '../../store/session';
import { useUnits } from '../../store/settings';
import { useUi } from '../../store/ui';
import { RailReading, ValueRail } from '../molecules';
import { Button, Icon } from '../primitives';
import { drivesSpeed } from './SpeedMenu';
import styles from './SpeedMenu.module.css';

/** Speed steps 0.1 on a tap, 0.5 while held, in km/h or mph — whichever the
 *  screen shows; incline 0.5 % either way. */
const SPEED_STEP = { fine: 0.1, coarse: 0.5 };
const INCLINE_STEP = { fine: 0.5, coarse: 0.5 };

/* Read once per run: the board has reported its range by the time anyone
   is on the belt, and it doesn't change mid-run. */
const useLimits = () => useMemo(() => parseLimits(bridge().boardLimits?.()), []);

const exactly = (stops: number[], v: number) => stops.find((s) => Math.abs(s - v) < 0.05);

/* Each rail and reading subscribes to its own numbers, so a speed change
   does not redraw the incline side. */

export function InclineReading() {
  const incline = useField('incline') ?? 0;
  const target = useField('targetIncline') ?? incline;
  return <RailReading label="Incline" value={fixed1(incline)} unit="%" target={fixed1(target)} />;
}

/** Whether the workout or the runner has the speed, beside it; nothing when
 *  no step is setting it. */
function SpeedMode() {
  const step = useField('workoutStep');
  if (!drivesSpeed(step)) return null;
  return step!.speedAuto
    ? <span className={styles.mode}><Icon name="auto" label="Speed: auto" /></span>
    : <span className={cx(styles.mode, styles.manual)}><Icon name="manual" label="Speed: manual" /></span>;
}

/** The speed, and whose it is. Pressing either opens the speed menu. */
export function SpeedReading() {
  const u = useUnits();
  const speed = useField('speed') ?? 0;
  const target = useField('targetSpeed') ?? speed;
  return (
    <Button size="reading" onTap={() => {
      const ui = useUi.getState();
      ui.setFanOpen(false);
      ui.setSpeedMenuOpen(!ui.speedMenuOpen);
    }}>
      <SpeedMode />
      <RailReading label="Speed" value={speedText(speed, u)} unit={speedUnit(u)} target={speedText(target, u)} />
    </Button>
  );
}

/** How long a step we sent is trusted over the snapshot's target. The board
 *  takes a moment to echo a new speed, and a held + steps faster than that:
 *  without this, every step in the gap would start from the old target. */
const STEP_TRUST_MS = 1500;

export function InclineRail() {
  const incline = useField('incline') ?? 0;
  const target = useField('targetIncline') ?? incline;
  const limits = useLimits();
  const stops = useMemo(() => inclineStops(limits), [limits]);
  return (
    <ValueRail
      side="left"
      stops={stops} selected={exactly(stops, target)} focus={nearestStop(stops, target)}
      onPick={(v) => bridge().setIncline(v)}
      onStep={(d) => bridge().incline(d)} {...INCLINE_STEP}
    />
  );
}

/** The speed rail, in km/h or mph. Kotlin only ever hears km/h: a stop is
 *  converted on the way, and a step goes as the km/h change that lands on
 *  the next 0.1 of the unit shown (speedDelta). Kotlin's own speed() still
 *  decides what a step below the belt's minimum means. */
export function SpeedRail() {
  const u = useUnits();
  const moving = isMoving(useMode());
  const speed = useField('speed') ?? 0;
  const target = speedIn(useField('targetSpeed') ?? speed, u);
  const limits = useLimits();
  const stops = useMemo(() => speedStops(limits, u), [limits, u]);
  const sent = useRef({ kph: 0, at: -Infinity });
  const step = (d: number) => {
    const snap = useSession.getState().snapshot;
    const fresh = performance.now() - sent.current.at < STEP_TRUST_MS;
    const from = fresh ? sent.current.kph : (snap.targetSpeed ?? snap.speed ?? 0);
    const delta = speedDelta(from, d, u);
    // Where Kotlin will put it (speed() in MainActivity): below the minimum
    // there is no slow, so up means the minimum and down means stopped.
    const lands = from + delta < limits.minKph ? (d > 0 ? limits.minKph : 0) : Math.min(limits.maxKph, from + delta);
    sent.current = { kph: lands, at: performance.now() };
    bridge().speed(delta);
  };
  return (
    <ValueRail
      side="right"
      stops={stops} selected={exactly(stops, target)} focus={nearestStop(stops, target)}
      onPick={(v) => bridge().setSpeed(kphFrom(v, u))}
      onStep={step} {...SPEED_STEP}
      muted={!moving}
    />
  );
}
