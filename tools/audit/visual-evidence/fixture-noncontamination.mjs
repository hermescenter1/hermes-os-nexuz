/**
 * Phase 107 Stage 6-A — runtime proof that the harness does not touch the page.
 *
 * The source gate (`findForbiddenMutation`) proves the harness contains no
 * mutation API. That is necessary but not sufficient: a tool can still change a
 * page through an expression it builds at runtime. This runs the harness's real
 * measurement — the same `probe-expression.js` and the same
 * `Page.captureScreenshot` call that `sweep.mjs` makes — against a fixture page
 * and compares the DOM byte-for-byte on either side.
 *
 * The fixture deliberately contains the two things the Stage 5 driver used to
 * interfere with:
 *
 *   - a `<nextjs-portal>` element, which the retired `hide()` script suppressed
 *     with injected CSS. If anything hides it, the after-DOM still matches but
 *     the injected `<style id="__s5">` appears — which is why the style-element
 *     count is asserted too.
 *   - a running CSS animation, which the retired freeze mutated by forcing
 *     `currentTime` to its end and pausing it. A mutated animation shows up as a
 *     changed `playState`.
 *
 * Exit 0 = clean. Exit 1 = the harness contaminated the page.
 *
 * Usage: node tools/audit/visual-evidence/fixture-noncontamination.mjs
 */
import fs from "node:fs";
import path from "node:path";
import http from "node:http";
import crypto from "node:crypto";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import { attributeConsoleError } from "./contracts.mjs";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const CHROME = process.env.HERMES_CHROME || "C:/Program Files/Google/Chrome/Application/chrome.exe";
const PROBE = fs.readFileSync(path.join(HERE, "probe-expression.js"), "utf8");

const FIXTURE = `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><title>non-contamination fixture</title>
<style>
  @keyframes pulse { 0% { opacity: 1 } 50% { opacity: .4 } 100% { opacity: 1 } }
  .skeleton { animation: pulse 2s ease-in-out infinite; height: 40px; background: #223 }
  body { margin: 0; font: 14px system-ui; background: #0b0f14; color: #e6edf3 }
</style></head>
<body>
  <h1>Fixture</h1>
  <div class="skeleton" role="status" aria-label="Loading" aria-busy="true"></div>
  <p>A paragraph the harness must leave exactly as it is.</p>
  <button type="button">Named control</button>
  <img src="data:image/gif;base64,R0lGODlhAQABAAAAACw=" alt="pixel" width="1" height="1">
  <nextjs-portal data-fixture="dev-overlay-stand-in"></nextjs-portal>
</body></html>`;

const sha = (s) => crypto.createHash("sha256").update(s).digest("hex");

/* ── a real http origin, because file:// is not what the sweep measures ───── */
const server = http.createServer((_req, res) => {
  res.writeHead(200, { "content-type": "text/html; charset=utf-8" });
  res.end(FIXTURE);
});
await new Promise((r) => server.listen(0, "127.0.0.1", r));
const origin = `http://127.0.0.1:${server.address().port}/`;

const userDataDir = fs.mkdtempSync(path.join(process.env.TEMP || "/tmp", "hermes-fixture-"));
const chrome = spawn(CHROME, [
  "--headless=new",
  "--remote-debugging-port=0",
  `--user-data-dir=${userDataDir}`,
  "--no-first-run", "--no-default-browser-check", "--disable-gpu",
  "about:blank",
], { stdio: ["ignore", "ignore", "pipe"] });

/** Chrome prints its DevTools endpoint on stderr. */
const wsUrl = await new Promise((resolve, reject) => {
  const timer = setTimeout(() => reject(new Error("chrome did not start")), 30000);
  let buf = "";
  chrome.stderr.on("data", (d) => {
    buf += String(d);
    const m = buf.match(/ws:\/\/[^\s]+/);
    if (m) { clearTimeout(timer); resolve(m[0]); }
  });
});

let failures = 0;
const note = (ok, label, detail = "") => {
  if (!ok) failures++;
  console.log(`  ${ok ? "PASS" : "FAIL"}  ${label}${detail ? `\n          ${detail}` : ""}`);
};

const ws = new WebSocket(wsUrl);
await new Promise((r) => { ws.onopen = r; });

let id = 0;
const pending = new Map();
const consoleErrors = [];
ws.onmessage = (e) => {
  const msg = JSON.parse(e.data);
  if (msg.id && pending.has(msg.id)) {
    const { resolve, reject } = pending.get(msg.id);
    pending.delete(msg.id);
    if (msg.error) reject(new Error(`${msg.error.message} (${msg.error.code})`));
    else resolve(msg.result);
    return;
  }
  if (msg.method === "Runtime.exceptionThrown") {
    consoleErrors.push("exception: " + (msg.params?.exceptionDetails?.exception?.description || ""));
  }
  if (msg.method === "Log.entryAdded" && msg.params?.entry?.level === "error") {
    consoleErrors.push("log: " + String(msg.params.entry.text));
  }
};
/** The browser endpoint does not serve Page/Runtime; those need a page session. */
const raw = (method, params = {}, sessionId) =>
  new Promise((resolve, reject) => {
    const n = ++id;
    pending.set(n, { resolve, reject });
    ws.send(JSON.stringify({ id: n, method, params, ...(sessionId ? { sessionId } : {}) }));
    setTimeout(() => { if (pending.has(n)) { pending.delete(n); reject(new Error(`timeout ${method}`)); } }, 60000);
  });

