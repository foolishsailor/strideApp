import styles from './Icon.module.css';

/* The run screen's dock glyphs. Drawn in currentColor, so a button's tone and
   state (and white over another app) colour them exactly as they coloured
   its words. Sized by font-size, 1em square, so a button's size sets them.
   Each carries its word as its accessible name. */

export type IconName = 'apps' | 'back' | 'pause' | 'play' | 'skip' | 'fan' | 'stop' | 'finish';

const GLYPHS: Record<IconName, React.ReactNode> = {
  // Four tiles: the apps on the console.
  apps: (
    <>
      <rect x="3" y="3" width="7.5" height="7.5" rx="1.5" />
      <rect x="13.5" y="3" width="7.5" height="7.5" rx="1.5" />
      <rect x="3" y="13.5" width="7.5" height="7.5" rx="1.5" />
      <rect x="13.5" y="13.5" width="7.5" height="7.5" rx="1.5" />
    </>
  ),
  // Back to STRIDE from over another app.
  back: <path d="M10.5 4.5 3 12l7.5 7.5 1.9-1.9-4.3-4.3H21v-2.6H8.1l4.3-4.3z" />,
  pause: (
    <>
      <rect x="5" y="3.5" width="5" height="17" rx="1.2" />
      <rect x="14" y="3.5" width="5" height="17" rx="1.2" />
    </>
  ),
  play: <path d="M6.5 3.6v16.8a1 1 0 0 0 1.5.86l13.3-8.4a1 1 0 0 0 0-1.72L8 2.74a1 1 0 0 0-1.5.86z" />,
  // On to what comes next: the next step, or past a warm-up or cool-down.
  skip: (
    <>
      <path d="M3.5 4.6v14.8a1 1 0 0 0 1.55.83L16 13.07V19.5a1 1 0 0 0 1 1h2.5a1 1 0 0 0 1-1v-15a1 1 0 0 0-1-1H17a1 1 0 0 0-1 1v6.43L5.05 3.77A1 1 0 0 0 3.5 4.6z" />
    </>
  ),
  // Three identical blades round a hub.
  fan: (
    <>
      <circle cx="12" cy="12" r="2" />
      {[0, 120, 240].map((a) => (
        <path key={a} transform={`rotate(${a} 12 12)`} d="M12 10.2C9.6 8.4 9.2 4.8 10.6 3.2c1.5-1.6 4.6-1 5 1.3.4 2.4-1.3 4.6-3.6 5.7z" />
      ))}
    </>
  ),
  stop: <rect x="4" y="4" width="16" height="16" rx="2" />,
  // The chequered flag: the end of the workout.
  finish: (
    <>
      <rect x="4" y="2.5" width="2" height="19" rx="1" />
      <path d="M7 3.5h13v10H7z" fillOpacity="0.35" />
      <path d="M7 3.5h3.25v2.5H7zm6.5 0h3.25v2.5H13.5zm-3.25 2.5h3.25v2.5h-3.25zm6.5 0H20v2.5h-3.25zM7 8.5h3.25V11H7zm6.5 0h3.25V11H13.5zm-3.25 2.5h3.25v2.5h-3.25zm6.5 0H20v2.5h-3.25z" />
    </>
  ),
};

export function Icon({ name, label }: { name: IconName; label: string }) {
  return (
    <svg className={styles.icon} viewBox="0 0 24 24" role="img" aria-label={label}>
      {GLYPHS[name]}
    </svg>
  );
}
