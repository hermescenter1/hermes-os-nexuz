/**
 * Shared HTTP plumbing for ERP tenant routes (HRIS-0.5).
 *
 * Every mutation: trusted Origin -> bounded JSON -> strict Zod -> org scope
 * (membership + OrgPermission) -> service. Every failure is a stable code via
 * erpFailure(); no stack traces, no database text, no internal identifiers.
 */

import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { resolveRequestId } from "@/lib/logger/correlation";
import { canonicalIdempotencyKey, IDEMPOTENCY_HEADER } from "@/lib/idempotency/keys";
import {
  isJsonContentType,
  readBoundedJson,
  requireTrustedOrigin,
  securityError,
  SMALL_JSON_BODY_BYTES,
} from "@/lib/security/request-guards";
import type { ZodType } from "zod";
import { ErpError, erpFailure } from "./tenant";
import type { ErpCtx } from "./db";
import type { ErpScope } from "./tenant";

/** Refuses a mutation whose Origin is not trusted. Returns null when allowed. */
export function originRefusal(req: Request): NextResponse | null {
  const verdict = requireTrustedOrigin(req, "jwt");
  return verdict.ok ? null : erpFailure(new ErpError(403, "ORIGIN_NOT_ALLOWED"));
}

export type BodyResult = { ok: true; value: unknown } | { ok: false; response: NextResponse };

/** Bounded, JSON-only body read. Nothing is parsed beyond the byte ceiling. */
export async function readJsonBody(req: NextRequest): Promise<BodyResult> {
  if (!isJsonContentType(req)) return { ok: false, response: erpFailure(new ErpError(415, "INVALID_REQUEST")) };
  const read = await readBoundedJson<unknown>(req, SMALL_JSON_BODY_BYTES);
  if (read.status === "too_large") return { ok: false, response: securityError({ error: "PAYLOAD_TOO_LARGE" }, 413) };
  if (read.status === "invalid") return { ok: false, response: erpFailure(new ErpError(400, "INVALID_REQUEST")) };
  return { ok: true, value: read.value };
}

/** Strict parse. A failure never echoes which field was wrong to an attacker. */
export function parseWith<T>(schema: ZodType<T>, value: unknown): { ok: true; data: T } | { ok: false; response: NextResponse } {
  const parsed = schema.safeParse(value);
  if (!parsed.success) return { ok: false, response: erpFailure(new ErpError(400, "INVALID_REQUEST")) };
  return { ok: true, data: parsed.data };
}

/** The canonical Idempotency-Key of this request (trimmed once, here, at the boundary). */
export function idempotencyKeyOf(req: Request): string | null {
  return canonicalIdempotencyKey(req.headers.get(IDEMPOTENCY_HEADER));
}

export function ctxFor(scope: ErpScope, req: Request, idempotencyKey?: string | null): ErpCtx {
  return {
    scope,
    correlationId: resolveRequestId(req),
    idempotencyKey: idempotencyKey ?? null,
  };
}

/** A successful JSON response with the same no-store policy as failures. */
export function ok(body: object, status = 200): NextResponse {
  return securityError(body as Record<string, unknown>, status);
}

/** A successful write with no body. Same no-store policy as every other ERP response. */
export function noContent(): NextResponse {
  return new NextResponse(null, { status: 204, headers: { "Cache-Control": "no-store" } });
}

/** Replay responses are marked so a client can tell them apart from first writes. */
export function outcomeResponse<T>(outcome: { kind: "created" | "replayed"; value: T | null }, body: (v: T) => object): NextResponse {
  if (outcome.kind === "created") return ok(body(outcome.value as T), 201);
  if (outcome.value === null) return erpFailure(new ErpError(404, "NOT_FOUND"));
  return securityError(body(outcome.value) as Record<string, unknown>, 200, { "Idempotent-Replayed": "true" });
}
