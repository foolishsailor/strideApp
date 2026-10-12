import { bridge } from '../bridge/stride';
import { pausedWhere } from '../lib/session';
import { useSession } from '../store/session';
import { useUi } from '../store/ui';
import { Button, Overlay } from '../components/primitives';

/** STOP's question. The belt is already paused by the time this shows. */
export function PausedOverlay() {
  const open = useUi((s) => s.confirmOpen);
  const where = useSession((s) => pausedWhere(s.snapshot));
  if (!open) return null;

  const answer = (fn: () => void) => () => {
    useUi.getState().setConfirmOpen(false);
    fn();
  };

  return (
    <Overlay
      title="Workout paused"
      message={where}
      actions={
        <>
          <Button tone="primary" size="overlay" onTap={answer(() => bridge().resume())}>RESUME</Button>
          <Button tone="stop" size="overlay" onTap={answer(() => bridge().end())}>END WORKOUT</Button>
        </>
      }
    />
  );
}
