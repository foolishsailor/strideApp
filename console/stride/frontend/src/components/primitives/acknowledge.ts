/* The ring that acknowledges a press, for every pressable thing on the panel:
   Button, PressableCard and the rails' stops all call this, once, in the
   component, never in a handler.

   An attribute rather than a class: React rewrites `class` whenever a
   button's own classes change (PAUSE turning active, a stop becoming the
   selected one), which wiped a class-based ring the instant it started.
   React never touches an attribute it did not render. The look is in
   global.css, under [data-ack]. */

/** `inset` draws the ring inside the box, for things in a scrolling list,
 *  which clips anything drawn outside it. */
export function acknowledge(el: Element | null, inset = false): void {
  if (!(el instanceof HTMLElement)) return;
  el.removeAttribute('data-ack');
  void el.offsetWidth; // restart the animation
  el.setAttribute('data-ack', inset ? 'inset' : 'ring');
}
