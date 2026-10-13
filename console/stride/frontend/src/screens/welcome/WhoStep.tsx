import { useMemo } from 'react';
import { core, settings } from '../../bridge/stride';
import { useNow } from '../../hooks/useClock';
import { greeting } from '../../lib/session';
import { useUi } from '../../store/ui';
import { selectRunner, useWelcome } from '../../store/welcome';
import { Heading, Prose, Row } from '../../components/primitives';
import { ChoiceCard } from '../../components/molecules';
import styles from './Welcome.module.css';

/** Step 1 — who is running. Only the people: what TrailMate has planned is
 *  shown once somebody has said who they are (step 2).
 *
 *  Everyone is read from Settings rather than written here. A name on this
 *  picker that Settings does not have would be a runner with no history. One list,
 *  in one place, re-read whenever Settings closes. */
export function WhoStep() {
  const now = useNow();
  const peopleVersion = useUi((s) => s.peopleVersion);
  const goTo = useWelcome((s) => s.goTo);

  const { names, nobodySetUp } = useMemo(
    () => ({ names: core().profiles(), nobodySetUp: !core().people().length }),
    [peopleVersion], // not read inside: it only says Settings has closed, so re-read
  );

  const pick = (name: string) => {
    selectRunner(name);
    goTo(2);
  };

  return (
    <>
      <Heading>{greeting(now.getHours())}</Heading>
      <Prose size="ask" className={styles.ask}>Who's running?</Prose>
      <Row space={24} className={styles.choices}>
        {names.map((name) => (
          <ChoiceCard key={name} person icon={name.charAt(0).toUpperCase()} name={name} onTap={() => pick(name)} />
        ))}
        {/* The way in to Settings only while there is no other reason to be
            here; once somebody is set up, Settings is on the next step. */}
        {nobodySetUp && <ChoiceCard person icon="+" name="Add people" onTap={() => settings().open('treadmill')} />}
      </Row>
    </>
  );
}
