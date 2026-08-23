/**
 * Phase 107 Stage 6-A.1 — pin the refusal contract on the routes this stage changed.
 *
 * The sweep photographs pages. It cannot show what the Media and voice endpoints
 * put in a refusal BODY, and the body is where the defect lived: a 409 whose
 * code still read AUTHENTICATION_REQUIRED. This drives the same production
 * server with the same ephemeral identity and the same real form login, then
 * asserts the pairing directly.
 *
 * TWO CALLERS, because the contract is different for each and the difference is
 * the whole point:
 *
 *   anonymous  — no session at all. Every endpoint must answer 401
 *                AUTHENTICATION_REQUIRED, and every pre-authentication cause
 *                must be indistinguishable.
 *   signed in  — a real admin session. The server runs in session mode, so
 *                there is no organization store and no ACTIVE membership; the
 *                helper must answer 409 ORGANIZATION_CONTEXT_REQUIRED. Before
 *                this stage it answered 401, telling a signed-in administrator
 *                to sign in again.
 *
 * THE INVARIANT, asserted on every response: a refusal that is not 401 must not
 * carry an authentication label. That single rule is what the eight Media routes
 * and the voice guard each violated in their own way.
 *
 * Usage: node docs/design/stage6a/refusal-contract-probe.mjs --base <url> --out <file>
 *        credentials come from HERMES_AUDIT_EMAIL / HERMES_AUDIT_PASSWORD.
 */
import fs from "node:fs";
import path from "node:path";
import { spawn } from "node:child_process";

const argv = process.argv.slice(2);
const arg = (f, d) => { const i = argv.indexOf(f); return i >= 0 ? argv[i + 1] : d; };
const BASE = arg("--base", "http://localhost:3231");
const OUT = arg("--out", "refusal-contract.json");
const CHROME = process.env.HERMES_CHROME || "C:/Program Files/Google/Chrome/Application/chrome.exe";
const EMAIL = process.env.HERMES_AUDIT_EMAIL;
const PASSWORD = process.env.HERMES_AUDIT_PASSWORD;
if (!EMAIL || !PASSWORD) { console.error("credentials must come from the environment"); process.exit(2); }

/*
 * Every endpoint this stage edited, plus the guard that wraps them.
 *
 * METHOD AND CONTENT TYPE MATTER HERE. The three upload routes gate on
 * `content-type: multipart/form-data` and answer 415 BEFORE `requirePlatformAuth`
 * runs. A JSON probe therefore never reaches their refusal path at all — and
 * those three are the worst offenders this stage fixed, the ones that had both
 * the status and the code hard-coded. Probing them wrongly would have reported
 * a contract that was never exercised.
 */
const ENDPOINTS = [
  { m: "GET", u: "/api/media/assets" },
  { m: "POST", u: "/api/media/assets", body: {} },
  { m: "GET", u: "/api/media/assets/probe-id" },
  { m: "POST", u: "/api/media/assets/probe-id/transitions", body: {} },
  { m: "POST", u: "/api/media/assets/probe-id/poster/upload", multipart: true },
  { m: "POST", u: "/api/media/assets/probe-id/subtitles", multipart: true },
  { m: "POST", u: "/api/media/assets/probe-id/upload", multipart: true },
  { m: "GET", u: "/api/media/me/favourites" },
  { m: "GET", u: "/api/media/me/progress" },
  { m: "POST", u: "/api/copilot/voice/session", body: { locale: "en" } },
  { m: "POST", u: "/api/copilot/voice/query", body: { transcript: "status", locale: "en" } },
  { m: "POST", u: "/api/copilot/voice/speech", body: { text: "ok", grant: "v1.a.b.en.".padEnd(40, "0"), locale: "en" } },
];

/* Which labels may travel with which status. A 404 carries no refusal label. */
const CONSISTENT = {
  401: ["AUTHENTICATION_REQUIRED", "SESSION_AUTH_REQUIRED", "authentication_required"],
  403: ["FORBIDDEN", "INSUFFICIENT_PERMISSION", "forbidden"],
  404: ["NOT_FOUND", "not_found", null],
  409: ["ORGANIZATION_CONTEXT_REQUIRED", "ORGANIZATION_SCOPE_REQUIRED", "SITE_CONTEXT_REQUIRED"],
  500: ["INTERNAL_ERROR", "CONNECTION_FAILED", "COPILOT_UNAVAILABLE", "internal_error"],
};
const AUTH_LABELS = ["AUTHENTICATION_REQUIRED", "authentication_required", "SESSION_AUTH_REQUIRED"];

