/**
 * Phase 97 Part I — Subprocessor & Data-Transfer governance (pure, I/O-free).
 *
 * Closed lifecycles, closed review vocabularies and fail-closed approval gates for
 * the tenant subprocessor register and the international data-transfer register.
 * Nothing here invents a legal mechanism, adequacy decision, contractual coverage
 * or approved country: every un-reviewed value stays quarantined as
 * REVIEW_REQUIRED / LEGAL_REVIEW_REQUIRED / CONFIGURATION_REQUIRED, and a record can
 * only become APPROVED/ACTIVE when every required review is POSITIVELY complete.
 *
 * Phase 95 precedence: a subprocessor that is linked to an external AI provider
 * (providerRegistryId) is additionally gated READ-ONLY through the REAL Phase 95
 * evaluator (evaluateProviderAccess) over the tenant's stored policy envelope. A
 * Phase 95 denial always wins (PHASE95_PROVIDER_POLICY_DENIAL_OVERRIDDEN=0), a
 * missing policy context fails closed as configuration-required — never as approval
 * (MISSING_PROVIDER_POLICY_FAIL_OPEN=0) — and no provider is ever contacted.
 */
import { createHash } from "node:crypto";
import { evaluateProviderAccess, type OrganisationProviderPolicy } from "@/lib/ai-governance/provider-policy";
import type { GovernanceDenyReason, DataClass } from "@/lib/ai-governance/types";

// ── Closed vocabularies ───────────────────────────────────────────────────────

export type GovernanceLifecycle =
  | "DRAFT" | "UNDER_REVIEW" | "APPROVED" | "ACTIVE" | "SUSPENDED" | "RETIRED"
  | "REVIEW_REQUIRED"; // legacy/unknown quarantine — never auto-approved

export const GOVERNANCE_LIFECYCLES: GovernanceLifecycle[] = [
  "DRAFT", "UNDER_REVIEW", "APPROVED", "ACTIVE", "SUSPENDED", "RETIRED", "REVIEW_REQUIRED",
];

export type ReviewStatus = "REVIEW_REQUIRED" | "IN_REVIEW" | "APPROVED" | "REJECTED";
export const REVIEW_STATUSES: ReviewStatus[] = ["REVIEW_REQUIRED", "IN_REVIEW", "APPROVED", "REJECTED"];

/** Transfer-mechanism state. CONFIGURED is only ever set by an explicit legal
 *  review action — the system never infers adequacy or contractual coverage. */
export type MechanismStatus = "CONFIGURED" | "LEGAL_REVIEW_REQUIRED" | "CONFIGURATION_REQUIRED";
export const MECHANISM_STATUSES: MechanismStatus[] = ["CONFIGURED", "LEGAL_REVIEW_REQUIRED", "CONFIGURATION_REQUIRED"];

export function isGovernanceLifecycle(v: unknown): v is GovernanceLifecycle {
  return typeof v === "string" && (GOVERNANCE_LIFECYCLES as string[]).includes(v);
}
export function isReviewStatus(v: unknown): v is ReviewStatus {
  return typeof v === "string" && (REVIEW_STATUSES as string[]).includes(v);
}
export function isMechanismStatus(v: unknown): v is MechanismStatus {
  return typeof v === "string" && (MECHANISM_STATUSES as string[]).includes(v);
}

// ── Closed transition map (shared by both registers) ──────────────────────────

export const GOVERNANCE_TRANSITIONS: Record<GovernanceLifecycle, GovernanceLifecycle[]> = {
  DRAFT:           ["UNDER_REVIEW", "RETIRED"],
  UNDER_REVIEW:    ["APPROVED", "DRAFT", "RETIRED"],
  APPROVED:        ["ACTIVE", "UNDER_REVIEW", "SUSPENDED", "RETIRED"], // →UNDER_REVIEW = supersession (clears approval)
  ACTIVE:          ["SUSPENDED", "RETIRED"],
  SUSPENDED:       ["UNDER_REVIEW", "RETIRED"],
  RETIRED:         [],
  REVIEW_REQUIRED: ["UNDER_REVIEW", "RETIRED"], // quarantine exits only via explicit review
};

