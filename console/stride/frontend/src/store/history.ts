import { create } from 'zustand';
import type { SessionMode, SessionState } from '../bridge/types';
import { RunHistory, sampleOf, type Sample } from '../lib/chart/history';

/* The run so far, for the live chart. Fed by every snapshot (store/session),
   but it changes only once a second of moving time, and `version` is what
   tells React it has. The samples themselves live outside React: copying a
   half-hour array every second to keep it immutable would buy nothing. */

const history = new RunHistory();

export const useHistory = create<{ version: number }>()(() => ({ version: 0 }));

export const historySamples = (): readonly Sample[] => history.samples;

export function record(s: SessionState, mode: SessionMode): void {
  if (mode === 'welcome') {
    if (history.samples.length) {
      history.clear();
      useHistory.setState((h) => ({ version: h.version + 1 }));
    }
    return;
  }
  /* Only while the belt is in a run: a summary's frozen snapshot is the run
     that just ended, already recorded. */
  if (mode === 'summary') return;
  const sample = sampleOf(s);
  if (sample && history.add(sample)) useHistory.setState((h) => ({ version: h.version + 1 }));
}
