import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { WorkoutCard } from '../molecules';
import { fit, Label } from './Text';

/* One way to shorten text everywhere: fit(), or the lines prop. */
describe('fitting text to its box', () => {
  it('gives one line or two', () => {
    expect(fit(1)).toMatch(/line1/);
    expect(fit(2)).toMatch(/line2/);
    render(<Label lines={1}>A long name</Label>);
    expect(screen.getByText('A long name').className).toMatch(/line1/);
  });

  it('fits a workout card’s name: one line in a week row, two otherwise', () => {
    const name = 'Wk 32 - Thu - Wk 32 - Thu - Threshold 2x15min at marathon effort';
    const w = { id: 'w', date: '2026-10-22', name, type: 'threshold', runnable: true, steps: [] } as never;
    const { rerender } = render(<WorkoutCard workout={w} compact />);
    expect(screen.getByText(name).className).toMatch(/line1/);
    rerender(<WorkoutCard workout={w} />);
    expect(screen.getByText(name).className).toMatch(/line2/);
  });
});
