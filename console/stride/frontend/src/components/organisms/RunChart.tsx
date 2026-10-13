import { useEffect, useRef, useState } from 'react';
import { drawRunChart } from '../../lib/chart/draw';
import { planAhead } from '../../lib/chart/layout';
import { historySamples, useHistory } from '../../store/history';
import { useSession } from '../../store/session';
import { useUnits } from '../../store/settings';
import { cx } from '../../lib/cx';
import styles from './RunChart.module.css';

/** Twelve minutes run, and with a plan a third as much ahead, on one scale. */
const WINDOW_S = 12 * 60;
const AHEAD_S = WINDOW_S / 3;

/** Fills its box at the panel's own pixel density, whatever size it is given. */
function useBoxSize(ref: React.RefObject<HTMLElement | null>): { w: number; h: number } {
  const [size, setSize] = useState({ w: 0, h: 0 });
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const measure = () => setSize({ w: el.clientWidth, h: el.clientHeight });
    measure();
    if (typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, [ref]);
  return size;
}

/** Heart rate, speed and incline against moving time, live: the run so far,
 *  the step's target band shaded, and the plan's incline still to come. */
export function RunChart({ className }: { className?: string }) {
  const box = useRef<HTMLDivElement>(null);
  const canvas = useRef<HTMLCanvasElement>(null);
  const { w, h } = useBoxSize(box);
  const version = useHistory((s) => s.version);
  const units = useUnits();
  const steps = useSession((s) => s.planSteps);
  const byDistance = useSession((s) => s.planByDistance);

  useEffect(() => {
    const el = canvas.current;
    const c = el?.getContext('2d');
    if (!el || !c || !w || !h) return;
    const dpr = window.devicePixelRatio || 1;
    if (el.width !== Math.round(w * dpr)) el.width = Math.round(w * dpr);
    if (el.height !== Math.round(h * dpr)) el.height = Math.round(h * dpr);
    c.setTransform(dpr, 0, 0, dpr, 0, 0);
    /* Position and speed are read here rather than subscribed to: they change
       five times a second, and the chart moves once. */
    const { snapshot } = useSession.getState();
    const samples = historySamples();
    drawRunChart(c, w, h, {
      samples,
      windowS: WINDOW_S,
      /* One stretch is a manual heart-rate run's open step: nothing ahead
         worth a quarter of the width. */
      ahead: steps.length > 1
        ? planAhead(steps, {
          byDistance, position: snapshot.planElapsed ?? 0, speedKph: snapshot.speed ?? 0, horizonS: AHEAD_S,
        })
        : null,
      aheadS: AHEAD_S,
      units,
    });
  }, [version, w, h, units, steps, byDistance]);

  return (
    <div ref={box} className={cx(styles.chart, className)}>
      <canvas ref={canvas} role="img" aria-label="Heart rate, speed and incline" style={{ width: w, height: h }} />
    </div>
  );
}
