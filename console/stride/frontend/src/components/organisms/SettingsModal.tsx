import { settings } from '../../bridge/stride';
import { useUi } from '../../store/ui';
import { Button, Modal } from '../primitives';
import styles from './SettingsModal.module.css';

/**
 * Settings, without leaving the run: the runner's own and the treadmill's.
 * Opened from the dock's cog (the run carries on) or the pause screen.
 * Settings opens over the run, and closing it comes back to the run as it was.
 */
export function SettingsModal() {
  const open = useUi((s) => s.settingsOpen);
  if (!open) return null;
  const close = () => useUi.getState().setSettingsOpen(false);
  const go = (which: 'me' | 'treadmill') => {
    close();
    settings().open(which);
  };
  return (
    <Modal label="Settings" onClose={close}>
      <div className={styles.choices}>
        <Button size="overlay" onTap={() => go('me')}>MY SETTINGS</Button>
        <Button size="overlay" onTap={() => go('treadmill')}>TREADMILL SETTINGS</Button>
      </div>
    </Modal>
  );
}
