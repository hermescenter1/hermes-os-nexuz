/**
 * Phase 107 FINAL R2 — adversarial controls for the keyboard-reachability auditor,
 * run in a REAL browser.
 *
 * The hidden-focusable signal has now been wrong three times, and each version
 * reported a comfortable number while being wrong:
 *
 *   v1  counted `display:none` / `visibility:hidden` — elements the browser has
 *       already removed from the tab order. 2412 phantom findings.
 *   v2  used `checkVisibility({checkOpacity: true})`, which reports FALSE for
 *       `opacity: 0` — so the one shape that IS a hazard, a fully tabbable
 *       invisible control, was filed as "not rendered". Zero findings, wrongly.
 *   v2  also enumerated candidates from a literal selector list, special-cased
 *       only the string `tabindex="-1"`, tested one axis, and compared
 *       post-focus geometry against the DOCUMENT rather than the viewport.
 *
 * Source-grepping cannot catch any of that. These controls load real HTML into
 * real Chrome, evaluate the REAL `probe-expression.js`, and assert the verdict
 * per fixture. Each fixture carries an id and the verdict it must receive.
 *
 * Usage: node docs/design/stage6a/focus-controls.mjs [--chrome <path>] [--cdp-port N]
 */
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const PROBE = fs.readFileSync(
  path.join(HERE, "..", "..", "..", "tools", "audit", "visual-evidence", "probe-expression.js"), "utf8");

const argv = process.argv.slice(2);
const arg = (f, d) => { const i = argv.indexOf(f); return i >= 0 ? argv[i + 1] : d; };
const PORT = Number(arg("--cdp-port", "9451"));

/*
 * Each fixture is one element, with the disposition the auditor must give it.
 * `hazard` means it must appear in `hiddenFocusable`.
 */
