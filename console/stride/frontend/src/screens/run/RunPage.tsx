import type { TrailMateKind } from '../../bridge/types';
import { Clock, TrailMateStatus } from '../../components/molecules';
import { Page, PageContent, PageHeader } from '../../components/layout';
import { useFreshFromTrailMate } from '../../hooks/useFreshFromTrailMate';
import { useWelcome } from '../../store/welcome';
import { HowStep } from '../welcome/HowStep';
import { PlanStep } from '../welcome/PlanStep';

const TITLES = { manual: 'Manual', routes: 'Routes', workouts: 'Workouts' } as const;

/** The clock, and how the page's TrailMate list stands, which it asks for
 *  afresh each time it opens. */
function Aside({ kind }: { kind?: TrailMateKind }) {
  return <><Clock />{kind && <Fresh kind={kind} />}</>;
}
function Fresh({ kind }: { kind: TrailMateKind }) {
  useFreshFromTrailMate(kind);
  return <TrailMateStatus kind={kind} />;
}

/** Run: how to run, then which run. Choosing starts it: Free, a heart-rate
 *  zone, a route, or a workout's START. Back is in the app bar. */
export function RunPage() {
  const step = useWelcome((s) => s.step);
  const planMode = useWelcome((s) => s.planMode);
  const back = useWelcome((s) => s.back);

  if (step < 3) {
    return (
      <Page>
        {/* Today and tomorrow beside the choices are the schedule's. */}
        <PageHeader title="How do you want to run?" aside={<Aside kind="schedule" />} />
        <PageContent><HowStep /></PageContent>
      </Page>
    );
  }
  const kind: TrailMateKind | undefined = planMode === 'routes' ? 'routes' : planMode === 'workouts' ? 'schedule' : undefined;
  return (
    <Page>
      <PageHeader title={TITLES[planMode]} aside={<Aside kind={kind} />} onBack={back} />
      <PageContent layout={planMode === 'manual' ? 'centred' : 'fill'}><PlanStep /></PageContent>
    </Page>
  );
}
