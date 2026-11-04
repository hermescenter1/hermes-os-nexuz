/**
 * Industrial Knowledge Graph — visibility policy (RV-01).
 *
 * WHY THIS EXISTS. The graph is a materialised cache: `IndustrialKnowledgeGraphNode`
 * / `Edge` store `organizationId` and nothing about sites. Phase 43 filtered only
 * `ASSET` nodes and treated every other node type as "org-level knowledge", which let
 * a member of one site (or of no site) read another site's telemetry tags (`tagPath`),
 * Digital Twin nodes, risk scores and engineering cases, and let traversals walk through
 * nodes the caller may not see.
 *
 * THE MODEL (deny by default, one place):
 *   1. A {@link GraphViewerScope} is the ONLY thing a query may be run with. It is built
 *      server side from the authenticated user + active organisation and carries the sites
 *      that user may access. There is no org-wide query path any more.
 *   2. A node is visible only if its OWNER, resolved against the LIVE source tables (never
 *      the cache), lies inside the scope — see {@link NODE_POLICY}. A node whose owner cannot
 *      be resolved (deleted source, broken relation, unknown type) is invisible to everyone.
 *   3. An edge is visible only if BOTH endpoints are visible, its type is known, and — for the
 *      edge types that are derived from another record — that provenance is itself visible.
 *   4. The visible subgraph is computed FIRST; BFS / Dijkstra / counts / explanations only ever
 *      see it, so a traversal cannot pass through a hidden node.
 *
 * SITE OWNERSHIP BY NODE TYPE (derived from prisma/schema.prisma, not guessed):
 *   ASSET              IndustrialAsset.siteId                      (direct)
 *   TELEMETRY_TAG      AssetTag.assetId -> IndustrialAsset.siteId  (via the asset)
 *   DIGITAL_TWIN_NODE  DigitalTwinNode.siteId                      (direct; its asset, if any, must be visible too)
 *   PREDICTIVE_RISK    AssetRiskScore.assetId -> IndustrialAsset.siteId (via the asset)
 *   ENGINEERING_CASE   siteId and/or assetId, decided by ONE policy shared with the knowledge routes
 *                      (../knowledge/case-visibility.ts); BOTH null = organisation-level, visible
 *                      to OWNER/ADMIN only
 *   FAILURE_MODE / ROOT_CAUSE / PROCEDURE   no site column exists: an explicit ORG_CATALOG class
 *
 * `null` is never "public": the only organisation-level nodes are the closed ORG_CATALOG set
 * (failure modes, root causes, procedures — the knowledge library already lists these to every
 * member with `view_knowledge`), plus a case that carries neither a site nor an asset, which only
 * OWNER/ADMIN may see.
 */

import { getPrisma } from "@/lib/db/prisma";
import { getAllowedSiteIds } from "@/lib/site/context";
import { logInfraFailure } from "@/lib/logger/security-events";
import { listVisibleCaseIds, MAX_VISIBLE_CASE_IDS } from "@/lib/knowledge/case-visibility";

// ── Scope ─────────────────────────────────────────────────────────────────────

declare const scopeBrand: unique symbol;

/**
 * The authority a graph query runs with. Only {@link createGraphViewerScope} and
 * {@link resolveGraphViewerScope} produce one, so a query cannot be handed a bare org id.
 */
export interface GraphViewerScope {
  readonly [scopeBrand]: true;
  readonly organizationId: string;
  /** Sites of THIS organisation the viewer may read. Empty = no site-scoped data at all (fail closed). */
  readonly allowedSiteIds: readonly string[];
  /**
   * OWNER/ADMIN only (the canonical all-sites roles). Gates the organisation-level records that
   * belong to no site — e.g. an engineering case with neither a site nor an asset.
   */
  readonly organizationLevelAccess: boolean;
}

export function createGraphViewerScope(
  organizationId: string,
  allowedSiteIds: readonly string[],
  organizationLevelAccess = false,
): GraphViewerScope {
  const scope = {
    organizationId,
    allowedSiteIds: Array.from(new Set(allowedSiteIds.filter((s) => typeof s === "string" && s.length > 0))),
    organizationLevelAccess,
  };
  return scope as unknown as GraphViewerScope;
}

