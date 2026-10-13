# STRIDE

Android console app for a treadmill: Kotlin in `console/stride/app`, and the
on-screen interface in React and TypeScript in `console/stride/frontend`. See
`console/stride/frontend/README.md` for building and testing the interface.

## Design rules

- **The active treadmill screen's controls are bare.** That means the run
  screen (`screens/workout`): its rails, + and −, and the incline and speed
  stops are large text; the bottom row (apps, pause/resume/skip, fan, stop)
  and the step band's NEXT/FINISH are glyphs (`Icon`, in currentColor). No
  fill, border or shadow, with tone and state shown only in the colour. The
  full box stays the touch target. Use `Button size="rail"` or `size="dock"`
  (always bare), or match them.
- **The bottom row runs edge to edge like the top bar,** in equal columns;
  the rails stand between the two (`--dock-h`). The welcome and summary screens
  and the overlays keep boxed buttons.
- **On the run screen everything docks to an edge.** Metrics and readings go
  along the top, the incline and speed rails down the sides, and the controls
  along the bottom.
- **Over another app (APPS, e.g. Netflix) the run screen's edges are
  drawers.** The metrics slide off the top and the rails and dock off the
  sides and bottom, each pair moved by one grip (top and bottom only; no side
  grips, no extra toggle buttons). Here, and only here, the drawers sit on a
  translucent black panel and every word is white (`html.over-app`).
  `OverApp.kt` explains how touches reach the app underneath.
- Keep touch targets about 15px off the bezel: this digitiser is unreliable
  near the edge.
