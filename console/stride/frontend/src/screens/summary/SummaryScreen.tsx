import { bridge } from '../../bridge/stride';
import { fixed1, mmss, nf } from '../../lib/format';
import { speedText, speedUnit, walked } from '../../lib/units';
import { useUnits } from '../../store/settings';
import { useSession } from '../../store/session';
import { useWelcome } from '../../store/welcome';
import { Button, Fill, Heading, Label, Prose, Row } from '../../components/primitives';
import { StatCard } from '../../components/molecules';
import styles from './SummaryScreen.module.css';

/* Where the walk has got to on its way to TrailMate. Nothing at all for a
   guest, a walk too short to send, or somebody who has not connected. */
const TRAILMATE: Record<string, string> = {
  sending: 'Sending to TrailMate…',
  sent: 'Sent to TrailMate',
  waiting: 'Will send to TrailMate when online',
  failed: 'TrailMate could not take this walk — see Settings',
  reconnect: 'Reconnect TrailMate in Settings to send this walk',
};

export function SummaryScreen() {
  const s = useSession((st) => st.snapshot);
  const walker = useWelcome((w) => w.walker);
  const kind = s.workout && s.workout !== 'none' ? s.workout : 'workout';
  const u = useUnits();
  const dist = walked(s.distance ?? 0, u);

  return (
    <Fill centred>
      {/* The walker's own name, or none for a guest — better than
          congratulating somebody by the wrong name. */}
      <Heading className={styles.head}>{walker ? `Nice work, ${walker}` : 'Nice work'}</Heading>
      {/* Under the kicker, not between it and the headline: "Nice work / WALK
          COMPLETE" is one thought and the coach's sentence is another. */}
      <Label size="title" tone="dim" className={styles.kicker}>{kind} complete</Label>
      {s.summaryLine && <Prose tone="accent" className={styles.coach}>{s.summaryLine}</Prose>}
      <Row space={16} className={styles.cards}>
        <StatCard label="Time">{mmss(s.elapsed ?? 0)}</StatCard>
        <StatCard label="Distance" unit={dist.unit}>{dist.value}</StatCard>
        <StatCard label="Calories" unit="kcal">{nf(s.calories ?? 0)}</StatCard>
        <StatCard label="Avg speed" unit={speedUnit(u)}>{speedText(s.avgSpeed, u)}</StatCard>
        <StatCard label="Max speed" unit={speedUnit(u)}>{speedText(s.maxSpeed, u)}</StatCard>
        <StatCard label="Avg incline" unit="%">{fixed1(s.avgIncline)}</StatCard>
      </Row>
      {s.trailmate && TRAILMATE[s.trailmate] && (
        <Label tone="dim" className={styles.sent}>{TRAILMATE[s.trailmate]}</Label>
      )}
      <div className={styles.done}>
        <Button tone="primary" size="wide" onTap={() => bridge().home()}>DONE</Button>
      </div>
    </Fill>
  );
}
