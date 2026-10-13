import { useMode } from '../../store/session';
import { ChartHero } from './ChartHero';
import { PhasePanel } from './PhasePanel';

/** Which hero fills the centre: the phase panel through warm-up and
 *  cool-down, and the live chart for every run, manual, route or workout. */
export function Hero() {
  const mode = useMode();
  if (mode === 'warmup' || mode === 'cooldown') return <PhasePanel mode={mode} />;
  return <ChartHero />;
}
