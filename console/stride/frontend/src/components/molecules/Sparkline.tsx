import { useEffect, useRef } from 'react';
import { alpha, colour } from '../../theme/tokens';

/* Room for the descents as well as the climbs. */
const MAX = 12;
const MIN = -3;

/** An incline profile drawn small: the shape of a walk on its card. */
export function Sparkline({ points, width = 210, height = 56, className }: {
  points: readonly number[];
  width?: number;
  height?: number;
  className?: string;
}) {
  const ref = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const c = ref.current?.getContext('2d');
    if (!c || points.length < 2) return;
    const y = (v: number) => height - ((v - MIN) / (MAX - MIN)) * (height - 6) - 3;
    const x = (i: number) => (i / (points.length - 1)) * width;

    c.clearRect(0, 0, width, height);
    c.beginPath();
    c.moveTo(0, height);
    points.forEach((v, i) => c.lineTo(x(i), y(v)));
    c.lineTo(width, height);
    c.closePath();
    c.fillStyle = alpha(colour.accent, 0.22);
    c.fill();

    c.beginPath();
    points.forEach((v, i) => (i ? c.lineTo(x(i), y(v)) : c.moveTo(x(i), y(v))));
    c.strokeStyle = colour.accent;
    c.lineWidth = 2;
    c.stroke();
  }, [points, width, height]);

  return <canvas ref={ref} width={width} height={height} className={className} />;
}
