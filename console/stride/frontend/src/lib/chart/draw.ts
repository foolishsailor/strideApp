import type { Units } from '../../store/settings';
import { alpha, colour, fontSize, theme } from '../../theme/tokens';
import { speedIn, speedUnit } from '../units';
import type { Sample } from './history';
import { domainFor, timeTicks, type Ahead, type Domain } from './layout';

/* Paints the live chart: heart rate, speed and incline against moving time,
   each in its own strip on one shared time axis. Never two scales on one
   axis: a bpm line over a km/h line would only invite reading one against the
   other's numbers.

   Canvas rather than SVG: this repaints with every kept sample on a 2016
   MediaTek, and rebuilding a few hundred path nodes a second as DOM would not
   hold up. */

type Ctx = CanvasRenderingContext2D;

export interface ChartInput {
  samples: readonly Sample[];
  /** Seconds of history across the plot. */
  windowS: number;
  /** The plan still to come, or null when there is none: then "now" is the
   *  right edge and the whole width is history. */
  ahead: Ahead[] | null;
  aheadS: number;
  units: Units;
}

interface Strip {
  label: string;
  unit: string;
  colour: string;
  value: (s: Sample) => number | null;
  band: (s: Sample) => { min: number; max: number } | null;
  text: (v: number) => string;
  minSpan: number;
  step: number;
  floor: number;
  /** The range shown before there is anything to show. */
  empty?: Domain;
  /** The plan ahead belongs to this strip. */
  plan?: boolean;
}

const GUTTER = 52; // y-axis labels, left
const AXIS = 30; // time labels, bottom
const GAP = 18; // between strips
const HEAD = 36; // a strip's name and reading, above its plot

function strips(input: ChartInput): Strip[] {
  const u = input.units;
  const out: Strip[] = [];
  /* Always, with or without a reading: a strap that drops out shows as a gap,
     and the strip does not come and go under the runner's eye. */
  out.push({
    label: 'HEART RATE', unit: 'bpm', colour: theme.chart.hr,
    value: (s) => s.pulse, band: (s) => s.hr, text: (v) => String(Math.round(v)),
    minSpan: 30, step: 10, floor: 40, empty: [100, 170],
  });
  out.push({
    label: 'SPEED', unit: speedUnit(u), colour: theme.chart.speed,
    value: (s) => speedIn(s.speed, u),
    band: (s) => (s.pace ? { min: speedIn(s.pace.min, u), max: speedIn(s.pace.max, u) } : null),
    text: (v) => v.toFixed(1), minSpan: 2, step: 1, floor: 0,
  });
  out.push({
    label: 'INCLINE', unit: '%', colour: theme.chart.incline,
    value: (s) => s.incline, band: () => null, text: (v) => String(Math.round(v * 10) / 10),
    minSpan: 4, step: 1, floor: -6, plan: true,
  });
  return out;
}

const font = (px: number, weight: number) => `${weight} ${px}px ${theme.font.family}`;

export function drawRunChart(c: Ctx, w: number, h: number, input: ChartInput): void {
  c.clearRect(0, 0, w, h);
  const list = strips(input);
  const plotW = w - GUTTER;
  /* With a plan, a quarter of the width looks ahead. */
  const nowX = input.ahead ? GUTTER + plotW * 0.75 : w;
  const last = input.samples[input.samples.length - 1];
  const now = last ? last.t : 0;
  const xAt = (t: number) => nowX - ((now - t) / input.windowS) * (nowX - GUTTER);
  const xAhead = (dt: number) => nowX + (dt / input.aheadS) * (w - nowX);
  const visible = input.samples.filter((s) => s.t >= now - input.windowS);

  const stripH = (h - AXIS - GAP * (list.length - 1)) / list.length;
  list.forEach((st, i) => {
    const top = i * (stripH + GAP);
    drawStrip(c, st, visible, input, { top, h: stripH, w, xAt, xAhead, nowX });
  });

  drawTimeAxis(c, input, { w, h, nowX, xAt, now });
}

interface Frame {
  top: number;
  h: number;
  w: number;
  nowX: number;
  xAt: (t: number) => number;
  xAhead: (dt: number) => number;
}

