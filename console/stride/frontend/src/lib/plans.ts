/* The guided-run choices offered on the welcome screen. */

export interface Template {
  id: string;
  name: string;
  blurb: string;
  /** Incline percentages across the run, drawn on the card. Purely
   *  illustrative — the real profile comes from Kotlin at start. */
  shape: number[];
}

export const TEMPLATES: readonly Template[] = [
  { id: 'steady', name: 'Steady', blurb: 'One gentle hill, held', shape: [0, 2, 3.5, 3.5, 5, 3, 1.5, 0] },
  { id: 'rolling', name: 'Rolling hills', blurb: 'Up and down, over and over', shape: [0, 4, -1, 6.5, 1, 9.5, 2, 5.5, -1.5, 3, 0] },
  { id: 'pyramid', name: 'Pyramid', blurb: 'Climbs to a peak, then back down', shape: [0, 2.5, 5, 7.5, 10, 11.5, 7, 4, 1.5, 0] },
  { id: 'climb', name: 'Long climb', blurb: 'One sustained ascent', shape: [0, 3, 5.5, 4.5, 7.5, 11, 6, 2.5, 0] },
];

/** Five minutes is a bench test: every segment in about 30 seconds. */
export const DURATIONS: readonly number[] = [5, 15, 20, 30, 45];

/** Routes get the whole step or none of it, never a fifth card beside the four
 *  shapes: five entries push the row into the BACK button. */
export const MAX_ROUTE_CARDS = 4;
