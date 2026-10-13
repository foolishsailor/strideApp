# Handoff — spec 038: TrailMate workouts and routes on the treadmill

13 Oct 2026. Everything below is committed **locally**. Nothing for 038 is pushed, and no PR is open.

- **STRIDE** (`foolishsailor/strideApp`): branch `038-schedule-routes`, 8 commits ahead of `main`.
- **TrailMate** (`foolishsailor/trailMate`, at `C:\Users\JC Durbin\code\trailMate`): branch `038-stride-schedule-routes`, 4 commits ahead of `main`.

Read first:
- `C:\Users\JC Durbin\code\trailMate\specs\038-stride-schedule-routes\`: `spec.md`, `plan.md`, `tasks.md` (with verdicts) and `contracts/api.md`. The contract is the source of truth between the two repos.
- This repo's `CLAUDE.md` (design rules for the walk screen) and the memories in `~/.claude/projects/...trailMateTreadmill/memory/`. They cover modular architecture, auto-selecting the first item in a list beside a detail view, PRs going to the forks only, the text-only walk screen and the over-app drawers.

## Next, asked by jc (not started)

1. **Remove the mountain / course imagery everywhere.** jc: "don't use the stupid mountain course imagery for anything, remove all that." It is the path-ahead scenery on the run screen:
   - `frontend/src/lib/path/scene.ts`
   - `frontend/src/lib/path/geometry.ts`
   - `components/organisms/PathHero.tsx`, `Hero.tsx`
   - the scenery tokens in `theme/themes/trailmate.ts`, `theme/tokens.ts` and `theme/types.ts`
   - check `stride-core.js` (`track`, `profile`, `routePoints`) for anything only the scenery uses

   Replace the hero with something useful, which is item 2 for heart-rate runs. A route or pace workout still needs a centre: a plain incline profile and position, or the same chart.
2. **Streaming chart for heart-rate runs:** speed, incline and heart rate against time, live, in the run screen's centre.
   - Draw it on a canvas: the run screen already redraws at 5 Hz, and the README says not to build the path as DOM.
   - Read `speed`, `incline` and `pulse` from the snapshot (`useField`), and keep a rolling buffer, say the last 10–20 minutes.
   - Show the HR target band (`workoutStep.target` hr min/max) shaded.
   - Follow the walk-screen rules in `CLAUDE.md`, and the over-app look (white on translucent black) when `html.over-app`.
   - Build it as a reusable component. The dataviz guidance applies.
3. **The rest of the welcome flow should fill the screen.** The X22i panel lays out at **1920×1080 at zoom 1**, not the 1280×800 the README and fixed sizes assume. The Workouts picker is fixed (`Welcome.module.css` `.workouts` uses vw/vh). Step 2, the route and heart-rate pickers, and the run screen still use fixed px and look under-filled. Measure through DevTools: `adb forward tcp:9222 localabstract:webview_devtools_remote_<pid>`, plus a small CDP script (Node 24 has `WebSocket`).

## Still to do for 038

- **Measurement scripts (T007, T008).** These are read-only, against production. jc must run them, or approve running them:
  - `backend/scripts/check-stride-route-segments.ts`
  - `check-stride-zone-coverage.ts`

  Put the output into `research.md`. FR-012's "climb within 10 %" is not quoted until then.
- **T021:** a browser check of the TrailMate web pages: `/link` permissions, Devices list permissions, the route star.
- **T022:** contract fixtures in `specs/038…/contracts/fixtures/`, loaded by both the backend specs and `tools/trailmate_mock.py`. The mock currently uses its own `tools/trailmate_fixtures.py`.
- **PRs**, to the forks only: TrailMate, then STRIDE.
  - **Merging the TrailMate PR deploys to production** and applies migration `20261013120000_stride_schedule_routes` (added columns only). jc wants the scripts and the browser check done first.
  - Ask before pushing or merging.
- **T042 on the treadmill** (ADB `192.168.68.103:5555`, debug-signed; jc OK'd wiping data). Do this after the backend is deployed:
  1. Re-link JC: the old link holds `workouts:upload` only, so the console shows "Reconnect".
  2. Check the schedule and profile pages.
  3. Run a short planned workout: pace steps, then an HR step with the COROS strap.
  4. Confirm TrailMate marks the workout completed.

## What is built (all tested on the emulator against the mock)

**STRIDE Kotlin** (`console/stride/app/src/main/java/dev/stride/hud/`)
- **Sync and storage:**
  - `Db.kt` v2 adds tables `schedule`, `zones`, `person_routes` and `sync`.
  - `TrailMateStore` (storage), `TrailMateSync` (when and what to fetch: self → schedule → routes, with ETags, never while moving) and `TrailMateView` (the JSON the screens read).
  - `TrailMate.get()` makes reads. A re-link revokes the old token.
- **Workouts:**
  - `Workout` (sealed `End` / `Target`), `WorkoutJson`, `Zones`, `Bands.kt` (`SpeedBand`, `HrBand`, `SpeedLimits`).
  - `WorkoutRunner` is pure: it steps and says what to drive. MainActivity's `workoutTick` and `driveSpeed` carry that out through the ramp.
  - `HrControl` is a proportional controller with a dead band and a 30 s trend look-ahead. It starts at the slow end of the pace zone and is bounded by `SpeedLimits` only. It was tuned against `SimHeart`, and `HrControlTest` holds the criteria plus a planted lag-blind controller that must fail.
  - `WorkoutView` is the run screen's `workoutStep`.
  - The recorder marks each step (the upload's laps) and carries `plannedWorkoutId`.
  - A personal `workout_speed_limit`.
  - Ending a workout early skips the console's own cool-down.
- **Removed:** the built-in shapes (`chooseGuided`, templates, the open circuit), from Kotlin, the core, the interface, `sim.py` and the docs.
- **Tools:**
  - `tools/sim.py`: `planned <id>`, `hr <zone>`, `next`; the simulator's pulse uses `SimHeart`.
  - `tools/trailmate_mock.py`: `/devices/self`, `/devices/schedule`, `/devices/routes`, ETags, `--upload-only`.
- **Unit tests:** JVM tests in `app/src/test` (JUnit and org.json are test-only dependencies), 30 in total.

**STRIDE interface**
- **Home:** people only.
- **Step 2:** Manual / Routes / Workouts stacked down the left; Today and Tomorrow on the right, in detailed cards.
- **Step 3:** the Workouts week, full height, with the first workout auto-selected. Manual's heart-rate zone chips and the route picker.
- **Run screen:** a step band, the HR control state and zone, NEXT.
- **My settings:**
  - TrailMate profile: zones, the next 7 days, sync, permissions.
  - Routes.
  - The workout speed limit.
  - A generalised stepper with units.
- **Shared code:** `lib/schedule.ts` and `store/trailmate.ts` (parsing), `lib/units.ts` (`stepLines`, targets), the `useAutoSelect` hook.
- **Tests:** 93 vitest tests.

**TrailMate** (agents built it and the lead reviewed it; 145 targeted backend tests and 37 web tests pass)
- **Device scopes:** `@RequireDeviceScope`, enforced by the guard. Existing links default to upload only.
- **Endpoints:** `GET devices/self`, `devices/schedule` and `devices/routes`, sharing one ETag interceptor, with per-device throttles.
- **Pure modules:** step flattening, zones and treadmill segments.
- **Uploads:** `plannedWorkoutId` links the activity to the planned workout.
- **Route stars:** `Route.starredAt`, kept across rediscovery and set through the existing PATCH.
- **Web:** permission wording in one module and component; a reusable star button with its own mutation hook.

## Environment notes

- **Build:**
  - `export JAVA_HOME="/c/Program Files/Java/jdk-23"`
  - `export ANDROID_HOME="$LOCALAPPDATA/Android/Sdk"`
  - `./gradlew assembleDebug testDebugUnitTest`
  - Frontend: `npm run build` writes `app/src/main/assets/ui/trailmate.html`, which is committed.
- **Shell:** Git Bash on Windows.
  - Heredocs with quotes break the Bash tool, so write Python edit scripts with the Write tool and run them with `C:\Users\JC Durbin\AppData\Local\Programs\Python\Python311\python.exe`.
  - Set `MSYS_NO_PATHCONV=1` for adb device paths.
- **Emulator** (`emulator-5554`):
  - Has a **Tester** person linked to the mock, with the console's TrailMate URL pointing at `http://10.0.2.2:8038/api`. The mock is currently stopped.
  - Sam's link needs reconnecting.
  - Restore the URL and remove Tester when done (in `stride.db`: delete the `trailmate_url` setting).
  - jc sometimes taps the emulator window, and that has caused STOP and runner changes during tests.
