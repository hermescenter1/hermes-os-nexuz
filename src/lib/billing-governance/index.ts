// PHASE 96 — billing-governance public surface.
//
// The fail-closed commercial authority: plan + entitlement registry, entitlement
// resolver, subscription state machine, Stripe event mapper, commercial policy,
// money/currency safety and billing audit redaction. Pure logic + injected
// stores; no I/O in this barrel.

export * from "./types";
export * from "./plan-registry";
export * from "./entitlement-registry";
export * from "./commercial-policy";
export * from "./entitlement-store";
export * from "./entitlement-errors";
export {
  evaluateEntitlement,
  resolveEntitlement,
  type EntitlementContext,
} from "./entitlement-resolver";
export * from "./subscription-state-machine";
export * from "./stripe-event-mapper";
export * from "./money";
export * from "./audit";
