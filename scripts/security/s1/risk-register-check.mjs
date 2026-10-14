#!/usr/bin/env node
/**
 * S1 — risk-register checker and canonicaliser.
 *
 * Dependency-free (`node:` built-ins only), because the security worktree has no
 * `node_modules` and installing packages is not permitted inside this programme.
 *
 *   node scripts/security/s1/risk-register-check.mjs generate   # canonicalise in place
 *   node scripts/security/s1/risk-register-check.mjs check      # all invariants, exit 0 when clean
 *   node scripts/security/s1/risk-register-check.mjs summary     # the computed counters as JSON
 *
 * WHAT THIS TOOL IS, AND IS NOT. It proves the register is internally consistent,
 * arithmetically correct, fully covering, deterministic and in agreement with the
 * Markdown report. It proves nothing about the platform's security: a green run
 * means the risk register is well-formed, not that a risk is mitigated.
 *
 * THE SCORING METHOD IS DECLARED HERE AND IN THE MARKDOWN, AND THE TWO MUST AGREE.
 * It was fixed before any risk was scored:
 *
 *   likelihood = round( mean(reachability, exploitability, privilegeAccessibility, repeatability) )
 *   impact     = max( confidentiality, integrity, availability, auditability, industrialSafety )
 *   score      = likelihood * impact
 *
 * Every factor is 0..5 and is oriented so that a HIGHER number always means MORE
 * risk. `privilegeAccessibility` therefore scores 5 when NO privilege is needed and 0
 * when platform ownership plus host access is needed — the inverse of the plain
 * reading of its name, which is why it is spelled out here and in the report.
 *
 * `round` is `Math.round`, which for a non-negative value rounds a half up
 * (2.5 -> 3). A mean of four integers can only be x.0, x.25, x.5 or x.75, so this
 * is fully determined; it is stated because "round" alone is ambiguous.
 *
 * Severity bands: 20-25 CRITICAL - 12-19 HIGH - 6-11 MEDIUM - 1-5 LOW - 0 INFORMATIONAL.
 *
 * THE CRITICAL CLAMP, also declared before scoring. A risk whose `productionState`
 * is not `ACTIVE_CONFIRMED` cannot be CRITICAL: its severity is clamped to HIGH and
 * the clamp is recorded on the risk with its rule. This is a mechanical rule applied
 * uniformly, NOT a manual severity override — there is no manual override mechanism
 * in this register at all, and a `severity` that does not equal the computed value
 * is a gate failure. The clamp exists because an unproven or latent path must not
 * be able to reach the top band on the strength of its impact alone.
 */

import { createHash } from "node:crypto";
import { AsyncLocalStorage } from "node:async_hooks";
import { readFileSync, writeFileSync, existsSync, statSync, realpathSync, mkdtempSync, rmSync, cpSync, mkdirSync } from "node:fs";
import { spawn } from "node:child_process";
import { tmpdir } from "node:os";
import { join, dirname, sep, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
export const REPO_ROOT = join(HERE, "..", "..", "..");
export const REGISTER_PATH = join(REPO_ROOT, "docs", "security", "s1-risk-register.json");
export const REPORT_PATH = join(REPO_ROOT, "docs", "security", "THREAT-MODEL-AND-RISK-REGISTER.md");

export const METHOD_VERSION = "s1-v1";

// ───────────────────────────────── closed enums ────────────────────────────────

export const PRODUCTION_STATES = Object.freeze([
  "ACTIVE_CONFIRMED",
  "LATENT_CONFIG_GUARDED",
  "CODE_CONFIRMED_RUNTIME_UNPROVEN",
  "ASSURANCE_GAP",
  "POLICY_AMBIGUITY",
  "POSITIVE_CONTROL",
]);

export const SEVERITIES = Object.freeze(["CRITICAL", "HIGH", "MEDIUM", "LOW", "INFORMATIONAL"]);

export const CONFIDENCES = Object.freeze(["HIGH", "MEDIUM", "LOW"]);

export const FINDING_STATUSES = Object.freeze([
  "MAPPED_TO_RISK",
  "DUPLICATE_OF",
  "POLICY_QUESTION",
  "ASSURANCE_GAP",
  "POSITIVE_CONTROL",
  "NOT_A_SECURITY_RISK_WITH_REASON",
]);

/** Statuses that must name exactly one owning risk. */
export const OWNED_STATUSES = Object.freeze([
  "MAPPED_TO_RISK",
  "POLICY_QUESTION",
  "ASSURANCE_GAP",
  "POSITIVE_CONTROL",
]);

export const THREAT_ACTORS = Object.freeze([
  "ANONYMOUS_PUBLIC",
  "AUTHENTICATED_USER",
  "MALICIOUS_TENANT_MEMBER",
  "TENANT_ADMIN_OR_TAKEOVER",
  "DIRECT_ORIGIN_ATTACKER",
  "CREDENTIAL_STUFFING_ATTACKER",
  "INSIDER_OR_ERRING_OPERATOR",
  "SUPPLY_CHAIN_ATTACKER",
  "INFRASTRUCTURE_FAILURE",
  "STALE_TOKEN_HOLDER",
]);

export const ASSETS = Object.freeze([
  "IDENTITY_AND_SESSION",
  "TENANT_ISOLATION",
  "SITE_ISOLATION",
  "AUTHORIZATION_BOUNDARY",
  "FACTORY_AND_ERP_DATA",
  "DIGITAL_TWIN_AND_KNOWLEDGE_GRAPH",
  "DOCUMENTS_AND_UPLOADS",
  "PUBLIC_CONTENT",
  "AUDIT_EVIDENCE",
  "SECRETS_AND_SIGNING_KEYS",
  "POSTGRES",
  "REDIS",
  "IN_MEMORY_FALLBACK_STORE",
  "EDGE_AND_ORIGIN",
  "CLIENT_IP_TRUTH",
  "RATE_LIMITING",
  "CI_CD_AND_ARTIFACTS",
  "DEPENDENCY_TREE",
  "BACKUP_AND_DR",
  "WORKER_BOUNDARY",
  "OT_GATEWAY_BOUNDARY",
  "PII_AND_CANDIDATE_DATA",
  "BILLING_AND_METERING",
  "SECURITY_ASSURANCE_INSTRUMENTS",
]);

export const STRIDE = Object.freeze([
  "SPOOFING",
  "TAMPERING",
  "REPUDIATION",
  "INFORMATION_DISCLOSURE",
  "DENIAL_OF_SERVICE",
  "ELEVATION_OF_PRIVILEGE",
]);

/**
 * Remediation phases. S0 and S1 are real: this programme executed them. The S2..S12
 * labels are PROPOSED_NOT_AUTHORIZED — no document in this repository defines them
 * formally. Several are nevertheless anchored in an existing S0 sentence, and the
 * Markdown records which ones and where; the rest are this phase's proposal.
 */
export const REMEDIATION_PHASES = Object.freeze([
  "S1_NO_CHANGE_REQUIRED",
  "S2_SCANNING_AND_SUPPLY_CHAIN",
  "S3_IDENTITY_SESSION_AND_MFA",
  "S4_TENANT_AND_SITE_ISOLATION",
  "S5_MUTATION_SURFACE_AND_ABUSE_CONTROLS",
  "S6_OT_GATEWAY_AND_CRYPTO_LIFECYCLE",
  "S7_FAILURE_SEMANTICS_AND_TRUTHFULNESS",
  "S8_AUDIT_AND_TAMPER_EVIDENCE",
  "S9_OBSERVABILITY_AND_DETECTION",
  "S10_OT_PRECONDITIONS_BEFORE_PROTOCOL_CLIENTS",
  "S11_INFRASTRUCTURE_AND_CONTAINER_HARDENING",
  "S12_DR_RUNBOOKS_AND_REHEARSAL",
  "OWNER_POLICY_DECISION",
]);

export const VERIFICATION_METHODS = Object.freeze([
  "SOURCE_REVIEW",
  "AUTOMATED_TEST",
  "DETERMINISTIC_TOOL_GATE",
  "FAULT_INJECTION_REHEARSAL",
  "OWNER_READ_ONLY_PRODUCTION_CHECK",
  "EXTERNAL_VANTAGE_OBSERVATION",
  "OWNER_POLICY_STATEMENT",
  "NOT_YET_VERIFIABLE",
]);

export const LIKELIHOOD_FACTOR_KEYS = Object.freeze([
  "reachability",
  "exploitability",
  "privilegeAccessibility",
  "repeatability",
]);

export const IMPACT_FACTOR_KEYS = Object.freeze([
  "confidentiality",
  "integrity",
  "availability",
  "auditability",
  "industrialSafety",
]);

// ─────────────────────────────── canonical ordering ────────────────────────────

const RISK_KEY_ORDER = Object.freeze([
  "riskId",
  "title",
  "productionState",
  "guardEvidence",
  "runtimeEvidence",
  "stride",
  "threatActors",
  "preconditions",
  "affectedAssets",
  "sourceFindingIds",
  "evidence",
  "existingControls",
  "controlGaps",
  "likelihoodFactors",
  "impactFactors",
  "likelihood",
  "impact",
  "score",
  "severityFromScore",
  "severityClamp",
  "severity",
  "dominantImpact",
  "confidence",
  "remediationPriority",
  "remediationPhase",
  "remediationOwnership",
  "acceptanceCriteria",
  "verificationMethod",
  "residualRisk",
  "dependencies",
  "relatedRiskIds",
]);

const FINDING_KEY_ORDER = Object.freeze([
  "findingId",
  "family",
  "source",
  "summary",
  "status",
  "ownerRiskId",
  "duplicateOf",
  "reason",
  "relatedRiskIds",
]);

const EVIDENCE_KEY_ORDER = Object.freeze(["path", "locator", "note"]);

const TOP_KEY_ORDER = Object.freeze([
  "schemaVersion",
  "phase",
  "methodVersion",
  "sourceSha",
  "note",
  "scoringMethod",
  "enums",
  "risks",
  "findings",
]);

// ──────────────────────────────── computation ──────────────────────────────────

/** Deterministic: a mean of four integers is x.0, x.25, x.5 or x.75; a half rounds up. */
export function computeLikelihood(f) {
  const sum = LIKELIHOOD_FACTOR_KEYS.reduce((a, k) => a + f[k], 0);
  return Math.round(sum / LIKELIHOOD_FACTOR_KEYS.length);
}

export function computeImpact(f) {
  return Math.max(...IMPACT_FACTOR_KEYS.map((k) => f[k]));
}

export function severityForScore(score) {
  if (score >= 20) return "CRITICAL";
  if (score >= 12) return "HIGH";
  if (score >= 6) return "MEDIUM";
  if (score >= 1) return "LOW";
  return "INFORMATIONAL";
}

export const CLAMP_RULE = "CRITICAL_REQUIRES_ACTIVE_CONFIRMED";

/**
 * The clamp's reason is derived, not written, so it can never drift from the
 * state that caused it. A configuration-guarded risk was MEASURED inactive in the
 * observed container; any other non-active state means the path was simply never
 * observed. Those are different claims and the register must not blur them.
 */
export const CLAMP_REASON_GUARDED = "observed inactive configuration in current container";
export function clampReasonFor(productionState) {
  return productionState === "LATENT_CONFIG_GUARDED"
    ? CLAMP_REASON_GUARDED
    : `the path is not proven reachable in production (productionState ${productionState})`;
}

/**
 * The full derivation for one risk, from its factors alone. Returns what the
 * register must contain; `check` compares and fails on any difference.
 */
export function derive(risk) {
  const likelihood = computeLikelihood(risk.likelihoodFactors);
  const impact = computeImpact(risk.impactFactors);
  const score = likelihood * impact;
  const severityFromScore = severityForScore(score);
  let severity = severityFromScore;
  let severityClamp = null;
  if (severityFromScore === "CRITICAL" && risk.productionState !== "ACTIVE_CONFIRMED") {
    severity = "HIGH";
    severityClamp = {
      applied: true,
      from: "CRITICAL",
      to: "HIGH",
      rule: CLAMP_RULE,
      reason: clampReasonFor(risk.productionState),
    };
  }
  const dominantImpact = IMPACT_FACTOR_KEYS.filter((k) => risk.impactFactors[k] === impact && impact > 0).map(
    (k) => IMPACT_DIMENSION_LABELS[k],
  );
  return { likelihood, impact, score, severityFromScore, severityClamp, severity, dominantImpact };
}

// ───────────────────────────── canonical serialization ─────────────────────────

function orderKeys(obj, order) {
  const out = {};
  for (const k of order) if (Object.prototype.hasOwnProperty.call(obj, k)) out[k] = obj[k];
  for (const k of Object.keys(obj).sort()) if (!(k in out)) out[k] = obj[k];
  return out;
}

function byId(key) {
  return (a, b) => (a[key] < b[key] ? -1 : a[key] > b[key] ? 1 : 0);
}

/** Sorted copy of a string array, for the id lists where order carries no meaning. */
function sortedStrings(a) {
  return [...a].sort();
}

export function canonicalize(reg) {
  const risks = [...reg.risks].sort(byId("riskId")).map((r) => {
    const d = derive(r);
    const copy = {
      ...r,
      stride: sortedStrings(r.stride),
      threatActors: sortedStrings(r.threatActors),
      affectedAssets: sortedStrings(r.affectedAssets),
      sourceFindingIds: sortedStrings(r.sourceFindingIds),
      dependencies: sortedStrings(r.dependencies ?? []),
      relatedRiskIds: sortedStrings(r.relatedRiskIds ?? []),
      evidence: [...r.evidence]
        .map((e) => orderKeys(e, EVIDENCE_KEY_ORDER))
        .sort((x, y) =>
          x.path < y.path ? -1 : x.path > y.path ? 1 : String(x.locator ?? "") < String(y.locator ?? "") ? -1 : 1,
        ),
      likelihoodFactors: orderKeys(r.likelihoodFactors, LIKELIHOOD_FACTOR_KEYS),
      impactFactors: orderKeys(r.impactFactors, IMPACT_FACTOR_KEYS),
      ...d,
    };
    return orderKeys(copy, RISK_KEY_ORDER);
  });

  const findings = [...reg.findings].sort(byId("findingId")).map((f) => {
    const copy = { ...f, relatedRiskIds: sortedStrings(f.relatedRiskIds ?? []) };
    if (copy.relatedRiskIds.length === 0) delete copy.relatedRiskIds;
    return orderKeys(copy, FINDING_KEY_ORDER);
  });

  const top = orderKeys(
    {
      ...reg,
      methodVersion: METHOD_VERSION,
      scoringMethod: {
        likelihood: "round(mean(reachability, exploitability, privilegeAccessibility, repeatability))",
        impact: "max(confidentiality, integrity, availability, auditability, industrialSafety)",
        score: "likelihood * impact",
        rounding: "Math.round — a half rounds up; a mean of four 0..5 integers is x.0/x.25/x.5/x.75",
        factorOrientation: "every factor 0..5, higher always means more risk; privilegeAccessibility=5 means none needed",
        bands: { CRITICAL: "20-25", HIGH: "12-19", MEDIUM: "6-11", LOW: "1-5", INFORMATIONAL: "0" },
        clamp: `${CLAMP_RULE} — a risk whose productionState is not ACTIVE_CONFIRMED is clamped from CRITICAL to HIGH`,
        manualOverrides: "none exist; severity is always the computed value",
      },
      enums: {
        productionStates: PRODUCTION_STATES,
        severities: SEVERITIES,
        confidences: CONFIDENCES,
        findingStatuses: FINDING_STATUSES,
        threatActors: THREAT_ACTORS,
        assets: ASSETS,
        stride: STRIDE,
        remediationPhases: REMEDIATION_PHASES,
        verificationMethods: VERIFICATION_METHODS,
      },
      risks,
      findings,
    },
    TOP_KEY_ORDER,
  );
  return top;
}

export function render(reg) {
  return `${JSON.stringify(canonicalize(reg), null, 2)}\n`;
}

// ──────────────────────────────── the invariants ───────────────────────────────

const ABSOLUTE_PATH_PATTERNS = [
  /[A-Za-z]:[\\/]/,
  /\/(?:home|Users|root)\//,
  /\\\\/,
  /AppData/,
  /\/tmp\//,
];
// A clock time makes a document non-reproducible; a plain historical date does not,
// so only times of day and ISO date-times are forbidden.
const TIMESTAMP_PATTERNS = [/\b\d{1,2}:\d{2}(?::\d{2})?\b/, /\d{4}-\d{2}-\d{2}T\d{2}/];
const TIMESTAMP_KEY = /^(?:generatedAt|producedAt|timestamp|createdAt|updatedAt|date|time)$/i;

function walkStrings(node, path, visit) {
  if (typeof node === "string") return visit(node, path);
  if (Array.isArray(node)) return node.forEach((v, i) => walkStrings(v, `${path}[${i}]`, visit));
  if (node && typeof node === "object") {
    for (const [k, v] of Object.entries(node)) {
      if (TIMESTAMP_KEY.test(k)) visit(`__FORBIDDEN_KEY__${k}`, `${path}.${k}`);
      walkStrings(v, `${path}.${k}`, visit);
    }
  }
}

export function forbiddenContent(reg) {
  const hits = [];
  walkStrings(reg, "$", (s, p) => {
    if (s.startsWith("__FORBIDDEN_KEY__")) {
      hits.push({ at: p, kind: "TIMESTAMP_KEY", value: s.slice(17) });
      return;
    }
    for (const re of ABSOLUTE_PATH_PATTERNS) {
      if (re.test(s)) hits.push({ at: p, kind: "ABSOLUTE_PATH", value: s.slice(0, 80) });
    }
    for (const re of TIMESTAMP_PATTERNS) {
      if (re.test(s)) hits.push({ at: p, kind: "TIMESTAMP", value: s.slice(0, 80) });
    }
  });
  return hits;
}

/** An evidence `path` must be a repo-relative path that exists. */
export function missingEvidence(reg, root = REPO_ROOT) {
  const out = [];
  for (const r of reg.risks) {
    for (const e of r.evidence) {
      const rel = e.path;
      if (!rel || rel.startsWith("/") || /[A-Za-z]:/.test(rel)) {
        out.push({ riskId: r.riskId, path: rel, why: "NOT_REPO_RELATIVE" });
        continue;
      }
      const abs = join(root, ...rel.split("/"));
      if (!existsSync(abs)) out.push({ riskId: r.riskId, path: rel, why: "DOES_NOT_EXIST" });
      else if (!statSync(abs).isFile() && !statSync(abs).isDirectory()) {
        out.push({ riskId: r.riskId, path: rel, why: "NOT_A_FILE" });
      }
    }
  }
  return out;
}

export function enumViolations(reg) {
  const out = [];
  const riskIds = new Set(reg.risks.map((r) => r.riskId));
  const findingIds = new Set(reg.findings.map((f) => f.findingId));
  const push = (where, field, value) => out.push({ where, field, value });

  for (const r of reg.risks) {
    if (!PRODUCTION_STATES.includes(r.productionState)) push(r.riskId, "productionState", r.productionState);
    if (!CONFIDENCES.includes(r.confidence)) push(r.riskId, "confidence", r.confidence);
    if (!SEVERITIES.includes(r.severity)) push(r.riskId, "severity", r.severity);
    if (!REMEDIATION_PHASES.includes(r.remediationPhase)) push(r.riskId, "remediationPhase", r.remediationPhase);
    if (!VERIFICATION_METHODS.includes(r.verificationMethod)) {
      push(r.riskId, "verificationMethod", r.verificationMethod);
    }
    for (const a of r.threatActors) if (!THREAT_ACTORS.includes(a)) push(r.riskId, "threatActors", a);
    for (const a of r.affectedAssets) if (!ASSETS.includes(a)) push(r.riskId, "affectedAssets", a);
    for (const a of r.stride) if (!STRIDE.includes(a)) push(r.riskId, "stride", a);
    for (const k of LIKELIHOOD_FACTOR_KEYS) {
      const v = r.likelihoodFactors?.[k];
      if (!Number.isInteger(v) || v < 0 || v > 5) push(r.riskId, `likelihoodFactors.${k}`, v);
    }
    for (const k of IMPACT_FACTOR_KEYS) {
      const v = r.impactFactors?.[k];
      if (!Number.isInteger(v) || v < 0 || v > 5) push(r.riskId, `impactFactors.${k}`, v);
    }
    if (!Number.isInteger(r.remediationPriority) || r.remediationPriority < 1) {
      push(r.riskId, "remediationPriority", r.remediationPriority);
    }
    for (const id of r.sourceFindingIds) if (!findingIds.has(id)) push(r.riskId, "sourceFindingIds", id);
    for (const id of r.relatedRiskIds ?? []) if (!riskIds.has(id)) push(r.riskId, "relatedRiskIds", id);
    for (const id of r.dependencies ?? []) if (!riskIds.has(id)) push(r.riskId, "dependencies", id);
    // A positive control carries no risk score: every factor must be zero.
    if (r.productionState === "POSITIVE_CONTROL") {
      const nonZero = [...LIKELIHOOD_FACTOR_KEYS, ...IMPACT_FACTOR_KEYS].filter(
        (k) => (r.likelihoodFactors[k] ?? r.impactFactors[k]) !== 0,
      );
      if (nonZero.length) push(r.riskId, "POSITIVE_CONTROL_MUST_SCORE_ZERO", nonZero.join(","));
    }
  }

  for (const f of reg.findings) {
    if (!FINDING_STATUSES.includes(f.status)) push(f.findingId, "status", f.status);
    if (f.ownerRiskId != null && !riskIds.has(f.ownerRiskId)) push(f.findingId, "ownerRiskId", f.ownerRiskId);
    if (f.duplicateOf != null && !findingIds.has(f.duplicateOf)) push(f.findingId, "duplicateOf", f.duplicateOf);
    for (const id of f.relatedRiskIds ?? []) if (!riskIds.has(id)) push(f.findingId, "relatedRiskIds", id);
  }
  return out;
}

export function duplicateRiskIds(reg) {
  const seen = new Set();
  const dup = [];
  for (const r of reg.risks) {
    if (seen.has(r.riskId)) dup.push(r.riskId);
    seen.add(r.riskId);
  }
  return dup;
}

export function duplicateFindingIds(reg) {
  const seen = new Set();
  const dup = [];
  for (const f of reg.findings) {
    if (seen.has(f.findingId)) dup.push(f.findingId);
    seen.add(f.findingId);
  }
  return dup;
}

/**
 * A finding is an orphan when it carries no status, or when its status requires an
 * owning risk and none is named, or when a DUPLICATE_OF points at another duplicate
 * (which would leave the chain without a real owner).
 */
export function orphanFindings(reg) {
  const byIdMap = new Map(reg.findings.map((f) => [f.findingId, f]));
  const out = [];
  for (const f of reg.findings) {
    if (!f.status) {
      out.push({ findingId: f.findingId, why: "NO_STATUS" });
      continue;
    }
    if (OWNED_STATUSES.includes(f.status) && !f.ownerRiskId) {
      out.push({ findingId: f.findingId, why: "STATUS_REQUIRES_OWNER" });
    }
    if (f.status === "DUPLICATE_OF") {
      if (!f.duplicateOf) out.push({ findingId: f.findingId, why: "DUPLICATE_WITHOUT_TARGET" });
      else {
        const t = byIdMap.get(f.duplicateOf);
        if (t && t.status === "DUPLICATE_OF") {
          out.push({ findingId: f.findingId, why: "DUPLICATE_CHAIN" });
        }
      }
    }
    if (f.status === "NOT_A_SECURITY_RISK_WITH_REASON" && !f.reason) {
      out.push({ findingId: f.findingId, why: "NOT_A_RISK_WITHOUT_REASON" });
    }
  }
  return out;
}

/**
 * Primary ownership must be single and bidirectional: a finding names one risk, that
 * risk lists the finding, and no other risk lists it.
 */
export function ownershipViolations(reg) {
  const out = [];
  const owners = new Map(); // findingId -> [riskId]
  for (const r of reg.risks) {
    for (const id of r.sourceFindingIds) {
      if (!owners.has(id)) owners.set(id, []);
      owners.get(id).push(r.riskId);
    }
  }
  for (const [findingId, list] of owners) {
    if (list.length > 1) out.push({ findingId, why: "MULTIPLE_OWNING_RISKS", owners: [...list].sort() });
  }
  const byIdMap = new Map(reg.findings.map((f) => [f.findingId, f]));
  for (const [findingId, list] of owners) {
    const f = byIdMap.get(findingId);
    if (!f) continue;
    if (f.ownerRiskId !== list[0]) {
      out.push({ findingId, why: "OWNER_DISAGREEMENT", onFinding: f.ownerRiskId ?? null, onRisk: list[0] });
    }
  }
  for (const f of reg.findings) {
    if (OWNED_STATUSES.includes(f.status) && f.ownerRiskId && !owners.has(f.findingId)) {
      out.push({ findingId: f.findingId, why: "RISK_DOES_NOT_CLAIM_IT", onFinding: f.ownerRiskId });
    }
  }
  return out;
}

export function duplicateRemediationOwnership(reg) {
  const seen = new Map();
  const dup = [];
  for (const r of reg.risks) {
    const key = r.remediationOwnership;
    if (!key) {
      dup.push({ riskId: r.riskId, why: "MISSING" });
      continue;
    }
    if (seen.has(key)) dup.push({ riskId: r.riskId, why: "DUPLICATE", key, other: seen.get(key) });
    else seen.set(key, r.riskId);
  }
  return dup;
}

export function arithmeticViolations(reg) {
  const out = [];
  for (const r of reg.risks) {
    const d = derive(r);
    if (r.likelihood !== d.likelihood) out.push({ riskId: r.riskId, field: "likelihood", stored: r.likelihood, computed: d.likelihood });
    if (r.impact !== d.impact) out.push({ riskId: r.riskId, field: "impact", stored: r.impact, computed: d.impact });
    if (r.score !== d.score) out.push({ riskId: r.riskId, field: "score", stored: r.score, computed: d.score });
    if (r.severityFromScore !== d.severityFromScore) {
      out.push({ riskId: r.riskId, field: "severityFromScore", stored: r.severityFromScore, computed: d.severityFromScore });
    }
    if (r.severity !== d.severity) out.push({ riskId: r.riskId, field: "severity", stored: r.severity, computed: d.severity });
    if ((r.dominantImpact ?? []).join("+") !== d.dominantImpact.join("+")) {
      out.push({ riskId: r.riskId, field: "dominantImpact", stored: r.dominantImpact, computed: d.dominantImpact });
    }
    const storedClamp = r.severityClamp ? r.severityClamp.rule : null;
    const computedClamp = d.severityClamp ? d.severityClamp.rule : null;
    if (storedClamp !== computedClamp) {
      out.push({ riskId: r.riskId, field: "severityClamp", stored: storedClamp, computed: computedClamp });
    }
    const storedReason = r.severityClamp ? r.severityClamp.reason : null;
    const computedReason = d.severityClamp ? d.severityClamp.reason : null;
    if (storedReason !== computedReason) {
      out.push({ riskId: r.riskId, field: "severityClamp.reason", stored: storedReason, computed: computedReason });
    }
  }
  return out;
}

export function missingRequiredFields(reg) {
  const out = [];
  const required = [
    "riskId", "title", "productionState", "threatActors", "preconditions", "affectedAssets",
    "sourceFindingIds", "evidence", "existingControls", "controlGaps", "likelihoodFactors",
    "impactFactors", "likelihood", "impact", "score", "severity", "confidence",
    "remediationPriority", "remediationPhase", "acceptanceCriteria", "verificationMethod",
    "residualRisk", "dependencies", "stride", "remediationOwnership",
  ];
  for (const r of reg.risks) {
    for (const k of required) {
      const v = r[k];
      const empty = v == null || (Array.isArray(v) && v.length === 0) || (typeof v === "string" && !v.trim());
      // `dependencies` and `preconditions` may legitimately be empty; the rest may not.
      if (empty && !["dependencies", "preconditions"].includes(k)) out.push({ riskId: r.riskId, field: k });
    }
  }
  return out;
}

/** CRITICAL and HIGH must carry acceptance criteria and a verification method that is not "not yet verifiable". */
export function acceptanceCriteriaViolations(reg) {
  const out = [];
  for (const r of reg.risks) {
    if (r.severity !== "CRITICAL" && r.severity !== "HIGH") continue;
    if (!Array.isArray(r.acceptanceCriteria) || r.acceptanceCriteria.length === 0) {
      out.push({ riskId: r.riskId, why: "NO_ACCEPTANCE_CRITERIA" });
    }
    if (!r.residualRisk || !String(r.residualRisk).trim()) out.push({ riskId: r.riskId, why: "NO_RESIDUAL_RISK" });
  }
  return out;
}

/** CRITICAL is reserved for a currently reachable path; the clamp should make this unreachable. */
export function criticalWithoutActiveConfirmed(reg) {
  return reg.risks
    .filter((r) => r.severity === "CRITICAL" && r.productionState !== "ACTIVE_CONFIRMED")
    .map((r) => r.riskId);
}

/**
 * `remediationPriority` is a unique total order over the risks, and it must not
 * contradict severity: a risk cannot be scheduled after a strictly less severe one.
 * Without this a register can carry correct severities and a remediation order that
 * silently disagrees with them.
 */
export function priorityViolations(reg) {
  const out = [];
  const seen = new Map();
  for (const r of reg.risks) {
    if (seen.has(r.remediationPriority)) {
      out.push({ riskId: r.riskId, why: "DUPLICATE_PRIORITY", priority: r.remediationPriority, other: seen.get(r.remediationPriority) });
    } else seen.set(r.remediationPriority, r.riskId);
  }
  const rank = Object.fromEntries(SEVERITIES.map((s, i) => [s, i]));
  const ordered = [...reg.risks].sort((a, b) => a.remediationPriority - b.remediationPriority);
  for (let i = 1; i < ordered.length; i += 1) {
    if (rank[ordered[i].severity] < rank[ordered[i - 1].severity]) {
      out.push({
        riskId: ordered[i].riskId,
        why: "SEVERITY_INVERSION",
        after: ordered[i - 1].riskId,
        severities: [ordered[i - 1].severity, ordered[i].severity],
      });
    }
  }
  return out;
}


// ─────────────────── evidence-consistency gates (S1 reconciliation) ───────────
//
// These three exist because the register originally contradicted the evidence it
// was built from: it carried "precondition UNVERIFIED" for AUTH_SECRET while a
// committed S0 document already recorded the owner-supplied presence check and
// the verdict that the flaw is NOT active in the observed container. One document
// saying UNVERIFIED and another saying SET is exactly the kind of drift a risk
// register must make impossible, not inherit.

/** Uncertainty asserted about a PRECONDITION the recorded evidence settles. */
const PRESENCE_UNCERTAINTY = [
  /\b(?:unverified|unconfirmed)\b[^.]{0,80}?\bprecondition\b/i,
  /\bprecondition\b[^.]{0,80}?\b(?:unverified|unconfirmed|not (?:yet )?(?:been )?(?:checked|verified|established))\b/i,
  /\b(?:is|remains)\s+(?:unverified|unconfirmed)\b/i,
];

/** A request to repeat a check whose result the register already holds. */
const REPEAT_REQUEST = [
  /\b(?:re-?run|re-?execute|run|execute|perform)\b[^.]{0,80}?\bpresence check\b/i,
  /\bpresence check\b[^.]{0,60}?\bis (?:executed|run|performed)\b/i,
  /\bdocker inspect\b/i,
];

/** The prose fields of a risk, excluding the evidence blocks themselves. */
function riskProse(r) {
  return [
    r.title,
    ...(r.preconditions ?? []),
    ...(r.existingControls ?? []),
    ...(r.controlGaps ?? []),
    ...(r.acceptanceCriteria ?? []),
    r.residualRisk ?? "",
    r.severityClamp ? r.severityClamp.reason : "",
  ].filter(Boolean);
}

/**
 * A risk that carries definitive runtime evidence must not also describe that
 * same condition as unknown, and must not ask for the check to be repeated.
 */
export function runtimeEvidenceContradictions(reg, md = null) {
  const out = [];
  if (typeof md === "string") out.push(...reportContradictions(reg, md));
  for (const r of reg.risks) {
    const re = r.runtimeEvidence;
    if (!re) continue;
    if (typeof re.activeInCurrentContainer !== "boolean") {
      out.push({ riskId: r.riskId, why: "ACTIVE_IN_CURRENT_CONTAINER_NOT_STATED" });
    }
    if (!re.source || !Array.isArray(re.variables) || re.variables.length === 0) {
      out.push({ riskId: r.riskId, why: "EVIDENCE_WITHOUT_SOURCE_OR_VARIABLES" });
    }
    if (!Array.isArray(re.doesNotProve) || re.doesNotProve.length === 0) {
      out.push({ riskId: r.riskId, why: "EVIDENCE_WITHOUT_STATED_LIMITS" });
    }
    for (const text of riskProse(r)) {
      for (const rx of PRESENCE_UNCERTAINTY) {
        if (rx.test(text)) {
          out.push({ riskId: r.riskId, why: "CONDITION_CALLED_UNKNOWN", text: text.slice(0, 90) });
        }
      }
      for (const rx of REPEAT_REQUEST) {
        if (rx.test(text)) {
          out.push({ riskId: r.riskId, why: "ASKS_TO_REPEAT_RECORDED_EVIDENCE", text: text.slice(0, 90) });
        }
      }
      // Naming a settled variable next to an uncertainty word is a contradiction
      // whatever the phrasing around it.
      for (const v of re.variables ?? []) {
        const UNSURE = "(?:unverified|unconfirmed|not (?:yet )?(?:been )?(?:checked|verified))";
        const near = new RegExp(`${v}[^.]{0,80}?${UNSURE}|${UNSURE}[^.]{0,80}?${v}`, "i");
        if (near.test(text)) {
          out.push({
            riskId: r.riskId,
            why: "SETTLED_VARIABLE_CALLED_UNKNOWN",
            variable: v,
            text: text.slice(0, 90),
          });
        }
      }
    }
  }
  return out;
}

/**
 * A configuration-guarded risk must name the guard it was observed behind.
 * "Latent" without a named guard is an assertion; with one it is evidence.
 */
/**
 * S1-RV-002 — the contradiction gate now reads the report as well as the register.
 *
 * The first build scanned only the JSON, so two sentences survived in the report
 * saying the clamped risks' "single precondition is unverified" while the derived
 * clamp reason said the opposite. The gate that existed to prevent exactly that
 * could not see the document it was protecting.
 *
 * The hard part is that the report MUST be able to quote the superseded sentence —
 * disclosing the contradiction between two S0 documents is one of its findings. So
 * a line is exempt when it is explicitly marked as a historical or superseded
 * quotation. Everything else that pairs a settled variable, or a settled
 * precondition, with an uncertainty word is a failure.
 */
/**
 * S1-R2-001 — the historical exemption is now ONE exact machine marker, and it
 * exempts only the line it sits on.
 *
 * The first implementation exempted a line when any of `superseded`, `no longer`,
 * `historical` or `revision 1` appeared within a five-line window. The second
 * independent review showed that four of six marker variants silenced a live
 * claim: "AUTH_SECRET has not been checked and must be verified before release."
 * passed simply because an unrelated sentence two lines below said "superseded".
 * Those words are ordinary prose, so the exemption was a blanket bypass.
 *
 * What replaces it:
 *   - no keyword, anywhere, creates an exemption;
 *   - one exact marker, on the same line as the quotation it covers;
 *   - the marker opens no region and cannot remove a second line from the scan;
 *   - an unused marker is itself a violation, so it cannot be scattered pre-emptively;
 *   - the marker is refused on a line that states a CURRENT obligation, so it can
 *     quote a superseded sentence but never excuse a live verdict.
 */
export const HISTORICAL_MARKER = "<!-- S1-HISTORICAL-SUPERSEDED -->";

/**
 * A line carrying the marker must actually contain something exemptable: an
 * uncertainty word next to a settled variable or next to the word "precondition".
 * Otherwise the marker is decoration that would silently pre-authorise a future
 * edit on that line.
 */
export const HISTORICAL_UNSURE =
  "(?:unverified|unconfirmed|not (?:yet )?(?:been )?(?:checked|verified)|needs? (?:to be )?(?:re-?)?check)";

/**
 * Phrases that make a line a CURRENT instruction rather than a quotation. The
 * marker is refused on these, because "must be verified before release" is a live
 * obligation whatever precedes it.
 */
export const CURRENT_OBLIGATION = [
  /\bmust (?:be )?(?:verif|re-?check|re-?run|confirm)/i,
  /\bbefore (?:release|commit|shipping|deploy)/i,
  /\bshould (?:be )?(?:verif|re-?check|re-?run|confirm)/i,
  /\bwe (?:must|need to|should) (?:verify|check|confirm)/i,
  /\bstill needs? (?:to be )?(?:verified|checked|confirmed)/i,
];

/** Does this line contain a phrase an exemption could legitimately cover? */
export function hasExemptableHistoricalPhrase(line, settledVariables) {
  const bare = line.replace(HISTORICAL_MARKER, " ");
  if (new RegExp(`\\bprecondition\\b[^.]{0,80}?${HISTORICAL_UNSURE}|${HISTORICAL_UNSURE}[^.]{0,80}?\\bprecondition\\b`, "i").test(bare)) {
    return true;
  }
  for (const v of settledVariables) {
    if (new RegExp(`${v}[^.]{0,100}?${HISTORICAL_UNSURE}|${HISTORICAL_UNSURE}[^.]{0,100}?${v}`, "i").test(bare)) {
      return true;
    }
  }
  return false;
}


/**
 * S1-R2-002 — ONE validated marker parser, shared by both consumers.
 *
 * The second independent review showed the report had an escape hatch: an unknown
 * block name, or a single unterminated opening marker, removed hand-authored prose
 * from the contradiction scan while the drift gate stayed silent. The two halves
 * disagreed by construction — `narrativeOnly` blanked by marker SHAPE and
 * `markdownBlockDrift` validated by known NAME — so prose could sit in a region
 * that one half treated as generated and the other did not police at all. An
 * unterminated marker blanked 871 of 998 narrative lines.
 *
 * The fix is a single parser whose allowed names are derived from `markdownBlocks`
 * and nowhere else. It fails on an unknown name, an unbalanced marker, a mismatched
 * pair, a duplicate, a nest and an overlap. Nothing may blank a line until the
 * parse has succeeded.
 */
export const BLOCK_MARKER_RX = /^<!--\s*(\/?)S1-BLOCK:([A-Za-z0-9_-]+)\s*-->$/;

/**
 * Parse every block marker in the report. Returns the validated regions and the
 * violations found; a non-empty `violations` means NOTHING may be blanked.
 */
export function parseMarkdownBlocks(reg, md) {
  const allowed = Object.keys(markdownBlocks(reg));
  const lines = md.split("\n");
  const violations = [];
  const regions = [];
  const seen = new Map();
  let open = null;

  lines.forEach((raw, i) => {
    const m = BLOCK_MARKER_RX.exec(raw.trim());
    if (!m) return;
    const closing = m[1] === "/";
    const name = m[2];
    const line = i + 1;
    // S1-R4 FR-10: a marker line is exactly the canonical marker — no leading or
    // trailing whitespace, no tab, no altered inner spacing. The regex recognises a
    // marker ATTEMPT so that a variant can be named; it does not make the variant valid.
    const canonical = closing ? BLOCK_CLOSE(name) : BLOCK_OPEN(name);
    if (raw !== canonical) violations.push({ why: "NONCANONICAL_BLOCK_MARKER", name, line, found: JSON.stringify(raw).slice(0, 80) });

    if (!allowed.includes(name)) {
      violations.push({ why: "UNKNOWN_BLOCK_NAME", name, line });
      return;
    }
    if (!closing) {
      if (open) {
        violations.push({ why: "NESTED_BLOCK", name, line, insideOf: open.name, openedAt: open.line });
        return;
      }
      if (seen.has(name)) {
        violations.push({ why: "DUPLICATE_BLOCK", name, line, firstAt: seen.get(name) });
        return;
      }
      seen.set(name, line);
      open = { name, line };
      return;
    }
    if (!open) {
      violations.push({ why: "CLOSING_WITHOUT_OPENING", name, line });
      return;
    }
    if (open.name !== name) {
      violations.push({ why: "MISMATCHED_BLOCK_NAMES", opened: open.name, closed: name, line, openedAt: open.line });
      open = null;
      return;
    }
    regions.push({ name, from: open.line, to: line });
    open = null;
  });

  if (open) violations.push({ why: "UNTERMINATED_BLOCK", name: open.name, line: open.line });
  for (const name of allowed) if (!seen.has(name)) violations.push({ why: "BLOCK_ABSENT", name });

  // The rendered order must match the renderer's own key order, so a reordered
  // report cannot pass while presenting the appendices in a different sequence.
  const rendered = regions.map((r) => r.name);
  const expectedOrder = allowed.filter((n) => rendered.includes(n));
  if (rendered.join(",") !== expectedOrder.join(",")) {
    violations.push({ why: "BLOCK_ORDER_DIFFERS", found: rendered, expected: expectedOrder });
  }
  return { violations, regions, allowed };
}

/**
 * Blank the VALIDATED generated regions, keeping the line count so a reported
 * line number still points at the real place. Throws when the parse failed,
 * because blanking on an invalid marker set is exactly the escape that existed.
 */
export function narrativeOnly(md, reg) {
  if (!reg) throw new TypeError("narrativeOnly requires the register, so block names can be validated");
  const { violations, regions } = parseMarkdownBlocks(reg, md);
  if (violations.length) {
    const e = new Error(`INVALID_BLOCK_MARKERS: ${JSON.stringify(violations.slice(0, 3))}`);
    e.violations = violations;
    throw e;
  }
  const blank = new Set();
  for (const r of regions) for (let n = r.from; n <= r.to; n += 1) blank.add(n);
  return md.split("\n").map((l, i) => (blank.has(i + 1) ? "" : l)).join("\n");
}


/**
 * S1-R3-005 — the historical marker is PINNED, not merely shaped.
 *
 * The marker used to be refused only on a five-phrase denylist, so a live claim
 * phrased any other way ("AUTH_SECRET is currently unverified. <marker>") or a
 * historical sentence followed by a live one on the same line passed. A line-level
 * exemption cannot tell history from a claim, so it is no longer open. The report
 * may carry exactly the pinned number of marked lines, and each must hash to a
 * pinned value (whitespace collapsed, ends trimmed, nothing else normalised — a
 * Unicode substitution changes the hash). A third marker, a missing one, an edited
 * one and a look-alike that is not the exact marker are all violations. The pin
 * lives HERE, so `check` enforces it; a selftest alone would not.
 *
 * To add a legitimate historical quotation, the quoted line is reviewed and its
 * hash is added to the pin in the same change — a deliberate, visible act.
 */
export const HISTORICAL_MARKER_PINS_VERSION = "s1-hm-1";
export const HISTORICAL_MARKER_PINS = Object.freeze({
  count: 2,
  lineSha256: Object.freeze([
    "4766649aad2bd9a66c89b8f767d71f4ae5d60c3a5e70b7afaf4862e55462331c",
    "4320dbfbe70b754db6abe4ad3e6ce5e223569d701c72930b1617e4e9b99a8959",
  ]),
});

/** Whitespace collapsed, ends trimmed; the exact code points are otherwise kept. */
export function normalizeMarkerLine(line) {
  return String(line).replace(/\s+/g, " ").trim();
}

const MARKER_LOOKALIKE_RX = /s1[\s_-]*historical[\s_-]*superseded/i;
const INVISIBLE_RX = /[­​-‏⁠﻿]/g;

export function historicalMarkerPinViolations(md, pins = HISTORICAL_MARKER_PINS) {
  const out = [];
  const pinned = new Set(pins.lineSha256);
  const used = new Map();
  let count = 0;
  String(md).split("\n").forEach((line, i) => {
    const exact = line.split(HISTORICAL_MARKER).length - 1;
    const folded = line.normalize("NFKC").replace(INVISIBLE_RX, "");
    if (exact === 0) {
      if (MARKER_LOOKALIKE_RX.test(folded)) out.push({ why: "MARKER_LOOKALIKE", line: i + 1, text: line.trim().slice(0, 90) });
      return;
    }
    count += exact;
    if (exact > 1) out.push({ why: "MULTIPLE_MARKERS_ON_ONE_LINE", line: i + 1 });
    const digest = createHash("sha256").update(normalizeMarkerLine(line), "utf8").digest("hex");
    if (!pinned.has(digest)) {
      out.push({ why: "MARKER_LINE_NOT_PINNED", line: i + 1, sha256: digest.slice(0, 12), text: line.trim().slice(0, 90) });
      return;
    }
    if (used.has(digest)) out.push({ why: "PINNED_MARKER_LINE_DUPLICATED", line: i + 1, firstAt: used.get(digest) });
    else used.set(digest, i + 1);
  });
  if (count !== pins.count) out.push({ why: "MARKER_COUNT_MISMATCH", expected: pins.count, actual: count });
  for (const h of pins.lineSha256) if (!used.has(h)) out.push({ why: "PINNED_MARKER_LINE_MISSING_OR_EDITED", sha256: h.slice(0, 12) });
  return out;
}

export function reportContradictions(reg, md, options = {}) {
  const out = [];
  out.push(...historicalMarkerPinViolations(md, options.pins ?? HISTORICAL_MARKER_PINS));
  const settled = new Set();
  for (const r of reg.risks) for (const v of r.runtimeEvidence?.variables ?? []) settled.add(v);
  const UNSURE = HISTORICAL_UNSURE;
  let lines;
  try {
    lines = narrativeOnly(md, reg).split("\n");
  } catch (e) {
    // An invalid marker set is reported here as well as by the block gate, so a
    // broken report can never silently reduce the scanned surface.
    return [...out, { why: "BLOCK_MARKERS_INVALID", detail: (e.violations ?? []).slice(0, 3) }];
  }
  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i];
    if (!line.trim()) continue;
    const marked = line.includes(HISTORICAL_MARKER);
    if (marked) {
      // The marker must be earning its place, and must not excuse a live claim.
      if (!hasExemptableHistoricalPhrase(line, settled)) {
        out.push({ why: "UNUSED_HISTORICAL_MARKER", line: i + 1, text: line.trim().slice(0, 110) });
      } else if (CURRENT_OBLIGATION.some((rx) => rx.test(line))) {
        out.push({ why: "HISTORICAL_MARKER_ON_CURRENT_OBLIGATION", line: i + 1, text: line.trim().slice(0, 110) });
      }
      continue;
    }
    // a settled variable described as unknown
    for (const v of settled) {
      if (new RegExp(`${v}[^.]{0,100}?${UNSURE}|${UNSURE}[^.]{0,100}?${v}`, "i").test(line)) {
        out.push({ why: "REPORT_CALLS_SETTLED_VARIABLE_UNKNOWN", line: i + 1, variable: v, text: line.trim().slice(0, 110) });
      }
    }
    // the clamped risks' precondition described as unknown
    if (new RegExp(`\\bprecondition\\b[^.]{0,80}?${UNSURE}|${UNSURE}[^.]{0,80}?\\bprecondition\\b`, "i").test(line)) {
      out.push({ why: "REPORT_CALLS_SETTLED_PRECONDITION_UNKNOWN", line: i + 1, text: line.trim().slice(0, 110) });
    }
    // an instruction to re-run a recorded check
    if (/\b(?:re-?run|re-?check|re-?execute|run|perform)\b[^.]{0,60}?\b(?:presence check|docker inspect)\b/i.test(line)) {
      out.push({ why: "REPORT_ASKS_TO_REPEAT_RECORDED_EVIDENCE", line: i + 1, text: line.trim().slice(0, 110) });
    }
  }
  return out;
}


