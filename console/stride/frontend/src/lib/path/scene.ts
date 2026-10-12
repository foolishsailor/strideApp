import type { PlanStep } from '../../bridge/types';
import { alpha, colour, theme } from '../../theme/tokens';
import {
  CT, PH, PW, SAMPLES_U, SEE_AHEAD, SPAN, ST, X0, Y0,
  hash, project, type ProjectedPoint, type View,
} from './geometry';

/* Paints the path ahead onto a 732x404 canvas.

   Canvas rather than SVG: this repaints at 5 Hz on a 2016 MediaTek, and
   rebuilding a few dozen path nodes per frame as DOM would not hold up. */

type Ctx = CanvasRenderingContext2D;

/* ---- scenery --------------------------------------------------------------
   Low-poly ridges and pines in the interface blues, each drifting at its own
   parallax rate. Two facets per peak — one lit, one shaded — is enough to read
   as geodesic without becoming a landscape renderer. */

interface Ridge {
  baseY: number;
  height: number;
  spacing: number;
  dark: string;
  light: string;
  cap: string | null;
}

function triangle(c: Ctx, ax: number, ay: number, bx: number, by: number, cxp: number, cyp: number, fill: string) {
  c.beginPath();
  c.moveTo(ax, ay);
  c.lineTo(bx, by);
  c.lineTo(cxp, cyp);
  c.closePath();
  c.fillStyle = fill;
  c.fill();
}

function ridge(c: Ctx, offset: number, r: Ridge, gapX: number, gapW: number) {
  const first = Math.floor(offset / r.spacing) - 1;
  for (let i = first; i < first + PW / r.spacing + 3; i++) {
    const px = i * r.spacing - offset;
    if (px < -r.spacing || px > PW + r.spacing) continue;
    /* Flatten the range where the path runs off into the distance, so it has a
       valley to emerge from rather than a peak to run through. */
    const near = Math.min(1, Math.abs(px - gapX) / gapW);
    const gap = 0.08 + 0.92 * near * near;
    const h = r.height * (0.55 + hash(i) * 0.65) * gap;
    const w = r.spacing * (0.62 + hash(i + 99) * 0.3);
    const apexX = px + (hash(i + 7) - 0.5) * r.spacing * 0.3;
    const apexY = r.baseY - h;
    triangle(c, apexX, apexY, px - w, r.baseY, px + w * 0.1, r.baseY, r.dark); // shaded face
    triangle(c, apexX, apexY, px + w * 0.1, r.baseY, px + w, r.baseY, r.light); // lit face
    // A facet near the summit, which is what sells the low-poly look.
    if (r.cap) triangle(c, apexX, apexY, apexX - w * 0.22, apexY + h * 0.28, apexX + w * 0.24, apexY + h * 0.24, r.cap);
  }
}

function pines(c: Ctx, offset: number, baseY: number, size: number, spacing: number, fill: string, pts: ProjectedPoint[]) {
  const first = Math.floor(offset / spacing) - 1;
  let drawn = 0;
  for (let i = first; i < first + PW / spacing + 3; i++) {
    if (drawn >= 2) break; // one or two, never a forest
    const x = i * spacing - offset + hash(i + 21) * spacing * 0.5;
    if (x < -40 || x > PW + 40) continue;
    const h = size * (0.7 + hash(i + 5) * 0.6);
    const y = baseY + hash(i + 13) * 12;
    /* Never on or under the line. A tree growing out of the path reads as a
       mistake, so anything close to it in x at a similar depth is skipped. */
    const blocked = pts.some(
      (p) => (Math.abs(p.y - y) < 55 && Math.abs(p.x - x) < 90) || (p.y > y + 10 && Math.abs(p.x - x) < 60),
    );
    if (blocked) continue;
    drawn++;
    for (let tier = 0; tier < 3; tier++) {
      const ty = y - tier * h * 0.26;
      const tw = h * 0.3 * (1 - tier * 0.22);
      triangle(c, x, ty - h * 0.52, x - tw, ty, x + tw, ty, fill);
    }
  }
}

const { scenery } = theme;
const FAR_RIDGE: Ridge = { baseY: PH * 0.4, height: 122, spacing: 118, ...scenery.ridgeFar, cap: null };
const NEAR_RIDGE: Ridge = { baseY: PH * 0.5, height: 96, spacing: 92, ...scenery.ridgeNear };

