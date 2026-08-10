/**
 * PHASE 99 — security finding governance contract.
 *
 * A closed, fail-closed vocabulary for security findings, their lifecycle, and
 * the conditions under which a finding may stop blocking a release. Pure data +
 * pure functions: no I/O, no network, no clock reads except the caller-supplied
 * `nowMs`, so every decision is reproducible and testable.
 *
 * Three rules drive the whole design and are enforced mechanically:
 *   1. A CRITICAL finding can NEVER be risk-accepted.
 *   2. A HIGH finding can only leave blocking status through a real fix (with
 *      retest evidence) or a formal, unexpired, owner-attributed acceptance.
 *   3. Nothing an agent produces can satisfy either path. Synthetic fixtures are
 *      recognised and rejected by construction, not by convention.
 */

/** Closed severity set. Anything else is UNKNOWN and fails readiness. */
export const SEVERITIES = ["CRITICAL", "HIGH", "MEDIUM", "LOW", "INFO"];

/** Closed lifecycle status set. */
export const STATUSES = [
  "OPEN",
  "TRIAGED",
  "REMEDIATION_IN_PROGRESS",
  "RETEST_PENDING",
  "VERIFIED_FIXED",
  "RISK_ACCEPTED",
  "NOT_APPLICABLE",
];

/** Where a finding came from. Original attribution is never rewritten. */
export const FINDING_SOURCES = [
  "INTERNAL_REVIEW",
  "INTERNAL_REGRESSION",
  "EXTERNAL_PENETRATION_TEST",
  "EXTERNAL_APPLICATION_SECURITY_REVIEW",
  "EXTERNAL_API_SECURITY_REVIEW",
  "DEPENDENCY_REVIEW",
  "INFRASTRUCTURE_REVIEW",
  "PILOT_BLOCKER",
];

/** Statuses that mean "this finding no longer blocks a release". */
export const RESOLVED_STATUSES = ["VERIFIED_FIXED", "RISK_ACCEPTED", "NOT_APPLICABLE"];

/**
 * Roles that can never carry owner authority for a risk acceptance or an
 * external attestation. An agent must not be able to sign off on its own work,
 * so the authority string is checked against this list before anything else.
 */
export const NON_HUMAN_AUTHORITY_TOKENS = [
  "agent",
  "automation",
  "bot",
  "claude",
  "assistant",
  "ai",
  "llm",
  "copilot",
  "model",
  "self",
  "system",
];

const ISO_DATE = /^\d{4}-\d{2}-\d{2}(?:T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?Z)?$/;
const SHA256_HEX = /^[a-f0-9]{64}$/;
const FINDING_ID = /^P99-(?:INT|EXT|DEP|INF|PLT)-\d{3,}$/;

/** Categories a finding may be filed under (closed set, matches the test matrix). */
export const FINDING_CATEGORIES = [
  "ROUTE_SECURITY_INVENTORY",
  "TENANT_ISOLATION",
  "IDOR",
  "AUTH_SESSION",
  "APPLICATION_SECURITY",
  "API_SECURITY",
  "BUSINESS_LOGIC",
  "RATE_LIMITING",
  "FILE_UPLOAD",
  "SSRF",
  "XSS",
  "CSRF",
  "SQL_INJECTION",
  "DEPENDENCY",
  "INFRASTRUCTURE",
  "AUDIT_HYGIENE",
  "PILOT_READINESS",
  "DATA_HYGIENE",
];

/**
 * Conditions that make a finding a release blocker regardless of severity label.
 * Deliberately short and technical — this list is not a place to invent legal or
 * commercial requirements.
 */
export const AUTOMATIC_RELEASE_BLOCKER_CONDITIONS = [
  "OPEN_CRITICAL",
  "UNACCEPTED_OPEN_HIGH",
  "CONFIRMED_CROSS_TENANT_READ_OR_WRITE",
  "CONFIRMED_AUTH_BYPASS",
  "CONFIRMED_REMOTE_CODE_EXECUTION",
  "CONFIRMED_SECRET_DISCLOSURE",
  "CONFIRMED_DESTRUCTIVE_BUSINESS_LOGIC_BYPASS",
  "PILOT_ACCEPTANCE_MISSING",
];

