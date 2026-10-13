import { useEffect } from 'react';

/** A list beside a detail view never leaves the detail empty: when nothing
 *  usable is selected (on arrival, or because the selected item has gone
 *  from the list), the first item that can be chosen is selected.
 *
 *  @param ids       the list's ids in display order, choosable ones only
 *  @param selected  the current selection, or null
 *  @param select    how to select one */
export function useAutoSelect(ids: readonly string[], selected: string | null | undefined, select: (id: string) => void): void {
  const first = ids[0];
  const missing = !selected || !ids.includes(selected);
  useEffect(() => {
    if (missing && first !== undefined) select(first);
  }, [missing, first, select]);
}
