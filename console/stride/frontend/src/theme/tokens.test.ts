import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { alpha, cssVariables, theme } from './tokens';

/** Every stylesheet under src/. */
function stylesheets(dir = resolve(process.cwd(), 'src')): string[] {
  return readdirSync(dir).flatMap((f) => {
    const p = join(dir, f);
    if (statSync(p).isDirectory()) return stylesheets(p);
    return p.endsWith('.css') ? [p] : [];
  });
}

/** Set inline by a component, not by the theme. */
const LOCAL = new Set(['--row-half']);

/** The shared scripts in assets/ui, which take the theme as --sx-* variables. */
const SHARED = ['stride-settings.js', 'stride-core.js'].map((f) =>
  readFileSync(resolve(process.cwd(), '../app/src/main/assets/ui', f), 'utf8'));

describe('the theme', () => {
  const css = cssVariables(theme);

  it('defines every variable a stylesheet reads', () => {
    const missing: string[] = [];
    for (const file of stylesheets()) {
      for (const [, name] of readFileSync(file, 'utf8').matchAll(/var\((--[a-z0-9-]+)/g)) {
        if (!LOCAL.has(name!) && !css.includes(`${name}:`)) missing.push(`${name} (${file.split(/[\\/]src[\\/]/)[1]})`);
      }
    }
    expect(missing).toEqual([]);
  });

  it('defines every --sx-* variable Settings and the core read', () => {
    const missing = new Set<string>();
    for (const src of SHARED) {
      for (const [, name] of src.matchAll(/var\((--sx-[a-z0-9-]+)/g)) if (!css.includes(`${name}:`)) missing.add(name!);
    }
    expect([...missing]).toEqual([]);
  });

  it('uses solid colours for the base palette, since canvas reads them', () => {
    for (const v of Object.values(theme.colour)) expect(v).toMatch(/^#[0-9a-fA-F]{6}$/);
  });

  it('carries the TrailMate brand', () => {
    for (const v of ['--colour-bg-0:#001E20', '--colour-accent:#6DA491', '--radius-control:8px',
      '--font-metric:42px', '--layer-fan-menu:30', '--edge-width:1px', '--sx-accent-rgb:109,164,145']) {
      expect(css).toContain(v);
    }
    expect(css).toContain('Roboto');
  });

  it('turns a hex colour into rgba', () => {
    expect(alpha('#39e0ff', 0.5)).toBe('rgba(57,224,255,0.5)');
  });
});
