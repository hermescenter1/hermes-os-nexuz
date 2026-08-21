#!/usr/bin/env node
/**
 * Phase 107 visual-evidence harness — authenticated sweep.
 *
 * Captures one screenshot per cell (route × locale × viewport) together with a
 * measurement taken in the SAME page load, so the pixels and the HTTP/DOM facts
 * describing them can never drift apart.
 *
 * AUTHENTICATION
 *   The browser signs in through the application's own login FORM. No token is
 *   minted, no cookie is injected, and no guard, middleware or RBAC rule is
 *   modified or bypassed. Chrome holds the HttpOnly session cookies; this
 *   process never reads their values.
 *
 *   Credentials come from the ENVIRONMENT only:
 *       HERMES_AUDIT_EMAIL, HERMES_AUDIT_PASSWORD
 *   They are passed straight into the form field and are never logged, never
 *   written to a record, and never rendered into a file name.
 *
 * SAFETY
 *   - evidence is refused inside the source tree unless --allow-inside-repo;
 *   - the base URL defaults to localhost and a non-local host requires
 *     --allow-remote, so the tool cannot casually be pointed at production;
 *   - a second concurrent writer exits with EXIT.LOCKED rather than corrupting
 *     the store.
 *
 * Usage:
 *   HERMES_AUDIT_EMAIL=… HERMES_AUDIT_PASSWORD=… \
 *   node tools/audit/visual-evidence/sweep.mjs <cells.json> <outDir> [options]
 *
 * Options:
 *   --base <url>            default http://localhost:3000
 *   --resume                skip cells already COMPLETE
 *   --allow-inside-repo     permit an output directory inside the repository
 *   --allow-remote          permit a non-localhost base URL
 *   --chrome <path>         explicit Chrome binary
 */
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import { EXIT, classifyAccess, checkFinalLocation } from "./contracts.mjs";
import { RecordStore, acquireLock, assertOutputOutsideRepo, LockHeldError } from "./record-store.mjs";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(HERE, "..", "..", "..");

const [, , cellsFile, outDirArg, ...rest] = process.argv;
const flag = (f) => rest.includes(f);
const arg = (f, d) => { const i = rest.indexOf(f); return i >= 0 ? rest[i + 1] : d; };

if (!cellsFile || !outDirArg) {
  console.error("usage: sweep.mjs <cells.json> <outDir> [--base url] [--resume] [--allow-inside-repo] [--allow-remote]");
  process.exit(EXIT.USAGE);
}

/* ── output location ───────────────────────────────────────────────────────── */
let outDir;
try {
  outDir = assertOutputOutsideRepo(outDirArg, REPO_ROOT, { allowInsideRepo: flag("--allow-inside-repo") });
} catch (e) {
  console.error(e.message);
  process.exit(EXIT.UNSAFE_OUTPUT);
}

/* ── target ────────────────────────────────────────────────────────────────── */
const BASE = arg("--base", "http://localhost:3000");
const host = (() => { try { return new URL(BASE).hostname; } catch { return ""; } })();
const isLocal = ["localhost", "127.0.0.1", "::1", "0.0.0.0"].includes(host);
if (!isLocal && !flag("--allow-remote")) {
  console.error(`refusing to sweep a non-local host (${host}). Pass --allow-remote to override.`);
  console.error("This tool is for local audit runs; it is not a production probe.");
  process.exit(EXIT.USAGE);
}

/* ── credentials: environment only ─────────────────────────────────────────── */
const EMAIL = process.env.HERMES_AUDIT_EMAIL;
const PASSWORD = process.env.HERMES_AUDIT_PASSWORD;
if (!EMAIL || !PASSWORD) {
  console.error("HERMES_AUDIT_EMAIL and HERMES_AUDIT_PASSWORD must be set in the environment.");
  console.error("They are never read from a file, never logged and never written to evidence.");
  process.exit(EXIT.NO_CREDENTIALS);
}

const cells = JSON.parse(fs.readFileSync(cellsFile, "utf8"));
const RUN_ID = `${Date.now().toString(36)}-${process.pid.toString(36)}`;

/* ── single-writer lock ────────────────────────────────────────────────────── */
let lock;
try {
  lock = acquireLock(outDir, RUN_ID);
} catch (e) {
  if (e instanceof LockHeldError) {
    console.error(`ABORT: ${e.message}`);
    console.error("A second writer is refused by design. Clear the lock only after proving the owner is dead.");
    process.exit(EXIT.LOCKED);
  }
  throw e;
}
process.on("exit", () => lock.release());
for (const sig of ["SIGINT", "SIGTERM", "SIGHUP"]) process.on(sig, () => { lock.release(); process.exit(130); });

