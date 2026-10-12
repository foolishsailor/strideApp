import { useMemo } from 'react';
import { bridge, myRoutes } from '../../bridge/stride';
import { useWelcome } from '../../store/welcome';
import { Heading, Prose, Row } from '../../components/primitives';
import { ChoiceCard } from '../../components/molecules';
import styles from './Welcome.module.css';

/** Step 2 — on your own, or guided. Casual starts the walk outright; the
 *  others lead on to step 3. */
export function HowStep() {
  const { walker, chooseShapes, chooseRoutes } = useWelcome();
  // Offered only when there is something behind it.
  const hasRoutes = useMemo(() => myRoutes().length > 0, []);

  return (
    <>
      <Heading>{walker || 'Guest'}</Heading>
      <Prose size="ask" className={styles.ask}>On your own, or guided?</Prose>
      <Row space={40} className={styles.choices}>
        <ChoiceCard icon="🚶" name="Casual" hint="you choose everything" onTap={() => bridge().choose()} />
        {hasRoutes && <ChoiceCard icon="🗺️" name="My routes" hint="a walk you have already done" onTap={chooseRoutes} />}
        <ChoiceCard icon="⛰️" name="Guided" hint="the hill is handled for you" onTap={chooseShapes} />
      </Row>
    </>
  );
}
