import type { SessionMode } from '../../bridge/types';
import { cx } from '../../lib/cx';
import { mmss } from '../../lib/format';
import { phasePreview, phaseProgress } from '../../lib/session';
import { useField, useSession } from '../../store/session';
import { Label, Numeral, Prose } from '../primitives';
import styles from './Hero.module.css';

const COPY = {
  warmup: { name: 'Warm up', note: 'easing in — skip whenever you’re ready' },
  cooldown: { name: 'Cool down', note: 'easing down — skip to finish' },
} as const;

/** Warm-up and cool-down take over the hero. The 400 m track is for the
 *  workout proper; a lap counter means nothing while easing in. */
export function PhasePanel({ mode }: { mode: Extract<SessionMode, 'warmup' | 'cooldown'> }) {
  const left = useField('phaseLeft') ?? 0;
  const steps = useSession((s) => s.planSteps);
  const copy = COPY[mode];
  return (
    <div className={cx(styles.hero, styles.phase, styles[mode])}>
      <Label size="title" tone={mode === 'warmup' ? 'accent' : 'warm'} className={styles.phaseName}>{copy.name}</Label>
      <Numeral size="hero" className={styles.phaseClock}>{mmss(left)}</Numeral>
      <Prose size="body" className={styles.phaseNote}>{copy.note}</Prose>
      <Label tone="faint" className={styles.phasePreview}>{phasePreview(mode, steps)}</Label>
      <div className={styles.bar}>
        <i style={{ width: `${phaseProgress(left) * 100}%` }} />
      </div>
    </div>
  );
}
