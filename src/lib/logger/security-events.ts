/**
 * PHASE 90 — structured security-event logging.
 *
 * Before this phase, authentication failures and authorization denials left no
 * trace in the log stream: only site-level denials reached the audit table, and
 * nothing at all reached stdout. An operator investigating "who was probing
 * what" had nothing to grep.
 *
 * These helpers emit ONE line per event with a stable shape so the stream can
 * be aggregated:
 *   { ts, level, svc, reqId, msg, event, operation, outcome, ... }
 *
 * DISCLOSURE RULE — a denial log describes the ATTEMPT, never the protected
 * resource. It records which operation was refused and why, plus opaque
 * identifiers (a resource id the caller already supplied, a role name), and
 * never the resource's contents, another tenant's data, or any credential.
 * The logger's deny-list redaction still runs on top of everything here.
 */

import { logger } from "./index";

export type SecurityOutcome = "denied" | "failed";

export interface SecurityEventContext {
  /** Correlation id from `resolveRequestId`, so the denial ties to its request. */
  reqId?: string;
  /** Logical operation being attempted, e.g. "brain.history.read". */
  operation: string;
  /** Machine-readable reason, e.g. "no_session", "insufficient_role". */
  reason: string;
  /** Authenticated user, when one exists. Never an email or token. */
  userId?: string;
  /** Tenant context, when established. */
  orgId?: string;
  siteId?: string;
  /** Role the caller actually held — useful for RBAC tuning. */
  role?: string;
  /** Identifier the CALLER supplied (already known to them; never resolved content). */
  resourceId?: string;
  resourceType?: string;
}

/**
 * Authentication failure: no session, an invalid/expired token, bad credentials.
 * WARN — expected in normal operation, actionable only in aggregate.
 */
export function logAuthFailure(ctx: SecurityEventContext): void {
  logger.warn(
    "auth.failure",
    {
      event: "auth_failure",
      outcome: "failed" satisfies SecurityOutcome,
      operation: ctx.operation,
      reason: ctx.reason,
      ...optional(ctx),
    },
    ctx.reqId,
  );
}

/**
 * Authorization denial: authenticated, but lacking role / membership / scope /
 * tenant ownership. WARN — a spike is a probing signal.
 */
export function logAuthzDenial(ctx: SecurityEventContext): void {
  logger.warn(
    "authz.denied",
    {
      event: "authz_denied",
      outcome: "denied" satisfies SecurityOutcome,
      operation: ctx.operation,
      reason: ctx.reason,
      ...optional(ctx),
    },
    ctx.reqId,
  );
}

/**
 * Infrastructure failure (database, cache, mail transport). Records the error
 * CLASS and message only — never the offending payload, connection string or
 * credential. ERROR — actionable.
 */
export function logInfraFailure(
  subsystem: "database" | "cache" | "email" | "startup",
  operation: string,
  error: unknown,
  reqId?: string,
): void {
  logger.error(
    `${subsystem}.failure`,
    {
      event: "infra_failure",
      subsystem,
      operation,
      outcome: "failed" satisfies SecurityOutcome,
      errorClass: error instanceof Error ? error.constructor.name : typeof error,
      // Message only — an Error's message is authored by us or the driver and
      // does not carry the query payload. Stacks stay out of the stream.
      errorMessage: error instanceof Error ? error.message.slice(0, 300) : undefined,
    },
    reqId,
  );
}

/** Only include identity/resource fields that are actually present. */
function optional(ctx: SecurityEventContext): Record<string, unknown> {
  return {
    ...(ctx.userId ? { userId: ctx.userId } : {}),
    ...(ctx.orgId ? { orgId: ctx.orgId } : {}),
    ...(ctx.siteId ? { siteId: ctx.siteId } : {}),
    ...(ctx.role ? { role: ctx.role } : {}),
    ...(ctx.resourceId ? { resourceId: ctx.resourceId } : {}),
    ...(ctx.resourceType ? { resourceType: ctx.resourceType } : {}),
  };
}