const FIXTURES = [
  { id: "display-none", hazard: false, bucket: "notRendered",
    why: "removed from the tab order by the browser; cannot be reached at all",
    html: `<button style="display:none">display none</button>` },

  { id: "visibility-hidden", hazard: false, bucket: "notRendered",
    why: "also removed from sequential navigation",
    html: `<button style="visibility:hidden">visibility hidden</button>` },

  { id: "opacity-zero", hazard: true, bucket: "invisibleOpacity",
    why: "THE hazard: fully tabbable, completely invisible. v2 called this notRendered",
    html: `<button style="opacity:0">opacity zero</button>` },

  { id: "opacity-zero-ancestor", hazard: true, bucket: "invisibleOpacity",
    why: "an ancestor can zero it out just as effectively",
    html: `<div style="opacity:0"><button>inside an opacity-0 wrapper</button></div>` },

  { id: "tabindex-minus-1", hazard: false, bucket: "notSequential",
    why: "programmatically focusable, but not part of Tab navigation",
    html: `<button tabindex="-1" style="opacity:0">tabindex -1</button>` },

  { id: "tabindex-minus-2", hazard: false, bucket: "notSequential",
    why: "v2 special-cased only the literal \"-1\"; every negative value is out",
    html: `<button tabindex="-2" style="opacity:0">tabindex -2</button>` },

  { id: "ordinary-visible", hazard: false, bucket: "visible",
    why: "the control everything else is measured against",
    html: `<button>ordinary</button>` },

  { id: "skip-link", hazard: false, bucket: "reachableOnFocus",
    why: "the standard pattern: 1x1 and clipped until focused, then a real control",
    html: `<a href="#main" class="skip">skip to content</a>`,
    css: `.skip{position:absolute;left:-9999px;width:1px;height:1px;overflow:hidden}
          .skip:focus{left:8px;top:8px;width:180px;height:40px;overflow:visible}` },

  { id: "far-right-no-scroll", hazard: true, bucket: "offViewport",
    /*
     * FIXED, not absolute. An absolutely-positioned control at x=5000 extends
     * the document, so the page genuinely scrolls to it on focus and the
     * auditor was RIGHT to call the first draft of this fixture reachable —
     * the fixture was wrong, not the detector. Fixed positioning cannot be
     * scrolled to, which is the hazard this control is meant to express.
     */
    why: "off to the side with nothing able to bring it back (fixed: scrolling cannot reach it)",
    html: `<div style="position:fixed;left:5000px;top:10px"><button>far right</button></div>` },

  { id: "above-viewport", hazard: true, bucket: "offViewport",
    why: "v2 tested the horizontal axis only, so this was invisible to it",
    html: `<div style="position:absolute;top:-4000px;left:10px"><button>above</button></div>` },

  { id: "below-viewport-fixed", hazard: true, bucket: "offViewport",
    why: "fixed positioning below the fold: scrolling cannot reach it",
    html: `<div style="position:fixed;top:5000px;left:10px"><button>below, fixed</button></div>` },

  { id: "scrollable-strip", hazard: false, bucket: "reachableOnFocus",
    why: "a legitimate horizontally scrolling tab strip; focus scrolls it into view",
    html: `<div class="strip"><button>t1</button><button>t2</button><button class="last">t-last</button></div>`,
    css: `.strip{width:200px;overflow-x:auto;white-space:nowrap}
          .strip button{display:inline-block;width:180px}` },

  { id: "fake-scroll-ancestor", hazard: true, bucket: "offViewport",
    why: "declares overflow-x:auto but the child is positioned OUT of the scrollport; CSS alone must not excuse it",
    html: `<div class="fakescroll"><span style="display:inline-block;width:400px"></span>
             <div style="position:fixed;left:6000px;top:10px"><button>unreachable</button></div></div>`,
    css: `.fakescroll{width:150px;overflow-x:auto}` },

  { id: "summary-element", hazard: true, bucket: "invisibleOpacity",
    why: "a default-focusable element the old literal selector never queried",
    html: `<details style="opacity:0"><summary>summary control</summary><p>body</p></details>` },

  { id: "contenteditable", hazard: true, bucket: "invisibleOpacity",
    why: "contenteditable is sequentially focusable and was never enumerated",
    html: `<div contenteditable="true" style="opacity:0">editable</div>` },

  {
    id: "below-the-fold-in-flow", hazard: false, bucket: ["reachableOnFocus", "visible"],
    /*
     * The false positive this rule produced on its first real run: 540
     * "hazards" that were ordinary content at y=935..1524 on an 844px viewport.
     * Everything below the fold is reachable — the user scrolls. The reveal test
     * has to scroll INSTANTLY to see that, because `scroll-behavior: smooth`
     * animates and the measurement would race the animation.
     */
    why: "ordinary content below the fold is reached by scrolling, not a hazard",
    html: `<div style="height:3000px"></div><button>far below, in flow</button>`,
  },
  {
    id: "below-the-fold-smooth-scroll", hazard: false, bucket: ["reachableOnFocus", "visible"],
    why: "the same, with smooth scrolling declared — the auditor must not race the animation",
    html: `<div class="smoothwrap"><div style="height:2500px"></div><button>below, smooth</button></div>`,
    css: `html{scroll-behavior:smooth} .smoothwrap{scroll-behavior:smooth}`,
  },
  { id: "disabled-input", hazard: false, bucket: "notSequential",
    why: "a disabled control is not focusable however it is styled",
    html: `<input disabled style="opacity:0" value="disabled">` },

  { id: "inert-subtree", hazard: false, bucket: "notSequential",
    why: "inert removes the whole subtree from interaction",
    html: `<div inert><button style="opacity:0">inside inert</button></div>` },
];

const page = `<!doctype html><html><head><meta charset="utf-8"><style>
  body{margin:0;font:14px system-ui}
  section{border:1px solid #ccc;margin:4px;padding:4px}
  ${FIXTURES.map((f) => f.css ?? "").join("\n")}
</style></head><body><main id="main">
${FIXTURES.map((f) => `<section data-fixture="${f.id}">${f.html}</section>`).join("\n")}
</main></body></html>`;

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "hermes-focus-controls-"));
const pagePath = path.join(tmp, "controls.html");
fs.writeFileSync(pagePath, page);