export type GovernanceAction = "manage" | "approve";
const TRANSITION_ACTION: Record<string, GovernanceAction> = {
  "DRAFT->UNDER_REVIEW":        "manage",
  "DRAFT->RETIRED":             "manage",
  "UNDER_REVIEW->APPROVED":     "approve",
  "UNDER_REVIEW->DRAFT":        "manage",
  "UNDER_REVIEW->RETIRED":      "manage",
  "APPROVED->ACTIVE":           "approve", // activation re-runs every gate
  "APPROVED->UNDER_REVIEW":     "manage",  // explicit supersession / re-review
  "APPROVED->SUSPENDED":        "manage",
  "APPROVED->RETIRED":          "manage",
  "ACTIVE->SUSPENDED":          "manage",
  "ACTIVE->RETIRED":            "manage",
  "SUSPENDED->UNDER_REVIEW":    "manage",
  "SUSPENDED->RETIRED":         "manage",
  "REVIEW_REQUIRED->UNDER_REVIEW": "manage",
  "REVIEW_REQUIRED->RETIRED":      "manage",
};

export function canTransitionGovernance(from: string, to: string): boolean {
  if (from === to) return false;
  const allowed = GOVERNANCE_TRANSITIONS[from as GovernanceLifecycle];
  return Array.isArray(allowed) && (allowed as string[]).includes(to);
}
export function governanceTransitionAction(from: string, to: string): GovernanceAction | null {
  if (!canTransitionGovernance(from, to)) return null;
  return TRANSITION_ACTION[`${from}->${to}`] ?? null;
}

/** Material fields are editable ONLY pre-approval; APPROVED/ACTIVE evidence is
 *  immutable except through the explicit APPROVED→UNDER_REVIEW supersession. */
export const EDITABLE_LIFECYCLES: GovernanceLifecycle[] = ["DRAFT", "UNDER_REVIEW"];
export function isEditableLifecycle(v: string): boolean {
  return (EDITABLE_LIFECYCLES as string[]).includes(v);
}

// ── Review gates (fail-closed) ────────────────────────────────────────────────

export interface ApprovalBlocker { field: string; reason: string }

export interface SubprocessorReviewLike {
  contractReviewStatus: string;
  privacyReviewStatus:  string;
  securityReviewStatus: string;
}

/** All three governed reviews must be POSITIVELY complete (APPROVED). Any
 *  REVIEW_REQUIRED / IN_REVIEW / REJECTED / unknown value blocks approval. */
export function subprocessorReviewBlockers(r: SubprocessorReviewLike): ApprovalBlocker[] {
  const blockers: ApprovalBlocker[] = [];
  for (const [field, value] of [
    ["contractReviewStatus", r.contractReviewStatus],
    ["privacyReviewStatus",  r.privacyReviewStatus],
    ["securityReviewStatus", r.securityReviewStatus],
  ] as const) {
    if (value !== "APPROVED") blockers.push({ field, reason: isReviewStatus(value) ? value : "UNKNOWN_STATUS" });
  }
  return blockers;
}

export interface TransferReviewLike {
  transferMechanismStatus: string;
  legalReviewStatus:       string;
  riskReviewStatus:        string;
}

/** The transfer mechanism must be explicitly CONFIGURED by legal review AND the
 *  legal + risk reviews positively complete. LEGAL_REVIEW_REQUIRED /
 *  CONFIGURATION_REQUIRED are never treated as adequacy or coverage. */
export function transferReviewBlockers(r: TransferReviewLike): ApprovalBlocker[] {
  const blockers: ApprovalBlocker[] = [];
  if (r.transferMechanismStatus !== "CONFIGURED") {
    blockers.push({ field: "transferMechanismStatus", reason: isMechanismStatus(r.transferMechanismStatus) ? r.transferMechanismStatus : "UNKNOWN_STATUS" });
  }
  if (r.legalReviewStatus !== "APPROVED") blockers.push({ field: "legalReviewStatus", reason: isReviewStatus(r.legalReviewStatus) ? r.legalReviewStatus : "UNKNOWN_STATUS" });
  if (r.riskReviewStatus !== "APPROVED") blockers.push({ field: "riskReviewStatus", reason: isReviewStatus(r.riskReviewStatus) ? r.riskReviewStatus : "UNKNOWN_STATUS" });
  return blockers;
}

// ── Phase 95 EXACT provider-scope binding (read-only, no provider contact) ────
//
// A provider-linked Subprocessor declares an EXPLICIT closed provider-governance
// scope (providerDataClasses × providerWorkflows), separate from the free-form
// compliance labels. Approval requires that EVERY declared combination is permitted
// by the real Phase 95 evaluator — one allowed combination must never hide another
// denied one. secret/credential scope is always denied; an unknown data class fails
// closed; an empty scope never authorises. The approved evidence binds to the exact
// Policy version and a SHA-256 hash of the canonical (sorted, deduped) scope.

/** The Phase 95 closed data-class vocabulary, mirrored with a compile-time
 *  exhaustiveness check so a future DataClass addition cannot silently drift. */