/*
 * TWO REFUSAL BODY SHAPES EXIST IN THIS PRODUCT, and both are legitimate.
 *
 *   { error: "...", code: "ORGANIZATION_CONTEXT_REQUIRED" }   most routes
 *   { ok: false, error: "ORGANIZATION_CONTEXT_REQUIRED" }     the upload family
 *
 * The second is `deny(status, code)` in the upload routes, which has always put
 * the machine-readable code in `error`. Reading only `code` reported those three
 * as carrying no label at all — a probe defect that would have been written up
 * as a product defect. The label is whichever field holds a known refusal code.
 */
const KNOWN_CODES = new Set(Object.values(CONSISTENT).flat().filter(Boolean));
const labelOf = (body) => {
  if (!body) return null;
  if (body.code) return body.code;
  if (typeof body.error === "string" && KNOWN_CODES.has(body.error)) return body.error;
  return null;
};

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/* ── 1. anonymous, straight from node — no cookie jar, no session ──────────── */
/** A minimal multipart body, so the content-type gate lets the request through. */
function multipartBody() {
  const fd = new FormData();
  fd.append("file", new Blob([new Uint8Array([0])], { type: "application/octet-stream" }), "probe.bin");
  return fd;
}

const anonymous = [];
for (const e of ENDPOINTS) {
  const res = await fetch(BASE + e.u, {
    method: e.m,
    // FormData sets its own boundary; never set content-type by hand for it.
    headers: e.body ? { "content-type": "application/json" } : {},
    body: e.multipart ? multipartBody() : e.body ? JSON.stringify(e.body) : undefined,
  });
  let body = null;
  try { body = await res.json(); } catch { /* non-JSON refusal */ }
  anonymous.push({ ...e, status: res.status, code: labelOf(body), raw: JSON.stringify(body ?? "").slice(0, 200) });
}

/* ── 2. signed in, through the real login form ────────────────────────────── */
const userDataDir = fs.mkdtempSync(path.join(process.env.TEMP || "/tmp", "hermes-probe-"));
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
ws.onmessage = (ev) => {
  const m = JSON.parse(ev.data);
  if (m.id && pending.has(m.id)) {
    const { resolve, reject } = pending.get(m.id); pending.delete(m.id);
    return m.error ? reject(new Error(m.error.message)) : resolve(m.result);
  }
};
const raw = (method, params = {}, sessionId) => new Promise((resolve, reject) => {
  const n = ++id; pending.set(n, { resolve, reject });
  ws.send(JSON.stringify({ id: n, method, params, ...(sessionId ? { sessionId } : {}) }));
  setTimeout(() => { if (pending.has(n)) { pending.delete(n); reject(new Error(`timeout ${method}`)); } }, 60000);
});

const { targetId } = await raw("Target.createTarget", { url: "about:blank" });
const { sessionId } = await raw("Target.attachToTarget", { targetId, flatten: true });
const S = (m, p) => raw(m, p, sessionId);
await S("Page.enable"); await S("Runtime.enable");

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
if (!String(who).startsWith("ROLE:")) {
  console.error("no session — refusing to report a signed-in contract from an anonymous caller");
  process.exit(3);
}
console.log(`authenticated as ${who}`);

const authenticated = [];
for (const e of ENDPOINTS) {
  const init = e.multipart
    ? `{method:'POST',body:(()=>{const f=new FormData();`
      + `f.append('file',new Blob([new Uint8Array([0])],{type:'application/octet-stream'}),'probe.bin');return f;})()}`
    : `{method:${JSON.stringify(e.m)}`
      + (e.body ? `,headers:{'content-type':'application/json'},body:${JSON.stringify(JSON.stringify(e.body))}` : "")
      + `}`;
  const expr = `fetch(${JSON.stringify(e.u)},${init}).then(async r=>JSON.stringify({s:r.status,b:await r.text()}))`;
  const v = (await S("Runtime.evaluate", { expression: expr, awaitPromise: true, returnByValue: true })).result.value;
  const { s, b } = JSON.parse(v);
  let body = null;
  try { body = JSON.parse(b); } catch { /* non-JSON */ }
  authenticated.push({ ...e, status: s, code: labelOf(body), raw: String(b).slice(0, 200) });
}

try { ws.close(); chrome.kill(); } catch { /* already gone */ }

