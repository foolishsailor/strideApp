import { createRoot } from 'react-dom/client';
import { App } from './App';
import { core } from './bridge/stride';
import { installKotlinEntryPoints, installModeWatcher, onModeChange } from './bridge/kotlin';
import { useSession } from './store/session';
import { loadSettings } from './store/settings';
import { useUi } from './store/ui';
import { initWelcome } from './store/welcome';
import { applyTokens } from './theme/tokens';
import './theme/global.css';

/* `Stride` is Kotlin's @JavascriptInterface. In a desktop browser the core
   stubs it, so this page can be designed without a treadmill. Add
   ?screen=live-workout (or warmup, paused, summary, …) to drive it with the
   core's 5 Hz demo instead of sitting on the welcome screen. */
const standalone = core().stub();

applyTokens();
loadSettings();
initWelcome();
installKotlinEntryPoints();
installModeWatcher();
onModeChange(useSession.getState().mode);

/* Somebody may have just added themselves; the picker must not show a name
   Settings does not have. */
document.addEventListener('stride-settings-closed', () => {
  useUi.getState().peopleChanged();
  /* And km or miles take effect the moment Settings is put away. */
  loadSettings();
});

createRoot(document.getElementById('root')!).render(<App />);

if (standalone && /[?&]screen=/.test(location.search)) core().demo();
