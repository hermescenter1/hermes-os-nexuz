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
import { evaluateProviderAccess, type OrganisationProviderPolicy } from "@/lib/ai-governance/provider-policy";
import type { GovernanceDenyReason } from "@/lib/ai-governance/types";

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

// ── Phase 95 provider-policy precedence (read-only, no provider contact) ──────

export type ProviderPolicyGate =
  | { ok: true; basis: "NOT_PROVIDER_LINKED" }
  | { ok: true; basis: "PROVIDER_POLICY_ALLOWED"; policyVersion: string }
  | { ok: false; code: "PROVIDER_POLICY_CONFIGURATION_REQUIRED" }
  | { ok: false; code: "PROVIDER_POLICY_DENIED"; reason: GovernanceDenyReason };

/**
 * Gate a provider-linked subprocessor through the REAL Phase 95 evaluator.
 *   - No providerRegistryId → the gate does not apply (reviews still gate approval).
 *   - Missing tenant policy row → CONFIGURATION_REQUIRED (fail closed, NOT approval).
 *   - Otherwise evaluateProviderAccess is run over the policy's OWN declared
 *     (dataClass × workflow) scope in the production environment; the subprocessor
 *     passes only if Phase 95 would permit at least one declared combination.
 *     Every combination denied ⇒ the Phase 95 denial WINS and approval is blocked.
 * Pure: nothing here performs any I/O or contacts any provider.
 */
export function assessSubprocessorProviderPolicy(params: {
  organizationId:     string;
  providerRegistryId: string | null;
  policy:             OrganisationProviderPolicy | null; // injected, read-only
  externalAiEnabled:  boolean;
  now:                Date;
}): ProviderPolicyGate {
  if (!params.providerRegistryId) return { ok: true, basis: "NOT_PROVIDER_LINKED" };
  if (!params.policy) return { ok: false, code: "PROVIDER_POLICY_CONFIGURATION_REQUIRED" };

  let lastReason: GovernanceDenyReason = "NO_POLICY";
  let evaluated = 0;
  for (const dataClass of params.policy.allowedDataClasses) {
    for (const workflow of params.policy.allowedWorkflows) {
      evaluated += 1;
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
      if (decision.allowed) return { ok: true, basis: "PROVIDER_POLICY_ALLOWED", policyVersion: decision.policyVersion };
      lastReason = decision.reason;
    }
  }
  // A policy that declares no usable scope cannot authorise anything.
  if (evaluated === 0) return { ok: false, code: "PROVIDER_POLICY_DENIED", reason: "UNAPPROVED_DATA_CLASS" };
  return { ok: false, code: "PROVIDER_POLICY_DENIED", reason: lastReason };
}

/** Combined subprocessor approval gate: reviews AND (when provider-linked) the
 *  Phase 95 gate must ALL pass. A Phase 95 denial can never be overridden. */
export function canApproveSubprocessor(
  reviews: SubprocessorReviewLike,
  providerGate: ProviderPolicyGate,
): { ok: boolean; blockers: ApprovalBlocker[] } {
  const blockers = subprocessorReviewBlockers(reviews);
  if (!providerGate.ok) {
    blockers.push({ field: "providerRegistryId", reason: providerGate.code === "PROVIDER_POLICY_DENIED" ? `PROVIDER_POLICY_DENIED:${providerGate.reason}` : providerGate.code });
  }
  return { ok: blockers.length === 0, blockers };
}

/** Combined transfer approval gate: mechanism + legal + risk reviews, plus (when
 *  linked) an APPROVED/ACTIVE same-org subprocessor. */
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