export function guardEvidenceViolations(reg) {
  const out = [];
  for (const r of reg.risks) {
    const guarded = r.productionState === "LATENT_CONFIG_GUARDED";
    const has = Array.isArray(r.guardEvidence) && r.guardEvidence.length > 0;
    if (guarded && !has) out.push({ riskId: r.riskId, why: "LATENT_WITHOUT_GUARD_EVIDENCE" });
    if (!guarded && has) out.push({ riskId: r.riskId, why: "GUARD_EVIDENCE_ON_UNGUARDED_STATE" });
  }
  return out;
}

export const NEXT_ACTION_MARKER = "<!-- S1-NEXT-SAFE-ACTION -->";

/**
 * The report's next-action block must not ask for evidence the register already
 * holds. A programme that keeps re-collecting settled facts is not converging.
 */
export function nextSafeActionViolations(reg, md) {
  const at = md.indexOf(NEXT_ACTION_MARKER);
  if (at === -1) return [{ why: "NO_NEXT_SAFE_ACTION_BLOCK" }];
  const end = md.indexOf("\n---", at);
  const block = md.slice(at, end === -1 ? md.length : end);
  const out = [];
  const settled = new Set();
  for (const r of reg.risks) for (const v of r.runtimeEvidence?.variables ?? []) settled.add(v);
  for (const v of settled) {
    if (new RegExp(`\\b${v}\\b`).test(block)) {
      out.push({ why: "ASKS_FOR_SETTLED_EVIDENCE", variable: v });
    }
  }
  for (const rx of REPEAT_REQUEST) {
    if (rx.test(block)) out.push({ why: "ASKS_TO_REPEAT_A_CHECK", pattern: String(rx) });
  }
  return out;
}

export function orderingViolations(reg) {
  const out = [];
  const riskIds = reg.risks.map((r) => r.riskId);
  const sortedRisks = [...riskIds].sort();
  if (riskIds.join("\u0000") !== sortedRisks.join("\u0000")) out.push({ what: "risks", why: "NOT_SORTED_BY_ID" });
  const findingIds = reg.findings.map((f) => f.findingId);
  const sortedFindings = [...findingIds].sort();
  if (findingIds.join("\u0000") !== sortedFindings.join("\u0000")) {
    out.push({ what: "findings", why: "NOT_SORTED_BY_ID" });
  }
  for (const r of reg.risks) {
    for (const [field, arr] of [
      ["stride", r.stride],
      ["threatActors", r.threatActors],
      ["affectedAssets", r.affectedAssets],
      ["sourceFindingIds", r.sourceFindingIds],
      ["dependencies", r.dependencies ?? []],
      ["relatedRiskIds", r.relatedRiskIds ?? []],
    ]) {
      const s = [...arr].sort();
      if (arr.join("\u0000") !== s.join("\u0000")) out.push({ what: `${r.riskId}.${field}`, why: "NOT_SORTED" });
    }
  }
  return out;
}

// ─────────────────── S1-RV remediation: closure and visibility gates ─────────
//
// Added after the first independent review. Each one exists because a reviewer
// demonstrated the previous build could not detect a specific defect class.

/**
 * S1-RV-003 — THE SOURCE FINDING UNIVERSE, CLOSED.
 *
 * The reviewer deleted a finding, regenerated the report, and every gate stayed
 * green: nothing tied the register's finding list to the documents it came from.
 * These two constants and the two functions below close that. The document list
 * is fixed and explicit; the identifier families are declared; and the extraction
 * is performed by this tool rather than taken on trust.
 */
export const SOURCE_DOCUMENTS = Object.freeze([
  "docs/security/SECURITY-SOURCE-LOCK.md",
  "docs/security/ARCHITECTURE-INVENTORY.md",
  "docs/security/DATA-FLOW-AND-TRUST-BOUNDARIES.md",
  "docs/security/PUBLIC-ROUTE-INVENTORY.md",
  "docs/security/AUTH-TOKEN-LIFECYCLE.md",
  "docs/security/EDGE-ORIGIN-AND-CLIENT-IP.md",
  "docs/security/PRIVILEGED-ROUTE-CLASSIFICATION.md",
  "docs/security/GETPRISMA-FAILURE-CLASSIFICATION.md",
]);

export const PHASE99_REGISTER = "docs/security/phase99-findings.json";

/**
 * The bare-identifier families the S0 documents use. `DB-F1`/`DB-F2` are included
 * by the `F?` branch. Withdrawn and retired identifiers (EDGE-02, EDGE-06) are
 * matched like any other, so a withdrawal cannot be used to drop one quietly.
 */
export const SOURCE_ID_PATTERN = /\b((?:EDGE|IP|RL|PRIV|DB|TOOL|H|L|U)-(?:F?\d{1,2}))\b/g;
/** The four policy ambiguities appear only in bold in the privileged-route document. */
export const POLICY_ID_PATTERN = /\*\*(A-[1-4])\*\*/g;

/** Families this tool extracts from source; everything else must be LOCK-*. */
export const SOURCE_FAMILIES = Object.freeze([
  "A", "DB", "EDGE", "H", "IP", "L", "P99-DEP", "P99-INT", "PRIV", "RL", "TOOL", "U",
]);

/**
 * The LOCK-* set is this phase's own bookkeeping for S0 facts recorded without an
 * identifier, so no document can pin it. It is pinned by count and by a hash of
 * its sorted members instead: adding or removing one without updating these two
 * values deliberately fails the gate.
 */
export const LOCK_UNIVERSE_COUNT = 51;
export const LOCK_UNIVERSE_SHA256 = "db4bf4c9f3f662ee61dced5bfa63f78a55f17ad601cc4dc510ccfd278e224b9f";

/** Extract every source identifier from the fixed document list plus Phase 99. */
export function extractSourceUniverse(root = REPO_ROOT) {
  const ids = new Map(); // id -> Set(document)
  const add = (id, doc) => {
    if (!ids.has(id)) ids.set(id, new Set());
    ids.get(id).add(doc);
  };
  for (const rel of SOURCE_DOCUMENTS) {
    const abs = join(root, ...rel.split("/"));
    if (!existsSync(abs)) return { error: `MISSING_SOURCE_DOCUMENT:${rel}`, ids };
    const text = readFileSync(abs, "utf8");
    for (const m of text.matchAll(SOURCE_ID_PATTERN)) add(m[1], rel);
    if (rel.endsWith("PRIVILEGED-ROUTE-CLASSIFICATION.md")) {
      for (const m of text.matchAll(POLICY_ID_PATTERN)) add(m[1], rel);
    }
  }
  const p99abs = join(root, ...PHASE99_REGISTER.split("/"));
  if (!existsSync(p99abs)) return { error: `MISSING_SOURCE_DOCUMENT:${PHASE99_REGISTER}`, ids };
  let p99;
  try {
    p99 = JSON.parse(readFileSync(p99abs, "utf8"));
  } catch {
    // S1-FA-03: a fixed, logical reason — never the parser's quotation of the file
    return { error: `UNPARSEABLE_SOURCE_DOCUMENT:${PHASE99_REGISTER}`, ids };
  }
  for (const f of p99.findings ?? []) {
    add(f.findingId, PHASE99_REGISTER);
  }
  return { error: null, ids };
}

export function sha256Hex(s) {
  return createHash("sha256").update(s, "utf8").digest("hex");
}

/** The sorted LOCK identifiers, newline-joined — the string the hash pins. */
export function lockUniverseString(reg) {
  return reg.findings
    .filter((f) => f.family === "LOCK")
    .map((f) => f.findingId)
    .sort()
    .join("\n");
}

/**
 * Both halves of the closure: every identifier the documents carry must be in the
 * register, nothing extra may claim to be a source finding, and the LOCK set must
 * match its pinned count and hash.
 */
export function findingUniverseViolations(reg, root = REPO_ROOT) {
  const out = [];
  const { error, ids } = extractSourceUniverse(root);
  if (error) {
    out.push({ why: error });
    return out;
  }
  const extracted = new Set(ids.keys());
  const registered = new Set(reg.findings.map((f) => f.findingId));
  const sourceFamily = new Set(
    reg.findings.filter((f) => SOURCE_FAMILIES.includes(f.family)).map((f) => f.findingId),
  );

  for (const id of [...extracted].sort()) {
    if (!registered.has(id)) out.push({ why: "MISSING_FROM_REGISTER", findingId: id, documents: [...ids.get(id)].sort() });
  }
  for (const id of [...sourceFamily].sort()) {
    if (!extracted.has(id)) out.push({ why: "NOT_IN_ANY_SOURCE_DOCUMENT", findingId: id });
  }
  for (const f of reg.findings) {
    if (!SOURCE_FAMILIES.includes(f.family) && f.family !== "LOCK") {
      out.push({ why: "UNKNOWN_FAMILY", findingId: f.findingId, family: f.family });
    }
  }
  const lockIds = reg.findings.filter((f) => f.family === "LOCK").map((f) => f.findingId);
  if (lockIds.length !== LOCK_UNIVERSE_COUNT) {
    out.push({ why: "LOCK_COUNT_CHANGED", expected: LOCK_UNIVERSE_COUNT, actual: lockIds.length });
  }
  const lockHash = sha256Hex(lockUniverseString(reg));
  if (lockHash !== LOCK_UNIVERSE_SHA256) {
    out.push({ why: "LOCK_HASH_CHANGED", expected: LOCK_UNIVERSE_SHA256, actual: lockHash });
  }
  return out;
}

/**
 * S1-RV-004 — SECRET SHAPES.
 *
 * The reviewer planted an access-key shape in the register and `check` stayed
 * green: the only secret scan was a selftest over the current file, not a gate.
 * These patterns are deliberately shape-based and are applied to the register AND
 * the report. Harmless placeholders are allowed by requiring a realistic length
 * or a real separator, so `AWS_ACCESS_KEY_ID=<your-key>` does not trip them.
 */