/** Erase the scenery back towards the canvas edges, so it dissolves into the
 *  page instead of ending on the hard rectangle of the canvas. Done before the
 *  path is drawn, so the path keeps its own edges. The black here is an erase
 *  mask's opacity, not a colour, which is why it is not in the theme. */
function fadeEdges(c: Ctx) {
  c.globalCompositeOperation = 'destination-out';
  const wipes: [number, number, number, number][] = [
    [0, 0, PW * 0.2, 0], // left edge
    [PW, 0, PW * 0.8, 0], // right edge
    [0, PH * 0.62, 0, PH * 0.46], // below the ridge bases
    [0, 0, 0, PH * 0.18], // top, into the sky
  ];
  for (const [x0, y0, x1, y1] of wipes) {
    const g = c.createLinearGradient(x0, y0, x1, y1);
    g.addColorStop(0, 'rgba(0,0,0,1)');
    g.addColorStop(1, 'rgba(0,0,0,0)');
    c.fillStyle = g;
    c.fillRect(0, 0, PW, PH);
  }
  // Corners last: linear wipes leave them, and a corner is where a hard edge shows most.
  const vig = c.createRadialGradient(PW / 2, PH * 0.45, PH * 0.3, PW / 2, PH * 0.45, PH * 0.95);
  vig.addColorStop(0, 'rgba(0,0,0,0)');
  vig.addColorStop(1, 'rgba(0,0,0,1)');
  c.fillStyle = vig;
  c.fillRect(0, 0, PW, PH);
  c.globalCompositeOperation = 'source-over';
}

function polyline(c: Ctx, pts: readonly { x: number; y: number }[]) {
  c.beginPath();
  c.moveTo(pts[0]!.x, pts[0]!.y);
  for (let i = 1; i < pts.length; i++) c.lineTo(pts[i]!.x, pts[i]!.y);
}

/* ---- the ground -----------------------------------------------------------
   The solid between the path and the level plane below it: climb and the earth
   thickens under you, descend and the path cuts into it, run on the flat and
   it settles to an even lip, so the line never floats.

   Deliberately *not* a full ground plane. This is an oblique projection with no
   horizon — widen a plane in it and the ground stands on its edge like a
   mountainside (see newUI.md). */
const LIP = 11; // px of earth under a level path, near

function ground(c: Ctx, pts: ProjectedPoint[], flat: ProjectedPoint[]) {
  const n = pts.length;
  polyline(c, pts);
  for (let i = n - 1; i >= 0; i--) c.lineTo(flat[i]!.x, flat[i]!.y + LIP * pts[i]!.p);
  c.closePath();
  const soil = c.createLinearGradient(X0, Y0 + 30, X0 + SPAN * CT, Y0 - SPAN * ST);
  soil.addColorStop(0, scenery.soil[0]);
  soil.addColorStop(0.45, scenery.soil[1]);
  soil.addColorStop(1, scenery.soil[2]);
  c.fillStyle = soil;
  c.fill();

  /* A lit edge right under the path: the line that sells contact. Without it
     the fill reads as a shadow rather than a surface. */
  polyline(c, pts);
  c.lineWidth = 1.5;
  c.strokeStyle = scenery.groundEdge;
  c.stroke();

  /* The level line: where the path would run if the ground stayed flat. The
     gap between this and the real line *is* the hill. */
  polyline(c, flat);
  c.setLineDash([5, 9]);
  c.lineWidth = 1.5;
  c.strokeStyle = alpha(colour.inkDim, 0.3);
  c.stroke();
  c.setLineDash([]);
}

