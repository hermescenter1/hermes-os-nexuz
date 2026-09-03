// @vitest-environment jsdom
/**
 * PHASE 109-C1 Round 1.4 — choosing a focus target across responsive modes.
 *
 * The defect this pins: both responsive branches live in the DOM at once and
 * CSS decides which is rendered, so the symbol search exists twice. Round 1.3's
 * command asked for the desktop id unconditionally; at 320 and 390 that found a
 * `display: none` input, `focus()` did nothing, and nothing reported it.
 *
 * jsdom does not evaluate Tailwind media queries, so the responsive branch
 * cannot be reproduced by resizing. The predicate is therefore pure and takes
 * MEASUREMENTS as data, and the DOM-level tests set `display` and rects
 * explicitly — which is a stronger test than a breakpoint anyway, because it
 * exercises the states directly rather than hoping a media query produces them.
 */

import { describe, expect, it } from "vitest";

import {
  SYMBOL_SEARCH_TARGETS,
  focusFirstVisible,
  focusRefusal,
  isFocusable,
  measureCandidate,
  selectFocusTarget,
  type FocusCandidateProbe,
} from "../focus-target";

const probe = (over: Partial<FocusCandidateProbe> = {}): FocusCandidateProbe => ({
  id: "x",
  exists: true,
  display: "block",
  visibility: "visible",
  hasRect: true,
  disabled: false,
  inert: false,
  ...over,
});

describe("109-C1 R1.4 · focusRefusal names why a candidate is unusable", () => {
  it("accepts a rendered, enabled control", () => {
    expect(focusRefusal(probe())).toBeNull();
    expect(isFocusable(probe())).toBe(true);
  });

  it.each([
    ["absent", { exists: false }],
    ["display-none", { display: "none" }],
    ["visibility-hidden", { visibility: "hidden" }],
    ["no-rect", { hasRect: false }],
    ["disabled", { disabled: true }],
    ["inert", { inert: true }],
  ] as const)("refuses with %s", (reason, over) => {
    expect(focusRefusal(probe(over))).toBe(reason);
    expect(isFocusable(probe(over))).toBe(false);
  });

  it("treats visibility: collapse as hidden", () => {
    expect(focusRefusal(probe({ visibility: "collapse" }))).toBe("visibility-hidden");
  });
});

describe("109-C1 R1.4 · selectFocusTarget picks the VISIBLE responsive twin", () => {
  const [DESKTOP, MOBILE] = SYMBOL_SEARCH_TARGETS;

  /** Both ids exist; only one is rendered. That is the real situation. */
  const bothPresent = (visible: string) => (id: string) =>
    probe({ id, display: id === visible ? "block" : "none" });

  it("at phone widths selects the companion input and skips the hidden desktop one", () => {
    const r = selectFocusTarget(SYMBOL_SEARCH_TARGETS, bothPresent(MOBILE));
    expect(r.targetId).toBe(MOBILE);
    expect(r.refusals).toEqual([{ id: DESKTOP, reason: "display-none" }]);
  });

  it("at workspace widths selects the workspace input and skips the hidden mobile one", () => {
    const r = selectFocusTarget(SYMBOL_SEARCH_TARGETS, bothPresent(DESKTOP));
    expect(r.targetId).toBe(DESKTOP);
    expect(r.refusals).toEqual([]);
  });

  it("never returns a hidden candidate just because it exists", () => {
    // The Round 1.3 behaviour, stated as the thing that must not happen.
    const r = selectFocusTarget([DESKTOP], bothPresent(MOBILE));
    expect(r.targetId).toBeNull();
    expect(r.refusals).toEqual([{ id: DESKTOP, reason: "display-none" }]);
  });

  it("reports honestly when nothing is focusable rather than inventing success", () => {
    const r = selectFocusTarget(SYMBOL_SEARCH_TARGETS, (id) => probe({ id, exists: false }));
    expect(r.targetId).toBeNull();
    expect(r.refusals.map((x) => x.reason)).toEqual(["absent", "absent"]);
  });

  it("skips a rendered but disabled control and takes the next", () => {
    const r = selectFocusTarget(SYMBOL_SEARCH_TARGETS, (id) =>
      probe({ id, disabled: id === DESKTOP }),
    );
    expect(r.targetId).toBe(MOBILE);
    expect(r.refusals).toEqual([{ id: DESKTOP, reason: "disabled" }]);
  });

  it("preserves the order it is given", () => {
    const reversed = [MOBILE, DESKTOP] as const;
    const r = selectFocusTarget(reversed, () => probe());
    expect(r.targetId).toBe(MOBILE);
  });
});

