import { useSchedule } from '../../store/trailmate';
import { chooseAndBegin, useWelcome } from '../../store/welcome';
import { Button, Prose, Row } from '../../components/primitives';
import { ChoiceCard } from '../../components/molecules';
import styles from './Welcome.module.css';

/**
 * Free, or held to a heart rate, for whatever run is being chosen: Manual,
 * or a route. Free starts it; Heart rate shows the runner's zones, and a
 * zone starts it (begin() knows which run). The zones are the runner's own,
 * from TrailMate; without them there is nothing to hold, and the card says so.
 */
export function TargetChooser() {
  const { runner, manual, setManual } = useWelcome();
  const zones = useSchedule(runner)?.zones.hr ?? [];
  const hasZones = zones.length > 0;
  return (
    <>
      <Prose size="ask">Free, or held to your heart rate?</Prose>
      <Row space={40} className={styles.plans}>
        <ChoiceCard icon="run" name="Free" hint="speed and incline are yours" onTap={() => chooseAndBegin({ manual: 'free', hrZone: null })} />
        <ChoiceCard
          icon="heart"
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
            <Button key={z.zone} size="chip" className={styles.zone} onTap={() => chooseAndBegin({ manual: 'hr', hrZone: z.zone })}>
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
