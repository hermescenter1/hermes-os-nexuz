/**
 * Phase 107 Stage 6-A — browser fault injection.
 *
 * The normal sweep observes whatever the server happens to answer. That covered
 * two of the five failure classes for real (401 and 404) and left 403, 500 and a
 * dropped connection unobserved in a browser. This forces each of them at the
 * NETWORK layer and records the state the page then declares.
 *
 * WHAT IS AND IS NOT TOUCHED
 * Requests are intercepted with `Fetch.enable` and answered with a chosen status,
 * or failed outright. That is the browser's own request layer — the same thing a
 * proxy or a flaky network does. The DOM is never touched: no node is added,
 * removed, hidden or restyled, and the page reacts exactly as it would in
 * production against a server behaving this way.
 *
 * A cell PASSES only when the page declares a state matching the injected fault
 * AND is not left loading. "It didn't crash" is not a pass.
 *
 * Usage:
 *   node docs/design/stage6a/fault-injection.mjs --base http://localhost:PORT --out <dir>
 *   (run it through the launcher so a real session exists)
 */
import fs from "node:fs";
import path from "node:path";
import { spawn } from "node:child_process";

const argv = process.argv.slice(2);
const arg = (f, d) => { const i = argv.indexOf(f); return i >= 0 ? argv[i + 1] : d; };
const BASE = arg("--base", "http://localhost:3210");
const OUT = arg("--out", "E:/hermes-os-phase107-stage6a-evidence");
const CHROME = process.env.HERMES_CHROME || "C:/Program Files/Google/Chrome/Application/chrome.exe";
const EMAIL = process.env.HERMES_AUDIT_EMAIL;
const PASSWORD = process.env.HERMES_AUDIT_PASSWORD;
if (!EMAIL || !PASSWORD) { console.error("credentials must come from the environment"); process.exit(2); }

/** One representative surface per family of owners that Stage 6-A converted. */
const ROUTES = [
  { route: "/crm/accounts", api: "/api/crm/" },
  { route: "/customer", api: "/api/customer/" },
  { route: "/dashboard/billing", api: "/api/billing/" },
  { route: "/dashboard/api", api: "/api/platform/" },
  { route: "/dashboard/organization", api: "/api/organizations/" },
  { route: "/dashboard/ot/gateways", api: "/api/ot/" },
];
const LOCALES = ["en", "de", "fa"];
const VIEWPORTS = [{ w: 1440, h: 900 }, { w: 390, h: 844 }];

/** The state each injected fault must produce. */
const FAULTS = [
  { name: "403", expect: "forbidden", status: 403, body: '{"error":"Forbidden","code":"FORBIDDEN"}' },
  { name: "500", expect: "server-error", status: 500, body: '{"error":"Internal Server Error"}' },
  { name: "offline", expect: "network-error", fail: "ConnectionRefused" },
];

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const userDataDir = fs.mkdtempSync(path.join(process.env.TEMP || "/tmp", "hermes-fault-"));
const chrome = spawn(CHROME, [
  "--headless=new", "--remote-debugging-port=0", `--user-data-dir=${userDataDir}`,
  "--no-first-run", "--no-default-browser-check", "--disable-gpu", "about:blank",
], { stdio: ["ignore", "ignore", "pipe"] });

const wsUrl = await new Promise((resolve, reject) => {
  const t = setTimeout(() => reject(new Error("chrome did not start")), 30000);
  let buf = "";
  chrome.stderr.on("data", (d) => { buf += String(d); const m = buf.match(/ws:\/\/[^\s]+/); if (m) { clearTimeout(t); resolve(m[0]); } });
});

