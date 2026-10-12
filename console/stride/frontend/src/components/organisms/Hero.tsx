import { useField, useMode } from '../../store/session';
import { PathHero } from './PathHero';
import { PhasePanel } from './PhasePanel';
import { TrackHero } from './TrackHero';

/** Which hero fills the centre.
 *
 *  Warm-up and cool-down get the phase panel. Otherwise a guided walk has a
 *  plan, so there is ground ahead worth drawing and the path earns the space;
 *  a casual walk has none — the path would be a dead flat line — so the oval
 *  counts laps instead, which is what a casual walk actually accumulates. */
export function Hero() {
  const mode = useMode();
  const guided = (useField('segments') || 0) > 0;
  if (mode === 'warmup' || mode === 'cooldown') return <PhasePanel mode={mode} />;
  return guided ? <PathHero /> : <TrackHero />;
}
