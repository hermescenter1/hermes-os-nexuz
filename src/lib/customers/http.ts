/**
 * HTTP helpers for the tenant customer routes.
 *
 * Authorization is NOT done here: each route handler resolves the active
 * organization and calls `requirePermission` itself, in the open, where the
 * Phase 99 route inventory can see it.
 */

import { randomUUID } from "node:crypto";
import type { NextResponse } from "next/server";
import type { ZodType } from "zod";
import { securityError } from "@/lib/security/request-guards";
import { CustomerError, type CustomerCtx } from "./service";

export function customerFailure(err: unknown): NextResponse {
  if (err instanceof CustomerError) {
    // `detail` carries only ids and versions of the caller's OWN organization.
    return securityError({ error: err.code, ...err.detail }, err.status);
  }
  return securityError({ error: "SERVICE_UNAVAILABLE" }, 503);
}

export function forbidden(): NextResponse {
  return securityError({ error: "FORBIDDEN" }, 403);
}

/**
 * Strict parse with FIELD-LEVEL problems for the form: the path of each field
 * and a generic code. The submitted values are never echoed back.
 */
export function parseFields<T>(
  schema: ZodType<T>,
  value: unknown,
): { ok: true; data: T } | { ok: false; response: NextResponse } {
  const parsed = schema.safeParse(value);
  if (parsed.success) return { ok: true, data: parsed.data };
  const problems = parsed.error.issues.slice(0, 20).map(issue => ({
    field: issue.path.map(String).join(".") || null,
    problem: issue.code === "unrecognized_keys" ? "UNKNOWN_FIELD" : issue.code === "too_big" ? "TOO_LONG" : "INVALID",
  }));
  return { ok: false, response: securityError({ error: "VALIDATION_FAILED", problems }, 422) };
}

export function customerCtx(scope: { organizationId: string; userId: string }): CustomerCtx {
  return { organizationId: scope.organizationId, userId: scope.userId, correlationId: randomUUID() };
}
