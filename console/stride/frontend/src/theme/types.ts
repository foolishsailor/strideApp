export type SettingsVar =
  | 'bg' | 'bg-rgb' | 'ink' | 'ink-dim' | 'ink-faint'
  | 'accent' | 'accent-rgb' | 'line' | 'line-rgb' | 'surface-rgb'
  | 'alert' | 'alert-rgb' | 'alert-ink' | 'good' | 'good-rgb' | 'warm' | 'warm-rgb'
  | 'kb-bg' | 'backdrop-inner' | 'backdrop-mid' | 'glow'
  | 'font' | 'w-light' | 'w-body' | 'radius' | 'tracking' | 'edge';

/* The shape of a theme. Every value a component or a canvas paints with is
   one of these — no stylesheet or drawing routine carries its own colour, so a
   theme is complete by construction: miss a field and it does not compile. */

export interface Theme {
  id: 'trailmate';

  /** Base palette. Solid colours, safe for canvas and SVG. */
  colour: {
    bg0: string; // the canvas
    bg1: string; // a step up from it
    ink: string;
    inkDim: string;
    inkFaint: string;
    accent: string; // the primary interactive colour
    accentWarm: string; // effort and progress
    good: string; // running, done
    alert: string; // stop, safety key
    trackLine: string; // rails, ticks, idle edges
  };

  /** Colours by job. Mostly translucent mixes of the palette above. */
  role: {
    fill: string; // a button at rest
    fillCard: string; // a card or tile at rest
    fillQuiet: string; // the deliberately quiet SETTINGS button
    fillFloating: string; // the fan menu
    pressed: string; // a button under a finger
    pressedCard: string; // a card under a finger
    selected: string; // the chosen one of a set
    active: string; // the thing happening now
    edge: string; // the line where a surface ends
    edgeQuiet: string;
    scrim: string; // behind an overlay's question
    pulse: string; // the ring that acknowledges a press
    glow: string; // behind big numerals; transparent for none
    backdropInner: string; // the radial lift behind the hero
    backdropMid: string;
    shadowRaised: string; // box-shadow for cards and buttons
    shadowFloating: string; // box-shadow for the fan menu
    fillOverApp: string; // the translucent panel under the drawers over another app
    inkOverApp: string; // every word over another app: one colour, white
    shadowOverApp: string; // text-shadow that keeps the run readable over another app
    sleepBg: string;
    sleepClock: string;
    sleepHint: string;
  };

  font: {
    family: string;
    /** Big numerals: speed, the lap counter, the countdown. */
    weightNumeral: number;
    /** Headlines: "Good morning", "Workout paused". */
    weightHeading: number;
    weightLabel: number;
    weightBody: number;
    /** Uppercase labels. Original tracks them wide; TrailMate barely. */
    trackingLabel: string;
    trackingNumeral: string;
  };

  /** Corner radii by role, px. */
  radius: {
    control: number; // buttons
    chip: number; // duration chips, the status pill
    card: number; // tiles and plan cards
    choice: number; // the big welcome choices
    floating: number; // the fan menu
  };

  /** Border width of every edged surface, px. */
  edgeWidth: number;
  /** SVG glow on the track, px of blur. 0 for flat. */
  glowBlur: number;

  /**
   * The shared Settings screen (stride-settings.js) and the core's wake
   * prompt, as `--sx-*` variables — they are hand-written scripts outside this
   * project, so they take the theme through CSS rather than an import.
   * `*-rgb` entries are bare "r,g,b" triplets, which is how a translucent fill
   * takes a theme colour without color-mix (Chromium 111).
   */
  settings: Record<SettingsVar, string>;

  /** The path ahead's backdrop, drawn on canvas. */
  scenery: {
    ridgeFar: { dark: string; light: string };
    ridgeNear: { dark: string; light: string; cap: string };
    pine: string;
    soil: [string, string, string]; // near, middle, far
    groundEdge: string;
    contactShadow: string;
  };
}
