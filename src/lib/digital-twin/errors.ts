/**
 * Digital Twin error contract — Slice 1.
 *
 * Every refusal a caller can provoke is a `TwinDomainError` with a stable
 * `code` and an HTTP status. Everything else is mapped here, in ONE place, so
 * that:
 *   - a Prisma/driver error never reaches a response body (no constraint names,
 *     no table names, no foreign identifiers — the message of a P2003/P2002
 *     names the constraint that fired, which is itself an existence oracle);
 *   - the same condition always yields the same status across the eight routes.
 *
 * Response body shape: `{ error: string, code: string }`. `error` stays a plain
 * string, as before; `code` is additive.
 *
 * DISCLOSURE RULE — "does not exist", "belongs to another organisation" and
 * "is at a site you may not see" are the SAME refusal (404 + the same message).
 * Nothing in this module may be used to tell them apart.
 */

import { NextResponse } from "next/server";
import { logInfraFailure } from "@/lib/logger/security-events";
import type { ContextRefusal } from "@/lib/auth/context-result";

/**
 * A platform refusal (`requirePlatformAuth`) carries its own machine-readable code
 * — AUTHENTICATION_REQUIRED, ORGANIZATION_SELECTION_REQUIRED, … — that the UI
 * branches on. Those codes belong to the platform's vocabulary, not the twin's, so
 * they are re-used verbatim (the official `ContextRefusal` type) instead of being
 * translated.
 */
export type TwinResponseCode = TwinErrorCode | ContextRefusal;

export type TwinErrorCode =
  /** A refusal from an official guard that supplied neither a code nor a 401/403 status. */
  | "REQUEST_REFUSED"
  | "VALIDATION_FAILED"
  | "INVALID_JSON"
  | "PAYLOAD_TOO_LARGE"
  | "AUTHENTICATION_REQUIRED"
  | "FORBIDDEN"
  | "SESSION_REQUIRED"
  | "INSUFFICIENT_SITE_PERMISSION"
  | "SITE_NOT_FOUND"
  | "ASSET_NOT_FOUND"
  | "NODE_NOT_FOUND"
  | "SOURCE_NODE_NOT_FOUND"
  | "TARGET_NODE_NOT_FOUND"
  | "PARENT_NODE_NOT_FOUND"
  | "RELATION_NOT_FOUND"
  | "TAG_NOT_FOUND"
  | "SELF_RELATION"
  | "DUPLICATE_RELATION"
  | "CROSS_SITE_RELATION"
  | "HIERARCHY_CYCLE"
  | "HIERARCHY_TOO_DEEP"
  | "DUPLICATE_TAG"
  | "CONFLICT"
  | "REFERENCE_CONFLICT"
  | "STORAGE_UNAVAILABLE"
  | "INTERNAL_ERROR";

export class TwinDomainError extends Error {
  readonly code: TwinErrorCode;
  readonly status: number;

  constructor(code: TwinErrorCode, status: number, message: string) {
    super(message);
    this.name = "TwinDomainError";
    this.code = code;
    this.status = status;
  }
}

/** The not-found refusals, defined once so every call site words them identically. */
export const twinNotFound = {
  site:       () => new TwinDomainError("SITE_NOT_FOUND", 404, "Site not found"),
  asset:      () => new TwinDomainError("ASSET_NOT_FOUND", 404, "Asset not found"),
  node:       () => new TwinDomainError("NODE_NOT_FOUND", 404, "Node not found"),
  source:     () => new TwinDomainError("SOURCE_NODE_NOT_FOUND", 404, "Source node not found"),
  target:     () => new TwinDomainError("TARGET_NODE_NOT_FOUND", 404, "Target node not found"),
  parent:     () => new TwinDomainError("PARENT_NODE_NOT_FOUND", 404, "Parent node not found"),
  relation:   () => new TwinDomainError("RELATION_NOT_FOUND", 404, "Relation not found"),
  tag:        () => new TwinDomainError("TAG_NOT_FOUND", 404, "Tag not found"),
  unavailable: () =>
    new TwinDomainError("STORAGE_UNAVAILABLE", 503, "Digital Twin storage is unavailable"),
};

const UNIQUE_CODES = new Set(["P2002", "23505"]);
const FK_CODES = new Set(["P2003", "23503"]);

/**
 * The code of a database error, whichever layer produced it. Prisma raises
 * `P2xxx`; the pg driver adapter can surface the raw SQLSTATE on `cause`.
 */
export function dbErrorCode(err: unknown): string | undefined {
  if (typeof err !== "object" || err === null) return undefined;
  const e = err as { code?: unknown; cause?: unknown };
  if (typeof e.code === "string") return e.code;
  if (typeof e.cause === "object" && e.cause !== null) {
    const c = (e.cause as { code?: unknown }).code;
    if (typeof c === "string") return c;
  }
  return undefined;
}

export const isUniqueViolation = (err: unknown): boolean => UNIQUE_CODES.has(dbErrorCode(err) ?? "");
export const isForeignKeyViolation = (err: unknown): boolean => FK_CODES.has(dbErrorCode(err) ?? "");

export interface TwinErrorBody {
  error: string;
  code: TwinResponseCode;
}

export function describeTwinError(
  err: unknown,
  operation: string,
): { status: number; body: TwinErrorBody } {
  if (err instanceof TwinDomainError) {
    return { status: err.status, body: { error: err.message, code: err.code } };
  }
  // A constraint that fired AFTER the service's own checks (a concurrent
  // writer, or a row the checks cannot see). The caller learns only that the
  // request conflicts — never which constraint, table, or foreign id.
  if (isUniqueViolation(err)) {
    return { status: 409, body: { error: "Resource already exists", code: "CONFLICT" } };
  }
  if (isForeignKeyViolation(err)) {
    return {
      status: 409,
      body: { error: "A referenced resource is not available", code: "REFERENCE_CONFLICT" },
    };
  }
  // Unexpected. Recorded server-side (class + message, never the payload);
  // the response carries nothing from the error.
  logInfraFailure("database", `digital-twin.${operation}`, err);
  return { status: 500, body: { error: "Internal server error", code: "INTERNAL_ERROR" } };
}

export function twinErrorResponse(err: unknown, operation: string): NextResponse {
  const { status, body } = describeTwinError(err, operation);
  return NextResponse.json(body, { status });
}

export function twinJsonError(status: number, code: TwinResponseCode, error: string): NextResponse {
  return NextResponse.json({ error, code } satisfies TwinErrorBody, { status });
}
