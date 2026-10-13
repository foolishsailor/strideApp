import { useSchedule } from '../../store/trailmate';
import { useWelcome } from '../../store/welcome';
import { Button, Prose, Row } from '../../components/primitives';
import { ChoiceCard } from '../../components/molecules';
import styles from './Welcome.module.css';

/** Step 3, Manual — free, or held to a heart-rate zone (spec 038, US5). The
 *  zones are the runner's own, from TrailMate; without them there is nothing
 *  to hold, and the card says so. Selecting, never starting: BEGIN commits. */
export function ManualPicker() {
  const { runner, manual, hrZone, setManual, setHrZone } = useWelcome();
  const zones = useSchedule(runner)?.zones.hr ?? [];
  const hasZones = zones.length > 0;
  return (
    <>
      <Prose size="ask">Free, or held to your heart rate?</Prose>
      <Row space={40} className={styles.plans}>
        <ChoiceCard icon="🏃" name="Free" hint="speed and incline are yours" selected={manual === 'free'} onTap={() => setManual('free')} />
        <ChoiceCard
          icon="❤️"
          name="Heart rate"
          hint={hasZones ? 'the speed keeps you in a zone' : 'no heart-rate zones yet'}
          selected={manual === 'hr'}
          muted={!hasZones}
          onTap={() => setManual('hr')}
        />
      </Row>
      {manual === 'hr' && hasZones && (
        <Row className={styles.zones}>
          {zones.map((z) => (
            <Button key={z.zone} size="chip" className={styles.zone} selected={z.zone === hrZone} onTap={() => setHrZone(z.zone)}>
              <span className={styles.zoneName}>Zone {z.zone}</span>
              <span className={styles.zoneBpm}>{z.minBpm}–{z.maxBpm} bpm</span>
            </Button>
          ))}
        </Row>
      )}
      {!hasZones && (
        <Prose size="small" tone="faint" className={styles.note}>
          Heart rate needs your zones: set them in your TrailMate profile, and link TrailMate in My settings.
        </Prose>
      )}
    </>
  );
}
