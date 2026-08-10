#!/usr/bin/env node
/**
 * PHASE 99 — INTERNAL security & pilot readiness evaluation.
 *
 *   npm run eval:phase99:readiness
 *
 * This evaluator answers exactly one question: has this repository done the
 * internal work that must be finished BEFORE an external reviewer or a pilot
 * customer is asked to spend their time? It is offline, deterministic and
 * fail-closed, and it is emphatically NOT the phase's closure gate — an
 * independent penetration test and a pilot acceptance cannot be produced from
 * inside the repository, and `eval:phase99:closure` is where those are judged.
 *
 * Three outcome states, kept distinct on purpose:
 *   PASS         — the invariant holds, proven here.
 *   BLOCKED_OWNER— the work is done, but a decision only the owner can make is
 *                  outstanding (a dependency upgrade, a pilot selection).
 *                  Never silently upgraded to PASS.
 *   FAIL         — the invariant does not hold. Exits non-zero.
 *
 * Emits human-readable RESULT lines and writes phase99-readiness.json with safe
 * fields only: counters, classifications and file references. No secrets, no
 * personal data, no request payloads.
 */

import { readFileSync, existsSync, writeFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { createHash } from "node:crypto";

import {
  rawSqlInventory,
  outboundSinkInventory,
  userControlledSinkScan,
  htmlSinkInventory,
  uploadSurfaceInventory,
  cookieSecurityReview,
  errorHygieneReview,
  infrastructureReview,
} from "../security/phase99/static-invariants.mjs";
import { buildRouteInventory, summarizeInventory, stripComments } from "../security/phase99/route-inventory.mjs";
import { analyzeTenantPredicates } from "../security/phase99/tenant-predicates.mjs";
import { evaluateRegistry } from "../security/phase99/finding-contract.mjs";
import { scanPhase99Artifacts } from "../security/phase99/data-hygiene.mjs";
import {
  computeScopeHash,
  validateExternalAttestation,
  validatePilotAcceptance,
  resolveGate,
} from "../security/phase99/external-evidence.mjs";

const REPO = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const rel = (p) => join(REPO, ...p.split("/"));
const read = (p) => (existsSync(rel(p)) ? readFileSync(rel(p), "utf8") : null);
const readJson = (p) => { const t = read(p); if (!t) return null; try { return JSON.parse(t); } catch { return null; } };

const groups = {};
const details = {};
let anyFail = false;

function group(name, fn) {
  const errors = [];
  const notes = [];
  let state = "PASS";
  const check = (cond, msg) => { if (!cond) errors.push(msg); };
  const blockOwner = (msg) => { state = "BLOCKED_OWNER"; notes.push(msg); };
  const note = (k, v) => { details[name] = { ...(details[name] ?? {}), [k]: v }; };
  try {
    fn({ check, blockOwner, note });
  } catch (err) {
    errors.push(`threw: ${String(err?.message ?? err).slice(0, 200)}`);
  }
  if (errors.length > 0) state = "FAIL";
  groups[name] = state;
  console.log(`RESULT phase99_${name}=${state}`);
  for (const e of errors) console.log(`  - ${e}`);
  for (const n of notes) console.log(`  ~ ${n}`);
  if (state === "FAIL") anyFail = true;
}

const routes = buildRouteInventory({ repoRoot: REPO });
const routeSummary = summarizeInventory(routes);
const tenant = analyzeTenantPredicates({ repoRoot: REPO });

// ── 1. Route inventory ────────────────────────────────────────────────────────
group("SECURITY_ROUTE_INVENTORY", ({ check, note }) => {
  note("handlers", routeSummary.handlers);
  note("byClassification", routeSummary.byClassification);
  check(routeSummary.handlers > 400, "route scan found implausibly few handlers — the scanner is probably broken");
  const unknown = routes.filter((r) => r.classification === "UNKNOWN").map((r) => `${r.method} ${r.apiPath}`);
  check(unknown.length === 0, `UNKNOWN classification on ${unknown.length} handler(s): ${unknown.slice(0, 8).join("; ")}`);
  check(existsSync(rel("docs/security/phase99-route-security-inventory.json")), "committed route inventory missing");
  for (const w of routes.filter((r) => r.classification === "WEBHOOK")) {
    check(w.senderAuthenticated === true, `${w.apiPath}: webhook does not authenticate its sender`);
  }
});

// ── 2. Tenant isolation ───────────────────────────────────────────────────────
group("TENANT_ISOLATION", ({ check, note }) => {
  note("coverage", tenant.coverage);
  check(tenant.coverage.TENANT_BOUND_HANDLERS_TOTAL > 0, "no tenant-bound handlers found");
  check(
    tenant.identityViolations.length === 0,
    `CLIENT_SUPPLIED_IDENTITY on ${tenant.identityViolations.length} handler(s): ${tenant.identityViolations.slice(0, 6).map((v) => `${v.method} ${v.apiPath}`).join("; ")}`,
  );
  check(
    tenant.siteViolations.length === 0,
    `site filter not authorised on ${tenant.siteViolations.length} handler(s): ${tenant.siteViolations.slice(0, 6).map((v) => `${v.method} ${v.apiPath}`).join("; ")}`,
  );
  check(tenant.roleViolations.length === 0, `role assignment not clamped on ${tenant.roleViolations.length} handler(s)`);
  check(tenant.staleReviews.length === 0, `stale tenant review entries: ${tenant.staleReviews.map((r) => `${r.method} ${r.apiPath}`).join("; ")}`);
  check(tenant.coverage.TENANT_IDENTITY_COVERAGE_PERCENT === 100, `TENANT_IDENTITY_COVERAGE=${tenant.coverage.TENANT_IDENTITY_COVERAGE_PERCENT}% (must be 100)`);
});

// ── 3. IDOR ───────────────────────────────────────────────────────────────────
group("IDOR", ({ check, note }) => {
  note("objectScopeCoveragePercent", tenant.coverage.OBJECT_SCOPE_COVERAGE_PERCENT);
  check(
    tenant.idorViolations.length === 0,
    `unscoped direct object reference on ${tenant.idorViolations.length} handler(s): ${tenant.idorViolations.slice(0, 8).map((v) => `${v.method} ${v.apiPath}`).join("; ")}`,
  );
  check(tenant.coverage.OBJECT_SCOPE_COVERAGE_PERCENT === 100, `OBJECT_SCOPE_COVERAGE=${tenant.coverage.OBJECT_SCOPE_COVERAGE_PERCENT}% (must be 100)`);
});

// ── 4. Auth / session ─────────────────────────────────────────────────────────
group("AUTH_SESSION", ({ check, note }) => {
  const cookies = cookieSecurityReview(REPO);
  note("cookies", cookies.cookies.length);
  for (const f of cookies.findings) check(false, f);
  // The authentication cookie must be written only by the authentication layer.
  const writers = [];
  for (const file of new Set(routes.map((r) => r.file))) {
    if (file.startsWith("src/app/api/auth/")) continue;
    const src = stripComments(read(file) ?? "");
    if (/cookies\s*\.\s*set\s*\(\s*["'`]?(?:hermes_session|SESSION_COOKIE)/.test(src) || /\.set\s*\(\s*SESSION_COOKIE/.test(src)) writers.push(file);
  }
  check(writers.length === 0, `authentication session cookie written outside the auth layer: ${writers.join("; ")}`);
  check(existsSync(rel("src/lib/auth/__tests__")), "no authentication test directory");
});

// ── 5/6. Application + API security ───────────────────────────────────────────
group("APPLICATION_SECURITY", ({ check, note }) => {
  const err = errorHygieneReview(REPO);
  note("counters", err.counters);
  for (const v of err.violations) check(false, `${v.file}:${v.line} ${v.rule}`);
  const html = htmlSinkInventory(REPO);
  check(html.unsanitised.length === 0, `unsanitised raw-HTML sink: ${html.unsanitised.map((i) => `${i.file}:${i.line}`).join("; ")}`);
});

group("API_SECURITY", ({ check, note }) => {
  // Every unauthenticated write must bound the body, check the media type and
  // rate limit. An anonymous endpoint without those is a resource boundary hole.
  const anonWrites = routes.filter((r) => r.classification === "PUBLIC_WRITE");
  note("publicWriteHandlers", anonWrites.length);
  const EXEMPT = new Set(["/api/auth/register"]); // hard 403 stub, no body is read
  for (const r of anonWrites) {
    if (EXEMPT.has(r.apiPath)) continue;
    const src = stripComments(read(r.file) ?? "");
    check(/readBoundedTextBody|MAX_BODY_BYTES|readBoundedJson/.test(src), `${r.apiPath}: public write does not bound the request body`);
    check(/checkRateLimit|checkAndIncrRateLimit|_rl\b/.test(src), `${r.apiPath}: public write has no rate limit`);
  }
});

// ── 7. Business logic ─────────────────────────────────────────────────────────
group("BUSINESS_LOGIC", ({ check }) => {
  // The mass-assignment shape: a request body cast with a type assertion and
  // forwarded whole into a persistence call.
  const offenders = [];
  for (const file of new Set(routes.map((r) => r.file))) {
    const src = stripComments(read(file) ?? "");
    const casts = [...src.matchAll(/const\s+(\w+)\s*=\s*(?:await\s+)?(?:req|request)\.json\(\)[^;]*\bas\s+Partial</g)];
    for (const c of casts) {
      const name = c[1];
      if (new RegExp(`\\b(?:update|create|upsert)\\w*\\s*\\([^)]*\\b${name}\\b`).test(src)) offenders.push(`${file} (${name})`);
    }
  }
  check(offenders.length === 0, `request body cast and forwarded into a write: ${offenders.join("; ")}`);
});

// ── 8. Rate limiting ──────────────────────────────────────────────────────────
group("RATE_LIMITING", ({ check }) => {
  const limiter = stripComments(read("src/lib/auth/rate-limiter.ts") ?? "");
  check(limiter.length > 0, "rate limiter module missing");
  // Degradation must be fail-safe (in-process fallback), never fail-open.
  check(/isAuthLimiterDegraded|degrad/i.test(limiter), "rate limiter does not expose a degradation signal");
  const offenders = [];
  for (const file of new Set(routes.map((r) => r.file))) {
    const src = stripComments(read(file) ?? "");
    if (!/checkRateLimit|checkAndIncrRateLimit|_rl\b/.test(src)) continue;
    if (/x-forwarded-for/i.test(src)) offenders.push(file);
  }
  check(offenders.length === 0, `rate-limit key derived from a client-controlled header: ${offenders.join("; ")}`);
});

// ── 9. File upload ────────────────────────────────────────────────────────────
group("FILE_UPLOAD", ({ check, note }) => {
  const up = uploadSurfaceInventory(REPO);
  note("uploadRoutes", up.items.length);
  check(up.items.length > 0, "no upload surface found — the scanner is probably broken");
  for (const f of up.failures) check(false, f);
});

// ── 10. SSRF ──────────────────────────────────────────────────────────────────
group("SSRF", ({ check, note }) => {
  const uc = userControlledSinkScan(REPO);
  const sinks = outboundSinkInventory(REPO);
  note("outboundSinks", sinks.items.length);
  note("userControlledSinks", uc.hits.length);
  check(uc.hits.length === 0, `request-controlled outbound destination: ${uc.hits.map((h) => `${h.file}:${h.line}`).join("; ")}`);
  check(sinks.needsReview.length === 0, `unreviewed outbound sink: ${sinks.needsReview.map((i) => `${i.file}:${i.line}`).join("; ")}`);
  check(sinks.stale.length === 0, `stale SSRF review entry: ${sinks.stale.map((a) => a.file).join("; ")}`);
});

// ── 11. XSS ───────────────────────────────────────────────────────────────────
group("XSS", ({ check, note }) => {
  const html = htmlSinkInventory(REPO);
  note("rawHtmlSinks", html.items.length);
  check(html.unsanitised.length === 0, `unsanitised raw-HTML sink: ${html.unsanitised.map((i) => `${i.file}:${i.line}`).join("; ")}`);
  const middleware = read("src/middleware.ts") ?? read("middleware.ts") ?? "";
  check(/Content-Security-Policy/i.test(middleware), "no Content-Security-Policy is set");
  check(/nonce/i.test(middleware), "CSP does not use a per-request nonce");
});

// ── 12. CSRF ──────────────────────────────────────────────────────────────────
group("CSRF", ({ check, note }) => {
  const cookies = cookieSecurityReview(REPO);
  note("authCookies", cookies.cookies.map((c) => c.sameSite));
  for (const c of cookies.cookies) check(c.sameSite === "lax" || c.sameSite === "strict", `authentication cookie with SameSite=${c.sameSite}`);
  const mutatingGets = routes.filter((r) => r.method === "GET" && r.mutates).map((r) => r.apiPath);
  check(mutatingGets.length === 0, `state-changing GET handler(s): ${mutatingGets.join("; ")}`);
});

// ── 13. SQL injection ─────────────────────────────────────────────────────────
group("SQL_INJECTION", ({ check, note }) => {
  const sql = rawSqlInventory(REPO);
  note("rawSqlSites", sql.items.length);
  check(sql.items.length > 0, "no raw SQL sites found — the scanner is probably broken");
  check(sql.unsafe.length === 0, `user-controllable raw SQL: ${sql.unsafe.map((i) => `${i.file}:${i.line}`).join("; ")}`);
  check(sql.staleReviews.length === 0, `stale raw-SQL review entry: ${sql.staleReviews.map((a) => a.file).join("; ")}`);
});

// ── 14. Dependency review ─────────────────────────────────────────────────────
group("DEPENDENCY_REVIEW", ({ check, blockOwner, note }) => {
  const dep = readJson("docs/security/phase99-dependency-review.json");
  check(dep !== null, "dependency-review artifact missing — run scripts/ci/phase99-dependency-review.mjs");
  if (!dep) return;
  note("totals", dep.totals);
  check(dep.totals.all.UNKNOWN === 0, "an advisory severity could not be mapped");
  check(dep.totals.all.CRITICAL === 0, `CRITICAL dependency advisories: ${dep.totals.all.CRITICAL}`);
  if (dep.totals.all.HIGH > 0) {
    blockOwner(
      `${dep.totals.all.HIGH} HIGH advisories open (${dep.totals.productionOnly.HIGH} in the production tree). ` +
      "Clearing them requires either an in-range lockfile update or a framework major upgrade — a product decision, not an automatic one. " +
      "Recorded as findings P99-DEP-*; closure needs a fix or a formal owner risk acceptance.",
    );
  }
});

// ── 15. Infrastructure ────────────────────────────────────────────────────────
group("INFRASTRUCTURE_REVIEW", ({ check, note }) => {
  const inf = infrastructureReview(REPO);
  note("counters", inf.counters);
  for (const f of inf.findings) check(false, f);
});

// ── 16. Finding governance ────────────────────────────────────────────────────
group("FINDING_GOVERNANCE", ({ check, blockOwner, note }) => {
  const reg = readJson("docs/security/phase99-findings.json");
  check(reg !== null, "finding register missing");
  if (!reg) return;
  const acceptances = readJson("docs/security/phase99-risk-acceptances.json") ?? { acceptances: {} };
  const result = evaluateRegistry(reg.findings, acceptances.acceptances ?? {}, { nowMs: Date.now() });
  note("counters", result.counters);
  note("summary", result.summary);
  for (const e of result.errors.slice(0, 20)) check(false, e);
  for (const [k, v] of Object.entries(result.counters)) check(v === 0, `${k}=${v}`);
  // Evidence integrity: a closed finding's retest artifact must still be the one
  // that was hashed when it was closed.
  for (const f of Array.isArray(reg.findings) ? reg.findings : []) {
    if (!f?.retestReference || !f?.evidenceHash) continue;
    const body = read(f.retestReference);
    check(body !== null, `${f.findingId}: retest artifact ${f.retestReference} is missing`);
    if (body === null) continue;
    const actual = sha256(body.replace(/\r\n/g, "\n"));
    check(actual === f.evidenceHash, `${f.findingId}: retest evidence changed since it was recorded (hash mismatch)`);
  }
  // A register that could not be read reports NULL counters, not zeroes. Unknown
  // is a FAIL here, never a silent pass and never an owner block: nobody can
  // decide about findings that could not be enumerated.
  if (result.summary.registerReadable === false) {
    check(false, "finding register is unreadable — its counters are UNKNOWN and cannot be treated as zero");
  } else {
    if (result.summary.highOpen > 0) {
      blockOwner(`${result.summary.highOpen} HIGH finding(s) open with no formal owner risk acceptance; RELEASE_BLOCKERS=${result.summary.releaseBlockers}`);
    }
    check(result.summary.criticalOpen === 0, `CRITICAL findings still open: ${result.summary.criticalOpen}`);
  }
});

// ── 17. External review package ───────────────────────────────────────────────
group("EXTERNAL_REVIEW_PACKAGE", ({ check, note }) => {
  const required = [
    "docs/security/phase99-external-review-scope.md",
    "docs/security/phase99-rules-of-engagement.md",
    "docs/security/phase99-attack-surface-inventory.md",
    "docs/security/phase99-test-matrix.md",
    "docs/security/phase99-finding-handling.md",
    "docs/security/phase99-evidence-index.md",
    "docs/security/phase99-external-review-intake.md",
    "docs/security/phase99-architecture-and-plan.md",
    "SECURITY.md",
  ];
  for (const p of required) check(existsSync(rel(p)), `missing ${p}`);

  const roe = read("docs/security/phase99-rules-of-engagement.md") ?? "";
  const REQUIRED_ROE = [
    "PENTEST_TARGET", "test window", "synthetic tenant", "rate", "reporting channel",
    "prohibited", "denial-of-service", "industrial", "safety", "retention", "retest",
  ];
  for (const term of REQUIRED_ROE) {
    check(new RegExp(term.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i").test(roe), `rules of engagement do not address: ${term}`);
  }
  // A fabricated authorised target would send a real tester at something nobody
  // agreed to. Until the owner supplies one, the value must say so.
  check(/PENTEST_TARGET\s*=\s*OWNER_CONFIGURATION_REQUIRED/.test(roe) || /PENTEST_TARGET\s*=\s*https?:\/\//.test(roe), "PENTEST_TARGET must be an owner-configured value or OWNER_CONFIGURATION_REQUIRED");
  note("scopeHash", computeScopeHash(read("docs/security/phase99-external-review-scope.md") ?? ""));
});

// ── 18. External evidence contract ────────────────────────────────────────────
group("EXTERNAL_EVIDENCE_CONTRACT", ({ check }) => {
  // The contract must reject a self-produced artifact. Prove it here rather than
  // asserting it in prose.
  const synthetic = {
    SYNTHETIC_TEST_FIXTURE: true,
    schemaVersion: 1,
    reviewType: "INDEPENDENT_PENETRATION_TEST",
    reviewerOrganizationAlias: "fixture",
    reviewerRole: "Security Engineer",
    reviewDate: "2026-08-07",
    testedCommitSha: "a".repeat(40),
    scopeHash: "b".repeat(64),
    rawReportReference: "fixture",
    rawReportSha256: "c".repeat(64),
    criticalCount: 0, highCount: 0, mediumCount: 0, lowCount: 0, infoCount: 0,
    retestCompleted: false,
    signedOrOwnerVerified: true,
    recordedAt: "2026-08-07",
  };
  const gate = resolveGate(synthetic, (a) => validateExternalAttestation(a, { expectedCommitSha: "a".repeat(40), expectedScopeHash: "b".repeat(64) }));
  check(gate.state === "BLOCKED", "a synthetic fixture must never satisfy an external gate");

  const agentAttested = { ...synthetic, SYNTHETIC_TEST_FIXTURE: false, reviewerRole: "AI agent" };
  const agentGate = resolveGate(agentAttested, (a) => validateExternalAttestation(a, { expectedCommitSha: "a".repeat(40), expectedScopeHash: "b".repeat(64) }));
  check(agentGate.state === "FAIL", "an agent-attributed attestation must never pass");

  const missing = resolveGate(null, validateExternalAttestation);
  check(missing.state === "BLOCKED", "absent external evidence must be BLOCKED, never PASS or FAIL");

  const syntheticPilot = { SYNTHETIC_TEST_FIXTURE: true, schemaVersion: 1, pilotId: "pilot-fixture", acceptanceDecision: "ACCEPTED" };
  const pilotGate = resolveGate(syntheticPilot, validatePilotAcceptance);
  check(pilotGate.state === "BLOCKED", "a synthetic pilot acceptance must never satisfy closure");
});

// ── 19–23. Pilot package ──────────────────────────────────────────────────────
const PILOT_DOCS = {
  PILOT_UAT_READINESS: "docs/pilot/phase99-uat-matrix.md",
  PILOT_WORKFLOW_READINESS: "docs/pilot/phase99-workflow-validation.md",
  PILOT_INCIDENT_READINESS: "docs/pilot/phase99-incident-simulation.md",
  PILOT_ONBOARDING: "docs/pilot/phase99-onboarding-guide.md",
  PILOT_SUPPORT: "docs/pilot/phase99-support-process.md",
};
for (const [name, doc] of Object.entries(PILOT_DOCS)) {
  group(name, ({ check, blockOwner }) => {
    check(existsSync(rel(doc)), `missing ${doc}`);
    const text = read(doc) ?? "";
    check(!/password\s*[:=]\s*\S/i.test(text), `${doc} appears to contain a credential`);
    if (name === "PILOT_UAT_READINESS") {
      const cases = readJson("docs/pilot/phase99-uat-cases.json");
      check(cases !== null, "machine-readable UAT case set missing");
      if (cases) {
        const REQUIRED = ["uatId", "persona", "precondition", "steps", "expectedResult", "actualResult", "status", "releaseBlocker", "evidenceReference"];
        const STATUSES = ["NOT_RUN", "PASS", "FAIL", "BLOCKED", "ACCEPTED_WITH_LIMITATION"];
        check(Array.isArray(cases.cases) && cases.cases.length > 0, "UAT case set is empty");
        for (const c of cases.cases ?? []) {
          for (const f of REQUIRED) check(Object.prototype.hasOwnProperty.call(c, f), `UAT ${c.uatId ?? "?"}: missing ${f}`);
          check(STATUSES.includes(c.status), `UAT ${c.uatId ?? "?"}: unknown status ${c.status}`);
        }
      }
    }
    if (name === "PILOT_INCIDENT_READINESS") {
      check(existsSync(rel("scripts/ci/phase99-pilot-incident-rehearsal.mjs")), "incident rehearsal script missing");
    }
    blockOwner("Pilot execution requires a customer the owner has not yet selected: PILOT_CUSTOMER_SELECTED=BLOCKED_OWNER");
  });
}

group("SLA_DRAFT", ({ check }) => {
  const doc = "docs/pilot/phase99-sla-draft.md";
  check(existsSync(rel(doc)), `missing ${doc}`);
  const text = read(doc) ?? "";
  for (const marker of ["DRAFT", "NON_BINDING", "OWNER_REVIEW_REQUIRED", "LEGAL_REVIEW_REQUIRED"]) {
    check(text.includes(marker), `SLA draft must be explicitly marked ${marker}`);
  }
  // Never invent a commercial or regulatory promise.
  check(!/service credit|refund|penalty/i.test(text), "SLA draft must not invent financial credits");
  // Naming a certification is fine ONLY alongside an explicit disclaimer that
  // none is held — the failure mode this guards against is a draft that implies
  // an audit nobody has performed.
  const mentionsCertification = /\bISO\s?27001\b|\bSOC\s?2\b/i.test(text);
  const disclaimsCertification = /(?:no|not|none|never)\b[^.]{0,80}\bcertifi/i.test(text) || /certifi[^.]{0,80}\b(?:is not|are not|none|not claimed|not asserted)/i.test(text);
  check(!mentionsCertification || disclaimsCertification, "SLA draft must not imply a security certification");
});

// ── 24. Public-repository data hygiene ────────────────────────────────────────
group("PUBLIC_REPO_DATA_HYGIENE", ({ check, note }) => {
  const scan = scanPhase99Artifacts(REPO);
  note("filesScanned", scan.filesScanned);
  check(scan.filesScanned > 0, "hygiene scanner found nothing to scan");
  for (const v of scan.violations) check(false, `${v.file}:${v.line} — ${v.why} (${v.rule})`);
});

// ── Summary ───────────────────────────────────────────────────────────────────
const blocked = Object.entries(groups).filter(([, v]) => v === "BLOCKED_OWNER").map(([k]) => k);
const failed = Object.entries(groups).filter(([, v]) => v === "FAIL").map(([k]) => k);

const summary = {
  phase: "99",
  schemaVersion: 1,
  kind: "INTERNAL_READINESS",
  note: "Internal readiness only. Independent penetration testing, external application/API security review and pilot acceptance are NOT evaluated here — see eval:phase99:closure.",
  groups,
  details,
  blockedOnOwner: blocked,
  failed,
  internalReadinessComplete: failed.length === 0 && blocked.length === 0,
  result: failed.length > 0 ? "FAIL" : blocked.length > 0 ? "BLOCKED_OWNER" : "PASS",
};

try {
  writeFileSync(join(REPO, "phase99-readiness.json"), JSON.stringify(summary, null, 2) + "\n");
} catch { /* non-fatal */ }

console.log(`RESULT phase99_readiness=${summary.result}`);
console.log(`RESULT phase99_internal_readiness_complete=${summary.internalReadinessComplete ? "YES" : "NO"}`);
if (blocked.length > 0) console.log(`RESULT phase99_blocked_on_owner=${blocked.join(",")}`);
process.exit(anyFail ? 1 : 0);

function sha256(text) {
  return createHash("sha256").update(text, "utf8").digest("hex");
}
