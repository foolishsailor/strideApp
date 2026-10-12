# STRIDE "Original": source

The **Original** interface is written here in React and TypeScript. It's built
into a single file, `app/src/main/assets/ui/original.html`, which is the file
the console loads. Nothing on the Android side knows this project exists:
Kotlin still loads `ui/original.html` by name and talks to it through the same
`Stride` bridge and `window.render` / `window.plan` / `window.coach` calls.

The built file is committed, so building the APK doesn't need Node. If you
change anything here, run `npm run build` and commit both the source and the
rebuilt `original.html`.

The other four interfaces (Ember, Cluster, Daylight, Pacer) are still
hand-written HTML. They share `stride-core.js` and `stride-settings.js` with
this one.

## Commands

```sh
npm install
npm run dev        # Vite dev server with hot reload: /original.html
npm run build      # typecheck, build into assets/ui, then check-compat
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
original.html            template; the build writes assets/ui/original.html
scripts/check-compat.mjs Chromium 83 gate, run after every build
src/
  main.tsx               boot: stub the bridge, install the Kotlin entry points, mount
  App.tsx                picks the screen from the session mode; stacks the overlays
  bridge/                the contract with Kotlin and stride-core (types, accessors, entry points)
  store/                 Zustand: session (from Kotlin), ui (menus, sleep), welcome (choices)
  lib/                   pure logic: session rules, plans, formatting, path geometry and scene
  theme/                 tokens.ts (the single palette and scale) and global.css
  hooks/                 useTap/useStepper, useClock, useIdleSleep
  components/
    primitives/          Button, PressableCard, Text (Label, Numeral, Heading, Prose), Layout, Overlay
    molecules/           Metric, StatCard, SideGauge, ChoiceCard, PlanCard, Sparkline, TopBar, StatusChip
    organisms/           Hero (Track/Path/Phase), Gauges, MetricStrip, ControlBar, FanMenu, CoachRibbon
  screens/               welcome (Who/How/Plan steps), workout, summary
  overlays/              paused, safety key, sleep
```

**Theming:** colours, type sizes, radii and layers live only in
`theme/tokens.ts`. At boot they're installed as CSS custom properties
(`--colour-accent`, `--font-metric`, and so on) that the CSS modules read.
Canvas and SVG code imports the same values, so the path's glow and a button's
border can't drift apart.

**Tests** load the real `stride-core.js`, so the track maths, formatters and
touch handling under test are the ones the console runs.