/** The canonical all-sites roles (see site/context.ts IMPLICIT_ROLES). Anything else is site-limited. */
export function hasOrganizationLevelAccess(role: string | null | undefined): boolean {
  return role === "OWNER" || role === "ADMIN";
}

type FindMany = (args: Record<string, unknown>) => Promise<Record<string, unknown>[]>;
interface ReadModel { findMany: FindMany }
function readModel(db: Record<string, unknown>, name: string): ReadModel {
  return db[name] as ReadModel;
}

/**
 * The viewer's scope, from server-side identity ONLY (user id from the authenticated member,
 * organisation from the platform auth context). Sites are the official `getAllowedSiteIds`
 * result (OWNER/ADMIN: every ACTIVE site of the organisation; everyone else: their ACTIVE
 * `UserSite` grants) INTERSECTED with the organisation's ACTIVE sites, so a grant that names
 * another organisation's site, an unknown site or an inactive site can never widen the scope.
 * Any failure yields an empty site list.
 */
export async function resolveGraphViewerScope(
  userId: string | null | undefined,
  organizationId: string,
  /** The member's role as resolved by `requireOrgActor` (server side) — never a client value. */
  role: string | null | undefined,
): Promise<GraphViewerScope> {
  if (!userId || !organizationId) return createGraphViewerScope(organizationId, []);
  const orgLevel = hasOrganizationLevelAccess(role);
  const granted = await getAllowedSiteIds(userId, organizationId);
  if (granted.length === 0) return createGraphViewerScope(organizationId, [], orgLevel);
  const db = await getPrisma();
  if (!db) return createGraphViewerScope(organizationId, [], orgLevel);
  try {
    const rows = await readModel(db as unknown as Record<string, unknown>, "industrialSite").findMany({
      where: { organizationId, status: "ACTIVE", id: { in: granted } },
      select: { id: true },
    });
    return createGraphViewerScope(organizationId, rows.map((r) => String(r.id)), orgLevel);
  } catch (err) {
    logInfraFailure("database", "knowledge_graph.resolve_viewer_scope", err);
    return createGraphViewerScope(organizationId, [], orgLevel);
  }
}

// ── Policy tables ─────────────────────────────────────────────────────────────

/** How a node type is authorised. A type that is not listed is invisible. */
export const NODE_POLICY = {
  ASSET:             "SITE_OWNED",
  TELEMETRY_TAG:     "SITE_OWNED",
  DIGITAL_TWIN_NODE: "SITE_OWNED",
  PREDICTIVE_RISK:   "SITE_OWNED",
  ENGINEERING_CASE:  "SITE_OWNED_OR_ORG_LEVEL",
  FAILURE_MODE:      "ORG_CATALOG",
  ROOT_CAUSE:        "ORG_CATALOG",
  PROCEDURE:         "ORG_CATALOG",
} as const;

/** Edge types the policy knows how to authorise. Any other type is dropped. */
export const KNOWN_EDGE_TYPES: ReadonlySet<string> = new Set([
  "HAS_FAILURE_MODE", "CAUSED_BY", "MITIGATED_BY", "DOCUMENTED_IN", "OBSERVED_ON",
  "CONNECTED_TO", "DEPENDS_ON", "INDICATES_RISK", "RELATED_TO",
]);

// ── Visible entity sets (resolved from the LIVE source tables) ────────────────

export interface VisibleEntitySets {
  readonly assets: ReadonlySet<string>;
  readonly tags: ReadonlySet<string>;
  readonly twinNodes: ReadonlySet<string>;
  readonly risks: ReadonlySet<string>;
  readonly cases: ReadonlySet<string>;
  /** `${failureModeId}|${procedureId}` pairs that a visible asset links together (provenance of MITIGATED_BY). */
  readonly mitigations: ReadonlySet<string>;
}

const EMPTY_SETS: VisibleEntitySets = {
  assets: new Set(), tags: new Set(), twinNodes: new Set(), risks: new Set(), cases: new Set(), mitigations: new Set(),
};

const str = (v: unknown): string | null => (typeof v === "string" && v.length > 0 ? v : null);

type RawQuery = (strings: TemplateStringsArray, ...values: unknown[]) => Promise<Record<string, unknown>[]>;

