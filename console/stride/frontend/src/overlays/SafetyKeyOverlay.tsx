import { bridge } from '../bridge/stride';
import { useField } from '../store/session';
import { Button, Overlay } from '../components/primitives';

/** Above every screen. The hardware has already cut the belt by the time this
 *  appears; the overlay exists to explain why nothing is responding.
 *
 *  The board only pulses its key-out mode on removal, so the key coming back
 *  cannot be sensed — the walker says so. If it is still out, the next poll
 *  raises this again. */
export function SafetyKeyOverlay() {
  const dmk = useField('dmk');
  if (!dmk) return null;
  return (
    <Overlay
      title="Safety key removed"
      titleTone="alert"
      message="Insert the key to activate the treadmill"
      actions={<Button tone="primary" size="overlay" onTap={() => bridge().ackDmk()}>KEY IS BACK IN</Button>}
    />
  );
}