export const SECRET_SHAPES = Object.freeze([
  { name: "PEM_PRIVATE_KEY", rx: /-----BEGIN (?:RSA |EC |OPENSSH |PGP |DSA |ENCRYPTED )?PRIVATE KEY-----/ },
  { name: "AWS_ACCESS_KEY_ID", rx: /\b(?:AKIA|ASIA|ABIA|ACCA)[A-Z0-9]{16}\b/ },
  { name: "GITHUB_TOKEN", rx: /\bgh[pousr]_[A-Za-z0-9]{36,}\b/ },
  { name: "GITHUB_PAT_FINE_GRAINED", rx: /\bgithub_pat_[A-Za-z0-9_]{40,}\b/ },
  { name: "SLACK_TOKEN", rx: /\bxox[baprs]-[A-Za-z0-9-]{20,}\b/ },
  { name: "JWT_THREE_PART", rx: /\beyJ[A-Za-z0-9_-]{16,}\.[A-Za-z0-9_-]{16,}\.[A-Za-z0-9_-]{16,}\b/ },
  {
    // S1-R4 FR-07: the user name may be EMPTY (`redis://:pw@host`, the form Redis uses
    // for a password-only server) and the password may be short. The one exemption is
    // a password that is, as a whole, a documented placeholder or a complete
    // `${NAME}` reference — the same rule as an assigned secret, named, and tested.
    name: "CONNECTION_STRING_WITH_CREDENTIAL",
    rx: /\b(?:postgres(?:ql)?|mysql|mongodb(?:\+srv)?|rediss?|valkeys?|memcached|amqps?|ldaps?|https?):\/\/[A-Za-z0-9._%-]*:([^\s@"'<>/]+)@/i,
    exempt: (m) => isPlaceholderValue(m[1]),
  },
  // The assigned-secret class is handled by assignedSecretHits, which accepts an
  // unquoted value. It stays out of this table so one credential cannot be
  // reported twice by two overlapping patterns.
]);

/**
 * The detector patterns themselves, and the selftest fixtures that prove they
 * fire, must not be scanned — a scanner that reads its own rule table reports
 * itself. This is the same lesson the S0 call-site scanner learned when being
 * committed changed its own output.
 */
export const SECRET_SCAN_EXCLUDED_PATHS = Object.freeze([
  "scripts/security/s1/risk-register-check.mjs",
  "scripts/security/s1/__tests__/risk-register.selftest.mjs",
]);

/** Scan one text for secret shapes. Returns the matches, truncated. */
export function secretShapeHits(text, label) {
  const out = [];
  for (const { name, rx, exempt } of SECRET_SHAPES) {
    const g = new RegExp(rx.source, rx.flags.includes("g") ? rx.flags : `${rx.flags}g`);
    for (const m of text.matchAll(g)) {
      if (exempt && exempt(m)) continue;
      out.push({ where: label, kind: name, sample: `${m[0].slice(0, 12)}…` });
    }
  }
  return out;
}

/**
 * S1-R3-001 — a key is sensitive because of its WHOLE NAME, not because a keyword
 * happens to sit behind a word boundary.
 *
 * The second-round detector put `\b` in front of a list of key names. An
 * underscore is a word character, so `JWT_ACCESS_SECRET`, `POSTGRES_PASSWORD`,
 * `ANTHROPIC_API_KEY` and `INTERNAL_SERVICE_TOKEN` — nine of the thirteen real
 * secret names in this repository's example environment files — never matched.
 * The key is now extracted in full, normalised (camelCase and hyphens become
 * snake case) and judged by its FINAL segment: anything ending in one of these
 * families holds a credential, whatever prefix it carries. A key that merely
 * contains the word (`max_tokens`, `password_policy`, `tokenizer`) is not one.
 */
export const SENSITIVE_KEY_FAMILIES = Object.freeze([
  "secret", "password", "passwd", "pass", "pwd", "passphrase", "token", "api_key", "apikey", "access_key",
  "private_key", "signing_key", "client_secret", "secret_key",
]);
const SENSITIVE_KEY_SUFFIX_RX = new RegExp(`(?:^|_)(?:${SENSITIVE_KEY_FAMILIES.join("|")})$`);

/**
 * S1-R5 F-04 — fail CLOSED on an unknown qualifier.
 *
 * The R4 rule stripped a fixed list of trailing qualifiers and then judged the last
 * segment, so any qualifier missing from that list (`_LIVE`, `_LEGACY`, `_FALLBACK`,
 * `_ENC`, `_EU`, `_BLUE`, `_CANARY` …) turned a credential name harmless. A name is
 * now sensitive when a family occurs ANYWHERE in it as whole segments, and the only
 * way out is an explicit, closed list of FINAL segments that change what the value
 * is: a path to the credential, an identifier, a hash, a lifetime, a count, a policy,
 * a state. `SMTP_PASS` (R4) and `AUTH_SECRET_V2` stay sensitive by the same rule.
 */
export const KEY_METADATA_SUFFIXES = Object.freeze([
  "file", "path", "dir", "id", "hash", "ttl", "count", "length", "expiry", "policy", "url", "name", "state", "status",
]);

/** `apiKey` -> `api_key`, `JWT-ACCESS-SECRET` -> `jwt_access_secret`, `db.password.prod` -> `db_password_prod`. */
export function normalizeKeyName(name) {
  return String(name)
    .replace(/([a-z0-9])([A-Z])/g, "$1_$2")
    .replace(/[-.]/g, "_")
    .toLowerCase();
}

/**
 * S1-FA-01 — the segments a name is judged by. Trailing digits are a version, an
 * index or a year (`AUTH_SECRET2`, `apiKey2`, `SMTP_PASS2026`), never part of what the
 * segment IS, so they are split off before the family is compared: a number cannot
 * turn a credential name harmless. Only TRAILING digits go, and only after the name
 * is cut into whole segments, so `TOKENIZER2` is still the word `tokenizer`, not
 * `token` plus noise.
 */
export function sensitiveKeySegments(name) {
  return normalizeKeyName(name).split("_").map((s) => s.replace(/\d+$/, "")).filter(Boolean);
}

/**
 * S1-FA I2 — a name written without separators (`JWTSECRET`, `DBPASSWORD`) is one
 * segment. It is sensitive when that segment ENDS in a family that no ordinary word
 * ends in. `pass` and `pwd` are deliberately absent: `compass`, `bypass` and
 * `overpass` end in `pass`. `passport`, `tokenizer` and `secretary` do not end in a
 * family at all, so they stay ordinary words.
 */
export const COMPACT_SENSITIVE_FAMILIES = Object.freeze([
  "secret", "password", "passwd", "passphrase", "token", "apikey", "accesskey", "privatekey", "signingkey", "secretkey", "clientsecret",
]);
const COMPACT_SENSITIVE_RX = new RegExp(`^[a-z0-9]{2,}(?:${COMPACT_SENSITIVE_FAMILIES.join("|")})$`);

export function isSensitiveKeyName(name) {
  // leading separators are not part of the name: `_AUTH_SECRET`, `__SMTP_PASS`
  const segs = sensitiveKeySegments(name);
  if (segs.length === 0) return false;
  if (segs.length > 1 && KEY_METADATA_SUFFIXES.includes(segs[segs.length - 1])) return false;
  for (let end = segs.length; end >= 1; end -= 1) {
    if (SENSITIVE_KEY_SUFFIX_RX.test(segs.slice(0, end).join("_"))) return true;
  }
  return segs.some((s) => COMPACT_SENSITIVE_RX.test(s));
}

/**
 * S1-R3-003 — THE ONLY VALUES THAT MAY FOLLOW A SENSITIVE KEY.
 *
 * Under a sensitive key every non-empty value is a credential unless it is, as a
 * WHOLE, one of these. Shape is never a reason to look away: a 64-character hex
 * string is exactly what `openssl rand -hex 32` produces, an upper-case token is
 * what a base32 secret looks like, and a value starting `${` is not an
 * environment reference unless the reference is complete. The comparison is
 * case-insensitive and exact, so `REDACTEDX` and `SET_REAL_VALUE` are values.
 */
export const PLACEHOLDER_VALUES = Object.freeze([
  "set", "unset", "missing", "redacted", "placeholder", "example",
]);
const ANGLE_PLACEHOLDER_RX = /^<(?:redacted|secret)>$/i;
const ENV_REFERENCE_RX = /^\$\{[A-Za-z_][A-Za-z0-9_]*\}$/;

/**
 * `changeme` is reported by the register as a weak default that EXISTS in the
 * compose files. Treating it as a secret VALUE would make the register unable to
 * describe its own finding, so it is allowed as a VALUE — the one documented
 * exception, asserted by a test, and not widened to any other weak default.
 */
export const ALLOWED_WEAK_DEFAULT = "changeme";

/** Markup that can wrap a value in prose or a table without being part of it. */
function stripValueDecoration(raw) {
  return String(raw)
    .trim()
    .replace(/^[*`_("'\[]+/, "")
    .replace(/[*`|)\]"'.,;:!?]+$/, "")
    .trim();
}

/** Is this value an evidence state or a documented placeholder, taken as a whole? */
export function isPlaceholderValue(raw) {
  const v = stripValueDecoration(raw);
  if (v === "") return true;
  if (ANGLE_PLACEHOLDER_RX.test(v)) return true;
  if (ENV_REFERENCE_RX.test(v)) return true;
  const lower = v.toLowerCase();
  return PLACEHOLDER_VALUES.includes(lower) || lower === ALLOWED_WEAK_DEFAULT;
}

/**
 * A key, its separator, and any markup around the key: `**AUTH_SECRET**=`, `"password":`,
 * `jwt.secret.legacy:`. A dot joins two segments of one dotted name; it cannot end the key.
 */
const ASSIGNMENT_RX = /(?<![A-Za-z0-9_])[*`]*(["']?)(_*[A-Za-z][A-Za-z0-9_-]*(?:\.[A-Za-z0-9_-]+)*)\1[*`]*[ \t]*[:=][ \t]*/g;

/**
 * Read the value that follows a separator. A quoted value runs to the MATCHING
 * quote, so an apostrophe inside double quotes is part of it; a bare value runs to
 * the next whitespace, so `; | , * )` and a backtick can never truncate it into a
 * harmless-looking prefix. A quote that never closes is reported as such.
 */
function readAssignedValue(line, from) {
  const c = line[from];
  if (c === '"' || c === "'") {
    let j = from + 1;
    while (j < line.length) {
      if (line[j] === "\\") { j += 2; continue; }
      if (line[j] === c) break;
      j += 1;
    }
    if (j < line.length) {
      // S1-R4 FR-02: `AUTH_SECRET="SET"realvalue` must not pass as the placeholder SET.
      // Whatever touches the closing quote up to the next whitespace is part of the
      // value unless it is only closing punctuation (a comma, a bracket, a full stop, a
      // table bar, a code-span backtick, a JSON quote): concatenation is a value.
      const tail = /^\S*/.exec(line.slice(j + 1))[0];
      if (tail && !/^[,;:.)\]}|*`'"!?]+$/.test(tail)) {
        return { value: line.slice(from + 1, j) + tail, form: "QUOTED_WITH_TRAILING_CONTENT", end: j + 1 + tail.length };
      }
      return { value: line.slice(from + 1, j), form: "QUOTED", end: j + 1 };
    }
    return { value: line.slice(from + 1), form: "UNCLOSED_QUOTE", end: line.length };
  }
  let j = from;
  while (j < line.length && !/\s/.test(line[j])) j += 1;
  return { value: line.slice(from, j), form: "UNQUOTED", end: j };
}

/** A stable identity for one credential: the key and a digest of the value, never the value. */
function secretHitId(key, value) {
  // The raw file ends a string value with `",` while the decoded string does not, so the
  // identity is taken from the value without that trailing markup: one secret, one id.
  return createHash("sha256").update(`${normalizeKeyName(key)}\u0000${stripValueDecoration(value)}`).digest("hex").slice(0, 16);
}

/**
 * One scan for an assigned secret in free text, quoted or not. Nothing is stripped
 * from the line first: markup that used to be removed (`*`, `|`, a backtick) can be
 * part of a real value, and removing it truncated the value into a safe-looking
 * prefix. Markup is tolerated around the KEY and around a placeholder instead.
 */
export function assignedSecretHits(text, options = {}) {
  const out = [];
  String(text).split("\n").forEach((line, i) => {
    for (const m of line.matchAll(ASSIGNMENT_RX)) {
      const key = m[2];
      if (!isSensitiveKeyName(key)) continue;
      const { value, form } = readAssignedValue(line, m.index + m[0].length);
      // Reading the RAW register file: a string that ends `KEY=` is followed by the JSON
      // closing quote, which is structure and not the opening of a value. Only that
      // shape (nothing but `,` `]` `}` after the quote) is excused, and only for the raw
      // level — the decoded string is scanned strictly, so `KEY="` inside a string still fails.
      if (form === "UNCLOSED_QUOTE" && options.jsonStructure && /^[\s,\]}]*$/.test(value)) continue;
      // an open quote, or text glued to a closing quote, is never a placeholder
      if (form === "UNCLOSED_QUOTE" || form === "QUOTED_WITH_TRAILING_CONTENT") {
        out.push({ kind: "ASSIGNED_SECRET_VALUE", form, line: i + 1, key, id: secretHitId(key, value), sample: `${key}=…` });
        continue;
      }
      if (isPlaceholderValue(value)) continue;
      out.push({ kind: "ASSIGNED_SECRET_VALUE", form, line: i + 1, key, id: secretHitId(key, value), sample: `${key}=…` });
    }
  });
  return out;
}

/**
 * S1-R3-002 — the register is JSON, and JSON escapes its quotes.
 *
 * A string such as `password="hunter2"` is stored as `password=\"hunter2\"`, which
 * the line scanner did not read as a quoted assignment, so the quoted form was
 * invisible in the very file that holds the data. The register is therefore
 * scanned on three levels and the results are de-duplicated by a stable id:
 *   1. every string LEAF, decoded, through the same assignment detector;
 *   2. every PROPERTY whose own name is sensitive and whose value is a string;
 *   3. the raw rendered text, with JSON escapes undone.
 * A register that does not parse is a violation, never a silent pass.
 */
function unescapeJsonText(raw) {
  return String(raw).replace(/\\(["\\/nrt])/g, (_m, c) => ({ n: "\n", r: "\r", t: "\t" })[c] ?? c);
}

/**
 * S1-FA-02 — THE STRUCTURE BUDGET, AND NOTHING BELOW IT IS SKIPPED.
 *
 * The walkers used to recurse and to return without a word at depth 64, so a secret
 * or a command nested 65 levels down was never looked at and `check` exited 0. They
 * are now iterative (an explicit stack, so depth cannot exhaust the call stack), they
 * visit every node, and the only limit is this budget. Crossing it is never a silent
 * stop: the walk ends and RETURNS a `STRUCTURE_LIMIT_EXCEEDED` violation, which every
 * caller turns into a finding, and `runGates` refuses such a register before any
 * recursive code reads it (exit 27). The budget is far above anything the register
 * contains and exists only so a hostile file cannot make the gate run forever.
 */
export const STRUCTURE_LIMITS = Object.freeze({ maxDepth: 256, maxNodes: 250000 });

function structureLimitViolation(limit, max, path) {
  return { why: "STRUCTURE_LIMIT_EXCEEDED", limit, max, path };
}

/**
 * Deterministic, cycle-safe walk in document order. `visit(path, key, value)` is called
 * for every string leaf (key `null`) and, before its subtree, for every string value of
 * a property whose own name is sensitive (key = the name). Returns `null` when every
 * node was visited, or the structure-limit violation that stopped it.
 */
export function walkJsonStrings(root, visit, limits = STRUCTURE_LIMITS) {
  const stack = [{ node: root, path: "$", depth: 0 }];
  const seen = new WeakSet();
  let nodes = 0;
  while (stack.length > 0) {
    const task = stack.pop();
    if (task.sensitive) {
      task.sensitive.forEach(([p, k, s]) => visit(p, k, s));
      continue;
    }
    const { node, path, depth } = task;
    nodes += 1;
    if (nodes > limits.maxNodes) return structureLimitViolation("nodes", limits.maxNodes, path);
    if (depth > limits.maxDepth) return structureLimitViolation("depth", limits.maxDepth, path);
    if (typeof node === "string") {
      visit(path, null, node);
      continue;
    }
    if (node === null || typeof node !== "object" || seen.has(node)) continue;
    seen.add(node);
    const children = [];
    if (Array.isArray(node)) {
      node.forEach((v, i) => children.push({ node: v, path: `${path}[${i}]`, depth: depth + 1 }));
    } else {
      for (const [k, v] of Object.entries(node)) {
        const childPath = `${path}.${k}`;
        if (isSensitiveKeyName(k)) {
          const values = typeof v === "string" ? [v] : Array.isArray(v) ? v.filter((x) => typeof x === "string") : [];
          children.push({ sensitive: values.map((s, idx) => [Array.isArray(v) ? `${childPath}[${idx}]` : childPath, k, s]) });
        }
        children.push({ node: v, path: childPath, depth: depth + 1 });
      }
    }
    for (let i = children.length - 1; i >= 0; i -= 1) stack.push(children[i]);
  }
  return null;
}

/**
 * S1-R5 F-03 — every property NAME is scanned DECODED, at every depth.
 *
 * Names were only ever seen in the raw file, where `"note\nAKIA…"` is the text
 * `note\\nAKIA…`: the escape glues a letter to the token and hides it from a
 * word-boundary rule. After `JSON.parse` a name is a string like any other, and it is
 * visited here with its exact structured path (`$.risks[3].notes["note\nAKIA…"]`).
 * Iterative and budgeted like `walkJsonStrings` (S1-FA-02): returns `null` when every
 * name was visited, or the violation that stopped it.
 */
export function walkJsonKeys(root, visit, limits = STRUCTURE_LIMITS) {
  const stack = [{ node: root, path: "$", depth: 0 }];
  const seen = new WeakSet();
  let nodes = 0;
  while (stack.length > 0) {
    const { node, path, depth, key } = stack.pop();
    nodes += 1;
    if (nodes > limits.maxNodes) return structureLimitViolation("nodes", limits.maxNodes, path);
    if (depth > limits.maxDepth) return structureLimitViolation("depth", limits.maxDepth, path);
    if (key !== undefined) visit(path, key);
    if (node === null || typeof node !== "object" || seen.has(node)) continue;
    seen.add(node);
    const children = [];
    if (Array.isArray(node)) {
      for (let i = 0; i < node.length; i += 1) children.push({ node: node[i], path: `${path}[${i}]`, depth: depth + 1 });
    } else {
      for (const [k, v] of Object.entries(node)) children.push({ node: v, path: `${path}[${JSON.stringify(k)}]`, depth: depth + 1, key: k });
    }
    for (let i = children.length - 1; i >= 0; i -= 1) stack.push(children[i]);
  }
  return null;
}

/** The register's shape against the budget, read iteratively; empty when it fits. */
export function registerStructureViolations(reg, limits = STRUCTURE_LIMITS) {
  const v = walkJsonKeys(reg, () => {}, limits);
  return v ? [v] : [];
}

/** A structure-limit violation as a scanner finding: the scan stopped, so the deliverable fails. */
function structureLimitHit(violation, label) {
  return { where: label, kind: "STRUCTURE_LIMIT_EXCEEDED", level: "STRUCTURE", path: violation.path, sample: `${violation.limit} > ${violation.max}` };
}

export function registerSecretHits(registerText, label = "docs/security/s1-risk-register.json") {
  const hits = [];
  let parsed = null;
  try {
    parsed = JSON.parse(registerText);
  } catch {
    return [
      { where: label, kind: "REGISTER_JSON_UNPARSEABLE", sample: "the register does not parse, so it cannot be scanned" },
      ...secretShapeHits(registerText, label),
      ...assignedSecretHits(unescapeJsonText(registerText), { jsonStructure: true }).map((h) => ({ ...h, where: label, level: "RAW" })),
    ];
  }
  // the most precise witness comes first, so de-duplication keeps it: a decoded
  // property NAME, then a sensitive property, then a decoded value, then the raw text
  const keyLimit = walkJsonKeys(parsed, (path, key) => {
    for (const h of secretShapeHits(key, label)) hits.push({ ...h, level: "STRUCTURED_KEY", path });
    for (const h of assignedSecretHits(key)) hits.push({ ...h, where: label, level: "STRUCTURED_KEY", path });
  });
  const valueLimit = walkJsonStrings(parsed, (path, key, value) => {
    if (key !== null) {
      // a property whose own name is sensitive: the value is the credential
      if (!isPlaceholderValue(value)) {
        hits.push({ where: label, kind: "ASSIGNED_SECRET_VALUE", form: "JSON_PROPERTY", level: "STRUCTURED", path, key, id: secretHitId(key, value), sample: `${key}=…` });
      }
      return;
    }
    for (const h of assignedSecretHits(value)) hits.push({ ...h, where: label, level: "DECODED", path });
    for (const h of secretShapeHits(value, label)) hits.push({ ...h, level: "DECODED", path });
  });
  // S1-FA-02: a walk the budget stopped is a finding, never a quiet partial pass
  for (const v of [keyLimit, valueLimit]) if (v) hits.push(structureLimitHit(v, label));
  for (const h of assignedSecretHits(unescapeJsonText(registerText), { jsonStructure: true })) hits.push({ ...h, where: label, level: "RAW" });
  for (const h of secretShapeHits(registerText, label)) hits.push({ ...h, level: "RAW" });
  // one credential, one finding: the structured and decoded levels carry a path, so they win
  const seen = new Set();
  return hits.filter((h) => {
    const k = `${h.kind}|${h.id ?? h.sample}`;
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });
}

/**
 * S1-R2-005 / S1-R3-007 — the forbidden-content rules over BOTH deliverables.
 *
 * Both texts are scanned by this one table. The register additionally keeps its
 * older, stricter rule set (exit 11). A clock time of the form `0.0.0.0:80` is a
 * port and the attack-surface map needs it, so a bare `HH:MM` cannot be banned in
 * the report — but `HH:MM:SS` can, and is, because nothing legitimate carries one.
 */
export const REPORT_FORBIDDEN = Object.freeze([
  { name: "WINDOWS_ABSOLUTE_PATH", rx: /(?:^|[\s"'(`])[A-Za-z]:[\\/]/ },
  { name: "UNIX_USER_ABSOLUTE_PATH", rx: /\/(?:home|Users|root)\/[A-Za-z0-9._-]/ },
  // S1-FA-05: the path is recognised by WHAT IT IS, not by what wraps it. An earlier rule
  // listed the wrappers it accepted (bold, a table bar, a bracket …), so `{/etc/passwd}`,
  // `«/etc/passwd»` or `cat</etc/passwd` went through. Now the canonical system root is
  // found anywhere, and the only thing that disqualifies it is a character that makes it
  // the tail of something else — a letter, a digit or a path character before the slash
  // (`src/usr/x`, `https://example.org/usr/share`) — and the root must end its segment
  // and lead into the next one (`/etc/passwd`, not `/etcetera` or "the /usr directory").
  // A `file://` URI names the same paths and is covered.
  {
    name: "UNIX_SYSTEM_ABSOLUTE_PATH",
    rx: /(?<![\p{L}\p{N}.~\/-])\/(?:etc|usr|proc|opt|srv|var\/(?:log|lib))\/[\p{L}\p{N}._~-]|file:\/\/(?:localhost)?\/(?:etc|usr|proc|opt|srv|var\/(?:log|lib))\/[\p{L}\p{N}._~-]/u,
  },
  { name: "UNC_PATH", rx: /\\\\[A-Za-z0-9._-]+\\/ },
  { name: "USER_PROFILE_DIRECTORY", rx: /AppData|\/tmp\/[A-Za-z0-9._-]/ },
  { name: "ISO_DATETIME", rx: /\d{4}-\d{2}-\d{2}T\d{2}/ },
  { name: "CLOCK_TIME_HMS", rx: /(?<![\d.:])\d{1,2}:\d{2}:\d{2}(?![\d:])/ },
  // An operational invocation, not a descriptive mention. The register legitimately
  // says "Docker DNATs both ports publicly" as a statement about the platform, so
  // the tool name is matched CASE-SENSITIVELY in its lowercase command form and
  // must be followed by a real subcommand, a flag, a URL or a user@host. "docker
  // inspect --format" fails; "Docker DNATs" passes; so does "the docker socket is
  // not mounted". The lines are scanned as written, so a fenced block, an inline
  // code span and a table cell hide nothing.
  {
    name: "CONTAINER_OR_HOST_COMMAND",
    rx: /\b(?:docker(?:-compose)?|kubectl|systemctl|journalctl|psql|redis-cli|mysql|iptables|ufw)\s+(?:-{1,2}[A-Za-z]|inspect|exec|logs|compose|ps|run|build|pull|push|stats|restart|kill|rm|get|describe|apply|delete|status|start|stop|enable|disable|up|down|allow|deny|reload|show|version|info)\b/,
  },
  {
    name: "NETWORK_OR_PRIVILEGE_COMMAND",
    rx: /\b(?:curl|wget|nc|netcat|ssh|scp)\s+(?:-{1,2}[A-Za-z]|https?:\/\/|[A-Za-z0-9._-]+@)|\bsudo\s+[a-z-]+|\bopenssl\s+(?:s_client|x509|req|rand|genrsa|dgst|verify|pkcs12|enc)\b|\bnginx\s+-[A-Za-z]\b/,
  },
  // S1-R4 FR-05: scanners and probes. Each needs what makes it an invocation — a flag,
  // an address, a host name with a dot, a port — so that ordinary English ("dig into
  // the logs", "telnet is not exposed", "no nmap scan was run") stays allowed.
  {
    name: "SCANNER_OR_PROBE_COMMAND",
    rx: /\bnmap\s+(?:-{1,2}[A-Za-z]|\d{1,3}(?:\.\d{1,3}){1,3}|[A-Za-z0-9-]+\.[A-Za-z]{2,})|\bmasscan\s+(?:-{1,2}[A-Za-z]|\d)|\btelnet\s+(?:[A-Za-z0-9-]+\.[A-Za-z0-9.-]+|[A-Za-z0-9.-]+\s+\d{1,5}\b)|\bdig\s+(?:@\S+|[+-][A-Za-z]\S*|[A-Za-z0-9-]+\.[A-Za-z]{2,}\b|(?:A|AAAA|MX|NS|TXT|CNAME|SOA|PTR|SRV|CAA|ANY)\s+\S)|\btestssl\.sh\s+\S|\btestssl\s+(?:-{1,2}[A-Za-z]|https?:\/\/|[A-Za-z0-9-]+\.[A-Za-z]{2,})/,
  },
  // S1-FA I1: five more probes, each only in command position — a flag, a URL, an
  // address or a dotted host must follow — and `ss` only with an option cluster, so
  // "nikto was not run", "the hydra pattern" and "the ss family" stay prose.
  {
    name: "SCANNER_OR_PROBE_COMMAND_EXTENDED",
    rx: /\b(?:nikto(?:\.pl)?|sqlmap|sslscan|hydra|ncat)\s+(?:-{1,2}[A-Za-z]|https?:\/\/|\d{1,3}(?:\.\d{1,3}){3}|[A-Za-z0-9-]+\.[A-Za-z]{2,}\b)|(?<![\w.\/-])ss\s+-[A-Za-z]{1,8}\b/,
  },
  { name: "IMPERATIVE_PRODUCTION_COMMAND", rx: /\b(?:run|use|execute|issue|perform|re-?run|invoke)\b[^.]{0,40}\b(?:docker|kubectl|systemctl|psql|redis-cli|curl|wget|sudo|openssl)\b/i },
  // `scp archive.tar ops@host:/backup` puts the file before the host, so up to four
  // arguments may sit between the tool name and the user@host.
  { name: "REMOTE_SHELL", rx: /\b(?:ssh|scp)\s+(?:\S+\s+){0,4}?\S+@\S+/i },
]);

export function reportForbiddenHits(text, label) {
  const out = [];
  const lines = String(text).split("\n");
  for (const { name, rx } of REPORT_FORBIDDEN) {
    lines.forEach((l, i) => {
      if (rx.test(l)) out.push({ where: label, kind: name, line: i + 1, sample: l.trim().slice(0, 72) });
    });
  }
  return out;
}


export function secretShapeViolations(registerText, reportText) {
  return [
    ...registerSecretHits(registerText, "docs/security/s1-risk-register.json"),
    ...secretShapeHits(reportText, "docs/security/THREAT-MODEL-AND-RISK-REGISTER.md"),
    ...assignedSecretHits(reportText).map((h) => ({ ...h, where: "docs/security/THREAT-MODEL-AND-RISK-REGISTER.md" })),
  ];
}

/**
 * The register is scanned DECODED as well as raw. In the raw file a newline inside
 * a string is the two characters `\n`, which glue the next word to a letter and
 * hide it from a word-boundary rule: `"…\nsudo ufw status"` does not contain the
 * word `sudo` as far as the raw text is concerned. Every string leaf is therefore
 * scanned as the line(s) it really is. A register that does not parse is a
 * violation, never a silent pass.
 */
export function registerForbiddenHits(registerText, label = "docs/security/s1-risk-register.json") {
  const hits = [...reportForbiddenHits(registerText, label)];
  let parsed;
  try {
    parsed = JSON.parse(registerText);
  } catch {
    return [{ where: label, kind: "REGISTER_JSON_UNPARSEABLE", sample: "the register does not parse, so it cannot be scanned" }, ...hits];
  }
  const keyLimit = walkJsonKeys(parsed, (path, key) => {
    for (const h of reportForbiddenHits(key, label)) hits.unshift({ ...h, level: "STRUCTURED_KEY", path });
  });
  const valueLimit = walkJsonStrings(parsed, (path, key, value) => {
    if (key !== null) return;
    for (const h of reportForbiddenHits(value, label)) hits.push({ ...h, path });
  });
  // S1-FA-02: a walk the budget stopped is a finding, never a quiet partial pass
  for (const v of [keyLimit, valueLimit]) if (v) hits.push(structureLimitHit(v, label));
  const seen = new Set();
  return hits.filter((h) => {
    const k = `${h.kind}|${h.sample}`;
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });
}

/** S1-R2-005 — the forbidden-content rules applied to BOTH deliverables. */
export function deliverableForbiddenViolations(registerText, reportText) {
  return [
    ...registerForbiddenHits(registerText, "docs/security/s1-risk-register.json"),
    ...reportForbiddenHits(reportText, "docs/security/THREAT-MODEL-AND-RISK-REGISTER.md"),
  ];
}

/**
 * S1-RV-007 / S1-R2-004 / S1-R3-006 — EVERY SCORED RISK MUST LINK A CRITERION TO
 * ITS DECLARED METHOD, AND "LINK" MEANS AN OPERATIONAL PHRASE.
 *
 * A declared `verificationMethod` that no acceptance criterion mentions is a
 * promise with no address. The first fix hardened only the tool-gate method; every
 * other method still accepted a bare word ("observation", "is recorded",
 * "declares", "in a test"). Now every method is matched by phrases that carry an
 * actor, an action and an outcome that can be seen to pass or fail, and none is
 * satisfiable by naming the method:
 *   - a pattern needs the verb AND its object ("a test asserts …", "a rehearsal
 *     proves …", "verified on a response from the edge"), never the noun alone;
 *   - a match is discarded when the same sentence negates or hedges it just before
 *     the phrase ("Nothing blocks the build", "the gate never fails the build",
 *     "it would be good if a gate failed the build").
 * No pattern names a risk. The mapping is versioned so a future method name cannot
 * silently satisfy the gate by accident.
 */
export const VERIFICATION_LINKAGE_VERSION = "s1-vlink-3";
export const VERIFICATION_LINKAGE = Object.freeze({
  SOURCE_REVIEW: [
    /\bestablished by reading\b[^.]{3,}/i,
    /\b(?:is|are) examined and (?:its|their) results? (?:is |are )?recorded\b/i,
    /\bcomments?\b[^.]{0,80}\b(?:is|are) corrected\b/i,
    /\bnames the test that proves it\b/i,
    /\bthe proxy declares\b[^.]{3,}/i,
    /\ball (?:five|four|three|six|\d+) have been read\b/i,
  ],
  AUTOMATED_TEST: [
    /\b(?:a|the|each|every|one) (?:negative |regression )?tests?(?: per [\w-]+)? (?:that )?(?:asserts?|proves?|demonstrates?|shows?|verif(?:y|ies)) \S/i,
    /\bwith an? (?:negative |regression )?tests?\b(?: per [\w-]+| that (?:asserts?|proves?|a )| on (?:the )?[\w -]+| at the boundary)?/i,
    /\b(?:is|are) named in a test\b/i,
    /\bregression tests?\b[^.]{0,80}\brun in continuous integration\b/i,
    /\b(?:the )?(?:suite|tests?) runs? in continuous integration\b/i,
    /\ba test (?:exists|covers)\b[^.]{3,}/i,
  ],
  // The bare /\bgate\b/ accepted "mentions the word gate but demands nothing at
  // all". Every pattern needs an operational verb and an observable outcome.
  DETERMINISTIC_TOOL_GATE: [
    /\bruns? as a gate\b/i,
    /\bfails the build\b/i,
    /\bblocks the build\b/i,
    /\bthe gate (?:rejects|fails|refuses|reports)\b/i,
    /\ba gate (?:asserts|rejects|fails|reports)\b/i,
    /\b(?:deterministic|CI|continuous-integration) gate (?:that |which )?(?:fails|rejects|asserts|verifies|reports)\b/i,
    /\b(?:deterministic|call-site|dependency-audit) gate (?:runs|is green|stays green)\b/i,
    /\bgate that fails the build\b/i,
    /\bfails the gate\b/i,
    /\benumerated by a deterministic gate\b/i,
    /\bdependency-audit gate green\b/i,
    /\btracked against the committed\b/i,
    /\bgoverned by the governance file\b/i,
    /\brun on every pull request\b/i,
    /\bbecomes blocking\b/i,
    /\bcannot pass as classified\b/i,
  ],
  FAULT_INJECTION_REHEARSAL: [
    /\b(?:a|the|each) (?:fault[- ]injection )?rehearsal (?:proves?|demonstrates?|shows?|reveals?|is (?:repeated|executed|run))\b/i,
    /\b(?:proven|demonstrated|verified|shown|exercised|executed)\b[^.]{0,90}?\b(?:by|during|in) an? (?:fault[- ]injection )?rehearsal\b/i,
    /\b(?:is|are) rehearsed\b/i,
    /\bfault[- ]injection rehearsal with the (?:database|client) (?:made )?unavailable (?:shows?|proves?|demonstrates?)\b/i,
    /\bis shown not to fire for a simulated outage\b/i,
  ],
  OWNER_READ_ONLY_PRODUCTION_CHECK: [
    /\bowner read-only (?:production )?check (?:records?|reports?|confirms?|states?)\b/i,
  ],
  EXTERNAL_VANTAGE_OBSERVATION: [
    /\b(?:re-?)?verified (?:present |absent )?(?:on|from) an? (?:independent )?(?:external )?(?:vantage|response from the edge|direct origin response)\b/i,
    /\bverified on a response from the edge\b/i,
    /\brepeated observations (?:over time )?from more than one vantage\b/i,
  ],
  OWNER_POLICY_STATEMENT: [
    /\bthe owner records (?:a decision|which|whether)\b/i,
    /\ba decision is recorded on whether\b/i,
    /\bis accepted in writing\b/i,
    /\b(?:path|generator|issuance)\b[^.]{0,80}\b(?:are|is) located and recorded\b/i,
  ],
  NOT_YET_VERIFIABLE: [/\bis not yet verifiable because\b/i],
});

/** Words that, just before a matched phrase and in the same clause, withdraw it. */
const LINKAGE_NEGATOR_RX =
  /\b(?:nothing|nobody|never|none|neither)\b|\bno (?:one|gate|test|rehearsal|review|work)\b|\b(?:is|are|does|do|did|has|have|was|were|will|would|can|could|should)\s+not\b|n't\b/i;
const LINKAGE_HEDGE_RX = /\b(?:would|might|could|may|ideally|someday|eventually|hope|planned?|intend)\b|\bone day\b/i;
const LINKAGE_WINDOW = 56;

/**
 * Does this criterion link the method by an operational phrase that its own
 * sentence does not withdraw? The text before the phrase is examined only back to
 * the start of the sentence, and only the stretch just before it.
 */
export function criterionLinksMethod(criterion, method) {
  const pats = VERIFICATION_LINKAGE[method];
  if (!pats) return false;
  const text = String(criterion);
  for (const rx of pats) {
    const g = new RegExp(rx.source, rx.flags.includes("g") ? rx.flags : `${rx.flags}g`);
    for (const m of text.matchAll(g)) {
      const before = text.slice(0, m.index);
      // the CLAUSE that leads into the phrase: a full stop, comma, semicolon, colon or bracket ends it
      const clauseStart = Math.max(before.lastIndexOf(". "), before.lastIndexOf(";"), before.lastIndexOf(":"), before.lastIndexOf(","), before.lastIndexOf("("), -1) + 1;
      const window = before.slice(Math.max(clauseStart, m.index - LINKAGE_WINDOW));
      if (LINKAGE_NEGATOR_RX.test(window) || LINKAGE_HEDGE_RX.test(window)) continue;
      return true;
    }
  }
  return false;
}

export function verificationLinkageViolations(reg) {
  const out = [];
  for (const r of reg.risks) {
    if (r.score === 0) continue; // positive controls carry preservation criteria
    if (!VERIFICATION_LINKAGE[r.verificationMethod]) {
      out.push({ riskId: r.riskId, why: "METHOD_HAS_NO_LINKAGE_PATTERN", method: r.verificationMethod });
      continue;
    }
    const linked = r.acceptanceCriteria.filter((c) => criterionLinksMethod(c, r.verificationMethod));
    if (linked.length === 0) {
      out.push({ riskId: r.riskId, why: "NO_CRITERION_NAMES_THE_DECLARED_METHOD", method: r.verificationMethod });
    }
  }
  return out;
}

/**
 * S1-RV-010 — THE DOMINANT IMPACT DIMENSION, DERIVED.
 *
 * `max()` is the right operator for security impact — averaging would dilute a
 * confidentiality breach — but it hides WHICH axis set the band. Fourteen risks
 * take their impact from auditability alone, eleven of them HIGH, so "HIGH" spans
 * "data could leak" and "we cannot evidence a control". The dimension is derived
 * here, displayed in the management matrix, and gated, so the kind of harm travels
 * with the number.
 */
export const IMPACT_DIMENSION_LABELS = Object.freeze({
  confidentiality: "CONFIDENTIALITY",
  integrity: "INTEGRITY",
  availability: "AVAILABILITY",
  auditability: "AUDITABILITY",
  industrialSafety: "INDUSTRIAL_SAFETY",
});

/** Ties are reported in the fixed key order, never in object-iteration order. */
export function dominantImpactDimensions(risk) {
  const m = computeImpact(risk.impactFactors);
  if (m === 0) return [];
  return IMPACT_FACTOR_KEYS.filter((k) => risk.impactFactors[k] === m).map((k) => IMPACT_DIMENSION_LABELS[k]);
}

export function dominantImpactViolations(reg) {
  const out = [];
  for (const r of reg.risks) {
    const derived = dominantImpactDimensions(r);
    const stored = r.dominantImpact ?? [];
    if (derived.join("+") !== stored.join("+")) {
      out.push({ riskId: r.riskId, why: "DOMINANT_IMPACT_MISMATCH", stored, derived });
    }
  }
  return out;
}

/** The calibration figures the report must display, all derived. */
export function calibration(reg) {
  const scored = reg.risks.filter((r) => r.score > 0);
  const histogram = {};
  const likelihood = {};
  const impact = {};
  const dimension = {};
  for (const r of scored) {
    histogram[r.score] = (histogram[r.score] ?? 0) + 1;
    likelihood[r.likelihood] = (likelihood[r.likelihood] ?? 0) + 1;
    impact[r.impact] = (impact[r.impact] ?? 0) + 1;
    const key = dominantImpactDimensions(r).join("+");
    dimension[key] = (dimension[key] ?? 0) + 1;
  }
  const high = scored.filter((r) => r.severity === "HIGH").length;
  const auditOnly = scored.filter((r) => dominantImpactDimensions(r).join("+") === "AUDITABILITY");
  // S1-R4 FR-04: the method's own constants are DERIVED, never typed. A score is a
  // product of two 1..5 integers, so only some values in 1..25 can occur at all.
  const reachable = new Set();
  for (let l = 1; l <= 5; l += 1) for (let i = 1; i <= 5; i += 1) reachable.add(l * i);
  const highBand = [...Array(26).keys()].filter((v) => severityForScore(v) === "HIGH");
  return {
    unscoredRisks: reg.risks.length - scored.length,
    reachableScores: reachable.size,
    highBandFrom: Math.min(...highBand),
    highBandTo: Math.max(...highBand),
    scoredRisks: scored.length,
    histogram,
    likelihood,
    impact,
    dimension,
    highCount: high,
    highPercentOfScored: Math.round((high / scored.length) * 100),
    distinctScores: Object.keys(histogram).length,
    auditabilityOnlyCount: auditOnly.length,
    auditabilityOnlyHigh: auditOnly.filter((r) => r.severity === "HIGH").length,
  };
}


// ─────────────────────────────── counters and summary ──────────────────────────

export function counters(reg) {
  const sev = Object.fromEntries(SEVERITIES.map((s) => [s, 0]));
  const state = Object.fromEntries(PRODUCTION_STATES.map((s) => [s, 0]));
  let clamps = 0;
  for (const r of reg.risks) {
    sev[r.severity] += 1;
    state[r.productionState] += 1;
    if (r.severityClamp) clamps += 1;
  }
  const statusCounts = Object.fromEntries(FINDING_STATUSES.map((s) => [s, 0]));
  for (const f of reg.findings) statusCounts[f.status] = (statusCounts[f.status] ?? 0) + 1;

  const covered = reg.findings.filter((f) => Boolean(f.status)).length;
  return {
    S1_METHOD_VERSION: METHOD_VERSION,
    S1_RISKS_TOTAL: reg.risks.length,
    S1_FINDINGS_TOTAL: reg.findings.length,
    SEVERITY_CRITICAL: sev.CRITICAL,
    SEVERITY_HIGH: sev.HIGH,
    SEVERITY_MEDIUM: sev.MEDIUM,
    SEVERITY_LOW: sev.LOW,
    SEVERITY_INFORMATIONAL: sev.INFORMATIONAL,
    STATE_ACTIVE_CONFIRMED: state.ACTIVE_CONFIRMED,
    STATE_LATENT_CONFIG_GUARDED: state.LATENT_CONFIG_GUARDED,
    STATE_CODE_CONFIRMED_RUNTIME_UNPROVEN: state.CODE_CONFIRMED_RUNTIME_UNPROVEN,
    STATE_ASSURANCE_GAP: state.ASSURANCE_GAP,
    STATE_POLICY_AMBIGUITY: state.POLICY_AMBIGUITY,
    STATE_POSITIVE_CONTROL: state.POSITIVE_CONTROL,
    FINDING_STATUS_MAPPED_TO_RISK: statusCounts.MAPPED_TO_RISK,
    FINDING_STATUS_DUPLICATE_OF: statusCounts.DUPLICATE_OF,
    FINDING_STATUS_POLICY_QUESTION: statusCounts.POLICY_QUESTION,
    FINDING_STATUS_ASSURANCE_GAP: statusCounts.ASSURANCE_GAP,
    FINDING_STATUS_POSITIVE_CONTROL: statusCounts.POSITIVE_CONTROL,
    FINDING_STATUS_NOT_A_SECURITY_RISK: statusCounts.NOT_A_SECURITY_RISK_WITH_REASON,
    FINDING_COVERAGE_PERCENT: reg.findings.length === 0 ? 0 : Math.round((covered / reg.findings.length) * 100),
    ORPHAN_FINDINGS: orphanFindings(reg).length,
    DUPLICATE_RISK_IDS: duplicateRiskIds(reg).length,
    DUPLICATE_FINDING_IDS: duplicateFindingIds(reg).length,
    OWNERSHIP_VIOLATIONS: ownershipViolations(reg).length,
    DUPLICATE_REMEDIATION_OWNERSHIP: duplicateRemediationOwnership(reg).length,
    SCORE_MISMATCHES: arithmeticViolations(reg).filter((v) => ["likelihood", "impact", "score"].includes(v.field)).length,
    SEVERITY_MISMATCHES: arithmeticViolations(reg).filter((v) => v.field.startsWith("severity")).length,
    UNKNOWN_ENUM_VALUES: enumViolations(reg).length,
    MISSING_REQUIRED_FIELDS: missingRequiredFields(reg).length,
    MISSING_EVIDENCE_PATHS: missingEvidence(reg).length,
    CRITICAL_WITHOUT_ACTIVE_CONFIRMED: criticalWithoutActiveConfirmed(reg).length,
    HIGH_OR_CRITICAL_WITHOUT_ACCEPTANCE: acceptanceCriteriaViolations(reg).length,
    FORBIDDEN_CONTENT_HITS: forbiddenContent(reg).length,
    ORDERING_VIOLATIONS: orderingViolations(reg).length,
    PRIORITY_VIOLATIONS: priorityViolations(reg).length,
    SEVERITY_CLAMPS_APPLIED: clamps,
    RUNTIME_EVIDENCE_RISKS: reg.risks.filter((r) => r.runtimeEvidence).length,
    RUNTIME_EVIDENCE_CONFLICTS: runtimeEvidenceContradictions(reg).length,
    GUARD_EVIDENCE_VIOLATIONS: guardEvidenceViolations(reg).length,
    SOURCE_UNIVERSE_VIOLATIONS: findingUniverseViolations(reg).length,
    LOCK_UNIVERSE_COUNT: reg.findings.filter((f) => f.family === "LOCK").length,
    VERIFICATION_LINKAGE_VIOLATIONS: verificationLinkageViolations(reg).length,
    DOMINANT_IMPACT_VIOLATIONS: dominantImpactViolations(reg).length,
    FORBIDDEN_CONTENT_IN_DELIVERABLES: 0,
  };
}

/** The counter keys the Markdown report must restate, and that `check` compares. */
export const MARKDOWN_MIRRORED_KEYS = Object.freeze([
  "S1_METHOD_VERSION",
  "S1_RISKS_TOTAL",
  "S1_FINDINGS_TOTAL",
  "SEVERITY_CRITICAL",
  "SEVERITY_HIGH",
  "SEVERITY_MEDIUM",
  "SEVERITY_LOW",
  "SEVERITY_INFORMATIONAL",
  "STATE_ACTIVE_CONFIRMED",
  "STATE_LATENT_CONFIG_GUARDED",
  "STATE_CODE_CONFIRMED_RUNTIME_UNPROVEN",
  "STATE_ASSURANCE_GAP",
  "STATE_POLICY_AMBIGUITY",
  "STATE_POSITIVE_CONTROL",
  "FINDING_COVERAGE_PERCENT",
  "ORPHAN_FINDINGS",
  "DUPLICATE_REMEDIATION_OWNERSHIP",
  "SCORE_MISMATCHES",
  "SEVERITY_MISMATCHES",
  "UNKNOWN_ENUM_VALUES",
  "SEVERITY_CLAMPS_APPLIED",
  "RUNTIME_EVIDENCE_RISKS",
  "RUNTIME_EVIDENCE_CONFLICTS",
  "GUARD_EVIDENCE_VIOLATIONS",
  "SOURCE_UNIVERSE_VIOLATIONS",
  "LOCK_UNIVERSE_COUNT",
  "VERIFICATION_LINKAGE_VIOLATIONS",
  "DOMINANT_IMPACT_VIOLATIONS",
]);

// ─────────── S1-RV remediation: generated Markdown blocks and their gate ─────
//
// Every management-facing table is now RENDERED BY THIS TOOL and compared to the
// report byte for byte. A hand edit anywhere inside a block fails `check`, and
// because the renderers live in a committed file the report can be regenerated
// without the scratchpad that first produced it.

export const BLOCK_OPEN = (name) => `<!-- S1-BLOCK:${name} -->`;
export const BLOCK_CLOSE = (name) => `<!-- /S1-BLOCK:${name} -->`;

const mdCell = (s) => String(s).replace(/\|/g, "\\|").replace(/\n+/g, " ");

/** S1-RV-006 — the management matrix: controls, criteria, method and residual. */
export function renderManagementMatrix(reg) {
  const lines = [];
  for (const r of [...reg.risks].sort((a, b) => a.riskId.localeCompare(b.riskId))) {
    lines.push(`#### \`${r.riskId}\` — ${mdCell(r.title)}`);
    lines.push("");
    lines.push(
      `**${r.severity}** (${r.likelihood}×${r.impact}=${r.score}) · ${r.productionState} · ` +
        `dominant impact **${r.dominantImpact.join(" + ") || "NONE"}** · confidence ${r.confidence} · ` +
        `priority ${r.remediationPriority} · phase ${r.remediationPhase}`,
    );
    lines.push("");
    lines.push("| | |");
    lines.push("|---|---|");
    lines.push(`| **Existing controls** | ${r.existingControls.map((c) => mdCell(c)).join("<br>• ")} |`);
    lines.push(`| **Control gaps** | ${r.controlGaps.map((c) => mdCell(c)).join("<br>• ")} |`);
    lines.push(`| **Acceptance criteria** | ${r.acceptanceCriteria.map((c) => mdCell(c)).join("<br>• ")} |`);
    lines.push(`| **Verification method** | \`${r.verificationMethod}\` |`);
    lines.push(`| **Residual risk** | ${mdCell(r.residualRisk)} |`);
    lines.push("");
  }
  return lines.join("\n").trimEnd();
}

/** S1-RV-009 — the calibration figures, so saturation is visible rather than implied. */
export function renderCalibration(reg) {
  const c = calibration(reg);
  const L = [];
  L.push("```");
  L.push(`SCORED_RISKS                 ${c.scoredRisks}   (the ${c.unscoredRisks} positive controls score 0 by construction)`);
  L.push(`HIGH_COUNT                   ${c.highCount}`);
  L.push(`HIGH_PERCENT_OF_SCORED       ${c.highPercentOfScored}%`);
  L.push(`DISTINCT_SCORES_USED         ${c.distinctScores} of ${c.reachableScores} reachable`);
  L.push("");
  L.push("score histogram");
  for (const s of Object.keys(c.histogram).map(Number).sort((a, b) => a - b)) {
    L.push(`  ${String(s).padStart(2)}  ${"#".repeat(c.histogram[s])} (${c.histogram[s]})`);
  }
  L.push("");
  L.push("likelihood distribution");
  for (const k of Object.keys(c.likelihood).sort()) L.push(`  L=${k}  ${c.likelihood[k]}`);
  L.push("");
  L.push("impact distribution");
  for (const k of Object.keys(c.impact).sort()) L.push(`  I=${k}  ${c.impact[k]}`);
  L.push("```");
  L.push("");
  L.push(
    `**What this means, and it is a weakness of the method rather than of the estate.** ${c.highCount} of ` +
      `${c.scoredRisks} scored risks (${c.highPercentOfScored}%) land in HIGH, and only ${c.distinctScores} of the ` +
      `${c.reachableScores} reachable scores are used. Likelihood clusters because it is a *mean* of four factors, and the HIGH band ` +
      `spans ${c.highBandFrom} to ${c.highBandTo}, which is wide. **Severity therefore does not order the work on its own.** The remediation ` +
      "order in §12 is a severity-consistent total order over `remediationPriority`, and `productionState` is what " +
      "separates a confirmed exposure from a configuration-guarded one inside the same band. Reading the band " +
      "alone will mislead; the register is built so that nobody has to.",
  );
  return L.join("\n");
}

/** S1-RV-010 — which axis set each band, since `max()` does not say. */
export function renderDominantImpact(reg) {
  const c = calibration(reg);
  const L = [];
  L.push("| Dominant impact dimension | Scored risks | Of which HIGH |");
  L.push("|---|---|---|");
  const keys = Object.keys(c.dimension).sort((a, b) => c.dimension[b] - c.dimension[a] || a.localeCompare(b));
  for (const k of keys) {
    const members = reg.risks.filter((r) => r.score > 0 && r.dominantImpact.join("+") === k);
    L.push(`| ${k.split("+").join(" + ")} | ${members.length} | ${members.filter((r) => r.severity === "HIGH").length} |`);
  }
  L.push("");
  L.push(
    `**${c.auditabilityOnlyCount} risks take their impact from \`AUDITABILITY\` alone, ${c.auditabilityOnlyHigh} of them HIGH.** ` +
      "That is the register's most important calibration caveat: `max()` is correct for security impact — averaging " +
      "would dilute a confidentiality breach — but it makes one number stand for very different kinds of harm. An " +
      "`ASSURANCE_GAP` risk can reach HIGH because the platform cannot *evidence* a control, not because data can " +
      "leak. The dimension column above is derived from the factors on every run and gated, so the kind of harm " +
      "always travels with the band.",
  );
  return L.join("\n");
}

/**
 * S1-RV-013 — the review closure table. This is review metadata rather than
 * register data, so it is pinned by living in this committed, gated source: the
 * report's block must equal what this function renders.
 */
export const REVIEW_CLOSURE = Object.freeze([
  ["S1-RV-001", "MEDIUM", "FIXED", "report §4 and §6 prose", "runtimeEvidenceContradictions now scans the report; 4 selftests"],
  ["S1-RV-002", "MEDIUM", "FIXED", "risk-register-check.mjs — runtimeEvidenceContradictions(reg, md)", "markdown-contradiction selftests, incl. a superseded historical quote that must pass"],
  ["S1-RV-003", "MEDIUM", "FIXED", "risk-register-check.mjs — findingUniverseViolations", "EDGE-02 deletion, H-1 plus ownership deletion, invented finding, LOCK count and hash"],
  ["S1-RV-004", "LOW", "FIXED", "risk-register-check.mjs — secretShapeViolations", "one selftest per shape class, plus harmless placeholders that must pass"],
  ["S1-RV-005", "LOW", "FIXED", "register R-52 affectedAssets", "asset-coherence selftest; score unchanged at 12"],
  ["S1-RV-006", "LOW", "FIXED", "report appendix A, generated", "markdownBlockDrift over the matrix block"],
  ["S1-RV-007", "LOW", "FIXED", "R-05, R-40, R-44, R-46 criteria + verificationLinkageViolations", "linkage selftests: missing, wrong and correct method"],
  ["S1-RV-008", "INFORMATIONAL", "FIXED", ".gitattributes and report §14.2", "git check-attr on all four artifacts; 0 CR bytes"],
  ["S1-RV-009", "INFORMATIONAL", "FIXED_BY_DISCLOSURE_AND_DERIVED_PRESENTATION", "report appendix B, generated", "markdownBlockDrift over the calibration block"],
  ["S1-RV-010", "INFORMATIONAL", "FIXED_BY_DISCLOSURE_AND_DERIVED_PRESENTATION", "register dominantImpact + report appendix C", "dominantImpactViolations; tie ordering is the fixed factor order"],
  ["S1-RV-011", "INFORMATIONAL", "FIXED", "privilegeAccessibility across all four artifacts", "zero occurrences of the old key; monotonic direction asserted"],
]);

/** S1-R5 I-02 — the statuses that close a review finding. Anything else is OPEN. */
export const REVIEW_CLOSED_STATUSES = Object.freeze(["FIXED", "FIXED_BY_DISCLOSURE_AND_DERIVED_PRESENTATION"]);

export function reviewClosureViolations(closure = REVIEW_CLOSURE) {
  return closure.filter(([, , status]) => !REVIEW_CLOSED_STATUSES.includes(status)).map(([id, , status]) => ({ why: "REVIEW_FINDING_OPEN", id, status }));
}

export function renderReviewClosure(reg, closure = REVIEW_CLOSURE) {
  const disclosed = closure.filter(([, , status]) => status === "FIXED_BY_DISCLOSURE_AND_DERIVED_PRESENTATION").length;
  const open = reviewClosureViolations(closure);
  const L = [];
  L.push("| Review finding | Reviewed severity | Status | Where it was fixed | Test or gate that proves it |");
  L.push("|---|---|---|---|---|");
  for (const [id, sev, status, where, proof] of closure) {
    L.push(`| \`${id}\` | ${sev} | **${status}** | ${mdCell(where)} | ${mdCell(proof)} |`);
  }
  L.push("");
  L.push(
    `${open.length === 0 ? "No review finding is OPEN." : `${open.length} review finding${open.length === 1 ? " is" : "s are"} OPEN: ${open.map((o) => o.id).join(", ")}.`} ` +
      `The ${numberToWords(disclosed)} marked \`FIXED_BY_DISCLOSURE_AND_DERIVED_PRESENTATION\` were calibration ` +
      "criticisms of the scoring method, not defects in the data: the bands and every severity are unchanged, and " +
      "what was added is derived presentation so a reader can see the saturation and the dominant harm without " +
      "recomputing them. **The review identifiers are deliberately NOT security findings** — they are not among " +
      `the register's ${reg.findings.length} and they own no risk.`,
  );
  return L.join("\n");
}

/**
 * S1-R2-002 — the finding tables became a validated block too.
 *
 * They were generated from the register but sat OUTSIDE any block, so the
 * contradiction scan read them as hand-authored prose and tripped on the register's
 * own disclosure of the two contradicting S0 documents. Generated text belongs in a
 * validated, byte-compared region; hand-authored prose belongs in the scan. Nothing
 * may be in neither.
 */
export function renderFindingTables(reg) {
  const families = [...new Set(reg.findings.map((f) => f.family))].sort();
  const out = [];
  for (const fam of families) {
    const rows = reg.findings
      .filter((f) => f.family === fam)
      .sort((a, b) => a.findingId.localeCompare(b.findingId))
      .map((f) => {
        const disposition =
          f.status === "DUPLICATE_OF"
            ? `\`DUPLICATE_OF\` \`${f.duplicateOf}\``
            : f.ownerRiskId
              ? `\`${f.status}\` \u2192 \`${f.ownerRiskId}\``
              : `\`${f.status}\``;
        return `| \`${f.findingId}\` | ${String(f.summary).replace(/\|/g, "\\|")} | ${disposition} |`;
      });
    out.push(
      `### ${fam} \u2014 ${rows.length} finding${rows.length === 1 ? "" : "s"}\n\n` +
        ["| Finding | What it records | Disposition |", "|---|---|---|", ...rows].join("\n"),
    );
  }
  return out.join("\n\n");
}

/** `label` padded to the column the verdict blocks use. */
const verdictRow = (key, value, note = "") =>
  `${key}:`.padEnd(33) + (note ? String(value).padEnd(11) + note : String(value));

/**
 * S1-R3-008 — the two hand-typed verdict panels are generated.
 *
 * Both were fenced code blocks of counts typed by hand, and nothing compared them
 * with the register. They are rendered from the counters here, so a figure in
 * them can only be the register's figure. The words that are not counts
 * ("COMPLETE", "NONE DEMONSTRATED", "PROVEN_*") are constants of the renderer, in
 * one place, and not a second copy of any number.
 */
export function renderHeadlinePanel(reg) {
  const c = counters(reg);
  return [
    "```",
    "S1_VERDICT:                 see §16",
    "GATE_A:                     PASSED_WITH_FINDINGS (S0, closed before this phase)",
    `CRITICAL_RISKS_OPEN:        ${c.SEVERITY_CRITICAL}`,
    `HIGH_RISKS_OPEN:            ${c.SEVERITY_HIGH}`,
    "PROVEN_AUTHENTICATION_BYPASS:   NONE DEMONSTRATED",
    "PROVEN_TENANT_ISOLATION_BYPASS: NONE DEMONSTRATED",
    "PROVEN_CLOUD_TO_CONTROLLER_PATH: NONE — the capability does not exist (R-50)",
    "```",
  ].join("\n");
}

export function renderVerdictPanel(reg) {
  const c = counters(reg);
  const latent = c.STATE_CODE_CONFIRMED_RUNTIME_UNPROVEN + c.STATE_LATENT_CONFIG_GUARDED;
  return [
    "```",
    verdictRow("S1_STATUS", "COMPLETE"),
    verdictRow("S1_RISKS", c.S1_RISKS_TOTAL),
    `${verdictRow("S1_FINDINGS", c.S1_FINDINGS_TOTAL)}`.padEnd(44) +
      `coverage ${c.FINDING_COVERAGE_PERCENT}%`.padEnd(21) + `orphans ${c.ORPHAN_FINDINGS}`,
    verdictRow("S1_CRITICAL", c.SEVERITY_CRITICAL, `(${c.SEVERITY_CLAMPS_APPLIED} clamped from CRITICAL to HIGH, each recorded)`),
    verdictRow("S1_HIGH", c.SEVERITY_HIGH),
    verdictRow("S1_MEDIUM", c.SEVERITY_MEDIUM),
    verdictRow("S1_LOW", c.SEVERITY_LOW),
    verdictRow("S1_INFORMATIONAL", c.SEVERITY_INFORMATIONAL, `(${c.STATE_POSITIVE_CONTROL} positive controls)`),
    verdictRow("ACTIVE_PRODUCTION_EXPOSURES", c.STATE_ACTIVE_CONFIRMED),
    verdictRow("LATENT_DESIGN_FLAWS", latent, `(${c.STATE_CODE_CONFIRMED_RUNTIME_UNPROVEN} code-confirmed runtime-unproven + ${c.STATE_LATENT_CONFIG_GUARDED} config-guarded)`),
    verdictRow("CONFIG_GUARDED_WITH_EVIDENCE", c.STATE_LATENT_CONFIG_GUARDED, "(each names its guard)"),
    verdictRow("RISKS_WITH_RUNTIME_EVIDENCE", c.RUNTIME_EVIDENCE_RISKS, "(all settled from committed S0 evidence)"),
    verdictRow("RUNTIME_EVIDENCE_CONFLICTS", c.RUNTIME_EVIDENCE_CONFLICTS),
    verdictRow("ASSURANCE_GAPS", c.STATE_ASSURANCE_GAP),
    verdictRow("POLICY_QUESTIONS", c.STATE_POLICY_AMBIGUITY),
    verdictRow("PROVEN_AUTHENTICATION_BYPASS", "NONE DEMONSTRATED"),
    verdictRow("PROVEN_TENANT_ISOLATION_BYPASS", "NONE DEMONSTRATED"),
    verdictRow("PRODUCT_BYTES_CHANGED", 0),
    verdictRow("S1_COMMITTED", "NO"),
    "```",
  ].join("\n");
}

/**
 * S1-R4 FR-03 — the executive claim about the largest risk cluster is DERIVED.
 *
 * "Eleven of the 35 HIGH risks are about truthfulness" was typed by hand: no field
 * of the register defines that eleven, so no gate could check it. The claim is now
 * stated in terms the register does define — the STRIDE category that occurs most
 * often among the HIGH risks, compared with information disclosure, and the HIGH
 * risks scheduled for the failure-semantics-and-truthfulness phase — and rendered
 * from the register on every run. If the data stops supporting "truthfulness", the
 * sentence changes with it.
 */
export function renderTruthfulnessLead(reg) {
  const high = reg.risks.filter((r) => r.severity === "HIGH");
  const counts = {};
  for (const r of high) for (const st of r.stride) counts[st] = (counts[st] ?? 0) + 1;
  const ranked = Object.entries(counts).sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
  const [top, n] = ranked[0] ?? ["NONE", 0];
  const disclosure = counts.INFORMATION_DISCLOSURE ?? 0;
  const s7 = high.filter((r) => r.remediationPhase === "S7_FAILURE_SEMANTICS_AND_TRUTHFULNESS").length;
  const lead =
    top === "REPUDIATION" && n > disclosure
      ? "**The largest cluster of risk is not confidentiality — it is truthfulness.**"
      : `**The largest cluster of HIGH risk is \`${top}\`.**`;
  return (
    `${lead} \`${top}\` is the most frequent STRIDE category among the ${high.length} HIGH risks — ${n} of them, ` +
    `against ${disclosure} for \`INFORMATION_DISCLOSURE\` — and the ${s7} HIGH risks scheduled for ` +
    "`S7_FAILURE_SEMANTICS_AND_TRUTHFULNESS` are about the platform reporting something that did not happen."
  );
}

/** Every generated block, by name, in DOCUMENT order. The report must carry each one exactly. */
export function markdownBlocks(reg) {
  return {
    truthfulness: renderTruthfulnessLead(reg),
    headline: renderHeadlinePanel(reg),
    summary: ["```", ...MARKDOWN_MIRRORED_KEYS.map((k) => `${k} = ${counters(reg)[k]}`), "```"].join("\n"),
    findings: renderFindingTables(reg),
    verdict: renderVerdictPanel(reg),
    matrix: renderManagementMatrix(reg),
    calibration: renderCalibration(reg),
    dominant: renderDominantImpact(reg),
    closure: renderReviewClosure(reg),
    mutations: renderMutationManifest(),
  };
}

/**
 * S1-R3-009 — a block is compared BYTE FOR BYTE.
 *
 * The first implementation trimmed both sides, so a blank line or a space just
 * inside a marker was invisible although the document claimed byte equality. The
 * framing is now exact: the opening marker, one line feed, the rendered text, one
 * line feed, the closing marker. Anything else — a blank line, a trailing space, a
 * carriage return — is drift. Line endings are `eol=lf` by repository rule; a
 * carriage return is therefore a defect, not something to normalise away.
 */
export function extractBlock(md, name) {
  const open = `${BLOCK_OPEN(name)}\n`;
  const close = `\n${BLOCK_CLOSE(name)}`;
  const a = md.indexOf(open);
  if (a === -1) return null;
  const start = a + open.length;
  const b = md.indexOf(close, start - 1);
  if (b === -1 || b < start - 1) return null;
  return md.slice(start, Math.max(start, b));
}

export function markdownBlockDrift(reg, md) {
  const out = [];
  // One parse, one truth: the marker set is validated before any byte comparison,
  // so an unknown, unbalanced, duplicated, nested or reordered marker fails here
  // and cannot quietly shrink what the contradiction scan sees.
  const parsed = parseMarkdownBlocks(reg, md);
  for (const v of parsed.violations) out.push({ block: v.name ?? "*", why: v.why, ...v });
  if (parsed.violations.length) return out;
  const blocks = markdownBlocks(reg);
  for (const [name, expected] of Object.entries(blocks)) {
    const actual = extractBlock(md, name);
    if (actual === null) {
      out.push({ block: name, why: "BLOCK_ABSENT" });
      continue;
    }
    if (actual !== expected) {
      // Report the first differing line so the failure is actionable.
      const e = expected.split("\n");
      const a = actual.split("\n");
      let i = 0;
      while (i < Math.max(e.length, a.length) && e[i] === a[i]) i += 1;
      out.push({
        block: name,
        why: "BLOCK_DRIFT",
        line: i + 1,
        expected: (e[i] ?? "<end>").slice(0, 110),
        found: (a[i] ?? "<end>").slice(0, 110),
      });
    }
  }
  return out;
}


export const SUMMARY_BLOCK_MARKER = "<!-- S1-SUMMARY-BLOCK -->";

/** Parse the `KEY = VALUE` lines of the report's machine-checked summary block. */
export function parseMarkdownSummary(md) {
  const at = md.indexOf(SUMMARY_BLOCK_MARKER);
  if (at === -1) return null;
  const fenceStart = md.indexOf("```", at);
  if (fenceStart === -1) return null;
  const bodyStart = md.indexOf("\n", fenceStart) + 1;
  const fenceEnd = md.indexOf("```", bodyStart);
  if (fenceEnd === -1) return null;
  const out = {};
  for (const line of md.slice(bodyStart, fenceEnd).split("\n")) {
    const m = /^([A-Z0-9_]+)\s*=\s*(.+?)\s*$/.exec(line.trim());
    if (m) out[m[1]] = m[2];
  }
  return out;
}

export function markdownDrift(reg, md) {
  const parsed = parseMarkdownSummary(md);
  if (parsed === null) return [{ key: "*", why: "NO_SUMMARY_BLOCK" }];
  const c = counters(reg);
  const out = [];
  for (const k of MARKDOWN_MIRRORED_KEYS) {
    if (!(k in parsed)) {
      out.push({ key: k, why: "MISSING_IN_MARKDOWN" });
      continue;
    }
    if (String(parsed[k]) !== String(c[k])) {
      out.push({ key: k, why: "VALUE_DIFFERS", markdown: parsed[k], json: String(c[k]) });
    }
  }
  for (const k of Object.keys(parsed)) {
    if (!MARKDOWN_MIRRORED_KEYS.includes(k)) out.push({ key: k, why: "UNEXPECTED_IN_MARKDOWN" });
  }
  // Every risk id and finding id must appear somewhere in the report, so the
  // register cannot grow an entry the management document never mentions.
  for (const r of reg.risks) if (!md.includes(r.riskId)) out.push({ key: r.riskId, why: "RISK_ABSENT_FROM_MARKDOWN" });
  for (const f of reg.findings) {
    if (!md.includes(f.findingId)) out.push({ key: f.findingId, why: "FINDING_ABSENT_FROM_MARKDOWN" });
  }
  return out;
}

/**
 * S1-R3-008 — a figure stated in the hand-written prose is DERIVED, not typed.
 *
 * Two prose figures went stale ("160 findings", "Fourteen risks") because only the
 * generated blocks were compared with the register and the narrative was not. A
 * count in the narrative now sits in an inline fact marker that names the fact it
 * states:
 *
 *   <!-- S1-FACT:S1_FINDINGS_TOTAL -->161<!-- /S1-FACT -->        digits
 *   <!-- S1-FACT:STATE_ASSURANCE_GAP:W -->Ten<!-- /S1-FACT -->     capitalised word
 *   <!-- S1-FACT:SEVERITY_HIGH:w -->thirty-five<!-- /S1-FACT -->   lower-case word
 *
 * The check recomputes the fact from the register, so there is no second set of
 * numbers anywhere in this tool: the marker holds the figure the author typed, the
 * register holds the truth, and any difference fails. A figure that names one of
 * the counted things (risks, findings, clamps, positive controls) but carries no
 * marker is itself a violation, so a new count cannot be typed in unguarded.
 */
export const FACT_MARKER_VERSION = "s1-fact-1";
const FACT_MARKER_RX = /<!--\s*S1-FACT:([A-Z0-9_]+)(?::([Ww]))?\s*-->([^<\n]*)<!--\s*\/S1-FACT\s*-->/g;

const ONES = ["zero", "one", "two", "three", "four", "five", "six", "seven", "eight", "nine", "ten", "eleven", "twelve", "thirteen", "fourteen", "fifteen", "sixteen", "seventeen", "eighteen", "nineteen"];
const TENS = ["", "", "twenty", "thirty", "forty", "fifty", "sixty", "seventy", "eighty", "ninety"];

export function numberToWords(n) {
  if (!Number.isInteger(n) || n < 0 || n > 99) return String(n);
  if (n < 20) return ONES[n];
  const t = Math.floor(n / 10);
  return n % 10 === 0 ? TENS[t] : `${TENS[t]}-${ONES[n % 10]}`;
}

/** Every fact a marker may name: the register's counters plus the facts computed from sources. */
export function narrativeFacts(reg, root = REPO_ROOT) {
  const c = counters(reg);
  const facts = { ...c };
  facts.LATENT_DESIGN_FLAWS = c.STATE_CODE_CONFIRMED_RUNTIME_UNPROVEN + c.STATE_LATENT_CONFIG_GUARDED;
  facts.HISTOGRAM = Object.entries(calibration(reg).histogram)
    .sort((x, y) => Number(x[0]) - Number(y[0]))
    .map(([k, v]) => `${k}:${v}`)
    .join(" ");
  const u = extractSourceUniverse(root);
  if (!u.error) facts.SOURCE_UNIVERSE_COUNT = u.ids.size;
  return facts;
}

function expectedFactText(value, fmt) {
  if (fmt === undefined) return String(value);
  const w = numberToWords(Number(value));
  return fmt === "W" ? `${w[0].toUpperCase()}${w.slice(1)}` : w;
}

// "one" is deliberately absent: "one of the …", "one owning risk" and "one risk" are
// a determiner and a singular, not a count anyone could let drift. A digit run that
// is part of an identifier, a section number or a decimal ("R-05", "10.3", "S1") is
// not a count either, hence the look-behind.
const NUMBER_WORD_RX =
  "(?:zero|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|thirteen|fourteen|fifteen|sixteen|seventeen|eighteen|nineteen|(?:twenty|thirty|forty|fifty|sixty|seventy|eighty|ninety)(?:-(?:one|two|three|four|five|six|seven|eight|nine))?)";
const UNMARKED_FACT_RX = new RegExp(
  `(?<![A-Za-z0-9.§-])(?:\\d+|${NUMBER_WORD_RX})\\s+(?:[A-Za-z0-9_\`-]+\\s+){0,4}(?:risks?|findings?|clamps?|positive controls?)\\b`,
  "i",
);

export function narrativeFactViolations(reg, md, root = REPO_ROOT) {
  const out = [];
  let narrative;
  try {
    narrative = narrativeOnly(md, reg);
  } catch {
    return out; // an invalid marker set is reported by the block gates; nothing is silently trusted here
  }
  const facts = narrativeFacts(reg, root);
  narrative.split("\n").forEach((line, i) => {
    if (!line.trim()) return;
    let rest = line;
    for (const m of line.matchAll(FACT_MARKER_RX)) {
      const [whole, key, fmt, text] = m;
      rest = rest.replace(whole, " ");
      if (!(key in facts)) {
        out.push({ why: "UNKNOWN_FACT_KEY", line: i + 1, key });
        continue;
      }
      const expected = expectedFactText(facts[key], fmt);
      if (text !== expected) out.push({ why: "FACT_DIFFERS", line: i + 1, key, written: text, derived: expected });
    }
    if (/S1-FACT/.test(rest)) out.push({ why: "MALFORMED_FACT_MARKER", line: i + 1, text: line.trim().slice(0, 90) });
    const u = UNMARKED_FACT_RX.exec(rest);
    if (u) out.push({ why: "UNMARKED_NARRATIVE_FACT", line: i + 1, text: u[0].slice(0, 70) });
  });
  return out;
}

// ─────────────────────────────── mutation evidence ───────────────────────────────

/**
 * S1-R4 FR-12 / S1-R5 F-01 F-02 — the mutation evidence is DATA in this file, and a
 * mutant counts only when it is killed FOR THE RIGHT REASON.
 *
 * Every mutation is listed below with the source text it replaces, the selftest
 * named for it, the FINGERPRINT that test's failure must carry, and a PLACEBO: a
 * semantically equivalent rewrite of the same source text. A mutant is a
 * TARGETED_KILL only when all of these hold:
 *   1. its anchor occurs exactly once outside this list;
 *   2. the named test ran (it is filtered by its exact name, so nothing else runs);
 *   3. the named test failed, and its failure text matches the fingerprint;
 *   4. the failure is not the manifest gate, a manifest drift or a setup error;
 *   5. the placebo, applied to the same anchor in an identical copy, leaves the
 *      named test GREEN.
 * Otherwise it is ONLY_INCIDENTAL, SURVIVED or INVALID_MUTANT, and the campaign exits
 * non-zero.
 *
 * Why a copy must be REBOUND: a mutation removes its own anchor, so in the mutated
 * copy this list is stale and the manifest gate (exit 25) would fire before the
 * gate under test — every command-line test would fail whatever the mutation did.
 * The campaign therefore rewrites, in the COPY only, this list without the entries
 * whose anchors the mutation removed, re-binds the campaign record to that reduced
 * list, and re-renders Appendix E of the copy's report from it. Only that metadata is
 * touched: the mutated code is never repaired, a rebinding that does not verify is an
 * INVALID_MUTANT (never a kill), and the placebo copy is rebound identically, so a
 * failure that comes from the scaffolding shows up in the placebo and voids the proof.
 *
 * Six PLACEBO_CONTROLS check the classifier itself: a semantic no-op, a comment, a
 * pure manifest drift, a setup break, a mutation that trips an EARLIER gate, and one
 * that fails the named test for an unrelated reason. None may be a targeted kill.
 *
 * `check` refuses a campaign record bound to a different list, a result other than
 * TARGETED_KILL, a control whose result differs from its expectation, and an entry
 * whose anchor no longer exists (exit 25).
 */
const MUTATION_REGION_OPEN = "// <" + "MUTATION-MANIFEST>";
const MUTATION_REGION_CLOSE = "// </" + "MUTATION-MANIFEST>";

/** The manifest format: s1-mut-2 adds the fingerprint, the placebo and the controls. */
export const MUTATION_MANIFEST_VERSION = "s1-mut-2";

export const CAMPAIGN_STATUSES = Object.freeze(["TARGETED_KILL", "ONLY_INCIDENTAL", "SURVIVED", "INVALID_MUTANT"]);

const MANIFEST_FIELDS = ["id", "target", "description", "find", "replace", "placebo", "detector", "fingerprint"];
const CONTROL_FIELDS = ["id", "kind", "description", "find", "replace", "detector", "fingerprint", "expected", "inRegion"];

/** SHA-256 of the manifest's canonical form: entries and controls sorted by id, fields in a fixed order. */
export function mutationManifestSha256(manifest = MUTATION_MANIFEST, controls = PLACEBO_CONTROLS) {
  const byId = (a, b) => (a.id < b.id ? -1 : 1);
  const canon = JSON.stringify([
    [...manifest].sort(byId).map((e) => MANIFEST_FIELDS.map((k) => e[k] ?? null)),
    [...controls].sort(byId).map((e) => CONTROL_FIELDS.map((k) => e[k] ?? null)),
  ]);
  return createHash("sha256").update(canon, "utf8").digest("hex");
}

/** Split a checker source into the text outside the manifest region and the region itself. */
function splitAtManifest(source) {
  const a = source.indexOf(MUTATION_REGION_OPEN);
  const b = source.indexOf(MUTATION_REGION_CLOSE);
  if (a === -1 || b === -1 || b < a) return null;
  const end = b + MUTATION_REGION_CLOSE.length;
  return { before: source.slice(0, a), region: source.slice(a, end), after: source.slice(end) };
}

/** Apply one replacement to a checker source. The anchor must occur exactly once outside the region. */
export function applyMutation(source, entry, replacement = entry.replace) {
  const parts = splitAtManifest(source);
  if (!parts) return { ok: false, count: -1, mutated: null };
  const inBefore = parts.before.split(entry.find).length - 1;
  const inAfter = parts.after.split(entry.find).length - 1;
  const count = inBefore + inAfter;
  if (count !== 1) return { ok: false, count, mutated: null };
  const mutated = inBefore === 1
    ? parts.before.replace(entry.find, () => replacement) + parts.region + parts.after
    : parts.before + parts.region + parts.after.replace(entry.find, () => replacement);
  return { ok: true, count, mutated };
}

/** The region text for a given manifest, controls and campaign record. The repository's region is exactly this. */
export function renderManifestRegion(manifest, controls, campaign) {
  const L = [];
  const lit = (v) => JSON.stringify(v);
  L.push(MUTATION_REGION_OPEN);
  L.push("// Generated by renderManifestRegion(). Each entry is a source mutation of THIS file, the");
  L.push("// test named for it, the failure fingerprint it must produce, a semantically equivalent");
  L.push("// placebo, and the campaign result recorded against this exact manifest.");
  L.push("export const MUTATION_MANIFEST = Object.freeze([");
  for (const e of manifest) {
    L.push(`  Object.freeze({ id: ${lit(e.id)}, target: ${lit(e.target)}, description: ${lit(e.description)},`);
    L.push(`    find: ${lit(e.find)},`);
    L.push(`    replace: ${lit(e.replace)},`);
    L.push(`    placebo: ${lit(e.placebo)},`);
    L.push(`    detector: ${lit(e.detector)},`);
    L.push(`    fingerprint: ${lit(e.fingerprint)} }),`);
  }
  L.push("]);");
  L.push("export const PLACEBO_CONTROLS = Object.freeze([");
  for (const c of controls) {
    L.push(`  Object.freeze({ id: ${lit(c.id)}, kind: ${lit(c.kind)}, description: ${lit(c.description)},`);
    L.push(`    find: ${lit(c.find)},`);
    L.push(`    replace: ${lit(c.replace)},`);
    L.push(`    detector: ${lit(c.detector)},`);
    L.push(`    fingerprint: ${lit(c.fingerprint)},`);
    L.push(`    expected: ${lit(c.expected)}, inRegion: ${lit(Boolean(c.inRegion))} }),`);
  }
  L.push("]);");
  L.push("export const MUTATION_CAMPAIGN = Object.freeze({");
  L.push(`  manifestSha256: ${lit(campaign.manifestSha256)},`);
  L.push("  observed: Object.freeze({");
  for (const id of Object.keys(campaign.observed).sort()) L.push(`    ${lit(id)}: ${lit(campaign.observed[id])},`);
  L.push("  }),");
  L.push("  controls: Object.freeze({");
  for (const id of Object.keys(campaign.controls ?? {}).sort()) L.push(`    ${lit(id)}: ${lit(campaign.controls[id])},`);
  L.push("  }),");
  L.push("});");
  L.push(MUTATION_REGION_CLOSE);
  return L.join("\n");
}

export function mutationManifestViolations(
  source = readFileSync(fileURLToPath(import.meta.url), "utf8"),
  manifest = MUTATION_MANIFEST,
  campaign = MUTATION_CAMPAIGN,
  controls = PLACEBO_CONTROLS,
) {
  const out = [];
  const ids = new Set();
  for (const e of [...manifest, ...controls]) {
    if (ids.has(e.id)) out.push({ why: "DUPLICATE_MUTATION_ID", id: e.id });
    ids.add(e.id);
  }
  for (const e of manifest) {
    for (const k of ["id", "target", "description", "find", "detector", "fingerprint"]) {
      if (typeof e[k] !== "string" || !e[k].trim()) out.push({ why: "MUTATION_FIELD_MISSING", id: e.id, field: k });
    }
    if (e.find === e.replace) out.push({ why: "MUTATION_IS_A_NO_OP", id: e.id });
    if (typeof e.placebo !== "string" || e.placebo === e.replace || e.placebo === e.find) {
      out.push({ why: "PLACEBO_MISSING_OR_NOT_A_REWRITE", id: e.id });
    }
    try {
      new RegExp(e.fingerprint);
    } catch {
      out.push({ why: "FINGERPRINT_NOT_A_PATTERN", id: e.id });
    }
    const { count } = applyMutation(source, e);
    if (count !== 1) {
      out.push({ why: "MUTATION_ANCHOR_STALE", id: e.id, occurrences: count });
    }
  }
  for (const c of controls) {
    if (!c.inRegion && applyMutation(source, c).count !== 1) out.push({ why: "MUTATION_ANCHOR_STALE", id: c.id });
    if (c.expected === "TARGETED_KILL") out.push({ why: "A_CONTROL_MAY_NOT_EXPECT_A_TARGETED_KILL", id: c.id });
  }
  const sha = mutationManifestSha256(manifest, controls);
  if (campaign.manifestSha256 !== sha) {
    out.push({ why: "CAMPAIGN_RECORDED_AGAINST_A_DIFFERENT_MANIFEST", recorded: String(campaign.manifestSha256).slice(0, 12), current: sha.slice(0, 12) });
  }
  for (const e of manifest) {
    const status = campaign.observed[e.id];
    if (status === undefined) {
      out.push({ why: "MUTATION_WITHOUT_RECORDED_RESULT", id: e.id });
      continue;
    }
    if (status !== "TARGETED_KILL") {
      out.push({ why: "MUTATION_NOT_A_TARGETED_KILL", id: e.id, status });
    }
  }
  for (const c of controls) {
    const got = campaign.controls?.[c.id];
    if (got !== c.expected) out.push({ why: "CONTROL_RESULT_DIFFERS", id: c.id, expected: c.expected, recorded: got ?? "NOT RUN" });
  }
  for (const id of Object.keys(campaign.observed)) if (!manifest.some((e) => e.id === id)) out.push({ why: "RESULT_WITHOUT_MUTATION", id });
  return out;
}

/** Appendix E — the manifest and the controls, rendered from the data. */
export function renderMutationManifest(manifest = MUTATION_MANIFEST, campaign = MUTATION_CAMPAIGN, controls = PLACEBO_CONTROLS) {
  const L = [];
  L.push("| Mutant | Target | Mutation | Named test | Observed |");
  L.push("|---|---|---|---|---|");
  for (const e of [...manifest].sort((a, b) => (a.id < b.id ? -1 : 1))) {
    L.push(`| \`${e.id}\` | ${mdCell(e.target)} | ${mdCell(e.description)} | ${mdCell(e.detector)} | **${campaign.observed[e.id] ?? "NOT RUN"}** |`);
  }
  L.push("");
  L.push("| Placebo control | Kind | What it does | Named test | Expected | Observed |");
  L.push("|---|---|---|---|---|---|");
  for (const c of [...controls].sort((a, b) => (a.id < b.id ? -1 : 1))) {
    L.push(`| \`${c.id}\` | ${c.kind} | ${mdCell(c.description)} | ${mdCell(c.detector)} | ${c.expected} | **${campaign.controls?.[c.id] ?? "NOT RUN"}** |`);
  }
  const count = (s) => manifest.filter((e) => campaign.observed[e.id] === s).length;
  L.push("");
  L.push("```");
  L.push(`MUTATION_MANIFEST_VERSION    ${MUTATION_MANIFEST_VERSION}`);
  L.push(`MUTANTS_TOTAL                ${manifest.length}`);
  for (const s of CAMPAIGN_STATUSES) L.push(`${s.padEnd(29)}${count(s)}`);
  L.push(`PLACEBO_CONTROLS             ${controls.length}`);
  L.push(`CONTROLS_AS_EXPECTED         ${controls.filter((c) => campaign.controls?.[c.id] === c.expected).length}`);
  L.push(`MANIFEST_SHA256              ${mutationManifestSha256(manifest, controls)}`);
  L.push(`CAMPAIGN_BOUND_TO            ${campaign.manifestSha256}`);
  L.push("```");
  L.push("");
  L.push(
    "Each mutant is applied to the checker's own source in a temporary copy outside the repository, and only " +
      "its named test is run. **A mutant counts as TARGETED_KILL only when** its anchor occurs exactly once, the " +
      "named test ran and failed, the failure carries the mutant's fingerprint, the failure is not the manifest " +
      "gate, a manifest drift or a setup error, and a semantically equivalent placebo on the same source text " +
      "leaves the named test green. Because a mutation removes its own anchor, this list is, in the mutated copy " +
      "only, rebound to the entries whose anchors survive, and Appendix E of the copy is re-rendered from it; the " +
      "mutated code is never repaired, and the placebo copy is rebound the same way, so a failure caused by the " +
      "scaffolding appears in the placebo and voids the proof. The placebo controls prove the classifier does " +
      "not mistake a no-op, a drift, a setup break, an earlier gate or an unrelated failure for a kill. `check` " +
      "refuses a record bound to a different list, any result other than TARGETED_KILL, and any control whose " +
      "result differs from its expectation (exit 25). The campaign is reproduced by the `mutants` mode (§18).",
  );
  return L.join("\n");
}

/**
 * Failure text that comes from the scaffolding or the manifest, never from the
 * behaviour under test. Only an OBSERVED 25 counts: a test that SAYS "expected exit
 * 25" is testing the manifest gate itself, and its failure is exactly the point.
 */
export const INCIDENTAL_FAILURE_RX = /\bgot 25\b|^\s*actual: 25$|MUTATION_ANCHOR_STALE|CAMPAIGN_RECORDED_AGAINST_A_DIFFERENT_MANIFEST|the mutation manifest is stale, unbound/m;
/** Failure text that says the copy could not even load or run. */
export const SETUP_FAILURE_RX = /SyntaxError|ERR_MODULE_NOT_FOUND|Cannot find module|does not provide an export named|ReferenceError/;

/**
 * Classify one mutant from its runs. Pure, so the selftest drives every branch.
 * `mutant` and `placebo` are parsed runs: `{ code, tests: { [name]: { state, text } } }`.
 */
export function classifyMutantRun({ entry, anchorCount, rebound, mutant, placebo }) {
  if (anchorCount !== 1) return { status: "INVALID_MUTANT", reason: "the anchor does not occur exactly once" };
  if (!rebound) return { status: "INVALID_MUTANT", reason: "the copy could not be rebound" };
  const named = mutant?.tests?.[entry.detector];
  if (!named) return { status: "INVALID_MUTANT", reason: "the named test did not run" };
  const namedFailed = named.state === "not ok";
  if (!namedFailed) return { status: "SURVIVED", reason: "the named test passed" };
  if (SETUP_FAILURE_RX.test(named.text)) return { status: "INVALID_MUTANT", reason: "a setup failure, not behaviour" };
  if (INCIDENTAL_FAILURE_RX.test(named.text)) return { status: "ONLY_INCIDENTAL", reason: "the failure came through the manifest gate" };
  if (!new RegExp(entry.fingerprint).test(named.text)) return { status: "ONLY_INCIDENTAL", reason: "the failure does not carry the fingerprint" };
  const control = placebo?.tests?.[entry.detector];
  if (!control || control.state !== "ok") return { status: "INVALID_MUTANT", reason: "the placebo did not stay green" };
  return { status: "TARGETED_KILL", reason: "the named test failed with the fingerprint and the placebo stayed green" };
}

/** The campaign's verdict over its records: anything but a targeted kill (or a control's expectation) is a deviation. */
export function summarizeCampaign(results, cleanup) {
  const mutants = results.filter((r) => r.kind === "mutant");
  const deviations = results.filter((r) => (r.kind === "mutant" ? r.status !== "TARGETED_KILL" : r.status !== r.expected)).length;
  const tally = Object.fromEntries(CAMPAIGN_STATUSES.map((s) => [s, mutants.filter((r) => r.status === s).length]));
  return { total: mutants.length, ...tally, controls: results.length - mutants.length, deviations, cleanup, exitCode: deviations === 0 && cleanup === "REMOVED" ? 0 : 1 };
}

/**
 * S1-FA-04 / I4 — THE ASSERTION LEDGER: an assertion is counted when it RUNS, inside the
 * test that ran it.
 *
 * The selftest used to scan its own source with a regular expression and call a test
 * "assertive" when the text between two `test(` lines matched `assert(`. That counted
 * an assertion inside a comment or a string, credited a test with the assertions of
 * the helper written after it, and could not see a `function () {}` callback or a
 * template-literal name. The ledger replaces reading with observing:
 *   - `test` is wrapped: each test runs inside its own AsyncLocalStorage record, so an
 *     assertion made by an awaited continuation or by a helper the test calls is
 *     credited to that test, and an assertion made by any other test, or at module
 *     load, is credited to none;
 *   - `assert` is wrapped: every call of `assert(...)` or `assert.<method>(...)`
 *     increments the record of the test that is running;
 *   - a test that finishes with a count of zero FAILS with `ASSERTIONLESS:<name>`.
 * The ledger also keeps the names registered and the names executed, so a final test
 * can reconcile the two instead of trusting a threshold like "more than 150 tests".
 */
export function createAssertionLedger(nodeTest, baseAssert) {
  const current = new AsyncLocalStorage();
  const registered = [];
  const executed = new Map();
  const credit = () => {
    const record = current.getStore();
    if (record) record.count += 1;
  };
  const assert = new Proxy(baseAssert, {
    apply(target, thisArg, args) {
      credit();
      return Reflect.apply(target, thisArg, args);
    },
    get(target, prop, receiver) {
      const value = Reflect.get(target, prop, receiver);
      if (typeof value !== "function") return value;
      return (...args) => {
        credit();
        return Reflect.apply(value, target, args);
      };
    },
  });
  const test = (name, fn) => {
    registered.push(name);
    return nodeTest(name, async (t) => {
      const record = { name, count: 0 };
      executed.set(name, record);
      await current.run(record, () => fn(t));
      if (record.count === 0) throw new Error(`ASSERTIONLESS:${name} ran to the end without a single assertion`);
    });
  };
  return { test, assert, registered, executed };
}

/** The YAML diagnostic of one TAP result without its `location` and `stack` — paths are never evidence. */
function diagnosticText(body) {
  const out = [];
  let skipping = false;
  for (const line of body) {
    const key = /^ {2}([A-Za-z_]+):/.exec(line);
    if (key) skipping = key[1] === "stack" || key[1] === "location";
    if (!skipping) out.push(line);
  }
  return out.join("\n");
}

/** Parse `node --test --test-reporter=tap` output into per-test results (top-level tests only). */
export function parseTapResults(output) {
  const tests = {};
  const lines = String(output).split(/\r?\n/);
  for (let i = 0; i < lines.length; i += 1) {
    const m = /^(not ok|ok) \d+ - (.*?)(?: # (SKIP|TODO)\b.*)?$/.exec(lines[i]);
    if (!m) continue;
    const name = m[2].replace(/\\#/g, "#").replace(/\\\\/g, "\\");
    const body = [];
    for (let j = i + 1; j < lines.length && (lines[j].startsWith(" ") || lines[j] === ""); j += 1) body.push(lines[j]);
    if (m[3]) continue; // filtered out or skipped: not run
    tests[name] = { state: m[1], text: diagnosticText(body) };
  }
  return { tests };
}

const escapeRegExp = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

function runNamedTest(dir, name) {
  return new Promise((done) => {
    const p = spawn(
      process.execPath,
      ["--test", "--test-reporter=tap", `--test-name-pattern=^${escapeRegExp(name)}$`, join(dir, "scripts", "security", "s1", "__tests__", "risk-register.selftest.mjs")],
      { stdio: ["ignore", "pipe", "pipe"] },
    );
    let out = "";
    p.stdout.on("data", (d) => (out += d));
    p.stderr.on("data", (d) => (out += d));
    p.on("close", (code) => done({ code, ...parseTapResults(out) }));
  });
}

/**
 * Rewrite, in a COPY's source, the manifest region without the entries whose anchors
 * the change removed (and without the entry under test), re-bound to that list.
 * Verified before use: every kept anchor occurs once and the copy's own gate is clean.
 */
export function rebindSource(changedSource, targetId, manifest = MUTATION_MANIFEST, controls = PLACEBO_CONTROLS) {
  const parts = splitAtManifest(changedSource);
  if (!parts) return { ok: false, reason: "no manifest region" };
  const kept = manifest.filter((e) => e.id !== targetId && applyMutation(changedSource, e).count === 1);
  const keptControls = controls.filter((c) => c.id !== targetId && (c.inRegion || applyMutation(changedSource, c).count === 1));
  const rebound = {
    manifestSha256: mutationManifestSha256(kept, keptControls),
    observed: Object.fromEntries(kept.map((e) => [e.id, "TARGETED_KILL"])),
    controls: Object.fromEntries(keptControls.map((c) => [c.id, c.expected])),
  };
  const source = parts.before + renderManifestRegion(kept, keptControls, rebound) + parts.after;
  const ok = mutationManifestViolations(source, kept, rebound, keptControls).length === 0;
  return { ok, source, kept, keptControls, rebound, dropped: manifest.filter((e) => !kept.includes(e)).map((e) => e.id) };
}

/** Build a self-contained copy of what the checker and its selftest read, outside the repository. */
function buildCheckerMirror(dir) {
  mkdirSync(join(dir, "scripts", "security", "s1"), { recursive: true });
  cpSync(join(REPO_ROOT, "scripts", "security", "s1"), join(dir, "scripts", "security", "s1"), { recursive: true });
  cpSync(join(REPO_ROOT, "docs", "security"), join(dir, "docs", "security"), { recursive: true });
  for (const f of [".env.example", ".env.production.example"]) {
    if (existsSync(join(REPO_ROOT, f))) cpSync(join(REPO_ROOT, f), join(dir, f));
  }
  const reg = JSON.parse(readFileSync(REGISTER_PATH, "utf8"));
  for (const r of reg.risks) {
    for (const e of r.evidence) {
      const src = join(REPO_ROOT, ...e.path.split("/"));
      const dst = join(dir, ...e.path.split("/"));
      if (!existsSync(src) || existsSync(dst)) continue;
      if (statSync(src).isDirectory()) mkdirSync(dst, { recursive: true });
      else {
        mkdirSync(dirname(dst), { recursive: true });
        writeFileSync(dst, "");
      }
    }
  }
}

/**
 * Prepare one copy of the mirror: apply a change and, unless the change is a drift
 * INSIDE the region (a control), rebind the copy's list and re-render its Appendix E
 * with THIS (unmutated) renderer.
 */
function prepareCopy(base, dir, entry, replacement, { inRegion = false } = {}) {
  rmSync(dir, { recursive: true, force: true });
  cpSync(base, dir, { recursive: true });
  const checker = join(dir, "scripts", "security", "s1", "risk-register-check.mjs");
  const source = readFileSync(checker, "utf8");
  if (inRegion) {
    const parts = splitAtManifest(source);
    const n = parts ? parts.region.split(entry.find).length - 1 : 0;
    if (n !== 1) return { anchorCount: n, rebound: false };
    writeFileSync(checker, parts.before + parts.region.replace(entry.find, () => replacement) + parts.after, "utf8");
    return { anchorCount: 1, rebound: true, dropped: [] };
  }
  const m = applyMutation(source, entry, replacement);
  if (!m.ok) return { anchorCount: m.count, rebound: false };
  const r = rebindSource(m.mutated, entry.id);
  if (!r.ok) return { anchorCount: m.count, rebound: false };
  writeFileSync(checker, r.source, "utf8");
  const reportPath = join(dir, "docs", "security", "THREAT-MODEL-AND-RISK-REGISTER.md");
  const md = readFileSync(reportPath, "utf8");
  const open = `${BLOCK_OPEN("mutations")}\n`;
  const close = `\n${BLOCK_CLOSE("mutations")}`;
  const a = md.indexOf(open);
  const b = md.indexOf(close, a);
  if (a === -1 || b === -1) return { anchorCount: m.count, rebound: false };
  writeFileSync(reportPath, md.slice(0, a + open.length) + renderMutationManifest(r.kept, r.rebound, r.keptControls) + md.slice(b), "utf8");
  return { anchorCount: m.count, rebound: true, dropped: r.dropped };
}

function firstFailureLine(named) {
  if (!named || named.state === "ok") return "";
  const m = /error: \|-?\n\s+(.+)/.exec(named.text) ?? /error: '(.+)'/.exec(named.text) ?? /error: "(.+)"/.exec(named.text);
  return (m?.[1] ?? "").slice(0, 160);
}

/**
 * `mutants` mode. `--only=ID,…`, `--workers=N`, and `--discover`, which adds the named
 * test's failure diagnostic to each record. One JSON record per mutant or control,
 * then the totals.
 */
async function runMutationCampaign(argv) {
  const only = (argv.find((a) => a.startsWith("--only=")) ?? "").slice(7).split(",").filter(Boolean);
  const discover = argv.includes("--discover");
  const workers = Math.max(1, Number((argv.find((a) => a.startsWith("--workers=")) ?? "--workers=4").slice(10)) || 4);
  const todo = [
    ...MUTATION_MANIFEST.filter((e) => only.length === 0 || only.includes(e.id)).map((e) => ({ kind: "mutant", e })),
    ...PLACEBO_CONTROLS.filter((c) => only.length === 0 || only.includes(c.id)).map((c) => ({ kind: "control", e: c })),
  ];
  const root = mkdtempSync(join(tmpdir(), "s1-mutants-"));
  const results = [];
  let cleanup = "PENDING";
  try {
    const base = join(root, "base");
    buildCheckerMirror(base);
    let next = 0;
    const worker = async (w) => {
      for (;;) {
        const i = next++;
        if (i >= todo.length) return;
        const { kind, e } = todo[i];
        const md = join(root, `m${w}`);
        const pd = join(root, `p${w}`);
        // a mutant's placebo is its semantic rewrite; a control's placebo is the unchanged source
        const prep = prepareCopy(base, md, e, e.replace, { inRegion: kind === "control" && e.inRegion });
        const mutant = prep.rebound ? await runNamedTest(md, e.detector) : null;
        const pprep = prepareCopy(base, pd, e, kind === "mutant" ? e.placebo : e.find, { inRegion: kind === "control" && e.inRegion });
        const placebo = pprep.rebound ? await runNamedTest(pd, e.detector) : null;
        const c = classifyMutantRun({ entry: e, anchorCount: prep.anchorCount, rebound: Boolean(prep.rebound && pprep.rebound), mutant, placebo });
        const named = mutant?.tests?.[e.detector];
        results[i] = {
          id: e.id, kind, ...(kind === "control" ? { controlKind: e.kind, expected: e.expected } : { target: e.target }),
          anchorCount: prep.anchorCount, detector: e.detector, fingerprint: e.fingerprint,
          namedState: named?.state ?? "NOT RUN", failureLine: firstFailureLine(named),
          fingerprintMatched: named && named.state !== "ok" ? new RegExp(e.fingerprint).test(named.text) : false,
          placeboState: placebo?.tests?.[e.detector]?.state ?? "NOT RUN",
          rebinding: prep.rebound && pprep.rebound ? (prep.dropped?.length ? `REBOUND (-${prep.dropped.join(",-")})` : "REBOUND") : "FAILED",
          status: c.status, reason: c.reason,
          ...(discover ? { diagnostic: named?.text.slice(0, 1200) ?? "", placeboDiagnostic: placebo?.tests?.[e.detector]?.text.slice(0, 600) ?? "" } : {}),
        };
        rmSync(md, { recursive: true, force: true });
        rmSync(pd, { recursive: true, force: true });
      }
    };
    await Promise.all(Array.from({ length: workers }, (_, w) => worker(w)));
  } finally {
    rmSync(root, { recursive: true, force: true });
    cleanup = existsSync(root) ? "LEFT_BEHIND" : "REMOVED";
  }
  for (const r of results) {
    const ok = r.kind === "mutant" ? r.status === "TARGETED_KILL" : r.status === r.expected;
    process.stdout.write(`${JSON.stringify({ ...r, ok, cleanup })}\n`);
  }
  const summary = summarizeCampaign(results, cleanup);
  process.stdout.write(`${JSON.stringify({ manifestSha256: mutationManifestSha256(), ...summary })}\n`);
  process.exitCode = summary.exitCode;
}

// <MUTATION-MANIFEST>
// Generated by renderManifestRegion(). Each entry is a source mutation of THIS file, the
// test named for it, the failure fingerprint it must produce, a semantically equivalent
// placebo, and the campaign result recorded against this exact manifest.
export const MUTATION_MANIFEST = Object.freeze([
  Object.freeze({ id: "R3-B01", target: "block parser and drift", description: "block extraction trims the text",
    find: "return md.slice(start, Math.max(start, b));",
    replace: "return md.slice(start, Math.max(start, b)).trim();",
    placebo: "return md.slice(start, Math.max(b, start));",
    detector: "whitespace at either edge of a block is drift",
    fingerprint: "truthfulness: blank line after the opening marker must be reported" }),
  Object.freeze({ id: "R3-B02", target: "block parser and drift", description: "parser ignores an unterminated block",
    find: "if (open) violations.push({ why: \"UNTERMINATED_BLOCK\", name: open.name, line: open.line });",
    replace: "",
    placebo: "if (open) violations.push({ name: open.name, why: \"UNTERMINATED_BLOCK\", line: open.line });",
    detector: "a known block whose CLOSING marker is missing is UNTERMINATED, named as such",
    fingerprint: "UNTERMINATED: a block with no closing marker is reported as unterminated" }),
  Object.freeze({ id: "R3-B03", target: "block parser and drift", description: "block order check removed",
    find: "if (rendered.join(\",\") !== expectedOrder.join(\",\")) {",
    replace: "if (false) {",
    placebo: "if (!(rendered.join(\",\") === expectedOrder.join(\",\"))) {",
    detector: "reordering the blocks fails, and each invariant is asserted on its own",
    fingerprint: "BLOCK_ORDER: reordering two generated blocks is reported, and reported only as an order violation" }),
  Object.freeze({ id: "R3-B04", target: "block parser and drift", description: "block drift comparison disabled",
    find: "if (actual !== expected) {",
    replace: "if (false) {",
    placebo: "if (!(actual === expected)) {",
    detector: "a hand edit inside a generated block fails, and the failure names the line",
    fingerprint: "a hand edit must fail" }),
  Object.freeze({ id: "R3-B05", target: "block parser and drift", description: "headline panel left out of the generated blocks",
    find: "    headline: renderHeadlinePanel(reg),\n",
    replace: "",
    placebo: "    headline: `${renderHeadlinePanel(reg)}`,\n",
    detector: "the report carries no contradiction of the evidence the register holds",
    fingerprint: "REPORT_CLEAN: the live report contradicts nothing the register carries" }),
  Object.freeze({ id: "R3-D01", target: "secret detector", description: "sensitive-key suffix anchor removed (any key CONTAINING a family word)",
    find: "(?:^|_)(?:${SENSITIVE_KEY_FAMILIES.join(\"|\")})$`",
    replace: "(?:^|_)(?:${SENSITIVE_KEY_FAMILIES.join(\"|\")})`",
    placebo: "(?:^|_)(?:${SENSITIVE_KEY_FAMILIES.join(\"|\")})(?:)$`",
    detector: "a verdict token or a hash under a NON-sensitive key is not a credential; under a sensitive key it is",
    fingerprint: "max_tokens: 4096 must pass" }),
  Object.freeze({ id: "R3-D02", target: "secret detector", description: "key name stops at an underscore",
    find: "(_*[A-Za-z][A-Za-z0-9_-]*(?:\\.[A-Za-z0-9_-]+)*)\\1[*`]*[ \\t]*[:=]",
    replace: "(_*[A-Za-z][A-Za-z0-9-]*(?:\\.[A-Za-z0-9-]+)*)\\1[*`]*[ \\t]*[:=]",
    placebo: "(_*[A-Za-z][A-Za-z0-9_\\-]*(?:\\.[A-Za-z0-9_-]+)*)\\1[*`]*[ \\t]*[:=]",
    detector: "every secret shape class is detected",
    fingerprint: "but still detected, as a quoted assignment" }),
  Object.freeze({ id: "R3-D03", target: "secret detector", description: "long hex values exempt from the placeholder rule",
    find: "  if (v === \"\") return true;\n  if (ANGLE_PLACEHOLDER_RX.test(v)) return true;",
    replace: "  if (v === \"\") return true;\n  if (/^[0-9a-f]{32,}$/i.test(v)) return true;\n  if (ANGLE_PLACEHOLDER_RX.test(v)) return true;",
    placebo: "  if (v === \"\") return true;\n  if (ANGLE_PLACEHOLDER_RX.test(String(v))) return true;",
    detector: "a verdict token or a hash under a NON-sensitive key is not a credential; under a sensitive key it is",
    fingerprint: "AUTH_SECRET=3f2a9c1be45d7788a0c1d2e3f4b5a69788796a5b4c3d2e1f0a9b8c7d6e5f4a3b must be detected" }),
  Object.freeze({ id: "R3-D04", target: "secret detector", description: "UPPER_SNAKE values exempt",
    find: "  if (v === \"\") return true;\n  if (ANGLE_PLACEHOLDER_RX.test(v)) return true;",
    replace: "  if (v === \"\") return true;\n  if (/^[A-Z][A-Z0-9_]{3,}$/.test(v)) return true;\n  if (ANGLE_PLACEHOLDER_RX.test(v)) return true;",
    placebo: "  if (v === \"\") return true;\n  if (ANGLE_PLACEHOLDER_RX.test(`${v}`)) return true;",
    detector: "placeholders and evidence states pass — and only the documented, exact ones",
    fingerprint: "AUTH_SECRET=REDACTEDX must NOT pass as a placeholder" }),
  Object.freeze({ id: "R3-D05", target: "secret detector", description: "any value starting ${ is an environment reference",
    find: "if (ENV_REFERENCE_RX.test(v)) return true;",
    replace: "if (/^\\$\\{/.test(v)) return true;",
    placebo: "if (ENV_REFERENCE_RX.test(String(v))) return true;",
    detector: "placeholders and evidence states pass — and only the documented, exact ones",
    fingerprint: "AUTH_SECRET=\\$\\{X\\}realsecret must NOT pass as a placeholder" }),
  Object.freeze({ id: "R3-D06", target: "secret detector", description: "bare value truncated at ; | , * )",
    find: "while (j < line.length && !/\\s/.test(line[j])) j += 1;",
    replace: "while (j < line.length && !/[\\s;|,*)]/.test(line[j])) j += 1;",
    placebo: "while (j < line.length && !/[\\s]/.test(line[j])) j += 1;",
    detector: "a placeholder PREFIX never excuses the rest of the value",
    fingerprint: "AUTH_SECRET=SET;realsecretvalue must fail" }),
  Object.freeze({ id: "R3-D07", target: "secret detector", description: "an unclosed quote or a glued closing quote is no longer its own finding",
    find: "if (form === \"UNCLOSED_QUOTE\" || form === \"QUOTED_WITH_TRAILING_CONTENT\") {",
    replace: "if (false) {",
    placebo: "if ([\"UNCLOSED_QUOTE\", \"QUOTED_WITH_TRAILING_CONTENT\"].includes(form)) {",
    detector: "under a sensitive key every non-placeholder value is a credential",
    fingerprint: "AUTH_SECRET=\" must fail" }),
  Object.freeze({ id: "R3-D08", target: "secret detector", description: "a quoted value closes on EITHER quote character",
    find: "      if (line[j] === c) break;",
    replace: "      if (line[j] === '\"' || line[j] === \"'\") break;",
    placebo: "      if (c === line[j]) break;",
    detector: "S1-R4 FR-02: nothing may be glued to a quoted placeholder",
    fingerprint: "a quote closed by the other kind is open" }),
  Object.freeze({ id: "R3-D09", target: "secret detector", description: "decoded string leaves not scanned for assignments",
    find: "for (const h of assignedSecretHits(value)) hits.push({ ...h, where: label, level: \"DECODED\", path });",
    replace: "",
    placebo: "for (const h of assignedSecretHits(value)) hits.push({ ...h, level: \"DECODED\", where: label, path });",
    detector: "nested objects, nested arrays and several string leaves are all walked",
    fingerprint: "both leaves, at their exact paths" }),
  Object.freeze({ id: "R3-D10", target: "secret detector", description: "sensitive JSON property names not checked",
    find: "if (!isPlaceholderValue(value)) {\n        hits.push({ where: label, kind: \"ASSIGNED_SECRET_VALUE\", form: \"JSON_PROPERTY\"",
    replace: "if (false) {\n        hits.push({ where: label, kind: \"ASSIGNED_SECRET_VALUE\", form: \"JSON_PROPERTY\"",
    placebo: "if (isPlaceholderValue(value) === false) {\n        hits.push({ where: label, kind: \"ASSIGNED_SECRET_VALUE\", form: \"JSON_PROPERTY\"",
    detector: "a sensitive JSON PROPERTY is detected by its own name; a placeholder value passes",
    fingerprint: "the path is reported deterministically" }),
  Object.freeze({ id: "R3-D11", target: "secret detector", description: "findings are not de-duplicated",
    find: "const k = `${h.kind}|${h.id ?? h.sample}`;\n    if (seen.has(k)) return false;",
    replace: "const k = `${h.kind}|${h.id ?? h.sample}`;\n    if (false) return false;",
    placebo: "const k = `${h.kind}|${h.id ?? h.sample}`;\n    if (seen.has(`${k}`)) return false;",
    detector: "S1-R5 F-03: benign property names pass, and de-duplication keeps the STRUCTURED_KEY witness",
    fingerprint: "one credential, one finding" }),
  Object.freeze({ id: "R3-D12", target: "secret detector", description: "raw register scan removed",
    find: "for (const h of assignedSecretHits(unescapeJsonText(registerText), { jsonStructure: true })) hits.push({ ...h, where: label, level: \"RAW\" });\n",
    replace: "",
    placebo: "for (const h of assignedSecretHits(unescapeJsonText(registerText), { jsonStructure: true })) hits.push({ ...h, level: \"RAW\", where: label });\n",
    detector: "the RAW register level catches an assignment that only a duplicated JSON key carries",
    fingerprint: "RAW_ONLY:ASSIGNED \\[\\]" }),
  Object.freeze({ id: "R3-D13", target: "secret detector", description: "secret id takes the raw value, trailing markup included",
    find: "${stripValueDecoration(value)}`).digest",
    replace: "${value}`).digest",
    placebo: "${stripValueDecoration(`${value}`)}`).digest",
    detector: "nested objects, nested arrays and several string leaves are all walked",
    fingerprint: "both leaves, at their exact paths" }),
  Object.freeze({ id: "R3-D14", target: "secret detector", description: "the JSON-structure excuse widened to ANY unclosed quote",
    find: "options.jsonStructure && /^[\\s,\\]}]*$/.test(value)) continue;",
    replace: "options.jsonStructure) continue;",
    placebo: "options.jsonStructure && /^[\\s,\\]}]*$/.test(String(value))) continue;",
    detector: "a register string that merely ENDS in a key and an equals sign is not a finding, but an open quote inside a string still is",
    fingerprint: "a quote followed by real characters is still unclosed" }),
  Object.freeze({ id: "R3-D15", target: "secret detector", description: "the JSON-structure excuse removed",
    find: "if (form === \"UNCLOSED_QUOTE\" && options.jsonStructure && /^[\\s,\\]}]*$/.test(value)) continue;",
    replace: "",
    placebo: "if (options.jsonStructure && form === \"UNCLOSED_QUOTE\" && /^[\\s,\\]}]*$/.test(value)) continue;",
    detector: "a register string that merely ENDS in a key and an equals sign is not a finding, but an open quote inside a string still is",
    fingerprint: "ENDS_IN_KEY: a register string that merely ends in a key and an equals sign is not a finding" }),
  Object.freeze({ id: "R3-F01", target: "forbidden content", description: "HH:MM:SS rule neutered",
    find: "{ name: \"CLOCK_TIME_HMS\", rx: ",
    replace: "{ name: \"CLOCK_TIME_HMS\", rx: /ZZZ_NEVER/, was: ",
    placebo: "{ name: \"CLOCK_TIME_HMS\", \"rx\": ",
    detector: "reportForbiddenHits reports the line and the class, not just a boolean",
    fingerprint: "FORBIDDEN_CLASSES: both the clock time and the date-time are reported, by class" }),
  Object.freeze({ id: "R3-F02", target: "forbidden content", description: "network / privilege command rule neutered",
    find: "name: \"NETWORK_OR_PRIVILEGE_COMMAND\",\n    rx: ",
    replace: "name: \"NETWORK_OR_PRIVILEGE_COMMAND\",\n    rx: /ZZZ_NEVER/, was: ",
    placebo: "name: \"NETWORK_OR_PRIVILEGE_COMMAND\",\n    \"rx\": ",
    detector: "every forbidden family is caught in the report AND the register, in prose, inline code, a fence and a table cell",
    fingerprint: "curl \\(prose\\) must be caught as NETWORK_OR_PRIVILEGE_COMMAND in the report" }),
  Object.freeze({ id: "R3-F03", target: "forbidden content", description: "system absolute path rule neutered",
    find: "    name: \"UNIX_SYSTEM_ABSOLUTE_PATH\",\n    rx: ",
    replace: "    name: \"UNIX_SYSTEM_ABSOLUTE_PATH\",\n    rx: /ZZZ_NEVER/, was: ",
    placebo: "    name: \"UNIX_SYSTEM_ABSOLUTE_PATH\",\n    \"rx\": ",
    detector: "every forbidden family is caught in the report AND the register, in prose, inline code, a fence and a table cell",
    fingerprint: "/etc path \\(prose\\) must be caught as UNIX_SYSTEM_ABSOLUTE_PATH in the report" }),
  Object.freeze({ id: "R3-F04", target: "forbidden content", description: "register decoded forbidden-content scan removed",
    find: "const valueLimit = walkJsonStrings(parsed, (path, key, value) => {\n    if (key !== null) return;\n    for (const h of reportForbiddenHits(value, label)) hits.push({ ...h, path });\n  });",
    replace: "const valueLimit = null;",
    placebo: "const valueLimit = walkJsonStrings(parsed, (path, key, value) => {\n    if (key === null) {\n      for (const h of reportForbiddenHits(value, label)) hits.push({ ...h, path });\n    }\n  });",
    detector: "every forbidden family is caught in the report AND the register, in prose, inline code, a fence and a table cell",
    fingerprint: "curl \\(fenced block\\) must be caught in the register" }),
  Object.freeze({ id: "R3-F05", target: "forbidden content", description: "remote-shell rule back to user@host directly after the tool",
    find: "{ name: \"REMOTE_SHELL\", rx: /\\b(?:ssh|scp)\\s+(?:\\S+\\s+){0,4}?\\S+@\\S+/i }",
    replace: "{ name: \"REMOTE_SHELL\", rx: /\\b(?:ssh|scp)\\s+\\S+@\\S+/i }",
    placebo: "{ name: \"REMOTE_SHELL\", rx: /\\b(?:scp|ssh)\\s+(?:\\S+\\s+){0,4}?\\S+@\\S+/i }",
    detector: "every forbidden family is caught in the report AND the register, in prose, inline code, a fence and a table cell",
    fingerprint: "scp \\(prose\\) must be caught as REMOTE_SHELL in the report" }),
  Object.freeze({ id: "R3-F06", target: "forbidden content", description: "forbidden rules not applied to the report",
    find: "...reportForbiddenHits(reportText, \"docs/security/THREAT-MODEL-AND-RISK-REGISTER.md\"),",
    replace: "",
    placebo: "...reportForbiddenHits(`${reportText}`, \"docs/security/THREAT-MODEL-AND-RISK-REGISTER.md\"),",
    detector: "an absolute path, a date-time or a command in the REPORT fails",
    fingerprint: "windows path must fail as WINDOWS_ABSOLUTE_PATH" }),
  Object.freeze({ id: "R3-K01", target: "historical-marker pin", description: "marker count check removed",
    find: "if (count !== pins.count) out.push(",
    replace: "if (false) out.push(",
    placebo: "if (!(count === pins.count)) out.push(",
    detector: "a third marker, a removed marker, an edited line and a look-alike are each refused",
    fingerprint: "PIN_COUNT: a third historical marker is refused by the pinned count" }),
  Object.freeze({ id: "R3-K02", target: "historical-marker pin", description: "unpinned marker line allowed",
    find: "if (!pinned.has(digest)) {",
    replace: "if (false) {",
    placebo: "if (pinned.has(digest) === false) {",
    detector: "a genuine superseded quotation passes with the exact marker on its own line",
    fingerprint: "an exact marker on an unpinned line must be refused by the real pin" }),
  Object.freeze({ id: "R3-K03", target: "historical-marker pin", description: "missing or edited pinned line not noticed",
    find: "for (const h of pins.lineSha256) if (!used.has(h))",
    replace: "for (const h of []) if (!used.has(h))",
    placebo: "for (const h of [...pins.lineSha256]) if (!used.has(h))",
    detector: "a third marker, a removed marker, an edited line and a look-alike are each refused",
    fingerprint: "PIN_DIGEST: a pinned marked line that was removed or edited is refused" }),
  Object.freeze({ id: "R3-K04", target: "historical-marker pin", description: "look-alike marker not noticed",
    find: "if (MARKER_LOOKALIKE_RX.test(folded))",
    replace: "if (false)",
    placebo: "if (MARKER_LOOKALIKE_RX.test(`${folded}`))",
    detector: "a marker disguised by whitespace or Unicode neither exempts nor goes unnoticed",
    fingerprint: "a look-alike is reported as one" }),
  Object.freeze({ id: "R3-K05", target: "historical-marker pin", description: "pins not applied inside reportContradictions",
    find: "out.push(...historicalMarkerPinViolations(md, options.pins ?? HISTORICAL_MARKER_PINS));",
    replace: "",
    placebo: "for (const v of historicalMarkerPinViolations(md, options.pins ?? HISTORICAL_MARKER_PINS)) out.push(v);",
    detector: "a genuine superseded quotation passes with the exact marker on its own line",
    fingerprint: "an exact marker on an unpinned line must be refused by the real pin" }),
  Object.freeze({ id: "R3-K06", target: "historical-marker pin", description: "marker digest takes a lower-cased line",
    find: ".replace(/\\s+/g, \" \").trim();\n}\n\nconst MARKER_LOOKALIKE_RX",
    replace: ".replace(/\\s+/g, \" \").trim().toLowerCase();\n}\n\nconst MARKER_LOOKALIKE_RX",
    placebo: ".replace(/[\\s]+/g, \" \").trim();\n}\n\nconst MARKER_LOOKALIKE_RX",
    detector: "the report carries no contradiction of the evidence the register holds",
    fingerprint: "REPORT_CLEAN: the live report contradicts nothing the register carries" }),
  Object.freeze({ id: "R3-K07", target: "historical-marker pin", description: "several markers on one line allowed",
    find: "if (exact > 1) out.push({ why: \"MULTIPLE_MARKERS_ON_ONE_LINE\", line: i + 1 });",
    replace: "",
    placebo: "if (exact >= 2) out.push({ why: \"MULTIPLE_MARKERS_ON_ONE_LINE\", line: i + 1 });",
    detector: "a third marker, a removed marker, an edited line and a look-alike are each refused",
    fingerprint: "PIN_ONE_PER_LINE: two markers on one line are refused" }),
  Object.freeze({ id: "R3-L01", target: "verification linkage", description: "negation / hedge guard removed from the linkage",
    find: "if (LINKAGE_NEGATOR_RX.test(window) || LINKAGE_HEDGE_RX.test(window)) continue;",
    replace: "",
    placebo: "if (LINKAGE_HEDGE_RX.test(window) || LINKAGE_NEGATOR_RX.test(window)) continue;",
    detector: "every verification method has a real operational positive and a real negative",
    fingerprint: "SOURCE_REVIEW must reject \"Isolation is not established by reading anything\\.\"" }),
  Object.freeze({ id: "R3-L02", target: "verification linkage", description: "hedge guard removed alone",
    find: "if (LINKAGE_NEGATOR_RX.test(window) || LINKAGE_HEDGE_RX.test(window)) continue;",
    replace: "if (LINKAGE_NEGATOR_RX.test(window)) continue;",
    placebo: "if (LINKAGE_NEGATOR_RX.test(window) || LINKAGE_HEDGE_RX.test(`${window}`)) continue;",
    detector: "a negated or hedged sentence is not evidence of the method, but a negation elsewhere in the sentence is harmless",
    fingerprint: "LINKAGE_HEDGE: a hedged sentence is not evidence of the method" }),
  Object.freeze({ id: "R3-L03", target: "verification linkage", description: "bare 'gate' accepted for the tool-gate method",
    find: "/\\bruns? as a gate\\b/i,",
    replace: "/\\bruns? as a gate\\b/i,\n    /\\bgate\\b/i,",
    placebo: "/\\bruns? as a gate\\b/i, /\\bruns? as a gate\\b/i,",
    detector: "a criterion that merely mentions a keyword is refused",
    fingerprint: "\"This criterion mentions the word gate bu\" must be refused" }),
  Object.freeze({ id: "R3-L04", target: "verification linkage", description: "bare 'observation' accepted for the vantage method",
    find: "/\\brepeated observations (?:over time )?from more than one vantage\\b/i,",
    replace: "/\\brepeated observations (?:over time )?from more than one vantage\\b/i,\n    /\\bobservations?\\b/i,",
    placebo: "/\\brepeated observations (?:over time )?from more than one vantage\\b/i, /\\brepeated observations (?:over time )?from more than one vantage\\b/i,",
    detector: "every verification method has a real operational positive and a real negative",
    fingerprint: "EXTERNAL_VANTAGE_OBSERVATION must reject \"observation\"" }),
  Object.freeze({ id: "R3-L05", target: "verification linkage", description: "bare 'in a test' accepted for the test method",
    find: "/\\b(?:is|are) named in a test\\b/i,",
    replace: "/\\b(?:is|are) named in a test\\b/i,\n    /\\bin a test\\b/i,",
    placebo: "/\\b(?:is|are) named in a test\\b/i, /\\b(?:is|are) named in a test\\b/i,",
    detector: "every verification method has a real operational positive and a real negative",
    fingerprint: "AUTOMATED_TEST must reject \"in a test\"" }),
  Object.freeze({ id: "R3-L06", target: "verification linkage", description: "bare 'is recorded' accepted for the policy method",
    find: "/\\bis accepted in writing\\b/i,",
    replace: "/\\bis accepted in writing\\b/i,\n    /\\bis recorded\\b/i,",
    placebo: "/\\bis accepted in writing\\b/i, /\\bis accepted in writing\\b/i,",
    detector: "every verification method has a real operational positive and a real negative",
    fingerprint: "OWNER_POLICY_STATEMENT must reject \"is recorded\"" }),
  Object.freeze({ id: "R3-L07", target: "verification linkage", description: "bare 'declares' accepted for source review",
    find: "/\\bnames the test that proves it\\b/i,",
    replace: "/\\bnames the test that proves it\\b/i,\n    /\\bdeclares\\b/i,",
    placebo: "/\\bnames the test that proves it\\b/i, /\\bnames the test that proves it\\b/i,",
    detector: "every verification method has a real operational positive and a real negative",
    fingerprint: "SOURCE_REVIEW must reject \"declares\"" }),
  Object.freeze({ id: "R3-L08", target: "verification linkage", description: "bare 'rehearsal' accepted for fault injection",
    find: "/\\bis shown not to fire for a simulated outage\\b/i,",
    replace: "/\\bis shown not to fire for a simulated outage\\b/i,\n    /\\brehears\\w*/i,",
    placebo: "/\\bis shown not to fire for a simulated outage\\b/i, /\\bis shown not to fire for a simulated outage\\b/i,",
    detector: "every verification method has a real operational positive and a real negative",
    fingerprint: "FAULT_INJECTION_REHEARSAL must reject \"A rehearsal dinner\\.\"" }),
  Object.freeze({ id: "R3-T01", target: "narrative figures", description: "narrative completeness scan removed",
    find: "const u = UNMARKED_FACT_RX.exec(rest);",
    replace: "const u = null;",
    placebo: "const u = UNMARKED_FACT_RX.exec(String(rest));",
    detector: "the two figures that went stale are caught, in both shapes",
    fingerprint: "FACT_UNMARKED: a figure typed into the prose without a marker is refused" }),
  Object.freeze({ id: "R3-T02", target: "narrative figures", description: "fact value comparison removed",
    find: "if (text !== expected) out.push(",
    replace: "if (false) out.push(",
    placebo: "if (!(text === expected)) out.push(",
    detector: "the two figures that went stale are caught, in both shapes",
    fingerprint: "FACT_DIFFERS: a marked figure that no longer matches the register is refused, with both values named" }),
  Object.freeze({ id: "R3-T03", target: "narrative figures", description: "unknown fact keys allowed",
    find: "if (!(key in facts)) {",
    replace: "if (false) {",
    placebo: "if ((key in facts) === false) {",
    detector: "a new count typed into the narrative without a marker is refused, and a malformed marker is too",
    fingerprint: "FACT_UNKNOWN_KEY: a marker naming no derived figure is refused" }),
  Object.freeze({ id: "R3-T04", target: "narrative figures", description: "malformed fact marker not noticed",
    find: "if (/S1-FACT/.test(rest)) out.push(",
    replace: "if (false) out.push(",
    placebo: "if (/S1-FACT/.test(`${rest}`)) out.push(",
    detector: "a new count typed into the narrative without a marker is refused, and a malformed marker is too",
    fingerprint: "FACT_MALFORMED: an unclosed fact marker is refused" }),
  Object.freeze({ id: "R3-T05", target: "narrative figures", description: "narrative fact gate not wired into check",
    find: "if (facts.length) return stop(EXIT.NARRATIVE_FACT",
    replace: "if (false) return stop(EXIT.NARRATIVE_FACT",
    placebo: "if (facts.length > 0) return stop(EXIT.NARRATIVE_FACT",
    detector: "S1-R5 F-01 wiring: a stale narrative figure stops runGates with exit 24",
    fingerprint: "WIRING:NARRATIVE_FACT expected 24 got" }),
  Object.freeze({ id: "R3-T06", target: "narrative figures", description: "fact markers read from a stale hard-coded count",
    find: "facts.LATENT_DESIGN_FLAWS = c.STATE_CODE_CONFIRMED_RUNTIME_UNPROVEN + c.STATE_LATENT_CONFIG_GUARDED;",
    replace: "facts.LATENT_DESIGN_FLAWS = 14;",
    placebo: "facts.LATENT_DESIGN_FLAWS = c.STATE_LATENT_CONFIG_GUARDED + c.STATE_CODE_CONFIRMED_RUNTIME_UNPROVEN;",
    detector: "the facts a marker may name cover every figure the review required",
    fingerprint: "FACT_LATENT: the latent-design-flaw figure is the sum of the two states that make it up" }),
  Object.freeze({ id: "R3-X01", target: "check wiring and exit table", description: "dominant-impact gate removed from check",
    find: "if (dominant.length) return stop(EXIT.DOMINANT_IMPACT",
    replace: "if (false) return stop(EXIT.DOMINANT_IMPACT",
    placebo: "if (dominant.length > 0) return stop(EXIT.DOMINANT_IMPACT",
    detector: "S1-R5 F-01 wiring: a stored dominant impact stops runGates with exit 20",
    fingerprint: "WIRING:DOMINANT_IMPACT expected 20 got" }),
  Object.freeze({ id: "R3-X02", target: "check wiring and exit table", description: "canonical-form gate removed from check",
    find: "if (options.registerText !== undefined && options.registerText !== render(reg)) {",
    replace: "if (false) {",
    placebo: "if (options.registerText !== undefined && render(reg) !== options.registerText) {",
    detector: "S1-R5 F-01 wiring: a register in non-canonical form stops runGates with exit 14",
    fingerprint: "WIRING:NOT_CANONICAL expected 14 got" }),
  Object.freeze({ id: "R3-X03", target: "check wiring and exit table", description: "secret gate removed from check",
    find: "if (secrets.length) return stop(EXIT.SECRET_IN_DELIVERABLE",
    replace: "if (false) return stop(EXIT.SECRET_IN_DELIVERABLE",
    placebo: "if (secrets.length > 0) return stop(EXIT.SECRET_IN_DELIVERABLE",
    detector: "S1-R5 F-01 wiring: a secret in a deliverable stops runGates with exit 22",
    fingerprint: "WIRING:SECRET_IN_DELIVERABLE expected 22 got" }),
  Object.freeze({ id: "R3-X04", target: "check wiring and exit table", description: "forbidden-content gate removed from check",
    find: "if (deliverableForbidden.length) {",
    replace: "if (false) {",
    placebo: "if (deliverableForbidden.length > 0) {",
    detector: "S1-R5 F-01 wiring: an operational command in a deliverable stops runGates with exit 23",
    fingerprint: "WIRING:FORBIDDEN_IN_DELIVERABLE expected 23 got" }),
  Object.freeze({ id: "R3-X05", target: "check wiring and exit table", description: "block gate removed from check",
    find: "if (blocks.length) return stop(EXIT.BLOCK_DRIFT",
    replace: "if (false) return stop(EXIT.BLOCK_DRIFT",
    placebo: "if (blocks.length > 0) return stop(EXIT.BLOCK_DRIFT",
    detector: "S1-R5 F-01 wiring: a hand edit inside a generated block stops runGates with exit 21",
    fingerprint: "WIRING:BLOCK_DRIFT expected 21 got" }),
  Object.freeze({ id: "R3-X06", target: "check wiring and exit table", description: "summary drift reports the block-drift code",
    find: "return stop(EXIT.SUMMARY_DRIFT, \"drift between",
    replace: "return stop(EXIT.BLOCK_DRIFT, \"drift between",
    placebo: "return stop(EXIT[\"SUMMARY_DRIFT\"], \"drift between",
    detector: "S1-R5 F-01 wiring: summary drift stops runGates with exit 13",
    fingerprint: "WIRING:SUMMARY_DRIFT expected 13 got" }),
  Object.freeze({ id: "R3-X07", target: "check wiring and exit table", description: "undeclared shared exit: finding universe reports the linkage code",
    find: "return stop(EXIT.FINDING_UNIVERSE, \"the finding universe",
    replace: "return stop(EXIT.VERIFICATION_LINKAGE, \"the finding universe",
    placebo: "return stop(EXIT[\"FINDING_UNIVERSE\"], \"the finding universe",
    detector: "S1-R5 F-01 wiring: a shrunken finding universe stops runGates with exit 18",
    fingerprint: "WIRING:FINDING_UNIVERSE expected 18 got" }),
  Object.freeze({ id: "R3-X08", target: "check wiring and exit table", description: "a shared exit is no longer declared",
    find: "[EXIT.REMEDIATION_ORDER]: [\"duplicate or missing remediation ownership\", \"priority is not a severity-consistent total order\"],",
    replace: "",
    placebo: "[EXIT.REMEDIATION_ORDER]: [\"duplicate or missing remediation ownership\", \"priority is not a severity-consistent total order\"].slice(),",
    detector: "the exit table is honest: names are distinct, shared codes are declared, and nothing else is shared",
    fingerprint: "EXIT_SHARED: exactly the three shared codes are declared shared" }),
  Object.freeze({ id: "R3-X09", target: "check wiring and exit table", description: "linkage gate removed from check",
    find: "if (linkage.length) return stop(EXIT.VERIFICATION_LINKAGE",
    replace: "if (false) return stop(EXIT.VERIFICATION_LINKAGE",
    placebo: "if (linkage.length > 0) return stop(EXIT.VERIFICATION_LINKAGE",
    detector: "S1-R5 F-01 wiring: an unlinked verification method stops runGates with exit 19",
    fingerprint: "WIRING:VERIFICATION_LINKAGE expected 19 got" }),
  Object.freeze({ id: "R3-X10", target: "check wiring and exit table", description: "contradiction gate removed from check",
    find: "if (contradictions.length) {\n    return stop(EXIT.CONTRADICTION",
    replace: "if (false) {\n    return stop(EXIT.CONTRADICTION",
    placebo: "if (contradictions.length > 0) {\n    return stop(EXIT.CONTRADICTION",
    detector: "S1-R5 F-01 wiring: a contradiction of the runtime evidence stops runGates with exit 15",
    fingerprint: "WIRING:CONTRADICTION expected 15 got" }),
  Object.freeze({ id: "R4-01a", target: "secret detector", description: "the pass / pwd / passphrase families removed",
    find: "\"passwd\", \"pass\", \"pwd\", \"passphrase\",",
    replace: "\"passwd\",",
    placebo: "\"pass\", \"passwd\", \"pwd\", \"passphrase\",",
    detector: "S1-R4 FR-01: SMTP_PASS and its shapes fail; look-alike names do not",
    fingerprint: "SMTP_PASS=real-secret-value must fail" }),
  Object.freeze({ id: "R4-01b", target: "secret detector", description: "trailing qualifier segments no longer stripped",
    find: "  if (segs.length > 1 && KEY_METADATA_SUFFIXES.includes(segs[segs.length - 1])) return false;\n",
    replace: "",
    placebo: "  if (segs.length > 1 && KEY_METADATA_SUFFIXES.includes(segs.at(-1))) return false;\n",
    detector: "S1-R5 F-04: only the closed metadata suffixes and look-alike words are exempt",
    fingerprint: "NOT_SENSITIVE:" }),
  Object.freeze({ id: "R4-02", target: "secret detector", description: "text glued to a closing quote is ignored",
    find: "if (tail && !/^[,;:.)\\]}|*`'\"!?]+$/.test(tail)) {",
    replace: "if (false) {",
    placebo: "if (tail && /^[,;:.)\\]}|*`'\"!?]+$/.test(tail) === false) {",
    detector: "S1-R4 FR-02: nothing may be glued to a quoted placeholder",
    fingerprint: "AUTH_SECRET=\"SET\"realvalue must fail: text is glued to the closing quote" }),
  Object.freeze({ id: "R4-03a", target: "narrative figures", description: "the truthfulness lead types a figure instead of deriving it",
    find: "against ${disclosure} for",
    replace: "against 10 for",
    placebo: "against ${`${disclosure}`} for",
    detector: "S1-R4 FR-03: the truthfulness lead is rendered from the register",
    fingerprint: "TRUTHFULNESS_LEAD: the disclosure figure in the lead moves with the register" }),
  Object.freeze({ id: "R4-03b", target: "narrative figures", description: "the unmarked-count scan back to two intervening words",
    find: "{0,4}(?:risks?|findings?|clamps?|positive controls?)",
    replace: "{0,2}(?:risks?|findings?|clamps?|positive controls?)",
    placebo: "{0,4}(?:risks?|findings?|clamps?|positive controls?|risks?)",
    detector: "S1-R4 FR-03: a typed 'N of the M HIGH risks' claim is refused",
    fingerprint: "Eleven of the documented HIGH risks are about truthfulness\\. must be refused" }),
  Object.freeze({ id: "R4-04a", target: "renderer figures", description: "the calibration block types the positive-control count",
    find: "(the ${c.unscoredRisks} positive controls",
    replace: "(the 11 positive controls",
    placebo: "(the ${`${c.unscoredRisks}`} positive controls",
    detector: "S1-R4 FR-04: renderer figures move with the register",
    fingerprint: "the count follows the register" }),
  Object.freeze({ id: "R4-04b", target: "renderer figures", description: "the closure block types the finding count",
    find: "the register's ${reg.findings.length} and",
    replace: "the register's 161 and",
    placebo: "the register's ${[...reg.findings].length} and",
    detector: "S1-R4 FR-04: renderer figures move with the register",
    fingerprint: "CLOSURE_FIGURE: the finding count in the closure prose moves with the register" }),
  Object.freeze({ id: "R4-04c", target: "renderer figures", description: "the reachable-score count typed as 25",
    find: "of ${c.reachableScores} reachable`);",
    replace: "of 25 reachable`);",
    placebo: "of ${Number(c.reachableScores)} reachable`);",
    detector: "S1-R4 FR-04: renderer figures move with the register",
    fingerprint: "the reachable-score count is derived" }),
  Object.freeze({ id: "R4-05a", target: "forbidden content", description: "the scanner / probe rule neutered",
    find: "name: \"SCANNER_OR_PROBE_COMMAND\",\n    rx: ",
    replace: "name: \"SCANNER_OR_PROBE_COMMAND\",\n    rx: /ZZZ_NEVER/, was: ",
    placebo: "name: \"SCANNER_OR_PROBE_COMMAND\",\n    \"rx\": ",
    detector: "S1-R5 F-05: a wrapped system path or a probe command fails in Markdown and at every JSON level",
    fingerprint: "WRAPPED:dig A markdown" }),
  Object.freeze({ id: "R4-05b", target: "forbidden content", description: "the var/log, usr and proc roots dropped from the system-path rule",
    find: "\\/(?:etc|usr|proc|opt|srv|var\\/(?:log|lib))\\/[\\p{L}\\p{N}._~-]|file:",
    replace: "\\/(?:etc|opt|srv|var\\/lib)\\/[\\p{L}\\p{N}._~-]|file:",
    placebo: "\\/(?:etc|usr|proc|opt|srv|var\\/(?:lib|log))\\/[\\p{L}\\p{N}._~-]|file:",
    detector: "S1-R5 F-05: a wrapped system path or a probe command fails in Markdown and at every JSON level",
    fingerprint: "WRAPPED:bold markdown" }),
  Object.freeze({ id: "R4-07a", target: "secret detector", description: "a connection string must name a user again",
    find: "[A-Za-z0-9._%-]*:([^\\s@\"'<>/]+)@/i",
    replace: "[A-Za-z0-9._%-]+:([^\\s@\"'<>/]+)@/i",
    placebo: "[A-Za-z0-9._%-]*:([^\\s@\"'<>\\/]+)@/i",
    detector: "S1-R4 FR-07: credential-bearing Redis URLs fail; credential-free and placeholder ones pass",
    fingerprint: "redis://:pw@host:6379 must fail" }),
  Object.freeze({ id: "R4-07b", target: "secret detector", description: "every connection-string password exempt",
    find: "exempt: (m) => isPlaceholderValue(m[1]),",
    replace: "exempt: () => true,",
    placebo: "exempt: (m) => Boolean(isPlaceholderValue(m[1])),",
    detector: "S1-R4 FR-07: credential-bearing Redis URLs fail; credential-free and placeholder ones pass",
    fingerprint: "redis://:pw@host:6379 must fail" }),
  Object.freeze({ id: "R4-08", target: "check wiring and exit table", description: "the entry point compared as raw strings again",
    find: "return fold(real(resolve(argv1))) === fold(real(fileURLToPath(moduleUrl)));",
    replace: "return resolve(argv1) === fileURLToPath(moduleUrl);",
    placebo: "return fold(real(fileURLToPath(moduleUrl))) === fold(real(resolve(argv1)));",
    detector: "S1-R4 FR-08: the checker run through a junction or symlink still checks",
    fingerprint: "ENTRYPOINT_LINK: a path through a link and the real module are the same program" }),
  Object.freeze({ id: "R4-10", target: "block parser and drift", description: "a non-canonical block marker line accepted",
    find: "if (raw !== canonical) violations.push(",
    replace: "if (false) violations.push(",
    placebo: "if (!(raw === canonical)) violations.push(",
    detector: "S1-R4 FR-10: a block marker line must be exactly canonical",
    fingerprint: "leading space on an opening marker on summary must be refused" }),
  Object.freeze({ id: "R4-11", target: "check wiring and exit table", description: "an internal failure exits 1 like a missing file",
    find: "    process.stderr.write(formatInternalError(e));\n    process.exit(EXIT.INTERNAL_ERROR);",
    replace: "    process.stderr.write(formatInternalError(e));\n    process.exit(1);",
    placebo: "    process.stderr.write(formatInternalError(e));\n    process.exit(EXIT[\"INTERNAL_ERROR\"]);",
    detector: "S1-R4 FR-11: an internal failure exits 70 without a stack trace",
    fingerprint: "no risks at all: expected 70, got 1" }),
  Object.freeze({ id: "R4-12a", target: "mutation manifest", description: "the manifest gate removed from check",
    find: "if (mutation.length) return stop(EXIT.MUTATION_MANIFEST",
    replace: "if (false) return stop(EXIT.MUTATION_MANIFEST",
    placebo: "if (mutation.length > 0) return stop(EXIT.MUTATION_MANIFEST",
    detector: "S1-R5 F-01 wiring: a mutation record that is not a targeted kill stops runGates with exit 25",
    fingerprint: "WIRING:MUTATION_MANIFEST expected 25 got" }),
  Object.freeze({ id: "R4-12b", target: "mutation manifest", description: "a campaign recorded against a different manifest accepted",
    find: "if (campaign.manifestSha256 !== sha) {",
    replace: "if (false) {",
    placebo: "if (!(campaign.manifestSha256 === sha)) {",
    detector: "S1-R4 FR-12 / S1-R5 F-01: the mutation manifest is bound, current, and every mutant is a TARGETED_KILL",
    fingerprint: "MANIFEST_GATE:BINDING" }),
  Object.freeze({ id: "R4-12c", target: "mutation manifest", description: "a recorded survivor accepted",
    find: "if (status !== \"TARGETED_KILL\") {",
    replace: "if (false) {",
    placebo: "if (status !== `TARGETED_KILL`) {",
    detector: "S1-R4 FR-12 / S1-R5 F-01: the mutation manifest is bound, current, and every mutant is a TARGETED_KILL",
    fingerprint: "MANIFEST_GATE:STATUS" }),
  Object.freeze({ id: "R4-12d", target: "mutation manifest", description: "a stale anchor accepted",
    find: "if (count !== 1) {",
    replace: "if (false) {",
    placebo: "if (!(count === 1)) {",
    detector: "S1-R4 FR-12 / S1-R5 F-01: the mutation manifest is bound, current, and every mutant is a TARGETED_KILL",
    fingerprint: "MANIFEST_GATE:STALE" }),
  Object.freeze({ id: "R4-M15", target: "secret detector", description: "raw token-shape scan removed from a register that parses",
    find: "  for (const h of secretShapeHits(registerText, label)) hits.push({ ...h, level: \"RAW\" });\n",
    replace: "",
    placebo: "for (const h of secretShapeHits(registerText, label)) hits.push({ ...h, level: `RAW` });\n",
    detector: "S1-R5 M15: a token shape that only a duplicated JSON key carries is caught at the RAW level",
    fingerprint: "RAW_ONLY:SHAPE" }),
  Object.freeze({ id: "R5-03a", target: "secret detector", description: "the decoded scan of property NAMES removed from the secret detector",
    find: "  const keyLimit = walkJsonKeys(parsed, (path, key) => {\n    for (const h of secretShapeHits(key, label)) hits.push({ ...h, level: \"STRUCTURED_KEY\", path });\n    for (const h of assignedSecretHits(key)) hits.push({ ...h, where: label, level: \"STRUCTURED_KEY\", path });\n  });\n",
    replace: "  const keyLimit = null;\n",
    placebo: "  const keyLimit = walkJsonKeys(parsed, (path, key) => {\n    for (const h of assignedSecretHits(key)) hits.push({ ...h, where: label, level: \"STRUCTURED_KEY\", path });\n    for (const h of secretShapeHits(key, label)) hits.push({ ...h, level: \"STRUCTURED_KEY\", path });\n  });\n",
    detector: "S1-R5 F-03: every property NAME is scanned decoded, with its path, for secret shapes and assignments",
    fingerprint: "KEY_SECRET:" }),
  Object.freeze({ id: "R5-03b", target: "forbidden content", description: "the decoded scan of property NAMES removed from the forbidden-content detector",
    find: "  const keyLimit = walkJsonKeys(parsed, (path, key) => {\n    for (const h of reportForbiddenHits(key, label)) hits.unshift({ ...h, level: \"STRUCTURED_KEY\", path });\n  });\n",
    replace: "  const keyLimit = null;\n",
    placebo: "  const keyLimit = walkJsonKeys(parsed, (path, key) => {\n    for (const h of reportForbiddenHits(key, label)) hits.unshift({ ...h, path, level: \"STRUCTURED_KEY\" });\n  });\n",
    detector: "S1-R5 F-03: every property NAME is scanned for forbidden content at the STRUCTURED_KEY level",
    fingerprint: "KEY_FORBIDDEN:" }),
  Object.freeze({ id: "R5-03c", target: "secret detector", description: "the key walk no longer descends into arrays (S1-FA-02: array traversal removed)",
    find: "      for (let i = 0; i < node.length; i += 1) children.push({ node: node[i], path: `${path}[${i}]`, depth: depth + 1 });",
    replace: "      // arrays are not descended",
    placebo: "      for (let i = 0; node.length > i; i += 1) children.push({ node: node[i], path: `${path}[${i}]`, depth: depth + 1 });",
    detector: "S1-R5 F-03: every property NAME is scanned decoded, with its path, for secret shapes and assignments",
    fingerprint: "KEY_SECRET:" }),
  Object.freeze({ id: "R5-04a", target: "secret detector", description: "only the WHOLE key name judged, so a qualifier hides the family again",
    find: "  for (let end = segs.length; end >= 1; end -= 1) {",
    replace: "  for (let end = segs.length; end >= segs.length; end -= 1) {",
    placebo: "  for (let end = segs.length; end > 0; end -= 1) {",
    detector: "S1-R5 F-04: an unknown qualifier after a credential family stays sensitive in every syntax",
    fingerprint: "QUALIFIER:" }),
  Object.freeze({ id: "R5-05a", target: "forbidden content", description: "the closed wrapper allowlist restored: only listed wrappers may precede a system path (S1-FA-05)",
    find: "(?<![\\p{L}\\p{N}.~\\/-])\\/(?:etc|usr|proc",
    replace: "(?:^|[\\s\"'(`=:*|[>~])\\/(?:etc|usr|proc",
    placebo: "(?<![\\p{N}\\p{L}.~\\/-])\\/(?:etc|usr|proc",
    detector: "S1-FA-05: a system path is found whatever wraps it — prose, code span, table cell, emphasis, and every JSON level",
    fingerprint: "SYSPATH:\\{/etc/passwd\\}" }),
  Object.freeze({ id: "R5-05b", target: "forbidden content", description: "a DNS record type no longer makes dig an invocation",
    find: "|(?:A|AAAA|MX|NS|TXT|CNAME|SOA|PTR|SRV|CAA|ANY)\\s+\\S)",
    replace: ")",
    placebo: "|(?:AAAA|A|MX|NS|TXT|CNAME|SOA|PTR|SRV|CAA|ANY)\\s+\\S)",
    detector: "S1-R5 F-05: a wrapped system path or a probe command fails in Markdown and at every JSON level",
    fingerprint: "WRAPPED:dig " }),
  Object.freeze({ id: "R5-05c", target: "forbidden content", description: "the dotted `testssl.sh` invocation dropped from the scanner rule",
    find: "\\btestssl\\.sh\\s+\\S|",
    replace: "",
    placebo: "\\btestssl\\.sh[\\s]+\\S|",
    detector: "S1-R5 F-05: a wrapped system path or a probe command fails in Markdown and at every JSON level",
    fingerprint: "WRAPPED:testssl.sh" }),
  Object.freeze({ id: "R5-C01", target: "mutation classifier", description: "a red suite counted as the named test failing",
    find: "const namedFailed = named.state === \"not ok\";",
    replace: "const namedFailed = mutant.code !== 0;",
    placebo: "const namedFailed = !(named.state === \"ok\");",
    detector: "S1-R5 F-02 classifier: a green named test is SURVIVED even when another test fails",
    fingerprint: "CLASSIFY:OTHER_TEST_RED" }),
  Object.freeze({ id: "R5-C02", target: "mutation classifier", description: "the failure fingerprint no longer checked",
    find: "if (!new RegExp(entry.fingerprint).test(named.text)) return { status: \"ONLY_INCIDENTAL\", reason: \"the failure does not carry the fingerprint\" };",
    replace: "if (false) return { status: \"ONLY_INCIDENTAL\", reason: \"the failure does not carry the fingerprint\" };",
    placebo: "if (new RegExp(entry.fingerprint).test(named.text) === false) return { status: \"ONLY_INCIDENTAL\", reason: \"the failure does not carry the fingerprint\" };",
    detector: "S1-R5 F-02 classifier: a failure without the fingerprint is ONLY_INCIDENTAL",
    fingerprint: "CLASSIFY:NO_FINGERPRINT" }),
  Object.freeze({ id: "R5-C03", target: "mutation classifier", description: "the placebo control removed",
    find: "if (!control || control.state !== \"ok\") return { status: \"INVALID_MUTANT\", reason: \"the placebo did not stay green\" };",
    replace: "if (false) return { status: \"INVALID_MUTANT\", reason: \"the placebo did not stay green\" };",
    placebo: "if (!control || !(control.state === \"ok\")) return { status: \"INVALID_MUTANT\", reason: \"the placebo did not stay green\" };",
    detector: "S1-R5 F-02 classifier: a red placebo voids the kill",
    fingerprint: "CLASSIFY:PLACEBO_RED" }),
  Object.freeze({ id: "R5-C04", target: "mutation classifier", description: "the manifest-gate exclusion removed, so an incidental failure counts",
    find: "if (INCIDENTAL_FAILURE_RX.test(named.text)) return { status: \"ONLY_INCIDENTAL\", reason: \"the failure came through the manifest gate\" };",
    replace: "if (false) return { status: \"ONLY_INCIDENTAL\", reason: \"the failure came through the manifest gate\" };",
    placebo: "if (INCIDENTAL_FAILURE_RX.test(String(named.text))) return { status: \"ONLY_INCIDENTAL\", reason: \"the failure came through the manifest gate\" };",
    detector: "S1-R5 F-02 classifier: a failure that only reaches exit 25 is ONLY_INCIDENTAL",
    fingerprint: "CLASSIFY:EXIT_25" }),
  Object.freeze({ id: "R5-C05", target: "mutation classifier", description: "the setup-failure exclusion removed",
    find: "if (SETUP_FAILURE_RX.test(named.text)) return { status: \"INVALID_MUTANT\", reason: \"a setup failure, not behaviour\" };",
    replace: "if (false) return { status: \"INVALID_MUTANT\", reason: \"a setup failure, not behaviour\" };",
    placebo: "if (SETUP_FAILURE_RX.test(String(named.text))) return { status: \"INVALID_MUTANT\", reason: \"a setup failure, not behaviour\" };",
    detector: "S1-R5 F-02 classifier: a setup error is INVALID_MUTANT, never a kill",
    fingerprint: "CLASSIFY:SETUP" }),
  Object.freeze({ id: "R5-C06", target: "mutation campaign", description: "a deviation no longer fails the campaign",
    find: "  const deviations = results.filter((r) => (r.kind === \"mutant\" ? r.status !== \"TARGETED_KILL\" : r.status !== r.expected)).length;",
    replace: "  const deviations = 0;",
    placebo: "  const deviations = results.filter((r) => (r.kind === \"mutant\" ? !(r.status === \"TARGETED_KILL\") : r.status !== r.expected)).length;",
    detector: "S1-R5 F-02 campaign: anything but a TARGETED_KILL makes the campaign exit non-zero",
    fingerprint: "CAMPAIGN:" }),
  Object.freeze({ id: "R5-C07", target: "mutation campaign", description: "a filtered-out test read as a result",
    find: "    if (m[3]) continue; // filtered out or skipped: not run",
    replace: "    if (false) continue; // filtered out or skipped: not run",
    placebo: "    if (Boolean(m[3])) continue; // filtered out or skipped: not run",
    detector: "S1-R5 F-02 tap: the parser keeps ok and not ok results, drops skipped ones, and never reads the stack",
    fingerprint: "TAP:SKIP" }),
  Object.freeze({ id: "R5-C08", target: "mutation campaign", description: "the stack frames read as failure evidence",
    find: "    if (key) skipping = key[1] === \"stack\" || key[1] === \"location\";",
    replace: "    if (key) skipping = false;",
    placebo: "    if (key) skipping = [\"stack\", \"location\"].includes(key[1]);",
    detector: "S1-R5 F-02 tap: the parser keeps ok and not ok results, drops skipped ones, and never reads the stack",
    fingerprint: "TAP:STACK" }),
  Object.freeze({ id: "R5-C09", target: "mutation campaign", description: "the rebinding no longer verified before it is used",
    find: "  const ok = mutationManifestViolations(source, kept, rebound, keptControls).length === 0;",
    replace: "  const ok = true;",
    placebo: "  const ok = mutationManifestViolations(source, kept, rebound, keptControls).length < 1;",
    detector: "S1-R5 F-01 rebinding: a copy is rebound by metadata only, and the placebo copy is rebound the same way",
    fingerprint: "REBIND:" }),
  Object.freeze({ id: "R5-C10", target: "mutation campaign", description: "the rebinding keeps entries whose anchors the change removed",
    find: "  const kept = manifest.filter((e) => e.id !== targetId && applyMutation(changedSource, e).count === 1);",
    replace: "  const kept = manifest.filter((e) => e.id !== targetId);",
    placebo: "  const kept = manifest.filter((e) => e.id !== targetId && applyMutation(changedSource, e).count !== 0 && applyMutation(changedSource, e).count < 2);",
    detector: "S1-R5 F-01 rebinding: a copy is rebound by metadata only, and the placebo copy is rebound the same way",
    fingerprint: "REBIND:" }),
  Object.freeze({ id: "R5-I02a", target: "review closure", description: "the open-finding rule neutered, so no status is ever open",
    find: "  return closure.filter(([, , status]) => !REVIEW_CLOSED_STATUSES.includes(status)).map(",
    replace: "  return closure.filter(() => false).map(",
    placebo: "  return closure.filter(([, , status]) => REVIEW_CLOSED_STATUSES.includes(status) === false).map(",
    detector: "S1-R5 I-02: an open review finding changes the closure text and turns the gate red",
    fingerprint: "REVIEW_GATE:" }),
  Object.freeze({ id: "R5-I02b", target: "review closure", description: "the closure sentence typed instead of derived",
    find: "`${open.length === 0 ? \"No review finding is OPEN.\" :",
    replace: "`${true ? \"No review finding is OPEN.\" :",
    placebo: "`${open.length < 1 ? \"No review finding is OPEN.\" :",
    detector: "S1-R5 I-02: an open review finding changes the closure text and turns the gate red",
    fingerprint: "REVIEW_TEXT:" }),
  Object.freeze({ id: "R5-I03a", target: "error reporting", description: "an unquoted path is redacted only up to the first whitespace again (S1-FA-03)",
    find: "      if (m) return `${out}${rest.slice(0, m.index)}<path>`;",
    replace: "      if (m) { out += `${rest.slice(0, m.index)}<path>${rest.slice(m.index).replace(/^\\S*/, \"\")}`; i += rest.length; continue; }",
    placebo: "      if (m) return out + rest.slice(0, m.index) + \"<path>\";",
    detector: "S1-FA-03: a path with spaces is redacted whole — quoted, unquoted, UNC, POSIX, Unicode, several in one message",
    fingerprint: "REDACT:Windows path with a space, unquoted leaks" }),
  Object.freeze({ id: "R5-I03b", target: "error reporting", description: "the missing-register message carries the absolute path again",
    find: "    process.stderr.write(\"[s1-risk-register] missing docs/security/s1-risk-register.json\\n\");",
    replace: "    process.stderr.write(`[s1-risk-register] missing ${path}\\n`);",
    placebo: "    process.stderr.write(`[s1-risk-register] missing docs/security/s1-risk-register.json\\n`);",
    detector: "S1-R5 I-03: a missing register exits 1 and prints no absolute path and no stack trace",
    fingerprint: "MISSING:" }),
  Object.freeze({ id: "R5-I04a", target: "secret detector", description: "a leading underscore hides a credential name again",
    find: "([\"']?)(_*[A-Za-z]",
    replace: "([\"']?)([A-Za-z]",
    placebo: "([\"']?)(_{0,}[A-Za-z]",
    detector: "S1-R5 I-04: leading underscores do not hide a credential name",
    fingerprint: "UNDERSCORE:" }),
  Object.freeze({ id: "R5-I05a", target: "secret detector", description: "the valkey, memcached, ldap and http schemes dropped from the URI rule",
    find: "|rediss?|valkeys?|memcached|amqps?|ldaps?|https?)",
    replace: "|rediss?|amqps?)",
    placebo: "|rediss?|valkeys?|memcached|ldaps?|amqps?|https?)",
    detector: "S1-R5 I-05: credentials in URI userinfo fail for every scheme; credential-free and placeholder URIs pass",
    fingerprint: "URI:" }),
  Object.freeze({ id: "FA-01a", target: "secret detector", description: "trailing digits no longer split off a segment",
    find: ".map((s) => s.replace(/\\d+$/, \"\"))",
    replace: ".map((s) => s)",
    placebo: ".map((s) => s.replace(/[0-9]+$/, \"\"))",
    detector: "S1-FA-01: a credential name with digits glued to its family fails in every syntax and at every register level",
    fingerprint: "DIGITS:AUTH_SECRET2 must be sensitive" }),
  Object.freeze({ id: "FA-01b", target: "secret detector", description: "only a digit segment after an underscore is dropped, a glued number is kept",
    find: ".map((s) => s.replace(/\\d+$/, \"\"))",
    replace: ".map((s) => s.replace(/^\\d+$/, \"\"))",
    placebo: ".map((s) => s.replace(/\\d{1,}$/, \"\"))",
    detector: "S1-FA-01: a credential name with digits glued to its family fails in every syntax and at every register level",
    fingerprint: "DIGITS:AUTH_SECRET2 must be sensitive" }),
  Object.freeze({ id: "FA-01c", target: "secret detector", description: "camelCase no longer split into segments",
    find: ".replace(/([a-z0-9])([A-Z])/g, \"$1_$2\")\n    .replace(/[-.]/g, \"_\")",
    replace: ".replace(/[-.]/g, \"_\")",
    placebo: ".replace(/([a-z\\d])([A-Z])/g, \"$1_$2\")\n    .replace(/[-.]/g, \"_\")",
    detector: "S1-FA-01: a credential name with digits glued to its family fails in every syntax and at every register level",
    fingerprint: "DIGITS:smtpPass2026 must be sensitive" }),
  Object.freeze({ id: "FA-01d", target: "secret detector", description: "a family matched as a substring of the name",
    find: "    if (SENSITIVE_KEY_SUFFIX_RX.test(segs.slice(0, end).join(\"_\"))) return true;",
    replace: "    if (SENSITIVE_KEY_FAMILIES.some((f) => segs.slice(0, end).join(\"_\").includes(f))) return true;",
    placebo: "    if (SENSITIVE_KEY_SUFFIX_RX.test(segs.slice(0, end).join(\"_\")) === true) return true;",
    detector: "S1-FA-01: digits never make an ordinary word a credential name",
    fingerprint: "DIGITS_NEGATIVE:PASSPORT2" }),
  Object.freeze({ id: "FA-I2a", target: "secret detector", description: "the compact-name rule removed",
    find: "  return segs.some((s) => COMPACT_SENSITIVE_RX.test(s));",
    replace: "  return false;",
    placebo: "  return segs.some((s) => COMPACT_SENSITIVE_RX.test(s) === true);",
    detector: "S1-FA I2: dotted and compact credential names fail; words that merely contain a family do not",
    fingerprint: "COMPACT:JWTSECRET must be sensitive" }),
  Object.freeze({ id: "FA-I2b", target: "secret detector", description: "a dot no longer joins two segments of a name",
    find: ".replace(/[-.]/g, \"_\")",
    replace: ".replace(/-/g, \"_\")",
    placebo: ".replace(/[.-]/g, \"_\")",
    detector: "S1-FA I2: dotted and compact credential names fail; words that merely contain a family do not",
    fingerprint: "COMPACT:jwt.secret.legacy must be sensitive" }),
  Object.freeze({ id: "FA-I2c", target: "secret detector", description: "the assignment key stops at a dot",
    find: "(?:\\.[A-Za-z0-9_-]+)*)\\1",
    replace: ")\\1",
    placebo: "(?:[.][A-Za-z0-9_-]+)*)\\1",
    detector: "S1-FA I2: dotted and compact credential names fail; words that merely contain a family do not",
    fingerprint: "COMPACT:jwt.secret.legacy as env" }),
  Object.freeze({ id: "FA-02a", target: "structure walk", description: "the value walk skips past depth 64 again, quietly",
    find: "    const { node, path, depth } = task;\n    nodes += 1;\n    if (nodes > limits.maxNodes) return structureLimitViolation(\"nodes\", limits.maxNodes, path);\n    if (depth > limits.maxDepth) return structureLimitViolation(\"depth\", limits.maxDepth, path);",
    replace: "    const { node, path, depth } = task;\n    nodes += 1;\n    if (nodes > limits.maxNodes) return structureLimitViolation(\"nodes\", limits.maxNodes, path);\n    if (depth > 64) continue;",
    placebo: "    const { node, path, depth } = task;\n    nodes += 1;\n    if (nodes > limits.maxNodes) return structureLimitViolation(\"nodes\", limits.maxNodes, path);\n    if (limits.maxDepth < depth) return structureLimitViolation(\"depth\", limits.maxDepth, path);",
    detector: "S1-FA-02: a secret or a command nested 60, 64, 65 and 128 levels deep is a real finding, with its path",
    fingerprint: "DEPTH:64 a secret value is found" }),
  Object.freeze({ id: "FA-02b", target: "structure walk", description: "a key walk past the budget returns as if complete",
    find: "    const { node, path, depth, key } = stack.pop();\n    nodes += 1;\n    if (nodes > limits.maxNodes) return structureLimitViolation(\"nodes\", limits.maxNodes, path);\n    if (depth > limits.maxDepth) return structureLimitViolation(\"depth\", limits.maxDepth, path);",
    replace: "    const { node, path, depth, key } = stack.pop();\n    nodes += 1;\n    if (nodes > limits.maxNodes) return structureLimitViolation(\"nodes\", limits.maxNodes, path);\n    if (depth > limits.maxDepth) return null;",
    placebo: "    const { node, path, depth, key } = stack.pop();\n    nodes += 1;\n    if (nodes > limits.maxNodes) return structureLimitViolation(\"nodes\", limits.maxNodes, path);\n    if (depth > limits.maxDepth) return structureLimitViolation(\"depth\", limits.maxDepth, String(path));",
    detector: "S1-FA-02: an object inside arrays at depth is walked, and the walk stops only at the budget, loudly",
    fingerprint: "BUDGET:one level past the budget is a violation" }),
  Object.freeze({ id: "FA-02c", target: "structure walk", description: "the key walk skips past depth 64 again, quietly",
    find: "    const { node, path, depth, key } = stack.pop();\n    nodes += 1;\n    if (nodes > limits.maxNodes) return structureLimitViolation(\"nodes\", limits.maxNodes, path);\n    if (depth > limits.maxDepth) return structureLimitViolation(\"depth\", limits.maxDepth, path);",
    replace: "    const { node, path, depth, key } = stack.pop();\n    nodes += 1;\n    if (nodes > limits.maxNodes) return structureLimitViolation(\"nodes\", limits.maxNodes, path);\n    if (depth > 64) continue;",
    placebo: "    const { node, path, depth, key } = stack.pop();\n    nodes += 1;\n    if (limits.maxNodes < nodes) return structureLimitViolation(\"nodes\", limits.maxNodes, path);\n    if (depth > limits.maxDepth) return structureLimitViolation(\"depth\", limits.maxDepth, path);",
    detector: "S1-FA-02: a secret or a command nested 60, 64, 65 and 128 levels deep is a real finding, with its path",
    fingerprint: "DEPTH:64 a secret property name is found" }),
  Object.freeze({ id: "FA-02d", target: "structure walk", description: "a property's path is not propagated to its subtree",
    find: "children.push({ node: v, path: `${path}[${JSON.stringify(k)}]`, depth: depth + 1, key: k })",
    replace: "children.push({ node: v, path, depth: depth + 1, key: k })",
    placebo: "children.push({ node: v, path: path + `[${JSON.stringify(k)}]`, depth: depth + 1, key: k })",
    detector: "S1-FA-02: an object inside arrays at depth is walked, and the walk stops only at the budget, loudly",
    fingerprint: "DEPTH_ARRAY:its path names every array level" }),
  Object.freeze({ id: "FA-02e", target: "check wiring and exit table", description: "the structure gate removed from runGates",
    find: "  if (structure.length) return stop(EXIT.STRUCTURE_LIMIT,",
    replace: "  if (false) return stop(EXIT.STRUCTURE_LIMIT,",
    placebo: "  if (structure.length !== 0) return stop(EXIT.STRUCTURE_LIMIT,",
    detector: "S1-FA-02 wiring: a register past the structure budget stops runGates with exit 27 before any other gate",
    fingerprint: "WIRING:STRUCTURE_LIMIT expected 27 got" }),
  Object.freeze({ id: "FA-03b", target: "error reporting", description: "a quoted path is no longer redacted as one span",
    find: "      if (j !== -1 && ABSOLUTE_PATH_START_RX.test(line.slice(i + 1, j))) {",
    replace: "      if (false) {",
    placebo: "      if (j > -1 && ABSOLUTE_PATH_START_RX.test(line.slice(i + 1, j))) {",
    detector: "S1-FA-03: a path with spaces is redacted whole — quoted, unquoted, UNC, POSIX, Unicode, several in one message",
    fingerprint: "REDACT_KEPT:" }),
  Object.freeze({ id: "FA-03c", target: "error reporting", description: "a UNC path no longer starts a path",
    find: "${DRIVE_PATH_START}|${UNC_PATH_START}|",
    replace: "${DRIVE_PATH_START}|",
    placebo: "${DRIVE_PATH_START}|${String(UNC_PATH_START)}|",
    detector: "S1-FA-03: a path with spaces is redacted whole — quoted, unquoted, UNC, POSIX, Unicode, several in one message",
    fingerprint: "REDACT:UNC path with a space, unquoted leaks" }),
  Object.freeze({ id: "FA-03d", target: "error reporting", description: "an internal error printed without redaction",
    find: "internal error: ${redactPaths(String(e?.message ?? e).split(\"\\n\")[0]).slice(0, 200)}",
    replace: "internal error: ${String(e?.message ?? e).split(\"\\n\")[0].slice(0, 200)}",
    placebo: "internal error: ${redactPaths(String(e?.message ?? e).split(\"\\n\")[0]).substring(0, 200)}",
    detector: "S1-FA-03: the real command line prints an internal error with every path redacted and no stack trace",
    fingerprint: "CLI_REDACT:" }),
  Object.freeze({ id: "FA-03e", target: "error reporting", description: "an unreadable register prints the parser's quotation of the file",
    find: "  } catch {\n    // S1-FA-03: a known file failure prints a fixed logical message. The parser's own\n    // text quotes the file's first characters, and those can be a path or a secret.\n    process.stderr.write(\"[s1-risk-register] internal error: docs/security/s1-risk-register.json is not readable JSON\\n\");",
    replace: "  } catch (e) {\n    // S1-FA-03: a known file failure prints a fixed logical message. The parser's own\n    // text quotes the file's first characters, and those can be a path or a secret.\n    process.stderr.write(`[s1-risk-register] internal error: ${e.message}\\n`);",
    placebo: "  } catch {\n    // S1-FA-03: a known file failure prints a fixed logical message. The parser's own\n    // text quotes the file's first characters, and those can be a path or a secret.\n    process.stderr.write(`[s1-risk-register] internal error: docs/security/s1-risk-register.json is not readable JSON\\n`);",
    detector: "S1-FA-03: a register that is not JSON prints a fixed logical message, never the parser's quotation of it",
    fingerprint: "FIXED_MESSAGE:" }),
  Object.freeze({ id: "FA-04a", target: "assertion ledger", description: "a test that made no assertion no longer fails",
    find: "      if (record.count === 0) throw new Error(",
    replace: "      if (false) throw new Error(",
    placebo: "      if (record.count < 1) throw new Error(",
    detector: "S1-FA-04: the ledger fails exactly the tests that run no assertion, whatever their source text looks like",
    fingerprint: "LEDGER:F01 no assertion before a helper that asserts expected not ok got ok" }),
  Object.freeze({ id: "FA-04b", target: "assertion ledger", description: "one record shared by every test, so an earlier test's assertions count for a later one",
    find: "      const record = { name, count: 0 };\n      executed.set(name, record);",
    replace: "      const record = executed.get(\"*\") ?? { name, count: 0 };\n      executed.set(\"*\", record);\n      executed.set(name, record);",
    placebo: "      const record = { count: 0, name };\n      executed.set(name, record);",
    detector: "S1-FA-04: the ledger fails exactly the tests that run no assertion, whatever their source text looks like",
    fingerprint: "LEDGER:F01 no assertion before a helper that asserts expected not ok got ok" }),
  Object.freeze({ id: "FA-04c", target: "assertion ledger", description: "a direct assert() call is not counted",
    find: "    apply(target, thisArg, args) {\n      credit();",
    replace: "    apply(target, thisArg, args) {",
    placebo: "    apply(target, thisArg, args) {\n      credit(); // a direct call counts",
    detector: "S1-FA-04: the ledger fails exactly the tests that run no assertion, whatever their source text looks like",
    fingerprint: "LEDGER:F12 a direct assert\\(\\) call expected ok got not ok" }),
  Object.freeze({ id: "FA-04d", target: "assertion ledger", description: "an assertion is credited to the test started last, not to the test that made it",
    find: "    const record = current.getStore();",
    replace: "    const record = [...executed.values()].at(-1);",
    placebo: "    const record = current.getStore() ?? undefined;",
    detector: "S1-FA-04: the ledger fails exactly the tests that run no assertion, whatever their source text looks like",
    fingerprint: "LEDGER:F14 a silent test running while another test" }),
  Object.freeze({ id: "FA-04e", target: "assertion ledger", description: "registered tests are not recorded, so the reconciliation has nothing to compare",
    find: "    registered.push(name);",
    replace: "",
    placebo: "    registered.push(name); // recorded for the reconciliation",
    detector: "S1-FA-04: the ledger fails exactly the tests that run no assertion, whatever their source text looks like",
    fingerprint: "LEDGER:F99 reconcile expected ok got not ok" }),
  Object.freeze({ id: "FA-05b", target: "forbidden content", description: "a file URI no longer names a system path",
    find: "|file:\\/\\/(?:localhost)?\\/(?:etc|usr|proc|opt|srv|var\\/(?:log|lib))\\/[\\p{L}\\p{N}._~-]/u,",
    replace: "/u,",
    placebo: "|file:\\/\\/(?:localhost)?\\/(?:etc|usr|proc|opt|srv|var\\/(?:lib|log))\\/[\\p{L}\\p{N}._~-]/u,",
    detector: "S1-FA-05: a system path is found whatever wraps it — prose, code span, table cell, emphasis, and every JSON level",
    fingerprint: "SYSPATH:file:///etc/passwd" }),
  Object.freeze({ id: "FA-05c", target: "forbidden content", description: "the etc root dropped from the system-path rule",
    find: "\\/(?:etc|usr|proc|opt|srv|var\\/(?:log|lib))\\/[\\p{L}\\p{N}._~-]|file:",
    replace: "\\/(?:usr|proc|opt|srv|var\\/(?:log|lib))\\/[\\p{L}\\p{N}._~-]|file:",
    placebo: "\\/(?:usr|etc|proc|opt|srv|var\\/(?:log|lib))\\/[\\p{L}\\p{N}._~-]|file:",
    detector: "S1-FA-05: a system path is found whatever wraps it — prose, code span, table cell, emphasis, and every JSON level",
    fingerprint: "SYSPATH:\\{/etc/passwd\\}" }),
  Object.freeze({ id: "FA-05d", target: "forbidden content", description: "the end-of-segment boundary removed, so a longer name matches",
    find: "var\\/(?:log|lib))\\/[\\p{L}\\p{N}._~-]|file:",
    replace: "var\\/(?:log|lib))|file:",
    placebo: "var\\/(?:log|lib))\\/[\\p{N}\\p{L}._~-]|file:",
    detector: "S1-FA-05: URLs, relative paths and words that are not system paths pass",
    fingerprint: "SYSPATH_NEGATIVE:/etcetera/x" }),
  Object.freeze({ id: "FA-I1a", target: "forbidden content", description: "hydra dropped from the extended probe rule",
    find: "sqlmap|sslscan|hydra|ncat)",
    replace: "sqlmap|sslscan|ncat)",
    placebo: "sqlmap|sslscan|(?:hydra)|ncat)",
    detector: "S1-FA I1: nikto, sqlmap, sslscan, hydra, ncat and ss in command position fail in Markdown and at every JSON level",
    fingerprint: "PROBE:hydra" }),
  Object.freeze({ id: "FA-I1b", target: "forbidden content", description: "ss dropped from the extended probe rule",
    find: "|(?<![\\w.\\/-])ss\\s+-[A-Za-z]{1,8}\\b/,",
    replace: "/,",
    placebo: "|(?<![\\w.\\/-])ss\\s+-[a-zA-Z]{1,8}\\b/,",
    detector: "S1-FA I1: nikto, sqlmap, sslscan, hydra, ncat and ss in command position fail in Markdown and at every JSON level",
    fingerprint: "PROBE:ss -tlnp" }),
  Object.freeze({ id: "FA-I1c", target: "forbidden content", description: "ss matched inside any word, without a boundary",
    find: "(?<![\\w.\\/-])ss\\s+-",
    replace: "ss\\s+-",
    placebo: "(?<![.\\w\\/-])ss\\s+-",
    detector: "S1-FA I1: prose that names the same tools passes",
    fingerprint: "PROBE_NEGATIVE:a class -based design" }),
]);
export const PLACEBO_CONTROLS = Object.freeze([
  Object.freeze({ id: "C-01", kind: "SEMANTIC_NOOP", description: "the secret gate's condition rewritten with the same meaning",
    find: "if (secrets.length) return stop(EXIT.SECRET_IN_DELIVERABLE",
    replace: "if (secrets.length !== 0) return stop(EXIT.SECRET_IN_DELIVERABLE",
    detector: "S1-R5 F-01 wiring: a secret in a deliverable stops runGates with exit 22",
    fingerprint: "WIRING:SECRET_IN_DELIVERABLE expected 22 got",
    expected: "SURVIVED", inRegion: false }),
  Object.freeze({ id: "C-02", kind: "COMMENT_OR_WHITESPACE", description: "a comment above the same gate rewritten",
    find: "  // before the report gates: Appendix E renders this data, so a stale record would",
    replace: "  // before the report gates (this comment is rewritten by a placebo control), because",
    detector: "S1-R5 F-01 wiring: a secret in a deliverable stops runGates with exit 22",
    fingerprint: "WIRING:SECRET_IN_DELIVERABLE expected 22 got",
    expected: "SURVIVED", inRegion: false }),
  Object.freeze({ id: "C-03", kind: "MANIFEST_DRIFT_ONLY", description: "a recorded result edited inside the manifest, so only the manifest gate fires",
    find: "    \"R3-D01\": \"TARGETED_KILL\",",
    replace: "    \"R3-D01\": \"SURVIVED\",",
    detector: "every exit code of `check` is reachable from the command line, with the code the table names",
    fingerprint: "expected exit",
    expected: "ONLY_INCIDENTAL", inRegion: true }),
  Object.freeze({ id: "C-04", kind: "SETUP_BREAK", description: "the module made unparseable, so nothing under test runs",
    find: "export function redactPaths(text) {",
    replace: "export function redactPaths(text) { (((",
    detector: "S1-R5 F-01 wiring: a secret in a deliverable stops runGates with exit 22",
    fingerprint: "WIRING:SECRET_IN_DELIVERABLE expected 22 got",
    expected: "INVALID_MUTANT", inRegion: false }),
  Object.freeze({ id: "C-05", kind: "EARLIER_GATE", description: "an earlier gate forced to fire, so the named test fails with another code",
    find: "  const drift = markdownDrift(reg, md);",
    replace: "  const drift = [{ why: \"FORCED_BY_A_PLACEBO_CONTROL\" }];",
    detector: "S1-R5 F-01 wiring: a secret in a deliverable stops runGates with exit 22",
    fingerprint: "WIRING:SECRET_IN_DELIVERABLE expected 22 got null",
    expected: "ONLY_INCIDENTAL", inRegion: false }),
  Object.freeze({ id: "C-06", kind: "UNRELATED_FAILURE", description: "the gate's label reworded, so the named test fails for another reason",
    find: "\"a secret-shaped value is present in a deliverable\"",
    replace: "\"a secret shaped value is present in a deliverable\"",
    detector: "S1-R5 F-01 wiring: a secret in a deliverable stops runGates with exit 22",
    fingerprint: "WIRING:SECRET_IN_DELIVERABLE expected 22 got",
    expected: "ONLY_INCIDENTAL", inRegion: false }),
]);
export const MUTATION_CAMPAIGN = Object.freeze({
  manifestSha256: "84977cd9b4394e031b7fe7dc480a3dee2402b966034e7f1a283b47bf612c1bc1",
  observed: Object.freeze({
    "FA-01a": "TARGETED_KILL",
    "FA-01b": "TARGETED_KILL",
    "FA-01c": "TARGETED_KILL",
    "FA-01d": "TARGETED_KILL",
    "FA-02a": "TARGETED_KILL",
    "FA-02b": "TARGETED_KILL",
    "FA-02c": "TARGETED_KILL",
    "FA-02d": "TARGETED_KILL",
    "FA-02e": "TARGETED_KILL",
    "FA-03b": "TARGETED_KILL",
    "FA-03c": "TARGETED_KILL",
    "FA-03d": "TARGETED_KILL",
    "FA-03e": "TARGETED_KILL",
    "FA-04a": "TARGETED_KILL",
    "FA-04b": "TARGETED_KILL",
    "FA-04c": "TARGETED_KILL",
    "FA-04d": "TARGETED_KILL",
    "FA-04e": "TARGETED_KILL",
    "FA-05b": "TARGETED_KILL",
    "FA-05c": "TARGETED_KILL",
    "FA-05d": "TARGETED_KILL",
    "FA-I1a": "TARGETED_KILL",
    "FA-I1b": "TARGETED_KILL",
    "FA-I1c": "TARGETED_KILL",
    "FA-I2a": "TARGETED_KILL",
    "FA-I2b": "TARGETED_KILL",
    "FA-I2c": "TARGETED_KILL",
    "R3-B01": "TARGETED_KILL",
    "R3-B02": "TARGETED_KILL",
    "R3-B03": "TARGETED_KILL",
    "R3-B04": "TARGETED_KILL",
    "R3-B05": "TARGETED_KILL",
    "R3-D01": "TARGETED_KILL",
    "R3-D02": "TARGETED_KILL",
    "R3-D03": "TARGETED_KILL",
    "R3-D04": "TARGETED_KILL",
    "R3-D05": "TARGETED_KILL",
    "R3-D06": "TARGETED_KILL",
    "R3-D07": "TARGETED_KILL",
    "R3-D08": "TARGETED_KILL",
    "R3-D09": "TARGETED_KILL",
    "R3-D10": "TARGETED_KILL",
    "R3-D11": "TARGETED_KILL",
    "R3-D12": "TARGETED_KILL",
    "R3-D13": "TARGETED_KILL",
    "R3-D14": "TARGETED_KILL",
    "R3-D15": "TARGETED_KILL",
    "R3-F01": "TARGETED_KILL",
    "R3-F02": "TARGETED_KILL",
    "R3-F03": "TARGETED_KILL",
    "R3-F04": "TARGETED_KILL",
    "R3-F05": "TARGETED_KILL",
    "R3-F06": "TARGETED_KILL",
    "R3-K01": "TARGETED_KILL",
    "R3-K02": "TARGETED_KILL",
    "R3-K03": "TARGETED_KILL",
    "R3-K04": "TARGETED_KILL",
    "R3-K05": "TARGETED_KILL",
    "R3-K06": "TARGETED_KILL",
    "R3-K07": "TARGETED_KILL",
    "R3-L01": "TARGETED_KILL",
    "R3-L02": "TARGETED_KILL",
    "R3-L03": "TARGETED_KILL",
    "R3-L04": "TARGETED_KILL",
    "R3-L05": "TARGETED_KILL",
    "R3-L06": "TARGETED_KILL",
    "R3-L07": "TARGETED_KILL",
    "R3-L08": "TARGETED_KILL",
    "R3-T01": "TARGETED_KILL",
    "R3-T02": "TARGETED_KILL",
    "R3-T03": "TARGETED_KILL",
    "R3-T04": "TARGETED_KILL",
    "R3-T05": "TARGETED_KILL",
    "R3-T06": "TARGETED_KILL",
    "R3-X01": "TARGETED_KILL",
    "R3-X02": "TARGETED_KILL",
    "R3-X03": "TARGETED_KILL",
    "R3-X04": "TARGETED_KILL",
    "R3-X05": "TARGETED_KILL",
    "R3-X06": "TARGETED_KILL",
    "R3-X07": "TARGETED_KILL",
    "R3-X08": "TARGETED_KILL",
    "R3-X09": "TARGETED_KILL",
    "R3-X10": "TARGETED_KILL",
    "R4-01a": "TARGETED_KILL",
    "R4-01b": "TARGETED_KILL",
    "R4-02": "TARGETED_KILL",
    "R4-03a": "TARGETED_KILL",
    "R4-03b": "TARGETED_KILL",
    "R4-04a": "TARGETED_KILL",
    "R4-04b": "TARGETED_KILL",
    "R4-04c": "TARGETED_KILL",
    "R4-05a": "TARGETED_KILL",
    "R4-05b": "TARGETED_KILL",
    "R4-07a": "TARGETED_KILL",
    "R4-07b": "TARGETED_KILL",
    "R4-08": "TARGETED_KILL",
    "R4-10": "TARGETED_KILL",
    "R4-11": "TARGETED_KILL",
    "R4-12a": "TARGETED_KILL",
    "R4-12b": "TARGETED_KILL",
    "R4-12c": "TARGETED_KILL",
    "R4-12d": "TARGETED_KILL",
    "R4-M15": "TARGETED_KILL",
    "R5-03a": "TARGETED_KILL",
    "R5-03b": "TARGETED_KILL",
    "R5-03c": "TARGETED_KILL",
    "R5-04a": "TARGETED_KILL",
    "R5-05a": "TARGETED_KILL",
    "R5-05b": "TARGETED_KILL",
    "R5-05c": "TARGETED_KILL",
    "R5-C01": "TARGETED_KILL",
    "R5-C02": "TARGETED_KILL",
    "R5-C03": "TARGETED_KILL",
    "R5-C04": "TARGETED_KILL",
    "R5-C05": "TARGETED_KILL",
    "R5-C06": "TARGETED_KILL",
    "R5-C07": "TARGETED_KILL",
    "R5-C08": "TARGETED_KILL",
    "R5-C09": "TARGETED_KILL",
    "R5-C10": "TARGETED_KILL",
    "R5-I02a": "TARGETED_KILL",
    "R5-I02b": "TARGETED_KILL",
    "R5-I03a": "TARGETED_KILL",
    "R5-I03b": "TARGETED_KILL",
    "R5-I04a": "TARGETED_KILL",
    "R5-I05a": "TARGETED_KILL",
  }),
  controls: Object.freeze({
    "C-01": "SURVIVED",
    "C-02": "SURVIVED",
    "C-03": "ONLY_INCIDENTAL",
    "C-04": "INVALID_MUTANT",
    "C-05": "ONLY_INCIDENTAL",
    "C-06": "ONLY_INCIDENTAL",
  }),
});
// </MUTATION-MANIFEST>

// ────────────────────────────────────── exits ───────────────────────────────────

/**
 * Every exit code of `check`, by name. A code shared by two gates is listed in
 * EXIT_SHARED with both gates: the code names a CLASS of failure, the message and
 * the first row name the gate. Nothing is claimed to be unique that is not.
 */
export const EXIT = Object.freeze({
  OK: 0,
  MISSING_FILE: 1,
  UNKNOWN_ENUM: 2,
  DUPLICATE_IDENTIFIER: 3,
  ORPHAN_FINDING: 4,
  OWNERSHIP: 5,
  MISSING_EVIDENCE: 6,
  DERIVED_VALUE_MISMATCH: 7,
  MISSING_ACCEPTANCE: 8,
  MISSING_FIELD: 9,
  REMEDIATION_ORDER: 10,
  FORBIDDEN_IN_REGISTER: 11,
  NON_DETERMINISTIC_ORDER: 12,
  SUMMARY_DRIFT: 13,
  NOT_CANONICAL: 14,
  CONTRADICTION: 15,
  GUARD_EVIDENCE: 16,
  NEXT_ACTION: 17,
  FINDING_UNIVERSE: 18,
  VERIFICATION_LINKAGE: 19,
  DOMINANT_IMPACT: 20,
  BLOCK_DRIFT: 21,
  SECRET_IN_DELIVERABLE: 22,
  FORBIDDEN_IN_DELIVERABLE: 23,
  NARRATIVE_FACT: 24,
  MUTATION_MANIFEST: 25,
  OPEN_REVIEW_FINDING: 26,
  STRUCTURE_LIMIT: 27,
  USAGE: 64,
  INTERNAL_ERROR: 70,
});

export const EXIT_SHARED = Object.freeze({
  [EXIT.DUPLICATE_IDENTIFIER]: ["duplicate risk identifier", "duplicate finding identifier"],
  [EXIT.DERIVED_VALUE_MISMATCH]: ["score or severity differs from the method", "CRITICAL without ACTIVE_CONFIRMED"],
  [EXIT.REMEDIATION_ORDER]: ["duplicate or missing remediation ownership", "priority is not a severity-consistent total order"],
});

// ────────────────────────────────────── CLI ────────────────────────────────────

function loadRegister(path = REGISTER_PATH) {
  if (!existsSync(path)) {
    // S1-R5 I-03: a logical label, never the absolute workspace path
    process.stderr.write("[s1-risk-register] missing docs/security/s1-risk-register.json\n");
    process.exit(EXIT.MISSING_FILE);
  }
  let reg;
  try {
    reg = JSON.parse(readFileSync(path, "utf8"));
  } catch {
    // S1-FA-03: a known file failure prints a fixed logical message. The parser's own
    // text quotes the file's first characters, and those can be a path or a secret.
    process.stderr.write("[s1-risk-register] internal error: docs/security/s1-risk-register.json is not readable JSON\n");
    process.exit(EXIT.INTERNAL_ERROR);
  }
  const structure = registerStructureViolations(reg);
  if (structure.length) {
    process.stderr.write("[s1-risk-register] the register exceeds the structure budget the gates can read in full\n");
    for (const v of structure) process.stderr.write(`  ${JSON.stringify({ ...v, path: `…${String(v.path).slice(-60)}` })}\n`);
    process.exit(EXIT.STRUCTURE_LIMIT);
  }
  return reg;
}

function fail(code, label, rows) {
  process.stderr.write(`[s1-risk-register] ${label}\n`);
  for (const r of rows.slice(0, 25)) process.stderr.write(`  ${JSON.stringify(r)}\n`);
  if (rows.length > 25) process.stderr.write(`  … and ${rows.length - 25} more\n`);
  process.exit(code);
}

/**
 * Run every gate in order; the first failing gate exits with its code.
 *
 * The derived-value gates run BEFORE the canonical-form gate on purpose: the
 * canonical renderer recomputes score, severity and dominant impact, so a hand-
 * edited derived field made the register non-canonical and was reported only as
 * exit 14 — which left exits 7 and 20 unreachable from the command line. A stored
 * derived field is now judged first and reports its own code; exit 14 means the
 * register is correct in content and wrong only in form.
 *
 * `options.registerText` is the register exactly as stored; it enables the
 * canonical-form gate and is the text the secret and forbidden-content gates scan.
 * `options.reviewClosure` replaces the committed closure table and
 * `options.mutationManifest` the committed mutation evidence, so a test can prove that
 * an OPEN review finding (exit 26) and a mutation record that is not a targeted kill
 * (exit 25) each reach their gate in process. The command line passes neither.
 */
export function runGates(reg, md, root = REPO_ROOT, options = {}) {
  const stop = (code, label, rows) => ({ code, label, rows });
  // S1-FA-02: first, before any gate recurses into the register, its shape is held to
  // the budget the scanners can read in full; past it nothing below is trusted
  const structure = registerStructureViolations(reg);
  if (structure.length) return stop(EXIT.STRUCTURE_LIMIT, "the register exceeds the structure budget the gates can read in full", structure);

  const dupRisk = duplicateRiskIds(reg);
  if (dupRisk.length) return stop(EXIT.DUPLICATE_IDENTIFIER, "duplicate risk id", dupRisk);
  const dupFinding = duplicateFindingIds(reg);
  if (dupFinding.length) return stop(EXIT.DUPLICATE_IDENTIFIER, "duplicate finding id", dupFinding);

  const enums = enumViolations(reg);
  if (enums.length) return stop(EXIT.UNKNOWN_ENUM, "unknown or out-of-range enum value", enums);

  // Judged BEFORE the generic required-field gate: `acceptanceCriteria` and
  // `residualRisk` are also required fields, so an empty one on a CRITICAL or HIGH
  // risk was always reported as exit 9 and exit 8 could never be reached. The more
  // specific gate now goes first and keeps its own code.
  const accept = acceptanceCriteriaViolations(reg);
  if (accept.length) return stop(EXIT.MISSING_ACCEPTANCE, "CRITICAL/HIGH risk without acceptance criteria or residual risk", accept);

  const missingFields = missingRequiredFields(reg);
  if (missingFields.length) return stop(EXIT.MISSING_FIELD, "risk missing a required field", missingFields);

  const orphans = orphanFindings(reg);
  if (orphans.length) return stop(EXIT.ORPHAN_FINDING, "orphan finding", orphans);

  const ownership = ownershipViolations(reg);
  if (ownership.length) return stop(EXIT.OWNERSHIP, "finding ownership violation", ownership);

  const evidence = missingEvidence(reg, root);
  if (evidence.length) return stop(EXIT.MISSING_EVIDENCE, "evidence path does not exist", evidence);

  const dominant = dominantImpactViolations(reg);
  if (dominant.length) return stop(EXIT.DOMINANT_IMPACT, "a stored dominant impact dimension is not the derived one", dominant);

  const arith = arithmeticViolations(reg);
  if (arith.length) return stop(EXIT.DERIVED_VALUE_MISMATCH, "score or severity does not match the declared method", arith);

  const crit = criticalWithoutActiveConfirmed(reg);
  if (crit.length) return stop(EXIT.DERIVED_VALUE_MISMATCH, "CRITICAL without ACTIVE_CONFIRMED — the clamp was not applied", crit);

  const remDup = duplicateRemediationOwnership(reg);
  if (remDup.length) return stop(EXIT.REMEDIATION_ORDER, "duplicate or missing remediation ownership", remDup);

  const forbidden = forbiddenContent(reg);
  if (forbidden.length) return stop(EXIT.FORBIDDEN_IN_REGISTER, "forbidden content — timestamp or absolute path", forbidden);

  const priority = priorityViolations(reg);
  if (priority.length) return stop(EXIT.REMEDIATION_ORDER, "remediation priority is not a severity-consistent total order", priority);

  const ordering = orderingViolations(reg);
  if (ordering.length) return stop(EXIT.NON_DETERMINISTIC_ORDER, "non-deterministic ordering", ordering);

  if (options.registerText !== undefined && options.registerText !== render(reg)) {
    return stop(EXIT.NOT_CANONICAL, "the register is not in canonical form — run `generate`", [{ why: "STORED_TEXT_DIFFERS_FROM_RENDERING" }]);
  }

  const universe = findingUniverseViolations(reg, root);
  if (universe.length) return stop(EXIT.FINDING_UNIVERSE, "the finding universe does not match the source documents", universe);

  const linkage = verificationLinkageViolations(reg);
  if (linkage.length) return stop(EXIT.VERIFICATION_LINKAGE, "a scored risk declares a verification method no criterion names", linkage);

  // before the report gates: Appendix E renders this data, so a stale record would
  // otherwise surface only as block drift (21) and hide its own cause
  const mutation = options.mutationManifest
    ? mutationManifestViolations(undefined, options.mutationManifest.manifest, options.mutationManifest.campaign, options.mutationManifest.controls)
    : mutationManifestViolations();
  if (mutation.length) return stop(EXIT.MUTATION_MANIFEST, "the mutation manifest is stale, unbound to its campaign, or records a survivor", mutation);

  const contradictions = runtimeEvidenceContradictions(reg, md);
  if (contradictions.length) {
    return stop(EXIT.CONTRADICTION, "the register or the report contradicts the runtime evidence it carries", contradictions);
  }

  const guards = guardEvidenceViolations(reg);
  if (guards.length) return stop(EXIT.GUARD_EVIDENCE, "configuration-guarded state without named guard evidence", guards);

  const drift = markdownDrift(reg, md);
  if (drift.length) return stop(EXIT.SUMMARY_DRIFT, "drift between the Markdown report and the JSON register", drift);

  const blocks = markdownBlockDrift(reg, md);
  if (blocks.length) return stop(EXIT.BLOCK_DRIFT, "a generated report block was edited by hand or is missing", blocks);

  const facts = narrativeFactViolations(reg, md, root);
  if (facts.length) return stop(EXIT.NARRATIVE_FACT, "a figure in the hand-written narrative differs from the register or is not derived", facts);

  const registerText = options.registerText ?? readFileSync(join(root, "docs", "security", "s1-risk-register.json"), "utf8");
  const secrets = secretShapeViolations(registerText, md);
  if (secrets.length) return stop(EXIT.SECRET_IN_DELIVERABLE, "a secret-shaped value is present in a deliverable", secrets);

  const deliverableForbidden = deliverableForbiddenViolations(registerText, md);
  if (deliverableForbidden.length) {
    return stop(EXIT.FORBIDDEN_IN_DELIVERABLE, "an absolute path, a date-time or an operational command is present in a deliverable", deliverableForbidden);
  }

  const nextAction = nextSafeActionViolations(reg, md);
  if (nextAction.length) {
    return stop(EXIT.NEXT_ACTION, "the next-safe-action block asks for evidence the register already holds", nextAction);
  }

  const review = reviewClosureViolations(options.reviewClosure);
  if (review.length) return stop(EXIT.OPEN_REVIEW_FINDING, "a review finding in the closure table is still open", review);

  return null;
}

/**
 * Run every gate; the first failing gate exits with its code. The gate sequence
 * itself lives in `runGates`, which RETURNS the first failure, so a test can call
 * one gate's wiring directly instead of only through a whole command-line run.
 */
export function runCheck(reg, md, root = REPO_ROOT, options = {}) {
  const failure = runGates(reg, md, root, options);
  if (failure) fail(failure.code, failure.label, failure.rows);
  return counters(reg);
}

async function main() {
  const mode = process.argv[2] ?? "check";
  if (!["generate", "check", "summary", "blocks", "mutants"].includes(mode)) {
    process.stderr.write(`[s1-risk-register] unknown mode "${mode}" — use generate | check | summary | blocks | mutants\n`);
    process.exit(EXIT.USAGE);
  }
  if (mode === "mutants") {
    await runMutationCampaign(process.argv.slice(3));
    return;
  }
  const reg = loadRegister();

  if (mode === "generate") {
    writeFileSync(REGISTER_PATH, render(reg), "utf8");
    const c = counters(JSON.parse(readFileSync(REGISTER_PATH, "utf8")));
    process.stdout.write(
      `[s1-risk-register] wrote docs/security/s1-risk-register.json (${c.S1_RISKS_TOTAL} risks, ${c.S1_FINDINGS_TOTAL} findings)\n`,
    );
    return;
  }

  if (mode === "blocks") {
    const name = process.argv[3];
    const all = markdownBlocks(reg);
    if (!name) {
      process.stdout.write(`${Object.keys(all).join("\n")}\n`);
      return;
    }
    if (!(name in all)) {
      process.stderr.write(`[s1-risk-register] no such block "${name}"\n`);
      process.exit(EXIT.USAGE);
    }
    process.stdout.write(`${all[name]}\n`);
    return;
  }

  if (mode === "summary") {
    process.stdout.write(`${JSON.stringify(counters(reg), null, 2)}\n`);
    return;
  }

  // check: every invariant, in order; the canonical-form gate sits among them.
  const onDisk = readFileSync(REGISTER_PATH, "utf8");
  if (!existsSync(REPORT_PATH)) {
    process.stderr.write("[s1-risk-register] missing docs/security/THREAT-MODEL-AND-RISK-REGISTER.md\n");
    process.exit(EXIT.MISSING_FILE);
  }
  const c = runCheck(reg, readFileSync(REPORT_PATH, "utf8"), REPO_ROOT, { registerText: onDisk });
  process.stdout.write(
    `[s1-risk-register] register consistent — ${c.S1_RISKS_TOTAL} risks, ${c.S1_FINDINGS_TOTAL} findings, coverage ${c.FINDING_COVERAGE_PERCENT}%\n`,
  );
  for (const k of ["SEVERITY_CRITICAL", "SEVERITY_HIGH", "SEVERITY_MEDIUM", "SEVERITY_LOW", "SEVERITY_INFORMATIONAL"]) {
    process.stdout.write(`  ${k.replace("SEVERITY_", "").padEnd(14)} ${c[k]}\n`);
  }
}

/**
 * S1-R5 I-03 / S1-FA-03 — strip every absolute path from a message before it is printed.
 *
 * The first version stopped a path at the first whitespace, so `C:\Users\John Smith\…`
 * lost only `C:\Users\John` and printed the rest. A path cannot be delimited by spaces,
 * so the rule is now:
 *   1. a QUOTED span (straight, back-tick, curly or guillemet quotes) that contains the
 *      start of an absolute path is replaced whole, its quotes and everything around it
 *      kept — the error's prefix and suffix stay readable; anything glued to the closing
 *      quote is swallowed with it, because it is the same token;
 *   2. outside a closed quote, an absolute path runs, conservatively, to the END OF THE
 *      LINE — the suffix of such a message is lost rather than any part of the path.
 * Where a path starts: a drive letter, a UNC prefix, a `file://` URI, or a slash that no
 * word, digit or relative path continues (`docs/security/x` and `and/or` are kept).
 */
const QUOTE_PAIRS = Object.freeze({ "'": "'", '"': '"', "`": "`", "\u2018": "\u2019", "\u201C": "\u201D", "\u00AB": "\u00BB" });
const DRIVE_PATH_START = String.raw`(?<![\p{L}\p{N}])[A-Za-z]:[\\/]`;
const UNC_PATH_START = String.raw`\\\\(?=[^\\\s])`;
const FILE_URI_START = String.raw`file:\/\/`;
const POSIX_PATH_START = String.raw`(?<![\p{L}\p{N}.~\/\\-])\/(?=[\p{L}\p{N}._~-])`;
const ABSOLUTE_PATH_START_RX = new RegExp(`${DRIVE_PATH_START}|${UNC_PATH_START}|${FILE_URI_START}|${POSIX_PATH_START}`, "u");

export function redactPaths(text) {
  return String(text).split("\n").map((line) => {
    let out = "";
    let i = 0;
    while (i < line.length) {
      const close = QUOTE_PAIRS[line[i]];
      const j = close === undefined ? -1 : line.indexOf(close, i + 1);
      if (j !== -1 && ABSOLUTE_PATH_START_RX.test(line.slice(i + 1, j))) {
        out += `${line[i]}<path>${close}`;
        i = j + 1;
        while (i < line.length && !/\s/.test(line[i])) i += 1;
        continue;
      }
      // the plain text up to the next quote character (or a quote that never closes, to the end)
      let k = i + 1;
      if (close === undefined) while (k < line.length && QUOTE_PAIRS[line[k]] === undefined) k += 1;
      const rest = line.slice(i, close === undefined ? k : j === -1 ? line.length : j + 1);
      const m = ABSOLUTE_PATH_START_RX.exec(rest);
      if (m) return `${out}${rest.slice(0, m.index)}<path>`;
      out += rest;
      i += rest.length;
    }
    return out;
  }).join("\n");
}

/** The one line an internal failure prints: the redacted first line of the message, never a stack trace. */
export function formatInternalError(e) {
  return `[s1-risk-register] internal error: ${redactPaths(String(e?.message ?? e).split("\n")[0]).slice(0, 200)}\n`;
}

/**
 * S1-R4 FR-08 — is this module the program being run?
 *
 * Node resolves the main module to its REAL path, so `import.meta.url` names the
 * target of a symlink or a Windows junction while `process.argv[1]` keeps the link.
 * Comparing the two strings made a run through a link skip `main()` and exit 0 with
 * nothing checked. Both sides are now resolved to their real paths (case-folded on
 * Windows) before they are compared.
 */
export function isEntrypoint(argv1, moduleUrl) {
  if (!argv1) return false;
  const real = (p) => {
    try {
      return realpathSync.native(p);
    } catch {
      return resolve(p);
    }
  };
  const fold = (p) => (process.platform === "win32" ? p.toLowerCase() : p);
  return fold(real(resolve(argv1))) === fold(real(fileURLToPath(moduleUrl)));
}

if (isEntrypoint(process.argv[1], import.meta.url)) {
  main().catch((e) => {
    // S1-R4 FR-11: an internal failure (an unreadable register, a malformed structure)
    // is exit 70, distinct from a missing file (1), and prints no stack trace.
    process.stderr.write(formatInternalError(e));
    process.exit(EXIT.INTERNAL_ERROR);
  });
}
