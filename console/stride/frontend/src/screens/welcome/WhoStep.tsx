import { useMemo } from 'react';
import { core, settings } from '../../bridge/stride';
import { useNow } from '../../hooks/useClock';
import { useScheduleFeed } from '../../hooks/useScheduleFeed';
import { greeting } from '../../lib/session';
import { useUi } from '../../store/ui';
import { openWorkout, selectRunner, useWelcome } from '../../store/welcome';
import { Heading, Prose, Row } from '../../components/primitives';
import { ChoiceCard } from '../../components/molecules';
import { PersonSchedule } from './PersonSchedule';
import styles from './Welcome.module.css';

/** Step 1 — who is running, and under each of them what TrailMate has
 *  planned for today and tomorrow. A workout there is a way straight in.
 *
 *  Everyone is read from Settings rather than written here. A name on this
 *  picker that Settings does not have would be a runner with no history. One list,
 *  in one place, re-read whenever Settings closes. */
export function WhoStep() {
  const now = useNow();
  const peopleVersion = useUi((s) => s.peopleVersion);
  const goTo = useWelcome((s) => s.goTo);
  useScheduleFeed();

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
      <Row space={24} className={styles.people}>
        {names.map((name) => (
          <div key={name} className={styles.person}>
            <ChoiceCard person icon={name.charAt(0).toUpperCase()} name={name} onTap={() => pick(name)} />
            <PersonSchedule name={name} onPick={(w) => openWorkout(name, w.id)} />
          </div>
        ))}
        {/* The way in to Settings only while there is no other reason to be
            here; once somebody is set up, Settings is on the next step. */}
        {nobodySetUp && <ChoiceCard person icon="+" name="Add people" onTap={() => settings().open('treadmill')} />}
      </Row>
    </>
  );
}
