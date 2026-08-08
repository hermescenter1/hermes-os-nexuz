// PHASE 95 — tenant external-provider policy (fail-closed, default-deny).
//
// Tenant data must NOT leave Hermes infrastructure merely because an API key
// exists. Using an external provider for tenant data requires BOTH a global
// external-AI feature flag AND an approved, unexpired, organisation-scoped policy
// that covers the exact provider, data class, workflow and environment. Anything
// else denies. This module is pure decision logic over an INJECTED policy row;
// it performs no I/O and stores/reads no secret. Persistence (a Prisma model) is
// bound by the caller through ProviderPolicyStore.

import { externalRegistryEntries, getRegistryEntry } from "./model-registry";
import {
  type DataClass,
  type DeploymentEnvironment,
  type GovernanceDenyReason,
} from "./types";

/** An organisation-scoped external-provider approval. Never holds a key or a
 *  raw prompt — only the approval envelope. */
export interface OrganisationProviderPolicy {
  organisationId: string;
  providerRegistryId: string;
  enabled: boolean;
  allowedDataClasses: DataClass[];
  allowedWorkflows: string[];
  approvedBy: string;
  approvedAt: Date;
  policyVersion: string;
  /** null = no expiry; a past date = expired (deny). */
  expiresAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface ProviderPolicyStore {
  find(organisationId: string, providerRegistryId: string): Promise<OrganisationProviderPolicy | null>;
}

export interface ProviderAccessContext {
  /** The org that OWNS the request (authenticated). */
  organisationId: string;
  providerRegistryId: string;
  dataClass: DataClass;
  workflow: string;
  environment: DeploymentEnvironment;
  /** Global external-AI kill switch — must be true or everything denies. */
  externalAiEnabled: boolean;
  /** Current time (injected for deterministic tests). */
  now: Date;
}

export type ProviderAccessDecision =
  | { allowed: true; providerRegistryId: string; policyVersion: string }
  | { allowed: false; reason: GovernanceDenyReason };

/**
 * PURE fail-closed evaluation. `policy` is the already-fetched row (or null).
 * Order matters: cheap global denials first, then identity, then per-tenant
 * approval scope. A secret/credential data class is ALWAYS denied.
 */
export function evaluateProviderAccess(
  ctx: ProviderAccessContext,
  policy: OrganisationProviderPolicy | null,
): ProviderAccessDecision {
  // Secrets/credentials never leave, regardless of any policy.
  if (ctx.dataClass === "secret") return { allowed: false, reason: "SECRET_OR_CREDENTIAL" };

  // Global kill switch.
  if (ctx.externalAiEnabled !== true) return { allowed: false, reason: "FEATURE_FLAG_OFF" };

  // Provider/model must be a known EXTERNAL registry entry.
  const entry = getRegistryEntry(ctx.providerRegistryId);
  if (!entry) return { allowed: false, reason: "UNKNOWN_PROVIDER" };
  if (!entry.external) return { allowed: false, reason: "UNKNOWN_MODEL" }; // internal entries never take this path
  if (!entry.allowedEnvironments.includes(ctx.environment)) {
    return { allowed: false, reason: "ENVIRONMENT_NOT_ALLOWED" };
  }
  // The data class must be permitted by the registry entry itself.
  if (!entry.allowedDataClasses.includes(ctx.dataClass)) {
    return { allowed: false, reason: "UNAPPROVED_DATA_CLASS" };
  }

  // Per-tenant approved policy required.
  if (!policy) return { allowed: false, reason: "NO_POLICY" };
  // Cross-tenant: a policy for a different org can never authorise this request.
  if (policy.organisationId !== ctx.organisationId) return { allowed: false, reason: "CROSS_TENANT" };
  if (policy.providerRegistryId !== ctx.providerRegistryId) return { allowed: false, reason: "UNKNOWN_PROVIDER" };
  if (policy.enabled !== true) return { allowed: false, reason: "POLICY_DISABLED" };
  if (policy.expiresAt !== null && policy.expiresAt.getTime() <= ctx.now.getTime()) {
    return { allowed: false, reason: "POLICY_EXPIRED" };
  }
  if (!policy.allowedDataClasses.includes(ctx.dataClass)) {
    return { allowed: false, reason: "UNAPPROVED_DATA_CLASS" };
  }
  if (!policy.allowedWorkflows.includes(ctx.workflow)) {
    return { allowed: false, reason: "UNAPPROVED_DATA_CLASS" };
  }

  return { allowed: true, providerRegistryId: ctx.providerRegistryId, policyVersion: policy.policyVersion };
}

/** Async wrapper that fetches the policy row from an injected store, then
 *  applies the pure evaluation. The store never receives a secret. */
export async function resolveProviderAccess(
  store: ProviderPolicyStore,
  ctx: ProviderAccessContext,
): Promise<ProviderAccessDecision> {
  // Cheap denials that need no store round-trip.
  if (ctx.dataClass === "secret") return { allowed: false, reason: "SECRET_OR_CREDENTIAL" };
  if (ctx.externalAiEnabled !== true) return { allowed: false, reason: "FEATURE_FLAG_OFF" };
  if (!getRegistryEntry(ctx.providerRegistryId)) return { allowed: false, reason: "UNKNOWN_PROVIDER" };
  const policy = await store.find(ctx.organisationId, ctx.providerRegistryId);
  return evaluateProviderAccess(ctx, policy);
}

/** True when at least one external provider COULD be used (a registry fact, not
 *  a runtime approval). Used by observability, never as an authorisation. */
export function hasExternalProviders(): boolean {
  return externalRegistryEntries().length > 0;
}