/** True when a string names a human role rather than an agent/automation. */
export function isHumanAuthorityRole(role) {
  if (typeof role !== "string") return false;
  const trimmed = role.trim();
  if (trimmed.length < 3) return false;
  const lowered = trimmed.toLowerCase();
  // Whole-word match so "SYSTEM_OWNER" is rejected but "Head of Engineering" is not.
  const words = lowered.split(/[^a-z0-9]+/).filter(Boolean);
  return !words.some((w) => NON_HUMAN_AUTHORITY_TOKENS.includes(w));
}

/** A record explicitly marked as a synthetic fixture can never satisfy a gate. */
export function isSyntheticFixture(record) {
  if (!record || typeof record !== "object") return false;
  return record.SYNTHETIC_TEST_FIXTURE === true || record.syntheticTestFixture === true;
}

/**
 * Validate a single finding record. Returns `{ ok, errors }` — never throws on
 * malformed input, so a corrupt registry produces findings-level errors rather
 * than an opaque crash.
 */
/**
 * @param {unknown} f
 * @param {{ nowMs?: number | null }} [options]
 * @returns {{ ok: boolean, errors: string[] }}
 */
export function validateFinding(f, { nowMs = null } = {}) {
  const errors = [];
  const req = (cond, msg) => { if (!cond) errors.push(msg); };

  if (!f || typeof f !== "object") return { ok: false, errors: ["finding is not an object"] };
  const id = typeof f.findingId === "string" ? f.findingId : "<no-id>";
  const e = (msg) => errors.push(`${id}: ${msg}`);

  if (!FINDING_ID.test(String(f.findingId ?? ""))) e("findingId must match P99-{INT|EXT|DEP|INF|PLT}-NNN");
  if (!FINDING_SOURCES.includes(f.source)) e(`unknown source '${f.source}'`);
  if (typeof f.sourceReference !== "string" || !f.sourceReference.trim()) e("sourceReference required");
  if (!SEVERITIES.includes(f.severity)) e(`UNKNOWN_SEVERITY '${f.severity}'`);
  if (!FINDING_CATEGORIES.includes(f.category)) e(`unknown category '${f.category}'`);
  if (typeof f.affectedSurface !== "string" || !f.affectedSurface.trim()) e("affectedSurface required");
  if (!ISO_DATE.test(String(f.firstObservedAt ?? ""))) e("firstObservedAt must be an ISO date");
  if (!STATUSES.includes(f.status)) e(`UNKNOWN_STATUS '${f.status}'`);
  if (typeof f.releaseBlocker !== "boolean") e("releaseBlocker must be a boolean");
  if (f.evidenceHash !== null && !SHA256_HEX.test(String(f.evidenceHash ?? ""))) {
    e("evidenceHash must be a lowercase sha256 hex digest or null");
  }
  if (typeof f.title !== "string" || !f.title.trim()) e("title required");

  // Rule 1 — CRITICAL can never be risk-accepted.
  if (f.severity === "CRITICAL" && f.status === "RISK_ACCEPTED") e("CRITICAL_RISK_ACCEPTANCE is forbidden");

  // Rule 2 — a closed-by-fix finding must point at retest evidence.
  if (f.status === "VERIFIED_FIXED") {
    if (typeof f.remediationReference !== "string" || !f.remediationReference.trim()) e("VERIFIED_FIXED requires remediationReference");
    if (typeof f.retestReference !== "string" || !f.retestReference.trim()) e("CLOSED_WITHOUT_RETEST_EVIDENCE: retestReference required");
  }

  // Rule 3 — acceptance needs a real, unexpired, owner-attributed record.
  if (f.status === "RISK_ACCEPTED") {
    if (typeof f.riskAcceptanceReference !== "string" || !f.riskAcceptanceReference.trim()) {
      e("RISK_ACCEPTED requires riskAcceptanceReference");
    }
    if (!ISO_DATE.test(String(f.riskAcceptanceExpiresAt ?? ""))) e("RISK_ACCEPTED requires riskAcceptanceExpiresAt");
    else if (nowMs !== null && Date.parse(f.riskAcceptanceExpiresAt) <= nowMs) e("risk acceptance has EXPIRED");
  }

  // A resolved finding must not still be flagged as blocking, and an unresolved
  // blocker must not be silently cleared.
  if (f.releaseBlocker === true && RESOLVED_STATUSES.includes(f.status)) {
    e("RELEASE_BLOCKER_WITHOUT_RESOLUTION: resolved finding still marked releaseBlocker");
  }
  if (f.severity === "CRITICAL" && !RESOLVED_STATUSES.includes(f.status) && f.releaseBlocker !== true) {
    e("open CRITICAL must be releaseBlocker=true");
  }
  if (f.severity === "HIGH" && !RESOLVED_STATUSES.includes(f.status) && f.releaseBlocker !== true) {
    e("open HIGH must be releaseBlocker=true");
  }

  req(true, "");
  return { ok: errors.length === 0, errors };
}

