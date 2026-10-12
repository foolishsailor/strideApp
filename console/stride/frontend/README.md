# STRIDE interface: source

The console's interface is written here in React and TypeScript, in the
TrailMate app's design (teal, mountain green and copper). It builds into one
self-contained file, `app/src/main/assets/ui/trailmate.html`. Kotlin loads it
(`MainActivity.UI_URL`) and talks to it through the `Stride` bridge and the
`window.render` / `window.plan` / `window.coach` calls.

The built file is committed, so building the APK doesn't need Node. If you
change anything here, run `npm run build` and commit the source and the
rebuilt file.

Settings (`stride-settings.js`) and the core (`stride-core.js`) are
hand-written scripts beside it. Settings and the core's wake prompt take the
theme through `--sx-*` CSS variables (`theme.settings`); a test fails if they
read one the theme does not define.

## Commands

```sh
npm install
npm run dev      # Vite dev server with hot reload: /trailmate.html
npm run build    # typecheck, build into assets/ui, then check-compat
npm test           # Vitest, once
npm run typecheck
```

In the browser, the core stubs the bridge, so the page runs without a
treadmill. Add `?screen=live-guided` (or `welcome`, `warmup`, `live-casual`,
`paused`, `cooldown`, `summary`) to drive it with the core's 5 Hz demo. The
number keys switch screens, `&coach=1` brings up a coach line and `&dmk=1`
pulls the safety key.

## Constraints

- **Chromium 83.** Gen 6 consoles run the WebView from 2020. Vite lowers
  syntax to `chrome83`, but it can't add missing APIs or rewrite CSS that has
  no older equivalent. `scripts/check-compat.mjs` fails the build on the known
  gaps, including `inset`, flexbox `gap`, `:is()`, `.at()` and `replaceAll`.
  Use explicit edges and margins (`Row` spaces its children with margins for
  this reason).
- **One file, no network.** `vite-plugin-singlefile` inlines all the JS and
  CSS. The two shared scripts stay as sibling classic `<script>` tags.
- **Touch goes through the core.** Never use React's `onClick`. Use
  `useTap` / `useStepper` (or `Button`'s `onTap` / `onStep`). They call
  `STRIDE.tap` / `STRIDE.stepper`, which fire on touchstart, ignore the tap
  that woke the screen, and accelerate on a hold.
- **5 Hz updates.** Kotlin pushes a snapshot five times a second. Components
  read single fields through `useField('speed')` so only the numbers that
  changed re-render. The path ahead is drawn on a canvas, not built as DOM.

## Layout

```
trailmate.html           template; the build writes assets/ui/trailmate.html
scripts/check-compat.mjs Chromium 83 gate, run after every build
src/
  main.tsx               boot: stub the bridge, install the Kotlin entry points, mount
  App.tsx                picks the screen from the session mode; stacks the overlays
  bridge/                the contract with Kotlin and stride-core (types, accessors, entry points)
  store/                 Zustand: session (from Kotlin), ui (menus, sleep), welcome (choices)
  lib/                   pure logic: session rules, plans, formatting, path geometry and scene
  theme/                 types.ts, themes/trailmate.ts, tokens.ts (scale, CSS variables), global.css
  hooks/                 useTap/useStepper, useClock, useIdleSleep
  components/
    primitives/          Button, PressableCard, Text (Label, Numeral, Heading, Prose), Layout, Overlay
    molecules/           Metric, StatCard, ValueRail, RailReading, ChoiceCard, PlanCard, Sparkline, TopBar, StatusChip
    organisms/           Hero (Track/Path/Phase), Rails, MetricStrip, ControlBar, FanMenu, CoachRibbon
  screens/               welcome (Who/How/Plan steps), workout, summary
  overlays/              paused, safety key, sleep
```

**Theming:** the look is data, `theme/themes/trailmate.ts`, of the shape in
`theme/types.ts`: palette, fills by role, type weights and tracking, radii,
edge width, the path-ahead scenery, and the Settings skin. Type sizes, motion
and layers live apart from it in `theme/tokens.ts`, because they are the
layout. At boot the theme is installed as CSS custom properties
(`--colour-accent`, `--role-fill`, `--radius-control`, …) that the CSS modules
read; canvas and SVG code imports the same values. No stylesheet carries a
colour of its own, and a test fails if any stylesheet reads a variable the
theme does not define.

The values come from the TrailMate app's design tokens (`shared/design` in
the TrailMate repository); where it has no equivalent (the scenery, the sleep
screen) they are derived from its palette. `themes/trailmate.ts` says which
is which.

**Tests** load the real `stride-core.js`, so the track maths, formatters and
touch handling under test are the ones the console runs.

## The walk screen

The active treadmill screen (`screens/workout`) docks everything to the
edges. A full-width bar along the top holds incline at its left end, speed at
its right and the walk's numbers between them in two rows: elapsed, distance,
pace, heart rate, cadence and power large; calories, climb, stride and pod
speed smaller, either side of the status. Cadence, power, stride and pod
speed come from a foot pod (Footpod.kt; Settings → Foot pod) and show a dash
without one; `tools/sim.py pod on` fakes one on the emulator. The incline and speed rails
run down the sides from the bottom of that bar: a fixed + and −, with a
scrolling list of stops between them. Start, fan and stop are docked along
the bottom. The hero sits in the middle.

**Its controls are text only.** No fill, no edge, no shadow: just large text
on the backdrop, with tone and state shown only in the text's colour. The
whole box is still the touch target. Use `Button size="rail"` or
`size="dock"`, which are always bare (`.bare` in `Button.module.css`), or
style a new control the same way. Don't put boxed buttons on this screen.
The welcome and summary screens and the overlays keep their boxed buttons.