function drawStrip(c: Ctx, st: Strip, samples: readonly Sample[], input: ChartInput, f: Frame): void {
  const values: number[] = [];
  for (const s of samples) {
    const v = st.value(s);
    if (v != null) values.push(v);
    const b = st.band(s);
    if (b) values.push(b.min, b.max);
  }
  if (st.plan && input.ahead) for (const a of input.ahead) values.push(a.incline);
  const dom: Domain = !values.length && st.empty ? st.empty : domainFor(values, st.minSpan, st.step, st.floor);
  const plotTop = f.top + HEAD;
  const plotH = f.h - HEAD;
  const yAt = (v: number) => plotTop + plotH - ((v - dom[0]) / (dom[1] - dom[0])) * plotH;

  // Header: the strip's name, and its reading now, in ink; a swatch of the
  // line's colour carries identity, so the text never has to.
  const lastV = [...samples].reverse().map(st.value).find((v) => v != null);
  c.fillStyle = st.colour;
  c.fillRect(GUTTER, f.top + 10, 18, 4);
  c.textBaseline = 'alphabetic';
  c.textAlign = 'left';
  c.font = font(fontSize.small, theme.font.weightLabel);
  c.fillStyle = colour.inkDim;
  c.fillText(st.label, GUTTER + 28, f.top + 18);
  const labelW = c.measureText(st.label).width;
  c.font = font(fontSize.title, theme.font.weightNumeral);
  c.fillStyle = colour.ink;
  const reading = lastV != null ? st.text(lastV) : '—';
  c.fillText(reading, GUTTER + 42 + labelW, f.top + 22);
  const readingW = c.measureText(reading).width;
  c.font = font(fontSize.small, theme.font.weightBody);
  c.fillStyle = colour.inkFaint;
  c.fillText(st.unit, GUTTER + 48 + labelW + readingW, f.top + 22);

  // Recessive grid: the bottom and top of the range, labelled at the left.
  c.strokeStyle = colour.trackLine;
  c.lineWidth = 1;
  c.font = font(fontSize.label, theme.font.weightBody);
  c.fillStyle = colour.inkFaint;
  c.textAlign = 'right';
  c.textBaseline = 'middle';
  for (const v of dom) {
    const y = Math.round(yAt(v)) + 0.5;
    c.beginPath();
    c.moveTo(GUTTER, y);
    c.lineTo(f.w, y);
    c.stroke();
    c.fillText(st.text(v), GUTTER - 8, y);
  }

  // The step's target band, as it was at each second.
  c.fillStyle = alpha(st.colour, 0.24);
  let run: { from: number; to: number; min: number; max: number } | null = null;
  const flush = () => {
    if (run) c.fillRect(f.xAt(run.from), yAt(run.max), f.xAt(run.to) - f.xAt(run.from), yAt(run.min) - yAt(run.max));
    run = null;
  };
  for (const s of samples) {
    const b = st.band(s);
    if (b && run && run.min === b.min && run.max === b.max && s.t - run.to <= 2) run.to = s.t + 1;
    else {
      flush();
      if (b) run = { from: s.t, to: s.t + 1, min: b.min, max: b.max };
    }
  }
  flush();

  // The line. Broken where there was no reading, or where seconds are missing.
  c.strokeStyle = st.colour;
  c.lineWidth = 2;
  c.lineJoin = 'round';
  c.lineCap = 'round';
  c.beginPath();
  let prev: number | null = null;
  for (const s of samples) {
    const v = st.value(s);
    if (v == null) { prev = null; continue; }
    const x = f.xAt(s.t);
    const y = yAt(v);
    if (prev == null || s.t - prev > 2) c.moveTo(x, y);
    else c.lineTo(x, y);
    prev = s.t;
  }
  c.stroke();

  // The plan's ground still to come, dashed: intent, not a reading.
  if (st.plan && input.ahead?.length) {
    c.strokeStyle = alpha(st.colour, 0.7);
    c.setLineDash([6, 5]);
    c.beginPath();
    input.ahead.forEach((a, i) => {
      const y = yAt(a.incline);
      if (i === 0) c.moveTo(f.xAhead(a.from), y);
      else c.lineTo(f.xAhead(a.from), y);
      c.lineTo(f.xAhead(a.to), y);
    });
    c.stroke();
    c.setLineDash([]);
  }
}

function drawTimeAxis(
  c: Ctx, input: ChartInput, f: { w: number; h: number; nowX: number; xAt: (t: number) => number; now: number },
): void {
  const base = f.h - AXIS;
  c.font = font(fontSize.label, theme.font.weightBody);
  c.textBaseline = 'top';
  c.fillStyle = colour.inkFaint;
  for (const back of timeTicks(input.windowS)) {
    const x = f.xAt(f.now - back);
    const label = back === 0 ? 'now' : `−${back / 60} min`;
    c.textAlign = back === 0 ? (input.ahead ? 'center' : 'right') : back === input.windowS ? 'left' : 'center';
    c.fillText(label, x, base + 8);
  }
  if (input.ahead) {
    // "Now" divides what has been run from what is planned.
    c.strokeStyle = alpha(colour.ink, 0.35);
    c.lineWidth = 1;
    c.beginPath();
    c.moveTo(Math.round(f.nowX) + 0.5, 0);
    c.lineTo(Math.round(f.nowX) + 0.5, base);
    c.stroke();
    c.textAlign = 'right';
    c.fillText(`+${Math.round(input.aheadS / 60)} min`, f.w, base + 8);
  }
}
