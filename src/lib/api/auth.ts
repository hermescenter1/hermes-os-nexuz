/**
 * API Platform authentication middleware (Phase 33).
 *
 * Supports two auth methods:
 *   1. API key  — "Authorization: Bearer hk_..." or "X-API-Key: hk_..."
 *   2. JWT session — "Authorization: Bearer <jwt>" (cookie or header)
 *
 * For API-key auth: orgId comes from the key record; scopes come from the key.
 * For JWT auth:    orgId resolved from the user's first org membership (same as
 *                  billing context); scopes treated as ["admin"] (full access —
 *                  org-level RBAC gates permissions separately).
 *
 * Metering (writing UsageRecord) happens ONLY for API-key-authenticated calls.
 * JWT session calls to platform routes are not metered.
 */

import type { NextRequest }    from "next/server";
import { verifyAccessToken }   from "@/lib/auth/jwt";
import { ACCESS_TOKEN_COOKIE } from "@/lib/auth/config";
import { getPrisma }           from "@/lib/db/prisma";
import { verifyApiKey, touchLastUsed } from "./keys";
import { API_KEY_PREFIX }      from "./types";
import type { PlatformActorContext } from "./types";

type MemberModel = { findFirst: (a: unknown) => Promise<Record<string, unknown> | null> };

function extractBearerToken(req: NextRequest): string | null {
  const auth = req.headers.get("Authorization");
  if (auth?.startsWith("Bearer ")) return auth.slice(7).trim();
  return null;
}

function extractApiKeyHeader(req: NextRequest): string | null {
  return req.headers.get("X-API-Key")?.trim() ?? null;
}

/** Resolve user's first org membership — same pattern as billing context. */
async function resolveFirstOrgId(userId: string): Promise<string | null> {
  const db = await getPrisma();
  if (!db) return null;
  try {
    const m = (db as Record<string, unknown>).organizationMember as MemberModel;
    const row = await m.findFirst({
      where:   { userId, status: "ACTIVE" },
      orderBy: { createdAt: "asc" },
    });
    return row ? String(row.organizationId) : null;
  } catch { return null; }
}

async function resolveJwtContext(
  req: NextRequest,
): Promise<PlatformActorContext | null> {
  // Try cookie first, then Authorization header
  let raw = req.cookies.get(ACCESS_TOKEN_COOKIE)?.value ?? null;
  if (!raw) {
    const bearer = extractBearerToken(req);
    if (bearer && !bearer.startsWith(API_KEY_PREFIX)) raw = bearer;
  }
  if (!raw) return null;

  const payload = await verifyAccessToken(raw);
  if (!payload?.sub) return null;

  const orgId = await resolveFirstOrgId(payload.sub);
  if (!orgId) return null;

  return {
    userId:     payload.sub,
    orgId,
    authMethod: "jwt",
    scopes:     ["admin"], // JWT session = full access; org-level RBAC enforces role perms
  };
}

async function resolveApiKeyContext(
  rawKey: string,
): Promise<PlatformActorContext | null> {
  const row = await verifyApiKey(rawKey);
  if (!row) return null;

  // Throttled lastUsedAt update (fire-and-forget)
  touchLastUsed(String(row.id), row.lastUsedAt ? new Date(row.lastUsedAt as string) : null);

  return {
    userId:     null, // API keys are not linked to a specific user account
    orgId:      String(row.organizationId),
    authMethod: "apikey",
    scopes:     Array.isArray(row.scopes) ? (row.scopes as string[]) : [],
    keyId:      String(row.id),
  };
}

/**
 * Resolve platform auth context. Returns null if unauthenticated.
 * Prefer API key over JWT when both are present.
 */
export async function getPlatformContext(
  req: NextRequest,
): Promise<PlatformActorContext | null> {
  // Check for API key in X-API-Key header or Bearer token starting with "hk_"
  const apiKeyHeader = extractApiKeyHeader(req);
  if (apiKeyHeader?.startsWith(API_KEY_PREFIX)) {
    return resolveApiKeyContext(apiKeyHeader);
  }
  const bearer = extractBearerToken(req);
  if (bearer?.startsWith(API_KEY_PREFIX)) {
    return resolveApiKeyContext(bearer);
  }

  // Fall back to JWT
  return resolveJwtContext(req);
}

/** Enforce authentication, returning 401 if not authenticated. */
export async function requirePlatformAuth(
  req: NextRequest,
): Promise<{ ctx: PlatformActorContext } | { error: string; status: number }> {
  const ctx = await getPlatformContext(req);
  if (!ctx) return { error: "Authentication required", status: 401 };
  return { ctx };
}
