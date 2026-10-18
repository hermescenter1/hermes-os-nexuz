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
import { join, dirname, sep, resolve, relative, isAbsolute } from "node:path";
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
  "originScope",
  "revision",
  "secondLayerRevision",
  "policy",
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
  "originScope",
  "deltaDisposition",
  "revision",
]);

const EVIDENCE_KEY_ORDER = Object.freeze(["path", "locator", "note"]);

const TOP_KEY_ORDER = Object.freeze([
  "schemaVersion",
  "phase",
  "methodVersion",
  "sourceSha",
  "reconciliation",
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
    if (r.originScope !== undefined && !ORIGIN_SCOPES.includes(r.originScope)) push(r.riskId, "originScope", r.originScope);
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
    if (f.originScope !== undefined && !ORIGIN_SCOPES.includes(f.originScope)) push(f.findingId, "originScope", f.originScope);
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

// ─────────────────────────────── closed schema (FR-04) ───────────────────────────────

/**
 * Every structure the register carries is CLOSED: a key that is not listed is a
 * failure, and a required key that is absent is a failure. An extension is not
 * silently accepted. The only extension point is `policy`, a named, validated object
 * (see `policyViolations`); anything else a future author wants to record must be added
 * here, in a reviewed change, before it can appear in the register.
 */
export const SCHEMA_KEYS_VERSION = "s1-keys-1";

export const RISK_REQUIRED_KEYS = Object.freeze([
  "riskId", "title", "productionState", "stride", "threatActors", "preconditions", "affectedAssets",
  "sourceFindingIds", "evidence", "existingControls", "controlGaps", "likelihoodFactors", "impactFactors",
  "likelihood", "impact", "score", "severityFromScore", "severityClamp", "severity", "dominantImpact",
  "confidence", "remediationPriority", "remediationPhase", "remediationOwnership", "acceptanceCriteria",
  "verificationMethod", "residualRisk", "dependencies", "relatedRiskIds",
]);
export const RISK_OPTIONAL_KEYS = Object.freeze(["guardEvidence", "runtimeEvidence", "evidenceReconciliation", "originScope", "revision", "secondLayerRevision", "policy"]);
export const FINDING_REQUIRED_KEYS = Object.freeze(["findingId", "family", "source", "summary", "status"]);
export const FINDING_OPTIONAL_KEYS = Object.freeze(["ownerRiskId", "duplicateOf", "reason", "relatedRiskIds", "originScope", "deltaDisposition", "revision"]);
export const RUNTIME_EVIDENCE_KEYS = Object.freeze(["statement", "variables", "source", "activeInCurrentContainer", "proves", "doesNotProve"]);
export const SEVERITY_CLAMP_KEYS = Object.freeze(["applied", "from", "to", "rule", "reason"]);
export const REVISION_KEYS = Object.freeze(["scope", "supersedes", "reason"]);
export const SCORING_METHOD_KEYS = Object.freeze(["likelihood", "impact", "score", "rounding", "factorOrientation", "bands", "clamp", "manualOverrides"]);
export const ENUM_KEYS = Object.freeze(["productionStates", "severities", "confidences", "findingStatuses", "threatActors", "assets", "stride", "remediationPhases", "verificationMethods"]);
export const POLICY_KEYS = Object.freeze(["status", "question", "ownerRole", "ownerDecisionEvidence", "branches"]);
export const POLICY_BRANCH_KEYS = Object.freeze(["branchId", "condition", "requiredControl", "verificationMethod", "requiredTests", "acceptanceCriteria"]);
export const POLICY_EVIDENCE_KEYS = Object.freeze(["source", "anchor", "decidedBranchId", "decidedByRole"]);
export const POLICY_STATUSES = Object.freeze(["OPEN", "DECIDED"]);
export const POLICY_OWNER_ROLES = Object.freeze(["PRODUCT_OWNER", "DATA_PROTECTION_OWNER", "SECURITY_OWNER"]);
/** Risks whose observed behaviour is certain and whose desirability only the owner can decide: each MUST carry a policy. */
export const POLICY_REQUIRED_RISKS = Object.freeze(["R-66", "R-72", "R-73"]);
/** Every acceptance entry of a policy branch names the decision it depends on. */
export const POLICY_BRANCH_PREFIX = "If the owner decides ";
/** Phrases that are a wish, not an acceptance criterion. */
export const POLICY_GENERIC_ACCEPTANCE = /nothing further|document the policy|owner should decide|no further action|to be decided|\btbd\b|as appropriate|not applicable/i;
/** An acceptance criterion of a branch must name something that can be seen to pass or fail. */
export const POLICY_OPERATIONAL = /\b(?:a test asserts|tests assert|a gate (?:fails|rejects)|the gate (?:fails|rejects))\b/i;
export const POLICY_TEST_VERB = /\b(?:asserts?|refuses?|rejects?|returns?|fails?|renders?|writes?|pass(?:es)?)\b/i;
/**
 * Evidence that lives in the security deliverables or in this tool chain is not an owner's decision:
 * the register, the delta provenance, the inventory, the mutation record, the reports and every
 * checker are all produced here. The pattern is tested on a CANONICAL, case-folded path (see
 * `canonicalEvidencePath`), never on the spelling the register carries.
 */
export const POLICY_SELF_REFERENCE_ROOTS = Object.freeze(["docs/security", "scripts/security"]);
export const POLICY_SELF_REFERENCE = /^(?:docs\/security|scripts\/security)(?:\/|$)/;

/**
 * The repository-relative form of an evidence path, independent of the platform. Backslashes, drive
 * letters, `:`, wildcard and control characters, and segments Windows would rewrite (a trailing dot or
 * space) are REFUSED rather than guessed at. `.`, `..` and repeated separators are resolved; a `..`
 * that leaves the repository root is refused. The Unicode form is NFKC and the comparison form is
 * lower case, so a full-width or upper-case spelling of a deliverable is the deliverable.
 */
export function canonicalEvidencePath(source) {
  if (typeof source !== "string" || source.trim() === "") return { problem: "POLICY_EVIDENCE_EMPTY" };
  if (source.startsWith("/") || /^[A-Za-z]:/.test(source)) return { problem: "POLICY_EVIDENCE_PATH_ABSOLUTE" };
  if (/[\\\u0000-\u001f:*?"<>|]/.test(source)) return { problem: "POLICY_EVIDENCE_PATH_AMBIGUOUS" };
  const kept = [];
  for (const seg of source.normalize("NFKC").split("/")) {
    if (seg === "" || seg === ".") continue;
    if (seg === "..") {
      if (kept.length === 0) return { problem: "POLICY_EVIDENCE_PATH_ESCAPES_ROOT" };
      kept.pop();
      continue;
    }
    if (/[. ]$/.test(seg)) return { problem: "POLICY_EVIDENCE_PATH_AMBIGUOUS" };
    kept.push(seg);
  }
  if (kept.length === 0) return { problem: "POLICY_EVIDENCE_PATH_ESCAPES_ROOT" };
  const rel = kept.join("/");
  return { rel, folded: rel.toLowerCase() };
}

/** The file an evidence path names, resolved through the file system: a link cannot smuggle a deliverable in. */
export function resolveEvidenceFile(root, rel) {
  const abs = join(root, ...rel.split("/"));
  let real;
  let realRoot;
  try {
    real = realpathSync.native(abs);
    realRoot = realpathSync.native(root);
  } catch {
    return { problem: "POLICY_EVIDENCE_PATH_ABSENT" };
  }
  const within = relative(realRoot, real).split(sep).join("/");
  if (within === "" || within.startsWith("..") || isAbsolute(within)) return { problem: "POLICY_EVIDENCE_PATH_ESCAPES_ROOT" };
  if (POLICY_SELF_REFERENCE.test(within.normalize("NFKC").toLowerCase())) return { problem: "POLICY_EVIDENCE_SELF_REFERENCE" };
  if (!statSync(real).isFile()) return { problem: "POLICY_EVIDENCE_NOT_A_FILE" };
  return { abs: real };
}

const isPlainObject = (x) => x !== null && typeof x === "object" && !Array.isArray(x);

function closedKeys(node, where, required, optional, out) {
  if (!isPlainObject(node)) {
    out.push({ where, why: "NOT_AN_OBJECT" });
    return false;
  }
  for (const k of Object.keys(node)) if (!required.includes(k) && !optional.includes(k)) out.push({ where, why: "UNKNOWN_KEY", key: k });
  for (const k of required) if (!(k in node)) out.push({ where, why: "MISSING_KEY", key: k });
  return true;
}

const stringList = (node, where, out, min = 0) => {
  if (!Array.isArray(node)) return out.push({ where, why: "NOT_AN_ARRAY" });
  if (node.length < min) out.push({ where, why: "TOO_FEW_ITEMS", min });
  node.forEach((s, i) => {
    if (typeof s !== "string" || !s.trim()) out.push({ where: `${where}[${i}]`, why: "NOT_A_NON_EMPTY_STRING" });
  });
  return undefined;
};

export function schemaKeyViolations(reg) {
  const out = [];
  if (!closedKeys(reg, "register", TOP_KEY_ORDER, [], out)) return out;
  closedKeys(reg.scoringMethod, "scoringMethod", SCORING_METHOD_KEYS, [], out);
  closedKeys(reg.enums, "enums", ENUM_KEYS, [], out);
  if (!Array.isArray(reg.risks)) out.push({ where: "risks", why: "NOT_AN_ARRAY" });
  if (!Array.isArray(reg.findings)) out.push({ where: "findings", why: "NOT_AN_ARRAY" });
  for (const r of Array.isArray(reg.risks) ? reg.risks : []) {
    const w = `risk ${r?.riskId ?? "?"}`;
    if (!closedKeys(r, w, RISK_REQUIRED_KEYS, RISK_OPTIONAL_KEYS, out)) continue;
    (Array.isArray(r.evidence) ? r.evidence : []).forEach((e, i) => {
      if (closedKeys(e, `${w} evidence[${i}]`, EVIDENCE_KEY_ORDER, [], out)) {
        for (const k of EVIDENCE_KEY_ORDER) if (typeof e[k] !== "string" || !e[k].trim()) out.push({ where: `${w} evidence[${i}]`, why: "NOT_A_NON_EMPTY_STRING", key: k });
      }
    });
    closedKeys(r.likelihoodFactors, `${w} likelihoodFactors`, LIKELIHOOD_FACTOR_KEYS, [], out);
    closedKeys(r.impactFactors, `${w} impactFactors`, IMPACT_FACTOR_KEYS, [], out);
    if (r.severityClamp !== null) closedKeys(r.severityClamp, `${w} severityClamp`, SEVERITY_CLAMP_KEYS, [], out);
    if ("runtimeEvidence" in r) {
      const list = Array.isArray(r.runtimeEvidence) ? r.runtimeEvidence : [r.runtimeEvidence];
      list.forEach((e, i) => closedKeys(e, `${w} runtimeEvidence[${i}]`, RUNTIME_EVIDENCE_KEYS, [], out));
    }
    if ("guardEvidence" in r) stringList(r.guardEvidence, `${w} guardEvidence`, out, 1);
    if ("revision" in r) closedKeys(r.revision, `${w} revision`, REVISION_KEYS, [], out);
    if ("secondLayerRevision" in r) closedKeys(r.secondLayerRevision, `${w} secondLayerRevision`, SECOND_REVISION_KEYS, [], out);
    if ("evidenceReconciliation" in r && (typeof r.evidenceReconciliation !== "string" || !r.evidenceReconciliation.trim())) {
      out.push({ where: `${w} evidenceReconciliation`, why: "NOT_A_NON_EMPTY_STRING" });
    }
    stringList(r.acceptanceCriteria, `${w} acceptanceCriteria`, out, 1);
    stringList(r.sourceFindingIds, `${w} sourceFindingIds`, out, 1);
    if (typeof r.verificationMethod !== "string" || !r.verificationMethod.trim()) out.push({ where: `${w} verificationMethod`, why: "NOT_A_NON_EMPTY_STRING" });
    if ("policy" in r && closedKeys(r.policy, `${w} policy`, POLICY_KEYS, [], out)) {
      (Array.isArray(r.policy.branches) ? r.policy.branches : []).forEach((b, i) => {
        if (!closedKeys(b, `${w} policy.branches[${i}]`, POLICY_BRANCH_KEYS, [], out)) return;
        stringList(b.requiredTests, `${w} policy.branches[${i}].requiredTests`, out, 1);
        stringList(b.acceptanceCriteria, `${w} policy.branches[${i}].acceptanceCriteria`, out, 1);
      });
      if (r.policy.ownerDecisionEvidence !== null) closedKeys(r.policy.ownerDecisionEvidence, `${w} policy.ownerDecisionEvidence`, POLICY_EVIDENCE_KEYS, [], out);
    }
  }
  for (const f of Array.isArray(reg.findings) ? reg.findings : []) {
    const w = `finding ${f?.findingId ?? "?"}`;
    if (!closedKeys(f, w, FINDING_REQUIRED_KEYS, FINDING_OPTIONAL_KEYS, out)) continue;
    if ("revision" in f) closedKeys(f.revision, `${w} revision`, REVISION_KEYS, [], out);
  }
  return out;
}

/**
 * The revision that records an owner's decision. It is the ONLY revision scope a policy risk may carry
 * besides DELTA_RELOCK, it does not rewrite any historical value, and it names this risk, the chosen branch
 * and the status it supersedes. A reconciliation gate and the policy gate judge it with this one function.
 */
export function ownerDecisionRevisionProblems(r) {
  const rev = r.revision;
  if (!isPlainObject(rev) || rev.scope !== "OWNER_POLICY_DECISION") return ["POLICY_DECISION_REVISION_MISSING"];
  const out = [];
  const sup = rev.supersedes;
  if (!isPlainObject(sup) || Object.keys(sup).length !== 1 || sup.policyStatus !== "OPEN") out.push("POLICY_DECISION_REVISION_SUPERSEDES");
  const ev = r.policy?.ownerDecisionEvidence;
  const chosen = isPlainObject(ev) ? String(ev.decidedBranchId) : null;
  const reason = String(rev.reason ?? "");
  const branchIds = (r.policy?.branches ?? []).map((b) => String(b?.branchId));
  if (reason.length < 20 || !reason.includes(r.riskId) || chosen === null || !reason.includes(chosen)) out.push("POLICY_DECISION_REVISION_REASON");
  else if (branchIds.some((id) => id !== chosen && reason.includes(id)) || (reason.match(/\bR-\d+\b/g) ?? []).some((id) => id !== r.riskId)) out.push("POLICY_DECISION_REVISION_AMBIGUOUS");
  return out;
}

/**
 * Everything a DECIDED policy must prove. The evidence names a file outside the security deliverables
 * (canonical path, resolved through the file system), that file contains the quoted anchor, the anchor
 * names THIS risk and the chosen branch and no other risk or branch, the chosen branch is one of the
 * policy's own, the decider holds the policy's owner role, and a revision records the decision.
 */
export function ownerDecisionProblems(r, branchIds, root = REPO_ROOT) {
  const p = r.policy;
  const ev = p.ownerDecisionEvidence;
  if (!isPlainObject(ev)) return ["POLICY_DECIDED_WITHOUT_EVIDENCE"];
  const keys = Object.keys(ev);
  if (POLICY_EVIDENCE_KEYS.some((k) => !keys.includes(k)) || keys.some((k) => !POLICY_EVIDENCE_KEYS.includes(k))) return ["POLICY_EVIDENCE_SHAPE"];
  const out = [];
  if (!branchIds.has(ev.decidedBranchId)) out.push("POLICY_DECISION_NAMES_AN_UNKNOWN_BRANCH");
  if (ev.decidedByRole !== p.ownerRole) out.push("POLICY_DECISION_NOT_BY_THE_OWNER");
  if (typeof ev.source !== "string" || !ev.source.trim() || typeof ev.anchor !== "string" || ev.anchor.trim().length < 12) out.push("POLICY_EVIDENCE_EMPTY");
  else {
    const c = canonicalEvidencePath(ev.source);
    if (c.problem) out.push(c.problem);
    else if (POLICY_SELF_REFERENCE.test(c.folded)) out.push("POLICY_EVIDENCE_SELF_REFERENCE");
    else {
      const f = resolveEvidenceFile(root, c.rel);
      if (f.problem) out.push(f.problem);
      else if (!readFileSync(f.abs, "utf8").replace(/\r\n?/g, "\n").includes(ev.anchor)) out.push("POLICY_EVIDENCE_ANCHOR_ABSENT");
      else {
        const otherRisks = (ev.anchor.match(/\bR-\d+\b/g) ?? []).filter((id) => id !== r.riskId);
        if (!ev.anchor.includes(r.riskId) || otherRisks.length > 0) out.push("POLICY_EVIDENCE_NOT_FOR_THIS_RISK");
        const otherBranches = [...branchIds].filter((id) => id !== ev.decidedBranchId && ev.anchor.includes(id));
        if (!ev.anchor.includes(String(ev.decidedBranchId)) || otherBranches.length > 0) out.push("POLICY_EVIDENCE_NOT_FOR_THIS_BRANCH");
      }
    }
  }
  out.push(...ownerDecisionRevisionProblems(r));
  return out;
}

/**
 * A risk whose observed behaviour is certain but whose DESIRABILITY depends on a decision
 * only the owner can make carries a `policy` object next to its production state.
 * `productionState` keeps saying what the code does; `policy` says what is undecided.
 *
 * OPEN  — `ownerDecisionEvidence` is null and there are at least two branches. Each branch
 *         names its condition, the control it requires, a verification method, at least one
 *         operational test and at least one acceptance criterion; no two branches share a
 *         condition, a control, a test set or an acceptance set; every acceptance criterion is
 *         conditional ("If the owner decides …"), testable ("a test asserts …"), not a generic
 *         wish, and listed verbatim in the risk's own `acceptanceCriteria`.
 * DECIDED — only with evidence that is not this register: a repository path outside the
 *         deliverables and the tool chain that exists and contains the quoted anchor, names one
 *         of the branches, and a revision record of the decision.
 *
 * R-66, R-72 and R-73 MUST carry a policy. Nothing here chooses a branch.
 */
export function policyViolations(reg, root = REPO_ROOT) {
  const out = [];
  const risks = new Map(reg.risks.map((r) => [r.riskId, r]));
  for (const id of POLICY_REQUIRED_RISKS) {
    const r = risks.get(id);
    if (!r) out.push({ riskId: id, why: "POLICY_REQUIRED_RISK_ABSENT" });
    else if (!("policy" in r)) out.push({ riskId: id, why: "POLICY_MISSING" });
  }
  for (const r of reg.risks) {
    if (!("policy" in r)) continue;
    const p = r.policy;
    const w = r.riskId;
    if (!isPlainObject(p)) {
      out.push({ riskId: w, why: "POLICY_NOT_AN_OBJECT" });
      continue;
    }
    if (!POLICY_STATUSES.includes(p.status)) out.push({ riskId: w, why: "POLICY_STATUS_UNKNOWN", found: p.status ?? null });
    if (typeof p.question !== "string" || p.question.trim().length < 20) out.push({ riskId: w, why: "POLICY_QUESTION_MISSING" });
    if (!POLICY_OWNER_ROLES.includes(p.ownerRole)) out.push({ riskId: w, why: "POLICY_OWNER_ROLE_UNKNOWN", found: p.ownerRole ?? null });
    if (r.productionState === "POSITIVE_CONTROL") out.push({ riskId: w, why: "POLICY_ON_A_POSITIVE_CONTROL" });
    if (!Array.isArray(p.branches) || p.branches.length < 2) {
      out.push({ riskId: w, why: "POLICY_NEEDS_TWO_BRANCHES" });
      continue;
    }
    const generic = (s) => POLICY_GENERIC_ACCEPTANCE.test(String(s));
    const ids = new Set();
    p.branches.forEach((b, i) => {
      const at = { riskId: w, branch: i };
      if (typeof b?.branchId !== "string" || !/^[A-Z][A-Z0-9_]{2,40}$/.test(b.branchId)) out.push({ ...at, why: "POLICY_BRANCH_ID_INVALID" });
      else if (ids.has(b.branchId)) out.push({ ...at, why: "POLICY_BRANCH_ID_REPEATED" });
      else ids.add(b.branchId);
      for (const k of ["condition", "requiredControl"]) {
        if (typeof b?.[k] !== "string" || b[k].trim().length < 30) out.push({ ...at, why: `POLICY_BRANCH_${k.toUpperCase()}_MISSING` });
        else if (generic(b[k])) out.push({ ...at, why: `POLICY_BRANCH_${k.toUpperCase()}_GENERIC` });
      }
      if (!VERIFICATION_METHODS.includes(b?.verificationMethod) || b.verificationMethod === "NOT_YET_VERIFIABLE") out.push({ ...at, why: "POLICY_BRANCH_VERIFICATION_METHOD_INVALID" });
      const tests = Array.isArray(b?.requiredTests) ? b.requiredTests : [];
      if (tests.length === 0) out.push({ ...at, why: "POLICY_BRANCH_WITHOUT_REQUIRED_TESTS" });
      for (const t of tests) {
        if (typeof t !== "string" || t.trim().length < 40 || !POLICY_TEST_VERB.test(t)) out.push({ ...at, why: "POLICY_BRANCH_REQUIRED_TEST_NOT_OPERATIONAL" });
        else if (generic(t)) out.push({ ...at, why: "POLICY_BRANCH_REQUIRED_TEST_GENERIC" });
      }
      const accept = Array.isArray(b?.acceptanceCriteria) ? b.acceptanceCriteria : [];
      if (accept.length === 0) out.push({ ...at, why: "POLICY_BRANCH_WITHOUT_ACCEPTANCE" });
      for (const a of accept) {
        if (typeof a !== "string" || !a.startsWith(POLICY_BRANCH_PREFIX)) out.push({ ...at, why: "POLICY_BRANCH_ACCEPTANCE_NOT_CONDITIONAL" });
        else if (generic(a)) out.push({ ...at, why: "POLICY_BRANCH_ACCEPTANCE_GENERIC" });
        else if (a.length < 100 || !POLICY_OPERATIONAL.test(a)) out.push({ ...at, why: "POLICY_BRANCH_ACCEPTANCE_NOT_TESTABLE" });
        else if (!r.acceptanceCriteria.includes(a)) out.push({ ...at, why: "POLICY_BRANCH_ACCEPTANCE_NOT_IN_CRITERIA" });
      }
    });
    // no two branches may be the same branch under another name
    const sig = (b, k) => JSON.stringify(b?.[k] ?? null);
    for (let i = 0; i < p.branches.length; i += 1) {
      for (let j = i + 1; j < p.branches.length; j += 1) {
        for (const k of ["condition", "requiredControl", "requiredTests", "acceptanceCriteria"]) {
          if (sig(p.branches[i], k) === sig(p.branches[j], k)) out.push({ riskId: w, why: "POLICY_BRANCHES_NOT_DISTINCT", field: k, branches: [i, j] });
        }
      }
    }
    // OPEN carries no decision; DECIDED carries a real one
    const ev = p.ownerDecisionEvidence;
    if (p.status === "OPEN") {
      if (ev !== null) out.push({ riskId: w, why: "POLICY_OPEN_WITH_DECISION_EVIDENCE" });
    } else if (p.status === "DECIDED") {
      for (const why of ownerDecisionProblems(r, ids, root)) out.push({ riskId: w, why });
    }
    if (r.acceptanceCriteria.some((c) => !c.startsWith(POLICY_BRANCH_PREFIX) && /\bowner (?:records|decides|states)\b/i.test(c) && c.length < 120)) {
      out.push({ riskId: w, why: "POLICY_CRITERION_IS_A_BARE_DECISION_REQUEST" });
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
  // a complete permutation: exactly 1..N, so a gap or an out-of-range value is a defect and not an order
  const sorted = reg.risks.map((r) => r.remediationPriority).sort((a, b) => a - b);
  if (sorted.some((p, i) => p !== i + 1)) out.push({ why: "PRIORITY_NOT_A_PERMUTATION", count: sorted.length });
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
  "A", "DB", "DELTA", "EDGE", "H", "IP", "L", "P99-DEP", "P99-INT", "PRIV", "RL", "TOOL", "U",
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
  // the delta provenance document declares the delta findings, as Phase 99 does for its own
  const deltaDoc = deltaDocumentIds(root);
  if (deltaDoc.error) return { error: deltaDoc.error, ids };
  for (const id of deltaDoc.ids) add(id, deltaSourceOfId(id));
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
  // the delta set and the reconciled universe are pinned the same way (version s1-universe-2)
  const deltaIds = reg.findings.filter((f) => f.family === DELTA_FAMILY).map((f) => f.findingId);
  if (deltaIds.length !== DELTA_UNIVERSE_COUNT) {
    out.push({ why: "DELTA_COUNT_CHANGED", expected: DELTA_UNIVERSE_COUNT, actual: deltaIds.length });
  }
  const firstIds = deltaIds.filter((id) => deltaLayerOfId(id) === "FIRST");
  const secondIds = deltaIds.filter((id) => deltaLayerOfId(id) === "SECOND");
  if (firstIds.length !== FIRST_DELTA_UNIVERSE_COUNT || sha256Hex(universeString(firstIds)) !== FIRST_DELTA_UNIVERSE_SHA256) {
    out.push({ why: "FIRST_LAYER_DELTA_UNIVERSE_CHANGED", expected: FIRST_DELTA_UNIVERSE_COUNT, actual: firstIds.length });
  }
  if (secondIds.length !== SECOND_DELTA_UNIVERSE_COUNT || sha256Hex(universeString(secondIds)) !== SECOND_DELTA_UNIVERSE_SHA256) {
    out.push({ why: "SECOND_LAYER_DELTA_UNIVERSE_CHANGED", expected: SECOND_DELTA_UNIVERSE_COUNT, actual: secondIds.length });
  }
  const deltaHash = sha256Hex(universeString(deltaIds));
  if (deltaHash !== DELTA_UNIVERSE_SHA256) {
    out.push({ why: "DELTA_HASH_CHANGED", expected: DELTA_UNIVERSE_SHA256, actual: deltaHash });
  }
  if (extracted.size !== RECONCILED_UNIVERSE_COUNT) {
    out.push({ why: "RECONCILED_COUNT_CHANGED", expected: RECONCILED_UNIVERSE_COUNT, actual: extracted.size });
  }
  const reconciledHash = sha256Hex(universeString(extracted));
  if (reconciledHash !== RECONCILED_UNIVERSE_SHA256) {
    out.push({ why: "RECONCILED_HASH_CHANGED", expected: RECONCILED_UNIVERSE_SHA256, actual: reconciledHash });
  }
  return out;
}

// ───────────────── S1 delta relock: the reconciled register ──────────────────
//
// The register is the ONE canonical source of risk and finding state. The frozen
// S1 analysis was performed on the source state named in `sourceSha`; the relock
// reviewed the delta between that state and the relock target and folded its
// findings into this register. Three scopes are kept apart and never summed by
// hand:
//
//   1. the HISTORICAL S1 baseline snapshot — pinned below, recomputed from the
//      entries that carry no `originScope` (or `HISTORICAL_S1_BASELINE`), with the
//      value each revised entry had before the relock taken from its `revision`;
//   2. the DELTA review — entries with `originScope: DELTA_RELOCK`, and the delta
//      findings (family DELTA) they own;
//   3. the RECONCILED register — everything, as it stands.
//
// The delta provenance document (`docs/security/s1-relock-delta.json`) holds
// commit-range facts, call-site linkage and review evidence. It carries no
// severity and no production state of its own; the register is the only place a
// severity or a state is written.

export const RECONCILIATION_VERSION = "s1-reconcile-1";
export const ORIGIN_SCOPES = Object.freeze(["HISTORICAL_S1_BASELINE", "DELTA_RELOCK", "DELTA_RELOCK_2"]);
/** The scope of an entry the SECOND layer opened, and of the revision it may append to an existing risk. */
export const SECOND_SCOPE = "DELTA_RELOCK_2";
export const DELTA_FAMILY = "DELTA";
export const DELTA_SOURCE_DOCUMENT = "docs/security/s1-relock-delta.json";
/** The supplementary relock keeps its own provenance document; the first-layer document is never rewritten by it. */
export const SECOND_DELTA_SOURCE_DOCUMENT = "docs/security/s1-second-relock-delta.json";
export const DELTA_SOURCE_DOCUMENTS = Object.freeze([DELTA_SOURCE_DOCUMENT, SECOND_DELTA_SOURCE_DOCUMENT]);
export const DELTA_FINDING_PREFIX = "DELTA-";
/** A second-layer finding identifier is DELTA-RS-nnn; every other delta finding belongs to the first layer. */
export const SECOND_LAYER_FINDING_PREFIX = "DELTA-RS-";
export const deltaLayerOfId = (id) => (String(id).startsWith(SECOND_LAYER_FINDING_PREFIX) ? "SECOND" : "FIRST");
export const deltaSourceOfId = (id) => (deltaLayerOfId(id) === "SECOND" ? SECOND_DELTA_SOURCE_DOCUMENT : DELTA_SOURCE_DOCUMENT);

/** The closed dispositions a delta finding can receive, and the register status each one maps to. */
export const DELTA_DISPOSITIONS = Object.freeze([
  "OWNED_BY_NEW_RISK",
  "OWNED_BY_EXISTING_RISK",
  "DUPLICATE",
  "POLICY_AMBIGUITY",
  "ASSURANCE_GAP",
  "NOT_A_RISK",
  "UNPROVEN",
]);
export const DISPOSITION_STATUS = Object.freeze({
  OWNED_BY_NEW_RISK: "MAPPED_TO_RISK",
  OWNED_BY_EXISTING_RISK: "MAPPED_TO_RISK",
  DUPLICATE: "DUPLICATE_OF",
  POLICY_AMBIGUITY: "POLICY_QUESTION",
  ASSURANCE_GAP: "ASSURANCE_GAP",
  NOT_A_RISK: "NOT_A_SECURITY_RISK_WITH_REASON",
  UNPROVEN: "ASSURANCE_GAP",
});

/**
 * The historical snapshot, pinned. These are the figures the frozen register had at
 * the security head; they are recomputed from the register on every run and must
 * equal this pin, so neither a hand edit of a historical entry nor a quiet change
 * of the pin passes.
 */
export const HISTORICAL_SNAPSHOT_PIN = Object.freeze({
  sourceSha: "bcf3be9aa51f8d9f8f75e5568a2e4efea5f8fbd2",
  registerFileSha256: "8ef30aeeaa0d64a5a7b1e17d083c15d17dda3730f6c658d004304f6a9026774c",
  risks: 64,
  findings: 161,
  severity: Object.freeze({ CRITICAL: 0, HIGH: 35, MEDIUM: 17, LOW: 1, INFORMATIONAL: 11 }),
  productionState: Object.freeze({
    ACTIVE_CONFIRMED: 24,
    LATENT_CONFIG_GUARDED: 4,
    CODE_CONFIRMED_RUNTIME_UNPROVEN: 12,
    ASSURANCE_GAP: 10,
    POLICY_AMBIGUITY: 3,
    POSITIVE_CONTROL: 11,
  }),
  findingStatus: Object.freeze({
    MAPPED_TO_RISK: 83,
    DUPLICATE_OF: 2,
    POLICY_QUESTION: 7,
    ASSURANCE_GAP: 49,
    POSITIVE_CONTROL: 12,
    NOT_A_SECURITY_RISK_WITH_REASON: 8,
  }),
  severityClamps: 2,
  lockUniverseCount: 51,
  sourceUniverseCount: 110,
  topPriorityRiskId: "R-01",
});

/** The delta and reconciled universes, pinned by count and by the hash of their sorted members. */
export const UNIVERSE_VERSION = "s1-universe-2";
export const DELTA_UNIVERSE_COUNT = 21;
export const DELTA_UNIVERSE_SHA256 = "75ca445d75e223198cdc8234840ec15c31704377b95fe2972540234c3acf7bfa";
export const RECONCILED_UNIVERSE_COUNT = 131;
export const RECONCILED_UNIVERSE_SHA256 = "e33509bdeb51428b8b77f1aaf94a8b936c99d221a5e2af8e5f61a92ac7a5dcb6";

/**
 * The layers inside the delta universe, each pinned on its own. The first-layer pin is the universe the first relock
 * closed with; it must keep reproducing after the second layer is added, so a second-layer edit cannot move it.
 */
export const FIRST_DELTA_UNIVERSE_COUNT = 18;
export const FIRST_DELTA_UNIVERSE_SHA256 = "9f7cc023d6b1b5fa71530f51176a819907cad9db8ef996fc13eb76f19b939d76";
export const SECOND_DELTA_UNIVERSE_COUNT = 3;
export const SECOND_DELTA_UNIVERSE_SHA256 = "b5a8ac75f883cea582da040f844400eb2d2379d160eb81b770f880f628c54643";

/**
 * The register as the FIRST relock left it, pinned. The second layer adds findings and links them to existing risks; it
 * changes no value of the first layer, and this snapshot — recomputed with the second layer's findings set aside — must
 * keep equal to the pin. The first-layer integration merge is part of the pin, so the snapshot names the tree it describes.
 */
export const FIRST_RELOCK_SNAPSHOT_PIN = Object.freeze({
  integrationMergeSha: "e3da6f2e928420f78d5ae95d668d7e67ba4e2cb0",
  risks: 73,
  findings: 179,
  severity: Object.freeze({ CRITICAL: 0, HIGH: 36, MEDIUM: 24, LOW: 3, INFORMATIONAL: 10 }),
  productionState: Object.freeze({
    ACTIVE_CONFIRMED: 24,
    LATENT_CONFIG_GUARDED: 4,
    CODE_CONFIRMED_RUNTIME_UNPROVEN: 21,
    ASSURANCE_GAP: 10,
    POLICY_AMBIGUITY: 4,
    POSITIVE_CONTROL: 10,
  }),
  findingStatus: Object.freeze({
    MAPPED_TO_RISK: 99,
    DUPLICATE_OF: 2,
    POLICY_QUESTION: 9,
    ASSURANCE_GAP: 50,
    POSITIVE_CONTROL: 11,
    NOT_A_SECURITY_RISK_WITH_REASON: 8,
  }),
  severityClamps: 2,
  topPriorityRiskId: "R-01",
  deltaUniverseCount: 18,
  deltaUniverseSha256: "9f7cc023d6b1b5fa71530f51176a819907cad9db8ef996fc13eb76f19b939d76",
  sourceUniverseCount: 128,
  sourceUniverseSha256: "06e796b75c8f5f05d1ce464c4eae9db73e52b3ce1e38b3869f528b5971f0d046",
});

export const RECONCILIATION_KEYS = Object.freeze(["version", "historicalSnapshot", "firstRelockSnapshot", "deltaReview", "secondDeltaReview", "reconciledTree"]);
export const HISTORICAL_SNAPSHOT_KEYS = Object.freeze(Object.keys(HISTORICAL_SNAPSHOT_PIN));
export const DELTA_REVIEW_KEYS = Object.freeze([
  "range",
  "frozenSourceSha",
  "securityHeadSha",
  "targetMainSha",
  "integrationMergeSha",
  "provenance",
  "deltaUniverseCount",
  "deltaUniverseSha256",
  "existingRisksTouched",
]);
export const FIRST_RELOCK_SNAPSHOT_KEYS = Object.freeze(Object.keys(FIRST_RELOCK_SNAPSHOT_PIN));
export const SECOND_DELTA_REVIEW_KEYS = Object.freeze([
  "range",
  "originalFrozenSourceSha",
  "frozenSourceSha",
  "securityHeadSha",
  "targetMainSha",
  "integrationMergeSha",
  "provenance",
  "deltaUniverseCount",
  "deltaUniverseSha256",
  "existingRisksTouched",
  "risksOpened",
  "risksRevised",
]);
export const RECONCILED_TREE_KEYS = Object.freeze(["base", "assuranceChanges", "universeVersion", "sourceUniverseCount", "sourceUniverseSha256"]);

export const scopeOf = (entry) => entry.originScope ?? "HISTORICAL_S1_BASELINE";
const isDelta = (entry) => scopeOf(entry) === "DELTA_RELOCK" || scopeOf(entry) === SECOND_SCOPE;
const isFirstDelta = (entry) => scopeOf(entry) === "DELTA_RELOCK";
const isSecondDelta = (entry) => scopeOf(entry) === SECOND_SCOPE;

/** The value an entry had before the relock revised it; the entry's own value when it was not revised. */
function historicalView(entry) {
  return entry.revision && entry.revision.scope === "DELTA_RELOCK" ? { ...entry, ...entry.revision.supersedes } : entry;
}

const tally = (items, keys) => {
  const out = Object.fromEntries(keys.map((k) => [k, 0]));
  for (const k of items) out[k] = (out[k] ?? 0) + 1;
  return out;
};

/** Recompute the historical snapshot from the register. */
export function historicalSnapshot(reg) {
  const risks = reg.risks.filter((r) => !isDelta(r)).map(historicalView);
  const findings = reg.findings.filter((f) => !isDelta(f)).map(historicalView);
  const top = [...reg.risks.filter((r) => !isDelta(r))].sort((a, b) => a.remediationPriority - b.remediationPriority)[0];
  return {
    risks: risks.length,
    findings: findings.length,
    severity: tally(risks.map((r) => r.severity), SEVERITIES),
    productionState: tally(risks.map((r) => r.productionState), PRODUCTION_STATES),
    findingStatus: tally(findings.map((f) => f.status), FINDING_STATUSES),
    severityClamps: risks.filter((r) => r.severityClamp != null).length,
    lockUniverseCount: findings.filter((f) => f.family === "LOCK").length,
    topPriorityRiskId: top ? top.riskId : null,
  };
}

/**
 * The register as the first relock left it, recomputed by setting the second layer's findings aside. A second-layer
 * finding changes no first-layer value, so every field must still equal FIRST_RELOCK_SNAPSHOT_PIN.
 */
/** The value a risk had before the SECOND layer appended to it; the risk's own value when it was not revised. */
export function firstLayerView(entry) {
  return entry.secondLayerRevision && entry.secondLayerRevision.scope === SECOND_SCOPE ? { ...entry, ...entry.secondLayerRevision.supersedes } : entry;
}

export function firstRelockSnapshot(reg, sourceUniverse = null) {
  const findings = reg.findings.filter((f) => deltaLayerOfId(f.findingId) === "FIRST");
  const risksThen = reg.risks.filter((r) => !isSecondDelta(r)).map(firstLayerView);
  const top = [...risksThen].sort((a, b) => a.remediationPriority - b.remediationPriority)[0];
  const deltaIds = findings.filter((f) => f.family === DELTA_FAMILY).map((f) => f.findingId);
  const out = {
    integrationMergeSha: FIRST_RELOCK_SNAPSHOT_PIN.integrationMergeSha,
    risks: risksThen.length,
    findings: findings.length,
    severity: tally(risksThen.map((r) => r.severity), SEVERITIES),
    productionState: tally(risksThen.map((r) => r.productionState), PRODUCTION_STATES),
    findingStatus: tally(findings.map((f) => f.status), FINDING_STATUSES),
    severityClamps: risksThen.filter((r) => r.severityClamp != null).length,
    topPriorityRiskId: top ? top.riskId : null,
    deltaUniverseCount: deltaIds.length,
    deltaUniverseSha256: sha256Hex(universeString(deltaIds)),
    sourceUniverseCount: sourceUniverse ? sourceUniverse.filter((id) => deltaLayerOfId(id) === "FIRST").length : null,
    sourceUniverseSha256: sourceUniverse ? sha256Hex(universeString(sourceUniverse.filter((id) => deltaLayerOfId(id) === "FIRST"))) : null,
  };
  return out;
}

/** Sorted, newline-joined identifiers: the string a universe pin hashes. */
export const universeString = (ids) => [...ids].sort().join("\n");

/** The delta finding identifiers the provenance document declares, prefixed as the register carries them. */
export function deltaDocumentIds(root = REPO_ROOT) {
  const ids = [];
  for (const rel of DELTA_SOURCE_DOCUMENTS) {
    const abs = join(root, ...rel.split("/"));
    if (!existsSync(abs)) return { error: `MISSING_SOURCE_DOCUMENT:${rel}`, ids: [] };
    let doc;
    try {
      doc = JSON.parse(readFileSync(abs, "utf8"));
    } catch {
      return { error: `UNPARSEABLE_SOURCE_DOCUMENT:${rel}`, ids: [] };
    }
    for (const f of doc.findings ?? []) {
      const id = `${DELTA_FINDING_PREFIX}${f.findingId}`;
      // a document may declare only the identifiers of its own layer
      if (deltaSourceOfId(id) !== rel) return { error: `FOREIGN_LAYER_IDENTIFIER:${rel}:${id}`, ids: [] };
      ids.push(id);
    }
  }
  return { error: null, ids };
}

const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);

/**
 * THE SECOND LAYER'S REVISION OF AN EXISTING RISK. Append-only, structured, and derived against the pinned first relock.
 *
 * A second-layer finding may widen what an existing risk covers (RS-001 widened R-65 with the frozen priority list and
 * the customers axis). The risk's body must then SAY so, or its acceptance criteria could be met while the new surface
 * stayed open. The revision records, in one place:
 *
 *   findingIds    the second-layer findings that motivated it (each one is owned by this risk);
 *   supersedes    every value the risk had BEFORE the revision: the factors and the score, the state, and the arrays
 *                 the revision may extend. The first relock's snapshot is recomputed from these values, so the pinned
 *                 73/179 snapshot cannot be moved by the second layer;
 *   factorReview  all nine factors, one by one: the value before, the value now, and why. A factor that did not
 *                 move says why it did not;
 *   reason        what changed in plain words.
 *
 * What it forbids: a revision with no second-layer finding, with a finding of the wrong layer or of another risk, one
 * that removes or rewrites an earlier evidence item, gap, criterion or precondition, one whose recorded "before" is
 * not the risk's pinned past, one whose factor review disagrees with the factors, one that changes no body at all,
 * and one on a risk the second layer itself opened. The score is never typed: the arithmetic gates recompute it from
 * the factors, and a changed factor moves the pinned snapshot only through "supersedes".
 */
export const SECOND_REVISION_KEYS = Object.freeze(["scope", "findingIds", "supersedes", "factorReview", "reason"]);
export const SECOND_REVISION_SUPERSEDES_KEYS = Object.freeze([
  "productionState",
  "confidence",
  "likelihoodFactors",
  "impactFactors",
  "likelihood",
  "impact",
  "score",
  "severity",
  "preconditions",
  "evidence",
  "existingControls",
  "controlGaps",
  "acceptanceCriteria",
  "residualRisk",
]);
export const SECOND_REVISION_FACTOR_KEYS = Object.freeze(["before", "after", "reason"]);

const evidenceKey = (e) => `${e.path}|${e.locator}|${e.note}`;

export function secondLayerRevisionViolations(reg) {
  const out = [];
  const push = (why, extra = {}) => out.push({ why, ...extra });
  const findings = new Map(reg.findings.map((f) => [f.findingId, f]));
  for (const r of reg.risks) {
    const rv = r.secondLayerRevision;
    if (rv === undefined) continue;
    const id = r.riskId;
    if (!isPlainObject(rv)) {
      push("SECOND_REVISION_NOT_AN_OBJECT", { id });
      continue;
    }
    for (const k of Object.keys(rv)) if (!SECOND_REVISION_KEYS.includes(k)) push("UNKNOWN_KEY", { where: `secondLayerRevision of ${id}`, key: k });
    for (const k of SECOND_REVISION_KEYS) if (!(k in rv)) push("MISSING_KEY", { where: `secondLayerRevision of ${id}`, key: k });
    if (rv.scope !== SECOND_SCOPE) push("SECOND_REVISION_SCOPE", { id, found: rv.scope ?? null });
    if (r.revision) push("SECOND_REVISION_WITH_CLASSIC_REVISION", { id });
    if (isSecondDelta(r)) push("SECOND_REVISION_ON_SECOND_LAYER_RISK", { id });
    if (typeof rv.reason !== "string" || rv.reason.trim().length < 30) push("SECOND_REVISION_WITHOUT_REASON", { id });
    const ids = Array.isArray(rv.findingIds) ? rv.findingIds : [];
    if (ids.length === 0) push("SECOND_REVISION_WITHOUT_FINDING", { id });
    for (const fid of ids) {
      const f = findings.get(fid);
      if (!f) push("SECOND_REVISION_UNKNOWN_FINDING", { id, findingId: fid });
      else if (deltaLayerOfId(fid) !== "SECOND") push("SECOND_REVISION_WRONG_LAYER", { id, findingId: fid });
      else if (f.ownerRiskId !== id || !r.sourceFindingIds.includes(fid)) push("SECOND_REVISION_FINDING_NOT_OWNED", { id, findingId: fid });
    }
    const sup = rv.supersedes;
    if (!isPlainObject(sup) || Object.keys(sup).length === 0) {
      push("SECOND_REVISION_WITHOUT_SUPERSEDED_VALUES", { id });
      continue;
    }
    for (const k of Object.keys(sup)) if (!SECOND_REVISION_SUPERSEDES_KEYS.includes(k)) push("UNKNOWN_KEY", { where: `secondLayerRevision.supersedes of ${id}`, key: k });
    for (const k of SECOND_REVISION_SUPERSEDES_KEYS) if (!(k in sup)) push("MISSING_KEY", { where: `secondLayerRevision.supersedes of ${id}`, key: k });
    if (!isPlainObject(sup.likelihoodFactors) || !isPlainObject(sup.impactFactors)) continue;

    // the recorded past is itself arithmetic: its score is what its own factors compute
    const past = derive({ productionState: sup.productionState, likelihoodFactors: sup.likelihoodFactors, impactFactors: sup.impactFactors });
    if (sup.likelihood !== past.likelihood || sup.impact !== past.impact || sup.score !== past.score || sup.severity !== past.severity) push("SECOND_REVISION_SUPERSEDED_ARITHMETIC", { id });

    // the factor review: all nine, one by one, and consistent with both ends
    const review = rv.factorReview;
    if (!isPlainObject(review)) push("SECOND_REVISION_FACTOR_REVIEW_ABSENT", { id });
    else {
      const all = [...LIKELIHOOD_FACTOR_KEYS.map((k) => ["likelihoodFactors", k]), ...IMPACT_FACTOR_KEYS.map((k) => ["impactFactors", k])];
      for (const k of Object.keys(review)) if (!all.some(([, f]) => f === k)) push("UNKNOWN_KEY", { where: `secondLayerRevision.factorReview of ${id}`, key: k });
      for (const [group, k] of all) {
        const e = review[k];
        if (!isPlainObject(e)) {
          push("SECOND_REVISION_FACTOR_NOT_REVIEWED", { id, factor: k });
          continue;
        }
        for (const key of Object.keys(e)) if (!SECOND_REVISION_FACTOR_KEYS.includes(key)) push("UNKNOWN_KEY", { where: `factorReview.${k} of ${id}`, key });
        if (e.before !== sup[group][k]) push("SECOND_REVISION_FACTOR_BEFORE_DIFFERS", { id, factor: k, review: e.before ?? null, recorded: sup[group][k] });
        if (e.after !== r[group][k]) push("SECOND_REVISION_FACTOR_AFTER_DIFFERS", { id, factor: k, review: e.after ?? null, current: r[group][k] });
        if (typeof e.reason !== "string" || e.reason.trim().length < 30) push("SECOND_REVISION_FACTOR_WITHOUT_REASON", { id, factor: k });
      }
    }

    // append-only: nothing earlier is removed, reordered or reworded
    const prefixOf = (field) => {
      const before = Array.isArray(sup[field]) ? sup[field] : [];
      const now = Array.isArray(r[field]) ? r[field] : [];
      return before.length <= now.length && before.every((x, i) => x === now[i]);
    };
    for (const field of ["preconditions", "existingControls", "controlGaps", "acceptanceCriteria"]) {
      if (!prefixOf(field)) push("SECOND_REVISION_NOT_APPEND_ONLY", { id, field });
    }
    const nowEvidence = new Set((r.evidence ?? []).map(evidenceKey));
    if (!Array.isArray(sup.evidence) || !sup.evidence.every((e) => nowEvidence.has(evidenceKey(e)))) push("SECOND_REVISION_NOT_APPEND_ONLY", { id, field: "evidence" });
    if (typeof sup.residualRisk !== "string" || !String(r.residualRisk).startsWith(sup.residualRisk)) push("SECOND_REVISION_NOT_APPEND_ONLY", { id, field: "residualRisk" });
    // and it must DO something: at least one body list grew
    const grew = ["evidence", "controlGaps", "acceptanceCriteria", "preconditions", "existingControls"].some((f) => (r[f] ?? []).length > (sup[f] ?? []).length);
    if (!grew) push("SECOND_REVISION_EMPTY", { id });
  }
  return out;
}

/**
 * The reconciliation gates: scope, snapshot, delta ownership and the revision
 * record. Every row names the rule it breaks.
 */
export function reconciliationViolations(reg, root = REPO_ROOT) {
  const out = [];
  const push = (why, extra = {}) => out.push({ why, ...extra });
  const rec = reg.reconciliation;
  if (!rec || typeof rec !== "object" || Array.isArray(rec)) {
    push("RECONCILIATION_ABSENT");
    return out;
  }
  const keyCheck = (obj, allowed, where) => {
    for (const k of Object.keys(obj)) if (!allowed.includes(k)) push("UNKNOWN_KEY", { where, key: k });
    for (const k of allowed) if (!(k in obj)) push("MISSING_KEY", { where, key: k });
  };
  keyCheck(rec, RECONCILIATION_KEYS, "reconciliation");
  if (rec.version !== RECONCILIATION_VERSION) push("RECONCILIATION_VERSION", { found: rec.version ?? null });

  // 1 — the historical snapshot: stored = pin, and recomputed = pin
  const hs = rec.historicalSnapshot;
  if (!hs || typeof hs !== "object") push("HISTORICAL_SNAPSHOT_ABSENT");
  else {
    keyCheck(hs, HISTORICAL_SNAPSHOT_KEYS, "historicalSnapshot");
    if (!same(hs, HISTORICAL_SNAPSHOT_PIN)) push("HISTORICAL_SNAPSHOT_DIFFERS_FROM_PIN");
  }
  if (reg.sourceSha !== HISTORICAL_SNAPSHOT_PIN.sourceSha) push("SOURCE_SHA_CHANGED", { found: reg.sourceSha });
  const recomputed = historicalSnapshot(reg);
  for (const k of ["risks", "findings", "severity", "productionState", "findingStatus", "severityClamps", "lockUniverseCount", "topPriorityRiskId"]) {
    if (!same(recomputed[k], HISTORICAL_SNAPSHOT_PIN[k])) {
      push("HISTORICAL_SNAPSHOT_NOT_REPRODUCED", { field: k, recomputed: recomputed[k], pinned: HISTORICAL_SNAPSHOT_PIN[k] });
    }
  }

  // 2 — scope on every entry
  for (const r of reg.risks) {
    if (r.originScope !== undefined && !ORIGIN_SCOPES.includes(r.originScope)) push("UNKNOWN_ORIGIN_SCOPE", { id: r.riskId, scope: r.originScope });
  }
  for (const r of reg.risks) {
    if (isSecondDelta(r) && r.revision) push("SECOND_LAYER_RISK_REVISED_CLASSICALLY", { id: r.riskId });
  }
  for (const f of reg.findings) {
    if (f.originScope !== undefined && !ORIGIN_SCOPES.includes(f.originScope)) push("UNKNOWN_ORIGIN_SCOPE", { id: f.findingId, scope: f.originScope });
  }

  // 3 — delta findings: family, id, source, scope, disposition, owner
  const riskById = new Map(reg.risks.map((r) => [r.riskId, r]));
  const deltaFindings = reg.findings.filter((f) => f.family === DELTA_FAMILY);
  const touched = new Set();
  for (const f of reg.findings) {
    const inDeltaFamily = f.family === DELTA_FAMILY;
    if (inDeltaFamily !== isDelta(f)) push("DELTA_FAMILY_SCOPE_MISMATCH", { id: f.findingId });
    if (inDeltaFamily && isDelta(f) && scopeOf(f) !== (deltaLayerOfId(f.findingId) === "SECOND" ? SECOND_SCOPE : "DELTA_RELOCK")) push("DELTA_FINDING_SCOPE_LAYER", { id: f.findingId, scope: scopeOf(f) });
    if (inDeltaFamily !== f.findingId.startsWith(DELTA_FINDING_PREFIX)) push("DELTA_ID_PREFIX", { id: f.findingId });
  }
  for (const f of deltaFindings) {
    if (f.source !== deltaSourceOfId(f.findingId)) push("DELTA_SOURCE", { id: f.findingId, source: f.source });
    if (!DELTA_DISPOSITIONS.includes(f.deltaDisposition)) push("DELTA_DISPOSITION_UNKNOWN", { id: f.findingId, found: f.deltaDisposition ?? null });
    else if (DISPOSITION_STATUS[f.deltaDisposition] !== f.status) {
      push("DELTA_DISPOSITION_STATUS", { id: f.findingId, disposition: f.deltaDisposition, status: f.status });
    }
    const owner = riskById.get(f.ownerRiskId);
    const layer = deltaLayerOfId(f.findingId);
    if (!owner) push("DELTA_FINDING_WITHOUT_OWNER", { id: f.findingId });
    else if (layer === "FIRST") {
      if (f.deltaDisposition === "OWNED_BY_NEW_RISK" && !isFirstDelta(owner)) push("NEW_RISK_DISPOSITION_ON_HISTORICAL_OWNER", { id: f.findingId, owner: owner.riskId });
      else if (f.deltaDisposition === "OWNED_BY_EXISTING_RISK" && isDelta(owner)) push("EXISTING_RISK_DISPOSITION_ON_DELTA_OWNER", { id: f.findingId, owner: owner.riskId });
    } else if (f.deltaDisposition === "OWNED_BY_NEW_RISK" && !isSecondDelta(owner)) {
      // the second layer may open a risk of its own, and only a risk of its own scope is "new" for it
      push("NEW_RISK_DISPOSITION_ON_EXISTING_OWNER", { id: f.findingId, owner: owner.riskId });
    } else if (f.deltaDisposition === "OWNED_BY_EXISTING_RISK" && isSecondDelta(owner)) {
      push("EXISTING_RISK_DISPOSITION_ON_SECOND_LAYER_OWNER", { id: f.findingId, owner: owner.riskId });
    }
    if (owner && !isDelta(owner) && layer === "FIRST") touched.add(owner.riskId);
  }
  // a delta risk may own delta findings only; a historical finding keeps its historical owner
  for (const r of reg.risks.filter(isDelta)) {
    for (const id of r.sourceFindingIds) {
      const f = reg.findings.find((x) => x.findingId === id);
      if (f && f.family !== DELTA_FAMILY) push("DELTA_RISK_OWNS_HISTORICAL_FINDING", { riskId: r.riskId, findingId: id });
      // a risk the SECOND layer opened owns second-layer findings only; a risk of the first layer may also own the second
      // layer's findings (it is an existing risk for them), which is what an extension of it records
      if (f && f.family === DELTA_FAMILY && isSecondDelta(r) && deltaLayerOfId(id) !== "SECOND") push("DELTA_RISK_OWNS_OTHER_LAYER_FINDING", { riskId: r.riskId, findingId: id });
    }
    if (!r.sourceFindingIds.some((id) => id.startsWith(DELTA_FINDING_PREFIX))) push("DELTA_RISK_WITHOUT_DELTA_FINDING", { riskId: r.riskId });
  }

  // 4 — the revision record
  const REVISION_KEYS = ["scope", "supersedes", "reason"];
  for (const e of [...reg.risks.map((r) => ({ id: r.riskId, e: r, kind: "risk" })), ...reg.findings.map((f) => ({ id: f.findingId, e: f, kind: "finding" }))]) {
    if (!e.e.revision) continue;
    const rv = e.e.revision;
    for (const k of Object.keys(rv)) if (!REVISION_KEYS.includes(k)) push("UNKNOWN_KEY", { where: `revision of ${e.id}`, key: k });
    for (const k of REVISION_KEYS) if (!(k in rv)) push("MISSING_KEY", { where: `revision of ${e.id}`, key: k });
    if (rv.scope === "OWNER_POLICY_DECISION" && e.kind === "risk") {
      // an owner decision is recorded on the policy risk itself, delta or historical; it rewrites no historical value
      const decided = isPlainObject(e.e.policy) && e.e.policy.status === "DECIDED";
      if (!decided || ownerDecisionRevisionProblems(e.e).length > 0) push("REVISION_OWNER_DECISION_INVALID", { id: e.id });
    } else {
      if (rv.scope !== "DELTA_RELOCK") push("REVISION_SCOPE", { id: e.id });
      if (isDelta(e.e)) push("REVISION_ON_DELTA_ENTRY", { id: e.id });
    }
    if (typeof rv.reason !== "string" || rv.reason.length < 20) push("REVISION_WITHOUT_REASON", { id: e.id });
    if (!rv.supersedes || typeof rv.supersedes !== "object" || Object.keys(rv.supersedes).length === 0) push("REVISION_WITHOUT_SUPERSEDED_VALUES", { id: e.id });
  }
  const revisedRisks = reg.risks.filter((r) => r.revision?.scope === "DELTA_RELOCK").map((r) => r.riskId);

  // 5 — the delta review block
  const dr = rec.deltaReview;
  if (!dr || typeof dr !== "object") push("DELTA_REVIEW_ABSENT");
  else {
    keyCheck(dr, DELTA_REVIEW_KEYS, "deltaReview");
    for (const k of ["frozenSourceSha", "securityHeadSha", "targetMainSha", "integrationMergeSha"]) {
      if (!/^[0-9a-f]{40}$/.test(dr[k] ?? "")) push("DELTA_REVIEW_SHA", { key: k });
    }
    if (dr.frozenSourceSha !== HISTORICAL_SNAPSHOT_PIN.sourceSha) push("DELTA_REVIEW_FROZEN_SOURCE_DRIFT");
    if (dr.range !== `${dr.frozenSourceSha}..${dr.targetMainSha}`) push("DELTA_REVIEW_RANGE", { found: dr.range ?? null });
    if (dr.provenance !== DELTA_SOURCE_DOCUMENT) push("DELTA_REVIEW_PROVENANCE", { found: dr.provenance ?? null });
    const expectTouched = [...touched, ...revisedRisks.filter((id) => !touched.has(id))].sort();
    if (!same([...(dr.existingRisksTouched ?? [])].sort(), expectTouched)) {
      push("EXISTING_RISKS_TOUCHED_DIFFERS", { stored: dr.existingRisksTouched ?? null, derived: expectTouched });
    }
    const deltaIds = deltaFindings.filter((f) => deltaLayerOfId(f.findingId) === "FIRST").map((f) => f.findingId);
    if (dr.deltaUniverseCount !== deltaIds.length) push("DELTA_UNIVERSE_COUNT_STORED", { stored: dr.deltaUniverseCount, derived: deltaIds.length });
    if (dr.deltaUniverseSha256 !== sha256Hex(universeString(deltaIds))) push("DELTA_UNIVERSE_HASH_STORED");
  }

  // 5b — the first relock, preserved: stored = pin, and recomputed with the second layer set aside = pin
  const frs = rec.firstRelockSnapshot;
  const u2 = extractSourceUniverse(root);
  if (!frs || typeof frs !== "object") push("FIRST_RELOCK_SNAPSHOT_ABSENT");
  else {
    keyCheck(frs, FIRST_RELOCK_SNAPSHOT_KEYS, "firstRelockSnapshot");
    if (!same(frs, FIRST_RELOCK_SNAPSHOT_PIN)) push("FIRST_RELOCK_SNAPSHOT_DIFFERS_FROM_PIN");
  }
  const frRecomputed = firstRelockSnapshot(reg, u2.error ? null : [...u2.ids.keys()]);
  for (const k of FIRST_RELOCK_SNAPSHOT_KEYS) {
    if (!same(frRecomputed[k], FIRST_RELOCK_SNAPSHOT_PIN[k])) push("FIRST_RELOCK_SNAPSHOT_NOT_REPRODUCED", { field: k, recomputed: frRecomputed[k], pinned: FIRST_RELOCK_SNAPSHOT_PIN[k] });
  }
  if (dr && dr.integrationMergeSha !== FIRST_RELOCK_SNAPSHOT_PIN.integrationMergeSha) push("FIRST_RELOCK_MERGE_CHANGED", { found: dr.integrationMergeSha ?? null });

  // 5c — the second delta review block
  const sdr = rec.secondDeltaReview;
  if (!sdr || typeof sdr !== "object") push("SECOND_DELTA_REVIEW_ABSENT");
  else {
    keyCheck(sdr, SECOND_DELTA_REVIEW_KEYS, "secondDeltaReview");
    for (const k of ["originalFrozenSourceSha", "frozenSourceSha", "securityHeadSha", "targetMainSha", "integrationMergeSha"]) {
      if (!/^[0-9a-f]{40}$/.test(sdr[k] ?? "")) push("SECOND_DELTA_REVIEW_SHA", { key: k });
    }
    if (sdr.originalFrozenSourceSha !== HISTORICAL_SNAPSHOT_PIN.sourceSha) push("SECOND_DELTA_REVIEW_ORIGINAL_SOURCE_DRIFT");
    if (dr && sdr.frozenSourceSha !== dr.targetMainSha) push("SECOND_DELTA_REVIEW_BASE_IS_NOT_THE_FIRST_TARGET", { found: sdr.frozenSourceSha ?? null });
    if (sdr.range !== `${sdr.frozenSourceSha}..${sdr.targetMainSha}`) push("SECOND_DELTA_REVIEW_RANGE", { found: sdr.range ?? null });
    if (sdr.provenance !== SECOND_DELTA_SOURCE_DOCUMENT) push("SECOND_DELTA_REVIEW_PROVENANCE", { found: sdr.provenance ?? null });
    const secondFindings = deltaFindings.filter((f) => deltaLayerOfId(f.findingId) === "SECOND");
    const secondIds = secondFindings.map((f) => f.findingId);
    if (sdr.deltaUniverseCount !== secondIds.length) push("SECOND_DELTA_UNIVERSE_COUNT_STORED", { stored: sdr.deltaUniverseCount, derived: secondIds.length });
    if (sdr.deltaUniverseSha256 !== sha256Hex(universeString(secondIds))) push("SECOND_DELTA_UNIVERSE_HASH_STORED");
    // The second layer may OPEN a risk (scope DELTA_RELOCK_2) and may APPEND to an existing one (secondLayerRevision);
    // both are recorded here, derived from the register, and neither moves a value of the first relock's snapshot.
    const existingOwners = [...new Set(secondFindings.map((f) => f.ownerRiskId).filter((id) => riskById.get(id) && !isSecondDelta(riskById.get(id))))].sort();
    if (!same([...(sdr.existingRisksTouched ?? [])].sort(), existingOwners)) push("SECOND_DELTA_RISKS_TOUCHED_DIFFERS", { stored: sdr.existingRisksTouched ?? null, derived: existingOwners });
    const opened = reg.risks.filter(isSecondDelta).map((r) => r.riskId).sort();
    if (!same([...(sdr.risksOpened ?? [])].sort(), opened)) push("SECOND_DELTA_RISKS_OPENED_DIFFERS", { stored: sdr.risksOpened ?? null, derived: opened });
    const revised = reg.risks.filter((r) => r.secondLayerRevision).map((r) => r.riskId).sort();
    if (!same([...(sdr.risksRevised ?? [])].sort(), revised)) push("SECOND_DELTA_RISKS_REVISED_DIFFERS", { stored: sdr.risksRevised ?? null, derived: revised });
    // a classic (first-layer) revision never rides on a risk that owns a second-layer finding
    for (const r of reg.risks) if (r.sourceFindingIds.some((id) => deltaLayerOfId(id) === "SECOND") && r.revision) push("SECOND_LAYER_REVISES_AN_ENTRY", { id: r.riskId });
    for (const v of secondLayerRevisionViolations(reg)) out.push(v);
  }

  // 6 — the reconciled tree block
  const rt = rec.reconciledTree;
  if (!rt || typeof rt !== "object") push("RECONCILED_TREE_ABSENT");
  else {
    keyCheck(rt, RECONCILED_TREE_KEYS, "reconciledTree");
    if (rt.universeVersion !== UNIVERSE_VERSION) push("UNIVERSE_VERSION", { found: rt.universeVersion ?? null });
    if (sdr && rt.base !== sdr.integrationMergeSha) push("RECONCILED_TREE_BASE_IS_NOT_THE_MERGE", { found: rt.base ?? null });
    const u = extractSourceUniverse(root);
    if (!u.error) {
      const ids = [...u.ids.keys()];
      if (rt.sourceUniverseCount !== ids.length) push("RECONCILED_UNIVERSE_COUNT_STORED", { stored: rt.sourceUniverseCount, derived: ids.length });
      if (rt.sourceUniverseSha256 !== sha256Hex(universeString(ids))) push("RECONCILED_UNIVERSE_HASH_STORED");
    }
  }

  // 7 — the delta provenance document agrees with the register (ids and owners)
  const doc = deltaDocumentIds(root);
  if (!doc.error) {
    const registered = new Set(deltaFindings.map((f) => f.findingId));
    for (const id of doc.ids) if (!registered.has(id)) push("DELTA_FINDING_NOT_IN_REGISTER", { id });
    const declared = new Set(doc.ids);
    for (const id of registered) if (!declared.has(id)) push("REGISTER_DELTA_FINDING_NOT_IN_DOCUMENT", { id });
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

// ─────────────────── stale process text (POSTREV-F5-C) ───────────────────

/**
 * A deliverable that still says "must be reconciled with the reviewer's text", points at an
 * open item that was settled, or carries a TODO for a reviewer is describing a process that has
 * ended. The patterns are checked on EVERY line of the register and of the report, not only on
 * the findings a pin names. The one exemption is an explicit, superseded historical quotation:
 * a line that carries the canonical marker.
 */
export const STALE_PROCESS_MARKER = "[SUPERSEDED-QUOTE]";
export const STALE_OPEN_ITEM_PATTERN = /\bOPEN-3\b/;
export const STALE_PROCESS_PATTERNS = Object.freeze([
  /must be reconciled/i,
  /\breviewer(?:'s?|s'?)\s+text\b/i,
  STALE_OPEN_ITEM_PATTERN,
  /\bTODO\b[^.;|"]{0,60}\breviewer/i,
  /pending reviewer evidence/i,
  /temporary adjudication/i,
  /\bto be reconciled\b/i,
]);

/**
 * The text a pattern is judged on is CANONICAL: Unicode compatibility form (NFKC), zero-width and soft-hyphen
 * characters removed, every apostrophe look-alike (right and left single quotation marks, the modifier
 * apostrophes, the prime) folded to an ASCII apostrophe, and every run of whitespace (space, tab, no-break
 * space, line ends) reduced to one space. Consecutive non-blank lines are joined into one run, so a phrase
 * that the editor wrapped across a line is still the phrase. A blank line ends a run.
 */
export const STALE_ZERO_WIDTH = /[\u00ad\u200b\u200c\u200d\u2060\ufeff]/g;
export const STALE_APOSTROPHES = /[\u2018\u2019\u201b\u02bc\u02b9\u2032]/g;
export function canonicalStaleLine(line) {
  return String(line).normalize("NFKC").replace(STALE_ZERO_WIDTH, "").replace(STALE_APOSTROPHES, "'").replace(/\s+/g, " ").trim();
}

export function staleProcessTextHits(text, label, options = {}) {
  const exempt = options.exemptLine ?? (() => false);
  // a line that DEFINES an open item (its id) may name it; a line that points at one may not
  const definesOpenItem = options.openIdLine ?? (() => false);
  const raw = String(text).split(/\r\n|\r|\n/);
  const hits = [];
  const seen = new Set();
  let run = [];
  const flush = () => {
    if (run.length === 0) return;
    const starts = [];
    let flat = "";
    for (const entry of run) {
      flat += (flat === "" ? "" : " ") + entry.c;
      starts.push(flat.length - entry.c.length);
    }
    const lineAt = (offset) => {
      let k = 0;
      for (let j = 0; j < starts.length; j += 1) if (starts[j] <= offset) k = j;
      return k;
    };
    for (const rx of STALE_PROCESS_PATTERNS) {
      const global = new RegExp(rx.source, rx.flags.includes("g") ? rx.flags : rx.flags + "g");
      for (const m of flat.matchAll(global)) {
        const first = lineAt(m.index);
        const last = lineAt(m.index + Math.max(0, m[0].length - 1));
        const span = run.slice(first, last + 1);
        if (span.some((e) => e.line.includes(STALE_PROCESS_MARKER) || exempt(e.line))) continue;
        if (rx === STALE_OPEN_ITEM_PATTERN && definesOpenItem(run[first].line)) {
          // only the id the line DEFINES is exempt: a second item named in the same line is a pointer
          const own = /\bOPEN-\d+\b/.exec(run[first].c);
          if (own && m.index - starts[first] === own.index) continue;
        }
        const key = `${run[first].i}:${rx.source}`;
        if (seen.has(key)) continue;
        seen.add(key);
        hits.push({ label, line: run[first].i + 1, pattern: rx.source, text: run[first].line.trim().slice(0, 90) });
      }
    }
    run = [];
  };
  raw.forEach((line, i) => {
    const c = canonicalStaleLine(line);
    if (c === "") flush();
    else run.push({ i, line, c });
  });
  flush();
  return hits.sort((x, y) => x.line - y.line || (x.pattern < y.pattern ? -1 : 1));
}

export function staleProcessTextViolations(registerText, reportText) {
  return [
    ...staleProcessTextHits(registerText, "docs/security/s1-risk-register.json"),
    ...staleProcessTextHits(reportText, "docs/security/THREAT-MODEL-AND-RISK-REGISTER.md"),
  ];
}

/**
 * The exit-code contract of the closed schema (POSTREV-F5-D). A required key is judged by the FIRST
 * gate that reads it, and the historical gates keep their own codes: an absent acceptance
 * criterion on a CRITICAL or HIGH risk is exit 8, an absent required risk field is exit 9. Every
 * other absent required key, and every unknown key, is exit 29. "A missing key is always 29" is
 * therefore not a promise this tool makes.
 */
export const SCHEMA_KEY_EXIT_CONTRACT =
  "A required key is judged by the first gate that reads it (8 for acceptance criteria of a CRITICAL or HIGH risk, 9 for a required risk field); every other absent required key and every unknown key is exit 29.";

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
    HISTORICAL_S1_RISKS_TOTAL: historicalSnapshot(reg).risks,
    HISTORICAL_S1_FINDINGS_TOTAL: historicalSnapshot(reg).findings,
    DELTA_RISKS_TOTAL: reg.risks.filter(isDelta).length,
    DELTA_FINDINGS_TOTAL: reg.findings.filter(isDelta).length,
    REVISED_HISTORICAL_RISKS: reg.risks.filter((r) => r.revision?.scope === "DELTA_RELOCK").length,
    RECONCILIATION_VIOLATIONS: reconciliationViolations(reg).length,
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
  "HISTORICAL_S1_RISKS_TOTAL",
  "HISTORICAL_S1_FINDINGS_TOTAL",
  "DELTA_RISKS_TOTAL",
  "DELTA_FINDINGS_TOTAL",
  "REVISED_HISTORICAL_RISKS",
  "RECONCILIATION_VIOLATIONS",
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
    if (r.policy) {
      lines.push(`| **Open policy** | ${r.policy.status} (${r.policy.ownerRole}): ${mdCell(r.policy.question)}<br>• ${r.policy.branches.map((b) => mdCell(`${b.branchId}: ${b.condition}`)).join("<br>• ")} |`);
    }
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
  ["S1-RLK-OB-1", "PRECISION", "FIXED", "S0 adjudications and the relock delta document: decision counts, positions, consumers", "relock selftests: derived decision counts, call-site position and consumer gates"],
  ["S1-RLK-OB-2", "BLOCKING", "FIXED", "register: delta family, revision records and the reconciliation block", "reconciliation selftests and exit 28 from the command line"],
  ["S1-RLK-SURVIVORS", "SURVIVOR", "FIXED", "relock checker and its end-to-end tests", "relock mutation campaign, verified by the campaign tool"],
  ["S1-RLK-TEXT", "PRECISION", "FIXED", "register risks R-65 to R-73, R-53 and the relock report", "register arithmetic, ownership and universe gates"],
  ["S1-RLK-SCOPE", "PRECISION", "FIXED", "product-path definitions and the historical-file statement", "relock checker: strict and broad path counts, historical-file gate"],
  ["S1-RLK2-F01", "HIGH", "FIXED", "relock checker: where HEAD may be; campaign tool: the position guard and the reproduction in verify", "position tests on throw-away repositories and the committed-state end-to-end test with a product commit after the merge"],
  ["S1-RLK2-F02", "MEDIUM", "FIXED", "S0 adjudications and scanner: the identity and references of a retry trace", "retry identity selftests, the moved ledger and the old-identifier gates"],
  ["S1-RLK2-F03", "MEDIUM", "FIXED", "relock checker: one strict command-line parser", "parser unit tests and the process-level usage tests"],
  ["S1-RLK2-F04", "MEDIUM", "FIXED", "register: the second layer's structured, append-only revision of R-65 and R-72", "second-layer revision gates and the pinned-snapshot test"],
  ["S1-RLK2-F05", "LOW", "FIXED", "relock delta document: the ledger of every changed path", "ledger gates and the throw-away repository test of added, modified, deleted and renamed paths"],
  ["S1-RLK2-F06", "LOW", "FIXED", "register: DELTA-RS-003 opens R-74, with the conditions the guard must meet", "register arithmetic, ownership, universe and second-layer scope gates"],
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
 * The reconciliation block: the three scopes side by side, every number derived.
 * Nothing here is typed; the historical column comes from the pinned snapshot that
 * `reconciliationViolations` has already proven reproducible, and the reconciled
 * column from the register as it stands.
 */
export function renderReconciliation(reg) {
  const c = counters(reg);
  const rec = reg.reconciliation ?? {};
  const hs = historicalSnapshot(reg);
  const dr = rec.deltaReview ?? {};
  const sdr = rec.secondDeltaReview ?? {};
  const frs = rec.firstRelockSnapshot ?? {};
  const rt = rec.reconciledTree ?? {};
  const short = (sha) => String(sha ?? "").slice(0, 8);
  const L = [];
  L.push("| Scope | Reference | Risks | Findings |");
  L.push("|---|---|---|---|");
  L.push(`| Historical S1 baseline (snapshot) | source state \`${short(HISTORICAL_SNAPSHOT_PIN.sourceSha)}\` | ${hs.risks} | ${hs.findings} |`);
  L.push(`| First relock (snapshot) | integrated tree \`${short(frs.integrationMergeSha)}\` | ${frs.risks ?? 0} | ${frs.findings ?? 0} |`);
  const openedSecond = reg.risks.filter(isSecondDelta).length;
  const revisedSecond = reg.risks.filter((r) => r.secondLayerRevision).length;
  L.push(`| Delta review, first layer | \`${short(dr.frozenSourceSha)}..${short(dr.targetMainSha)}\` | ${reg.risks.filter(isFirstDelta).length} new, ${c.REVISED_HISTORICAL_RISKS} revised | ${dr.deltaUniverseCount ?? 0} |`);
  L.push(`| Delta review, second layer | \`${short(sdr.frozenSourceSha)}..${short(sdr.targetMainSha)}\` | ${openedSecond} new, ${revisedSecond} revised | ${sdr.deltaUniverseCount ?? 0} |`);
  L.push(`| Reconciled register | integrated tree \`${short(sdr.integrationMergeSha)}\` plus ${mdCell(rt.assuranceChanges ?? "")} | ${c.S1_RISKS_TOTAL} | ${c.S1_FINDINGS_TOTAL} |`);
  L.push("");
  L.push("| Severity | Historical snapshot | Reconciled | Change |");
  L.push("|---|---|---|---|");
  const sev = { CRITICAL: c.SEVERITY_CRITICAL, HIGH: c.SEVERITY_HIGH, MEDIUM: c.SEVERITY_MEDIUM, LOW: c.SEVERITY_LOW, INFORMATIONAL: c.SEVERITY_INFORMATIONAL };
  const signed = (n) => (n > 0 ? `+${n}` : String(n));
  for (const s of SEVERITIES) L.push(`| ${s} | ${hs.severity[s]} | ${sev[s]} | ${signed(sev[s] - hs.severity[s])} |`);
  L.push("");
  L.push("| Production state | Historical snapshot | Reconciled | Change |");
  L.push("|---|---|---|---|");
  const cur = tally(reg.risks.map((r) => r.productionState), PRODUCTION_STATES);
  for (const s of PRODUCTION_STATES) L.push(`| ${s} | ${hs.productionState[s]} | ${cur[s]} | ${signed(cur[s] - hs.productionState[s])} |`);
  L.push("");
  L.push("| Finding status | Historical snapshot | Reconciled | Change |");
  L.push("|---|---|---|---|");
  const curStatus = tally(reg.findings.map((f) => f.status), FINDING_STATUSES);
  for (const s of FINDING_STATUSES) L.push(`| ${s} | ${hs.findingStatus[s]} | ${curStatus[s]} | ${signed(curStatus[s] - hs.findingStatus[s])} |`);
  L.push("");
  const topNow = [...reg.risks].sort((a, b) => a.remediationPriority - b.remediationPriority)[0];
  const rowsRevisedBySecond = reg.risks.filter((r) => r.secondLayerRevision).sort((a, b) => a.riskId.localeCompare(b.riskId));
  L.push(
    `Severity clamps: ${hs.severityClamps} historical, ${c.SEVERITY_CLAMPS_APPLIED} reconciled. ` +
      `Top remediation priority: \`${hs.topPriorityRiskId}\` historical, \`${topNow.riskId}\` reconciled` +
      ` (${hs.topPriorityRiskId === topNow.riskId ? "unchanged" : "CHANGED"}).`,
  );
  L.push("");
  L.push("| Reconciled priority | Risk | Severity | Score | Scope |");
  L.push("|---|---|---|---|---|");
  for (const r of [...reg.risks].sort((a, b) => a.remediationPriority - b.remediationPriority).slice(0, 10)) {
    L.push(`| ${r.remediationPriority} | \`${r.riskId}\` | **${r.severity}** | ${r.score} | ${scopeOf(r)} |`);
  }
  L.push("");
  const lockCount = reg.findings.filter((f) => f.family === "LOCK").length;
  L.push(
    `Source universe (\`${rt.universeVersion ?? ""}\`): historical ${HISTORICAL_SNAPSHOT_PIN.sourceUniverseCount} identifiers + ${HISTORICAL_SNAPSHOT_PIN.lockUniverseCount} bookkeeping = ${hs.findings}; ` +
      `delta ${dr.deltaUniverseCount ?? 0} first layer + ${sdr.deltaUniverseCount ?? 0} second layer; reconciled ${rt.sourceUniverseCount ?? 0} identifiers + ${lockCount} bookkeeping = ${reg.findings.length}. ` +
      `Reconciled universe hash \`${rt.sourceUniverseSha256 ?? ""}\`.`,
  );
  L.push("");
  L.push("| Delta finding | Disposition | Canonical risk | Severity | Production state | Score |");
  L.push("|---|---|---|---|---|---|");
  for (const f of reg.findings.filter((x) => x.family === DELTA_FAMILY).sort((a, b) => a.findingId.localeCompare(b.findingId))) {
    const o = reg.risks.find((r) => r.riskId === f.ownerRiskId);
    L.push(
      `| \`${f.findingId}\` | ${f.deltaDisposition} | \`${f.ownerRiskId}\` | **${o ? o.severity : "?"}** | ${o ? o.productionState : "?"} | ${o ? o.score : "?"} |`,
    );
  }
  L.push("");
  L.push("| Revised or touched historical entry | Before the relock | Now | Why |");
  L.push("|---|---|---|---|");
  for (const r of reg.risks.filter((x) => !isDelta(x) && (x.revision?.scope === "DELTA_RELOCK" || x.sourceFindingIds.some((id) => id.startsWith(DELTA_FINDING_PREFIX)))).sort((a, b) => a.riskId.localeCompare(b.riskId))) {
    if (r.revision?.scope === "DELTA_RELOCK") {
      const was = r.revision.supersedes;
      L.push(
        `| \`${r.riskId}\` | ${was.productionState} / ${was.severity} (score ${was.score}) | ${r.productionState} / ${r.severity} (score ${r.score}) | ${mdCell(r.revision.reason)} |`,
      );
    } else {
      L.push(
        `| \`${r.riskId}\` | unchanged ${r.productionState} / ${r.severity} (score ${r.score}) | owns ${r.sourceFindingIds.filter((id) => id.startsWith(DELTA_FINDING_PREFIX)).map((id) => `\`${id}\``).join(" ")} | A delta finding falls under this existing risk; its score is not moved. |`,
      );
    }
  }
  for (const f of reg.findings.filter((x) => !isDelta(x) && x.revision).sort((a, b) => a.findingId.localeCompare(b.findingId))) {
    L.push(`| \`${f.findingId}\` | status ${f.revision.supersedes.status} | status ${f.status} | ${mdCell(f.revision.reason)} |`);
  }
  if (rowsRevisedBySecond.length > 0) {
    L.push("");
    L.push("| Existing risk extended by the second layer | Evidence, gaps and criteria before | Now | Score before and now | Why |");
    L.push("|---|---|---|---|---|");
    for (const r of rowsRevisedBySecond) {
      const was = r.secondLayerRevision.supersedes;
      L.push(
        `| \`${r.riskId}\` (\`${r.secondLayerRevision.findingIds.join("\`, \`")}\`) | ${was.evidence.length} / ${was.controlGaps.length} / ${was.acceptanceCriteria.length} | ${r.evidence.length} / ${r.controlGaps.length} / ${r.acceptanceCriteria.length} | ${was.score} then ${r.score} (${r.severity}) | ${mdCell(r.secondLayerRevision.reason)} |`,
      );
    }
  }
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
    reconciliation: renderReconciliation(reg),
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
  // the historical snapshot, for narrative that describes the frozen analysis
  const h = historicalSnapshot(reg);
  facts.HIST_S1_RISKS_TOTAL = h.risks;
  facts.HIST_S1_FINDINGS_TOTAL = h.findings;
  facts.HIST_SOURCE_UNIVERSE_COUNT = HISTORICAL_SNAPSHOT_PIN.sourceUniverseCount;
  facts.HIST_SEVERITY_CLAMPS_APPLIED = h.severityClamps;
  for (const k of SEVERITIES) facts[`HIST_SEVERITY_${k}`] = h.severity[k];
  for (const k of PRODUCTION_STATES) facts[`HIST_STATE_${k}`] = h.productionState[k];
  for (const k of FINDING_STATUSES) facts[`HIST_FINDING_STATUS_${k}`] = h.findingStatus[k];
  facts.HIST_LATENT_DESIGN_FLAWS = h.productionState.CODE_CONFIRMED_RUNTIME_UNPROVEN + h.productionState.LATENT_CONFIG_GUARDED;
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
    fingerprint: "TRUTHFULNESS_LEAD" }),
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
  Object.freeze({ id: "RL-01", target: "reconciliation: absent block", description: "a register with no reconciliation block passes",
    find: "push(\"RECONCILIATION_ABSENT\");",
    replace: "void 0;",
    placebo: "push(`RECONCILIATION_ABSENT`);",
    detector: "S1-RLK: a missing reconciliation block is refused",
    fingerprint: "RECON_RECONCILIATION_ABSENT:expected RECONCILIATION_ABSENT" }),
  Object.freeze({ id: "RL-02", target: "reconciliation: unknown key", description: "an unknown key in a reconciliation object is ignored",
    find: "for (const k of Object.keys(obj)) if (!allowed.includes(k)) push(\"UNKNOWN_KEY\", { where, key: k });",
    replace: "void obj;",
    placebo: "for (const k of Object.keys(obj)) if (allowed.indexOf(k) < 0) push(\"UNKNOWN_KEY\", { where, key: k });",
    detector: "S1-RLK: an unknown key in the reconciliation block is refused",
    fingerprint: "RECON_UNKNOWN_KEY:expected UNKNOWN_KEY" }),
  Object.freeze({ id: "RL-03", target: "reconciliation: missing key", description: "a missing key in a reconciliation object is ignored",
    find: "for (const k of allowed) if (!(k in obj)) push(\"MISSING_KEY\", { where, key: k });",
    replace: "void allowed;",
    placebo: "for (const k of allowed) if (!Object.hasOwn(obj, k)) push(\"MISSING_KEY\", { where, key: k });",
    detector: "S1-RLK: a missing key in the reconciliation block is refused",
    fingerprint: "RECON_MISSING_KEY:expected MISSING_KEY" }),
  Object.freeze({ id: "RL-04", target: "reconciliation: version", description: "the reconciliation version is not compared",
    find: "if (rec.version !== RECONCILIATION_VERSION) push(",
    replace: "if (false) push(",
    placebo: "if (!(rec.version === RECONCILIATION_VERSION)) push(",
    detector: "S1-RLK: a reconciliation version drift is refused",
    fingerprint: "RECON_RECONCILIATION_VERSION:expected RECONCILIATION_VERSION" }),
  Object.freeze({ id: "RL-05", target: "reconciliation: snapshot pin", description: "a stored historical snapshot that is not the pin passes",
    find: "if (!same(hs, HISTORICAL_SNAPSHOT_PIN)) push(",
    replace: "if (false) push(",
    placebo: "if (JSON.stringify(hs) !== JSON.stringify(HISTORICAL_SNAPSHOT_PIN)) push(",
    detector: "S1-RLK: a stored snapshot that is not the pin is refused",
    fingerprint: "RECON_HISTORICAL_SNAPSHOT_DIFFERS_FROM_PIN:expected HISTORICAL_SNAPSHOT_DIFFERS_FROM_PIN" }),
  Object.freeze({ id: "RL-06", target: "reconciliation: snapshot recomputed", description: "the historical snapshot is not recomputed from the entries",
    find: "if (!same(recomputed[k], HISTORICAL_SNAPSHOT_PIN[k])) {",
    replace: "if (false) {",
    placebo: "if (JSON.stringify(recomputed[k]) !== JSON.stringify(HISTORICAL_SNAPSHOT_PIN[k])) {",
    detector: "S1-RLK: a historical entry edited without a revision breaks the snapshot",
    fingerprint: "RECON_HISTORICAL_SNAPSHOT_NOT_REPRODUCED:expected HISTORICAL_SNAPSHOT_NOT_REPRODUCED" }),
  Object.freeze({ id: "RL-07", target: "reconciliation: source state", description: "a changed source state passes",
    find: "if (reg.sourceSha !== HISTORICAL_SNAPSHOT_PIN.sourceSha) push(",
    replace: "if (false) push(",
    placebo: "if (!(reg.sourceSha === HISTORICAL_SNAPSHOT_PIN.sourceSha)) push(",
    detector: "S1-RLK: a changed source state is refused",
    fingerprint: "RECON_SOURCE_SHA_CHANGED:expected SOURCE_SHA_CHANGED" }),
  Object.freeze({ id: "RL-08", target: "reconciliation: scope of a risk", description: "an unknown origin scope on a risk passes",
    find: "if (r.originScope !== undefined && !ORIGIN_SCOPES.includes(r.originScope)) push(\"UNKNOWN_ORIGIN_SCOPE\", { id: r.riskId",
    replace: "if (false) push(\"UNKNOWN_ORIGIN_SCOPE\", { id: r.riskId",
    placebo: "if (r.originScope !== undefined && ORIGIN_SCOPES.indexOf(r.originScope) < 0) push(\"UNKNOWN_ORIGIN_SCOPE\", { id: r.riskId",
    detector: "S1-RLK: an unknown origin scope is refused",
    fingerprint: "RECON_UNKNOWN_ORIGIN_SCOPE:expected UNKNOWN_ORIGIN_SCOPE" }),
  Object.freeze({ id: "RL-09", target: "reconciliation: family and scope", description: "a delta-family finding without the delta scope passes",
    find: "if (inDeltaFamily !== isDelta(f)) push(\"DELTA_FAMILY_SCOPE_MISMATCH\"",
    replace: "if (false) push(\"DELTA_FAMILY_SCOPE_MISMATCH\"",
    placebo: "if (isDelta(f) !== inDeltaFamily) push(\"DELTA_FAMILY_SCOPE_MISMATCH\"",
    detector: "S1-RLK: a delta family finding without the delta scope is refused",
    fingerprint: "RECON_DELTA_FAMILY_SCOPE_MISMATCH:expected DELTA_FAMILY_SCOPE_MISMATCH" }),
  Object.freeze({ id: "RL-10", target: "reconciliation: id prefix", description: "a delta finding without the delta prefix passes",
    find: "if (inDeltaFamily !== f.findingId.startsWith(DELTA_FINDING_PREFIX)) push(\"DELTA_ID_PREFIX\"",
    replace: "if (false) push(\"DELTA_ID_PREFIX\"",
    placebo: "if (f.findingId.startsWith(DELTA_FINDING_PREFIX) !== inDeltaFamily) push(\"DELTA_ID_PREFIX\"",
    detector: "S1-RLK: a delta finding without the delta id prefix is refused",
    fingerprint: "RECON_DELTA_ID_PREFIX:expected DELTA_ID_PREFIX" }),
  Object.freeze({ id: "RL-11", target: "reconciliation: provenance source", description: "a delta finding that names another source passes",
    find: "if (f.source !== deltaSourceOfId(f.findingId)) push(\"DELTA_SOURCE\"",
    replace: "if (false) push(\"DELTA_SOURCE\"",
    placebo: "if (!(f.source === deltaSourceOfId(f.findingId))) push(\"DELTA_SOURCE\"",
    detector: "S1-RLK: a delta finding that does not name the provenance document is refused",
    fingerprint: "RECON_DELTA_SOURCE:expected DELTA_SOURCE" }),
  Object.freeze({ id: "RL-12", target: "reconciliation: disposition vocabulary", description: "an unknown disposition passes",
    find: "if (!DELTA_DISPOSITIONS.includes(f.deltaDisposition)) push(",
    replace: "if (false) push(",
    placebo: "if (DELTA_DISPOSITIONS.indexOf(f.deltaDisposition) < 0) push(",
    detector: "S1-RLK: a delta finding without a known disposition is refused",
    fingerprint: "RECON_DELTA_DISPOSITION_UNKNOWN:expected DELTA_DISPOSITION_UNKNOWN" }),
  Object.freeze({ id: "RL-13", target: "reconciliation: disposition and status", description: "a status that does not follow from the disposition passes",
    find: "else if (DISPOSITION_STATUS[f.deltaDisposition] !== f.status) {",
    replace: "else if (false) {",
    placebo: "else if (!(DISPOSITION_STATUS[f.deltaDisposition] === f.status)) {",
    detector: "S1-RLK: a disposition whose status does not follow from it is refused",
    fingerprint: "RECON_DELTA_DISPOSITION_STATUS:expected DELTA_DISPOSITION_STATUS" }),
  Object.freeze({ id: "RL-14", target: "reconciliation: owner exists", description: "a delta finding with no owning risk passes",
    find: "if (!owner) push(\"DELTA_FINDING_WITHOUT_OWNER\"",
    replace: "if (false) push(\"DELTA_FINDING_WITHOUT_OWNER\"",
    placebo: "if (owner === undefined) push(\"DELTA_FINDING_WITHOUT_OWNER\"",
    detector: "S1-RLK: a delta finding without an owning risk is refused",
    fingerprint: "RECON_DELTA_FINDING_WITHOUT_OWNER:expected DELTA_FINDING_WITHOUT_OWNER|Cannot read properties of undefined" }),
  Object.freeze({ id: "RL-15", target: "reconciliation: new-risk owner", description: "a new-risk disposition on a historical owner passes",
    find: "if (f.deltaDisposition === \"OWNED_BY_NEW_RISK\" && !isFirstDelta(owner)) push(\"NEW_RISK_DISPOSITION_ON_HISTORICAL_OWNER\"",
    replace: "if (false) push(\"NEW_RISK_DISPOSITION_ON_HISTORICAL_OWNER\"",
    placebo: "if (f.deltaDisposition === \"OWNED_BY_NEW_RISK\" && isFirstDelta(owner) === false) push(\"NEW_RISK_DISPOSITION_ON_HISTORICAL_OWNER\"",
    detector: "S1-RLK: a new-risk disposition owned by a historical risk is refused",
    fingerprint: "RECON_NEW_RISK_DISPOSITION_ON_HISTORICAL_OWNER:expected NEW_RISK_DISPOSITION_ON_HISTORICAL_OWNER" }),
  Object.freeze({ id: "RL-16", target: "reconciliation: existing-risk owner", description: "an existing-risk disposition on a delta owner passes",
    find: "else if (f.deltaDisposition === \"OWNED_BY_EXISTING_RISK\" && isDelta(owner)) push(\"EXISTING_RISK_DISPOSITION_ON_DELTA_OWNER\"",
    replace: "else if (false) push(\"EXISTING_RISK_DISPOSITION_ON_DELTA_OWNER\"",
    placebo: "else if (f.deltaDisposition === \"OWNED_BY_EXISTING_RISK\" && isDelta(owner) === true) push(\"EXISTING_RISK_DISPOSITION_ON_DELTA_OWNER\"",
    detector: "S1-RLK: an existing-risk disposition owned by a delta risk is refused",
    fingerprint: "RECON_EXISTING_RISK_DISPOSITION_ON_DELTA_OWNER:expected EXISTING_RISK_DISPOSITION_ON_DELTA_OWNER" }),
  Object.freeze({ id: "RL-17", target: "reconciliation: delta risk owns historical finding", description: "a delta risk that owns a historical finding passes",
    find: "if (f && f.family !== DELTA_FAMILY) push(\"DELTA_RISK_OWNS_HISTORICAL_FINDING\"",
    replace: "if (false) push(\"DELTA_RISK_OWNS_HISTORICAL_FINDING\"",
    placebo: "if (f && !(f.family === DELTA_FAMILY)) push(\"DELTA_RISK_OWNS_HISTORICAL_FINDING\"",
    detector: "S1-RLK: a delta risk that owns a historical finding is refused",
    fingerprint: "RECON_DELTA_RISK_OWNS_HISTORICAL_FINDING:expected DELTA_RISK_OWNS_HISTORICAL_FINDING" }),
  Object.freeze({ id: "RL-18", target: "reconciliation: delta risk without delta finding", description: "a delta risk with no delta finding passes",
    find: "if (!r.sourceFindingIds.some((id) => id.startsWith(DELTA_FINDING_PREFIX))) push(",
    replace: "if (false) push(",
    placebo: "if (r.sourceFindingIds.every((id) => !id.startsWith(DELTA_FINDING_PREFIX))) push(",
    detector: "S1-RLK: a delta risk with no delta finding is refused",
    fingerprint: "RECON_DELTA_RISK_WITHOUT_DELTA_FINDING:expected DELTA_RISK_WITHOUT_DELTA_FINDING" }),
  Object.freeze({ id: "RL-19", target: "reconciliation: revision on a delta entry", description: "a revision on a delta entry passes",
    find: "if (isDelta(e.e)) push(\"REVISION_ON_DELTA_ENTRY\"",
    replace: "if (false) push(\"REVISION_ON_DELTA_ENTRY\"",
    placebo: "if (scopeOf(e.e) === \"DELTA_RELOCK\") push(\"REVISION_ON_DELTA_ENTRY\"",
    detector: "S1-RLK: a revision on a delta entry is refused",
    fingerprint: "RECON_REVISION_ON_DELTA_ENTRY:expected REVISION_ON_DELTA_ENTRY" }),
  Object.freeze({ id: "RL-20", target: "reconciliation: revision scope", description: "a revision of another scope passes",
    find: "if (rv.scope !== \"DELTA_RELOCK\") push(",
    replace: "if (false) push(",
    placebo: "if (!(rv.scope === \"DELTA_RELOCK\")) push(",
    detector: "S1-RLK: a revision of another scope is refused",
    fingerprint: "RECON_REVISION_SCOPE:expected REVISION_SCOPE" }),
  Object.freeze({ id: "RL-21", target: "reconciliation: revision reason", description: "a revision with no reason passes",
    find: "if (typeof rv.reason !== \"string\" || rv.reason.length < 20) push(",
    replace: "if (false) push(",
    placebo: "if (!(typeof rv.reason === \"string\" && rv.reason.length >= 20)) push(",
    detector: "S1-RLK: a revision without a reason is refused",
    fingerprint: "RECON_REVISION_WITHOUT_REASON:expected REVISION_WITHOUT_REASON" }),
  Object.freeze({ id: "RL-22", target: "reconciliation: revision preserves", description: "a revision that preserves nothing passes",
    find: "if (!rv.supersedes || typeof rv.supersedes !== \"object\" || Object.keys(rv.supersedes).length === 0) push(",
    replace: "if (false) push(",
    placebo: "if (!rv.supersedes || typeof rv.supersedes !== \"object\" || !Object.keys(rv.supersedes).length) push(",
    detector: "S1-RLK: a revision that preserves nothing is refused",
    fingerprint: "RECON_REVISION_WITHOUT_SUPERSEDED_VALUES:expected REVISION_WITHOUT_SUPERSEDED_VALUES" }),
  Object.freeze({ id: "RL-23", target: "reconciliation: revision keys", description: "an unknown key in a revision passes",
    find: "for (const k of Object.keys(rv)) if (!REVISION_KEYS.includes(k)) push(",
    replace: "for (const k of Object.keys(rv)) if (false) push(",
    placebo: "for (const k of Object.keys(rv)) if (REVISION_KEYS.indexOf(k) < 0) push(",
    detector: "S1-RLK: an unknown key in a revision is refused",
    fingerprint: "RECON_UNKNOWN_KEY:expected UNKNOWN_KEY" }),
  Object.freeze({ id: "RL-24", target: "reconciliation: delta review shas", description: "a malformed commit id in the delta review passes",
    find: "if (!/^[0-9a-f]{40}$/.test(dr[k] ?? \"\")) push(\"DELTA_REVIEW_SHA\"",
    replace: "if (false) push(\"DELTA_REVIEW_SHA\"",
    placebo: "if (!(/^[0-9a-f]{40}$/.test(dr[k] ?? \"\"))) push(\"DELTA_REVIEW_SHA\"",
    detector: "S1-RLK: a malformed commit id in the delta review is refused",
    fingerprint: "RECON_DELTA_REVIEW_SHA:expected DELTA_REVIEW_SHA" }),
  Object.freeze({ id: "RL-25", target: "reconciliation: frozen source", description: "a drifted frozen source passes",
    find: "if (dr.frozenSourceSha !== HISTORICAL_SNAPSHOT_PIN.sourceSha) push(",
    replace: "if (false) push(",
    placebo: "if (!(dr.frozenSourceSha === HISTORICAL_SNAPSHOT_PIN.sourceSha)) push(",
    detector: "S1-RLK: a frozen source that drifted is refused",
    fingerprint: "RECON_DELTA_REVIEW_FROZEN_SOURCE_DRIFT:expected DELTA_REVIEW_FROZEN_SOURCE_DRIFT" }),
  Object.freeze({ id: "RL-26", target: "reconciliation: range", description: "a range that is not frozen..target passes",
    find: "if (dr.range !== `${dr.frozenSourceSha}..${dr.targetMainSha}`) push(",
    replace: "if (false) push(",
    placebo: "if (!(dr.range === `${dr.frozenSourceSha}..${dr.targetMainSha}`)) push(",
    detector: "S1-RLK: a range that is not frozen..target is refused",
    fingerprint: "RECON_DELTA_REVIEW_RANGE:expected DELTA_REVIEW_RANGE" }),
  Object.freeze({ id: "RL-27", target: "reconciliation: provenance pointer", description: "a pointer to another document passes",
    find: "if (dr.provenance !== DELTA_SOURCE_DOCUMENT) push(",
    replace: "if (false) push(",
    placebo: "if (!(dr.provenance === DELTA_SOURCE_DOCUMENT)) push(",
    detector: "S1-RLK: a provenance pointer to another document is refused",
    fingerprint: "RECON_DELTA_REVIEW_PROVENANCE:expected DELTA_REVIEW_PROVENANCE" }),
  Object.freeze({ id: "RL-28", target: "reconciliation: touched existing risks", description: "a touched-risk list that is not the derived one passes",
    find: "if (!same([...(dr.existingRisksTouched ?? [])].sort(), expectTouched)) {",
    replace: "if (false) {",
    placebo: "if (JSON.stringify([...(dr.existingRisksTouched ?? [])].sort()) !== JSON.stringify(expectTouched)) {",
    detector: "S1-RLK: a list of touched existing risks that is not the derived one is refused",
    fingerprint: "RECON_EXISTING_RISKS_TOUCHED_DIFFERS:expected EXISTING_RISKS_TOUCHED_DIFFERS" }),
  Object.freeze({ id: "RL-29", target: "reconciliation: stored delta count", description: "a stored delta universe count that is wrong passes",
    find: "if (dr.deltaUniverseCount !== deltaIds.length) push(",
    replace: "if (false) push(",
    placebo: "if (!(dr.deltaUniverseCount === deltaIds.length)) push(",
    detector: "S1-RLK: a stored delta universe count and hash must be the recomputed ones",
    fingerprint: "RECON_DELTA_UNIVERSE_COUNT_STORED:expected DELTA_UNIVERSE_COUNT_STORED" }),
  Object.freeze({ id: "RL-30", target: "reconciliation: stored delta hash", description: "a stored delta universe hash that is wrong passes",
    find: "if (dr.deltaUniverseSha256 !== sha256Hex(universeString(deltaIds))) push(",
    replace: "if (false) push(",
    placebo: "if (!(dr.deltaUniverseSha256 === sha256Hex(universeString(deltaIds)))) push(",
    detector: "S1-RLK: a stored delta universe count and hash must be the recomputed ones",
    fingerprint: "RECON_DELTA_UNIVERSE_HASH_STORED:expected DELTA_UNIVERSE_HASH_STORED" }),
  Object.freeze({ id: "RL-31", target: "reconciliation: tree block", description: "a missing reconciled tree block passes",
    find: "if (!rt || typeof rt !== \"object\") push(\"RECONCILED_TREE_ABSENT\");",
    replace: "if (false) push(\"RECONCILED_TREE_ABSENT\");",
    placebo: "if (rt === undefined || rt === null || typeof rt !== \"object\") push(\"RECONCILED_TREE_ABSENT\");",
    detector: "S1-RLK: the reconciled tree block is held to its shape, its version and the merge",
    fingerprint: "RECON_RECONCILED_TREE_ABSENT:expected RECONCILED_TREE_ABSENT|Cannot convert undefined or null to object" }),
  Object.freeze({ id: "RL-32", target: "reconciliation: universe version", description: "a universe version drift passes",
    find: "if (rt.universeVersion !== UNIVERSE_VERSION) push(",
    replace: "if (false) push(",
    placebo: "if (!(rt.universeVersion === UNIVERSE_VERSION)) push(",
    detector: "S1-RLK: the reconciled tree block is held to its shape, its version and the merge",
    fingerprint: "RECON_UNIVERSE_VERSION:expected UNIVERSE_VERSION" }),
  Object.freeze({ id: "RL-33", target: "reconciliation: tree base", description: "a tree base that is not the merge passes",
    find: "if (sdr && rt.base !== sdr.integrationMergeSha) push(",
    replace: "if (false) push(",
    placebo: "if (sdr && !(rt.base === sdr.integrationMergeSha)) push(",
    detector: "S1-RLK: the reconciled tree block is held to its shape, its version and the merge",
    fingerprint: "RECON_RECONCILED_TREE_BASE_IS_NOT_THE_MERGE:expected RECONCILED_TREE_BASE_IS_NOT_THE_MERGE" }),
  Object.freeze({ id: "RL-34", target: "reconciliation: stored reconciled count", description: "a stored reconciled universe count that is wrong passes",
    find: "if (rt.sourceUniverseCount !== ids.length) push(",
    replace: "if (false) push(",
    placebo: "if (!(rt.sourceUniverseCount === ids.length)) push(",
    detector: "S1-RLK: the reconciled tree block is held to its shape, its version and the merge",
    fingerprint: "RECON_RECONCILED_UNIVERSE_COUNT_STORED:expected RECONCILED_UNIVERSE_COUNT_STORED" }),
  Object.freeze({ id: "RL-35", target: "reconciliation: stored reconciled hash", description: "a stored reconciled universe hash that is wrong passes",
    find: "if (rt.sourceUniverseSha256 !== sha256Hex(universeString(ids))) push(",
    replace: "if (false) push(",
    placebo: "if (!(rt.sourceUniverseSha256 === sha256Hex(universeString(ids)))) push(",
    detector: "S1-RLK: the reconciled tree block is held to its shape, its version and the merge",
    fingerprint: "RECON_RECONCILED_UNIVERSE_HASH_STORED:expected RECONCILED_UNIVERSE_HASH_STORED" }),
  Object.freeze({ id: "RL-36", target: "reconciliation: document finding absent from register", description: "a delta finding the document declares but the register lacks passes",
    find: "for (const id of doc.ids) if (!registered.has(id)) push(",
    replace: "for (const id of doc.ids) if (false) push(",
    placebo: "for (const id of doc.ids) if (registered.has(id) === false) push(",
    detector: "S1-RLK: a delta finding the register lacks, seen from the provenance document, is refused",
    fingerprint: "RECON_DELTA_FINDING_NOT_IN_REGISTER:expected DELTA_FINDING_NOT_IN_REGISTER" }),
  Object.freeze({ id: "RL-37", target: "reconciliation: register finding absent from document", description: "a register delta finding the document does not declare passes",
    find: "for (const id of registered) if (!declared.has(id)) push(",
    replace: "for (const id of registered) if (false) push(",
    placebo: "for (const id of registered) if (declared.has(id) === false) push(",
    detector: "S1-RLK: a register delta finding the provenance document does not declare is refused",
    fingerprint: "RECON_REGISTER_DELTA_FINDING_NOT_IN_DOCUMENT:expected REGISTER_DELTA_FINDING_NOT_IN_DOCUMENT" }),
  Object.freeze({ id: "RL-38", target: "universe: delta count pin", description: "a changed delta finding count passes",
    find: "if (deltaIds.length !== DELTA_UNIVERSE_COUNT) {",
    replace: "if (false) {",
    placebo: "if (!(deltaIds.length === DELTA_UNIVERSE_COUNT)) {",
    detector: "S1-RLK: a delta finding the register lacks, or the document lacks, is refused",
    fingerprint: "UNIVERSE_DELTA_COUNT:expected DELTA_COUNT_CHANGED" }),
  Object.freeze({ id: "RL-39", target: "universe: delta hash pin", description: "a changed delta finding set of equal size passes",
    find: "if (deltaHash !== DELTA_UNIVERSE_SHA256) {",
    replace: "if (false) {",
    placebo: "if (!(deltaHash === DELTA_UNIVERSE_SHA256)) {",
    detector: "S1-RLK: a renamed delta finding changes the delta universe hash",
    fingerprint: "UNIVERSE_DELTA_HASH:expected DELTA_HASH_CHANGED" }),
  Object.freeze({ id: "RL-40", target: "universe: reconciled count pin", description: "a changed reconciled universe size passes",
    find: "if (extracted.size !== RECONCILED_UNIVERSE_COUNT) {",
    replace: "if (false) {",
    placebo: "if (!(extracted.size === RECONCILED_UNIVERSE_COUNT)) {",
    detector: "S1-RLK: a changed reconciled universe, by count or by hash, is refused",
    fingerprint: "UNIVERSE_RECONCILED_COUNT:expected RECONCILED_COUNT_CHANGED" }),
  Object.freeze({ id: "RL-41", target: "universe: reconciled hash pin", description: "a changed reconciled universe of equal size passes",
    find: "if (reconciledHash !== RECONCILED_UNIVERSE_SHA256) {",
    replace: "if (false) {",
    placebo: "if (!(reconciledHash === RECONCILED_UNIVERSE_SHA256)) {",
    detector: "S1-RLK: a changed reconciled universe, by count or by hash, is refused",
    fingerprint: "UNIVERSE_RECONCILED_HASH:expected RECONCILED_HASH_CHANGED" }),
  Object.freeze({ id: "RL-42", target: "universe: delta ids are extracted", description: "the delta document's identifiers are not part of the source universe",
    find: "for (const id of deltaDoc.ids) add(id, deltaSourceOfId(id));",
    replace: "void deltaDoc;",
    placebo: "for (const id of deltaDoc.ids.slice()) add(id, deltaSourceOfId(id));",
    detector: "S1-RLK: the delta and reconciled universes are pinned by count and hash",
    fingerprint: "UNIVERSE_PIN" }),
  Object.freeze({ id: "RL-43", target: "universe: delta family is a source family", description: "the delta family is not a known family",
    find: "\"A\", \"DB\", \"DELTA\", \"EDGE\"",
    replace: "\"A\", \"DB\", \"EDGE\"",
    placebo: "\"A\", \"DB\", `DELTA`, \"EDGE\"",
    detector: "S1-RLK: the delta and reconciled universes are pinned by count and hash",
    fingerprint: "UNIVERSE_PIN" }),
  Object.freeze({ id: "RL-44", target: "wiring: the reconciliation gate", description: "runGates does not stop on a reconciliation violation",
    find: "if (reconciliation.length) {",
    replace: "if (false) {",
    placebo: "if (reconciliation.length > 0) {",
    detector: "S1-RLK: runGates stops with the reconciliation code, after the universe and before the linkage gate",
    fingerprint: "WIRING_RECON:expected" }),
  Object.freeze({ id: "RL-45", target: "exit: the reconciliation code", description: "the reconciliation exit code collides with another",
    find: "RECONCILIATION: 28,",
    replace: "RECONCILIATION: 27,",
    placebo: "RECONCILIATION: 14 + 14,",
    detector: "S1-RLK: the exit table has a distinct reconciliation code",
    fingerprint: "EXIT_RECON" }),
  Object.freeze({ id: "RL-46", target: "vocabulary: unproven maps to an assurance gap", description: "an unproven delta finding maps to a mapped risk",
    find: "UNPROVEN: \"ASSURANCE_GAP\",",
    replace: "UNPROVEN: \"MAPPED_TO_RISK\",",
    placebo: "UNPROVEN: `ASSURANCE_GAP`,",
    detector: "S1-RLK: the committed register passes every reconciliation gate",
    fingerprint: "RECON_CLEAN" }),
  Object.freeze({ id: "RL-47", target: "counters: delta risks", description: "the delta risk counter counts one too many",
    find: "DELTA_RISKS_TOTAL: reg.risks.filter(isDelta).length,",
    replace: "DELTA_RISKS_TOTAL: reg.risks.filter(isDelta).length + 1,",
    placebo: "DELTA_RISKS_TOTAL: reg.risks.filter((r) => isDelta(r)).length,",
    detector: "S1-RLK: the historical snapshot and the reconciled summary are different numbers, and the difference is exactly the delta",
    fingerprint: "SNAPSHOT_SCOPES" }),
  Object.freeze({ id: "RL-48", target: "facts: historical risks", description: "the historical risk fact is the reconciled figure",
    find: "facts.HIST_S1_RISKS_TOTAL = h.risks;",
    replace: "facts.HIST_S1_RISKS_TOTAL = reg.risks.length;",
    placebo: "facts.HIST_S1_RISKS_TOTAL = h.risks + 0;",
    detector: "S1-RLK: the narrative that describes the historical snapshot uses historical facts, so it cannot be moved by the delta",
    fingerprint: "HIST_FACTS" }),
  Object.freeze({ id: "RL-49", target: "snapshot: revisions are honoured", description: "a revised entry is counted at its current value in the historical snapshot",
    find: "return entry.revision && entry.revision.scope === \"DELTA_RELOCK\" ? { ...entry, ...entry.revision.supersedes } : entry;",
    replace: "return entry;",
    placebo: "return entry.revision !== undefined && entry.revision.scope === \"DELTA_RELOCK\" ? { ...entry, ...entry.revision.supersedes } : entry;",
    detector: "S1-RLK: the committed register passes every reconciliation gate",
    fingerprint: "RECON_CLEAN" }),
  Object.freeze({ id: "RL-50", target: "snapshot: top priority", description: "the historical top priority is the last one, not the first",
    find: "const top = [...reg.risks.filter((r) => !isDelta(r))].sort((a, b) => a.remediationPriority - b.remediationPriority)[0];",
    replace: "const top = [...reg.risks.filter((r) => !isDelta(r))].sort((a, b) => b.remediationPriority - a.remediationPriority)[0];",
    placebo: "const top = [...reg.risks.filter((r) => !isDelta(r))].sort((a, b) => a.remediationPriority - b.remediationPriority).at(0);",
    detector: "S1-RLK: the committed register passes every reconciliation gate",
    fingerprint: "RECON_CLEAN" }),
  Object.freeze({ id: "RL-51", target: "snapshot: clamps counted", description: "a clamped historical risk is not counted",
    find: "severityClamps: risks.filter((r) => r.severityClamp != null).length,",
    replace: "severityClamps: risks.filter((r) => r.severityClamp == null).length,",
    placebo: "severityClamps: risks.filter((r) => r.severityClamp !== null && r.severityClamp !== undefined).length,",
    detector: "S1-RLK: the committed register passes every reconciliation gate",
    fingerprint: "RECON_CLEAN" }),
  Object.freeze({ id: "RL-52", target: "render: reconciled priorities table", description: "the reconciled priorities table lists nine rows",
    find: "remediationPriority - b.remediationPriority).slice(0, 10)) {",
    replace: "remediationPriority - b.remediationPriority).slice(0, 9)) {",
    placebo: "remediationPriority - b.remediationPriority).slice(0, 10).slice()) {",
    detector: "S1-RLK: the reconciliation block of the report is the rendered one, byte for byte",
    fingerprint: "RECON_BLOCK" }),
  Object.freeze({ id: "RL-53", target: "priority: permutation", description: "a gap in the remediation priorities passes",
    find: "if (sorted.some((p, i) => p !== i + 1)) out.push(",
    replace: "if (false) out.push(",
    placebo: "if (sorted.some((p, i) => i + 1 !== p)) out.push(",
    detector: "S1-RLK: a remediation priority with a gap is not a permutation",
    fingerprint: "PRIORITY_GAP" }),
  Object.freeze({ id: "FR04-01", target: "closed schema", description: "an unknown key on a risk is accepted",
    find: "  for (const k of Object.keys(node)) if (!required.includes(k) && !optional.includes(k)) out.push({ where, why: \"UNKNOWN_KEY\", key: k });",
    replace: "  void 0;",
    placebo: "  for (const k of Object.keys(node)) if (!(required.includes(k) || optional.includes(k))) out.push({ where, why: \"UNKNOWN_KEY\", key: k });",
    detector: "FR-04 schema: an unknown key on a risk is refused (UNKNOWN_KEY)",
    fingerprint: "UNKNOWN_KEY on a risk" }),
  Object.freeze({ id: "FR04-02", target: "closed schema", description: "an unknown key on a finding is accepted",
    find: "  for (const k of Object.keys(node)) if (!required.includes(k) && !optional.includes(k)) out.push({ where, why: \"UNKNOWN_KEY\", key: k });",
    replace: "  void 0;",
    placebo: "  for (const k of Object.keys(node)) if (!(required.includes(k) || optional.includes(k))) out.push({ where, why: \"UNKNOWN_KEY\", key: k });",
    detector: "FR-04 schema: an unknown key on a finding is refused (UNKNOWN_KEY)",
    fingerprint: "UNKNOWN_KEY on a finding" }),
  Object.freeze({ id: "FR04-03", target: "closed schema", description: "an unknown key inside a nested structure is accepted",
    find: "  for (const k of Object.keys(node)) if (!required.includes(k) && !optional.includes(k)) out.push({ where, why: \"UNKNOWN_KEY\", key: k });",
    replace: "  void 0;",
    placebo: "  for (const k of Object.keys(node)) if (!(required.includes(k) || optional.includes(k))) out.push({ where, why: \"UNKNOWN_KEY\", key: k });",
    detector: "FR-04 schema: an unknown key inside a nested structure is refused (UNKNOWN_KEY)",
    fingerprint: "UNKNOWN_KEY: " }),
  Object.freeze({ id: "FR04-04", target: "closed schema", description: "a missing required key is accepted",
    find: "  for (const k of required) if (!(k in node)) out.push({ where, why: \"MISSING_KEY\", key: k });",
    replace: "  void 0;",
    placebo: "  for (const k of required) if (!Object.hasOwn(node, k)) out.push({ where, why: \"MISSING_KEY\", key: k });",
    detector: "FR-04 schema: a missing required key is refused (MISSING_KEY)",
    fingerprint: "MISSING_KEY on a risk" }),
  Object.freeze({ id: "FR04-05", target: "closed schema", description: "the risk records are not walked",
    find: "    if (!closedKeys(r, w, RISK_REQUIRED_KEYS, RISK_OPTIONAL_KEYS, out)) continue;",
    replace: "    continue;",
    placebo: "    if (!closedKeys(r, w, RISK_REQUIRED_KEYS, [...RISK_OPTIONAL_KEYS], out)) continue;",
    detector: "FR-04 schema: an unknown key on a risk is refused (UNKNOWN_KEY)",
    fingerprint: "UNKNOWN_KEY on a risk" }),
  Object.freeze({ id: "FR04-06", target: "closed schema", description: "the finding records are not walked",
    find: "    if (!closedKeys(f, w, FINDING_REQUIRED_KEYS, FINDING_OPTIONAL_KEYS, out)) continue;",
    replace: "    continue;",
    placebo: "    if (!closedKeys(f, w, FINDING_REQUIRED_KEYS, [...FINDING_OPTIONAL_KEYS], out)) continue;",
    detector: "FR-04 schema: an unknown key on a finding is refused (UNKNOWN_KEY)",
    fingerprint: "UNKNOWN_KEY on a finding" }),
  Object.freeze({ id: "FR04-07", target: "closed schema", description: "the likelihood factors are not held to their keys",
    find: "    closedKeys(r.likelihoodFactors, `${w} likelihoodFactors`, LIKELIHOOD_FACTOR_KEYS, [], out);",
    replace: "    void 0;",
    placebo: "    closedKeys(r.likelihoodFactors, `${w} likelihoodFactors`, [...LIKELIHOOD_FACTOR_KEYS], [], out);",
    detector: "FR-04 schema: an unknown key inside a nested structure is refused (UNKNOWN_KEY)",
    fingerprint: "UNKNOWN_KEY: likelihoodFactors" }),
  Object.freeze({ id: "FR04-08", target: "closed schema", description: "an evidence item is not held to its keys",
    find: "      if (closedKeys(e, `${w} evidence[${i}]`, EVIDENCE_KEY_ORDER, [], out)) {",
    replace: "      if (false) {",
    placebo: "      if (closedKeys(e, `${w} evidence[${i}]`, [...EVIDENCE_KEY_ORDER], [], out)) {",
    detector: "FR-04 schema: an unknown key inside a nested structure is refused (UNKNOWN_KEY)",
    fingerprint: "UNKNOWN_KEY: evidence" }),
  Object.freeze({ id: "FR04-09", target: "closed schema", description: "the schema gate is not wired into runGates",
    find: "  if (schemaKeys.length) return stop(EXIT.SCHEMA_KEYS,",
    replace: "  if (false) return stop(EXIT.SCHEMA_KEYS,",
    placebo: "  if (schemaKeys.length > 0) return stop(EXIT.SCHEMA_KEYS,",
    detector: "FR-04 wiring: an unknown key stops runGates with exit 29",
    fingerprint: "WIRING:SCHEMA_KEYS expected 29" }),
  Object.freeze({ id: "PF-REQ-R-66", target: "policy", description: "the policy of R-66 is no longer mandatory",
    find: "export const POLICY_REQUIRED_RISKS = Object.freeze([\"R-66\", \"R-72\", \"R-73\"]);",
    replace: "export const POLICY_REQUIRED_RISKS = Object.freeze([\"R-72\", \"R-73\"]);",
    placebo: "export const POLICY_REQUIRED_RISKS = Object.freeze([\"R-66\", \"R-72\", \"R-73\"].slice());",
    detector: "POSTREV-F2 policy: removing the policy of R-66, R-72 or R-73 is refused (POLICY_MISSING)",
    fingerprint: "POLICY_MISSING: R-66" }),
  Object.freeze({ id: "PF-REQ-R-72", target: "policy", description: "the policy of R-72 is no longer mandatory",
    find: "export const POLICY_REQUIRED_RISKS = Object.freeze([\"R-66\", \"R-72\", \"R-73\"]);",
    replace: "export const POLICY_REQUIRED_RISKS = Object.freeze([\"R-66\", \"R-73\"]);",
    placebo: "export const POLICY_REQUIRED_RISKS = Object.freeze([\"R-66\", \"R-72\", \"R-73\"].slice());",
    detector: "POSTREV-F2 policy: removing the policy of R-66, R-72 or R-73 is refused (POLICY_MISSING)",
    fingerprint: "POLICY_MISSING: R-72" }),
  Object.freeze({ id: "PF-REQ-R-73", target: "policy", description: "the policy of R-73 is no longer mandatory",
    find: "export const POLICY_REQUIRED_RISKS = Object.freeze([\"R-66\", \"R-72\", \"R-73\"]);",
    replace: "export const POLICY_REQUIRED_RISKS = Object.freeze([\"R-66\", \"R-72\"]);",
    placebo: "export const POLICY_REQUIRED_RISKS = Object.freeze([\"R-66\", \"R-72\", \"R-73\"].slice());",
    detector: "POSTREV-F2 policy: removing the policy of R-66, R-72 or R-73 is refused (POLICY_MISSING)",
    fingerprint: "POLICY_MISSING: R-73" }),
  Object.freeze({ id: "PF-OPEN", target: "policy", description: "an OPEN policy may carry a decision",
    find: "if (ev !== null) out.push({ riskId: w, why: \"POLICY_OPEN_WITH_DECISION_EVIDENCE\" });",
    replace: "void 0;",
    placebo: "if (ev !== null) out.push({ why: \"POLICY_OPEN_WITH_DECISION_EVIDENCE\", riskId: w });",
    detector: "POSTREV-F2 policy: OPEN must carry no decision and DECIDED must carry real owner evidence",
    fingerprint: "POLICY_OPEN_WITH_DECISION_EVIDENCE" }),
  Object.freeze({ id: "PF-EVIDENCE-EMPTY", target: "policy", description: "empty evidence is accepted",
    find: "if (typeof ev.source !== \"string\" || !ev.source.trim() || typeof ev.anchor !== \"string\" || ev.anchor.trim().length < 12) out.push(",
    replace: "if (false) out.push(",
    placebo: "if (typeof ev.source !== \"string\" || ev.source.trim() === \"\" || typeof ev.anchor !== \"string\" || ev.anchor.trim().length < 12) out.push(",
    detector: "POSTREV-F2 policy: OPEN must carry no decision and DECIDED must carry real owner evidence",
    fingerprint: "POLICY_EVIDENCE_EMPTY" }),
  Object.freeze({ id: "PF-DISTINCT", target: "policy", description: "identical branches are accepted",
    find: "if (sig(p.branches[i], k) === sig(p.branches[j], k)) out.push(",
    replace: "if (false) out.push(",
    placebo: "if (sig(p.branches[j], k) === sig(p.branches[i], k)) out.push(",
    detector: "POSTREV-F2 policy: two branches may not share a condition, a control, a test set or an acceptance set",
    fingerprint: "POLICY_BRANCHES_NOT_DISTINCT" }),
  Object.freeze({ id: "PF-DISTINCT-condition", target: "policy", description: "two branches may share their condition",
    find: "for (const k of [\"condition\", \"requiredControl\", \"requiredTests\", \"acceptanceCriteria\"]) {",
    replace: "for (const k of [\"requiredControl\", \"requiredTests\", \"acceptanceCriteria\"]) {",
    placebo: "for (const k of [\"condition\", \"requiredControl\", \"requiredTests\", \"acceptanceCriteria\"].slice()) {",
    detector: "POSTREV-F2 policy: two branches may not share a condition, a control, a test set or an acceptance set",
    fingerprint: "NOT_DISTINCT: condition" }),
  Object.freeze({ id: "PF-DISTINCT-requiredControl", target: "policy", description: "two branches may share their requiredControl",
    find: "for (const k of [\"condition\", \"requiredControl\", \"requiredTests\", \"acceptanceCriteria\"]) {",
    replace: "for (const k of [\"condition\", \"requiredTests\", \"acceptanceCriteria\"]) {",
    placebo: "for (const k of [\"condition\", \"requiredControl\", \"requiredTests\", \"acceptanceCriteria\"].slice()) {",
    detector: "POSTREV-F2 policy: two branches may not share a condition, a control, a test set or an acceptance set",
    fingerprint: "NOT_DISTINCT: requiredControl" }),
  Object.freeze({ id: "PF-DISTINCT-requiredTests", target: "policy", description: "two branches may share their requiredTests",
    find: "for (const k of [\"condition\", \"requiredControl\", \"requiredTests\", \"acceptanceCriteria\"]) {",
    replace: "for (const k of [\"condition\", \"requiredControl\", \"acceptanceCriteria\"]) {",
    placebo: "for (const k of [\"condition\", \"requiredControl\", \"requiredTests\", \"acceptanceCriteria\"].slice()) {",
    detector: "POSTREV-F2 policy: two branches may not share a condition, a control, a test set or an acceptance set",
    fingerprint: "NOT_DISTINCT: requiredTests" }),
  Object.freeze({ id: "PF-DISTINCT-acceptanceCriteria", target: "policy", description: "two branches may share their acceptanceCriteria",
    find: "for (const k of [\"condition\", \"requiredControl\", \"requiredTests\", \"acceptanceCriteria\"]) {",
    replace: "for (const k of [\"condition\", \"requiredControl\", \"requiredTests\"]) {",
    placebo: "for (const k of [\"condition\", \"requiredControl\", \"requiredTests\", \"acceptanceCriteria\"].slice()) {",
    detector: "POSTREV-F2 policy: two branches may not share a condition, a control, a test set or an acceptance set",
    fingerprint: "NOT_DISTINCT: acceptanceCriteria" }),
  Object.freeze({ id: "PF-TESTS", target: "policy", description: "a branch without a required test is accepted",
    find: "if (tests.length === 0) out.push(",
    replace: "if (false) out.push(",
    placebo: "if (tests.length < 1) out.push(",
    detector: "POSTREV-F2 policy: a branch needs a verification method, an operational test and a testable, non-generic acceptance criterion",
    fingerprint: "POLICY_BRANCH_WITHOUT_REQUIRED_TESTS" }),
  Object.freeze({ id: "PF-TEST-OPERATIONAL", target: "policy", description: "a required test that is a wish is accepted",
    find: "if (typeof t !== \"string\" || t.trim().length < 40 || !POLICY_TEST_VERB.test(t)) out.push(",
    replace: "if (false) out.push(",
    placebo: "if (typeof t !== \"string\" || t.trim().length < 40 || POLICY_TEST_VERB.test(t) === false) out.push(",
    detector: "POSTREV-F2 policy: a branch needs a verification method, an operational test and a testable, non-generic acceptance criterion",
    fingerprint: "POLICY_BRANCH_REQUIRED_TEST_NOT_OPERATIONAL" }),
  Object.freeze({ id: "PF-METHOD", target: "policy", description: "a branch without a verification method is accepted",
    find: "if (!VERIFICATION_METHODS.includes(b?.verificationMethod) || b.verificationMethod === \"NOT_YET_VERIFIABLE\") out.push(",
    replace: "if (false) out.push(",
    placebo: "if (VERIFICATION_METHODS.indexOf(b?.verificationMethod) < 0 || b.verificationMethod === \"NOT_YET_VERIFIABLE\") out.push(",
    detector: "POSTREV-F2 policy: a branch needs a verification method, an operational test and a testable, non-generic acceptance criterion",
    fingerprint: "POLICY_BRANCH_VERIFICATION_METHOD_INVALID" }),
  Object.freeze({ id: "PF-GENERIC", target: "policy", description: "a generic acceptance criterion is accepted",
    find: "else if (generic(a)) out.push({ ...at, why: \"POLICY_BRANCH_ACCEPTANCE_GENERIC\" });",
    replace: "else if (false) out.push({ ...at, why: \"POLICY_BRANCH_ACCEPTANCE_GENERIC\" });",
    placebo: "else if (generic(a) === true) out.push({ ...at, why: \"POLICY_BRANCH_ACCEPTANCE_GENERIC\" });",
    detector: "POSTREV-F2 policy: a branch needs a verification method, an operational test and a testable, non-generic acceptance criterion",
    fingerprint: "POLICY_BRANCH_ACCEPTANCE_GENERIC" }),
  Object.freeze({ id: "PF-TESTABLE", target: "policy", description: "an untestable acceptance criterion is accepted",
    find: "else if (a.length < 100 || !POLICY_OPERATIONAL.test(a)) out.push(",
    replace: "else if (false) out.push(",
    placebo: "else if (a.length < 100 || POLICY_OPERATIONAL.test(a) === false) out.push(",
    detector: "POSTREV-F2 policy: a branch needs a verification method, an operational test and a testable, non-generic acceptance criterion",
    fingerprint: "POLICY_BRANCH_ACCEPTANCE_NOT_TESTABLE" }),
  Object.freeze({ id: "PF-OWNER-ROLE", target: "policy", description: "an unknown owner role is accepted",
    find: "if (!POLICY_OWNER_ROLES.includes(p.ownerRole)) out.push(",
    replace: "if (false) out.push(",
    placebo: "if (POLICY_OWNER_ROLES.indexOf(p.ownerRole) < 0) out.push(",
    detector: "POSTREV-F2 policy: a branch needs a verification method, an operational test and a testable, non-generic acceptance criterion",
    fingerprint: "POLICY_OWNER_ROLE_UNKNOWN" }),
  Object.freeze({ id: "PF-CONDITIONAL", target: "policy", description: "a branch criterion that is not conditional is accepted",
    find: "if (typeof a !== \"string\" || !a.startsWith(POLICY_BRANCH_PREFIX)) out.push({ ...at, why: \"POLICY_BRANCH_ACCEPTANCE_NOT_CONDITIONAL\" });",
    replace: "if (false) out.push({ ...at, why: \"POLICY_BRANCH_ACCEPTANCE_NOT_CONDITIONAL\" });",
    placebo: "if (typeof a !== \"string\" || a.indexOf(POLICY_BRANCH_PREFIX) !== 0) out.push({ ...at, why: \"POLICY_BRANCH_ACCEPTANCE_NOT_CONDITIONAL\" });",
    detector: "FR-06 policy: a branch criterion that is not conditional is refused (POLICY_BRANCH_ACCEPTANCE_NOT_CONDITIONAL)",
    fingerprint: "POLICY_BRANCH_ACCEPTANCE_NOT_CONDITIONAL" }),
  Object.freeze({ id: "PF-LISTED", target: "policy", description: "a branch criterion the risk does not list is accepted",
    find: "else if (!r.acceptanceCriteria.includes(a)) out.push(",
    replace: "else if (false) out.push(",
    placebo: "else if (r.acceptanceCriteria.indexOf(a) < 0) out.push(",
    detector: "FR-06 policy: a branch criterion the risk does not list is refused (POLICY_BRANCH_ACCEPTANCE_NOT_IN_CRITERIA)",
    fingerprint: "POLICY_BRANCH_ACCEPTANCE_NOT_IN_CRITERIA" }),
  Object.freeze({ id: "PF-TWO", target: "policy", description: "a policy with a single branch is accepted",
    find: "if (!Array.isArray(p.branches) || p.branches.length < 2) {",
    replace: "if (!Array.isArray(p.branches) || p.branches.length < 1) {",
    placebo: "if (!Array.isArray(p.branches) || 2 > p.branches.length) {",
    detector: "FR-06 policy: one branch, an unknown status, a missing question or a bare decision request is refused",
    fingerprint: "POLICY_NEEDS_TWO_BRANCHES" }),
  Object.freeze({ id: "PF-STATUS", target: "policy", description: "an unknown policy status is accepted",
    find: "if (!POLICY_STATUSES.includes(p.status)) out.push(",
    replace: "if (false) out.push(",
    placebo: "if (POLICY_STATUSES.indexOf(p.status) < 0) out.push(",
    detector: "FR-06 policy: one branch, an unknown status, a missing question or a bare decision request is refused",
    fingerprint: "POLICY_STATUS_UNKNOWN" }),
  Object.freeze({ id: "PF-WIRE", target: "policy", description: "the policy gate is not wired into runGates",
    find: "  if (policy.length) return stop(EXIT.POLICY,",
    replace: "  if (false) return stop(EXIT.POLICY,",
    placebo: "  if (policy.length > 0) return stop(EXIT.POLICY,",
    detector: "FR-06 wiring: a malformed policy stops runGates with exit 30",
    fingerprint: "WIRING:POLICY expected 30" }),
  Object.freeze({ id: "PF-EVIDENCE-KEYS", target: "closed schema", description: "the owner-decision evidence is not held to its keys",
    find: "      if (r.policy.ownerDecisionEvidence !== null) closedKeys(",
    replace: "      if (false) closedKeys(",
    placebo: "      if (r.policy.ownerDecisionEvidence != null) closedKeys(",
    detector: "FR-04 schema: an unknown key inside a nested structure is refused (UNKNOWN_KEY)",
    fingerprint: "UNKNOWN_KEY: policy evidence" }),
  Object.freeze({ id: "PF-STALE-P1_MUST_BE_RECONCILED", target: "stale text", description: "the stale-text pattern P1 is dropped",
    find: "  /must be reconciled/i,\n",
    replace: "",
    placebo: "  /must be reconciled/i, // pinned\n",
    detector: "POSTREV-F5 stale text: process wording that describes a finished step is refused on every line of both deliverables",
    fingerprint: "STALE_HIT: P1_MUST_BE_RECONCILED" }),
  Object.freeze({ id: "PF-STALE-P3_OPEN_ITEM", target: "stale text", description: "the stale-text pattern P3 is dropped",
    find: "  STALE_OPEN_ITEM_PATTERN,\n",
    replace: "",
    placebo: "  STALE_OPEN_ITEM_PATTERN, // pinned\n",
    detector: "POSTREV-F5 stale text: process wording that describes a finished step is refused on every line of both deliverables",
    fingerprint: "STALE_HIT: P3_OPEN_ITEM" }),
  Object.freeze({ id: "PF-STALE-P5_PENDING_EVIDENCE", target: "stale text", description: "the stale-text pattern P5 is dropped",
    find: "  /pending reviewer evidence/i,\n",
    replace: "",
    placebo: "  /pending reviewer evidence/i, // pinned\n",
    detector: "POSTREV-F5 stale text: process wording that describes a finished step is refused on every line of both deliverables",
    fingerprint: "STALE_HIT: P5_PENDING_EVIDENCE" }),
  Object.freeze({ id: "PF-STALE-P6_TEMPORARY_ADJUDICATION", target: "stale text", description: "the stale-text pattern P6 is dropped",
    find: "  /temporary adjudication/i,\n",
    replace: "",
    placebo: "  /temporary adjudication/i, // pinned\n",
    detector: "POSTREV-F5 stale text: process wording that describes a finished step is refused on every line of both deliverables",
    fingerprint: "STALE_HIT: P6_TEMPORARY_ADJUDICATION" }),
  Object.freeze({ id: "PF-STALE-P7_TO_BE_RECONCILED", target: "stale text", description: "the stale-text pattern P7 is dropped",
    find: "  /\\bto be reconciled\\b/i,\n",
    replace: "",
    placebo: "  /\\bto be reconciled\\b/i, // pinned\n",
    detector: "POSTREV-F5 stale text: process wording that describes a finished step is refused on every line of both deliverables",
    fingerprint: "STALE_HIT: P7_TO_BE_RECONCILED" }),
  Object.freeze({ id: "PF-STALE-WIRE", target: "stale text", description: "the stale-text gate is not wired into runGates",
    find: "  if (stale.length) return stop(EXIT.STALE_TEXT,",
    replace: "  if (false) return stop(EXIT.STALE_TEXT,",
    placebo: "  if (stale.length > 0) return stop(EXIT.STALE_TEXT,",
    detector: "POSTREV-F5 stale text: wiring stops runGates with exit 31",
    fingerprint: "WIRING:STALE_TEXT expected 31" }),
  Object.freeze({ id: "PF-STALE-REGISTER", target: "stale text", description: "the register text is not scanned",
    find: "    ...staleProcessTextHits(registerText, \"docs/security/s1-risk-register.json\"),",
    replace: "",
    placebo: "    ...staleProcessTextHits(String(registerText), \"docs/security/s1-risk-register.json\"),",
    detector: "POSTREV-F5 stale text: process wording that describes a finished step is refused on every line of both deliverables",
    fingerprint: "STALE_REGISTER" }),
  Object.freeze({ id: "PF-STALE-REPORT", target: "stale text", description: "the report text is not scanned",
    find: "    ...staleProcessTextHits(reportText, \"docs/security/THREAT-MODEL-AND-RISK-REGISTER.md\"),",
    replace: "",
    placebo: "    ...staleProcessTextHits(String(reportText), \"docs/security/THREAT-MODEL-AND-RISK-REGISTER.md\"),",
    detector: "POSTREV-F5 stale text: process wording that describes a finished step is refused on every line of both deliverables",
    fingerprint: "STALE_REPORT" }),
  Object.freeze({ id: "PC-DECIDED-BARE", target: "policy", description: "DECIDED without any evidence is accepted",
    find: "  if (!isPlainObject(ev)) return [\"POLICY_DECIDED_WITHOUT_EVIDENCE\"];",
    replace: "  if (!isPlainObject(ev)) return [];",
    placebo: "  if (!isPlainObject(ev)) return [\"POLICY_DECIDED_WITHOUT_EVIDENCE\"]; // pinned",
    detector: "POSTREV-F2 policy: OPEN must carry no decision and DECIDED must carry real owner evidence",
    fingerprint: "POLICY_DECIDED_WITHOUT_EVIDENCE: no evidence" }),
  Object.freeze({ id: "PC-EVIDENCE-SHAPE", target: "policy", description: "evidence without its decider is accepted",
    find: "keys.some((k) => !POLICY_EVIDENCE_KEYS.includes(k))) return [\"POLICY_EVIDENCE_SHAPE\"];",
    replace: "keys.some((k) => !POLICY_EVIDENCE_KEYS.includes(k)) && false) return [\"POLICY_EVIDENCE_SHAPE\"];",
    placebo: "keys.some((k) => !POLICY_EVIDENCE_KEYS.includes(k))) return [\"POLICY_EVIDENCE_SHAPE\"]; /* pinned */",
    detector: "POSTREV-F2 policy: OPEN must carry no decision and DECIDED must carry real owner evidence",
    fingerprint: "POLICY_EVIDENCE_SHAPE: an unknown key" }),
  Object.freeze({ id: "PC-EVIDENCE-SHAPE-MISSING", target: "policy", description: "evidence that lacks a required key is accepted",
    find: "  if (POLICY_EVIDENCE_KEYS.some((k) => !keys.includes(k)) || keys.some(",
    replace: "  if (false || keys.some(",
    placebo: "  if (POLICY_EVIDENCE_KEYS.some((k) => !keys.includes(k)) || keys.some( /* pinned */",
    detector: "POSTREV-F2 policy: OPEN must carry no decision and DECIDED must carry real owner evidence",
    fingerprint: "POLICY_EVIDENCE_SHAPE: no decider" }),
  Object.freeze({ id: "PC-BRANCH-UNKNOWN", target: "policy", description: "a branch the policy does not have is accepted",
    find: "  if (!branchIds.has(ev.decidedBranchId)) out.push(\"POLICY_DECISION_NAMES_AN_UNKNOWN_BRANCH\");",
    replace: "  if (false) out.push(\"POLICY_DECISION_NAMES_AN_UNKNOWN_BRANCH\");",
    placebo: "  if (!branchIds.has(ev.decidedBranchId)) out.push(\"POLICY_DECISION_NAMES_AN_UNKNOWN_BRANCH\"); /* pinned */",
    detector: "POSTREV-F2 policy: OPEN must carry no decision and DECIDED must carry real owner evidence",
    fingerprint: "POLICY_DECISION_NAMES_AN_UNKNOWN_BRANCH: an unknown branch" }),
  Object.freeze({ id: "PC-DECIDER-ROLE", target: "policy", description: "a decision by someone who does not own the policy is accepted",
    find: "  if (ev.decidedByRole !== p.ownerRole) out.push(\"POLICY_DECISION_NOT_BY_THE_OWNER\");",
    replace: "  if (false) out.push(\"POLICY_DECISION_NOT_BY_THE_OWNER\");",
    placebo: "  if (ev.decidedByRole !== p.ownerRole) out.push(\"POLICY_DECISION_NOT_BY_THE_OWNER\"); /* pinned */",
    detector: "POSTREV-F2 policy: OPEN must carry no decision and DECIDED must carry real owner evidence",
    fingerprint: "POLICY_DECISION_NOT_BY_THE_OWNER: decided by someone" }),
  Object.freeze({ id: "PC-ANCHOR", target: "policy", description: "an anchor the evidence file does not contain is accepted",
    find: "      else if (!readFileSync(f.abs, \"utf8\").replace(/\\r\\n?/g, \"\\n\").includes(ev.anchor)) out.push(\"POLICY_EVIDENCE_ANCHOR_ABSENT\");",
    replace: "      else if (false) out.push(\"POLICY_EVIDENCE_ANCHOR_ABSENT\");",
    placebo: "      else if (!readFileSync(f.abs, \"utf8\").replace(/\\r\\n?/g, \"\\n\").includes(ev.anchor)) out.push(\"POLICY_EVIDENCE_ANCHOR_ABSENT\"); /* pinned */",
    detector: "POSTREV-F2 policy: OPEN must carry no decision and DECIDED must carry real owner evidence",
    fingerprint: "POLICY_EVIDENCE_ANCHOR_ABSENT: an anchor the file lacks" }),
  Object.freeze({ id: "PC-FOR-RISK", target: "policy", description: "evidence about another risk is accepted",
    find: "        if (!ev.anchor.includes(r.riskId) || otherRisks.length > 0) out.push(\"POLICY_EVIDENCE_NOT_FOR_THIS_RISK\");",
    replace: "        if (false) out.push(\"POLICY_EVIDENCE_NOT_FOR_THIS_RISK\");",
    placebo: "        if (!ev.anchor.includes(r.riskId) || otherRisks.length > 0) out.push(\"POLICY_EVIDENCE_NOT_FOR_THIS_RISK\"); /* pinned */",
    detector: "PC-F2-02 policy: the evidence must be about THIS risk and THIS branch, the decider the policy's owner, the revision unambiguous",
    fingerprint: "POLICY_EVIDENCE_NOT_FOR_THIS_RISK: an anchor that names" }),
  Object.freeze({ id: "PC-FOR-RISK-OTHERS", target: "policy", description: "evidence that names this risk and another one is accepted",
    find: "if (!ev.anchor.includes(r.riskId) || otherRisks.length > 0) out.push(\"POLICY_EVIDENCE_NOT_FOR_THIS_RISK\");",
    replace: "if (!ev.anchor.includes(r.riskId)) out.push(\"POLICY_EVIDENCE_NOT_FOR_THIS_RISK\");",
    placebo: "if (!ev.anchor.includes(r.riskId) || otherRisks.length > 0) out.push(\"POLICY_EVIDENCE_NOT_FOR_THIS_RISK\"); /* pinned */",
    detector: "PC-F2-02 policy: the evidence must be about THIS risk and THIS branch, the decider the policy's owner, the revision unambiguous",
    fingerprint: "POLICY_EVIDENCE_NOT_FOR_THIS_RISK: an anchor that names this risk and another" }),
  Object.freeze({ id: "PC-FOR-BRANCH", target: "policy", description: "evidence about another branch is accepted",
    find: "        if (!ev.anchor.includes(String(ev.decidedBranchId)) || otherBranches.length > 0) out.push(\"POLICY_EVIDENCE_NOT_FOR_THIS_BRANCH\");",
    replace: "        if (false) out.push(\"POLICY_EVIDENCE_NOT_FOR_THIS_BRANCH\");",
    placebo: "        if (!ev.anchor.includes(String(ev.decidedBranchId)) || otherBranches.length > 0) out.push(\"POLICY_EVIDENCE_NOT_FOR_THIS_BRANCH\"); /* pinned */",
    detector: "PC-F2-02 policy: the evidence must be about THIS risk and THIS branch, the decider the policy's owner, the revision unambiguous",
    fingerprint: "POLICY_EVIDENCE_NOT_FOR_THIS_BRANCH: an anchor that names" }),
  Object.freeze({ id: "PC-FOR-BRANCH-OTHERS", target: "policy", description: "evidence that names the chosen branch and another one is accepted",
    find: "if (!ev.anchor.includes(String(ev.decidedBranchId)) || otherBranches.length > 0) out.push(\"POLICY_EVIDENCE_NOT_FOR_THIS_BRANCH\");",
    replace: "if (!ev.anchor.includes(String(ev.decidedBranchId))) out.push(\"POLICY_EVIDENCE_NOT_FOR_THIS_BRANCH\");",
    placebo: "if (!ev.anchor.includes(String(ev.decidedBranchId)) || otherBranches.length > 0) out.push(\"POLICY_EVIDENCE_NOT_FOR_THIS_BRANCH\"); /* pinned */",
    detector: "PC-F2-02 policy: the evidence must be about THIS risk and THIS branch, the decider the policy's owner, the revision unambiguous",
    fingerprint: "POLICY_EVIDENCE_NOT_FOR_THIS_BRANCH: an anchor that names the chosen branch and another" }),
  Object.freeze({ id: "PC-REV-SCOPE", target: "policy", description: "a revision of another scope records the decision",
    find: "  if (!isPlainObject(rev) || rev.scope !== \"OWNER_POLICY_DECISION\") return [\"POLICY_DECISION_REVISION_MISSING\"];",
    replace: "  if (!isPlainObject(rev) || false) return [\"POLICY_DECISION_REVISION_MISSING\"];",
    placebo: "  if (!isPlainObject(rev) || rev.scope !== \"OWNER_POLICY_DECISION\") return [\"POLICY_DECISION_REVISION_MISSING\"]; /* pinned */",
    detector: "POSTREV-F2 policy: OPEN must carry no decision and DECIDED must carry real owner evidence",
    fingerprint: "POLICY_DECISION_REVISION_MISSING: the wrong revision scope" }),
  Object.freeze({ id: "PC-REV-SUPERSEDES", target: "policy", description: "a revision that rewrites more than the status records the decision",
    find: "  if (!isPlainObject(sup) || Object.keys(sup).length !== 1 || sup.policyStatus !== \"OPEN\") out.push(\"POLICY_DECISION_REVISION_SUPERSEDES\");",
    replace: "  if (false) out.push(\"POLICY_DECISION_REVISION_SUPERSEDES\");",
    placebo: "  if (!isPlainObject(sup) || Object.keys(sup).length !== 1 || sup.policyStatus !== \"OPEN\") out.push(\"POLICY_DECISION_REVISION_SUPERSEDES\"); /* pinned */",
    detector: "PC-F2-02 policy: the evidence must be about THIS risk and THIS branch, the decider the policy's owner, the revision unambiguous",
    fingerprint: "POLICY_DECISION_REVISION_SUPERSEDES: the revision rewrites more" }),
  Object.freeze({ id: "PC-REV-REASON", target: "policy", description: "a revision whose reason names neither the risk nor the branch records the decision",
    find: "  if (reason.length < 20 || !reason.includes(r.riskId) || chosen === null || !reason.includes(chosen)) out.push(\"POLICY_DECISION_REVISION_REASON\");",
    replace: "  if (false) out.push(\"POLICY_DECISION_REVISION_REASON\");",
    placebo: "  if (reason.length < 20 || !reason.includes(r.riskId) || chosen === null || !reason.includes(chosen)) out.push(\"POLICY_DECISION_REVISION_REASON\"); /* pinned */",
    detector: "PC-F2-02 policy: the evidence must be about THIS risk and THIS branch, the decider the policy's owner, the revision unambiguous",
    fingerprint: "POLICY_DECISION_REVISION_REASON: the reason names neither" }),
  Object.freeze({ id: "PC-REV-AMBIGUOUS-BRANCH", target: "policy", description: "a revision that names two branches records the decision",
    find: "  else if (branchIds.some((id) => id !== chosen && reason.includes(id)) || (reason.match(",
    replace: "  else if ((reason.match(",
    placebo: "  else if (branchIds.some((id) => id !== chosen && reason.includes(id) === true) || (reason.match(",
    detector: "PC-F2-02 policy: the evidence must be about THIS risk and THIS branch, the decider the policy's owner, the revision unambiguous",
    fingerprint: "POLICY_DECISION_REVISION_AMBIGUOUS: the reason names two branches" }),
  Object.freeze({ id: "PC-REV-AMBIGUOUS-RISK", target: "policy", description: "a revision that names two risks records the decision",
    find: "|| (reason.match(/\\bR-\\d+\\b/g) ?? []).some((id) => id !== r.riskId)) out.push(\"POLICY_DECISION_REVISION_AMBIGUOUS\");",
    replace: ") out.push(\"POLICY_DECISION_REVISION_AMBIGUOUS\");",
    placebo: "|| (reason.match(/\\bR-\\d+\\b/g) ?? []).some((id) => r.riskId !== id)) out.push(\"POLICY_DECISION_REVISION_AMBIGUOUS\");",
    detector: "PC-F2-02 policy: the evidence must be about THIS risk and THIS branch, the decider the policy's owner, the revision unambiguous",
    fingerprint: "POLICY_DECISION_REVISION_AMBIGUOUS: the reason names two risks" }),
  Object.freeze({ id: "PC-RECON-SCOPE", target: "reconciliation", description: "the reconciliation gate refuses an owner-decision revision",
    find: "    if (rv.scope === \"OWNER_POLICY_DECISION\" && e.kind === \"risk\") {",
    replace: "    if (false) {",
    placebo: "    if (rv.scope === \"OWNER_POLICY_DECISION\" && e.kind === \"risk\" && true) {",
    detector: "PC-F2-02 reconciliation: a valid owner-decision revision is accepted on a delta risk and rewrites no historical value; the others are refused",
    fingerprint: "REVISION_OWNER_DECISION_VALID" }),
  Object.freeze({ id: "PC-RECON-RISK-ONLY", target: "reconciliation", description: "a finding may carry an owner-decision revision",
    find: "    if (rv.scope === \"OWNER_POLICY_DECISION\" && e.kind === \"risk\") {",
    replace: "    if (rv.scope === \"OWNER_POLICY_DECISION\") {",
    placebo: "    if (rv.scope === \"OWNER_POLICY_DECISION\" && e.kind === \"risk\") { /* pinned */",
    detector: "PC-F2-02 reconciliation: a valid owner-decision revision is accepted on a delta risk and rewrites no historical value; the others are refused",
    fingerprint: "REVISION_SCOPE: a finding refuses" }),
  Object.freeze({ id: "PC-RECON-DECIDED", target: "reconciliation", description: "an owner-decision revision on a policy that is still open is accepted",
    find: "      const decided = isPlainObject(e.e.policy) && e.e.policy.status === \"DECIDED\";",
    replace: "      const decided = true;",
    placebo: "      const decided = isPlainObject(e.e.policy) === true && e.e.policy.status === \"DECIDED\";",
    detector: "PC-F2-02 reconciliation: a valid owner-decision revision is accepted on a delta risk and rewrites no historical value; the others are refused",
    fingerprint: "REVISION_OWNER_DECISION_INVALID: an owner revision on a policy that is still OPEN" }),
  Object.freeze({ id: "PC-RECON-PROBLEMS", target: "reconciliation", description: "an owner-decision revision is not judged by the decision contract",
    find: "      if (!decided || ownerDecisionRevisionProblems(e.e).length > 0) push(\"REVISION_OWNER_DECISION_INVALID\", { id: e.id });",
    replace: "      if (!decided) push(\"REVISION_OWNER_DECISION_INVALID\", { id: e.id });",
    placebo: "      if (!decided || ownerDecisionRevisionProblems(e.e).length > 0) push(\"REVISION_OWNER_DECISION_INVALID\", { id: e.id }); /* pinned */",
    detector: "PC-F2-02 reconciliation: a valid owner-decision revision is accepted on a delta risk and rewrites no historical value; the others are refused",
    fingerprint: "REVISION_OWNER_DECISION_INVALID: a revision that rewrites more than the status" }),
  Object.freeze({ id: "PC-TOUCHED-DELTA-ONLY", target: "reconciliation", description: "an owner decision counts as a revision of a historical risk (the touched list)",
    find: "const revisedRisks = reg.risks.filter((r) => r.revision?.scope === \"DELTA_RELOCK\").map((r) => r.riskId);",
    replace: "const revisedRisks = reg.risks.filter((r) => r.revision).map((r) => r.riskId);",
    placebo: "const revisedRisks = reg.risks.filter((r) => r.revision?.scope === \"DELTA_RELOCK\" && true).map((r) => r.riskId);",
    detector: "PC-F2-02 reconciliation: a valid owner-decision revision is accepted on a delta risk and rewrites no historical value; the others are refused",
    fingerprint: "REVISION_OWNER_DECISION_VALID" }),
  Object.freeze({ id: "PC-COUNT-DELTA-ONLY", target: "reconciliation", description: "an owner decision counts as a revised historical risk (the counter)",
    find: "REVISED_HISTORICAL_RISKS: reg.risks.filter((r) => r.revision?.scope === \"DELTA_RELOCK\").length,",
    replace: "REVISED_HISTORICAL_RISKS: reg.risks.filter((r) => r.revision).length,",
    placebo: "REVISED_HISTORICAL_RISKS: reg.risks.filter((r) => r.revision?.scope === \"DELTA_RELOCK\" && true).length,",
    detector: "PC-F2-02 reconciliation: a valid owner-decision revision is accepted on a delta risk and rewrites no historical value; the others are refused",
    fingerprint: "REVISION_OWNER_NOT_COUNTED" }),
  Object.freeze({ id: "PC-PATH-USED", target: "policy", description: "the evidence path is judged as written, not canonical",
    find: "    const c = canonicalEvidencePath(ev.source);",
    replace: "    const c = { rel: ev.source, folded: ev.source };",
    placebo: "    const c = canonicalEvidencePath(ev.source); /* pinned */",
    detector: "PC-F2-01 policy: every spelling of a security deliverable or a tool is a self-reference, whether or not the file exists",
    fingerprint: "POLICY_EVIDENCE_SELF_REFERENCE: docs//security" }),
  Object.freeze({ id: "PC-PATH-FOLD", target: "policy", description: "the comparison form keeps the letter case",
    find: "  return { rel, folded: rel.toLowerCase() };",
    replace: "  return { rel, folded: rel };",
    placebo: "  return { rel, folded: rel.toLowerCase() }; /* pinned */",
    detector: "PC-F2-01 policy: every spelling of a security deliverable or a tool is a self-reference, whether or not the file exists",
    fingerprint: "POLICY_EVIDENCE_SELF_REFERENCE: DOCS/SECURITY" }),
  Object.freeze({ id: "PC-PATH-NFKC", target: "policy", description: "the Unicode form is not normalised",
    find: "  for (const seg of source.normalize(\"NFKC\").split(\"/\")) {",
    replace: "  for (const seg of source.split(\"/\")) {",
    placebo: "  for (const seg of source.normalize(\"NFKC\").split(\"/\")) { /* pinned */",
    detector: "PC-F2-01 policy: every spelling of a security deliverable or a tool is a self-reference, whether or not the file exists",
    fingerprint: "POLICY_EVIDENCE_SELF_REFERENCE: ｄｏｃｓ" }),
  Object.freeze({ id: "PC-PATH-DOTDOT", target: "policy", description: "a parent segment is kept instead of resolved",
    find: "      kept.pop();",
    replace: "      kept.push(seg);",
    placebo: "      kept.pop(); /* pinned */",
    detector: "PC-F2-01 policy: every spelling of a security deliverable or a tool is a self-reference, whether or not the file exists",
    fingerprint: "POLICY_EVIDENCE_SELF_REFERENCE: docs/../scripts" }),
  Object.freeze({ id: "PC-PATH-DOT", target: "policy", description: "a current-directory segment is kept",
    find: "    if (seg === \"\" || seg === \".\") continue;",
    replace: "    if (seg === \"\") continue;",
    placebo: "    if (seg === \"\" || seg === \".\") continue; /* pinned */",
    detector: "PC-F2-01 policy: every spelling of a security deliverable or a tool is a self-reference, whether or not the file exists",
    fingerprint: "POLICY_EVIDENCE_SELF_REFERENCE: docs/security/./s1" }),
  Object.freeze({ id: "PC-PATH-DOUBLE", target: "policy", description: "a doubled separator makes an empty segment that is kept",
    find: "    if (seg === \"\" || seg === \".\") continue;",
    replace: "    if (seg === \".\") continue;",
    placebo: "    if (seg === \"\" || seg === \".\") continue; /* pinned */",
    detector: "PC-F2-01 policy: every spelling of a security deliverable or a tool is a self-reference, whether or not the file exists",
    fingerprint: "POLICY_EVIDENCE_SELF_REFERENCE: docs//security" }),
  Object.freeze({ id: "PC-PATH-ESCAPE", target: "policy", description: "a parent segment may leave the repository",
    find: "      if (kept.length === 0) return { problem: \"POLICY_EVIDENCE_PATH_ESCAPES_ROOT\" };",
    replace: "      if (false) return { problem: \"POLICY_EVIDENCE_PATH_ESCAPES_ROOT\" };",
    placebo: "      if (kept.length === 0) return { problem: \"POLICY_EVIDENCE_PATH_ESCAPES_ROOT\" }; /* pinned */",
    detector: "PC-F2-01 policy: a path the checker cannot read without guessing is refused, a path leaving the repository is refused",
    fingerprint: "POLICY_EVIDENCE_PATH_ESCAPES_ROOT: ../outside.md" }),
  Object.freeze({ id: "PC-PATH-BACKSLASH", target: "policy", description: "a backslash is accepted as a separator",
    find: "  if (/[\\\\\\u0000-\\u001f:*?\"<>|]/.test(source)) return { problem: \"POLICY_EVIDENCE_PATH_AMBIGUOUS\" };",
    replace: "  if (/[\\u0000-\\u001f:*?\"<>|]/.test(source)) return { problem: \"POLICY_EVIDENCE_PATH_AMBIGUOUS\" };",
    placebo: "  if (/[\\\\\\u0000-\\u001f:*?\"<>|]/.test(source)) return { problem: \"POLICY_EVIDENCE_PATH_AMBIGUOUS\" }; /* pinned */",
    detector: "PC-F2-01 policy: a path the checker cannot read without guessing is refused, a path leaving the repository is refused",
    fingerprint: "POLICY_EVIDENCE_PATH_AMBIGUOUS: docs" }),
  Object.freeze({ id: "PC-PATH-RESERVED", target: "policy", description: "a reserved or stream character is accepted",
    find: "  if (/[\\\\\\u0000-\\u001f:*?\"<>|]/.test(source)) return { problem: \"POLICY_EVIDENCE_PATH_AMBIGUOUS\" };",
    replace: "  if (/[\\\\\\u0000-\\u001f]/.test(source)) return { problem: \"POLICY_EVIDENCE_PATH_AMBIGUOUS\" };",
    placebo: "  if (/[\\\\\\u0000-\\u001f:*?\"<>|]/.test(source)) return { problem: \"POLICY_EVIDENCE_PATH_AMBIGUOUS\" }; /* pinned */",
    detector: "PC-F2-01 policy: a path the checker cannot read without guessing is refused, a path leaving the repository is refused",
    fingerprint: "POLICY_EVIDENCE_PATH_AMBIGUOUS: docs/owner/decision.md:stream" }),
  Object.freeze({ id: "PC-PATH-ABSOLUTE", target: "policy", description: "an absolute path is accepted",
    find: "  if (source.startsWith(\"/\") || /^[A-Za-z]:/.test(source)) return { problem: \"POLICY_EVIDENCE_PATH_ABSOLUTE\" };",
    replace: "  if (false) return { problem: \"POLICY_EVIDENCE_PATH_ABSOLUTE\" };",
    placebo: "  if (source.startsWith(\"/\") || /^[A-Za-z]:/.test(source)) return { problem: \"POLICY_EVIDENCE_PATH_ABSOLUTE\" }; /* pinned */",
    detector: "PC-F2-01 policy: a path the checker cannot read without guessing is refused, a path leaving the repository is refused",
    fingerprint: "POLICY_EVIDENCE_PATH_ABSOLUTE: /etc/hosts" }),
  Object.freeze({ id: "PC-PATH-TRAILING", target: "policy", description: "a segment Windows rewrites is accepted",
    find: "    if (/[. ]$/.test(seg)) return { problem: \"POLICY_EVIDENCE_PATH_AMBIGUOUS\" };",
    replace: "    if (false) return { problem: \"POLICY_EVIDENCE_PATH_AMBIGUOUS\" };",
    placebo: "    if (/[. ]$/.test(seg)) return { problem: \"POLICY_EVIDENCE_PATH_AMBIGUOUS\" }; /* pinned */",
    detector: "PC-F2-01 policy: a path the checker cannot read without guessing is refused, a path leaving the repository is refused",
    fingerprint: "POLICY_EVIDENCE_PATH_AMBIGUOUS: docs/owner/decision.md." }),
  Object.freeze({ id: "PC-LINK-ROOT", target: "policy", description: "a link that leaves the repository is followed",
    find: "  if (within === \"\" || within.startsWith(\"..\") || isAbsolute(within)) return { problem: \"POLICY_EVIDENCE_PATH_ESCAPES_ROOT\" };",
    replace: "  if (false) return { problem: \"POLICY_EVIDENCE_PATH_ESCAPES_ROOT\" };",
    placebo: "  if (within === \"\" || within.startsWith(\"..\") || isAbsolute(within)) return { problem: \"POLICY_EVIDENCE_PATH_ESCAPES_ROOT\" }; /* pinned */",
    detector: "PC-F2-01 policy: a link under a permitted folder to a security deliverable is a self-reference",
    fingerprint: "POLICY_LINK_ESCAPES_ROOT" }),
  Object.freeze({ id: "PC-LINK-SELF", target: "policy", description: "a link to a deliverable is not a self-reference",
    find: "  if (POLICY_SELF_REFERENCE.test(within.normalize(\"NFKC\").toLowerCase())) return { problem: \"POLICY_EVIDENCE_SELF_REFERENCE\" };",
    replace: "  if (false) return { problem: \"POLICY_EVIDENCE_SELF_REFERENCE\" };",
    placebo: "  if (POLICY_SELF_REFERENCE.test(within.normalize(\"NFKC\").toLowerCase())) return { problem: \"POLICY_EVIDENCE_SELF_REFERENCE\" }; /* pinned */",
    detector: "PC-F2-01 policy: a link under a permitted folder to a security deliverable is a self-reference",
    fingerprint: "POLICY_LINK_SELF_REFERENCE" }),
  Object.freeze({ id: "PC-NOT-A-FILE", target: "policy", description: "a folder is accepted as evidence",
    find: "  if (!statSync(real).isFile()) return { problem: \"POLICY_EVIDENCE_NOT_A_FILE\" };",
    replace: "  if (false) return { problem: \"POLICY_EVIDENCE_NOT_A_FILE\" };",
    placebo: "  if (!statSync(real).isFile()) return { problem: \"POLICY_EVIDENCE_NOT_A_FILE\" }; /* pinned */",
    detector: "PC-F2-01 policy: a path the checker cannot read without guessing is refused, a path leaving the repository is refused",
    fingerprint: "POLICY_EVIDENCE_NOT_A_FILE: docs/owner|EISDIR" }),
  Object.freeze({ id: "PC-PATH-ABSENT", target: "policy", description: "a path that does not exist is accepted",
    find: "  } catch {\n    return { problem: \"POLICY_EVIDENCE_PATH_ABSENT\" };\n  }",
    replace: "  } catch {\n    return { abs };\n  }",
    placebo: "  } catch {\n    return { problem: \"POLICY_EVIDENCE_PATH_ABSENT\" };\n  } /* pinned */",
    detector: "POSTREV-F2 policy: OPEN must carry no decision and DECIDED must carry real owner evidence",
    fingerprint: "POLICY_EVIDENCE_PATH_ABSENT: an invented path|ENOENT" }),
  Object.freeze({ id: "PC-STALE-NFKC", target: "stale text", description: "the Unicode form is not normalised before matching",
    find: "  return String(line).normalize(\"NFKC\").replace(STALE_ZERO_WIDTH, \"\")",
    replace: "  return String(line).replace(STALE_ZERO_WIDTH, \"\")",
    placebo: "  return String(line).normalize(\"NFKC\").replace(STALE_ZERO_WIDTH, \"\") /* pinned */",
    detector: "PC-F5-01 stale text: a phrase is the phrase in any spelling the editor can produce, and a wrapped phrase is one phrase",
    fingerprint: "STALE_SPELLING: full-width" }),
  Object.freeze({ id: "PC-STALE-ZERO-WIDTH", target: "stale text", description: "zero-width characters are kept",
    find: ".replace(STALE_ZERO_WIDTH, \"\").replace(STALE_APOSTROPHES, \"'\")",
    replace: ".replace(STALE_APOSTROPHES, \"'\")",
    placebo: ".replace(STALE_ZERO_WIDTH, \"\").replace(STALE_APOSTROPHES, \"'\") /* pinned */",
    detector: "PC-F5-01 stale text: a phrase is the phrase in any spelling the editor can produce, and a wrapped phrase is one phrase",
    fingerprint: "STALE_SPELLING: zero-width space" }),
  Object.freeze({ id: "PC-STALE-APOSTROPHE", target: "stale text", description: "apostrophe look-alikes are not folded",
    find: ".replace(STALE_APOSTROPHES, \"'\").replace(/\\s+/g, \" \").trim();",
    replace: ".replace(/\\s+/g, \" \").trim();",
    placebo: ".replace(STALE_APOSTROPHES, \"'\").replace(/\\s+/g, \" \").trim(); /* pinned */",
    detector: "PC-F5-01 stale text: a phrase is the phrase in any spelling the editor can produce, and a wrapped phrase is one phrase",
    fingerprint: "STALE_SPELLING: right single quotation mark" }),
  Object.freeze({ id: "PC-STALE-WHITESPACE", target: "stale text", description: "whitespace runs are not reduced",
    find: ".replace(STALE_APOSTROPHES, \"'\").replace(/\\s+/g, \" \").trim();",
    replace: ".replace(STALE_APOSTROPHES, \"'\").trim();",
    placebo: ".replace(STALE_APOSTROPHES, \"'\").replace(/\\s+/g, \" \").trim(); /* pinned */",
    detector: "PC-F5-01 stale text: a phrase is the phrase in any spelling the editor can produce, and a wrapped phrase is one phrase",
    fingerprint: "STALE_SPELLING: double space" }),
  Object.freeze({ id: "PC-STALE-JOIN", target: "stale text", description: "a wrapped phrase is judged line by line",
    find: "    if (c === \"\") flush();\n    else run.push({ i, line, c });",
    replace: "    if (c === \"\") flush();\n    else { run.push({ i, line, c }); flush(); }",
    placebo: "    if (c === \"\") flush();\n    else run.push({ i, line, c }); /* pinned */",
    detector: "PC-F5-01 stale text: a phrase is the phrase in any spelling the editor can produce, and a wrapped phrase is one phrase",
    fingerprint: "STALE_SPELLING: carriage return|STALE_WRAPPED" }),
  Object.freeze({ id: "PC-STALE-PARAGRAPH", target: "stale text", description: "a blank line does not end a run",
    find: "    if (c === \"\") flush();",
    replace: "    if (c === \"\") void 0;",
    placebo: "    if (c === \"\") flush(); /* pinned */",
    detector: "PC-F5-01 stale text: a phrase is the phrase in any spelling the editor can produce, and a wrapped phrase is one phrase",
    fingerprint: "STALE_PARAGRAPH" }),
  Object.freeze({ id: "PC-STALE-SPAN", target: "stale text", description: "the quotation marker is read on the first line of the phrase only",
    find: "        if (span.some((e) => e.line.includes(STALE_PROCESS_MARKER) || exempt(e.line))) continue;",
    replace: "        if ([run[first]].some((e) => e.line.includes(STALE_PROCESS_MARKER) || exempt(e.line))) continue;",
    placebo: "        if (span.some((e) => e.line.includes(STALE_PROCESS_MARKER) || exempt(e.line))) continue; /* pinned */",
    detector: "PC-F5-01 stale text: a phrase is the phrase in any spelling the editor can produce, and a wrapped phrase is one phrase",
    fingerprint: "STALE_QUOTED_WRAPPED" }),
  Object.freeze({ id: "PC-STALE-REVIEWER", target: "stale text", description: "the possessive pattern is the narrow one again",
    find: "  /\\breviewer(?:'s?|s'?)\\s+text\\b/i,",
    replace: "  /reviewer'?s text/i,",
    placebo: "  /\\breviewer(?:'s?|s'?)\\s+text\\b/i, // pinned",
    detector: "PC-F5-01 stale text: a phrase is the phrase in any spelling the editor can produce, and a wrapped phrase is one phrase",
    fingerprint: "STALE_SPELLING: possessive of the plural|STALE_SPELLING: apostrophe with the s dropped" }),
  Object.freeze({ id: "PC-STALE-OPEN-OWN", target: "stale text", description: "a defining row is exempt for every open item it names",
    find: "          if (own && m.index - starts[first] === own.index) continue;",
    replace: "          if (own) continue;",
    placebo: "          if (own && m.index - starts[first] === own.index) continue; /* pinned */",
    detector: "PC-F5-01 stale text: ordinary wording, the detector's own description and a defining open item are not hits, free narration about an open item is",
    fingerprint: "STALE_OPEN_ROW" }),
  Object.freeze({ id: "PC-STALE-OPEN-LINE", target: "stale text", description: "a defining row is exempt from every pattern",
    find: "        if (rx === STALE_OPEN_ITEM_PATTERN && definesOpenItem(run[first].line)) {",
    replace: "        if (definesOpenItem(run[first].line)) continue;\n        if (rx === STALE_OPEN_ITEM_PATTERN && definesOpenItem(run[first].line)) {",
    placebo: "        if (rx === STALE_OPEN_ITEM_PATTERN && definesOpenItem(run[first].line)) { /* pinned */",
    detector: "PC-F5-01 stale text: ordinary wording, the detector's own description and a defining open item are not hits, free narration about an open item is",
    fingerprint: "STALE_OPEN_NARRATION" }),
  Object.freeze({ id: "PC-STALE-P2_REVIEWER_TEXT", target: "stale text", description: "the stale-text pattern P2 is dropped",
    find: "  /\\breviewer(?:'s?|s'?)\\s+text\\b/i,\n",
    replace: "",
    placebo: "  /\\breviewer(?:'s?|s'?)\\s+text\\b/i, // pinned\n",
    detector: "POSTREV-F5 stale text: process wording that describes a finished step is refused on every line of both deliverables",
    fingerprint: "STALE_HIT: P2_REVIEWER_TEXT" }),
  Object.freeze({ id: "PC-STALE-P4_TODO_REVIEWER", target: "stale text", description: "the stale-text pattern P4 is dropped",
    find: "  /\\bTODO\\b[^.;|\"]{0,60}\\breviewer/i,\n",
    replace: "",
    placebo: "  /\\bTODO\\b[^.;|\"]{0,60}\\breviewer/i, // pinned\n",
    detector: "POSTREV-F5 stale text: process wording that describes a finished step is refused on every line of both deliverables",
    fingerprint: "STALE_HIT: P4_TODO_REVIEWER" }),
  Object.freeze({ id: "RL2-01", target: "layers: the layer is read from the identifier", description: "a second-layer identifier is read as a first-layer one",
    find: "export const deltaLayerOfId = (id) => (String(id).startsWith(SECOND_LAYER_FINDING_PREFIX) ? \"SECOND\" : \"FIRST\");",
    replace: "export const deltaLayerOfId = (id) => (String(id).startsWith(SECOND_LAYER_FINDING_PREFIX) ? \"FIRST\" : \"FIRST\");",
    placebo: "export const deltaLayerOfId = (id) => (`${id}`.startsWith(SECOND_LAYER_FINDING_PREFIX) ? \"SECOND\" : \"FIRST\");",
    detector: "S1-RLK2: a layer is read from the identifier, and each layer has its own document",
    fingerprint: "LAYER_OF_ID:a second-layer finding" }),
  Object.freeze({ id: "RL2-02", target: "layers: each layer has its own document", description: "a second-layer finding is attributed to the first document",
    find: "export const deltaSourceOfId = (id) => (deltaLayerOfId(id) === \"SECOND\" ? SECOND_DELTA_SOURCE_DOCUMENT : DELTA_SOURCE_DOCUMENT);",
    replace: "export const deltaSourceOfId = (id) => (deltaLayerOfId(id) === \"SECOND\" ? DELTA_SOURCE_DOCUMENT : DELTA_SOURCE_DOCUMENT);",
    placebo: "export const deltaSourceOfId = (id) => (deltaLayerOfId(id) !== \"FIRST\" ? SECOND_DELTA_SOURCE_DOCUMENT : DELTA_SOURCE_DOCUMENT);",
    detector: "S1-RLK2: a layer is read from the identifier, and each layer has its own document",
    fingerprint: "LAYER_OF_ID:the second layer's document" }),
  Object.freeze({ id: "RL2-03", target: "layers: a document declares only its own identifiers", description: "a foreign-layer identifier in a delta document passes",
    find: "if (deltaSourceOfId(id) !== rel) return {",
    replace: "if (false) return {",
    placebo: "if (!(deltaSourceOfId(id) === rel)) return {",
    detector: "S1-RLK2: a layer's document may declare only the identifiers of its own layer",
    fingerprint: "FOREIGN_LAYER_IDENTIFIER:expected a foreign-layer identifier to be refused" }),
  Object.freeze({ id: "RL2-04", target: "first relock: snapshot absent", description: "an absent first-relock snapshot passes",
    find: "push(\"FIRST_RELOCK_SNAPSHOT_ABSENT\");",
    replace: "void 0;",
    placebo: "push(\"FIRST_RELOCK_SNAPSHOT_ABSENT\" + \"\");",
    detector: "S1-RLK2: a first-relock snapshot that is absent, stored differently or not reproduced is refused",
    fingerprint: "RECON_FIRST_RELOCK_SNAPSHOT_ABSENT:expected FIRST_RELOCK_SNAPSHOT_ABSENT" }),
  Object.freeze({ id: "RL2-05", target: "first relock: snapshot stored differently", description: "a stored first-relock snapshot that is not the pin passes",
    find: "if (!same(frs, FIRST_RELOCK_SNAPSHOT_PIN)) push(\"FIRST_RELOCK_SNAPSHOT_DIFFERS_FROM_PIN\");",
    replace: "if (false) push(\"FIRST_RELOCK_SNAPSHOT_DIFFERS_FROM_PIN\");",
    placebo: "if (!(same(frs, FIRST_RELOCK_SNAPSHOT_PIN))) push(\"FIRST_RELOCK_SNAPSHOT_DIFFERS_FROM_PIN\");",
    detector: "S1-RLK2: a first-relock snapshot that is absent, stored differently or not reproduced is refused",
    fingerprint: "RECON_FIRST_RELOCK_SNAPSHOT_DIFFERS_FROM_PIN:expected FIRST_RELOCK_SNAPSHOT_DIFFERS_FROM_PIN" }),
  Object.freeze({ id: "RL2-06", target: "first relock: snapshot not reproduced", description: "a first-layer value moved by an edit passes",
    find: "if (!same(frRecomputed[k], FIRST_RELOCK_SNAPSHOT_PIN[k])) push(\"FIRST_RELOCK_SNAPSHOT_NOT_REPRODUCED\"",
    replace: "if (false) push(\"FIRST_RELOCK_SNAPSHOT_NOT_REPRODUCED\"",
    placebo: "if (!(same(frRecomputed[k], FIRST_RELOCK_SNAPSHOT_PIN[k]))) push(\"FIRST_RELOCK_SNAPSHOT_NOT_REPRODUCED\"",
    detector: "S1-RLK2: a first-relock snapshot that is absent, stored differently or not reproduced is refused",
    fingerprint: "RECON_FIRST_RELOCK_SNAPSHOT_NOT_REPRODUCED:expected FIRST_RELOCK_SNAPSHOT_NOT_REPRODUCED" }),
  Object.freeze({ id: "RL2-07", target: "first relock: merge changed", description: "the first-layer integration merge can change",
    find: "if (dr && dr.integrationMergeSha !== FIRST_RELOCK_SNAPSHOT_PIN.integrationMergeSha) push(",
    replace: "if (false) push(",
    placebo: "if (dr && !(dr.integrationMergeSha === FIRST_RELOCK_SNAPSHOT_PIN.integrationMergeSha)) push(",
    detector: "S1-RLK2: a first-relock snapshot that is absent, stored differently or not reproduced is refused",
    fingerprint: "RECON_FIRST_RELOCK_MERGE_CHANGED:expected FIRST_RELOCK_MERGE_CHANGED" }),
  Object.freeze({ id: "RL2-08", target: "first relock: layered recomputation", description: "the first-relock snapshot is recomputed with the second layer included",
    find: "const findings = reg.findings.filter((f) => deltaLayerOfId(f.findingId) === \"FIRST\");",
    replace: "const findings = reg.findings;",
    placebo: "const findings = reg.findings.filter((f) => deltaLayerOfId(f.findingId) !== \"SECOND\");",
    detector: "S1-RLK2: the first relock is a pinned snapshot, and setting the second layer aside reproduces it",
    fingerprint: "FIRST_SNAPSHOT_PIN:the recomputed first-relock snapshot is the pin" }),
  Object.freeze({ id: "RL2-09", target: "second review: block absent", description: "an absent second delta review passes",
    find: "push(\"SECOND_DELTA_REVIEW_ABSENT\");",
    replace: "void 0;",
    placebo: "push(\"SECOND_DELTA_REVIEW_ABSENT\" + \"\");",
    detector: "S1-RLK2: the second delta review block is held to its shape, its range and its universe",
    fingerprint: "RECON_SECOND_DELTA_REVIEW_ABSENT:expected SECOND_DELTA_REVIEW_ABSENT" }),
  Object.freeze({ id: "RL2-10", target: "second review: commit ids", description: "a malformed commit id in the second delta review passes",
    find: "if (!/^[0-9a-f]{40}$/.test(sdr[k] ?? \"\")) push(\"SECOND_DELTA_REVIEW_SHA\"",
    replace: "if (false) push(\"SECOND_DELTA_REVIEW_SHA\"",
    placebo: "if (!/^[0-9a-f]{40}$/.test(`${sdr[k] ?? \"\"}`)) push(\"SECOND_DELTA_REVIEW_SHA\"",
    detector: "S1-RLK2: the second delta review block is held to its shape, its range and its universe",
    fingerprint: "RECON_SECOND_DELTA_REVIEW_SHA:expected SECOND_DELTA_REVIEW_SHA" }),
  Object.freeze({ id: "RL2-11", target: "second review: original source", description: "the original frozen source of the second review can drift",
    find: "if (sdr.originalFrozenSourceSha !== HISTORICAL_SNAPSHOT_PIN.sourceSha) push(",
    replace: "if (false) push(",
    placebo: "if (!(sdr.originalFrozenSourceSha === HISTORICAL_SNAPSHOT_PIN.sourceSha)) push(",
    detector: "S1-RLK2: the second delta review block is held to its shape, its range and its universe",
    fingerprint: "RECON_SECOND_DELTA_REVIEW_ORIGINAL_SOURCE_DRIFT:expected SECOND_DELTA_REVIEW_ORIGINAL_SOURCE_DRIFT" }),
  Object.freeze({ id: "RL2-12", target: "second review: base is the first target", description: "the second range may start anywhere but the first target",
    find: "if (dr && sdr.frozenSourceSha !== dr.targetMainSha) push(",
    replace: "if (false) push(",
    placebo: "if (dr && !(sdr.frozenSourceSha === dr.targetMainSha)) push(",
    detector: "S1-RLK2: the second delta review block is held to its shape, its range and its universe",
    fingerprint: "RECON_SECOND_DELTA_REVIEW_BASE_IS_NOT_THE_FIRST_TARGET:expected SECOND_DELTA_REVIEW_BASE_IS_NOT_THE_FIRST_TARGET" }),
  Object.freeze({ id: "RL2-13", target: "second review: range", description: "a second-review range that is not base..target passes",
    find: "if (sdr.range !== `${sdr.frozenSourceSha}..${sdr.targetMainSha}`) push(",
    replace: "if (false) push(",
    placebo: "if (!(sdr.range === `${sdr.frozenSourceSha}..${sdr.targetMainSha}`)) push(",
    detector: "S1-RLK2: the second delta review block is held to its shape, its range and its universe",
    fingerprint: "RECON_SECOND_DELTA_REVIEW_RANGE:expected SECOND_DELTA_REVIEW_RANGE" }),
  Object.freeze({ id: "RL2-14", target: "second review: provenance", description: "the second review may point at another document",
    find: "if (sdr.provenance !== SECOND_DELTA_SOURCE_DOCUMENT) push(",
    replace: "if (false) push(",
    placebo: "if (!(sdr.provenance === SECOND_DELTA_SOURCE_DOCUMENT)) push(",
    detector: "S1-RLK2: the second delta review block is held to its shape, its range and its universe",
    fingerprint: "RECON_SECOND_DELTA_REVIEW_PROVENANCE:expected SECOND_DELTA_REVIEW_PROVENANCE" }),
  Object.freeze({ id: "RL2-15", target: "second review: stored count", description: "a wrong stored second-layer count passes",
    find: "if (sdr.deltaUniverseCount !== secondIds.length) push(",
    replace: "if (false) push(",
    placebo: "if (!(sdr.deltaUniverseCount === secondIds.length)) push(",
    detector: "S1-RLK2: the second delta review block is held to its shape, its range and its universe",
    fingerprint: "RECON_SECOND_DELTA_UNIVERSE_COUNT_STORED:expected SECOND_DELTA_UNIVERSE_COUNT_STORED" }),
  Object.freeze({ id: "RL2-16", target: "second review: stored hash", description: "a wrong stored second-layer hash passes",
    find: "if (sdr.deltaUniverseSha256 !== sha256Hex(universeString(secondIds))) push(",
    replace: "if (false) push(",
    placebo: "if (!(sdr.deltaUniverseSha256 === sha256Hex(universeString(secondIds)))) push(",
    detector: "S1-RLK2: the second delta review block is held to its shape, its range and its universe",
    fingerprint: "RECON_SECOND_DELTA_UNIVERSE_HASH_STORED:expected SECOND_DELTA_UNIVERSE_HASH_STORED" }),
  Object.freeze({ id: "RL2-17", target: "second review: touched risks", description: "a list of touched risks that is not the derived one passes",
    find: "if (!same([...(sdr.existingRisksTouched ?? [])].sort(), existingOwners)) push(",
    replace: "if (false) push(",
    placebo: "if (!(same([...(sdr.existingRisksTouched ?? [])].sort(), existingOwners))) push(",
    detector: "S1-RLK2: the second delta review block is held to its shape, its range and its universe",
    fingerprint: "RECON_SECOND_DELTA_RISKS_TOUCHED_DIFFERS:expected SECOND_DELTA_RISKS_TOUCHED_DIFFERS" }),
  Object.freeze({ id: "RL2-19", target: "second layer: revises no entry", description: "a risk the second layer owns for may carry a revision",
    find: "if (r.sourceFindingIds.some((id) => deltaLayerOfId(id) === \"SECOND\") && r.revision) push(",
    replace: "if (false) push(",
    placebo: "if (r.sourceFindingIds.some((id) => deltaLayerOfId(id) === \"SECOND\") && r.revision !== undefined) push(",
    detector: "S1-RLK2: a classic revision never rides on a risk that owns a second-layer finding",
    fingerprint: "RECON_SECOND_LAYER_REVISES_AN_ENTRY:expected SECOND_LAYER_REVISES_AN_ENTRY" }),
  Object.freeze({ id: "RL2-20", target: "second layer: an existing-risk disposition may name a first-layer risk", description: "a risk the first relock opened is refused as an existing owner of a second-layer finding",
    find: "} else if (f.deltaDisposition === \"OWNED_BY_EXISTING_RISK\" && isSecondDelta(owner)) {",
    replace: "} else if (f.deltaDisposition === \"OWNED_BY_EXISTING_RISK\" && isDelta(owner)) {",
    placebo: "} else if (f.deltaDisposition === \"OWNED_BY_EXISTING_RISK\" && isSecondDelta(owner) === true) {",
    detector: "S1-RLK: the committed register passes every reconciliation gate",
    fingerprint: "RECON_CLEAN" }),
  Object.freeze({ id: "RL2-21", target: "universe: the first layer is pinned", description: "a first-layer finding can be deleted",
    find: "if (firstIds.length !== FIRST_DELTA_UNIVERSE_COUNT || sha256Hex(universeString(firstIds)) !== FIRST_DELTA_UNIVERSE_SHA256) {",
    replace: "if (false) {",
    placebo: "if (firstIds.length !== FIRST_DELTA_UNIVERSE_COUNT || !(sha256Hex(universeString(firstIds)) === FIRST_DELTA_UNIVERSE_SHA256)) {",
    detector: "S1-RLK2: the first and the second layer are pinned by count and hash on their own",
    fingerprint: "FIRST_LAYER_DELTA_UNIVERSE_CHANGED:expected FIRST_LAYER_DELTA_UNIVERSE_CHANGED" }),
  Object.freeze({ id: "RL2-22", target: "universe: the second layer is pinned", description: "a second-layer finding can be deleted",
    find: "if (secondIds.length !== SECOND_DELTA_UNIVERSE_COUNT || sha256Hex(universeString(secondIds)) !== SECOND_DELTA_UNIVERSE_SHA256) {",
    replace: "if (false) {",
    placebo: "if (secondIds.length !== SECOND_DELTA_UNIVERSE_COUNT || !(sha256Hex(universeString(secondIds)) === SECOND_DELTA_UNIVERSE_SHA256)) {",
    detector: "S1-RLK2: the first and the second layer are pinned by count and hash on their own",
    fingerprint: "SECOND_LAYER_DELTA_UNIVERSE_CHANGED:expected SECOND_LAYER_DELTA_UNIVERSE_CHANGED" }),
  Object.freeze({ id: "RL2-23", target: "first review: stores the first layer only", description: "the stored first-layer universe includes the second layer",
    find: "const deltaIds = deltaFindings.filter((f) => deltaLayerOfId(f.findingId) === \"FIRST\").map((f) => f.findingId);",
    replace: "const deltaIds = deltaFindings.map((f) => f.findingId);",
    placebo: "const deltaIds = deltaFindings.filter((f) => deltaLayerOfId(f.findingId) !== \"SECOND\").map((f) => f.findingId);",
    detector: "S1-RLK: the committed register passes every reconciliation gate",
    fingerprint: "RECON_CLEAN" }),
  Object.freeze({ id: "RL2-24", target: "second review: owners are derived", description: "the touched risks of the second review are not derived from the findings",
    find: "const existingOwners = [...new Set(secondFindings.map((f) => f.ownerRiskId).filter((id) => riskById.get(id) && !isSecondDelta(riskById.get(id))))].sort();",
    replace: "const existingOwners = [...(sdr.existingRisksTouched ?? [])].sort();",
    placebo: "const existingOwners = [...new Set(secondFindings.map((f) => f.ownerRiskId).filter((id) => riskById.get(id) && !isSecondDelta(riskById.get(id))))].sort((a, b) => (a < b ? -1 : a > b ? 1 : 0));",
    detector: "S1-RLK2: the second delta review block is held to its shape, its range and its universe",
    fingerprint: "RECON_SECOND_DELTA_RISKS_TOUCHED_DIFFERS:expected SECOND_DELTA_RISKS_TOUCHED_DIFFERS" }),
  Object.freeze({ id: "RL3-01", target: "scope: a delta finding carries its layer's scope", description: "a second-layer finding may carry the first layer's scope",
    find: "if (inDeltaFamily && isDelta(f) && scopeOf(f) !== (deltaLayerOfId(f.findingId) === \"SECOND\" ? SECOND_SCOPE : \"DELTA_RELOCK\")) push(\"DELTA_FINDING_SCOPE_LAYER\"",
    replace: "if (false) push(\"DELTA_FINDING_SCOPE_LAYER\"",
    placebo: "if (inDeltaFamily && isDelta(f) && !(scopeOf(f) === (deltaLayerOfId(f.findingId) === \"SECOND\" ? SECOND_SCOPE : \"DELTA_RELOCK\"))) push(\"DELTA_FINDING_SCOPE_LAYER\"",
    detector: "S1-RLK3: a second-layer finding carries the second scope, and a risk of the second layer owns second-layer findings only",
    fingerprint: "RECON_DELTA_FINDING_SCOPE_LAYER:expected DELTA_FINDING_SCOPE_LAYER" }),
  Object.freeze({ id: "RL3-02", target: "scope: a second-layer risk owns second-layer findings only", description: "a risk the second layer opened may own a first-layer finding",
    find: "if (f && f.family === DELTA_FAMILY && isSecondDelta(r) && deltaLayerOfId(id) !== \"SECOND\") push(",
    replace: "if (false) push(",
    placebo: "if (f && f.family === DELTA_FAMILY && isSecondDelta(r) && !(deltaLayerOfId(id) === \"SECOND\")) push(",
    detector: "S1-RLK3: a second-layer finding carries the second scope, and a risk of the second layer owns second-layer findings only",
    fingerprint: "RECON_DELTA_RISK_OWNS_OTHER_LAYER_FINDING:expected DELTA_RISK_OWNS_OTHER_LAYER_FINDING" }),
  Object.freeze({ id: "RL3-03", target: "scope: a second-layer risk is never revised classically", description: "a risk the second layer opened may carry a classic revision",
    find: "if (isSecondDelta(r) && r.revision) push(\"SECOND_LAYER_RISK_REVISED_CLASSICALLY\"",
    replace: "if (false) push(\"SECOND_LAYER_RISK_REVISED_CLASSICALLY\"",
    placebo: "if (isSecondDelta(r) && r.revision !== undefined) push(\"SECOND_LAYER_RISK_REVISED_CLASSICALLY\"",
    detector: "S1-RLK3: a second-layer finding carries the second scope, and a risk of the second layer owns second-layer findings only",
    fingerprint: "RECON_SECOND_LAYER_RISK_REVISED_CLASSICALLY:expected SECOND_LAYER_RISK_REVISED_CLASSICALLY" }),
  Object.freeze({ id: "RL3-04", target: "second layer: a new-risk disposition needs a risk of its own scope", description: "a second-layer finding may claim a new risk that the first relock already owned",
    find: "} else if (f.deltaDisposition === \"OWNED_BY_NEW_RISK\" && !isSecondDelta(owner)) {",
    replace: "} else if (false) {",
    placebo: "} else if (f.deltaDisposition === \"OWNED_BY_NEW_RISK\" && isSecondDelta(owner) === false) {",
    detector: "S1-RLK3: the second layer may open a risk of its own, and only a risk of its own scope is new for it",
    fingerprint: "RECON_NEW_RISK_DISPOSITION_ON_EXISTING_OWNER:expected NEW_RISK_DISPOSITION_ON_EXISTING_OWNER" }),
  Object.freeze({ id: "RL3-05", target: "second layer: an existing-risk disposition may not name a second-layer risk", description: "a second-layer finding may call the risk it opened existing",
    find: "} else if (f.deltaDisposition === \"OWNED_BY_EXISTING_RISK\" && isSecondDelta(owner)) {",
    replace: "} else if (false) {",
    placebo: "} else if (f.deltaDisposition === \"OWNED_BY_EXISTING_RISK\" && isSecondDelta(owner) === true) {",
    detector: "S1-RLK3: the second layer may open a risk of its own, and only a risk of its own scope is new for it",
    fingerprint: "RECON_EXISTING_RISK_DISPOSITION_ON_SECOND_LAYER_OWNER:expected EXISTING_RISK_DISPOSITION_ON_SECOND_LAYER_OWNER" }),
  Object.freeze({ id: "RL3-06", target: "second review: opened risks are derived", description: "a list of opened risks that is not the derived one passes",
    find: "if (!same([...(sdr.risksOpened ?? [])].sort(), opened)) push(",
    replace: "if (false) push(",
    placebo: "if (!(same([...(sdr.risksOpened ?? [])].sort(), opened))) push(",
    detector: "S1-RLK3: the second layer may open a risk of its own, and only a risk of its own scope is new for it",
    fingerprint: "RECON_SECOND_DELTA_RISKS_OPENED_DIFFERS:expected SECOND_DELTA_RISKS_OPENED_DIFFERS" }),
  Object.freeze({ id: "RL3-07", target: "second review: revised risks are derived", description: "a list of revised risks that is not the derived one passes",
    find: "if (!same([...(sdr.risksRevised ?? [])].sort(), revised)) push(",
    replace: "if (false) push(",
    placebo: "if (!(same([...(sdr.risksRevised ?? [])].sort(), revised))) push(",
    detector: "S1-RLK3: the second layer may open a risk of its own, and only a risk of its own scope is new for it",
    fingerprint: "RECON_SECOND_DELTA_RISKS_REVISED_DIFFERS:expected SECOND_DELTA_RISKS_REVISED_DIFFERS" }),
  Object.freeze({ id: "RL3-08", target: "first relock: a revised risk is read as it was", description: "the first relock's snapshot reads a revised risk at its revised values",
    find: "return entry.secondLayerRevision && entry.secondLayerRevision.scope === SECOND_SCOPE ? { ...entry, ...entry.secondLayerRevision.supersedes } : entry;",
    replace: "return entry;",
    placebo: "return entry.secondLayerRevision !== undefined && entry.secondLayerRevision.scope === SECOND_SCOPE ? { ...entry, ...entry.secondLayerRevision.supersedes } : entry;",
    detector: "S1-RLK3: a risk the second layer revised is read as it was in the first relock's snapshot",
    fingerprint: "SNAPSHOT_READ_AS_BEFORE:" }),
  Object.freeze({ id: "RL3-09", target: "first relock: a risk of the second layer is absent", description: "the first relock's snapshot counts a risk the second layer opened",
    find: "const risksThen = reg.risks.filter((r) => !isSecondDelta(r)).map(firstLayerView);",
    replace: "const risksThen = reg.risks.map(firstLayerView);",
    placebo: "const risksThen = reg.risks.filter((r) => isSecondDelta(r) === false).map(firstLayerView);",
    detector: "S1-RLK2: the first relock is a pinned snapshot, and setting the second layer aside reproduces it",
    fingerprint: "FIRST_SNAPSHOT_PIN:" }),
  Object.freeze({ id: "RL3-10", target: "revision: scope", description: "a revision of another scope passes",
    find: "if (rv.scope !== SECOND_SCOPE) push(\"SECOND_REVISION_SCOPE\"",
    replace: "if (false) push(\"SECOND_REVISION_SCOPE\"",
    placebo: "if (!(rv.scope === SECOND_SCOPE)) push(\"SECOND_REVISION_SCOPE\"",
    detector: "S1-RLK3: a second-layer revision names its scope, its findings, the recorded past and a reason",
    fingerprint: "RECON_SECOND_REVISION_SCOPE:expected SECOND_REVISION_SCOPE" }),
  Object.freeze({ id: "RL3-11", target: "revision: no classic revision beside it", description: "a risk may carry both kinds of revision",
    find: "if (r.revision) push(\"SECOND_REVISION_WITH_CLASSIC_REVISION\"",
    replace: "if (false) push(\"SECOND_REVISION_WITH_CLASSIC_REVISION\"",
    placebo: "if (r.revision !== undefined) push(\"SECOND_REVISION_WITH_CLASSIC_REVISION\"",
    detector: "S1-RLK3: a second-layer revision names its scope, its findings, the recorded past and a reason",
    fingerprint: "RECON_SECOND_REVISION_WITH_CLASSIC_REVISION:expected SECOND_REVISION_WITH_CLASSIC_REVISION" }),
  Object.freeze({ id: "RL3-12", target: "revision: not on a risk of the second layer", description: "a risk the second layer opened may revise itself",
    find: "if (isSecondDelta(r)) push(\"SECOND_REVISION_ON_SECOND_LAYER_RISK\"",
    replace: "if (false) push(\"SECOND_REVISION_ON_SECOND_LAYER_RISK\"",
    placebo: "if (isSecondDelta(r) === true) push(\"SECOND_REVISION_ON_SECOND_LAYER_RISK\"",
    detector: "S1-RLK3: a second-layer revision names its scope, its findings, the recorded past and a reason",
    fingerprint: "RECON_SECOND_REVISION_ON_SECOND_LAYER_RISK:expected SECOND_REVISION_ON_SECOND_LAYER_RISK" }),
  Object.freeze({ id: "RL3-13", target: "revision: a reason", description: "a revision without a reason passes",
    find: "if (typeof rv.reason !== \"string\" || rv.reason.trim().length < 30) push(\"SECOND_REVISION_WITHOUT_REASON\"",
    replace: "if (false) push(\"SECOND_REVISION_WITHOUT_REASON\"",
    placebo: "if (typeof rv.reason !== \"string\" || !(rv.reason.trim().length >= 30)) push(\"SECOND_REVISION_WITHOUT_REASON\"",
    detector: "S1-RLK3: a second-layer revision names its scope, its findings, the recorded past and a reason",
    fingerprint: "RECON_SECOND_REVISION_WITHOUT_REASON:expected SECOND_REVISION_WITHOUT_REASON" }),
  Object.freeze({ id: "RL3-14", target: "revision: a finding", description: "a revision without a finding passes",
    find: "if (ids.length === 0) push(\"SECOND_REVISION_WITHOUT_FINDING\"",
    replace: "if (false) push(\"SECOND_REVISION_WITHOUT_FINDING\"",
    placebo: "if (!(ids.length > 0)) push(\"SECOND_REVISION_WITHOUT_FINDING\"",
    detector: "S1-RLK3: a second-layer revision names its scope, its findings, the recorded past and a reason",
    fingerprint: "RECON_SECOND_REVISION_WITHOUT_FINDING:expected SECOND_REVISION_WITHOUT_FINDING" }),
  Object.freeze({ id: "RL3-15", target: "revision: the finding exists", description: "a revision may name a finding the register does not hold",
    find: "if (!f) push(\"SECOND_REVISION_UNKNOWN_FINDING\"",
    replace: "if (!f) void (\"SECOND_REVISION_UNKNOWN_FINDING\"",
    placebo: "if (f === undefined) push(\"SECOND_REVISION_UNKNOWN_FINDING\"",
    detector: "S1-RLK3: a second-layer revision names its scope, its findings, the recorded past and a reason",
    fingerprint: "RECON_SECOND_REVISION_UNKNOWN_FINDING:expected SECOND_REVISION_UNKNOWN_FINDING" }),
  Object.freeze({ id: "RL3-16", target: "revision: the finding is of the second layer", description: "a revision may be motivated by a first-layer finding",
    find: "else if (deltaLayerOfId(fid) !== \"SECOND\") push(\"SECOND_REVISION_WRONG_LAYER\"",
    replace: "else if (false) push(\"SECOND_REVISION_WRONG_LAYER\"",
    placebo: "else if (!(deltaLayerOfId(fid) === \"SECOND\")) push(\"SECOND_REVISION_WRONG_LAYER\"",
    detector: "S1-RLK3: a second-layer revision names its scope, its findings, the recorded past and a reason",
    fingerprint: "RECON_SECOND_REVISION_WRONG_LAYER:expected SECOND_REVISION_WRONG_LAYER" }),
  Object.freeze({ id: "RL3-17", target: "revision: the risk owns the finding", description: "a revision may name a finding that another risk owns",
    find: "else if (f.ownerRiskId !== id || !r.sourceFindingIds.includes(fid)) push(\"SECOND_REVISION_FINDING_NOT_OWNED\"",
    replace: "else if (false) push(\"SECOND_REVISION_FINDING_NOT_OWNED\"",
    placebo: "else if (!(f.ownerRiskId === id) || !r.sourceFindingIds.includes(fid)) push(\"SECOND_REVISION_FINDING_NOT_OWNED\"",
    detector: "S1-RLK3: a second-layer revision names its scope, its findings, the recorded past and a reason",
    fingerprint: "RECON_SECOND_REVISION_FINDING_NOT_OWNED:expected SECOND_REVISION_FINDING_NOT_OWNED" }),
  Object.freeze({ id: "RL3-18", target: "revision: the recorded past exists", description: "a revision with an empty recorded past passes",
    find: "if (!isPlainObject(sup) || Object.keys(sup).length === 0) {",
    replace: "if (!isPlainObject(sup)) {",
    placebo: "if (!isPlainObject(sup) || !(Object.keys(sup).length > 0)) {",
    detector: "S1-RLK3: a second-layer revision names its scope, its findings, the recorded past and a reason",
    fingerprint: "RECON_SECOND_REVISION_WITHOUT_SUPERSEDED_VALUES:expected SECOND_REVISION_WITHOUT_SUPERSEDED_VALUES" }),
  Object.freeze({ id: "RL3-19", target: "revision: the recorded past is arithmetic", description: "a recorded past whose score is not its own factors' passes",
    find: "if (sup.likelihood !== past.likelihood || sup.impact !== past.impact || sup.score !== past.score || sup.severity !== past.severity) push(",
    replace: "if (false) push(",
    placebo: "if (!(sup.likelihood === past.likelihood && sup.impact === past.impact && sup.score === past.score && sup.severity === past.severity)) push(",
    detector: "S1-RLK3: a second-layer revision names its scope, its findings, the recorded past and a reason",
    fingerprint: "RECON_SECOND_REVISION_SUPERSEDED_ARITHMETIC:expected SECOND_REVISION_SUPERSEDED_ARITHMETIC" }),
  Object.freeze({ id: "RL3-20", target: "factor review: present", description: "a revision without a factor review passes",
    find: "if (!isPlainObject(review)) push(\"SECOND_REVISION_FACTOR_REVIEW_ABSENT\"",
    replace: "if (!isPlainObject(review)) void (\"SECOND_REVISION_FACTOR_REVIEW_ABSENT\"",
    placebo: "if (isPlainObject(review) === false) push(\"SECOND_REVISION_FACTOR_REVIEW_ABSENT\"",
    detector: "S1-RLK3: a factor review covers all nine factors and agrees with both ends",
    fingerprint: "RECON_SECOND_REVISION_FACTOR_REVIEW_ABSENT:expected SECOND_REVISION_FACTOR_REVIEW_ABSENT" }),
  Object.freeze({ id: "RL3-21", target: "factor review: all nine factors", description: "a factor review may skip a factor",
    find: "push(\"SECOND_REVISION_FACTOR_NOT_REVIEWED\", { id, factor: k });",
    replace: "void 0;",
    placebo: "push(\"SECOND_REVISION_FACTOR_NOT_REVIEWED\", { id, factor: `${k}` });",
    detector: "S1-RLK3: a factor review covers all nine factors and agrees with both ends",
    fingerprint: "RECON_SECOND_REVISION_FACTOR_NOT_REVIEWED:expected SECOND_REVISION_FACTOR_NOT_REVIEWED" }),
  Object.freeze({ id: "RL3-22", target: "factor review: the value before", description: "a factor review may misstate the value before",
    find: "if (e.before !== sup[group][k]) push(",
    replace: "if (false) push(",
    placebo: "if (!(e.before === sup[group][k])) push(",
    detector: "S1-RLK3: a factor review covers all nine factors and agrees with both ends",
    fingerprint: "RECON_SECOND_REVISION_FACTOR_BEFORE_DIFFERS:expected SECOND_REVISION_FACTOR_BEFORE_DIFFERS" }),
  Object.freeze({ id: "RL3-23", target: "factor review: the value now", description: "a factor review may misstate the value now",
    find: "if (e.after !== r[group][k]) push(",
    replace: "if (false) push(",
    placebo: "if (!(e.after === r[group][k])) push(",
    detector: "S1-RLK3: a factor review covers all nine factors and agrees with both ends",
    fingerprint: "RECON_SECOND_REVISION_FACTOR_AFTER_DIFFERS:expected SECOND_REVISION_FACTOR_AFTER_DIFFERS" }),
  Object.freeze({ id: "RL3-24", target: "factor review: a reason for each factor", description: "a factor that did not move may be left unexplained",
    find: "if (typeof e.reason !== \"string\" || e.reason.trim().length < 30) push(\"SECOND_REVISION_FACTOR_WITHOUT_REASON\"",
    replace: "if (false) push(\"SECOND_REVISION_FACTOR_WITHOUT_REASON\"",
    placebo: "if (typeof e.reason !== \"string\" || !(e.reason.trim().length >= 30)) push(\"SECOND_REVISION_FACTOR_WITHOUT_REASON\"",
    detector: "S1-RLK3: a factor review covers all nine factors and agrees with both ends",
    fingerprint: "RECON_SECOND_REVISION_FACTOR_WITHOUT_REASON:expected SECOND_REVISION_FACTOR_WITHOUT_REASON" }),
  Object.freeze({ id: "RL3-25", target: "append-only: the lists", description: "a revision may remove or reword an earlier gap, criterion or precondition",
    find: "if (!prefixOf(field)) push(\"SECOND_REVISION_NOT_APPEND_ONLY\", { id, field });",
    replace: "void field;",
    placebo: "if (prefixOf(field) === false) push(\"SECOND_REVISION_NOT_APPEND_ONLY\", { id, field });",
    detector: "S1-RLK3: a second-layer revision is append-only and must add something",
    fingerprint: "RECON_SECOND_REVISION_NOT_APPEND_ONLY:expected SECOND_REVISION_NOT_APPEND_ONLY" }),
  Object.freeze({ id: "RL3-26", target: "append-only: the evidence", description: "a revision may remove an earlier evidence item",
    find: "if (!Array.isArray(sup.evidence) || !sup.evidence.every((e) => nowEvidence.has(evidenceKey(e)))) push(",
    replace: "if (false) push(",
    placebo: "if (!Array.isArray(sup.evidence) || sup.evidence.some((e) => !nowEvidence.has(evidenceKey(e)))) push(",
    detector: "S1-RLK3: a second-layer revision is append-only and must add something",
    fingerprint: "RECON_SECOND_REVISION_NOT_APPEND_ONLY:expected SECOND_REVISION_NOT_APPEND_ONLY" }),
  Object.freeze({ id: "RL3-27", target: "append-only: the residual risk", description: "a revision may rewrite the residual risk",
    find: "if (typeof sup.residualRisk !== \"string\" || !String(r.residualRisk).startsWith(sup.residualRisk)) push(",
    replace: "if (false) push(",
    placebo: "if (typeof sup.residualRisk !== \"string\" || String(r.residualRisk).startsWith(sup.residualRisk) === false) push(",
    detector: "S1-RLK3: a second-layer revision is append-only and must add something",
    fingerprint: "RECON_SECOND_REVISION_NOT_APPEND_ONLY:expected SECOND_REVISION_NOT_APPEND_ONLY" }),
  Object.freeze({ id: "RL3-28", target: "append-only: it must add something", description: "a revision that adds nothing passes",
    find: "if (!grew) push(\"SECOND_REVISION_EMPTY\"",
    replace: "if (false) push(\"SECOND_REVISION_EMPTY\"",
    placebo: "if (grew === false) push(\"SECOND_REVISION_EMPTY\"",
    detector: "S1-RLK3: a second-layer revision is append-only and must add something",
    fingerprint: "RECON_SECOND_REVISION_EMPTY:expected SECOND_REVISION_EMPTY" }),
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
  manifestSha256: "1ec8961e8f60959fa4dd9957757f09a4bdced3934035a7b1cb2972371f9be236",
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
    "FR04-01": "TARGETED_KILL",
    "FR04-02": "TARGETED_KILL",
    "FR04-03": "TARGETED_KILL",
    "FR04-04": "TARGETED_KILL",
    "FR04-05": "TARGETED_KILL",
    "FR04-06": "TARGETED_KILL",
    "FR04-07": "TARGETED_KILL",
    "FR04-08": "TARGETED_KILL",
    "FR04-09": "TARGETED_KILL",
    "PC-ANCHOR": "TARGETED_KILL",
    "PC-BRANCH-UNKNOWN": "TARGETED_KILL",
    "PC-COUNT-DELTA-ONLY": "TARGETED_KILL",
    "PC-DECIDED-BARE": "TARGETED_KILL",
    "PC-DECIDER-ROLE": "TARGETED_KILL",
    "PC-EVIDENCE-SHAPE": "TARGETED_KILL",
    "PC-EVIDENCE-SHAPE-MISSING": "TARGETED_KILL",
    "PC-FOR-BRANCH": "TARGETED_KILL",
    "PC-FOR-BRANCH-OTHERS": "TARGETED_KILL",
    "PC-FOR-RISK": "TARGETED_KILL",
    "PC-FOR-RISK-OTHERS": "TARGETED_KILL",
    "PC-LINK-ROOT": "TARGETED_KILL",
    "PC-LINK-SELF": "TARGETED_KILL",
    "PC-NOT-A-FILE": "TARGETED_KILL",
    "PC-PATH-ABSENT": "TARGETED_KILL",
    "PC-PATH-ABSOLUTE": "TARGETED_KILL",
    "PC-PATH-BACKSLASH": "TARGETED_KILL",
    "PC-PATH-DOT": "TARGETED_KILL",
    "PC-PATH-DOTDOT": "TARGETED_KILL",
    "PC-PATH-DOUBLE": "TARGETED_KILL",
    "PC-PATH-ESCAPE": "TARGETED_KILL",
    "PC-PATH-FOLD": "TARGETED_KILL",
    "PC-PATH-NFKC": "TARGETED_KILL",
    "PC-PATH-RESERVED": "TARGETED_KILL",
    "PC-PATH-TRAILING": "TARGETED_KILL",
    "PC-PATH-USED": "TARGETED_KILL",
    "PC-RECON-DECIDED": "TARGETED_KILL",
    "PC-RECON-PROBLEMS": "TARGETED_KILL",
    "PC-RECON-RISK-ONLY": "TARGETED_KILL",
    "PC-RECON-SCOPE": "TARGETED_KILL",
    "PC-REV-AMBIGUOUS-BRANCH": "TARGETED_KILL",
    "PC-REV-AMBIGUOUS-RISK": "TARGETED_KILL",
    "PC-REV-REASON": "TARGETED_KILL",
    "PC-REV-SCOPE": "TARGETED_KILL",
    "PC-REV-SUPERSEDES": "TARGETED_KILL",
    "PC-STALE-APOSTROPHE": "TARGETED_KILL",
    "PC-STALE-JOIN": "TARGETED_KILL",
    "PC-STALE-NFKC": "TARGETED_KILL",
    "PC-STALE-OPEN-LINE": "TARGETED_KILL",
    "PC-STALE-OPEN-OWN": "TARGETED_KILL",
    "PC-STALE-P2_REVIEWER_TEXT": "TARGETED_KILL",
    "PC-STALE-P4_TODO_REVIEWER": "TARGETED_KILL",
    "PC-STALE-PARAGRAPH": "TARGETED_KILL",
    "PC-STALE-REVIEWER": "TARGETED_KILL",
    "PC-STALE-SPAN": "TARGETED_KILL",
    "PC-STALE-WHITESPACE": "TARGETED_KILL",
    "PC-STALE-ZERO-WIDTH": "TARGETED_KILL",
    "PC-TOUCHED-DELTA-ONLY": "TARGETED_KILL",
    "PF-CONDITIONAL": "TARGETED_KILL",
    "PF-DISTINCT": "TARGETED_KILL",
    "PF-DISTINCT-acceptanceCriteria": "TARGETED_KILL",
    "PF-DISTINCT-condition": "TARGETED_KILL",
    "PF-DISTINCT-requiredControl": "TARGETED_KILL",
    "PF-DISTINCT-requiredTests": "TARGETED_KILL",
    "PF-EVIDENCE-EMPTY": "TARGETED_KILL",
    "PF-EVIDENCE-KEYS": "TARGETED_KILL",
    "PF-GENERIC": "TARGETED_KILL",
    "PF-LISTED": "TARGETED_KILL",
    "PF-METHOD": "TARGETED_KILL",
    "PF-OPEN": "TARGETED_KILL",
    "PF-OWNER-ROLE": "TARGETED_KILL",
    "PF-REQ-R-66": "TARGETED_KILL",
    "PF-REQ-R-72": "TARGETED_KILL",
    "PF-REQ-R-73": "TARGETED_KILL",
    "PF-STALE-P1_MUST_BE_RECONCILED": "TARGETED_KILL",
    "PF-STALE-P3_OPEN_ITEM": "TARGETED_KILL",
    "PF-STALE-P5_PENDING_EVIDENCE": "TARGETED_KILL",
    "PF-STALE-P6_TEMPORARY_ADJUDICATION": "TARGETED_KILL",
    "PF-STALE-P7_TO_BE_RECONCILED": "TARGETED_KILL",
    "PF-STALE-REGISTER": "TARGETED_KILL",
    "PF-STALE-REPORT": "TARGETED_KILL",
    "PF-STALE-WIRE": "TARGETED_KILL",
    "PF-STATUS": "TARGETED_KILL",
    "PF-TEST-OPERATIONAL": "TARGETED_KILL",
    "PF-TESTABLE": "TARGETED_KILL",
    "PF-TESTS": "TARGETED_KILL",
    "PF-TWO": "TARGETED_KILL",
    "PF-WIRE": "TARGETED_KILL",
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
    "RL-01": "TARGETED_KILL",
    "RL-02": "TARGETED_KILL",
    "RL-03": "TARGETED_KILL",
    "RL-04": "TARGETED_KILL",
    "RL-05": "TARGETED_KILL",
    "RL-06": "TARGETED_KILL",
    "RL-07": "TARGETED_KILL",
    "RL-08": "TARGETED_KILL",
    "RL-09": "TARGETED_KILL",
    "RL-10": "TARGETED_KILL",
    "RL-11": "TARGETED_KILL",
    "RL-12": "TARGETED_KILL",
    "RL-13": "TARGETED_KILL",
    "RL-14": "TARGETED_KILL",
    "RL-15": "TARGETED_KILL",
    "RL-16": "TARGETED_KILL",
    "RL-17": "TARGETED_KILL",
    "RL-18": "TARGETED_KILL",
    "RL-19": "TARGETED_KILL",
    "RL-20": "TARGETED_KILL",
    "RL-21": "TARGETED_KILL",
    "RL-22": "TARGETED_KILL",
    "RL-23": "TARGETED_KILL",
    "RL-24": "TARGETED_KILL",
    "RL-25": "TARGETED_KILL",
    "RL-26": "TARGETED_KILL",
    "RL-27": "TARGETED_KILL",
    "RL-28": "TARGETED_KILL",
    "RL-29": "TARGETED_KILL",
    "RL-30": "TARGETED_KILL",
    "RL-31": "TARGETED_KILL",
    "RL-32": "TARGETED_KILL",
    "RL-33": "TARGETED_KILL",
    "RL-34": "TARGETED_KILL",
    "RL-35": "TARGETED_KILL",
    "RL-36": "TARGETED_KILL",
    "RL-37": "TARGETED_KILL",
    "RL-38": "TARGETED_KILL",
    "RL-39": "TARGETED_KILL",
    "RL-40": "TARGETED_KILL",
    "RL-41": "TARGETED_KILL",
    "RL-42": "TARGETED_KILL",
    "RL-43": "TARGETED_KILL",
    "RL-44": "TARGETED_KILL",
    "RL-45": "TARGETED_KILL",
    "RL-46": "TARGETED_KILL",
    "RL-47": "TARGETED_KILL",
    "RL-48": "TARGETED_KILL",
    "RL-49": "TARGETED_KILL",
    "RL-50": "TARGETED_KILL",
    "RL-51": "TARGETED_KILL",
    "RL-52": "TARGETED_KILL",
    "RL-53": "TARGETED_KILL",
    "RL2-01": "TARGETED_KILL",
    "RL2-02": "TARGETED_KILL",
    "RL2-03": "TARGETED_KILL",
    "RL2-04": "TARGETED_KILL",
    "RL2-05": "TARGETED_KILL",
    "RL2-06": "TARGETED_KILL",
    "RL2-07": "TARGETED_KILL",
    "RL2-08": "TARGETED_KILL",
    "RL2-09": "TARGETED_KILL",
    "RL2-10": "TARGETED_KILL",
    "RL2-11": "TARGETED_KILL",
    "RL2-12": "TARGETED_KILL",
    "RL2-13": "TARGETED_KILL",
    "RL2-14": "TARGETED_KILL",
    "RL2-15": "TARGETED_KILL",
    "RL2-16": "TARGETED_KILL",
    "RL2-17": "TARGETED_KILL",
    "RL2-19": "TARGETED_KILL",
    "RL2-20": "TARGETED_KILL",
    "RL2-21": "TARGETED_KILL",
    "RL2-22": "TARGETED_KILL",
    "RL2-23": "TARGETED_KILL",
    "RL2-24": "TARGETED_KILL",
    "RL3-01": "TARGETED_KILL",
    "RL3-02": "TARGETED_KILL",
    "RL3-03": "TARGETED_KILL",
    "RL3-04": "TARGETED_KILL",
    "RL3-05": "TARGETED_KILL",
    "RL3-06": "TARGETED_KILL",
    "RL3-07": "TARGETED_KILL",
    "RL3-08": "TARGETED_KILL",
    "RL3-09": "TARGETED_KILL",
    "RL3-10": "TARGETED_KILL",
    "RL3-11": "TARGETED_KILL",
    "RL3-12": "TARGETED_KILL",
    "RL3-13": "TARGETED_KILL",
    "RL3-14": "TARGETED_KILL",
    "RL3-15": "TARGETED_KILL",
    "RL3-16": "TARGETED_KILL",
    "RL3-17": "TARGETED_KILL",
    "RL3-18": "TARGETED_KILL",
    "RL3-19": "TARGETED_KILL",
    "RL3-20": "TARGETED_KILL",
    "RL3-21": "TARGETED_KILL",
    "RL3-22": "TARGETED_KILL",
    "RL3-23": "TARGETED_KILL",
    "RL3-24": "TARGETED_KILL",
    "RL3-25": "TARGETED_KILL",
    "RL3-26": "TARGETED_KILL",
    "RL3-27": "TARGETED_KILL",
    "RL3-28": "TARGETED_KILL",
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
  RECONCILIATION: 28,
  SCHEMA_KEYS: 29,
  POLICY: 30,
  STALE_TEXT: 31,
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

  // FR-04: every structure is closed. The gates above keep their historical exit codes for the faults they
  // always judged (a duplicate identifier, an unknown enum value, an absent required field, a crash on a
  // malformed register); an unknown key, or a required key absent from a nested structure, stops here —
  // before the policy gate and every later gate read a field that might not mean what it says.
  const schemaKeys = schemaKeyViolations(reg);
  if (schemaKeys.length) return stop(EXIT.SCHEMA_KEYS, "an unknown key or a missing required key in a closed register structure", schemaKeys);

  const policy = policyViolations(reg, root);
  if (policy.length) return stop(EXIT.POLICY, "a policy object is malformed, or one of its branches is not carried by the risk's acceptance criteria", policy);

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

  const reconciliation = reconciliationViolations(reg, root);
  if (reconciliation.length) {
    return stop(EXIT.RECONCILIATION, "the reconciliation of the historical snapshot, the delta review and the reconciled register does not hold", reconciliation);
  }

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

  const stale = staleProcessTextViolations(registerText, md);
  if (stale.length) return stop(EXIT.STALE_TEXT, "a deliverable still carries process text that describes a finished step", stale);

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
