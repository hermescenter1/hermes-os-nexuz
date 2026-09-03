/**
 * PHASE 109-C1 — choosing a focus target that is actually there.
 *
 * WHY THIS IS NOT `document.getElementById(id).focus()`
 * ----------------------------------------------------
 * The workspace renders BOTH responsive branches into the DOM and lets CSS
 * decide which one the viewer sees. The symbol search therefore exists twice —
 * `#studio-symbol-search` in the desktop/tablet workspace and
 * `#studio-symbol-search-mobile` in the phone companion — and at any width one
 * of them is inside a `display: none` subtree.
 *
 * So "the element exists" is not a usable test. Round 1.3's command asked for
 * `#studio-symbol-search` unconditionally: at 320 and 390 that call found a
 * hidden input, `focus()` did nothing, and the command silently left the
 * keyboard user where they started. Nothing threw, and nothing reported it.
 *
 * Two things follow, and both are the point of this module:
 *
 *   1. A candidate is only a target if it is RENDERED — not display:none, not
 *      visibility:hidden, with a real box, not disabled and not inert.
 *   2. Even then, `focus()` can be refused. The result is CONFIRMED against
 *      `document.activeElement` before a target is accepted, and the next
 *      candidate is tried if it was not.
 *
 * `isFocusable` and `selectFocusTarget` are pure and take measurements as data,
 * so they can be tested exhaustively without a browser and without jsdom having
 * to evaluate a media query it does not implement.
 */

/** What has to be measured about a candidate before it can be focused. */
export interface FocusCandidateProbe {
  readonly id: string;
  readonly exists: boolean;
  /** Resolved `display`. A `none` anywhere up the tree resolves here. */
  readonly display: string;
  readonly visibility: string;
  /** Whether the element has at least one rendered box with a non-zero area. */
  readonly hasRect: boolean;
  readonly disabled: boolean;
  readonly inert: boolean;
}

export type FocusRefusal =
  | "absent"
  | "display-none"
  | "visibility-hidden"
  | "no-rect"
  | "disabled"
  | "inert"
  /**
   * The candidate measured as focusable, focus() was called, and the caret did
   * not arrive. That happens — a control can refuse focus, and focus() returns
   * nothing either way. It is a distinct outcome from "we never tried", so it
   * has its own name and the search CONTINUES to the next candidate.
   */
  | "focus-refused";

/**
 * Why a candidate cannot be focused, or null when it can.
 *
 * A reason rather than a boolean, because "Search symbols did nothing" is a
 * bug report nobody can act on, and the driver records this per cell.
 */
export function focusRefusal(probe: FocusCandidateProbe): FocusRefusal | null {
  if (!probe.exists) return "absent";
  if (probe.display === "none") return "display-none";
  if (probe.visibility === "hidden" || probe.visibility === "collapse") return "visibility-hidden";
  if (!probe.hasRect) return "no-rect";
  if (probe.disabled) return "disabled";
  if (probe.inert) return "inert";
  return null;
}

export function isFocusable(probe: FocusCandidateProbe): boolean {
  return focusRefusal(probe) === null;
}

export interface FocusSelection {
  readonly targetId: string | null;
  readonly refusals: readonly { readonly id: string; readonly reason: FocusRefusal }[];
}

/**
 * The first candidate that is genuinely focusable, with the reason every
 * earlier candidate was skipped.
 *
 * Ordered by preference, not by viewport: the caller lists both responsive ids
 * and the measurements decide. That is what makes one command correct at every
 * width without the component having to know which breakpoint is active.
 */
export function selectFocusTarget(
  ids: readonly string[],
  measure: (id: string) => FocusCandidateProbe,
): FocusSelection {
  const refusals: { id: string; reason: FocusRefusal }[] = [];
  for (const id of ids) {
    const reason = focusRefusal(measure(id));
    if (reason === null) return { targetId: id, refusals };
    refusals.push({ id, reason });
  }
  return { targetId: null, refusals };
}

/* ── the DOM adapter ─────────────────────────────────────────────────────── */

