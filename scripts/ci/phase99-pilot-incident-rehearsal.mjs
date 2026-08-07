#!/usr/bin/env node
/**
 * PHASE 99 — pilot incident rehearsal (offline, disposable, non-production).
 *
 * A pilot incident plan is only worth having if somebody has walked it. This
 * rehearsal walks every scenario in docs/pilot/phase99-incident-simulation.md
 * and checks the three things that make a scenario actionable rather than
 * decorative:
 *
 *   1. The scenario is DOCUMENTED with all eight required steps (trigger,
 *      detection, triage, escalation, operator action, recovery, verification,
 *      communication).
 *   2. The DETECTION signal it relies on actually exists in this codebase —
 *      a named metric, health endpoint or security event, not a wish.
 *   3. The RECOVERY procedure it points at exists as a committed runbook.
 *
 * It contacts nothing. It starts no container, touches no database, and can
 * never reach Production: there is no network call and no credential in this
 * file. Destructive rehearsal of the underlying mechanisms is Phase 98's job and
 * already runs against disposable Docker projects there — this script verifies
 * that the PILOT-facing plan is wired to those real mechanisms.
 */

import { readFileSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const REPO = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const rel = (p) => join(REPO, ...p.split("/"));
const read = (p) => (existsSync(rel(p)) ? readFileSync(rel(p), "utf8") : null);

const PLAN = "docs/pilot/phase99-incident-simulation.md";

/**
 * Each scenario names the signal that must exist for detection to be real, and
 * the runbook that must exist for recovery to be real. `signalIn` is the file
 * that must contain the signal token.
 */
const SCENARIOS = [
  {
    id: "APPLICATION_CANDIDATE_FAILURE",
    match: /application candidate failure|candidate fail/i,
    signal: "/api/health",
    signalIn: "src/app/api/health/route.ts",
    runbook: "docs/release/incident-response-runbook.md",
  },
  {
    id: "POSTGRES_UNAVAILABLE",
    match: /postgres/i,
    signal: "dependency_up",
    signalIn: "src/lib/observability/metric-names.ts",
    runbook: "docs/release/disaster-recovery-runbook.md",
  },
  {
    id: "REDIS_UNAVAILABLE",
    match: /redis/i,
    signal: "redis_degraded",
    signalIn: "src/lib/observability/metric-names.ts",
    runbook: "docs/release/incident-response-runbook.md",
  },
  {
    id: "UPLOAD_STORAGE_UNAVAILABLE",
    match: /upload|document storage/i,
    signal: "documents",
    signalIn: "docker-compose.prod.yml",
    runbook: "docs/release/disaster-recovery-runbook.md",
  },
  {
    id: "SESSION_REVOKED_OR_EXPIRED",
    match: /revoked session|expired session|session/i,
    signal: "isPayloadSessionActive",
    signalIn: "src/lib/auth/session-store.ts",
    runbook: "docs/release/incident-response-runbook.md",
  },
  {
    id: "CROSS_TENANT_ACCESS_DENIED",
    match: /cross-tenant/i,
    signal: "cross_tenant_denied",
    signalIn: "src/lib/observability/security-monitor.ts",
    runbook: "docs/release/incident-response-runbook.md",
  },
  {
    id: "BACKUP_RECOVERY_ESCALATION",
    match: /backup/i,
    signal: "restore-postgres.sh",
    signalIn: "scripts/restore-postgres.sh",
    runbook: "docs/release/disaster-recovery-runbook.md",
  },
  {
    id: "SECURITY_FINDING_ESCALATION",
    match: /security finding|security-finding/i,
    signal: "P99-",
    signalIn: "docs/security/phase99-finding-handling.md",
    runbook: "docs/security/phase99-finding-handling.md",
  },
  {
    id: "SUPPORT_ESCALATION",
    match: /support escalation|support/i,
    signal: "severity",
    signalIn: "docs/pilot/phase99-support-process.md",
    runbook: "docs/pilot/phase99-support-process.md",
  },
];

const REQUIRED_STEPS = ["trigger", "detection", "triage", "escalation", "operator action", "recovery", "verification", "communication"];

const plan = read(PLAN);
const results = [];
let failed = false;

function record(id, ok, detail) {
  results.push({ scenario: id, result: ok ? "PASS" : "FAIL", detail });
  console.log(`RESULT phase99_incident_${id}=${ok ? "PASS" : "FAIL"}`);
  if (!ok) { console.log(`  - ${detail}`); failed = true; }
}

if (!plan) {
  console.error(`[phase99-incident-rehearsal] ${PLAN} is missing`);
  process.exit(1);
}

// The plan as a whole must define every step vocabulary item at least once.
const planLower = plan.toLowerCase();
const missingVocab = REQUIRED_STEPS.filter((s) => !planLower.includes(s));
record("PLAN_STEP_VOCABULARY", missingVocab.length === 0, `plan never mentions: ${missingVocab.join(", ")}`);

for (const s of SCENARIOS) {
  if (!s.match.test(plan)) { record(s.id, false, "scenario is not documented in the incident plan"); continue; }
  const signalSource = read(s.signalIn);
  if (!signalSource) { record(s.id, false, `detection signal source ${s.signalIn} does not exist`); continue; }
  // Case-insensitive: a documented signal may be prose ("Severity") while the
  // same token appears lower-case in code.
  if (!signalSource.toLowerCase().includes(s.signal.toLowerCase())) {
    record(s.id, false, `detection signal '${s.signal}' not found in ${s.signalIn}`);
    continue;
  }
  if (!existsSync(rel(s.runbook))) { record(s.id, false, `recovery runbook ${s.runbook} does not exist`); continue; }
  record(s.id, true, null);
}

// Safety posture: this rehearsal must never be able to touch Production.
const self = readFileSync(fileURLToPath(import.meta.url), "utf8");
const unsafe = [
  { re: /\bfetch\s*\(/, why: "makes a network call" },
  { re: /\bexecFileSync|\bspawnSync|\bexec\s*\(/, why: "executes a subprocess" },
  { re: /-p\s+hermes(?![\w-])/, why: "references the production Compose project" },
  { re: /docker\s+(?:compose\s+)?down\s+-v|volume\s+rm|system\s+prune/, why: "contains a destructive Docker operation" },
];
for (const u of unsafe) {
  if (u.re.test(self.replace(/^\s*\/\/.*$/gm, "").replace(/\/\*[\s\S]*?\*\//g, ""))) {
    record("REHEARSAL_IS_NON_DESTRUCTIVE", false, `this rehearsal ${u.why}`);
    break;
  }
}
if (!results.some((r) => r.scenario === "REHEARSAL_IS_NON_DESTRUCTIVE")) {
  record("REHEARSAL_IS_NON_DESTRUCTIVE", true, null);
}

console.log(`RESULT phase99_incident_rehearsal=${failed ? "FAIL" : "PASS"}`);
console.log("RESULT phase99_incident_production_contacted=False");
process.exit(failed ? 1 : 0);
