/* Design tokens — the single source of the Original palette and scale.

   CSS reads them as custom properties (installed on :root by applyTokens at
   boot); canvas and SVG code import them directly. One table, so the path's
   glow and a button's border can never drift to two different cyans. */

export const colour = {
  bg0: '#050b1f', // deepest navy
  bg1: '#0a1533',
  surface: '#16255a', // card and button fill, used translucent
  ink: '#eaf0ff',
  inkDim: '#7f92c4',
  inkFaint: '#44548a',
  accent: '#39e0ff', // primary cyan
  accentWarm: '#ff9d3c', // progress / effort
  good: '#5dff9b',
  alert: '#ff5c7a',
  trackLine: '#1e3068',
} as const;

/** Type scale, px. Named by role, not size, so a component asks for what it is. */
export const font = {
  family: '"Helvetica Neue", Arial, sans-serif',
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

export const radius = { sm: 16, md: 22, lg: 30, xl: 38, pill: 999 } as const;

export const motion = { quick: '.15s', settle: '.32s' } as const;

/** z-order of the layers that sit over the screens. */
export const layer = { fanMenu: 30, coach: 40, overlay: 50, sleep: 80 } as const;

/** `#rrggbb` at an alpha, for the many translucent fills. */
export function alpha(hex: string, a: number): string {
  const n = parseInt(hex.slice(1), 16);
  return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${a})`;
}

function kebab(s: string): string {
  return s.replace(/[A-Z0-9]+/g, (m) => '-' + m.toLowerCase());
}

/** The tokens as CSS custom properties: --colour-accent, --font-metric, … */
export function cssVariables(): string {
  const lines: string[] = [];
  for (const [k, v] of Object.entries(colour)) lines.push(`--colour-${kebab(k)}:${v}`);
  for (const [k, v] of Object.entries(font)) lines.push(`--font-${kebab(k)}:${typeof v === 'number' ? v + 'px' : v}`);
  for (const [k, v] of Object.entries(radius)) lines.push(`--radius-${k}:${v}px`);
  for (const [k, v] of Object.entries(motion)) lines.push(`--motion-${k}:${v}`);
  for (const [k, v] of Object.entries(layer)) lines.push(`--layer-${kebab(k)}:${v}`);
  return `:root{${lines.join(';')}}`;
}

export function applyTokens(doc: Document = document): void {
  const style = doc.createElement('style');
  style.setAttribute('data-tokens', '');
  style.textContent = cssVariables();
  doc.head.appendChild(style);
}
