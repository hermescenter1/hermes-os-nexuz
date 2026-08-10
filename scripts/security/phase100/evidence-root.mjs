/**
 * PHASE 100 — where owner and external evidence is read from.
 *
 * The contradiction this module removes: the closure contract told the owner to
 * create evidence files at repository paths, while the test suite permanently
 * asserted those same paths must not exist. Both were right about something —
 * evidence must never be committed to a public repository, and evidence must be
 * suppliable — and together they made supplying real evidence impossible
 * without first editing the tests.
 *
 * So evidence is read from an EVIDENCE ROOT, and there are exactly two modes:
 *
 *   CONTRACT_TEST  (default, and the only mode CI ever uses)
 *     No evidence root is configured. The eight owner/external documents are
 *     looked for at their repository paths, where they are absent by design and
 *     must stay absent. Every evidence gate is therefore BLOCKED, GA is
 *     correctly reported as not ready, and the run proves the CONTRACT — that
 *     the gate rejects what it must — rather than any release decision.
 *
 *   OWNER_CLOSURE  (offline, owner-run, never in CI)
 *     PHASE100_EVIDENCE_ROOT points at a directory OUTSIDE the repository
 *     holding the real evidence. Nothing is copied in, nothing is committed,
 *     and no source file or test changes to make it work.
 *
 * ── What does NOT move ───────────────────────────────────────────────────────
 *
 * Only evidence moves. Three inputs are REPOSITORY-OWNED and are always read
 * from the repository, because they are the things the evidence is judged
 * AGAINST rather than evidence themselves:
 *
 *   docs/security/phase99-findings.json            the finding register
 *   docs/security/phase99-external-review-scope.md the hashed review scope
 *   docs/pilot/phase99-pilot-plan.md               the hashed pilot scope
 *
 * A fourth, `docs/security/phase99-risk-acceptances.json`, also stays: its
 * `acceptances` key feeds HIGH_FINDINGS_RESOLVED, which is a repository-owned
 * gate, and it has two other readers inside Phase 99. Splitting it across two
 * locations would let the Phase 99 and Phase 100 evaluators disagree about the
 * same finding — the exact failure the shared closure engine exists to prevent.
 *
 * Reading a scope document from an owner-supplied directory would let the owner
 * choose the scope their own attestation is measured against, which is not a
 * gate at all.
 *
 * No network. No writes. No evidence body is ever printed.
 */

import { existsSync, realpathSync, statSync } from "node:fs";
import { isAbsolute, join, resolve, sep } from "node:path";

import { readEvidenceSource, readTextSource } from "./evidence-source.mjs";

export const EVIDENCE_MODES = ["CONTRACT_TEST", "OWNER_CLOSURE"];

/** The environment variable an owner sets for an offline closure run. */
export const EVIDENCE_ROOT_ENV = "PHASE100_EVIDENCE_ROOT";

/**
 * Every owner/external evidence document, the repository-relative path it is
 * looked for under, and the gates that are derived from it.
 *
 * The gate lists are load-bearing: when a document is MALFORMED, every gate
 * named here is failed individually, so a single unreadable file can never be
 * reported as a set of unrelated absences.
 */
export const EVIDENCE_DOCUMENTS = {
  EXTERNAL_ATTESTATIONS: {
    path: "docs/security/phase99-external-attestations.json",
    gates: ["INDEPENDENT_PENETRATION_TEST", "EXTERNAL_APPLICATION_SECURITY_REVIEW", "EXTERNAL_API_SECURITY_REVIEW"],
    shape: (d) => d.attestations === undefined || Array.isArray(d.attestations),
  },
  PILOT_ACCEPTANCE: {
    path: "docs/pilot/phase99-pilot-acceptance.json",
    gates: [
      "PILOT_ACCEPTANCE",
      "PILOT_ACCEPTANCE_DECISION",
      "PILOT_CUSTOMER_SELECTED",
      "PILOT_UAT",
      "PILOT_WORKFLOW_VALIDATION",
      "INDUSTRIAL_ENGINEER_FEEDBACK",
      "PILOT_PERFORMANCE_OBSERVATION",
      "PILOT_INCIDENT_SIMULATION",
      "PILOT_ONBOARDING",
      "PILOT_SUPPORT_PROCESS",
    ],
    shape: null,
  },
  LEGAL_PRIVACY: {
    path: "docs/legal/phase100-legal-privacy-approvals.json",
    gates: [
      "EXTERNAL_LEGAL_REVIEW",
      "EXTERNAL_PRIVACY_REVIEW",
      "APPROVED_LEGAL_DOCUMENT_VERSIONS",
      "SUBPROCESSOR_AND_TRANSFER_GOVERNANCE",
      "RESIDUAL_LEGAL_RISK_ACCEPTED",
    ],
    shape: (d) => d.reviews === undefined || Array.isArray(d.reviews),
  },
  LIVE_MODEL_EVALUATION: {
    path: "docs/ai-governance/phase100-live-model-evaluation.json",
    gates: ["LIVE_MODEL_EVALUATION"],
    shape: null,
  },
  BACKUP_OPERATIONS: {
    path: "docs/release/phase100-backup-operations.json",
    gates: [
      "BACKUP_SCHEDULER_EXECUTED",
      "LATEST_BACKUP_VERIFIED",
      "OFFHOST_COPY_VERIFIED",
      "RECOVERY_TESTED",
      "RECOVERY_KEY_CUSTODY_CONFIRMED",
    ],
    shape: null,
  },
  COMMERCIAL_DECISIONS: {
    path: "docs/release/phase100-commercial-decisions.json",
    gates: ["PRICING_DECISION", "PAYMENT_PROVIDER_DECISION", "TAX_CURRENCY_REFUND_DECISION", "PRODUCTION_BILLING_ACTIVATION"],
    shape: null,
  },
  INFRASTRUCTURE_PREREQUISITES: {
    path: "docs/release/phase100-infrastructure-prerequisites.json",
    gates: [
      "PRIVATE_TRANSPORT_CONFIRMED",
      "SECRET_BACKEND_ACTIVATION_DECISION",
      "CREDENTIAL_AND_RECOVERY_OWNERSHIP",
      "INFRASTRUCTURE_PREREQUISITES_COMPLETE",
    ],
    shape: (d) => d.prerequisites === undefined || Array.isArray(d.prerequisites),
  },
  GA_AUTHORIZATION: {
    path: "docs/release/phase100-ga-authorization.json",
    gates: ["GA_RELEASE_AUTHORIZATION"],
    shape: null,
  },
};

