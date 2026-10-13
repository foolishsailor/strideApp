import { useNow } from '../../hooks/useClock';
import { useScheduleFeed } from '../../hooks/useScheduleFeed';
import { localDate, RECONNECT_TEXT, scheduleDays, scheduleView } from '../../lib/schedule';
import { useSchedule } from '../../store/trailmate';
import { useWelcome } from '../../store/welcome';
import { Prose } from '../../components/primitives';
import { DaySchedule } from '../../components/molecules';
import { WorkoutPreview } from '../../components/organisms';
import styles from './Welcome.module.css';

/** Today, tomorrow and the five days after: the week, of which the home
 *  screen shows the first two days. */
const DAYS = 7;

/** Why there is no list: no link, or a link that may not read the plan. */
function Unavailable({ reconnect }: { reconnect: boolean }) {
  return (
    <>
      <Prose size="ask">{reconnect ? RECONNECT_TEXT : 'No workouts from TrailMate'}</Prose>
      <Prose size="body" className={styles.note}>
        {reconnect ? 'Reconnect it in My settings → TrailMate.' : 'Link TrailMate in My settings to see your plan here.'}
      </Prose>
    </>
  );
}

/** Step 3, Workouts — the runner's week from TrailMate, day by day, with
 *  the chosen workout's steps beside it (spec 038, US2). Picking shows the
 *  preview; BEGIN runs it. */
export function WorkoutPicker() {
  useScheduleFeed();
  const { runner, workout, pickWorkout } = useWelcome();
  const schedule = useSchedule(runner);
  const today = localDate(useNow());
  const view = scheduleView(schedule);
  if (!schedule || view !== 'schedule') return <Unavailable reconnect={view === 'reconnect'} />;

  const chosen = schedule.workouts.find((w) => w.id === workout && w.runnable);
  return (
    <div className={styles.workouts}>
      <div className={styles.week}>
        {scheduleDays(schedule.workouts, today, DAYS).map((day) => (
          <div key={day.date} className={styles.weekDay}>
            <DaySchedule day={day} today={today} selectedId={workout} inList compact onPick={(w) => pickWorkout(w.id)} />
          </div>
        ))}
      </div>
      <div className={styles.preview}>
        {chosen ? (
          <WorkoutPreview workout={chosen} />
        ) : (
          <Prose size="body" tone="faint" className={styles.pickHint}>Pick a workout to see its steps.</Prose>
        )}
      </div>
    </div>
  );
}
