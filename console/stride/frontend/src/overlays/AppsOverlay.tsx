import { useMemo } from 'react';
import { bridge } from '../bridge/stride';
import type { AppEntry } from '../bridge/types';
import { useUi } from '../store/ui';
import { Button, Label, Overlay, PressableCard } from '../components/primitives';
import styles from './AppsOverlay.module.css';

function installedApps(): AppEntry[] {
  try {
    return JSON.parse(bridge().apps?.() || '[]') as AppEntry[];
  } catch {
    return [];
  }
}

/** APPS: the console's other apps, Netflix first. Choosing one opens it with
 *  the run drawn over it (OverApp.kt). The belt carries on as it was. */
export function AppsOverlay() {
  const open = useUi((s) => s.appsOpen);
  if (!open) return null;
  return <Picker />;
}

function Picker() {
  /* Asked once per opening. Kotlin builds the list (and its icons) once and
     keeps it, so a second opening is instant. */
  const apps = useMemo(installedApps, []);
  const close = () => useUi.getState().setAppsOpen(false);
  return (
    <Overlay
      title="Watch something"
      message="Your numbers and controls stay on top. The belt carries on as it is."
      actions={<Button size="overlay" onTap={close}>CLOSE</Button>}
    >
      <div className={styles.grid}>
        {apps.length === 0 && <Label className={styles.none}>No other apps on this console</Label>}
        {apps.map((a) => (
          <PressableCard key={a.pkg} className={styles.app} onTap={() => { close(); bridge().openApp?.(a.pkg); }}>
            {a.icon ? <img className={styles.icon} src={a.icon} alt="" /> : <div className={styles.icon} />}
            <div className={styles.name}>{a.name}</div>
          </PressableCard>
        ))}
      </div>
    </Overlay>
  );
}