/**
 * Repository-owned inputs, always read from the repository. Shapes are enforced
 * here for the same reason as everywhere else: `{"findings": "oops"}` parses
 * happily and `evaluateRegistry` coerces a non-array to `[]`, which would read
 * as an EMPTY finding register and turn four repository-owned gates green.
 */
export const REPOSITORY_SOURCES = {
  "docs/security/phase99-findings.json": { shape: (d) => Array.isArray(d.findings) },
  "docs/security/phase99-risk-acceptances.json": {
    shape: (d) =>
      (d.acceptances === undefined || (d.acceptances !== null && typeof d.acceptances === "object" && !Array.isArray(d.acceptances))) &&
      (d.residualAcceptances === undefined ||
        (d.residualAcceptances !== null && typeof d.residualAcceptances === "object" && !Array.isArray(d.residualAcceptances))),
  },
};

/** Case-insensitive on Windows, exact elsewhere. */
function samePath(a, b) {
  return process.platform === "win32" ? a.toLowerCase() === b.toLowerCase() : a === b;
}

/** True when `child` is `parent` or lies beneath it, after both are real paths. */
function isWithin(parent, child) {
  if (samePath(parent, child)) return true;
  const prefix = parent.endsWith(sep) ? parent : parent + sep;
  return process.platform === "win32"
    ? child.toLowerCase().startsWith(prefix.toLowerCase())
    : child.startsWith(prefix);
}

/**
 * Resolve the configured evidence root.
 *
 * Returns `{ mode, root, errors }`. `errors` is non-empty only when an owner
 * ASKED for OWNER_CLOSURE and the request could not be honoured safely — that
 * is a hard failure and never a silent fallback to CONTRACT_TEST, because a
 * silent fallback would report "no evidence" for evidence the owner believes
 * they supplied, which is the same class of lie this phase exists to remove.
 *
 * @param {{ repoRoot: string, env?: NodeJS.ProcessEnv }} options
 */
export function resolveEvidenceRoot({ repoRoot, env = process.env }) {
  const raw = env[EVIDENCE_ROOT_ENV];
  if (raw === undefined || String(raw).trim() === "") {
    return { mode: "CONTRACT_TEST", root: repoRoot, errors: [] };
  }

  const requested = String(raw).trim();
  const errors = [];

  // A relative root would resolve against whatever directory the evaluator
  // happened to be launched from.
  if (!isAbsolute(requested)) {
    errors.push(`${EVIDENCE_ROOT_ENV} must be an absolute path`);
    return { mode: "OWNER_CLOSURE", root: null, errors };
  }
  // Reject traversal lexically as well as after resolution: `..` in a
  // configured root is always a mistake, and saying so names the real problem.
  if (requested.split(/[\\/]+/).includes("..")) {
    errors.push(`${EVIDENCE_ROOT_ENV} must not contain a '..' path segment`);
    return { mode: "OWNER_CLOSURE", root: null, errors };
  }
  if (!existsSync(requested)) {
    errors.push(`${EVIDENCE_ROOT_ENV} does not exist`);
    return { mode: "OWNER_CLOSURE", root: null, errors };
  }

  let root;
  try {
    root = realpathSync(resolve(requested));
  } catch {
    errors.push(`${EVIDENCE_ROOT_ENV} could not be resolved to a real path`);
    return { mode: "OWNER_CLOSURE", root: null, errors };
  }

  let stats;
  try {
    stats = statSync(root);
  } catch {
    errors.push(`${EVIDENCE_ROOT_ENV} could not be inspected`);
    return { mode: "OWNER_CLOSURE", root: null, errors };
  }
  if (!stats.isDirectory()) {
    errors.push(`${EVIDENCE_ROOT_ENV} must be a directory`);
    return { mode: "OWNER_CLOSURE", root: null, errors };
  }

  // Evidence inside the working tree defeats the point: it would be one `git
  // add` away from being published, and the repository must never hold it.
  let realRepo = repoRoot;
  try {
    realRepo = realpathSync(repoRoot);
  } catch { /* keep the unresolved path; the containment check still applies */ }
  if (isWithin(realRepo, root)) {
    errors.push(`${EVIDENCE_ROOT_ENV} must be outside the repository working tree`);
    return { mode: "OWNER_CLOSURE", root: null, errors };
  }

  return { mode: "OWNER_CLOSURE", root, errors: [] };
}

