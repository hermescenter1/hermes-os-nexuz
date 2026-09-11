/**
 * Phase 49 — Asset Alert management (read/dismiss only).
 * Creation is handled exclusively by the automation engine (automation.ts).
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * PHASE 109-C-UI.2-R1 — SITE SCOPE (finding F-02)
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * Every function here used to be ORGANISATION-scoped and nothing more, so a
 * member holding a UserSite grant for site A received — and could dismiss —
 * alerts belonging to site B of the same organisation.
 *
 * The reason it was written that way is structural, and it is worth stating
 * plainly because it constrains the fix: `AssetAlert` has no `siteId` column
 * and no `asset` relation. Its only relation is to `Organization`. There is
 * therefore NO predicate on AssetAlert alone that can express "this site".
 *
 * The site lives on `IndustrialAsset` (`siteId`, FK to IndustrialSite, indexed).
 * So the boundary is enforced in two steps, BOTH in the database:
 *
 *   1. resolve the assets of the permitted sites, inside the same organisation;
 *   2. constrain the alert query with `assetId IN (those ids)`.
 *
 * This matters more than it may look. Filtering the rows after the query would
 * have left `take: 200`, `total` and any future pagination counting another
 * site's records — the caller would see a short list and a wrong number rather
 * than a leak, which is harder to notice and just as wrong.
 *
 * CONTRACT of `allowedSiteIds`, identical to `listAssets` (Phase 99.5,
 * P99-INT-014) so the two cannot drift apart:
 *
 *   undefined  no site narrowing. Reserved for organisation-level credentials
 *              (API keys), which have no user and therefore no UserSite rows.
 *              Callers acting for a USER must always pass an array.
 *   []         no accessible site → no rows. Fail-closed, never widened.
 *   [ids]      the permitted set. A requested `siteId` NARROWS this set and can
 *              never replace it.
 */

import { getPrisma } from "@/lib/db/prisma";

export type AlertType     = "CRITICAL_RISK" | "HEALTH_DEGRADATION" | "COMMUNICATION_FAILURE" | "KNOWLEDGE_COVERAGE_LOW";
export type AlertSeverity = "CRITICAL" | "HIGH" | "MEDIUM" | "LOW";

export interface AssetAlertRecord {
  id:             string;
  organizationId: string;
  assetId:        string;
  alertType:      AlertType;
  severity:       AlertSeverity;
  title:          string;
  description:    string;
  metadata:       Record<string, unknown>;
  dismissed:      boolean;
  dismissedAt:    string | null;
  dismissedBy:    string | null;
  resolvedAt:     string | null;
  createdAt:      string;
  updatedAt:      string;
}

type FM = { findMany:  (a: unknown) => Promise<Record<string, unknown>[]> };
type FF = { findFirst: (a: unknown) => Promise<Record<string, unknown> | null> };
type FU = { update:    (a: unknown) => Promise<Record<string, unknown>> };
type Db = Record<string, FM | FF | FU>;

/** Site scope, accepted identically by every function in this module. */
export interface SiteScope {
  /** See the module header. `undefined` means "organisation credential". */
  allowedSiteIds?: string[];
}

/**
 * The site predicate, as an `assetId IN (...)` clause — or `null` when the
 * caller can see nothing.
 *
 * `organizationId` is applied HERE as well as on the alert query. A site id
 * belonging to another organisation therefore resolves to zero assets and the
 * caller gets nothing, rather than relying on the alert query to catch it.
 */
async function assetIdsForSites(
  r: Db,
  organizationId: string,
  siteIds: string[],
): Promise<string[] | null> {
  if (siteIds.length === 0) return null;
  const assets = await (r.industrialAsset as FM).findMany({
    where:  { organizationId, siteId: { in: siteIds } },
    select: { id: true },
  });
  if (assets.length === 0) return null;
  return assets.map((a) => String(a.id));
}

/**
 * True when `assetId` belongs to the organisation AND to one of the permitted
 * sites. This is the asset-to-site validation: an alert is only reachable
 * through an asset the caller may actually see.
 */
async function assetIsInScope(
  r: Db,
  assetId: string,
  organizationId: string,
  allowedSiteIds: string[],
): Promise<boolean> {
  if (allowedSiteIds.length === 0) return false;
  const asset = await (r.industrialAsset as FF).findFirst({
    where:  { id: assetId, organizationId, siteId: { in: allowedSiteIds } },
    select: { id: true },
  });
  return asset !== null;
}

function row(r: Record<string, unknown>): AssetAlertRecord {
  return {
    id:             r.id             as string,
    organizationId: r.organizationId as string,
    assetId:        r.assetId        as string,
    alertType:      r.alertType      as AlertType,
    severity:       r.severity       as AlertSeverity,
    title:          r.title          as string,
    description:    r.description    as string,
    metadata:       (r.metadata       ?? {}) as Record<string, unknown>,
    dismissed:      r.dismissed       as boolean,
    dismissedAt:    r.dismissedAt ? new Date(r.dismissedAt as string).toISOString() : null,
    dismissedBy:    (r.dismissedBy    ?? null) as string | null,
    resolvedAt:     r.resolvedAt ? new Date(r.resolvedAt as string).toISOString() : null,
    createdAt:      new Date(r.createdAt as string).toISOString(),
    updatedAt:      new Date(r.updatedAt as string).toISOString(),
  };
}