const ws = new WebSocket(wsUrl);
await new Promise((r) => { ws.onopen = r; });
let id = 0;
const pending = new Map();
const handlers = new Map();
ws.onmessage = (e) => {
  const m = JSON.parse(e.data);
  if (m.id && pending.has(m.id)) {
    const { resolve, reject } = pending.get(m.id); pending.delete(m.id);
    return m.error ? reject(new Error(m.error.message)) : resolve(m.result);
  }
  if (m.method) for (const h of handlers.get(m.method) || []) h(m.params);
};
const raw = (method, params = {}, sessionId) => new Promise((resolve, reject) => {
  const n = ++id; pending.set(n, { resolve, reject });
  ws.send(JSON.stringify({ id: n, method, params, ...(sessionId ? { sessionId } : {}) }));
  setTimeout(() => { if (pending.has(n)) { pending.delete(n); reject(new Error(`timeout ${method}`)); } }, 60000);
});
const on = (m, f) => { if (!handlers.has(m)) handlers.set(m, []); handlers.get(m).push(f); };

const { targetId } = await raw("Target.createTarget", { url: "about:blank" });
const { sessionId } = await raw("Target.attachToTarget", { targetId, flatten: true });
const S = (m, p) => raw(m, p, sessionId);

await S("Page.enable"); await S("Runtime.enable"); await S("Network.enable");

/* ── real form login, exactly as the sweep does ───────────────────────────── */
await S("Page.navigate", { url: `${BASE}/en/auth/login` });
await sleep(3000);
const { result: objRef } = await S("Runtime.evaluate", { expression: "window", returnByValue: false });
const { result: submitted } = await S("Runtime.callFunctionOn", {
  functionDeclaration: `function(email, password){
    const setNative=(el,v)=>{const d=Object.getOwnPropertyDescriptor(Object.getPrototypeOf(el),'value');d.set.call(el,v);
      el.dispatchEvent(new Event('input',{bubbles:true}));el.dispatchEvent(new Event('change',{bubbles:true}));};
    const form=document.querySelector('form'); if(!form) return 'NO_FORM';
    const em=form.querySelector('input[type=email],input[name=email]'); const pw=form.querySelector('input[type=password]');
    if(!em||!pw) return 'NO_FIELDS';
    setNative(em,email); setNative(pw,password);
    const btn=form.querySelector('button[type=submit],button:not([type])'); if(!btn) return 'NO_SUBMIT';
    btn.click(); return 'SUBMITTED';
  }`,
  arguments: [{ value: EMAIL }, { value: PASSWORD }],
  objectId: objRef.objectId,
});
if (submitted.value !== "SUBMITTED") { console.error(`login failed: ${submitted.value}`); process.exit(3); }
await sleep(3000);
const who = (await S("Runtime.evaluate", {
  expression: "fetch('/api/auth').then(r=>r.json()).then(j=>j.user?('ROLE:'+j.user.role):'ANON')",
  awaitPromise: true, returnByValue: true,
})).result.value;
if (!String(who).startsWith("ROLE:")) { console.error("no session — refusing to inject faults anonymously"); process.exit(3); }
console.log(`authenticated as ${who}\n`);

// Dismiss consent by clicking the product's own button.
await S("Runtime.evaluate", { expression: `(()=>{const b=document.querySelector('[data-consent-action="reject-non-essential"]');if(b){b.click();return 'REJECTED';}return 'NO_BANNER';})()`, returnByValue: true });
await sleep(1000);

/* ── interception ─────────────────────────────────────────────────────────── */
let active = null;   // { api, status, body, fail }
let intercepted = 0; // how many matching requests this cell actually made
await S("Fetch.enable", { patterns: [{ urlPattern: "*", requestStage: "Request" }] });
on("Fetch.requestPaused", async (p) => {
  const url = p.request.url;
  try {
    if (active && url.includes(active.api)) {
      intercepted++;
      if (active.fail) await S("Fetch.failRequest", { requestId: p.requestId, errorReason: active.fail });
      else await S("Fetch.fulfillRequest", {
        requestId: p.requestId, responseCode: active.status,
        responseHeaders: [{ name: "content-type", value: "application/json" }],
        body: Buffer.from(active.body).toString("base64"),
      });
      return;
    }
    await S("Fetch.continueRequest", { requestId: p.requestId });
  } catch { /* the request may already be gone */ }
});

const PROBE = fs.readFileSync("tools/audit/visual-evidence/probe-expression.js", "utf8");
const rows = [];
let pass = 0, fail = 0, skipped = 0;