/* ── browser ──────────────────────────────────────────────────────────────── */
function findChrome() {
  const explicit = arg("--chrome", process.env.HERMES_AUDIT_CHROME);
  if (explicit) return explicit;
  const candidates = process.platform === "win32"
    ? ["C:/Program Files/Google/Chrome/Application/chrome.exe",
       "C:/Program Files (x86)/Google/Chrome/Application/chrome.exe"]
    : process.platform === "darwin"
      ? ["/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"]
      : ["/usr/bin/google-chrome", "/usr/bin/chromium", "/usr/bin/chromium-browser"];
  return candidates.find((c) => fs.existsSync(c)) || candidates[0];
}

const profile = fs.mkdtempSync(path.join(os.tmpdir(), "hermes-focus-profile-"));
const chrome = spawn(findChrome(), [
  `--remote-debugging-port=${PORT}`, `--user-data-dir=${profile}`,
  "--headless=new", "--hide-scrollbars", "--disable-gpu", "--no-first-run",
  "--no-default-browser-check", "--disable-extensions", "about:blank",
], { stdio: "ignore" });

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
async function wsUrl() {
  for (let i = 0; i < 60; i++) {
    try {
      const j = await (await fetch(`http://127.0.0.1:${PORT}/json/version`)).json();
      if (j.webSocketDebuggerUrl) return j.webSocketDebuggerUrl;
    } catch { /* not up yet */ }
    await sleep(500);
  }
  throw new Error("Chrome DevTools endpoint did not come up");
}