/**
 * Validate a formal HIGH risk acceptance. This is the only path by which an open
 * HIGH stops blocking, so it is deliberately strict.
 */
/**
 * @param {unknown} a
 * @param {{ nowMs?: number }} [options]
 * @returns {{ ok: boolean, errors: string[] }}
 */
export function validateRiskAcceptance(a, { nowMs = Date.now() } = {}) {
  const errors = [];
  if (!a || typeof a !== "object") return { ok: false, errors: ["risk acceptance is not an object"] };
  const id = typeof a.findingId === "string" ? a.findingId : "<no-id>";
  const e = (msg) => errors.push(`${id}: ${msg}`);

  if (isSyntheticFixture(a)) e("AGENT_SELF_RISK_ACCEPTANCE: synthetic fixture can never accept risk");
  if (!FINDING_ID.test(String(a.findingId ?? ""))) e("findingId invalid");
  if (a.severity !== "HIGH") e("only HIGH findings may be formally risk-accepted");
  if (a.decision !== "ACCEPT") e("decision must be exactly ACCEPT");
  if (!isHumanAuthorityRole(a.ownerAuthorityRole)) e("ownerAuthorityRole must name a human owner authority");
  if (typeof a.reason !== "string" || a.reason.trim().length < 20) e("reason must be a substantive justification");
  if (!Array.isArray(a.compensatingControls) || a.compensatingControls.length === 0) e("compensatingControls required");
  if (typeof a.scope !== "string" || !a.scope.trim()) e("scope required");
  if (!ISO_DATE.test(String(a.acceptedAt ?? ""))) e("acceptedAt must be an ISO date");
  if (!ISO_DATE.test(String(a.expiresAt ?? ""))) e("expiresAt must be an ISO date");
  else if (Date.parse(a.expiresAt) <= nowMs) e("acceptance has EXPIRED and is invalid");
  if (typeof a.evidenceReference !== "string" || !a.evidenceReference.trim()) e("evidenceReference required");
  if (!SHA256_HEX.test(String(a.evidenceSha256 ?? ""))) e("evidenceSha256 must be a sha256 hex digest");

  return { ok: errors.length === 0, errors };
}

/**
 * Registry-wide invariants. Returns the exact counters Phase 99 must publish.
 * `acceptances` is keyed by findingId.
 */
/**
 * The named failure for a register whose `findings` key is not an array.
 *
 * This used to be coerced with `Array.isArray(findings) ? findings : []`, which
 * is fail-OPEN in the most dangerous possible way: a register of `"x"`, `{}`,
 * `42` or `null` read as a register of ZERO findings, so `criticalOpen`,
 * `highOpen` and `releaseBlockers` were all 0 and every counter stayed clean.
 * FINDING_REGISTER, CRITICAL_FINDINGS_ZERO, HIGH_FINDINGS_RESOLVED and
 * OPEN_RELEASE_BLOCKING_FINDINGS_ZERO all turned GREEN on a corrupt register —
 * the four gates that exist precisely to stop that.
 *
 * "No findings" and "the findings could not be read" are different facts, and
 * only one of them is safe. An unreadable register yields NULL counters, never
 * zeroes: every consumer already coalesces a null counter to a blocking value.
 */
export const FINDING_REGISTER_NOT_AN_ARRAY =
  "FINDING_REGISTER_NOT_AN_ARRAY: 'findings' must be an array — an unreadable register is never an empty register";

