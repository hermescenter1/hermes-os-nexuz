/**
 * Row locks that make a scope-dependent write atomic with its authorisation (independent review S2-01).
 *
 * THE RACE. A writer validates "this asset stands on a site I may write, and that site is ACTIVE", then
 * writes. Between the two, another transaction can move the asset to another site or deactivate the
 * site; READ COMMITTED does not stop that, so the write lands in a scope the actor never had. A pinned
 * WHERE on the written row cannot catch it either, because the row itself did not change.
 *
 * THE PRIMITIVE. Inside the writing transaction, every row whose value decides the authorisation is
 * read with `FOR SHARE` and validated AFTER the lock is held:
 *
 *   - a concurrent writer that already holds the row (it moved the asset / deactivated the site) makes
 *     this read WAIT; when it commits, PostgreSQL re-evaluates the row and this read sees the NEW
 *     value (or no row at all, when a predicate such as `status = 'ACTIVE'` no longer holds), so the
 *     decision is taken on the committed state; when it rolls back, the old value stands;
 *   - a writer that comes later waits for this transaction, so the decision cannot be invalidated
 *     before the dependent write commits.
 *
 * LOCK ORDER (deadlock avoidance) — every caller takes them in this order, each set sorted by id:
 *   1. the written row itself (`FOR UPDATE`, taken by the caller), 2. assets, 3. sites, 4. other
 *   organisation-owned references (e.g. failure modes). A writer that moves an asset touches the asset
 *   and only KEY-SHARE-locks the target site (foreign key check), which does not conflict with
 *   `FOR SHARE`; a writer that deactivates a site touches only the site row.
 *
 * Every statement is parameterised; nothing is concatenated into the SQL text.
 */

export type LockRow = Record<string, unknown>;

/** The part of a transaction client this module needs. */
export interface LockingTx {
  $queryRaw: (strings: TemplateStringsArray, ...values: unknown[]) => Promise<LockRow[]>;
}

const ids = (values: readonly string[]): string[] =>
  Array.from(new Set(values.filter((v) => typeof v === "string" && v.length > 0))).sort();

/**
 * Locks the given assets of `organizationId` (`FOR SHARE`, ordered by id) and returns each one's CURRENT
 * site. An asset that does not exist in this organisation is simply absent from the map.
 */
export async function lockAssetsForWrite(
  tx: LockingTx,
  organizationId: string,
  assetIds: readonly string[],
): Promise<Map<string, string>> {
  const wanted = ids(assetIds);
  if (wanted.length === 0) return new Map();
  const rows = await tx.$queryRaw`
    SELECT a."id" AS "id", a."siteId" AS "siteId"
    FROM "IndustrialAsset" a
    WHERE a."organizationId" = ${organizationId}
      AND a."id" = ANY(${wanted}::text[])
    ORDER BY a."id"
    FOR SHARE
  `;
  return new Map(rows.map((r) => [String(r.id), String(r.siteId)]));
}

/**
 * Locks the given sites of `organizationId` (`FOR SHARE`, ordered by id) and returns the ones that are
 * ACTIVE at lock time. A site that is foreign, unknown or inactive is absent from the result.
 */
export async function lockActiveSitesForWrite(
  tx: LockingTx,
  organizationId: string,
  siteIds: readonly string[],
): Promise<Set<string>> {
  const wanted = ids(siteIds);
  if (wanted.length === 0) return new Set();
  const rows = await tx.$queryRaw`
    SELECT s."id" AS "id"
    FROM "IndustrialSite" s
    WHERE s."organizationId" = ${organizationId}
      AND s."id" = ANY(${wanted}::text[])
      AND s."status" = 'ACTIVE'
    ORDER BY s."id"
    FOR SHARE
  `;
  return new Set(rows.map((r) => String(r.id)));
}

/** True only if EVERY given site is ACTIVE in `organizationId` (locked until the transaction ends). */
export async function allSitesActiveForWrite(
  tx: LockingTx,
  organizationId: string,
  siteIds: readonly string[],
): Promise<boolean> {
  const wanted = ids(siteIds);
  if (wanted.length === 0) return false;
  const active = await lockActiveSitesForWrite(tx, organizationId, wanted);
  return wanted.every((s) => active.has(s));
}