describe("109-C1 R1.4 · focusFirstVisible against a real document", () => {
  const [DESKTOP, MOBILE] = SYMBOL_SEARCH_TARGETS;

  /**
   * Build the two-branch DOM and control which is rendered, plus the rects
   * jsdom does not compute. Both inputs are always present, exactly as the
   * workspace renders them.
   */
  function mountPair(visible: string): void {
    document.body.replaceChildren();
    for (const id of SYMBOL_SEARCH_TARGETS) {
      const input = document.createElement("input");
      input.id = id;
      input.type = "text";
      input.style.display = id === visible ? "block" : "none";
      document.body.appendChild(input);
      Object.defineProperty(input, "getClientRects", {
        value: () =>
          (id === visible
            ? [{ width: 200, height: 24 }]
            : []) as unknown as DOMRectList,
        configurable: true,
      });
    }
  }

  it("focuses the companion input when it is the rendered one", () => {
    mountPair(MOBILE);
    const out = focusFirstVisible(document, SYMBOL_SEARCH_TARGETS);
    expect(out.selected).toBe(MOBILE);
    expect(out.focused).toBe(MOBILE);
    expect(out.succeeded).toBe(true);
    expect(document.activeElement?.id).toBe(MOBILE);
    expect(out.refusals).toEqual([{ id: DESKTOP, reason: "display-none" }]);
  });

  it("focuses the workspace input when it is the rendered one", () => {
    mountPair(DESKTOP);
    const out = focusFirstVisible(document, SYMBOL_SEARCH_TARGETS);
    expect(out.selected).toBe(DESKTOP);
    expect(document.activeElement?.id).toBe(DESKTOP);
    expect(out.succeeded).toBe(true);
  });

  it("repeating the command refocuses the correct visible input", () => {
    mountPair(MOBILE);
    focusFirstVisible(document, SYMBOL_SEARCH_TARGETS);
    (document.activeElement as HTMLElement)?.blur();
    expect(document.activeElement?.id).not.toBe(MOBILE);

    const again = focusFirstVisible(document, SYMBOL_SEARCH_TARGETS);
    expect(again.succeeded).toBe(true);
    expect(document.activeElement?.id).toBe(MOBILE);
  });

  it("reports failure — not success — when neither branch is rendered", () => {
    document.body.replaceChildren();
    const out = focusFirstVisible(document, SYMBOL_SEARCH_TARGETS);
    expect(out.selected).toBeNull();
    expect(out.succeeded).toBe(false);
    expect(out.refusals.map((r) => r.reason)).toEqual(["absent", "absent"]);
  });

  /** Build one input with controllable visibility and focus behaviour. */
  function makeInput(id: string, opts: { visible?: boolean; refusesFocus?: boolean; disabled?: boolean } = {}) {
    const el = document.createElement("input");
    el.id = id;
    el.type = "text";
    const visible = opts.visible !== false;
    el.style.display = visible ? "block" : "none";
    if (opts.disabled) el.disabled = true;
    Object.defineProperty(el, "getClientRects", {
      value: () => (visible ? [{ width: 180, height: 24 }] : []) as unknown as DOMRectList,
      configurable: true,
    });
    if (opts.refusesFocus) {
      // A control that measures as focusable and declines the call. focus()
      // returns nothing either way, which is why the result is read back.
      Object.defineProperty(el, "focus", { value: () => undefined, configurable: true });
    }
    document.body.appendChild(el);
    return el;
  }

  it("RETRIES the next candidate when the first refuses focus", () => {
    // The Round 1.4 hole: focus was confirmed, but a refusal ended the search
    // instead of moving on, so the second responsive twin was never tried.
    document.body.replaceChildren();
    makeInput(DESKTOP, { refusesFocus: true });
    makeInput(MOBILE);

    const out = focusFirstVisible(document, SYMBOL_SEARCH_TARGETS);
    expect(out.succeeded).toBe(true);
    expect(out.selected).toBe(MOBILE);
    expect(document.activeElement?.id).toBe(MOBILE);
    expect(out.attempts).toEqual([
      { id: DESKTOP, outcome: "focus-refused" },
      { id: MOBILE, outcome: "focused" },
    ]);
  });

  it("fails honestly when EVERY viable candidate refuses focus", () => {
    document.body.replaceChildren();
    makeInput(DESKTOP, { refusesFocus: true });
    makeInput(MOBILE, { refusesFocus: true });

    const out = focusFirstVisible(document, SYMBOL_SEARCH_TARGETS);
    expect(out.succeeded).toBe(false);
    expect(out.selected).toBeNull();
    expect(out.attempts.map((a) => a.outcome)).toEqual(["focus-refused", "focus-refused"]);
    expect(out.refusals.map((r) => r.reason)).toEqual(["focus-refused", "focus-refused"]);
  });

  it("skips a HIDDEN first candidate and focuses the second", () => {
    document.body.replaceChildren();
    makeInput(DESKTOP, { visible: false });
    makeInput(MOBILE);

    const out = focusFirstVisible(document, SYMBOL_SEARCH_TARGETS);
    expect(out.succeeded).toBe(true);
    expect(out.selected).toBe(MOBILE);
    expect(out.attempts).toEqual([
      { id: DESKTOP, outcome: "display-none" },
      { id: MOBILE, outcome: "focused" },
    ]);
  });

  it("skips a DISABLED first candidate and focuses the second", () => {
    document.body.replaceChildren();
    makeInput(DESKTOP, { disabled: true });
    makeInput(MOBILE);

    const out = focusFirstVisible(document, SYMBOL_SEARCH_TARGETS);
    expect(out.selected).toBe(MOBILE);
    expect(out.attempts[0]).toEqual({ id: DESKTOP, outcome: "disabled" });
  });

  it("records every attempt in the declared order", () => {
    document.body.replaceChildren();
    makeInput(DESKTOP, { visible: false });
    makeInput(MOBILE, { refusesFocus: true });

    const out = focusFirstVisible(document, SYMBOL_SEARCH_TARGETS);
    expect(out.requested).toEqual([...SYMBOL_SEARCH_TARGETS]);
    expect(out.attempts.map((a) => a.id)).toEqual([DESKTOP, MOBILE]);
    expect(out.succeeded).toBe(false);
  });

  it("identifies the target focus ACTUALLY landed on, not the one first tried", () => {
    document.body.replaceChildren();
    makeInput(DESKTOP, { refusesFocus: true });
    makeInput(MOBILE);

    const out = focusFirstVisible(document, SYMBOL_SEARCH_TARGETS);
    expect(out.selected).toBe(MOBILE);
    expect(out.focused).toBe(MOBILE);
    expect(out.selected).not.toBe(DESKTOP);
  });

  it("stays deterministic when the retry path is exercised repeatedly", () => {
    document.body.replaceChildren();
    makeInput(DESKTOP, { refusesFocus: true });
    makeInput(MOBILE);

    const first = focusFirstVisible(document, SYMBOL_SEARCH_TARGETS);
    (document.activeElement as HTMLElement)?.blur();
    const second = focusFirstVisible(document, SYMBOL_SEARCH_TARGETS);

    expect(second.selected).toBe(first.selected);
    expect(second.attempts).toEqual(first.attempts);
    expect(second.succeeded).toBe(true);
  });

  it("reports the no-layout fallback when it had to be used", () => {
    /*
     * Plain jsdom computes no layout, so every candidate measures as `no-rect`.
     * The helper falls back to ignoring rects — but ONLY when that was the sole
     * objection, and it says so. A fallback that ran silently is exactly the
     * kind of thing that reads as a bug six months later.
     */
    document.body.replaceChildren();
    for (const id of SYMBOL_SEARCH_TARGETS) {
      const el = document.createElement("input");
      el.id = id;
      el.type = "text";
      // No getClientRects override: real jsdom returns an empty list.
      document.body.appendChild(el);
    }

    const out = focusFirstVisible(document, SYMBOL_SEARCH_TARGETS);
    expect(out.usedNoLayoutFallback).toBe(true);
    expect(out.succeeded).toBe(true);
    expect(out.selected).toBe(DESKTOP);
  });

  it("does NOT claim the fallback when layout was available", () => {
    mountPair(MOBILE);
    const out = focusFirstVisible(document, SYMBOL_SEARCH_TARGETS);
    expect(out.usedNoLayoutFallback).toBe(false);
    expect(out.succeeded).toBe(true);
  });

  it("confirms focus rather than assuming focus() worked", () => {
    // A control that refuses focus must not be reported as focused. Nothing in
    // the return value is taken on trust from the call.
    document.body.replaceChildren();
    const el = document.createElement("input");
    el.id = DESKTOP;
    el.style.display = "block";
    Object.defineProperty(el, "getClientRects", {
      value: () => [{ width: 100, height: 20 }] as unknown as DOMRectList,
      configurable: true,
    });
    Object.defineProperty(el, "focus", { value: () => undefined, configurable: true });
    document.body.appendChild(el);

    const out = focusFirstVisible(document, [DESKTOP]);
    // `selected` now means "the id focus actually LANDED on", not "the id we
    // tried". Round 1.4 returned the attempted id here, which read as a partial
    // success; with the retry in place the distinction matters, because a
    // refusal is a reason to move on rather than a result. The attempt itself
    // is still recorded, so nothing is lost by the narrower meaning.
    expect(out.selected).toBeNull();
    expect(out.focused).not.toBe(DESKTOP);
    expect(out.succeeded).toBe(false);
    expect(out.attempts).toEqual([{ id: DESKTOP, outcome: "focus-refused" }]);
  });

  it("measureCandidate reads display, rects and disabled from the live element", () => {
    document.body.replaceChildren();
    const el = document.createElement("input");
    el.id = "probe-me";
    el.disabled = true;
    el.style.display = "none";
    document.body.appendChild(el);

    const m = measureCandidate(document, "probe-me");
    expect(m.exists).toBe(true);
    expect(m.display).toBe("none");
    expect(m.disabled).toBe(true);
    expect(m.hasRect).toBe(false);

    expect(measureCandidate(document, "not-there").exists).toBe(false);
  });
});
