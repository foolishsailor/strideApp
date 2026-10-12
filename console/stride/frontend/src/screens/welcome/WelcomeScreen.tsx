import { bridge, settings } from '../../bridge/stride';
import { useWelcome } from '../../store/welcome';
import { Button, Fill } from '../../components/primitives';
import { TopBar } from '../../components/molecules';
import { HowStep } from './HowStep';
import { PlanStep } from './PlanStep';
import { WhoStep } from './WhoStep';
import styles from './Welcome.module.css';

/** who → how → which. Nothing reaches Kotlin, and the belt cannot move, until
 *  a run is committed to: Casual on step 2, or BEGIN on step 3. */
export function WelcomeScreen() {
  const { step, back, planMode, route, shape, minutes, loop } = useWelcome();

  const begin = () => {
    if (planMode === 'routes') {
      if (route) bridge().chooseRoute(route, loop);
    } else {
      bridge().chooseGuided(shape, minutes);
    }
  };

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
            {/* Used about once a month, and the question here is who is
                running, not which interface — so it is deliberately quiet,
                and only on this step. */}
            <Button size="corner" className={styles.settings} onTap={() => settings().open()}>SETTINGS</Button>
          </>
        )}
        {step > 1 && <Button size="corner" className={styles.back} onTap={back}>← BACK</Button>}
        {step === 3 && <Button size="corner" className={styles.begin} onTap={begin}>BEGIN →</Button>}
      </Fill>
    </Fill>
  );
}
