import { settings } from '../../bridge/stride';
import { useWelcome } from '../../store/welcome';
import { Button, Icon } from '../../components/primitives';
import { Clock } from '../../components/molecules';
import { Page, PageContent, PageFooter, PageHeader } from '../../components/layout';
import { RunnerShell } from '../shell/RunnerShell';
import { WhoStep } from './WhoStep';
import styles from './Welcome.module.css';

/** "Who's running?", then the runner's own shell (Run, History, Settings).
 *  Nothing reaches Kotlin, and the belt cannot move, until a run is committed
 *  to with BEGIN. */
export function WelcomeScreen() {
  const step = useWelcome((s) => s.step);
  if (step > 1) return <RunnerShell />;
  return (
    <Page>
      <PageHeader title="" aside={<Clock />} />
      <PageContent><WhoStep /></PageContent>
      <PageFooter
        centre="Clip the safety key on first — the belt eases up to 2 km/h as soon as you choose."
        end={(
          <Button size="corner" className={styles.settings} onTap={() => settings().open('treadmill')}>
            <Icon name="settings" label="Settings" />
            <span className={styles.settingsLabel}>TREADMILL SETTINGS</span>
          </Button>
        )}
      />
    </Page>
  );
}