const { targetId } = await raw("Target.createTarget", { url: "about:blank" });
const { sessionId } = await raw("Target.attachToTarget", { targetId, flatten: true });
const S = (method, params = {}) => raw(method, params, sessionId);

try {
  await S("Page.enable");
  await S("Runtime.enable");
  await S("Log.enable");

  await S("Page.navigate", { url: origin });
  // Settle: the fixture is static, so one paint is enough.
  await new Promise((r) => setTimeout(r, 1200));

  const domOf = async () =>
    (await S("Runtime.evaluate", { expression: "document.documentElement.outerHTML", returnByValue: true })).result.value;
  const animStateOf = async () =>
    (await S("Runtime.evaluate", {
      expression: "JSON.stringify(document.querySelectorAll('.skeleton')[0].getAnimations().map(a=>a.playState))",
      returnByValue: true,
    })).result.value;
  const styleCountOf = async () =>
    (await S("Runtime.evaluate", { expression: "document.querySelectorAll('style').length", returnByValue: true })).result.value;

  const before = { dom: await domOf(), anim: await animStateOf(), styles: await styleCountOf() };

  /* ── exactly what sweep.mjs does per cell ──────────────────────────────── */
  await S("Runtime.evaluate", { expression: "location.pathname+location.search", returnByValue: true });
  const probed = (await S("Runtime.evaluate", { expression: PROBE, returnByValue: true })).result.value;

  /**
   * Positive control. A check that only ever reports "clean" proves nothing, so
   * this reintroduces one of the retired contaminations on demand and the run
   * must go red. It exists solely for `mutation-proof.mjs`; without the flag
   * nothing here executes, and it lives in the audit tool, never in the product.
   */
  /* @audit-vocabulary-start
   * The two expressions below ARE the contamination, reproduced on purpose so
   * the check can be shown to detect it. They run only when the env flag is set,
   * which nothing but `mutation-proof.mjs` does. The rest of this file is
   * scanned by the same rule as every other harness source.
   */
  const inject = process.env.HERMES_FIXTURE_INJECT_MUTATION;
  if (inject === "hide") {
    // The retired Stage 5 script, verbatim in effect: hide the dev overlay.
    await S("Runtime.evaluate", {
      expression: "(()=>{const s=document.createElement('style');s.id='__s5';s.textContent='nextjs-portal{display:none !important}';document.head.appendChild(s);return 'ok'})()",
      returnByValue: true,
    });
  } else if (inject === "freeze") {
    // The retired animation freeze.
    await S("Runtime.evaluate", {
      expression: "document.querySelectorAll('*').forEach(e=>{try{e.getAnimations&&e.getAnimations().forEach(a=>{a.currentTime=(a.effect&&a.effect.getTiming().duration)||0;a.pause()})}catch(_){}}); 'ok'",
      returnByValue: true,
    });
  }
  /* @audit-vocabulary-end */

  await S("Page.captureScreenshot", { format: "png", captureBeyondViewport: false });

  const after = { dom: await domOf(), anim: await animStateOf(), styles: await styleCountOf() };

  console.log("non-contamination fixture");
  note(Boolean(probed), "the probe actually ran and returned measurements");
  note(sha(before.dom) === sha(after.dom), "DOM is byte-identical across probe + capture",
    sha(before.dom) === sha(after.dom) ? `sha256 ${sha(after.dom).slice(0, 16)}…` : `before ${sha(before.dom).slice(0, 16)}… after ${sha(after.dom).slice(0, 16)}…`);
  note(before.styles === after.styles, "no stylesheet was injected",
    `<style> count ${before.styles} → ${after.styles}`);
  note(before.anim === after.anim, "animations were not frozen or paused",
    `playState ${before.anim} → ${after.anim}`);
  note(/nextjs-portal/.test(after.dom), "the dev-overlay stand-in is still present, not hidden");
  note(!/__s5/.test(after.dom), "the retired hide() style element is absent");

  const harnessErrors = consoleErrors.filter((m) => attributeConsoleError(m) === "AUDIT_HARNESS");
  note(harnessErrors.length === 0, "no console error attributable to the harness",
    harnessErrors.length ? harnessErrors.join(" | ") : `${consoleErrors.length} console message(s), none from the harness`);

  console.log("");
  console.log(`AUDIT_HARNESS_CONSOLE_ERRORS=${harnessErrors.length}`);
  console.log(`HARNESS_DOM_MUTATION=${failures === 0 ? 0 : failures}`);
} finally {
  ws.close();
  chrome.kill();
  server.close();
  // Chrome releases its profile directory a moment after it exits; failing to
  // delete a temp folder must never mask the result of the check itself.
  try { fs.rmSync(userDataDir, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 }); }
  catch { /* a stale temp profile is harmless */ }
}

process.exit(failures === 0 ? 0 : 1);