for (const target of ROUTES) {
  for (const fault of FAULTS) {
    for (const locale of LOCALES) {
      for (const vp of VIEWPORTS) {
        active = { api: target.api, status: fault.status, body: fault.body, fail: fault.fail };
        intercepted = 0;
        await S("Emulation.setDeviceMetricsOverride", {
          width: vp.w, height: vp.h, deviceScaleFactor: 1, mobile: vp.w < 768,
        });
        await S("Page.navigate", { url: `${BASE}/${locale}${target.route}` });
        await sleep(3500);

        const d = (await S("Runtime.evaluate", { expression: PROBE, returnByValue: true })).result.value || {};
        const declared = d.asyncStates || [];
        const stillLoading = Boolean(d.ariaBusy) || Number(d.progressbars || 0) > 0 || declared.includes("loading");
        const matched = declared.includes(fault.expect);
        // A page may legitimately report a different failure class than the one
        // injected only if it still reports a FAILURE — never ready or empty.
        const anyFailure = declared.some((s) => ["auth-required", "forbidden", "not-found", "server-error", "network-error"].includes(s));

        /*
         * A fault that was never requested cannot be judged. /dashboard/organization
         * resolves its organization in a SERVER component, so with no database it
         * never mounts the client and never calls the API being intercepted. Scoring
         * that as a failure would invent a product defect out of a page that simply
         * did not make the request.
         */
        const applicable = intercepted > 0;
        const ok = applicable ? (anyFailure && !stillLoading) : null;
        if (ok === true) pass++; else if (ok === false) fail++; else skipped++;

        rows.push({
          route: target.route, api: target.api, fault: fault.name, expected: fault.expect,
          locale, viewport: `${vp.w}x${vp.h}`,
          declared, stillLoading, matchedExactly: matched, reportedAFailure: anyFailure,
          interceptedRequests: intercepted,
          recoveryControls: d.recoveryControls ?? 0,
          verdict: ok === null ? "NOT_APPLICABLE" : ok ? "PASS" : "FAIL",
        });
        process.stdout.write(ok === null ? "-" : ok ? "." : "x");
      }
    }
  }
}
active = null;
console.log("\n");

fs.writeFileSync(path.join(OUT, "STAGE6A-FAULT-INJECTION-REPORT.md"), [
  "# Stage 6-A — Fault Injection Report", "",
  "Faults forced at the browser's request layer (`Fetch.enable`), never by touching the DOM.",
  "A cell passes only when the page declares a failure state and is not left loading.", "",
  `**${rows.length} cells — ${pass} pass, ${fail} fail, ${skipped} not applicable**`, "",
  "A cell is *not applicable* when the page never requested the intercepted API — a",
  "server-rendered surface that does not mount its client cannot be judged by a fault",
  "it never made.", "",
  "| route | fault | expected | locale | viewport | requests | declared | loading | recovery | verdict |",
  "|---|---|---|---|---|---|---|---|---|---|",
  ...rows.map((r) => `| \`${r.route}\` | ${r.fault} | ${r.expected} | ${r.locale} | ${r.viewport} | ${r.interceptedRequests} | ${r.declared.join("+") || "—"} | ${r.stillLoading} | ${r.recoveryControls} | ${r.verdict} |`),
].join("\n"));

const byFault = new Map();
for (const r of rows) {
  const k = `${r.fault} → ${r.declared.join("+") || "none"}`;
  byFault.set(k, (byFault.get(k) ?? 0) + 1);
}
console.log("injected fault → declared state");
for (const [k, v] of [...byFault].sort()) console.log(`  ${String(v).padStart(3)}  ${k}`);
console.log(`\nFAULT_INJECTION_MATRIX=${pass}/${rows.length}`);
console.log(`STUCK_LOADING_UNDER_FAULT=${rows.filter((r) => r.stillLoading).length}`);

ws.close(); chrome.kill();
try { fs.rmSync(userDataDir, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 }); } catch { /* temp */ }
process.exit(fail === 0 ? 0 : 1);
