import styles from './Icon.module.css';

/* The console's glyphs: the run screen's dock, the side rail. Drawn in
   currentColor, so a button's tone and state (and white over another app)
   colour them exactly as they coloured its words. Sized by font-size, 1em
   square, so a button's size sets them. Each carries its word as its
   accessible name. The rail's are Material's (Apache 2.0), as TrailMate's
   own sidebar uses. */

export type IconName =
  | 'apps' | 'back' | 'pause' | 'play' | 'skip' | 'fan' | 'stop' | 'finish' | 'auto' | 'manual'
  | 'home' | 'run' | 'history' | 'settings' | 'chevronLeft';

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
  // The workout is setting the speed: two arrows chasing round.
  auto: (
    <path d="M12 6v3l4-4-4-4v3c-4.42 0-8 3.58-8 8 0 1.57.46 3.03 1.24 4.26L6.7 14.8A5.9 5.9 0 0 1 6 12c0-3.31 2.69-6 6-6zm6.76 1.74L17.3 9.2c.44.84.7 1.79.7 2.8 0 3.31-2.69 6-6 6v-3l-4 4 4 4v-3c4.42 0 8-3.58 8-8 0-1.57-.46-3.03-1.24-4.26z" />
  ),
  // The runner has the speed: an open hand.
  manual: (
    <path d="M21.5 5.5V18c0 2.2-1.8 4-4 4h-6.3c-1.08 0-2.1-.43-2.85-1.19L2.5 14.9l1.3-1.25c.4-.36 1-.4 1.42-.1L8.5 15.5V4a1.5 1.5 0 0 1 3 0v7h1V2.5a1.5 1.5 0 0 1 3 0V11h1V3.5a1.5 1.5 0 0 1 3 0V11h1V5.5a1.5 1.5 0 0 1 3 0z" />
  ),
  // The side rail: Home, Run, History, Settings, and the chevron that folds it.
  home: <path d="M10 20v-6h4v6h5v-8h3L12 3 2 12h3v8z" />,
  run: <path d="M13.49 5.48c1.1 0 2-.9 2-2s-.9-2-2-2-2 .9-2 2 .9 2 2 2zm-3.6 13.9 1-4.4 2.1 2v6h2v-7.5l-2.1-2 .6-3c1.3 1.5 3.3 2.5 5.5 2.5v-2c-1.9 0-3.5-1-4.3-2.4l-1-1.6c-.4-.6-1-1-1.7-1-.3 0-.5.1-.8.1l-5.2 2.2v4.7h2v-3.4l1.8-.7-1.6 8.1-4.9-1-.4 2 7 1.4z" />,
  history: <path d="M13 3a9 9 0 0 0-9 9H1l3.89 3.89.07.14L9 12H6c0-3.87 3.13-7 7-7s7 3.13 7 7-3.13 7-7 7c-1.93 0-3.68-.79-4.94-2.06l-1.42 1.42A8.95 8.95 0 0 0 13 21a9 9 0 0 0 0-18zm-1 5v5l4.28 2.54.72-1.21-3.5-2.08V8H12z" />,
  settings: <path d="M19.14 12.94c.04-.3.06-.61.06-.94 0-.32-.02-.64-.07-.94l2.03-1.58a.49.49 0 0 0 .12-.61l-1.92-3.32a.49.49 0 0 0-.59-.22l-2.39.96c-.5-.38-1.03-.7-1.62-.94l-.36-2.54a.48.48 0 0 0-.48-.41h-3.84c-.24 0-.43.17-.47.41l-.36 2.54c-.59.24-1.13.57-1.62.94l-2.39-.96c-.22-.08-.47 0-.59.22L2.74 8.87c-.12.21-.08.47.12.61l2.03 1.58c-.05.3-.09.63-.09.94s.02.64.07.94l-2.03 1.58a.49.49 0 0 0-.12.61l1.92 3.32c.12.22.37.29.59.22l2.39-.96c.5.38 1.03.7 1.62.94l.36 2.54c.05.24.24.41.48.41h3.84c.24 0 .44-.17.47-.41l.36-2.54c.59-.24 1.13-.56 1.62-.94l2.39.96c.22.08.47 0 .59-.22l1.92-3.32c.12-.22.07-.47-.12-.61l-2.01-1.58zM12 15.6c-1.98 0-3.6-1.62-3.6-3.6s1.62-3.6 3.6-3.6 3.6 1.62 3.6 3.6-1.62 3.6-3.6 3.6z" />,
  chevronLeft: <path d="M15.41 7.41 14 6l-6 6 6 6 1.41-1.41L10.83 12z" />,
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