/** A soft wash between the ribbon's edges, no outline, so there is no hard cut. */
function ribbon(c: Ctx, pts: ProjectedPoint[]) {
  const n = pts.length;
  c.beginPath();
  c.moveTo(pts[0]!.x - pts[0]!.hw * ST, pts[0]!.y - pts[0]!.hw * CT);
  for (let i = 1; i < n; i++) c.lineTo(pts[i]!.x - pts[i]!.hw * ST, pts[i]!.y - pts[i]!.hw * CT);
  for (let i = n - 1; i >= 0; i--) c.lineTo(pts[i]!.x + pts[i]!.hw * ST, pts[i]!.y + pts[i]!.hw * CT);
  c.closePath();
  const wash = c.createLinearGradient(X0, Y0, X0 + SPAN * CT, Y0 - SPAN * ST);
  wash.addColorStop(0, alpha(colour.accent, 0.18));
  wash.addColorStop(1, alpha(colour.accent, 0));
  c.fillStyle = wash;
  c.fill();
}

/** The glowing centre line, segment by segment so each carries its own fade.
 *  Three passes fake the glow — cheaper than shadowBlur, which this 2016 GPU
 *  does not enjoy at 5 Hz. */
const GLOW_PASSES: [number, number][] = [[5.0, 0.06], [2.6, 0.14], [1.0, 0.95]];

function centreLine(c: Ctx, pts: ProjectedPoint[]) {
  const n = pts.length;
  for (const [mult, a] of GLOW_PASSES) {
    for (let i = 1; i < n; i++) {
      const fade = Math.max(0, 1 - Math.pow(i / n, 0.75));
      if (fade <= 0.01) continue;
      const w = Math.max(0.7, Math.min(6, pts[i]!.p * 7));
      c.beginPath();
      c.moveTo(pts[i - 1]!.x, pts[i - 1]!.y);
      c.lineTo(pts[i]!.x, pts[i]!.y);
      c.lineWidth = w * mult;
      c.strokeStyle = alpha(colour.accent, +(a * fade).toFixed(3));
      c.stroke();
    }
  }
}

/** Segment boundaries: where the ground is about to change. */
function segmentMarks(c: Ctx, v: View, steps: readonly PlanStep[]) {
  for (const st of steps) {
    const u = (st.end - v.t0) * v.paceMs;
    if (u <= 0 || u > SEE_AHEAD) continue;
    const g = project(u, v);
    const fade = Math.max(0, 1 - Math.pow(u / SEE_AHEAD, 0.75));
    c.beginPath();
    c.arc(g.x, g.y, Math.max(3, 9 * g.p), 0, Math.PI * 2);
    c.fillStyle = alpha(colour.accentWarm, +(0.7 * fade).toFixed(3));
    c.fill();
  }
}

/** The runner. Fixed — the world moves past, not the dot. */
function runner(c: Ctx, me: ProjectedPoint) {
  // Contact shadow first: a bright disc with nothing beneath it hovers.
  c.save();
  c.translate(me.x, me.y + 7);
  c.scale(1, 0.34);
  c.beginPath();
  c.arc(0, 0, 20, 0, Math.PI * 2);
  c.fillStyle = scenery.contactShadow;
  c.fill();
  c.restore();

  for (const [r, a] of [[26, 0.08], [16, 0.18]] as const) {
    c.beginPath();
    c.arc(me.x, me.y, r, 0, Math.PI * 2);
    c.fillStyle = alpha(colour.ink, a);
    c.fill();
  }
  c.beginPath();
  c.arc(me.x, me.y, 8, 0, Math.PI * 2);
  c.fillStyle = colour.ink;
  c.fill();
}

export function drawPath(c: Ctx, v: View, steps: readonly PlanStep[]): void {
  c.clearRect(0, 0, PW, PH);

  // Sample the path first: the scenery is placed around it, not the other way round.
  const pts = SAMPLES_U.map((u) => project(u, v));
  const flat = SAMPLES_U.map((u) => project(u, v, true));
  const vanishX = pts[pts.length - 1]!.x;

  /* Background, furthest and slowest first. Kept dim: this is scenery, and the
     numbers around it are what someone is actually reading. */
  ridge(c, v.world * 1.1, FAR_RIDGE, vanishX, 210);
  ridge(c, v.world * 2.2, NEAR_RIDGE, vanishX, 170);
  pines(c, v.world * 5.5, PH * 0.6, 34, 150, scenery.pine, pts);
  fadeEdges(c);

  c.lineCap = 'round';
  c.lineJoin = 'round';
  ground(c, pts, flat);
  ribbon(c, pts);
  centreLine(c, pts);
  segmentMarks(c, v, steps);
  runner(c, pts[0]!);
}
