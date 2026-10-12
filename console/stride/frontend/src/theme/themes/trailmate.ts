import { alpha } from '../alpha';
import type { Theme } from '../types';

/* The console's look: TrailMate, in its dark mode — the TrailMate app's own
   design tokens (shared/design in that repository) carried onto the console.

   Deep teal canvas, off-white ink, mountain green for interaction and copper
   for effort. Its language is flat and quiet: tone and elevation separate
   surfaces rather than outlines, one 8px radius for every rectangle, Roboto at
   medium and semibold weights, tabular figures tracked slightly in, and no
   neon glow anywhere.

   Source values (dark mode):
     canvas #001E20 · surface #08373A · ink #F9F8E6 / #C5D8CF / #85A29E
     primary #6DA491 · secondary #CD8B65 · success #4EAE7F · error #DA827B
     hairline = ink at 20 % · raised shadow 0 8px 18px deep(#002C2F) at 50 %
   Where a value is not in that set, it is derived from one that is. */

const deep = '#002C2F'; // BRAND_SEEDS.deep — shadows are cast in it
const surface = '#08373A'; // SURFACES.surfaceDark
const c = {
  bg0: '#001E20', // SURFACES.canvasDark
  bg1: surface,
  ink: '#F9F8E6', // BRAND_SEEDS.offWhite
  inkDim: '#C5D8CF', // textDarkSecondary
  inkFaint: '#85A29E', // textDarkDisabled — still clears 4.5:1 on the canvas
  accent: '#6DA491', // primary: BRAND_SEEDS.mountain
  accentWarm: '#CD8B65', // secondary: copper
  good: '#4EAE7F', // success
  alert: '#DA827B', // error
  trackLine: '#324A48', // the hairline (ink at 20 %) made solid over the canvas
};

export const trailmate: Theme = {
  id: 'trailmate',
  colour: c,
  role: {
    fill: surface,
    fillCard: surface,
    fillQuiet: alpha(surface, 0.5),
    fillFloating: alpha(surface, 0.98),
    fillFloatingDown: '#0C4448',
    pressed: alpha(c.accent, 0.24),
    pressedCard: alpha(c.accent, 0.2), // TINT.overlay
    selected: alpha(c.accent, 0.2), // TINT.fill — the tonal container
    active: alpha(c.good, 0.2),
    edge: alpha(c.ink, 0.2), // surfaces.hairline
    edgeQuiet: alpha(c.ink, 0.1),
    edgeFloating: alpha(c.ink, 0.2),
    scrim: alpha(c.bg0, 0.97),
    pulse: alpha(c.accent, 0.5),
    glow: 'transparent',
    backdropInner: alpha('#0B4A4C', 0.7),
    backdropMid: alpha(surface, 0.3),
    shadowRaised: `0 8px 18px ${alpha(deep, 0.5)}`,
    shadowFloating: `0 16px 32px ${alpha(deep, 0.62)}, 0 4px 10px ${alpha(deep, 0.4)}`,
    /* Over a film: a translucent black panel under the drawers, so the walk
       reads against any scene and the film still shows through. */
    fillOverApp: alpha('#000000', 0.55),
    /* Over a film every word is white: tone colours that read on the teal
       canvas get lost against a picture. */
    inkOverApp: '#FFFFFF',
    /* Over a film there is no canvas behind the text, so it carries its own:
       a tight edge for the strokes and a wide halo for a bright scene. */
    shadowOverApp: `0 1px 3px ${alpha(deep, 0.95)}, 0 0 16px ${alpha(deep, 0.85)}`,
    sleepBg: '#000',
    sleepClock: '#0E3134',
    sleepHint: '#0A2628',
  },
  font: {
    // Roboto is the system face on Android, so nothing has to ship.
    family: '"Roboto", "Helvetica", "Arial", sans-serif',
    weightNumeral: 500,
    weightHeading: 600,
    weightLabel: 500,
    weightBody: 400,
    trackingLabel: '0.08em',
    trackingNumeral: '-0.01em',
  },
  radius: { control: 8, chip: 8, card: 8, choice: 8, floating: 8 },
  edgeWidth: 1,
  settings: {
    bg: c.bg0,
    'bg-rgb': '0,30,32',
    ink: c.ink,
    'ink-dim': c.inkDim,
    'ink-faint': c.inkFaint,
    accent: c.accent,
    'accent-rgb': '109,164,145',
    line: c.trackLine,
    'line-rgb': '50,74,72',
    'surface-rgb': '8,55,58',
    alert: c.alert,
    'alert-rgb': '218,130,123',
    'alert-ink': '#E5A8A3', // error.light
    good: c.good,
    'good-rgb': '78,174,127',
    warm: c.accentWarm,
    'warm-rgb': '205,139,101',
    'kb-bg': '#062F31',
    'backdrop-inner': alpha('#0B4A4C', 0.7),
    'backdrop-mid': alpha(surface, 0.3),
    glow: 'none',
    font: '"Roboto", "Helvetica", "Arial", sans-serif',
    'w-light': '500',
    'w-body': '400',
    radius: '8px',
    tracking: '0.08em',
    edge: '1px',
  },
  glowBlur: 0,
  scenery: {
    ridgeFar: { dark: '#02292B', light: '#053336' },
    ridgeNear: { dark: '#063A3C', light: '#0A4547', cap: '#0F5250' },
    pine: alpha('#0B4A47', 0.7),
    soil: [alpha('#0A4A46', 0.92), alpha('#073B3A', 0.62), alpha('#042D2E', 0)],
    groundEdge: alpha(c.accent, 0.34),
    contactShadow: alpha(deep, 0.7),
  },
};
