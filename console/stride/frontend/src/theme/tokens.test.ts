import { describe, expect, it } from 'vitest';
import { alpha, cssVariables } from './tokens';

describe('tokens', () => {
  it('names CSS variables the way the stylesheets read them', () => {
    const css = cssVariables();
    for (const v of ['--colour-bg-0:#050b1f', '--colour-ink-dim:', '--colour-accent-warm:', '--colour-track-line:',
      '--font-metric:42px', '--radius-lg:30px', '--layer-fan-menu:30']) {
      expect(css).toContain(v);
    }
  });

  it('turns a hex colour into rgba', () => {
    expect(alpha('#39e0ff', 0.5)).toBe('rgba(57,224,255,0.5)');
  });
});
