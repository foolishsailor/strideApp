# STRIDE

Android console app for a treadmill: Kotlin in `console/stride/app`, and the
on-screen interface in React and TypeScript in `console/stride/frontend`. See
`console/stride/frontend/README.md` for building and testing the interface.

## Design rules

- **The active treadmill screen's controls are text-only buttons.** That
  means the run screen (`screens/workout`), with its rails, + and −, the
  incline and speed stops, and start/fan/stop. No fill, border or shadow:
  large text on the backdrop, with tone and state shown only in the text
  colour. The full box stays the touch target. Use `Button size="rail"` or
  `size="dock"` (always bare), or match them. The welcome and summary screens
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
