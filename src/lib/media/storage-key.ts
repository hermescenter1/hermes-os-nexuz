/**
 * PHASE 102 — the tenancy a storage key CARRIES, as pure string algebra.
 *
 * WHY THIS IS ITS OWN MODULE
 * --------------------------
 * `storage.ts` owns byte persistence: it imports the object-storage seam, the
 * local storage directory and the secure-read primitive, so importing it drags
 * the filesystem in. `byte-serving-auth.ts` must decide authorization BEFORE any
 * storage or filesystem access — an invariant
 * `scripts/__tests__/phase99-tenant-guard-recognition.test.ts` enforces by
 * forbidding that module from importing the storage layer at all.
 *
 * The tenancy question — "does this key belong to the organization and asset
 * this request authorized?" — is not a storage question. It is a comparison of
 * two strings, and it belongs on the authorization side of that line. Splitting
 * it out is what lets the auth chain answer it without importing a filesystem.
 *
 * Nothing here touches I/O, and nothing here may ever start to. `storage.ts`
 * re-exports these so existing callers are unaffected.
 */

import { isAllowedMediaExtension } from "./validation";

/** Top-level namespace inside the durable `documents_data` volume (ADR §7). */
export const MEDIA_KEY_PREFIX = "media";

/**
 * Identifier segments are cuids in this schema. The pattern is deliberately
 * narrower than "anything a cuid could be" so that a future id format change
 * fails a test rather than silently widening what may appear in a path.
 */
export const KEY_SEGMENT_PATTERN = /^[A-Za-z0-9_-]{1,64}$/;

/**
 * The ONLY key shape this platform will read or write:
 *   media/<organizationId>/<assetId>/<uuid-v4>.<ext>
 *
 * The filename component is a server-generated UUID — never derived from a
 * client filename (ADR §7). Anything else is refused outright, which is what
 * makes path resolution safe without a second sanitiser.
 */
const MEDIA_KEY_PATTERN =
  /^media\/[A-Za-z0-9_-]{1,64}\/[A-Za-z0-9_-]{1,64}\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.[A-Za-z0-9]{1,8}$/;

export function isMediaStorageKey(key: unknown): key is string {
  if (typeof key !== "string") return false;
  if (!MEDIA_KEY_PATTERN.test(key)) return false;
  // The extension is re-checked against the media allow-list on every read as
  // well as on mint, so a key persisted by an older or buggier writer can never
  // cause the server to hand back bytes under an extension it does not serve.
  const extension = key.slice(key.lastIndexOf(".") + 1);
  return isAllowedMediaExtension(extension);
}

/**
 * The tenancy a key CLAIMS, parsed out of its own path.
 *
 * A key is `media/<organizationId>/<assetId>/<uuid>.<ext>`, so its first two
 * segments are an assertion about who owns the bytes. Reading them back is what
 * lets a caller compare that assertion against the tenancy a request actually
 * authorized.
 */
export interface MediaStorageKeyScope {
  readonly organizationId: string;
  readonly assetId: string;
}

export function parseMediaStorageKey(key: unknown): MediaStorageKeyScope | null {
  if (!isMediaStorageKey(key)) return null;
  const [, organizationId, assetId] = key.split("/");
  return { organizationId, assetId };
}

/**
 * PHASE 102 / RELEASE BLOCKER 4 — does this key belong to this tenant and this
 * asset?
 *
 * WHY SHAPE VALIDATION WAS NOT ENOUGH
 * `isMediaStorageKey` proves a key is well-formed. It says nothing about WHOSE
 * it is. Every byte-serving route read `asset.storageKey` off a row it had
 * loaded through an org-scoped query and then served it after a shape check
 * only — so the tenant binding rested entirely on the assumption that a row's
 * key names that row's own organization and asset.
 *
 * Nothing in the database enforces that assumption. A key naming a different
 * tenant can reach a row through a legacy import, a restore, a mis-scoped
 * backfill, or any writer predating or bypassing `buildMediaStorageKey` — and
 * the result would be organization A's request being served organization B's
 * bytes with every RBAC check passing, because the ROW was legitimately
 * reachable.
 *
 * Re-deriving the tenancy FROM THE KEY and requiring it to equal the authorized
 * one closes that. Both segments must match. It fails closed on a malformed,
 * absent or non-string key, so it is safe as the only key check on a read path.
 *
 * Traversal and symlink escape remain the storage seam's job (`sanitizeKey`,
 * then `openSecureFile` re-proving containment on the descriptor). This is the
 * tenancy layer above them, not a replacement for either.
 */
export function isStorageKeyBoundTo(key: unknown, scope: MediaStorageKeyScope): boolean {
  const claimed = parseMediaStorageKey(key);
  if (claimed === null) return false;
  return claimed.organizationId === scope.organizationId && claimed.assetId === scope.assetId;
}
