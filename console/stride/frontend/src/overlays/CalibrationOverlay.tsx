import { useRef } from 'react';
import { bridge } from '../bridge/stride';
import { beltOffset, canStop, isMoving, paceText, stepPace } from '../lib/session';
import { useField, useMode } from '../store/session';
import { useUnits } from '../store/settings';
import { speedIn, speedUnit } from '../lib/units';
import { useUi } from '../store/ui';
import { Button, Fill, Heading, Label, Numeral, Prose, Row } from '../components/primitives';
import styles from './CalibrationOverlay.module.css';

/** How far one belt press moves what is sent, km/h. About 2 s/mi at a 9:00
 *  pace: small enough to land on the Stryd, big enough to see it move. */
const BELT_STEP = { fine: 0.05, coarse: 0.1 };

/** Pace steps per press, and per repeat while held. See paceStepSec. */
const PACE_STEP = { fine: 1, coarse: 2 };

/**
 * Belt calibration, over the walk (see BeltCalibration.kt).
 *
 * Set the pace to calibrate, let the Stryd settle, then move the belt until
 * the two agree, by hand or with one tap on USE STRYD READING. SAVE keeps it as
 * a point. An overlay rather than part of the walk screen, so its controls are
 * boxed; STOP is here too, and does exactly what the walk screen's does.
 */
export function CalibrationOverlay() {
  const cal = useField('calib');
  const mode = useMode();
  const setConfirmOpen = useUi((s) => s.setConfirmOpen);
  const asked = useRef(0);
  /* The walk screen's own units (Settings → Display), not a copy of them. */
  const u = useUnits();
  const miles = u === 'mi';
  const sp = (k: number) => `${speedIn(k, u).toFixed(2)} ${speedUnit(u)}`;
  if (!cal || !isMoving(mode)) return null;

  const { kph, belt, tableBelt, podKph, podSecs, ready, pod, points, note } = cal;
  const settling = kph > 0 && !ready;

  /* Step from the pace last asked for, not the one last drawn: presses come
     faster than the console answers, and each would otherwise ask again for
     the same pace. Forgotten once the dial has caught up with it. */
  const pace = (faster: boolean, n: number) => {
    const from = asked.current && Math.abs(asked.current - kph) > 0.01 ? asked.current : kph;
    asked.current = stepPace(from, miles, faster, n);
    bridge().setSpeed(asked.current);
  };

  const onStop = () => {
    if (!canStop(mode)) return;
    bridge().pause();
    setConfirmOpen(true);
  };

  return (
    <Fill centred className={styles.scrim}>
      <Heading size="section">Belt calibration</Heading>
      <Prose size="body" className={styles.how}>
        {pod
          ? 'Hold a steady pace. When the Stryd agrees with the set pace, save it. Do a few paces across your range.'
          : 'No Stryd reading. Pair it in Settings → Devices, and make sure it is on your shoe.'}
      </Prose>

      <Row space={24} className={styles.readings}>
        <div className={styles.reading}>
          <Label>Set pace</Label>
          <Numeral size="metric">{paceText(kph, miles)}</Numeral>
          <Label size="caption" tone="faint">{kph > 0 ? sp(kph) : 'waiting for the belt'}</Label>
        </div>
        <div className={styles.reading}>
          <Label>Stryd</Label>
          <Numeral size="metric">{podKph > 0 ? paceText(podKph, miles) : '–'}</Numeral>
          <Label size="caption" tone={ready ? 'faint' : 'warm'}>
            {podKph > 0 ? `${sp(podKph)} · ${Math.round(podSecs)} s average` : settling ? 'settling…' : '–'}
          </Label>
        </div>
        <div className={styles.reading}>
          <Label>Belt sent</Label>
          <Numeral size="metric">{belt > 0 ? speedIn(belt, u).toFixed(2) : '–'}<small className={styles.unit}>{speedUnit(u)}</small></Numeral>
          <Label size="caption" tone="faint">
            {beltOffset(kph, belt)}
            {Math.abs(belt - tableBelt) >= 0.005 ? ` · saved ${beltOffset(kph, tableBelt)}` : ''}
          </Label>
        </div>
      </Row>

      <Row space={16} className={styles.controls}>
        <Button size="overlay" className={styles.button} onStep={(n) => pace(false, n)} {...PACE_STEP}>SLOWER PACE</Button>
        <Button size="overlay" className={styles.button} onStep={(n) => pace(true, n)} {...PACE_STEP}>FASTER PACE</Button>
      </Row>
      <Row space={16} className={styles.controls}>
        <Button size="overlay" className={styles.button} onStep={(d) => bridge().calNudge(-d)} {...BELT_STEP}>BELT SLOWER</Button>
        <Button size="overlay" tone="primary" muted={!ready} className={styles.button} onTap={() => bridge().calUseStryd()}>USE STRYD READING</Button>
        <Button size="overlay" className={styles.button} onStep={(d) => bridge().calNudge(d)} {...BELT_STEP}>BELT FASTER</Button>
      </Row>
      <Row space={16} className={styles.controls}>
        <Button size="overlay" tone="primary" muted={!(kph > 0)} className={styles.button} onTap={() => bridge().calSave()}>SAVE POINT</Button>
        <Button size="overlay" className={styles.button} onTap={() => bridge().calDone()}>FINISH</Button>
        <Button size="overlay" tone="stop" className={styles.button} onTap={onStop}>STOP</Button>
      </Row>

      <Prose size="small" tone={note ? 'accent' : 'faint'} className={styles.note}>
        {note || (points.length
          ? 'Saved: ' + points.map((p) => `${paceText(p.kph, miles)} ${beltOffset(p.kph, p.belt)}`).join('  ·  ')
          : 'No points saved yet.')}
      </Prose>
    </Fill>
  );
}
