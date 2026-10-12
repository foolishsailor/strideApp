import { useEffect } from 'react';
import { bridge } from '../../bridge/stride';
import { useTap } from '../../hooks/useTap';
import { cx } from '../../lib/cx';
import { coachHoldMs } from '../../lib/session';
import { useSession } from '../../store/session';
import styles from './CoachRibbon.module.css';

/** The coach, docked in its own band (566 – 646) between the hero and the
 *  controls, inside the rails.
 *
 *  It used to float over the top of the hero, where it covered the segment
 *  header and the warm-up countdown — the two things most worth reading at the
 *  moment it speaks. This placement is load-bearing; do not float it back.
 *
 *  Always mounted, so it can fade in and out, and the band is simply empty
 *  when the coach is silent: a ribbon that pushed the layout around would move
 *  the controls under someone's eye mid-stride. */
export function CoachRibbon() {
  const { line, seq, shown } = useSession((s) => s.coach);
  const hide = useSession((s) => s.hideCoach);

  /* Held long enough to read twice, and restarted by every new line. */
  useEffect(() => {
    if (!shown) return;
    const t = setTimeout(hide, coachHoldMs(line));
    return () => clearTimeout(t);
  }, [seq, shown, line, hide]);

  /* Dismiss: the whole ribbon is the target, from anywhere on it. It silences
     the audio as well — hiding the words while the speaker keeps talking would
     be the worst of both. */
  const ref = useTap<HTMLDivElement>(() => {
    hide();
    bridge().hushCoach();
  });

  return (
    <div ref={ref} className={cx(styles.coach, shown && styles.shown)}>
      <div className={styles.who}>Coach</div>
      <div className={styles.text}>{line}</div>
      <div className={styles.dismiss}>Dismiss ×</div>
    </div>
  );
}
