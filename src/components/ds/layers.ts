/**
 * PHASE 104 R1 — the application layer contract.
 *
 * Before this file the stacking order was whatever each component happened to
 * write: the shell chrome sat at `z-40`, menus at `z-50`, every modal overlay
 * at `z-[100]`, tooltips at `z-[110]` — and the cookie-consent banner at
 * `z-[9999]`, which put a NON-modal notice above every modal in the product.
 * Visually that meant the consent card painted over an open mobile navigation
 * drawer and over the command palette's own scrim, so two interactive surfaces
 * competed for the same moment with no visible hierarchy.
 *
 * The order below is the contract. It is deliberately coarse — seven named
 * layers, wide gaps — so a new surface picks a LAYER rather than inventing a
 * number, and so nothing needs to escalate to beat a neighbour.
 *
 *   content   0    the page itself
 *   raised   10    in-flow elevation inside a composition (cards, panels)
 *   sticky   40    shell chrome that stays put while the page scrolls
 *   menu     50    popovers anchored to a trigger: user menu, nav menus
 *   consent  90    site-wide non-modal notices; above the page and its chrome,
 *                  BELOW every modal, because a notice must never win against
 *                  a surface the user deliberately opened
 *   overlay 100    modal surfaces WITH a scrim: Dialog, Drawer, command palette
 *   tooltip 110    transient, pointer-driven, never interactive
 *   skipLink 120   keyboard escape hatch; must beat everything when focused
 *
 * Ordering rule, in one sentence: a surface the user opened outranks a surface
 * that opened itself.
 *
 * `consent` sitting below `overlay` is only half the fix. A dimmed banner
 * behind a scrim is still a second dialog on screen, so non-modal notices also
 * suppress themselves while a modal is open — see `useAnyModalOverlayOpen` in
 * `./overlay`. Both halves are asserted by the R1 layer-contract tests.
 */
export const LAYER = {
  content: 0,
  raised: 10,
  sticky: 40,
  menu: 50,
  consent: 90,
  overlay: 100,
  tooltip: 110,
  skipLink: 120,
} as const;

export type LayerName = keyof typeof LAYER;

/**
 * Inline `z-index` for a named layer.
 *
 * Deliberately a style object rather than a Tailwind class: an arbitrary-value
 * class (`z-[100]`) cannot be built from a variable without defeating the JIT,
 * and that is exactly how the numbers drifted apart in the first place. One
 * numeric source, applied the same way everywhere.
 */
export function layerStyle(name: LayerName): { zIndex: number } {
  return { zIndex: LAYER[name] };
}