export async function getAssetAlerts(
  assetId:        string,
  organizationId: string,
  opts?: { includeDismissed?: boolean } & SiteScope
): Promise<AssetAlertRecord[]> {
  const db = await getPrisma();
  if (!db) return [];
  const r = db as unknown as Db;

  // F-02: the asset id arrives from the URL. Knowing it is not a permission —
  // without this check, `/api/industrial/assets/<asset in site B>/alerts`
  // returned site B's alerts to a caller holding only a site A grant.
  if (opts?.allowedSiteIds !== undefined) {
    if (!(await assetIsInScope(r, assetId, organizationId, opts.allowedSiteIds))) return [];
  }

  const where: Record<string, unknown> = { assetId, organizationId };
  if (!opts?.includeDismissed) where.dismissed = false;
  const rows = await (r.assetAlert as FM).findMany({
    where,
    orderBy: { createdAt: "desc" },
  });
  return rows.map(row);
}

export async function getOrgAlerts(
  organizationId: string,
  opts?: {
    includeDismissed?: boolean;
    alertType?: AlertType;
    /** Narrows within `allowedSiteIds`. It can never widen them. */
    siteId?: string;
  } & SiteScope
): Promise<AssetAlertRecord[]> {
  // Fail closed before touching the database: no accessible site, no rows.
  if (opts?.allowedSiteIds !== undefined && opts.allowedSiteIds.length === 0) return [];

  const db = await getPrisma();
  if (!db) return [];
  const r = db as unknown as Db;
  const where: Record<string, unknown> = { organizationId };
  if (!opts?.includeDismissed) where.dismissed = false;
  if (opts?.alertType) where.alertType = opts.alertType;

  if (opts?.allowedSiteIds !== undefined) {
    // A requested site NARROWS the permitted set. Asking for a site outside it
    // is not an error to be corrected into "all your sites" — it is a request
    // for nothing.
    //
    // The test is `!== undefined`, NOT truthiness. `?siteId=` arrives as the
    // empty string: present, and naming no site. Under a truthiness test that
    // silently became "no narrowing at all", so `?siteId=` returned every site
    // the caller could see while `?siteId=%20` returned none — the same
    // parameter answering two different questions depending on how empty it was.
    // A parameter that is there names a site, and the empty string is not one.
    if (opts.siteId !== undefined && !opts.allowedSiteIds.includes(opts.siteId)) return [];
    const siteIds = opts.siteId !== undefined ? [opts.siteId] : opts.allowedSiteIds;
    const assetIds = await assetIdsForSites(r, organizationId, siteIds);
    if (assetIds === null) return [];
    // The site predicate. Applied in the QUERY, so `take` below counts only
    // rows this caller is entitled to.
    where.assetId = { in: assetIds };
  } else if (opts?.siteId !== undefined) {
    // No allow-list to narrow (organisation credential): the requested site
    // still has to belong to this organisation. Same rule as above — a present
    // but empty parameter names no site and resolves to no assets.
    const assetIds = await assetIdsForSites(r, organizationId, [opts.siteId]);
    if (assetIds === null) return [];
    where.assetId = { in: assetIds };
  }
  const rows = await (r.assetAlert as FM).findMany({
    where,
    orderBy: { createdAt: "desc" },
    take: 200,
  });
  return rows.map(row);
}

export async function dismissAlert(
  alertId:        string,
  organizationId: string,
  dismissedBy?:   string,
  opts?:          SiteScope
): Promise<AssetAlertRecord | null> {
  const db = await getPrisma();
  if (!db) return null;
  const r = db as unknown as Db;

  const existing = await (r.assetAlert as FF).findFirst({
    where: { id: alertId, organizationId },
  });
  if (!existing) return null;

  // F-02 on the WRITE path, which is the one that mattered most: an alert id is
  // guessable-by-listing and this is a mutation. A caller with a site A grant
  // could dismiss site B's alert — silencing an alarm on equipment they have no
  // access to. The refusal returns `null`, the same value as "no such alert",
  // so the route answers 404 and the record's existence is never disclosed.
  if (opts?.allowedSiteIds !== undefined) {
    const inScope = await assetIsInScope(
      r,
      String(existing.assetId),
      organizationId,
      opts.allowedSiteIds,
    );
    if (!inScope) return null;
  }

  const updated = await (r.assetAlert as FU).update({
    where: { id: alertId },
    data: {
      dismissed:   true,
      dismissedAt: new Date(),
      dismissedBy: dismissedBy ?? null,
    },
  });
  return row(updated);
}