export const KNOWN_DATA_CLASSES = ["public", "tenant_operational", "tenant_industrial_confidential", "personal_data", "secret"] as const satisfies readonly DataClass[];
type _DataClassExhaustive = Exclude<DataClass, typeof KNOWN_DATA_CLASSES[number]> extends never ? true : never;
const _dataClassExhaustive: _DataClassExhaustive = true; void _dataClassExhaustive;
export function isDataClass(v: unknown): v is DataClass {
  return typeof v === "string" && (KNOWN_DATA_CLASSES as readonly string[]).includes(v);
}

/** Sorted, deduplicated, trimmed, non-empty string list — the canonical scope form. */
export function normalizeScopeList(list: unknown): string[] {
  if (!Array.isArray(list)) return [];
  const set = new Set<string>();
  for (const v of list) { if (typeof v === "string") { const t = v.trim(); if (t) set.add(t); } }
  return [...set].sort();
}

/** SHA-256 over the CANONICAL (sorted, deduped) provider scope — deterministic
 *  regardless of input order or duplicates. Never contains a key or secret. */
export function providerScopeHash(dataClasses: unknown, workflows: unknown): string {
  const canon = { dataClasses: normalizeScopeList(dataClasses), workflows: normalizeScopeList(workflows) };
  return createHash("sha256").update(JSON.stringify(canon)).digest("hex");
}

// ── Strict, fail-closed provider-scope parsing ────────────────────────────────
//
// normalizeScopeList silently DROPS a non-string / whitespace-only element, which
// would let a malformed stored scope be canonicalised-and-hashed as though the bad
// element never existed (the hash would then EXCLUDE a stored element). The strict
// parser instead REJECTS such input as PROVIDER_SCOPE_INVALID, so the canonical
// scope + its SHA-256 hash are only ever computed over fully-validated data
// (MALFORMED_PROVIDER_SCOPE_APPROVAL=0, PARTIALLY_NORMALIZED_PROVIDER_SCOPE_APPROVAL=0,
// PROVIDER_SCOPE_HASH_EXCLUDES_STORED_ELEMENT=0).

export const MAX_PROVIDER_SCOPE_ELEMENTS = 64;
export const MAX_PROVIDER_SCOPE_ELEMENT_LENGTH = 120;

export type ScopeListParse = { ok: true; values: string[] } | { ok: false };

/**
 * Strict parse of ONE provider-scope list. Fails closed (never silently ignores)
 * on: a non-array, a non-string element (number/object/null/boolean), a
 * whitespace-only/empty element, an over-long element, or an over-large array. On
 * success returns the canonical (trimmed, deduped, sorted) list.
 */
export function parseProviderScopeList(list: unknown): ScopeListParse {
  if (!Array.isArray(list)) return { ok: false };
  if (list.length > MAX_PROVIDER_SCOPE_ELEMENTS) return { ok: false };
  const set = new Set<string>();
  for (const v of list) {
    if (typeof v !== "string") return { ok: false };                 // number/object/null/boolean → INVALID
    const t = v.trim();
    if (!t || t.length > MAX_PROVIDER_SCOPE_ELEMENT_LENGTH) return { ok: false }; // whitespace-only / over-long → INVALID
    set.add(t);
  }
  return { ok: true, values: [...set].sort() };
}

export type ProviderScopeParse =
  | { ok: true; dataClasses: string[]; workflows: string[] }
  | { ok: false; code: "PROVIDER_SCOPE_INVALID" }
  | { ok: false; code: "PROVIDER_SCOPE_CONFIGURATION_REQUIRED" };

/**
 * Strict parse of the FULL declared provider scope. A malformed element in either
 * list fails closed as PROVIDER_SCOPE_INVALID (never silently normalized); an empty
 * canonical list (nothing declared) is PROVIDER_SCOPE_CONFIGURATION_REQUIRED.
 */
export function parseProviderScope(dataClasses: unknown, workflows: unknown): ProviderScopeParse {
  const dc = parseProviderScopeList(dataClasses);
  const wf = parseProviderScopeList(workflows);
  if (!dc.ok || !wf.ok) return { ok: false, code: "PROVIDER_SCOPE_INVALID" };
  if (dc.values.length === 0 || wf.values.length === 0) return { ok: false, code: "PROVIDER_SCOPE_CONFIGURATION_REQUIRED" };
  return { ok: true, dataClasses: dc.values, workflows: wf.values };
}

