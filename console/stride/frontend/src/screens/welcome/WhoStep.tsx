import { useMemo } from 'react';
import { bridge, core, settings } from '../../bridge/stride';
import { useNow } from '../../hooks/useClock';
import { greeting } from '../../lib/session';
import { useUi } from '../../store/ui';
import { useWelcome } from '../../store/welcome';
import { Heading, Prose, Row } from '../../components/primitives';
import { ChoiceCard } from '../../components/molecules';
import styles from './Welcome.module.css';

/** Step 1 — who is running.
 *
 *  Everyone is read from Settings rather than written here. A name on this
 *  picker that Settings does not have would be a runner with no history. One list,
 *  in one place, re-read whenever Settings closes. */
export function WhoStep() {
  const now = useNow();
  const peopleVersion = useUi((s) => s.peopleVersion);
  const { setRunner, goTo } = useWelcome();

  const { names, nobodySetUp } = useMemo(
    () => ({ names: core().profiles(), nobodySetUp: !core().people().length }),
    [peopleVersion], // not read inside: it only says Settings has closed, so re-read
  );

  const pick = (name: string) => {
    setRunner(name);
    bridge().setRunner(name);
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
            here; once somebody is set up, it has its own quiet button. */}
        {nobodySetUp && <ChoiceCard person icon="+" name="Add people" onTap={() => settings().open()} />}
      </Row>
    </>
  );
}
