import { useWelcome } from '../../store/welcome';
import { Heading, Prose, Row } from '../../components/primitives';
import { ChoiceCard } from '../../components/molecules';
import styles from './Welcome.module.css';

/** Step 2 — Manual, Routes or Workouts (spec 038, S-001). Each leads on to
 *  step 3; nothing here moves the belt. */
export function HowStep() {
  const { runner, chooseManual, chooseRoutes, chooseWorkouts } = useWelcome();
  return (
    <>
      <Heading>{runner || 'Guest'}</Heading>
      <Prose size="ask" className={styles.ask}>How do you want to run?</Prose>
      <Row space={40} className={styles.choices}>
        <ChoiceCard icon="🚶" name="Manual" hint="free, or held to a heart rate" onTap={chooseManual} />
        <ChoiceCard icon="🗺️" name="Routes" hint="your starred routes and races" onTap={chooseRoutes} />
        <ChoiceCard icon="📅" name="Workouts" hint="your plan from TrailMate" onTap={chooseWorkouts} />
      </Row>
    </>
  );
}
