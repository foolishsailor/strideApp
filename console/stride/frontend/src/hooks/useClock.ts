import { useSyncExternalStore } from 'react';

/* One wall-clock tick for the whole page. Several places show the time (two
   top bars, the greeting, the sleep screen); they share this rather than each
   running its own interval. Minute resolution is all anything shows, so only
   a change of minute notifies. */

let now = new Date();
const listeners = new Set<() => void>();
let timer: ReturnType<typeof setInterval> | null = null;

function subscribe(fn: () => void) {
  listeners.add(fn);
  if (!timer) {
    now = new Date(); // may have gone stale while nothing was listening
    timer = setInterval(() => {
      const d = new Date();
      if (d.getMinutes() !== now.getMinutes() || d.getHours() !== now.getHours() || d.getDate() !== now.getDate()) {
        now = d;
        listeners.forEach((l) => l());
      }
    }, 1000);
  }
  return () => {
    listeners.delete(fn);
    if (!listeners.size && timer) {
      clearInterval(timer);
      timer = null;
    }
  };
}

export const useNow = (): Date => useSyncExternalStore(subscribe, () => now);

export const timeOf = (d: Date): string => d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
export const dateOf = (d: Date): string => d.toLocaleDateString([], { weekday: 'long', day: 'numeric', month: 'long' });
