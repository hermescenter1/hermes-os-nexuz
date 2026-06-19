/**
 * API key CRUD service (Phase 33).
 *
 * Key format:  hk_{prefix8}_{secret54}
 *   - "hk_"      : service identifier (Hermes Key)
 *   - prefix8    : first 8 hex chars of random bytes — stored plaintext, @unique, used for lookup
 *   - secret54   : remaining 54 hex chars — NEVER stored
 *   - Full key   : 64 random hex chars after "hk_" separator (32 bytes total entropy)
 *
 * Storage:
 *   - prefix  : plaintext, indexed — enables O(1) lookup without scanning all hashes
 *   - keyHash : SHA-256(fullKey) — high-entropy token; SHA-256 is correct here,
 *               do NOT upgrade to bcrypt (see schema comment)
 *   - last4   : last 4 chars of fullKey — shown in dashboard for visual identification
 *
 * Verification (in auth.ts):
 *   1. Extract prefix from incoming key (chars 3–10 after "hk_")
 *   2. findFirst({ where: { prefix } })
 *   3. SHA-256(incoming) → crypto.timingSafeEqual vs stored hash
 */

import { createHash, randomBytes, timingSafeEqual } from "node:crypto";
import { getPrisma }                                 from "@/lib/db/prisma";
import { recordAuditEvent, API_AUDIT }               from "@/lib/audit/audit-service";
import { validateScopes }                            from "./scopes";
import { API_KEY_PREFIX }                            from "./types";
import type { ApiKeyRecord, ApiKeyCreatedRecord }    from "./types";

type KeyModel = {
  findMany:  (a: unknown) => Promise<Record<string, unknown>[]>;
  findFirst: (a: unknown) => Promise<Record<string, unknown> | null>;
  create:    (a: unknown) => Promise<Record<string, unknown>>;
  update:    (a: unknown) => Promise<Record<string, unknown>>;
};

async function model(): Promise<KeyModel | null> {
  const db = await getPrisma();
  return db ? ((db as Record<string, unknown>).apiKey as KeyModel) : null;
}

function rowToKey(r: Record<string, unknown>): ApiKeyRecord {
  return {
    id:             String(r.id),
    organizationId: String(r.organizationId),
    name:           String(r.name),
    prefix:         String(r.prefix),
    last4:          String(r.last4),
    scopes:         Array.isArray(r.scopes) ? (r.scopes as string[]) : [],
    lastUsedAt:     r.lastUsedAt  ? new Date(r.lastUsedAt  as string).toISOString() : null,
    expiresAt:      r.expiresAt   ? new Date(r.expiresAt   as string).toISOString() : null,
    createdById:    r.createdById ? String(r.createdById)  : null,
    revokedAt:      r.revokedAt   ? new Date(r.revokedAt   as string).toISOString() : null,
    revokedById:    r.revokedById ? String(r.revokedById)  : null,
    createdAt:      new Date(r.createdAt as string).toISOString(),
    updatedAt:      new Date(r.updatedAt as string).toISOString(),
  };
}

export function generateRawKey(): { rawKey: string; prefix: string; keyHash: string; last4: string } {
  const raw    = randomBytes(32).toString("hex"); // 64 hex chars
  const prefix = raw.slice(0, 8);
  const rawKey = `${API_KEY_PREFIX}${raw}`;
  const keyHash = createHash("sha256").update(rawKey).digest("hex");
  const last4  = rawKey.slice(-4);
  return { rawKey, prefix, keyHash, last4 };
}

export function hashKey(rawKey: string): string {
  return createHash("sha256").update(rawKey).digest("hex");
}

export function timingSafeCompare(a: string, b: string): boolean {
  try {
    const aBuf = Buffer.from(a, "hex");
    const bBuf = Buffer.from(b, "hex");
    if (aBuf.length !== bBuf.length) return false;
    return timingSafeEqual(aBuf, bBuf);
  } catch {
    return false;
  }
}

/** List all (non-revoked by default) API keys for an org. */
export async function listApiKeys(
  orgId: string,
  includeRevoked = false,
): Promise<ApiKeyRecord[]> {
  const m = await model();
  if (!m) return [];
  try {
    const where: Record<string, unknown> = { organizationId: orgId };
    if (!includeRevoked) where.revokedAt = null;
    const rows = await m.findMany({ where, orderBy: { createdAt: "desc" } });
    return rows.map(rowToKey);
  } catch { return []; }
}

export interface CreateApiKeyInput {
  organizationId: string;
  name:           string;
  scopes:         string[];
  expiresAt?:     Date;
  createdById?:   string;
}