/** Counters for a register that could not be read. Unknown, never zero. */
function unreadableRegisterSummary() {
  return {
    total: null,
    bySeverity: Object.fromEntries(SEVERITIES.map((s) => [s, null])),
    criticalOpen: null,
    highOpen: null,
    highFormallyAccepted: null,
    releaseBlockers: null,
    registerReadable: false,
  };
}

/**
 * @param {unknown[]} findings
 * @param {Record<string, unknown>} [acceptances]
 * @param {{ nowMs?: number }} [options]
 */
export function evaluateRegistry(findings, acceptances = {}, { nowMs = Date.now() } = {}) {
  const errors = [];
  const counters = {
    UNKNOWN_SEVERITY: 0,
    UNKNOWN_STATUS: 0,
    CRITICAL_RISK_ACCEPTANCE: 0,
    HIGH_ACCEPTED_WITHOUT_OWNER_EVIDENCE: 0,
    CLOSED_WITHOUT_RETEST_EVIDENCE: 0,
    RELEASE_BLOCKER_WITHOUT_RESOLUTION: 0,
    HIGH_SEVERITY_DOWNGRADE_ON_ACCEPTANCE: 0,
    AGENT_SELF_RISK_ACCEPTANCE: 0,
  };

  // Fail CLOSED, never coerce. See FINDING_REGISTER_NOT_AN_ARRAY.
  if (!Array.isArray(findings)) {
    return {
      ok: false,
      errors: [FINDING_REGISTER_NOT_AN_ARRAY],
      counters,
      summary: unreadableRegisterSummary(),
    };
  }

  const list = findings;
  const seenIds = new Set();

  for (const f of list) {
    const v = validateFinding(f, { nowMs });
    errors.push(...v.errors);

    if (!SEVERITIES.includes(f?.severity)) counters.UNKNOWN_SEVERITY += 1;
    if (!STATUSES.includes(f?.status)) counters.UNKNOWN_STATUS += 1;
    if (f?.severity === "CRITICAL" && f?.status === "RISK_ACCEPTED") counters.CRITICAL_RISK_ACCEPTANCE += 1;
    if (f?.status === "VERIFIED_FIXED" && !String(f?.retestReference ?? "").trim()) counters.CLOSED_WITHOUT_RETEST_EVIDENCE += 1;
    if (f?.releaseBlocker === true && RESOLVED_STATUSES.includes(f?.status)) counters.RELEASE_BLOCKER_WITHOUT_RESOLUTION += 1;

    if (typeof f?.findingId === "string") {
      if (seenIds.has(f.findingId)) errors.push(`${f.findingId}: duplicate findingId`);
      seenIds.add(f.findingId);
    }

    if (f?.status === "RISK_ACCEPTED") {
      const acc = acceptances?.[f.findingId];
      const av = acc ? validateRiskAcceptance(acc, { nowMs }) : { ok: false, errors: [`${f.findingId}: no risk-acceptance record`] };
      if (!av.ok) {
        counters.HIGH_ACCEPTED_WITHOUT_OWNER_EVIDENCE += 1;
        errors.push(...av.errors);
      }
      if (acc && isSyntheticFixture(acc)) counters.AGENT_SELF_RISK_ACCEPTANCE += 1;
      // Acceptance must never rewrite the original severity.
      if (acc && acc.severity !== f.severity) counters.HIGH_SEVERITY_DOWNGRADE_ON_ACCEPTANCE += 1;
    }
  }

  const bySeverity = Object.fromEntries(SEVERITIES.map((s) => [s, 0]));
  for (const f of list) if (SEVERITIES.includes(f?.severity)) bySeverity[f.severity] += 1;

  const openBlocking = list.filter((f) => !RESOLVED_STATUSES.includes(f?.status));
  const summary = {
    total: list.length,
    bySeverity,
    criticalOpen: openBlocking.filter((f) => f?.severity === "CRITICAL").length,
    highOpen: openBlocking.filter((f) => f?.severity === "HIGH").length,
    highFormallyAccepted: list.filter((f) => f?.severity === "HIGH" && f?.status === "RISK_ACCEPTED").length,
    releaseBlockers: list.filter((f) => f?.releaseBlocker === true && !RESOLVED_STATUSES.includes(f?.status)).length,
    registerReadable: true,
  };

  const ok = errors.length === 0 && Object.values(counters).every((n) => n === 0);
  return { ok, errors, counters, summary };
}
