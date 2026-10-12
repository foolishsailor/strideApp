import { core } from '../../bridge/stride';
import type { Track } from '../../bridge/types';
import { useField } from '../../store/session';
import { alpha, colour, theme } from '../../theme/tokens';
import { Label, Numeral } from '../primitives';
import styles from './Hero.module.css';

/* The 400 m track, for a casual run: what a run without a plan accumulates
   is laps.

   The canonical stadium — two 248px straights closed by r=158 semicircles,
   centred in the 732x404 hero, face-on. Everything the ring needs comes from
   the core's one track object, so the rail the dot runs on and the rail that is
   drawn cannot drift apart. Built on first use: the core is a classic script
   that has always run by then, but tests load it later than imports. */
let cached: Track | null = null;
const track = (): Track =>
  (cached ??= core().track({ straight: 248, radius: 158, cx: 366, cy: 202, squash: 1 }));

/** Four lanes inside the rail. A stadium offset inwards keeps its straights and
 *  loses radius, which is exactly what keeps lanes parallel round the bends. */
const LANE_INSETS = [20, 36, 52, 68];

function StaticTrack() {
  const t = track();
  const start = t.atFraction(0);
  return (
    <>
      <g fill="none" stroke={colour.trackLine} strokeWidth={2}>
        {LANE_INSETS.map((inset) => <path key={inset} d={t.pathD(inset)} />)}
      </g>
      {/* Start/finish, struck outwards along the rail's own normal. */}
      <line
        x1={start.x} y1={start.y} x2={start.x + start.nx * 15} y2={start.y + start.ny * 15}
        stroke={colour.inkDim} strokeWidth={2}
      />
    </>
  );
}

function LapProgress({ distance }: { distance: number }) {
  const t = track();
  const laps = t.laps(distance);
  const frac = t.lapFraction(distance);
  /* Not simply frac × 1000: stroke-dasharray measures the drawn path and the
     dot is placed by arc-length along the true stadium. dashFraction() maps
     between the two, so the bright arc always ends exactly under the dot. */
  const dash = t.dashFraction(frac);
  const head = t.atFraction(frac);
  const d = t.pathD(0);
  return (
    <>
      {/* The lap just finished, erased from behind by the new one, so the ring
          stays whole and the dot never waits for a redraw. Nothing to erase on
          the first lap. */}
      <path
        d={d} fill="none" stroke={alpha(colour.accent, 0.22)} strokeWidth={6} strokeLinecap="round" pathLength={1000}
        strokeDasharray={`${(1000 - dash).toFixed(1)} 1000`} strokeDashoffset={(-dash).toFixed(1)}
        opacity={laps > 0 ? 1 : 0}
      />
      {/* Below a hair of progress the round cap draws a stub that reads as a
          toggle switch, so the head is held back until the lap starts. */}
      <path
        d={d} fill="none" stroke="url(#prog)" strokeWidth={7} strokeLinecap="round" filter="url(#glow)"
        pathLength={1000} strokeDasharray={`${dash.toFixed(1)} 1000`} opacity={frac > 0.004 ? 1 : 0}
      />
      <circle
        cx={head.x.toFixed(1)} cy={head.y.toFixed(1)} r={9} fill={colour.ink} filter="url(#glow)"
        opacity={distance > 0 ? 1 : 0}
      />
    </>
  );
}

export function TrackHero() {
  const distance = useField('distance') ?? 0;
  const laps = track().laps(distance);
  return (
    <div className={styles.hero}>
      <svg viewBox="0 0 732 404" width={732} height={404}>
        <defs>
          <linearGradient id="prog" x1="0" y1="0" x2="1" y2="0">
            <stop offset="0%" stopColor={colour.good} />
            <stop offset="55%" stopColor={colour.accent} />
            <stop offset="100%" stopColor={colour.accentWarm} />
          </linearGradient>
          <filter id="glow" x="-50%" y="-50%" width="200%" height="200%">
            <feGaussianBlur stdDeviation={theme.glowBlur} result="b" />
            <feMerge><feMergeNode in="b" /><feMergeNode in="SourceGraphic" /></feMerge>
          </filter>
        </defs>
        <StaticTrack />
        <LapProgress distance={distance} />
      </svg>
      <div className={styles.lap}>
        <Numeral size="hero" glow>{laps}</Numeral>
        <Label tone="dim" className={styles.lapCaption}>laps · 400 m</Label>
      </div>
    </div>
  );
}