/**
 * Build the reader used by the whole evaluation.
 *
 * @param {{ repoRoot: string, mode: string, root: string | null }} options
 */
export function createEvidenceReader({ repoRoot, mode, root }) {
  const repoPath = (relPath) => join(repoRoot, ...relPath.split("/"));

  /**
   * Resolve an evidence path under the root, refusing anything that escapes it.
   * Escape is checked on the REAL path, so a symlink or junction pointing out
   * of the root is caught even though its lexical path looks contained.
   */
  function evidencePath(relPath) {
    if (mode !== "OWNER_CLOSURE" || !root) return { path: repoPath(relPath), escaped: false };
    const candidate = resolve(join(root, ...relPath.split("/")));
    if (!isWithin(root, candidate)) return { path: candidate, escaped: true };
    if (!existsSync(candidate)) return { path: candidate, escaped: false };
    let real;
    try {
      real = realpathSync(candidate);
    } catch {
      return { path: candidate, escaped: false };
    }
    return { path: candidate, escaped: !isWithin(root, real) };
  }

  const documentCache = new Map();

  /** Classify one registered evidence document. @returns {import("./evidence-source.mjs").EvidenceSource & { documentId: string }} */
  function readDocument(documentId) {
    if (documentCache.has(documentId)) return documentCache.get(documentId);
    const spec = EVIDENCE_DOCUMENTS[documentId];
    if (!spec) throw new Error(`unknown evidence document '${documentId}'`);
    const { path, escaped } = evidencePath(spec.path);
    const source = escaped
      ? { status: "MALFORMED", supplied: true, document: null, text: null, classification: "PATH_ESCAPES_EVIDENCE_ROOT", byteLength: null }
      : readEvidenceSource(path, { shape: spec.shape });
    const result = { ...source, documentId };
    documentCache.set(documentId, result);
    return result;
  }

  const repositoryCache = new Map();

  /** Classify one repository-owned source (JSON or text). */
  function readRepositorySource(relPath, { text = false } = {}) {
    const key = `${text ? "text:" : "json:"}${relPath}`;
    if (repositoryCache.has(key)) return repositoryCache.get(key);
    const abs = repoPath(relPath);
    const spec = REPOSITORY_SOURCES[relPath] ?? {};
    const source = text ? readTextSource(abs) : readEvidenceSource(abs, { shape: spec.shape ?? null });
    repositoryCache.set(key, source);
    return source;
  }

  /** Which registered document, if any, a repository-relative path belongs to. */
  const documentByPath = new Map(Object.entries(EVIDENCE_DOCUMENTS).map(([id, spec]) => [spec.path, id]));

  /**
   * Legacy-shaped readers handed to the Phase 99 closure engine unchanged, so
   * `closure-core.mjs` and the Phase 99 CLI keep working exactly as before.
   * They return `null` for anything that is not a usable document — which is
   * correct for THEM, because Phase 100 has already classified the same paths
   * and records the malformed case as a FAIL at the document layer.
   */
  const readText = (relPath) => {
    const source = readRepositorySource(relPath, { text: true });
    return source.status === "VALID" ? source.text : null;
  };
  const readJson = (relPath) => {
    const documentId = documentByPath.get(relPath);
    const source = documentId ? readDocument(documentId) : readRepositorySource(relPath);
    return source.status === "VALID" ? source.document : null;
  };

  return { readDocument, readRepositorySource, readText, readJson, evidencePath, repoPath };
}

/**
 * Evidence must never be committed. This is checked by the evaluator itself and
 * not only by a test, because a test protects the repository while a check
 * protects the RELEASE: a run that silently read committed evidence would be
 * reporting on a file anyone with push access could have written.
 *
 * @returns {string[]} one message per violation
 */
export function evidenceRepositoryViolations({ repoRoot }) {
  const violations = [];
  for (const [documentId, spec] of Object.entries(EVIDENCE_DOCUMENTS)) {
    const abs = join(repoRoot, ...spec.path.split("/"));
    if (existsSync(abs)) {
      violations.push(
        `${documentId}: evidence is committed at ${spec.path} — owner and external evidence must live outside the repository ` +
        `(set ${EVIDENCE_ROOT_ENV}), never in a public tree`,
      );
    }
  }
  return violations;
}