let exitCode = 1;
try {
  const ws = new WebSocket(await wsUrl());
  await new Promise((res) => ws.addEventListener("open", res));
  let id = 0;
  const pending = new Map();
  ws.addEventListener("message", (ev) => {
    const m = JSON.parse(ev.data);
    if (m.id && pending.has(m.id)) { pending.get(m.id)(m); pending.delete(m.id); }
  });
  const send = (method, params, sessionId) => new Promise((res) => {
    const msg = { id: ++id, method, params: params ?? {} };
    if (sessionId) msg.sessionId = sessionId;
    pending.set(msg.id, res);
    ws.send(JSON.stringify(msg));
  });

  const target = (await send("Target.createTarget", { url: "about:blank" })).result.targetId;
  const sessionId = (await send("Target.attachToTarget", { targetId: target, flatten: true })).result.sessionId;
  const S = (m, p) => send(m, p, sessionId);
  await S("Page.enable"); await S("Runtime.enable");
  await S("Emulation.setDeviceMetricsOverride", { width: 1000, height: 700, deviceScaleFactor: 1, mobile: false });

  await S("Page.navigate", { url: "file:///" + pagePath.split(path.sep).join("/") });
  await sleep(1200);

  /*
   * The probe reports counts, not identities. To assert PER FIXTURE, each
   * element is asked individually by running the same probe over a document
   * where only that fixture's section is present — impossible without reloading,
   * so instead the probe is run ONCE and the hazard identities are recovered
   * from the samples plus a per-fixture re-derivation using the probe's own
   * exported logic. Simpler and stricter: mark each fixture, then read which
   * marked sections contain a hazard.
   */
  const expr = `(() => {
    const probe = ${PROBE};
    const marks = {};
    for (const s of document.querySelectorAll("section[data-fixture]")) {
      marks[s.dataset.fixture] = { hazard: false };
    }
    return { probe, marks };
  })()`;
  const first = await S("Runtime.evaluate", { expression: expr, returnByValue: true, awaitPromise: true });
  if (first.result?.exceptionDetails) throw new Error("probe threw: " + JSON.stringify(first.result.exceptionDetails).slice(0, 300));
  const probeResult = first.result.result.value.probe;

  /*
   * Per-fixture verdicts: run the probe with every OTHER section removed, so the
   * counts describe exactly one fixture. Restored between runs.
   */
  const perFixture = {};
  for (const f of FIXTURES) {
    const one = `(() => {
      const keep = ${JSON.stringify(f.id)};
      const all = Array.from(document.querySelectorAll("section[data-fixture]"));
      const stash = [];
      for (const s of all) if (s.dataset.fixture !== keep) { stash.push([s, s.nextSibling, s.parentNode]); s.remove(); }
      let out;
      try { out = ${PROBE}; }
      finally { for (const [s, ref, parent] of stash) parent.insertBefore(s, ref); }
      return { hiddenFocusable: out.hiddenFocusable, breakdown: out.focusBreakdown, samples: out.hiddenFocusableSamples };
    })()`;
    const r = await S("Runtime.evaluate", { expression: one, returnByValue: true, awaitPromise: true });
    if (r.result?.exceptionDetails) throw new Error(`${f.id}: ` + JSON.stringify(r.result.exceptionDetails).slice(0, 200));
    perFixture[f.id] = r.result.result.value;
  }

  /*
   * THE PROBE MUST NOT MOVE THE PAGE IT PHOTOGRAPHS.
   *
   * The reveal test scrolls elements into view. When the scroll was restored
   * AFTER `scroll-behavior` had been put back to `smooth`, the page was still
   * animating when the screenshot was taken, and byte-identical cells dropped
   * from 166 to 151 across a run — the auditor corrupting its own evidence,
   * which is the failure this entire audit began with.
   *
   * Asserted directly: scroll the page somewhere, run the probe, and require
   * the offsets to be exactly where they were.
   */
  const perturb = await S("Runtime.evaluate", {
    expression: `(() => {
      window.scrollTo(0, 400);
      const before = { x: window.scrollX, y: window.scrollY };
      ${PROBE};
      const after = { x: window.scrollX, y: window.scrollY };
      return { before, after, stable: before.x === after.x && before.y === after.y };
    })()`,
    returnByValue: true, awaitPromise: true,
  });
  const scrollStable = perturb.result.result.value;
  console.log(`  ${scrollStable.stable ? "OK  " : "FAIL"} probe leaves scroll position untouched`);
  console.log(`         before ${JSON.stringify(scrollStable.before)} after ${JSON.stringify(scrollStable.after)}`);
  console.log("");

  let pass = 0;
  console.log(`page-wide probe: hiddenFocusable=${probeResult.hiddenFocusable}`);
  console.log(`page-wide breakdown: ${JSON.stringify(probeResult.focusBreakdown)}`);
  console.log("");
  for (const f of FIXTURES) {
    const got = perFixture[f.id];
    const isHazard = got.hiddenFocusable > 0;
    /*
     * A fixture may name one bucket or several. For a SAFE fixture, `visible`
     * and `reachableOnFocus` are both correct outcomes — which one occurs
     * depends on where the page happens to be scrolled, and each per-fixture
     * evaluation runs against a document whose height changed as other sections
     * were removed. Demanding one exact bucket there tests the harness's scroll
     * bookkeeping, not the auditor. The hazard verdict is still exact.
     */
    const wanted = Array.isArray(f.bucket) ? f.bucket : [f.bucket];
    const bucketHit = wanted.some((b) => (got.breakdown[b] ?? 0) > 0);
    const ok = isHazard === f.hazard && bucketHit;
    if (ok) pass++;
    console.log(`  ${ok ? "OK  " : "FAIL"} ${f.id.padEnd(28)} want ${f.hazard ? "HAZARD " : "safe   "} in ${wanted.join("|")}`);
    console.log(`         ${f.why}`);
    if (!ok) console.log(`         got hiddenFocusable=${got.hiddenFocusable} breakdown=${JSON.stringify(got.breakdown)} samples=${JSON.stringify(got.samples)}`);
  }

  console.log("");
  console.log(`FOCUS_CONTROLS_TOTAL=${FIXTURES.length}`);
  console.log(`FOCUS_CONTROLS_PASSED=${pass}`);
console.log(`PROBE_LEAVES_SCROLL_UNCHANGED=${scrollStable.stable ? "YES" : "NO"}`);
  console.log(`FOCUS_CONTROLS=${pass === FIXTURES.length && scrollStable.stable ? "PASS" : "FAIL"}`);
  exitCode = (pass === FIXTURES.length && scrollStable.stable) ? 0 : 1;
  ws.close();
} catch (e) {
  console.error("focus controls failed to run: " + (e?.message ?? e));
  exitCode = 2;
} finally {
  chrome.kill();
}
process.exit(exitCode);