/** Measure a candidate from a live document. */
export function measureCandidate(doc: Document, id: string): FocusCandidateProbe {
  const el = doc.getElementById(id);
  if (!el) {
    return {
      id,
      exists: false,
      display: "",
      visibility: "",
      hasRect: false,
      disabled: false,
      inert: false,
    };
  }
  const view = doc.defaultView;
  const style = view ? view.getComputedStyle(el) : null;
  // getClientRects() rather than getBoundingClientRect(): an element split
  // across lines has several boxes, and one of them being real is enough.
  const rects = typeof el.getClientRects === "function" ? el.getClientRects() : null;
  let hasRect = false;
  if (rects) {
    for (let i = 0; i < rects.length; i += 1) {
      if (rects[i].width > 0 && rects[i].height > 0) { hasRect = true; break; }
    }
  }
  return {
    id,
    exists: true,
    display: style ? style.display : "",
    visibility: style ? style.visibility : "",
    hasRect,
    disabled: "disabled" in el ? Boolean((el as HTMLInputElement).disabled) : false,
    inert: el.hasAttribute("inert") || Boolean((el as HTMLElement & { inert?: boolean }).inert),
  };
}

/** What happened to one candidate, in the order it was examined. */
export interface FocusAttempt {
  readonly id: string;
  readonly outcome: "focused" | FocusRefusal;
}

export interface FocusOutcome {
  readonly requested: readonly string[];
  /** Every candidate examined, in order, with what became of it. */
  readonly attempts: readonly FocusAttempt[];
  /** The candidate focus actually landed on, or null. */
  readonly selected: string | null;
  /** `document.activeElement.id` after the last attempt. */
  readonly focused: string | null;
  readonly refusals: readonly { readonly id: string; readonly reason: FocusRefusal }[];
  readonly succeeded: boolean;
  /** True when the search had to ignore layout because none was available. */
  readonly usedNoLayoutFallback: boolean;
}

/** Call focus() and read back whether it landed. Never trusts the call. */
function tryFocus(doc: Document, id: string): boolean {
  const el = doc.getElementById(id);
  if (!el || typeof (el as HTMLElement).focus !== "function") return false;
  (el as HTMLElement).focus();
  const active = doc.activeElement;
  return Boolean(active && active.id === id);
}

/**
 * Focus the first candidate that is rendered AND accepts focus.
 *
 * Two separate reasons to move on, and the second is the one an earlier version
 * got wrong: a candidate can measure as perfectly focusable and still refuse
 * the call. That version confirmed the landing — which was the point — but then
 * returned failure on the spot, so the second responsive twin was never tried.
 * A correct-looking check that stops the search early is its own kind of bug.
 *
 * So: measure, skip the unrenderable, focus, confirm, and on a refusal record
 * `focus-refused` and KEEP GOING. Success is returned only when the caret
 * actually arrived, and the full ordered attempt list is returned either way.
 */
export function focusFirstVisible(doc: Document, ids: readonly string[]): FocusOutcome {
  const attempts: FocusAttempt[] = [];
  const refusals: { id: string; reason: FocusRefusal }[] = [];

  const pass = (requireRect: boolean): string | null => {
    for (const id of ids) {
      const probe = measureCandidate(doc, id);
      const reason = focusRefusal(probe);
      // The layout-free pass ignores `no-rect` and nothing else.
      if (reason !== null && !(requireRect === false && reason === "no-rect")) {
        attempts.push({ id, outcome: reason });
        refusals.push({ id, reason });
        continue;
      }
      if (tryFocus(doc, id)) {
        attempts.push({ id, outcome: "focused" });
        return id;
      }
      attempts.push({ id, outcome: "focus-refused" });
      refusals.push({ id, reason: "focus-refused" });
    }
    return null;
  };

  let selected = pass(true);
  let usedNoLayoutFallback = false;

  /*
   * jsdom performs no layout, so every candidate measures as `no-rect` there.
   * Treating that as "nothing is focusable" would make the workspace
   * untestable, so a second pass ignores rects — but ONLY when that was the
   * sole objection, and the outcome says it happened. A real browser always has
   * boxes, so this never runs where the distinction matters.
   */
  if (selected === null && refusals.length > 0 && refusals.every((r) => r.reason === "no-rect")) {
    usedNoLayoutFallback = true;
    selected = pass(false);
  }

  const active = doc.activeElement;
  const focused = active && active.id ? active.id : null;
  return {
    requested: ids,
    attempts,
    selected,
    focused,
    refusals,
    succeeded: selected !== null && focused === selected,
    usedNoLayoutFallback,
  };
}

/**
 * The symbol-search targets, in preference order.
 *
 * Both ids are listed at every width and the measurements pick. Naming them in
 * one place keeps the command, the tests and the browser driver from drifting
 * into three different opinions about what "the search box" is.
 */
export const SYMBOL_SEARCH_TARGETS = Object.freeze([
  "studio-symbol-search",
  "studio-symbol-search-mobile",
] as const);
