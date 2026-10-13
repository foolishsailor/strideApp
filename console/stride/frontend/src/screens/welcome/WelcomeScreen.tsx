import { settings } from '../../bridge/stride';
import { begin, canBegin, useWelcome } from '../../store/welcome';
import { Button, Fill } from '../../components/primitives';
import { TopBar } from '../../components/molecules';
import { HowStep } from './HowStep';
import { PlanStep } from './PlanStep';
import { WhoStep } from './WhoStep';
import styles from './Welcome.module.css';

/** who → how → which. Nothing reaches Kotlin, and the belt cannot move, until
 *  a run is committed to with BEGIN on step 3. */
export function WelcomeScreen() {
  const step = useWelcome((s) => s.step);
  const back = useWelcome((s) => s.back);
  const ready = useWelcome(canBegin);

  return (
    <Fill>
      <TopBar />
      <Fill centred>
        <div className={styles.step}>
          {step === 1 && <WhoStep />}
          {step === 2 && <HowStep />}
          {step === 3 && <PlanStep />}
        </div>

        {step === 1 && (
          <>
            <div className={styles.foot}>
              Clip the safety key on first — the belt eases up to 2 km/h as soon as you choose.
            </div>
            <Button size="corner" className={styles.settings} onTap={() => settings().open('treadmill')}>
              <svg className={styles.cog} viewBox="0 0 24 24" aria-hidden="true">
                <circle cx="12" cy="12" r="3" />
                <path d="M19.4 15a1.7 1.7 0 00.3 1.8l.1.1a2 2 0 11-2.8 2.8l-.1-.1a1.7 1.7 0 00-1.8-.3 1.7 1.7 0 00-1 1.5V21a2 2 0 11-4 0v-.1a1.7 1.7 0 00-1.1-1.5 1.7 1.7 0 00-1.8.3l-.1.1a2 2 0 11-2.8-2.8l.1-.1a1.7 1.7 0 00.3-1.8 1.7 1.7 0 00-1.5-1H3a2 2 0 110-4h.1a1.7 1.7 0 001.5-1.1 1.7 1.7 0 00-.3-1.8l-.1-.1a2 2 0 112.8-2.8l.1.1a1.7 1.7 0 001.8.3H9a1.7 1.7 0 001-1.5V3a2 2 0 114 0v.1a1.7 1.7 0 001 1.5 1.7 1.7 0 001.8-.3l.1-.1a2 2 0 112.8 2.8l-.1.1a1.7 1.7 0 00-.3 1.8V9a1.7 1.7 0 001.5 1H21a2 2 0 110 4h-.1a1.7 1.7 0 00-1.5 1z" />
              </svg>
              TREADMILL SETTINGS
            </Button>
          </>
        )}
        {/* A runner's own settings, once they have said who they are. Only on
            this step: BEGIN takes the corner on the next. */}
        {step === 2 && (
          <Button size="corner" className={styles.settings} onTap={() => settings().open('me')}>MY SETTINGS</Button>
        )}
        {step > 1 && <Button size="corner" className={styles.back} onTap={back}>← BACK</Button>}
        {step === 3 && <Button size="corner" className={styles.begin} muted={!ready} onTap={begin}>BEGIN →</Button>}
      </Fill>
    </Fill>
  );
}
