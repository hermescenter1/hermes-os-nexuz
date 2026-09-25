/**
 * ATS-M1 — HTTP helpers shared by the position and settings routes.
 *
 * Each route still calls `requireAtsActor(req, <capability>)` itself, FIRST,
 * before any body is read (so the Phase 99 route inventory sees the guard, and
 * an anonymous caller gets the same 401 on every route). These helpers do what
 * comes after:
 *
 *   * `mutationPreconditions` — the repository's CSRF rule for a cookie session
 *     (`requireTrustedOrigin(req, "jwt")`: an exact allowed Origin, or 403) and
 *     the mandatory `Idempotency-Key`. The tenant precondition header
 *     (`x-hermes-organization`) was already enforced by `resolveOrgContext`
 *     inside `requireAtsActor` — a write without it is a 428 before this runs.
 *   * `mutationResponse` — maps a service refusal to a status and a STABLE
 *     body: `{ error, code, correlationId, …detail }`. The message is generic;
 *     no stack, no SQL, no other tenant's existence (NOT_FOUND is one answer
 *     for "does not exist" and "not yours").
 */

import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { requireTrustedOrigin } from "@/lib/security/request-guards";
import { resolveRequestId, REQUEST_ID_HEADER } from "@/lib/logger/correlation";
import type { PositionErrorCode } from "./contract";
import type { MutationResult } from "./mutation";
import { readIdempotencyKey } from "./idempotency";

const NO_STORE = { "Cache-Control": "no-store" } as const;

export function correlationOf(req: NextRequest): string {
  return resolveRequestId(req);
}

function headers(correlationId: string, extra?: Record<string, string>) {
  return { ...NO_STORE, [REQUEST_ID_HEADER]: correlationId, ...extra };
}

const MESSAGE: Record<PositionErrorCode, string> = {
  INVALID_INPUT: "The request is invalid.",
  IDEMPOTENCY_KEY_REQUIRED: "An Idempotency-Key header is required.",
  IDEMPOTENCY_KEY_REUSED: "This Idempotency-Key was already used for a different request.",
  IDEMPOTENCY_IN_PROGRESS: "The same request is still being processed.",
  NOT_FOUND: "Not found.",
  STALE: "The record changed since it was loaded. Reload and try again.",
  INVALID_TRANSITION: "This action is not allowed in the current state.",
  NOT_READY: "The position is not complete enough to be opened.",
  PROTECTED_TERM: "Criteria must not refer to protected characteristics.",
  REASON_REQUIRED: "A written reason is required for this action.",
  FORBIDDEN: "You do not have permission for this action.",
  CONFLICT: "A conflicting record already exists.",
  LINKED_COUNT_CHANGED: "The number of linked applications changed. Review it and confirm again.",
  HIRING_OWNER_INVALID: "The hiring owner must be an active member of this organization.",
  STORE_UNAVAILABLE: "The service is temporarily unavailable.",
  WRITE_FAILED: "The request could not be completed.",
};

const STATUS: Record<PositionErrorCode, number> = {
  INVALID_INPUT: 400,
  IDEMPOTENCY_KEY_REQUIRED: 400,
  REASON_REQUIRED: 400,
  IDEMPOTENCY_KEY_REUSED: 422,
  PROTECTED_TERM: 422,
  NOT_READY: 422,
  HIRING_OWNER_INVALID: 422,
  IDEMPOTENCY_IN_PROGRESS: 409,
  STALE: 409,
  INVALID_TRANSITION: 409,
  CONFLICT: 409,
  LINKED_COUNT_CHANGED: 409,
  FORBIDDEN: 403,
  NOT_FOUND: 404,
  STORE_UNAVAILABLE: 503,
  WRITE_FAILED: 500,
};

export function refusal(code: PositionErrorCode, correlationId: string, detail?: object): NextResponse {
  return NextResponse.json(
    { error: MESSAGE[code], code, correlationId, ...(detail ?? {}) },
    { status: STATUS[code], headers: headers(correlationId) },
  );
}

export type Preconditions = { ok: true; idempotencyKey: string; correlationId: string } | { ok: false; response: NextResponse };

/** Origin (CSRF) and Idempotency-Key — call AFTER requireAtsActor, BEFORE reading the body. */
export function mutationPreconditions(req: NextRequest): Preconditions {
  const correlationId = correlationOf(req);
  const origin = requireTrustedOrigin(req, "jwt");
  if (!origin.ok) {
    return {
      ok: false,
      response: NextResponse.json(
        { error: "Cross-origin request refused.", code: "ORIGIN_NOT_ALLOWED", correlationId },
        { status: 403, headers: headers(correlationId) },
      ),
    };
  }
  const idempotencyKey = readIdempotencyKey(req);
  if (!idempotencyKey) return { ok: false, response: refusal("IDEMPOTENCY_KEY_REQUIRED", correlationId) };
  return { ok: true, idempotencyKey, correlationId };
}

export async function readJsonBody(req: NextRequest): Promise<{ ok: true; body: unknown } | { ok: false }> {
  try {
    return { ok: true, body: await req.json() };
  } catch {
    return { ok: false };
  }
}

export function mutationResponse<T extends object>(result: MutationResult<T>, correlationId: string, successStatus = 200): NextResponse {
  if (!result.ok) return refusal(result.code, correlationId, result.detail);
  return NextResponse.json(
    { ...result.result, correlationId, replayed: result.replayed },
    {
      status: result.replayed ? 200 : successStatus,
      headers: headers(correlationId, result.replayed ? { "Idempotent-Replayed": "true" } : undefined),
    },
  );
}

export function readResponse(body: object, correlationId: string): NextResponse {
  return NextResponse.json({ ...body, correlationId }, { status: 200, headers: headers(correlationId) });
}
