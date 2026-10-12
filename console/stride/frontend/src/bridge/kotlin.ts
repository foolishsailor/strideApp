import { useSession } from '../store/session';
import { markActivity, useUi } from '../store/ui';
import { useWelcome } from '../store/welcome';
import { screenFor } from '../lib/session';
import type { SessionMode } from './types';
import { settings } from './stride';

/* The three functions Kotlin calls into this page (MainActivity
   evaluateJavascript). They only write to the store; React draws from there. */
export function installKotlinEntryPoints(): void {
  window.render = (s) => useSession.getState().render(s);
  window.plan = (p) => useSession.getState().setPlan(p);
  /* Kotlin calls this when a line arrives from Home Assistant. The audio plays
     on the Kotlin side: this WebView is a 2020 Chromium behind file://, and the
     platform media stack is what can be relied on to make a sound. */
  window.coach = (c) => useSession.getState().sayCoach(c);
  /* Kotlin calls this when the page moves over another app and when it
     comes home (OverApp.kt). */
  window.overApp = (on) => setOverApp(!!on);

  /* Calls that arrived before this module ran (see trailmate.html). Plan
     first, so the first snapshot already has its ground. An early coach line
     is dropped: it was said before there was a screen to say it on. */
  const early = window.__early;
  delete window.__early;
  if (early?.plan) window.plan(early.plan);
  if (early?.render) window.render(early.render);
}

/** Over another app the page drops its backdrop, so the app shows through
 *  (global.css). The pickers close: they belong to the screen just left. */
function setOverApp(on: boolean): void {
  const ui = useUi.getState();
  ui.setOverApp(on);
  ui.setAppsOpen(false);
  ui.setFanOpen(false);
  document.documentElement.classList.toggle('over-app', on);
  markActivity();
}

/** Housekeeping on every change of session mode — what the old showScreen()
 *  did besides swapping screens. */
export function onModeChange(mode: SessionMode): void {
  const ui = useUi.getState();
  if (mode === 'welcome' || mode === 'summary') {
    ui.setFanOpen(false);
    ui.setAppsOpen(false);
  }
  /* The ribbon belongs to the walk. A line still up when the belt stopped used
     to stay up over the summary's cards, where nothing had made room for it. */
  if (screenFor(mode) !== 'workout') useSession.getState().hideCoach();
  if (mode !== 'paused') ui.setConfirmOpen(false);
  if (mode !== 'welcome') settings().close();
  if (mode === 'welcome') useWelcome.getState().goTo(1);
  /* Changing screen counts as activity. Without this, finishing a workout
     dropped onto the summary with half an hour of "idle" banked, and the panel
     slept before the summary could be read. */
  markActivity();
}

export function installModeWatcher(): () => void {
  return useSession.subscribe((st, prev) => {
    if (st.mode !== prev.mode) onModeChange(st.mode);
  });
}