/* ── 3. judge ─────────────────────────────────────────────────────────────── */
const violations = [];
const check = (caller, rows) => {
  for (const r of rows) {
    const allowed = CONSISTENT[r.status];
    if (r.status >= 400) {
      if (!allowed) violations.push({ caller, ...r, why: `unexpected refusal status ${r.status}` });
      else if (!allowed.includes(r.code)) violations.push({ caller, ...r, why: `code ${r.code} cannot travel with ${r.status}` });
      if (r.status !== 401 && AUTH_LABELS.includes(r.code)) {
        violations.push({ caller, ...r, why: `THE DEFECT: ${r.status} carrying an authentication label` });
      }
    }
  }
};
check("anonymous", anonymous);
check("signed-in", authenticated);

/* Anti-enumeration: every anonymous refusal must look the same. */
const anonShapes = new Set(anonymous.filter((r) => r.status === 401).map((r) => `${r.status}:${r.code}`));

console.log("");
console.log("## anonymous");
for (const r of anonymous) console.log(`   ${String(r.status).padEnd(4)} ${String(r.code ?? "-").padEnd(30)} ${r.m} ${r.u}`);
console.log("");
console.log("## signed in (session mode: no organization store by design)");
for (const r of authenticated) console.log(`   ${String(r.status).padEnd(4)} ${String(r.code ?? "-").padEnd(30)} ${r.m} ${r.u}`);
console.log("");
if (violations.length) {
  console.log("## violations");
  for (const v of violations) console.log(`   ${v.caller} ${v.m} ${v.u} -> ${v.status}/${v.code}: ${v.why}`);
}

const mediaViolations = violations.filter((v) => v.u.startsWith("/api/media/"));
const voiceViolations = violations.filter((v) => v.u.startsWith("/api/copilot/voice/"));

console.log(`ENDPOINTS_PROBED=${ENDPOINTS.length * 2}`);
console.log(`ANON_401_DISTINCT_SHAPES=${anonShapes.size}`);
console.log(`MEDIA_REFUSAL_FORWARDING_EXCEPTIONS=${mediaViolations.length}`);
console.log(`VOICE_REFUSAL_FORWARDING_EXCEPTIONS=${voiceViolations.length}`);
console.log(`REFUSAL_CONTRACT_VIOLATIONS=${violations.length}`);
/*
 * PHASE 107 FINAL R4 - PROBE_MODE, because a placeholder must never be able to
 * satisfy a runtime gate.
 *
 * A no-op launcher that writes a plausible-looking REFUSAL-CONTRACT.json and
 * exits 0 would have produced REFUSAL_CONTRACT_VIOLATIONS=0 and closed the
 * phase without a server ever running. The gate therefore cannot ask "were
 * there violations"; it must first ask "did this measurement happen at all".
 *
 * LIVE is not self-declared. It is DERIVED from the responses, and every part
 * of it is something a stub cannot fake without actually doing the work:
 *
 *   1. every probed endpoint returned an integer HTTP status;
 *   2. both callers covered the full endpoint list;
 *   3. the signed-in caller produced at least one response shape the anonymous
 *      caller never produced.
 *
 * (3) is the load-bearing one. If the form login silently failed - the exact
 * hazard where a probe quietly collects a run of login pages and reports a
 * pass - the authenticated pass would return the same 401 shapes as the
 * anonymous pass, and this refuses to call itself LIVE.
 */
const anonShapeSet = new Set(anonymous.map((r) => `${r.status}:${r.code}`));
const authShapeSet = new Set(authenticated.map((r) => `${r.status}:${r.code}`));
const allHaveStatus = [...anonymous, ...authenticated].every((r) => Number.isInteger(r.status));
const bothCallersComplete = anonymous.length === ENDPOINTS.length && authenticated.length === ENDPOINTS.length;
const sessionChangedBehaviour = [...authShapeSet].some((shape) => !anonShapeSet.has(shape));
const PROBE_MODE = (allHaveStatus && bothCallersComplete && sessionChangedBehaviour) ? "LIVE" : "INCONCLUSIVE";

console.log(`PROBE_BASE=${BASE}`);
console.log(`PROBE_ENDPOINTS_WITH_STATUS=${[...anonymous, ...authenticated].filter((r) => Number.isInteger(r.status)).length}/${ENDPOINTS.length * 2}`);
console.log(`PROBE_SESSION_CHANGED_BEHAVIOUR=${sessionChangedBehaviour ? "YES" : "NO"}`);
console.log(`PROBE_MODE=${PROBE_MODE}`);


fs.writeFileSync(OUT, JSON.stringify({
  base: BASE, probeMode: PROBE_MODE,
  liveEvidence: { allHaveStatus, bothCallersComplete, sessionChangedBehaviour },
  anonymous, authenticated, violations,
}, null, 2));
/* A probe that cannot prove it ran is a failure, not a pass. */
process.exit((violations.length || PROBE_MODE !== "LIVE") ? 1 : 0);