const store = new RecordStore(outDir);
const { done } = flag("--resume") ? store.completed() : { done: new Set() };
console.log(`resume: ${done.size} cell(s) already complete (record + screenshot + matching hash)`);

/* ── browser ───────────────────────────────────────────────────────────────── */
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

const PORT = Number(arg("--cdp-port", "9339"));
const profile = fs.mkdtempSync(path.join(os.tmpdir(), "hermes-audit-"));
const chrome = spawn(findChrome(), [
  `--remote-debugging-port=${PORT}`, `--user-data-dir=${profile}`,
  "--headless=new", "--hide-scrollbars", "--disable-gpu", "--no-first-run",
  "--no-default-browser-check", "--disable-extensions", "--force-color-profile=srgb",
  "--font-render-hinting=none", "about:blank",
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

class Cdp {
  constructor(ws) {
    this.ws = ws; this.id = 0; this.pending = new Map(); this.handlers = new Map();
    ws.addEventListener("message", (ev) => {
      const m = JSON.parse(ev.data);
      if (m.id && this.pending.has(m.id)) {
        const { resolve, reject } = this.pending.get(m.id);
        this.pending.delete(m.id);
        if (m.error) reject(new Error(m.error.message));
        else resolve(m.result);
      } else if (m.method) {
        for (const h of (this.handlers.get(m.method) || [])) h(m.params);
      }
    });
  }
  send(method, params = {}, sessionId) {
    const id = ++this.id;
    return new Promise((res, rej) => {
      this.pending.set(id, { resolve: res, reject: rej });
      this.ws.send(JSON.stringify({ id, method, params, ...(sessionId ? { sessionId } : {}) }));
      setTimeout(() => { if (this.pending.has(id)) { this.pending.delete(id); rej(new Error(`timeout ${method}`)); } }, 120000);
    });
  }
  on(m, f) { if (!this.handlers.has(m)) this.handlers.set(m, []); this.handlers.get(m).push(f); }
  /* Handlers MUST be removable: a leaked load-event listener lets one route's
     event resolve the next route's wait, and the screenshot then shows the
     PREVIOUS page. */
  off(m, f) {
    const l = this.handlers.get(m); if (!l) return;
    const i = l.indexOf(f); if (i >= 0) l.splice(i, 1);
  }
}

const ws = new WebSocket(await wsUrl());
await new Promise((res, rej) => { ws.addEventListener("open", res); ws.addEventListener("error", rej); });
const cdp = new Cdp(ws);
const { targetId } = await cdp.send("Target.createTarget", { url: "about:blank" });
const { sessionId } = await cdp.send("Target.attachToTarget", { targetId, flatten: true });
const S = (m, p) => cdp.send(m, p, sessionId);

await S("Page.enable"); await S("Network.enable"); await S("Runtime.enable"); await S("Log.enable");

let docStatus = null;
const redirects = [];
cdp.on("Network.responseReceived", (p) => {
  if (p.type !== "Document") return;
  if (docStatus === null) docStatus = p.response.status;
  if (p.response.status >= 300 && p.response.status < 400) redirects.push(p.response.status);
});
let consoleErrors = [];
cdp.on("Runtime.exceptionThrown", (p) => consoleErrors.push("exception: " + String(p.exceptionDetails?.exception?.description || "").slice(0, 200)));
cdp.on("Log.entryAdded", (p) => { if (p.entry.level === "error") consoleErrors.push("log: " + String(p.entry.text).slice(0, 200)); });

async function navigate(url, settle) {
  let onLoad;
  const loaded = new Promise((res) => { onLoad = res; cdp.on("Page.loadEventFired", onLoad); setTimeout(res, 45000); });
  docStatus = null; redirects.length = 0; consoleErrors = [];
  await S("Page.navigate", { url });
  await loaded;
  cdp.off("Page.loadEventFired", onLoad);
  await sleep(settle);
}

/* Measurement taken in the same load as the screenshot. */
const PROBE = fs.readFileSync(path.join(HERE, "probe-expression.js"), "utf8");

/** Sign in through the real form. Credential values never leave this function. */
async function login() {
  await S("Emulation.setDeviceMetricsOverride", { width: 1440, height: 900, deviceScaleFactor: 1, mobile: false });
  await navigate(`${BASE}/en/auth/login`, 2500);
  const { result } = await S("Runtime.callFunctionOn", {
    functionDeclaration: `function(email, password){
      const setNative = (el, v) => {
        const d = Object.getOwnPropertyDescriptor(Object.getPrototypeOf(el), 'value');
        d.set.call(el, v);
        el.dispatchEvent(new Event('input', { bubbles: true }));
        el.dispatchEvent(new Event('change', { bubbles: true }));
      };
      const form = document.querySelector('form');
      if (!form) return 'NO_FORM';
      const em = form.querySelector('input[type=email], input[name=email], input[autocomplete=username]');
      const pw = form.querySelector('input[type=password]');
      if (!em || !pw) return 'NO_FIELDS';
      setNative(em, email); setNative(pw, password);
      const btn = form.querySelector('button[type=submit], button:not([type])');
      if (!btn) return 'NO_SUBMIT';
      btn.click();
      return 'SUBMITTED';
    }`,
    arguments: [{ value: EMAIL }, { value: PASSWORD }],
    objectId: (await S("Runtime.evaluate", { expression: "window", returnByValue: false })).result.objectId,
  });
  if (result.value !== "SUBMITTED") throw new Error(`login form interaction failed: ${result.value}`);
  await sleep(3000);
  const who = (await S("Runtime.evaluate", {
    expression: "fetch('/api/auth').then(r=>r.json()).then(j=>j.user?('ROLE:'+j.user.role):'ANON')",
    awaitPromise: true, returnByValue: true,
  })).result.value;
  return who;
}

const who = await login();
if (!String(who).startsWith("ROLE:")) {
  console.error("login did not produce a session — aborting rather than capturing anonymous pages");
  ws.close(); chrome.kill(); process.exit(EXIT.LOGIN_FAILED);
}
const sessionRole = String(who).slice(5);
console.log(`authenticated as role=${sessionRole}`);

let ok = 0, failed = 0, n = 0, lastViewport = null;
for (const cell of cells) {
  n++;
  if (done.has(cell.file)) continue;
  try {
    const vp = `${cell.width}x${cell.height}`;
    if (lastViewport !== vp) {
      await S("Emulation.setDeviceMetricsOverride", {
        width: cell.width, height: cell.height, deviceScaleFactor: 1,
        mobile: cell.width < 768, screenWidth: cell.width, screenHeight: cell.height,
      });
      lastViewport = vp;
    }

    const target = BASE + cell.url;
    await navigate(target, cell.wait ?? 1800);

    /*
     * Assert we are on the RIGHT page before measuring or photographing it.
     * A screenshot carries no URL, so a mis-timed navigation otherwise yields a
     * perfectly valid image of the wrong route. Checking only that `location`
     * was non-empty — the earlier behaviour — let any wrong-but-non-empty page
     * through, which is how four cells photographed the previous route.
     *
     * This runs BEFORE the probe and BEFORE captureScreenshot, so a mismatch
     * writes neither a PNG nor a record: the cell simply stays INCOMPLETE and
     * resume re-captures it.
     */
    const landed = (await S("Runtime.evaluate", { expression: "location.pathname+location.search", returnByValue: true })).result.value;
    const location = checkFinalLocation(cell, landed);
    if (!location.ok) throw new Error(location.reason);

    const d = (await S("Runtime.evaluate", { expression: PROBE, returnByValue: true })).result.value;
    if (!d) throw new Error("probe returned nothing (page not ready)");

    await S("Runtime.evaluate", { expression: "document.querySelectorAll('*').forEach(e=>{try{e.getAnimations&&e.getAnimations().forEach(a=>{a.currentTime=(a.effect&&a.effect.getTiming().duration)||0;a.pause()})}catch(_){}}); 'ok'" });
    const { data } = await S("Page.captureScreenshot", { format: "png", captureBeyondViewport: false });

    store.writeCell({
      runId: RUN_ID,
      cellId: cell.cellId ?? cell.file,
      route: cell.route, locale: cell.locale, viewport: vp,
      expectedCapability: cell.capability ?? null,
      requestedUrl: target, finalUrl: landed,
      httpState: docStatus,
      redirectChain: [...redirects],
      accessState: classifyAccess({ finalUrl: landed, httpState: docStatus, domText: d.text }),
      finalLocationCheck: location.reason,
      sessionRole,
      screenshotFile: cell.file,
      capturedAt: new Date().toISOString(),
      consoleErrors: consoleErrors.slice(0, 5),
      domSignals: d,
    }, Buffer.from(data, "base64"));

    ok++;
    console.log(`[${n}/${cells.length}] ${String(docStatus).padEnd(3)} ${cell.file}`);
  } catch (e) {
    failed++;
    console.log(`[${n}/${cells.length}] ERR ${cell.file} — ${e.message || e}`);
  }
}

console.log(`\ncaptured ${ok}, failed ${failed}, planned ${cells.length}`);
ws.close(); chrome.kill();

/*
 * A run that failed even one cell has NOT succeeded. Exiting 0 here would let a
 * supervisor record a partial pack as complete — which is exactly the class of
 * mistake this harness exists to prevent. The verifier remains the final judge
 * of completeness; the sweep's job is simply not to misreport its own outcome.
 */
process.exit(failed > 0 ? EXIT.CAPTURE_INCOMPLETE : EXIT.OK);