function rawQuery(db: Record<string, unknown>): RawQuery {
  const raw = (db as { $queryRaw?: RawQuery }).$queryRaw;
  if (typeof raw !== "function") throw new Error("GRAPH_VISIBILITY_QUERY_UNAVAILABLE");
  return raw.bind(db) as RawQuery;
}

/**
 * Ids of the LATEST `AssetRiskScore` row of each asset on `sites` — one row per asset, selected in the
 * database (`DISTINCT ON`, newest `createdAt`, `id` ASC on a tie), so the number of rows is bounded by
 * the number of visible assets and never by the depth of the history. Every predicate (organisation,
 * site, ACTIVE site) is applied in SQL. Fully parameterised.
 */
async function loadLatestRiskIds(
  db: Record<string, unknown>,
  organizationId: string,
  sites: readonly string[],
): Promise<string[]> {
  if (sites.length === 0) return [];
  const rows = await rawQuery(db)`
    SELECT DISTINCT ON (r."assetId") r."id" AS "id"
    FROM "AssetRiskScore" r
    JOIN "IndustrialAsset" a
      ON a."id" = r."assetId" AND a."organizationId" = ${organizationId}
    WHERE r."organizationId" = ${organizationId}
      AND a."siteId" = ANY(${[...sites]}::text[])
    ORDER BY r."assetId" ASC, r."createdAt" DESC, r."id" ASC
  `;
  return rows.map((r) => String(r.id));
}

/**
 * The `${failureModeId}|${procedureId}` pairs that at least one VISIBLE asset links together — the
 * provenance of a `MITIGATED_BY` edge — aggregated in the database (DISTINCT over the join of the two
 * link rows of the same asset). At most |failure modes| × |procedures| rows, independent of how many
 * link rows exist, and no row of another site or organisation is read. Fully parameterised.
 */
async function loadVisibleMitigations(
  db: Record<string, unknown>,
  organizationId: string,
  sites: readonly string[],
): Promise<string[]> {
  if (sites.length === 0) return [];
  const rows = await rawQuery(db)`
    SELECT DISTINCT fm."failureModeId" AS "failureModeId", pr."procedureId" AS "procedureId"
    FROM "AssetKnowledgeLink" fm
    JOIN "AssetKnowledgeLink" pr
      ON pr."assetId" = fm."assetId" AND pr."organizationId" = fm."organizationId"
    JOIN "IndustrialAsset" a
      ON a."id" = fm."assetId" AND a."organizationId" = ${organizationId}
    WHERE fm."organizationId" = ${organizationId}
      AND a."siteId" = ANY(${[...sites]}::text[])
      AND fm."failureModeId" IS NOT NULL
      AND pr."procedureId" IS NOT NULL
    ORDER BY fm."failureModeId" ASC, pr."procedureId" ASC
  `;
  return rows.map((r) => `${String(r.failureModeId)}|${String(r.procedureId)}`);
}

/**
 * Resolves, from the source tables and with the organisation AND the site predicate inside the
 * query, which entities the scope may see. Throws on a database error — the caller fails closed.
 */
export async function loadVisibleEntitySets(db: Record<string, unknown>, scope: GraphViewerScope): Promise<VisibleEntitySets> {
  const organizationId = scope.organizationId;
  const sites = [...scope.allowedSiteIds];

  // Cases: the SAME policy the knowledge routes use (../knowledge/case-visibility.ts), evaluated in
  // the database against the live asset. A viewer with no site still gets the organisation-level
  // cases they are entitled to (OWNER/ADMIN only), and nothing else.
  const cases = new Set(await listVisibleCaseIds(db, scope, { limit: MAX_VISIBLE_CASE_IDS }));

  if (sites.length === 0) return { ...EMPTY_SETS, cases };

  const inScopeAsset = { organizationId, siteId: { in: sites } };
  const [assetRows, tagRows, twinRows, riskRows, mitigationRows] = await Promise.all([
    readModel(db, "industrialAsset").findMany({ where: inScopeAsset, select: { id: true } }),
    readModel(db, "assetTag").findMany({ where: { organizationId, asset: { is: inScopeAsset } }, select: { id: true } }),
    readModel(db, "digitalTwinNode").findMany({ where: { organizationId, siteId: { in: sites } }, select: { id: true, assetId: true } }),
    // Independent review S2-03: the LATEST risk row per visible asset, chosen in the database with
    // DISTINCT ON (newest createdAt, id ASC on a tie). It used to read EVERY historical risk row of
    // every visible asset, so a viewer's graph request grew with the organisation's whole history —
    // and the graph cache only ever contains the latest row per asset (see builder.ts), so the older
    // rows could not make a single node visible.
    loadLatestRiskIds(db, organizationId, sites),
    // The (failureMode, procedure) pairs a VISIBLE asset links together, aggregated in the database.
    // It used to read every AssetKnowledgeLink row of the ORGANISATION (including other sites') and
    // reduce them in memory.
    loadVisibleMitigations(db, organizationId, sites),
  ]);

  const assets = new Set(assetRows.map((r) => String(r.id)));
  const tags = new Set(tagRows.map((r) => String(r.id)));
  // A twin node that names an asset must name a VISIBLE one; a node of this site pointing at another site's asset is ambiguous.
  const twinNodes = new Set(twinRows.filter((r) => { const a = str(r.assetId); return a === null || assets.has(a); }).map((r) => String(r.id)));
  const risks = new Set(riskRows);
  const mitigations = new Set(mitigationRows);

  return { assets, tags, twinNodes, risks, cases, mitigations };
}

