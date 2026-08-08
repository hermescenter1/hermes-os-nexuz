// PHASE 95 — deterministic offline evaluation harness.
//
// Runs synthetic adversarial cases through the governance library with NO
// external provider call. Each case declares an expected governance decision;
// the harness computes aggregate metrics and zero-tolerance budget violations.
// It emits identifiers and counts only — never fixture prompt content — so its
// output is safe to log in CI.

import { screenForInjection } from "../injection-screen";
import { verifyCitations, type RetrievedSource } from "../citation-verifier";
import { decideRetrieval, type SourceProvenance } from "../rag-provenance";
import { enforceUnsafeOutputPolicy } from "../unsafe-output";
import { evaluateProviderAccess, type OrganisationProviderPolicy, type ProviderAccessContext } from "../provider-policy";
import type { IndustrialOutputClass } from "../types";

export type EvalCategory =
  | "injection"
  | "citation"
  | "rag_poisoning"
  | "unsafe"
  | "tenant_policy";

export interface EvalCase {
  caseId: string;
  locale: string;
  category: EvalCategory;
  riskLevel: "low" | "medium" | "high";
  /** Category-specific payload (synthetic; no real tenant data). */
  input: Record<string, unknown>;
  /** The governance outcome the library MUST produce. */
  expected: string;
}

export interface CaseOutcome {
  caseId: string;
  category: EvalCategory;
  riskLevel: string;
  actual: string;
  pass: boolean;
}

function str(v: unknown, d = ""): string {
  return typeof v === "string" ? v : d;
}
function arr<T = unknown>(v: unknown): T[] {
  return Array.isArray(v) ? (v as T[]) : [];
}

/** Evaluate one case deterministically. Returns the library's actual decision. */
export function evaluateCase(c: EvalCase): CaseOutcome {
  let actual = "ERROR";
  switch (c.category) {
    case "injection": {
      actual = screenForInjection(str(c.input.text)).highRisk ? "high_risk" : "benign";
      break;
    }
    case "citation": {
      const v = verifyCitations(
        arr<string>(c.input.emitted),
        arr<RetrievedSource>(c.input.retrieved),
        { organisationId: str(c.input.organisationId, "") || null, siteId: (c.input.siteId as string | null) ?? null },
      );
      actual = v.status; // ok | partial | none
      break;
    }
    case "rag_poisoning": {
      const d = decideRetrieval(c.input.source as SourceProvenance, {
        organisationId: (c.input.organisationId as string | null) ?? null,
        siteId: (c.input.siteId as string | null) ?? null,
        safetyRelevant: Boolean(c.input.safetyRelevant),
        includeArchived: Boolean(c.input.includeArchived),
      });
      actual = d.disposition; // AUTHORITATIVE | DATA_ONLY | BLOCKED
      break;
    }
    case "unsafe": {
      const d = enforceUnsafeOutputPolicy(
        str(c.input.outputClass, "INFORMATIONAL") as IndustrialOutputClass,
        Boolean(c.input.deterministicApproval),
        str(c.input.text),
      );
      actual = d.status; // ALLOW | REVIEW_REQUIRED | BLOCKED
      break;
    }
    case "tenant_policy": {
      const ctx = c.input.ctx as ProviderAccessContext;
      const policy = (c.input.policy as OrganisationProviderPolicy | null) ?? null;
      // Revive Date fields deterministically.
      const revived = policy
        ? { ...policy, approvedAt: new Date(policy.approvedAt), createdAt: new Date(policy.createdAt), updatedAt: new Date(policy.updatedAt), expiresAt: policy.expiresAt ? new Date(policy.expiresAt) : null }
        : null;
      const decision = evaluateProviderAccess({ ...ctx, now: new Date(str(c.input.now, "2026-08-02T00:00:00Z")) }, revived);
      actual = decision.allowed ? "ALLOW" : decision.reason;
      break;
    }
  }
  return { caseId: c.caseId, category: c.category, riskLevel: c.riskLevel, actual, pass: actual === c.expected };
}

export interface EvalMetrics {
  total: number;
  passed: number;
  failed: number;
  byCategory: Record<string, { total: number; passed: number }>;
  /** Zero-tolerance safety/security escapes (must all be 0). */
  budgets: {
    fabricated_citations: number;
    cross_tenant_disclosure: number;
    secret_disclosure: number;
    system_prompt_disclosure: number;
    unsafe_recommendation_escape: number;
    approval_bypass: number;
    high_risk_unsupported_claim: number;
  };
}

/** Aggregate outcomes into metrics + zero-tolerance budget counters. A budget
 *  counter increments when a HIGH-risk case of the relevant kind did NOT get the
 *  required safe decision. */
export function aggregate(cases: EvalCase[], outcomes: CaseOutcome[]): EvalMetrics {
  const byCategory: Record<string, { total: number; passed: number }> = {};
  const budgets = {
    fabricated_citations: 0,
    cross_tenant_disclosure: 0,
    secret_disclosure: 0,
    system_prompt_disclosure: 0,
    unsafe_recommendation_escape: 0,
    approval_bypass: 0,
    high_risk_unsupported_claim: 0,
  };
  let passed = 0;
  for (let i = 0; i < cases.length; i += 1) {
    const c = cases[i];
    const o = outcomes[i];
    byCategory[c.category] ??= { total: 0, passed: 0 };
    byCategory[c.category].total += 1;
    if (o.pass) {
      byCategory[c.category].passed += 1;
      passed += 1;
      continue;
    }
    // A failed HIGH-risk case is a budget violation of its kind.
    if (c.riskLevel !== "high") continue;
    const kind = str(c.input.budget);
    if (kind && kind in budgets) budgets[kind as keyof typeof budgets] += 1;
    else if (c.category === "unsafe") budgets.unsafe_recommendation_escape += 1;
    else if (c.category === "citation") budgets.fabricated_citations += 1;
    else if (c.category === "rag_poisoning") budgets.cross_tenant_disclosure += 1;
    else if (c.category === "tenant_policy") budgets.cross_tenant_disclosure += 1;
    else if (c.category === "injection") budgets.high_risk_unsupported_claim += 1;
  }
  return {
    total: cases.length,
    passed,
    failed: cases.length - passed,
    byCategory,
    budgets,
  };
}

export interface BudgetSpec {
  [key: string]: number;
}

/** Return the list of budget keys that EXCEEDED their (zero) limit. */
export function checkBudgets(metrics: EvalMetrics, spec: BudgetSpec): string[] {
  const violations: string[] = [];
  for (const [key, limit] of Object.entries(spec)) {
    const actual = metrics.budgets[key as keyof EvalMetrics["budgets"]] ?? 0;
    if (actual > limit) violations.push(`${key}: ${actual} > ${limit}`);
  }
  return violations;
}

/** Parse a JSONL fixture body into cases. Blank lines and comments (#) ignored. */
export function parseJsonl(text: string): EvalCase[] {
  return text
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => l.length > 0 && !l.startsWith("#"))
    .map((l) => JSON.parse(l) as EvalCase);
}
