import { trailmate } from './themes/trailmate';
import type { Theme } from './types';

export { alpha } from './alpha';
export type { Theme } from './types';

/* Design tokens.

   Two kinds. The THEME (themes/trailmate.ts) is everything that makes the
   interface look like TrailMate: palette, fills, shape, type, chart, and
   the skin for Settings. The SCALE below is the layout — the console is
   1280x800 and every band on it is load-bearing — so it lives apart from the
   look, and a change of look cannot move a button.

   CSS reads everything as custom properties, installed on :root at boot;
   canvas and SVG code imports `colour` and `theme` directly. */

export const theme: Theme = trailmate;
export const colour = theme.colour;

/** Type sizes, px. Named by role, not size. */
export const fontSize = {
  caption: 12,
  label: 13,
  small: 15,
  body: 17,
  lead: 20,
  title: 26,
  metric: 42,
  display: 104,
  hero: 144,
} as const;

export const motion = { quick: '.15s', settle: '.32s' } as const;

/** z-order of the layers that sit over the screens. */
export const layer = { fanMenu: 30, overlay: 50, sleep: 80 } as const;

function kebab(s: string): string {
  return s.replace(/[A-Z0-9]+/g, (m) => '-' + m.toLowerCase());
}

const px = (v: number | string) => (typeof v === 'number' ? v + 'px' : v);

/** The theme and the scale as CSS custom properties:
 *  --colour-accent, --role-fill, --font-metric, --radius-control, … */
export function cssVariables(t: Theme = theme): string {
  const lines: string[] = [];
  const group = (prefix: string, obj: Record<string, string | number>, unit = true) => {
    for (const [k, v] of Object.entries(obj)) lines.push(`--${prefix}-${kebab(k)}:${unit ? px(v) : v}`);
  };
  group('colour', t.colour);
  group('role', t.role);
  group('workout', t.workout);
  group('font', { family: t.font.family, ...fontSize });
  group('weight', {
    numeral: t.font.weightNumeral,
    heading: t.font.weightHeading,
    label: t.font.weightLabel,
    body: t.font.weightBody,
  }, false);
  group('tracking', { label: t.font.trackingLabel, numeral: t.font.trackingNumeral });
  group('radius', t.radius);
  lines.push(`--edge-width:${t.edgeWidth}px`);
  for (const [k, v] of Object.entries(t.settings)) lines.push(`--sx-${k}:${v}`);
  group('motion', motion);
  group('layer', layer, false);
  return `:root{${lines.join(';')}}`;
}

export function applyTokens(doc: Document = document): void {
  const style = doc.createElement('style');
  style.setAttribute('data-theme', theme.id);
  style.textContent = cssVariables();
  doc.head.appendChild(style);
}
