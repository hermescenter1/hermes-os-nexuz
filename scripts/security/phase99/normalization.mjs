/**
 * PHASE 99 — finding normalization.
 *
 * Five very different producers feed one register: this repository's own review,
 * an external penetration test, `npm audit`, the infrastructure review, and
 * pilot blockers. They disagree about vocabulary — npm says `moderate`, a
 * pentest report says `Medium`, a pilot says "blocker" with no severity at all.
 *
 * This layer maps all of them onto the Phase 99 vocabulary WITHOUT losing the
 * original. Two rules make that safe:
 *   - `reportedSeverity` is preserved verbatim, forever.
 *   - Normalization may RAISE a severity but can never lower one. A downgrade is
 *     a human triage decision with a written reason, not a mapping-table effect.
 */

import { SEVERITIES, FINDING_SOURCES, AUTOMATIC_RELEASE_BLOCKER_CONDITIONS } from "./finding-contract.mjs";

const SEVERITY_RANK = { INFO: 0, LOW: 1, MEDIUM: 2, HIGH: 3, CRITICAL: 4 };

/** Vocabulary each producer uses, mapped onto the closed Phase 99 set. */
const SEVERITY_ALIASES = new Map([
  ["critical", "CRITICAL"],
  ["blocker", "CRITICAL"],
  ["high", "HIGH"],
  ["important", "HIGH"],
  ["severe", "HIGH"],
  ["moderate", "MEDIUM"],
  ["medium", "MEDIUM"],
  ["low", "LOW"],
  ["minor", "LOW"],
  ["info", "INFO"],
  ["informational", "INFO"],
  ["note", "INFO"],
]);

/**
 * Map a producer's severity word onto the closed set.
 * An unrecognised word is NOT guessed — it returns null, and the caller must
 * treat that as UNKNOWN_SEVERITY (which fails readiness).
 */
export function normalizeSeverity(raw) {
  if (typeof raw !== "string") return null;
  const key = raw.trim().toLowerCase();
  if (SEVERITIES.includes(raw)) return raw;
  return SEVERITY_ALIASES.get(key) ?? null;
}

/** Higher of two severities. Used to apply an escalation without a downgrade. */
export function maxSeverity(a, b) {
  if (!a) return b;
  if (!b) return a;
  return SEVERITY_RANK[a] >= SEVERITY_RANK[b] ? a : b;
}

/**
 * Conditions that force `releaseBlocker=true` regardless of the severity label.
 * `signals` is a set of boolean facts established by the reviewer/rehearsal, not
 * free text, so this cannot be argued away in prose.
 */
export function deriveReleaseBlocker({ severity, status, signals = {}, pilotAcceptanceRecorded = null }) {
  const reasons = [];
  const unresolved = !["VERIFIED_FIXED", "RISK_ACCEPTED", "NOT_APPLICABLE"].includes(status);

  if (severity === "CRITICAL" && unresolved) reasons.push("OPEN_CRITICAL");
  if (severity === "HIGH" && unresolved && status !== "RISK_ACCEPTED") reasons.push("UNACCEPTED_OPEN_HIGH");
  if (signals.crossTenantReadOrWrite) reasons.push("CONFIRMED_CROSS_TENANT_READ_OR_WRITE");
  if (signals.authBypass) reasons.push("CONFIRMED_AUTH_BYPASS");
  if (signals.remoteCodeExecution) reasons.push("CONFIRMED_REMOTE_CODE_EXECUTION");
  if (signals.secretDisclosure) reasons.push("CONFIRMED_SECRET_DISCLOSURE");
  if (signals.destructiveBusinessLogicBypass) reasons.push("CONFIRMED_DESTRUCTIVE_BUSINESS_LOGIC_BYPASS");
  if (pilotAcceptanceRecorded === false) reasons.push("PILOT_ACCEPTANCE_MISSING");

  for (const r of reasons) {
    if (!AUTOMATIC_RELEASE_BLOCKER_CONDITIONS.includes(r)) throw new Error(`unregistered blocker condition ${r}`);
  }
  // A confirmed exploit signal escalates the severity floor; it never lowers it.
  const escalated = reasons.some((r) => r.startsWith("CONFIRMED_")) ? "HIGH" : null;
  return { releaseBlocker: reasons.length > 0, reasons, severityFloor: escalated };
}

