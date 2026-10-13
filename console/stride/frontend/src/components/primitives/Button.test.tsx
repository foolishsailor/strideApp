import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { Button } from './Button';
import { PressableCard } from './Pressable';

/* Every press is acknowledged by the component itself, not by each caller. */
describe('the press ring', () => {
  it('goes round a button when tapped, before its handler runs', () => {
    const onTap = vi.fn(() => expect(screen.getByText('GO').getAttribute('data-ack')).toBe('ring'));
    render(<Button size="dock" onTap={onTap}>GO</Button>);
    fireEvent.click(screen.getByText('GO'));
    expect(onTap).toHaveBeenCalled();
  });

  it('goes round a stepper too', () => {
    const onStep = vi.fn();
    render(<Button size="rail" onStep={onStep} fine={1} coarse={5}>+</Button>);
    fireEvent.mouseDown(screen.getByText('+'));
    fireEvent.mouseUp(screen.getByText('+'));
    expect(onStep).toHaveBeenCalled();
    expect(screen.getByText('+').getAttribute('data-ack')).toBe('ring');
  });

  it("survives the button's own classes changing, as PAUSE does when it turns active", () => {
    const { rerender } = render(<Button size="dock" onTap={() => {}}>GO</Button>);
    fireEvent.click(screen.getByText('GO'));
    rerender(<Button size="dock" active onTap={() => {}}>GO</Button>);
    expect(screen.getByText('GO').getAttribute('data-ack')).toBe('ring');
  });

  it('goes round a card', () => {
    render(<PressableCard onTap={() => {}}>Sam</PressableCard>);
    fireEvent.click(screen.getByText('Sam'));
    expect(screen.getByText('Sam').getAttribute('data-ack')).toBe('ring');
  });
});
