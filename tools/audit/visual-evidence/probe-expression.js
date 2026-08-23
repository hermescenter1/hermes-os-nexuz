/*
 * Phase 107 visual-evidence harness — the in-page measurement.
 *
 * Evaluated in the page during the SAME load that produces the screenshot, so
 * the pixels and the facts describing them cannot drift apart. Kept in its own
 * file rather than inline so it stays readable and reviewable.
 *
 * It reports observations only; every judgement about whether an observation is
 * a defect belongs to the verifier.
 */
(() => {
  const qa = (s) => Array.from(document.querySelectorAll(s));
  const visible = (el) => {
    if (!el) return false;
    const r = el.getBoundingClientRect();
    const st = getComputedStyle(el);
    return r.width > 0 && r.height > 0 && st.visibility !== "hidden" && st.display !== "none";
  };

  const h1 = qa("h1").filter(visible);
  const vw = document.documentElement.clientWidth;
  const vh = document.documentElement.clientHeight;
  const text = (document.body.innerText || "").replace(/\s+/g, " ").trim();
  const lower = text.toLowerCase();

  // Elements wider than the viewport that are not deliberately scrollable.
  const overflowing = qa("body *").filter((el) => {
    const r = el.getBoundingClientRect();
    if (r.width <= vw + 2 || r.left < -2) return false;
    const ox = getComputedStyle(el).overflowX;
    return ox !== "auto" && ox !== "scroll";
  }).slice(0, 5).map((el) => (el.tagName.toLowerCase() + (typeof el.className === "string" && el.className
    ? "." + el.className.split(/\s+/).slice(0, 2).join(".") : "")).slice(0, 80));

  // Text clipped by its own box — a common symptom of long German compounds.
  const clipped = qa("h1,h2,h3,p,span,a,button,li,td,th").filter(visible).filter((el) => {
    const st = getComputedStyle(el);
    if (st.overflow === "visible" && st.textOverflow !== "ellipsis") return false;
    return el.scrollWidth > el.clientWidth + 2 || el.scrollHeight > el.clientHeight + 2;
  }).slice(0, 5).map((el) => (el.innerText || "").trim().slice(0, 40));

  const brokenImages = qa("img").filter((i) => i.complete && i.naturalWidth === 0)
    .slice(0, 5).map((i) => (i.getAttribute("src") || "").slice(0, 80));

  const controlsNoName = qa("button,a,[role=button]").filter(visible).filter((el) =>
    !(el.innerText || "").trim() &&
    !el.getAttribute("aria-label") &&
    !el.getAttribute("title") &&
    !el.querySelector("img[alt]:not([alt=''])")).length;

  const inputsNoLabel = qa("input,select,textarea").filter(visible).filter((el) => {
    if (el.type === "hidden") return false;
    if (el.getAttribute("aria-label") || el.getAttribute("aria-labelledby") || el.getAttribute("title")) return false;
    if (el.id && document.querySelector(`label[for="${CSS.escape(el.id)}"]`)) return false;
    return !el.closest("label");
  }).length;

  /*
   * PHASE 107 FINAL R2 — SEQUENTIAL KEYBOARD REACHABILITY, asked of the browser.
   *
   * This signal answers one question: can a keyboard user land on a control they
   * cannot see? Three earlier versions got it wrong in three different ways, and
   * each was wrong in the direction that produced a comfortable number.
   *
   *   v1 counted `display:none` and `visibility:hidden`, which the browser
   *      removes from the tab order entirely — thousands of phantom findings
   *      from the app shell's `md:hidden` navigation twins.
   *
   *   v2 fixed that with `checkVisibility({checkOpacity: true})` and introduced
   *      the opposite error. `checkOpacity` reports FALSE for `opacity: 0`, but
   *      an opacity-zero control is still painted into the tab order:
   *
   *          <button style="opacity:0">Invisible but tabbable</button>
   *
   *      is exactly the hazard, and v2 filed it as "not rendered".
   *
   *   v2 also enumerated candidates from a literal selector list, special-cased
   *      the single string `tabindex="-1"`, tested only the horizontal axis, and
   *      compared post-focus geometry against the DOCUMENT width — so a control
   *      far below the fold, or with `tabindex="-2"`, or a `<summary>`, was
   *      never even considered.
   *
   * WHAT IS ASKED NOW, in order:
   *
   *   1. Is it in the sequential tab order? `el.tabIndex >= 0` is the browser's
   *      own answer and covers every default-focusable element — links with
   *      href, buttons, enabled form controls, `summary`, `iframe`, media with
   *      controls, `contenteditable` — and every negative tabindex, not just -1.
   *      Maintaining another literal vocabulary is what left gaps before.
   *
   *   2. Does it participate in rendering at all? `checkVisibility` WITHOUT
   *      `checkOpacity`, so `display:none`, `visibility:hidden` and
   *      `content-visibility` remove it — and `opacity: 0` deliberately does not.
   *
   *   3. Can the user actually see it, in BOTH axes of the viewport?
   *
   *   4. If not, can FOCUSING it bring it into view? The element is focused with
   *      scrolling ALLOWED and measured again, then every scroll position is
   *      restored. This is one behavioural test that covers both legitimate
   *      patterns at once — the skip link that reveals itself, and the control
   *      inside a scrollable strip that the browser scrolls into view — and it
   *      proves reachability instead of inferring it from an ancestor's CSS. A
   *      decorative `overflow-x: auto` that cannot actually reach the element no
   *      longer excuses it.
   */
  const EPS = 1;

  /** Effective opacity, including every ancestor that can zero it out. */
  const effectiveOpacity = (el) => {
    let o = 1;
    for (let n = el; n && n.nodeType === 1; n = n.parentElement) {
      const v = parseFloat(getComputedStyle(n).opacity);
      if (!Number.isNaN(v)) o *= v;
      if (o === 0) return 0;
    }
    return o;
  };

  /*
   * Visible means visible AFTER every clipping ancestor has had its say.
   *
   * A control inside a 200px-wide `overflow-x:auto` strip can sit at x=400 —
   * inside the viewport by its own rect, and completely clipped by the strip.
   * Testing the viewport alone called those "visible", which would have excused
   * exactly the scrollable-strip case this signal has to reason about. The
   * element's rect is intersected with the client rect of every ancestor that
   * clips, and finally with the viewport.
   */
  const visibleRect = (el) => {
    let r = el.getBoundingClientRect();
    let box = { left: r.left, top: r.top, right: r.right, bottom: r.bottom };
    for (let n = el.parentElement; n; n = n.parentElement) {
      const st = getComputedStyle(n);
      const clipsX = st.overflowX !== "visible";
      const clipsY = st.overflowY !== "visible";
      if (!clipsX && !clipsY) continue;
      const c = n.getBoundingClientRect();
      if (clipsX) { box.left = Math.max(box.left, c.left); box.right = Math.min(box.right, c.right); }
      if (clipsY) { box.top = Math.max(box.top, c.top); box.bottom = Math.min(box.bottom, c.bottom); }
    }
    box.left = Math.max(box.left, 0); box.top = Math.max(box.top, 0);
    box.right = Math.min(box.right, vw); box.bottom = Math.min(box.bottom, vh);
    return { width: box.right - box.left, height: box.bottom - box.top };
  };

  const isVisibleToUser = (el) => {
    const v = visibleRect(el);
    return v.width > EPS && v.height > EPS;
  };

  /** Every scrollable ancestor, so focus-induced scrolling can be undone. */
  const scrollChain = (el) => {
    const chain = [{ el: window, x: window.scrollX, y: window.scrollY }];
    for (let n = el.parentElement; n; n = n.parentElement) {
      if (n.scrollWidth > n.clientWidth + EPS || n.scrollHeight > n.clientHeight + EPS) {
        chain.push({ el: n, x: n.scrollLeft, y: n.scrollTop });
      }
    }
    return chain;
  };
  const restoreScroll = (chain) => {
    for (const s of chain) {
      if (s.el === window) window.scrollTo(s.x, s.y);
      else { s.el.scrollLeft = s.x; s.el.scrollTop = s.y; }
    }
  };

  const focusBreakdown = {
    notSequential: 0, notRendered: 0, reachableOnFocus: 0,
    invisibleOpacity: 0, zeroArea: 0, offViewport: 0, visible: 0,
  };

  /*
   * Anything that could plausibly take focus, so exclusions are COUNTED rather
   * than silently dropped. A breakdown that never mentions why an element was
   * skipped cannot be checked by anyone.
   */
  const POSSIBLY_INTERACTIVE =
    "a,area,button,input,select,textarea,summary,iframe,object,embed,audio,video,"
    + "[tabindex],[contenteditable]";

  const focusCandidates = [];
  for (const el of qa(POSSIBLY_INTERACTIVE)) {
    /*
     * `el.tabIndex >= 0` is the browser's own answer and handles every negative
     * value, not just the string "-1". `isContentEditable` is checked beside it
     * because Chrome reports tabIndex -1 for a contenteditable div even though
     * it IS sequentially focusable — relying on tabIndex alone missed it.
     */
    const sequential = (typeof el.tabIndex === "number" && el.tabIndex >= 0) || el.isContentEditable === true;
    if (!sequential || el.disabled || el.closest("[inert]") || el.closest("[hidden]")) {
      focusBreakdown.notSequential++;
      continue;
    }
    focusCandidates.push(el);
  }

  const hiddenFocusableEls = [];
  for (const el of focusCandidates) {
    const rendered = typeof el.checkVisibility === "function"
      // NOT checkOpacity: an opacity-zero control keeps its place in the tab order.
      ? el.checkVisibility({ checkVisibilityCSS: true, contentVisibilityAuto: true })
      : (getComputedStyle(el).visibility !== "hidden" && getComputedStyle(el).display !== "none");
    if (!rendered) { focusBreakdown.notRendered++; continue; }

    const r = el.getBoundingClientRect();
    const opaque = effectiveOpacity(el) > 0;
    if (opaque && isVisibleToUser(el)) { focusBreakdown.visible++; continue; }

    // Ask the page whether focusing makes it genuinely visible to the user.
    const prev = document.activeElement;
    const chain = scrollChain(el);
    let reachable = false;
    /*
     * SCROLLING MUST BE INSTANT, or the measurement races it.
     *
     * `el.focus()` scrolls the element into view, but under
     * `scroll-behavior: smooth` that scroll is ANIMATED — the rect read on the
     * next line still describes the old position. The first run of this rule
     * reported 540 "hazards" that were ordinary content below the fold, at
     * y=935..1524 on an 844px viewport: reachable by any user who scrolls.
     *
     * The behaviour is forced to `auto` for the duration of the probe and
     * `scrollIntoView` is called explicitly, so the question asked is the real
     * one — can this control be brought into view — rather than whether an
     * animation happened to have finished.
     */
    const rootStyle = document.documentElement.style;
    const priorBehavior = rootStyle.scrollBehavior;
    rootStyle.scrollBehavior = "auto";
    try {
      el.focus({ preventScroll: true });
      if (document.activeElement === el) {
        el.scrollIntoView({ block: "nearest", inline: "nearest" });
        reachable = effectiveOpacity(el) > 0 && isVisibleToUser(el);
      }
    } catch { /* an element that refuses focus is not a keyboard hazard */ }
    /*
     * RESTORE WHILE SCROLLING IS STILL INSTANT, then put the style back.
     *
     * Restoring after `scroll-behavior` returned to `smooth` left the page
     * ANIMATING back toward its original offset when the screenshot was taken.
     * Byte-identical cells went from 166 to 151 in one run: the auditor had
     * started perturbing the very page it photographs, which is the failure
     * this whole audit began with. The style is the last thing restored.
     */
    try {
      if (prev && typeof prev.focus === "function") prev.focus({ preventScroll: true });
      else if (el.blur) el.blur();
    } catch { /* ignore */ }
    restoreScroll(chain);
    rootStyle.scrollBehavior = priorBehavior;

    if (reachable) { focusBreakdown.reachableOnFocus++; continue; }
    if (!opaque) focusBreakdown.invisibleOpacity++;
    else if (r.width === 0 || r.height === 0) focusBreakdown.zeroArea++;
    else focusBreakdown.offViewport++;
    hiddenFocusableEls.push(el);
  }

  const hiddenFocusable = hiddenFocusableEls.length;
  const hiddenFocusableSamples = hiddenFocusableEls.slice(0, 5).map((el) => {
    const r = el.getBoundingClientRect();
    const cls = typeof el.className === "string" && el.className
      ? "." + el.className.split(/\s+/).slice(0, 3).join(".") : "";
    return el.tagName.toLowerCase() + cls
      + " " + Math.round(r.width) + "x" + Math.round(r.height)
      + " @" + Math.round(r.left) + "," + Math.round(r.top)
      + " tabIndex=" + el.tabIndex + " opacity=" + effectiveOpacity(el);
  });

  return {
    title: document.title,
    lang: document.documentElement.lang,
    dir: document.documentElement.dir,
    h1Count: h1.length,
    h1Text: h1.map((h) => h.innerText.replace(/\s+/g, " ").trim().slice(0, 90)),
    hasMain: !!document.querySelector("main"),
    scrollHeight: Math.ceil(document.documentElement.scrollHeight),
    hOverflow: Math.max(0, document.body.scrollWidth - vw),
    // Recorded so an overflow can be attributed without re-running the sweep.
    scrollWidth: document.body.scrollWidth,
    clientWidth: vw,
    widestElements: qa("body *").map((el) => {
      const r = el.getBoundingClientRect();
      return { w: Math.round(r.width), right: Math.round(r.right), tag: el.tagName.toLowerCase(),
        cls: String(el.className || "").split(/\s+/).slice(0, 4).join(".") };
    }).filter((e) => e.right > vw + 1).sort((a, b) => b.right - a.right).slice(0, 6),
    overflowing, clipped, brokenImages,
    controlsNoName, inputsNoLabel, hiddenFocusable, focusBreakdown, hiddenFocusableSamples,
    textLen: text.length,
    text: text.slice(0, 400),
    persianChars: (text.match(/[؀-ۿ]/g) || []).length,
    latinChars: (text.match(/[A-Za-z]/g) || []).length,
    arabicYeKe: (text.match(/[يك]/g) || []).length,
    /*
     * PHASE 107 STAGE 6-A — structural state.
     *
     * The five `looks*` fields below are kept for continuity with the Stage 5
     * pack, but nothing may be JUDGED from them: they are language regexes, and
     * they are why 27 healthy OT cells were reported as defects. The OT module
     * renders "Sign-in required", which matches no error word in any of the
     * three catalogues, and `looksLoading` fired for en and fa but not de on the
     * very same /crm page.
     *
     * These are the fields the verifier is allowed to use. Every one is a role,
     * an ARIA property, or the product's own `data-async-state` — none of them
     * change with the reader's language.
     */
    alerts: qa("[role=alert]").filter(visible).length,
    statuses: qa("[role=status]").filter(visible).length,
    progressbars: qa("[role=progressbar]").filter(visible).length,
    ariaBusy: qa("[aria-busy=true]").filter(visible).length > 0,
    // Every declared state on the page, deduplicated. Hidden nodes count: a
    // wrapper carrying the attribute uses `display: contents` and so has no box.
    asyncStates: Array.from(new Set(
      qa("[data-async-state]").map((el) => el.getAttribute("data-async-state")).filter(Boolean),
    )),
    // A recovery affordance identified by ROLE, not by the word on it.
    recoveryControls: qa("[role=alert] button, [role=alert] a[href], [data-async-state] button, [data-async-state] a[href]")
      .filter(visible)
      .map((el) => (el.getAttribute("aria-label") || el.textContent || "").replace(/\s+/g, " ").trim().slice(0, 40))
      .filter(Boolean).length,
    // Whether the consent dialog is still covering the page.
    consentDialog: qa("[data-consent-action]").filter(visible).length > 0,

    /* legacy, recorded but never judged — see the note above */
    looksLoading: /\bloading\b|در حال بارگذاری|wird geladen/i.test(text) && text.length < 400,
    hasSpinner: qa("[role=progressbar],[aria-busy=true],.animate-spin").filter(visible).length > 0,
    looksEmpty: /no data|no results|nothing here|هیچ|keine daten|empty/i.test(lower),
    looksError: /something went wrong|error|failed|خطا|fehler/i.test(lower),
    hasRetry: /retry|try again|تلاش|erneut/i.test(lower),
  };
})()
