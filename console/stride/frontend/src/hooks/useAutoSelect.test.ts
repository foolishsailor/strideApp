import { renderHook } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { useAutoSelect } from './useAutoSelect';

describe('useAutoSelect', () => {
  it('selects the first item when nothing is selected', () => {
    const select = vi.fn();
    renderHook(() => useAutoSelect(['a', 'b'], null, select));
    expect(select).toHaveBeenCalledWith('a');
  });

  it('leaves a selection that is still in the list alone', () => {
    const select = vi.fn();
    renderHook(() => useAutoSelect(['a', 'b'], 'b', select));
    expect(select).not.toHaveBeenCalled();
  });

  it('moves to the first item when the selected one has gone', () => {
    const select = vi.fn();
    renderHook(() => useAutoSelect(['a', 'b'], 'gone', select));
    expect(select).toHaveBeenCalledWith('a');
  });

  it('does nothing with an empty list', () => {
    const select = vi.fn();
    renderHook(() => useAutoSelect([], null, select));
    expect(select).not.toHaveBeenCalled();
  });
});