// ── Pure application of the policy to a raw graph ─────────────────────────────

export interface PolicyNode { id: string; organizationId: string; nodeType: string; entityId: string; metadata: Record<string, unknown> }
export interface PolicyEdge { id: string; organizationId: string; sourceNodeId: string; targetNodeId: string; edgeType: string; evidence: Record<string, unknown> }

/** Which resolved set decides a site-owned node type. A type with no entry here can never be site-owned-visible. */
const OWNER_SET: Readonly<Record<string, (s: VisibleEntitySets) => ReadonlySet<string>>> = {
  ASSET:             (s) => s.assets,
  TELEMETRY_TAG:     (s) => s.tags,
  DIGITAL_TWIN_NODE: (s) => s.twinNodes,
  PREDICTIVE_RISK:   (s) => s.risks,
  ENGINEERING_CASE:  (s) => s.cases,
};

function nodeVisible(n: PolicyNode, organizationId: string, sets: VisibleEntitySets): boolean {
  if (n.organizationId !== organizationId) return false;             // tenant boundary, enforced a second time
  const policy = (NODE_POLICY as Readonly<Record<string, string>>)[n.nodeType];
  if (policy === undefined) return false;                            // unknown node type: deny
  if (policy === "ORG_CATALOG") return true;                         // no site data exists on these models; organisation already enforced above
  const ownerSet = OWNER_SET[n.nodeType];
  if (ownerSet === undefined) return false;                          // classified as site-owned but nothing can resolve it: deny
  if (!ownerSet(sets).has(n.entityId)) return false;                 // live owner not in scope (or no longer exists)
  // A cached node that still names an asset must name a visible one (a stale or tampered cache never widens access).
  const cachedAsset = str(n.metadata?.assetId);
  return cachedAsset === null || sets.assets.has(cachedAsset);
}

/**
 * Applies the policy: returns only the nodes the scope may see and only the edges between them
 * whose provenance is also visible. Pure — no I/O — so the policy itself is unit-testable.
 */
export function applyVisibility<N extends PolicyNode, E extends PolicyEdge>(
  graph: { nodes: readonly N[]; edges: readonly E[] },
  organizationId: string,
  sets: VisibleEntitySets,
): { nodes: N[]; edges: E[] } {
  const nodes = graph.nodes.filter((n) => nodeVisible(n, organizationId, sets));
  const byId = new Map(nodes.map((n) => [n.id, n]));
  const edges = graph.edges.filter((e) => {
    if (e.organizationId !== organizationId) return false;
    if (!KNOWN_EDGE_TYPES.has(e.edgeType)) return false;
    const source = byId.get(e.sourceNodeId);
    const target = byId.get(e.targetNodeId);
    if (!source || !target) return false;                            // both endpoints must be visible (no dangling reference)
    if (e.edgeType === "MITIGATED_BY" && !sets.mitigations.has(`${source.entityId}|${target.entityId}`)) return false;
    const citedCase = str(e.evidence?.caseId);
    if (citedCase !== null && !sets.cases.has(citedCase)) return false; // an edge may not cite a record the viewer cannot see
    return true;
  });
  return { nodes, edges };
}
