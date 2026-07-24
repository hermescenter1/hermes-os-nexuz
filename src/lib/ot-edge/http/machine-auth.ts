// PHASE 94B4.1 — the HTTP surface of machine authentication.
//
// The decision itself lives in `../machine-context`, which knows nothing about
// HTTP. This file owns only how a decision becomes a response, and it exists so
// that one rule can be enforced in exactly one place: EVERY authentication
// failure looks identical from outside.

import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

/** The header carrying the machine's opaque ingestion handle. */
export const INGESTION_HEADER = "x-hermes-ingestion-id";

const PRIVATE = {
  "Cache-Control": "no-store, max-age=0",
  "Content-Type": "application/json",
} as const;

/**
 * The single external failure shape.
 *
 * An unknown gateway, a disabled gateway, a wrong key reference, a bad MAC, a
 * mismatched checksum and a missing capability are all answered identically, so
 * the endpoint cannot be used to enumerate gateways or probe configuration. The
 * internal rejection reason is recorded in the audit trail instead.
 */
export function machineAuthFailure(): NextResponse {
  return NextResponse.json(
    { ok: false, code: "GATEWAY_AUTH_FAILED", message: "Gateway authentication failed." },
    { status: 401, headers: PRIVATE },
  );
}

/** Retry-After reflects the limiter's real window rather than a constant. */
export function machineRateLimited(windowSeconds: number): NextResponse {
  return NextResponse.json(
    { ok: false, code: "RATE_LIMITED", message: "Too many requests. Please retry shortly." },
    { status: 429, headers: { ...PRIVATE, "Retry-After": String(windowSeconds) } },
  );
}

/** Read the machine's ingestion handle. Never logged, never echoed. */
export function readIngestionHeader(req: NextRequest): string | null {
  const raw = req.headers.get(INGESTION_HEADER);
  return raw && raw.trim() ? raw.trim() : null;
}

/**
 * The trusted client address for the pre-authentication limiter.
 *
 * X-Real-IP only: nginx overwrites it with the true peer address, so it cannot
 * be spoofed, whereas a left-most X-Forwarded-For entry can be. Falling back to
 * a constant means unattributable traffic shares one bucket, which throttles it
 * rather than exempting it.
 */
export function machineClientKey(req: NextRequest): string {
  return req.headers.get("x-real-ip")?.trim() || "unknown";
}