/**
 * Normalize one raw finding from any producer.
 *
 * Returns `{ ok, finding, errors }`. `finding.reportedSeverity` and
 * `finding.source` always carry the producer's own words.
 */
export function normalizeFinding(raw, { source, sourceReference }) {
  const errors = [];
  if (!FINDING_SOURCES.includes(source)) errors.push(`unknown source '${source}'`);

  const reported = raw?.severity ?? raw?.reportedSeverity ?? null;
  const mapped = normalizeSeverity(reported);
  if (!mapped) errors.push(`UNKNOWN_SEVERITY: cannot map '${reported}' from ${source}`);

  const status = raw?.status ?? "OPEN";
  const blocker = deriveReleaseBlocker({ severity: mapped, status, signals: raw?.signals ?? {} });
  const severity = maxSeverity(mapped, blocker.severityFloor);

  if (mapped && severity !== mapped) {
    // Escalation only — assert the invariant rather than trusting the caller.
    if (SEVERITY_RANK[severity] < SEVERITY_RANK[mapped]) errors.push("normalization attempted a severity DOWNGRADE");
  }

  return {
    ok: errors.length === 0,
    errors,
    finding: {
      findingId: raw?.findingId ?? null,
      title: raw?.title ?? null,
      source,
      sourceReference,
      reportedSeverity: typeof reported === "string" ? reported : null,
      severity,
      category: raw?.category ?? null,
      affectedSurface: raw?.affectedSurface ?? null,
      firstObservedAt: raw?.firstObservedAt ?? null,
      status,
      remediationReference: raw?.remediationReference ?? null,
      retestReference: raw?.retestReference ?? null,
      releaseBlocker: blocker.releaseBlocker,
      releaseBlockerReasons: blocker.reasons,
      riskAcceptanceReference: raw?.riskAcceptanceReference ?? null,
      riskAcceptanceExpiresAt: raw?.riskAcceptanceExpiresAt ?? null,
      evidenceHash: raw?.evidenceHash ?? null,
    },
  };
}

/**
 * Convert `npm audit --json` (v2/v3 `vulnerabilities` map) into normalized rows.
 * Only the fields safe for a public repository are carried across: package name,
 * severity, advisory identifier and whether a fix is available.
 */
export function normalizeNpmAudit(auditJson) {
  const rows = [];
  const vulns = auditJson?.vulnerabilities;
  if (!vulns || typeof vulns !== "object") return rows;
  for (const [name, v] of Object.entries(vulns)) {
    const severity = normalizeSeverity(v?.severity);
    const advisories = Array.isArray(v?.via)
      ? v.via.filter((x) => x && typeof x === "object").map((x) => x.url ?? x.source ?? null).filter(Boolean)
      : [];
    rows.push({
      package: name,
      reportedSeverity: typeof v?.severity === "string" ? v.severity : null,
      severity,
      direct: v?.isDirect === true,
      fixAvailable: v?.fixAvailable !== false && v?.fixAvailable !== undefined,
      advisories: advisories.map(String),
    });
  }
  rows.sort((a, b) => (SEVERITY_RANK[b.severity] ?? -1) - (SEVERITY_RANK[a.severity] ?? -1) || a.package.localeCompare(b.package));
  return rows;
}

/** Counters the dependency-review gate publishes. */
export function summarizeDependencyRows(rows) {
  const out = { CRITICAL: 0, HIGH: 0, MEDIUM: 0, LOW: 0, INFO: 0, UNKNOWN: 0 };
  for (const r of rows) {
    if (r.severity && out[r.severity] !== undefined) out[r.severity] += 1;
    else out.UNKNOWN += 1;
  }
  return out;
}
