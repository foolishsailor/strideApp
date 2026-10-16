import { dateOf, timeOf, useNow } from '../../hooks/useClock';

/** The time and the date on one line, for a page header's right-hand side. */
export function Clock() {
  const now = useNow();
  return <span>{timeOf(now)} · {dateOf(now)}</span>;
}
