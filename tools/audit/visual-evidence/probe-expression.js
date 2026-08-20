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

  // Focusable but visually hidden — reachable by keyboard, invisible on screen.
  const hiddenFocusable = qa("a[href],button,input,select,textarea,[tabindex]").filter((el) => {
    if (el.getAttribute("tabindex") === "-1") return false;
    const r = el.getBoundingClientRect();
    const st = getComputedStyle(el);
    return (st.visibility === "hidden" || st.display === "none" || r.width === 0 || r.height === 0);
  }).length;

  return {
    title: document.title,
    lang: document.documentElement.lang,
    dir: document.documentElement.dir,
    h1Count: h1.length,
    h1Text: h1.map((h) => h.innerText.replace(/\s+/g, " ").trim().slice(0, 90)),
    hasMain: !!document.querySelector("main"),
    scrollHeight: Math.ceil(document.documentElement.scrollHeight),
    hOverflow: Math.max(0, document.body.scrollWidth - vw),
    overflowing, clipped, brokenImages,
    controlsNoName, inputsNoLabel, hiddenFocusable,
    textLen: text.length,
    text: text.slice(0, 400),
    persianChars: (text.match(/[؀-ۿ]/g) || []).length,
    latinChars: (text.match(/[A-Za-z]/g) || []).length,
    arabicYeKe: (text.match(/[يك]/g) || []).length,
    looksLoading: /\bloading\b|در حال بارگذاری|wird geladen/i.test(text) && text.length < 400,
    hasSpinner: qa("[role=progressbar],[aria-busy=true],.animate-spin").filter(visible).length > 0,
    looksEmpty: /no data|no results|nothing here|هیچ|keine daten|empty/i.test(lower),
    looksError: /something went wrong|error|failed|خطا|fehler/i.test(lower),
    hasRetry: /retry|try again|تلاش|erneut/i.test(lower),
  };
})()