/** Create a new API key. Returns the record including rawKey (shown once). */
export async function createApiKey(
  input: CreateApiKeyInput,
): Promise<{ ok: true; key: ApiKeyCreatedRecord } | { ok: false; error: string }> {
  const m = await model();
  if (!m) return { ok: false, error: "Database unavailable" };

  const name = input.name.trim();
  if (name.length < 2) return { ok: false, error: "Key name must be at least 2 characters" };

  const sv = validateScopes(input.scopes);
  if (!sv.ok) return { ok: false, error: sv.error };

  const { rawKey, prefix, keyHash, last4 } = generateRawKey();

  try {
    const row = await m.create({
      data: {
        organizationId: input.organizationId,
        name,
        keyHash,
        prefix,
        last4,
        scopes:      sv.scopes,
        expiresAt:   input.expiresAt ?? null,
        createdById: input.createdById ?? null,
        createdAt:   new Date(),
        updatedAt:   new Date(),
      },
    });

    await recordAuditEvent({
      userId:     input.createdById,
      action:     API_AUDIT.KEY_CREATED,
      entityType: "ApiKey",
      entityId:   String(row.id),
      metadata:   { orgId: input.organizationId, name, scopes: sv.scopes },
    });

    return { ok: true, key: { ...rowToKey(row), rawKey } };
  } catch (err) {
    return { ok: false, error: String(err) };
  }
}

export interface RevokeApiKeyInput {
  keyId:        string;
  organizationId: string;
  revokedById?: string;
}

/** Revoke an API key. Idempotent — revoking an already-revoked key is a no-op. */
export async function revokeApiKey(
  input: RevokeApiKeyInput,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const m = await model();
  if (!m) return { ok: false, error: "Database unavailable" };

  const row = await m.findFirst({
    where: { id: input.keyId, organizationId: input.organizationId },
  });
  if (!row) return { ok: false, error: "API key not found" };
  if (row.revokedAt) return { ok: true }; // already revoked

  await m.update({
    where: { id: input.keyId },
    data:  { revokedAt: new Date(), revokedById: input.revokedById ?? null, updatedAt: new Date() },
  });

  await recordAuditEvent({
    userId:     input.revokedById,
    action:     API_AUDIT.KEY_REVOKED,
    entityType: "ApiKey",
    entityId:   input.keyId,
    metadata:   { orgId: input.organizationId, name: String(row.name) },
  });

  return { ok: true };
}

export interface RotateApiKeyInput {
  keyId:          string;
  organizationId: string;
  actorUserId?:   string;
}

/**
 * Rotate an API key: create a replacement key with the same name + scopes,
 * then revoke the old key. Both operations succeed or the caller sees the error.
 * The new raw key is returned once — it cannot be recovered after this call.
 */
export async function rotateApiKey(
  input: RotateApiKeyInput,
): Promise<{ ok: true; key: ApiKeyCreatedRecord; revokedKeyId: string } | { ok: false; error: string }> {
  const m = await model();
  if (!m) return { ok: false, error: "Database unavailable" };

  const old = await m.findFirst({
    where: { id: input.keyId, organizationId: input.organizationId },
  });
  if (!old)        return { ok: false, error: "API key not found" };
  if (old.revokedAt) return { ok: false, error: "Cannot rotate a revoked key" };

  const oldScopes = Array.isArray(old.scopes) ? (old.scopes as string[]) : [];

  // Create replacement
  const createResult = await createApiKey({
    organizationId: input.organizationId,
    name:           `${String(old.name)} (rotated)`,
    scopes:         oldScopes,
    createdById:    input.actorUserId,
  });
  if (!createResult.ok) return createResult;

  // Revoke old
  await m.update({
    where: { id: input.keyId },
    data:  { revokedAt: new Date(), revokedById: input.actorUserId ?? null, updatedAt: new Date() },
  });

  await recordAuditEvent({
    userId:     input.actorUserId,
    action:     API_AUDIT.KEY_ROTATED,
    entityType: "ApiKey",
    entityId:   createResult.key.id,
    metadata:   { orgId: input.organizationId, oldKeyId: input.keyId, newKeyId: createResult.key.id },
  });

  return { ok: true, key: createResult.key, revokedKeyId: input.keyId };
}

/** Verify an incoming raw key string — returns the DB record or null. */
export async function verifyApiKey(rawKey: string): Promise<Record<string, unknown> | null> {
  if (!rawKey.startsWith(API_KEY_PREFIX)) return null;

  const body   = rawKey.slice(API_KEY_PREFIX.length); // 64 hex chars
  const prefix = body.slice(0, 8);

  const m = await model();
  if (!m) return null;

  try {
    const row = await m.findFirst({ where: { prefix } });
    if (!row) return null;

    const incoming = hashKey(rawKey);
    if (!timingSafeCompare(incoming, String(row.keyHash))) return null;
    if (row.revokedAt)  return null; // revoked
    if (row.expiresAt && new Date(row.expiresAt as string) < new Date()) return null; // expired

    return row;
  } catch { return null; }
}

/**
 * Throttled lastUsedAt update — only writes if last update was > 60 s ago.
 * Fire-and-forget; never throws.
 */
export function touchLastUsed(keyId: string, lastUsedAt: Date | null): void {
  const now = Date.now();
  if (lastUsedAt && (now - lastUsedAt.getTime()) < 60_000) return;

  model()
    .then((m) => m?.update({ where: { id: keyId }, data: { lastUsedAt: new Date(), updatedAt: new Date() } }))
    .catch(() => undefined);
}