export type ProviderScopeGate =
  | { ok: true; policyVersion: string; scopeHash: string }
  | { ok: false; code: "PROVIDER_SCOPE_INVALID" }
  | { ok: false; code: "PROVIDER_SCOPE_CONFIGURATION_REQUIRED" }
  | { ok: false; code: "PROVIDER_POLICY_CONFIGURATION_REQUIRED" }
  | { ok: false; code: "PROVIDER_POLICY_DENIED"; reason: GovernanceDenyReason; dataClass: string; workflow: string };

/**
 * Bind a provider-linked Subprocessor's EXACT declared scope to the current Policy.
 * Every (dataClass × workflow) combination must be permitted by the external
 * provider registry, the current org Policy, the production environment and the
 * external-AI feature gate. Fail-closed: empty scope → PROVIDER_SCOPE_CONFIGURATION_
 * REQUIRED; missing policy → PROVIDER_POLICY_CONFIGURATION_REQUIRED; any denial (incl.
 * an unknown/secret data class) → PROVIDER_POLICY_DENIED. Deterministic: iteration is
 * over the sorted, deduped scope, so the reported denial is stable. Pure — no I/O.
 */
export function bindProviderScope(params: {
  organizationId:      string;
  providerRegistryId:  string;   // caller guarantees non-null (record is provider-linked)
  providerDataClasses: unknown;
  providerWorkflows:   unknown;
  policy:              OrganisationProviderPolicy | null; // the LOCKED policy row (or null)
  externalAiEnabled:   boolean;
  now:                 Date;
}): ProviderScopeGate {
  // STRICT parse first — a malformed stored/declared scope fails closed and its hash
  // is never computed (so no bad element can be silently excluded from the hash).
  const parsed = parseProviderScope(params.providerDataClasses, params.providerWorkflows);
  if (!parsed.ok) return parsed;
  const { dataClasses, workflows } = parsed;
  if (!params.policy) return { ok: false, code: "PROVIDER_POLICY_CONFIGURATION_REQUIRED" };

  for (const dataClass of dataClasses) {
    if (!isDataClass(dataClass)) return { ok: false, code: "PROVIDER_POLICY_DENIED", reason: "UNAPPROVED_DATA_CLASS", dataClass, workflow: workflows[0] };
    for (const workflow of workflows) {
      const decision = evaluateProviderAccess(
        {
          organisationId: params.organizationId,
          providerRegistryId: params.providerRegistryId,
          dataClass,
          workflow,
          environment: "production",
          externalAiEnabled: params.externalAiEnabled,
          now: params.now,
        },
        params.policy,
      );
      if (!decision.allowed) return { ok: false, code: "PROVIDER_POLICY_DENIED", reason: decision.reason, dataClass, workflow };
    }
  }
  return { ok: true, policyVersion: params.policy.policyVersion, scopeHash: providerScopeHash(dataClasses, workflows) };
}

/** Render a failed provider-scope gate as a closed approval-blocker reason. */
export function providerScopeBlockerReason(scope: Extract<ProviderScopeGate, { ok: false }>): string {
  return scope.code === "PROVIDER_POLICY_DENIED" ? `PROVIDER_POLICY_DENIED:${scope.reason}` : scope.code;
}

/** Combined subprocessor approval gate: reviews AND (when provider-linked) the exact
 *  provider-scope binding must ALL pass. A Phase 95 denial can never be overridden. */
export function canApproveSubprocessor(
  reviews: SubprocessorReviewLike,
  scope: ProviderScopeGate | null, // null = not provider-linked (gate does not apply)
): { ok: boolean; blockers: ApprovalBlocker[] } {
  const blockers = subprocessorReviewBlockers(reviews);
  if (scope && !scope.ok) blockers.push({ field: "providerScope", reason: providerScopeBlockerReason(scope) });
  return { ok: blockers.length === 0, blockers };
}

/** Combined transfer approval gate: mechanism + legal + risk reviews, plus (when
 *  linked) an APPROVED/ACTIVE same-org subprocessor. Provider re-validation
 *  (current-policy version + scope binding) is applied additionally at the DB layer. */
export function canApproveTransfer(
  reviews: TransferReviewLike,
  linkedSubprocessorLifecycle: string | null, // null = no subprocessor linked
): { ok: boolean; blockers: ApprovalBlocker[] } {
  const blockers = transferReviewBlockers(reviews);
  if (linkedSubprocessorLifecycle !== null && !["APPROVED", "ACTIVE"].includes(linkedSubprocessorLifecycle)) {
    blockers.push({ field: "subprocessorId", reason: "SUBPROCESSOR_NOT_APPROVED" });
  }
  return { ok: blockers.length === 0, blockers };
}
