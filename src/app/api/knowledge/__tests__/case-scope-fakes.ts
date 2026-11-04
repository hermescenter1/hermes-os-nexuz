/**
 * Test-only doubles that let the existing in-memory-Prisma route tests keep exercising the
 * knowledge case routes after RV-01 moved case visibility into a database-side policy
 * (`lib/knowledge/case-visibility.ts`, which needs a real PostgreSQL to evaluate).
 *
 * WHAT IS FAKED: only (a) the viewer scope — a fixed site list plus the OWNER/ADMIN
 * organisation-level flag derived from the role exactly like production, (b) the read of
 * visible case rows and (c) slice E1's write-side ROW LOCKS, all re-implemented in plain JS over the
 * fake tables (which have no asset or site model, and no transaction). The JS mirrors are deliberately
 * small and are NOT evidence of the SQL or of the locking: the real statements are proven against
 * PostgreSQL by `src/lib/knowledge-graph/__tests__/pg/*.pg.test.ts`, and the concurrency itself by
 * `pg/e1-case-authorization-race.pg.test.ts`.
 * WHAT IS REAL: the routes, the services, the scope decision table, the error mapping and the
 * tenant-pinned writes.
 */
import type { vi as ViType } from "vitest";

type Row = Record<string, unknown>;
type Vi = typeof ViType;

export const TEST_SITE = "site-A";

/**
 * The in-memory table bag plus the ONE client capability slice E1 added to the case writers: an
 * interactive transaction. The fake runs the callback against the same tables (no isolation to model —
 * the real behaviour is proven on PostgreSQL).
 */
export function withCaseTx<T extends object>(tables: T): T {
  return new Proxy(tables, {
    get(target, prop, receiver) {
      if (prop === "$transaction") {
        return async (fn: (tx: unknown) => Promise<unknown>) => fn(receiver);
      }
      return Reflect.get(target, prop, receiver);
    },
  }) as T;
}

export function mockCaseScope(vi: Vi, caseRows: () => Row[]): void {
  vi.doMock("@/lib/knowledge-graph/visibility", async (importOriginal) => {
    const actual = await importOriginal<typeof import("@/lib/knowledge-graph/visibility")>();
    return {
      ...actual,
      resolveGraphViewerScope: async (_userId: unknown, organizationId: string, role: string | null | undefined) =>
        actual.createGraphViewerScope(organizationId, [TEST_SITE], actual.hasOrganizationLevelAccess(role)),
    };
  });

  vi.doMock("@/lib/knowledge/case-visibility", async (importOriginal) => {
    const actual = await importOriginal<typeof import("@/lib/knowledge/case-visibility")>();
    return {
      ...actual,
      // Slice E1: the writers lock rows with raw SQL. These mirrors answer from the fake tables, which
      // contain no asset and no site model: a scope that names an ASSET is therefore "not found" here,
      // exactly as it would be for an asset that does not exist.
      lockCaseRowForWrite: async (_tx: unknown, organizationId: string, id: string) => {
        const row = caseRows().find((r) => r.id === id && r.organizationId === organizationId);
        if (!row) return null;
        const nz = (v: unknown) => (typeof v === "string" && v.length > 0 ? v : null);
        return { siteId: nz(row.siteId), assetId: nz(row.assetId), failureModeId: nz(row.failureModeId) };
      },
      lockCaseScopesForWrite: async (
        _tx: unknown,
        scope: { organizationId: string; allowedSiteIds: readonly string[]; organizationLevelAccess: boolean },
        scopes: readonly { siteId: string | null; assetId: string | null }[],
      ) => scopes.map((s) => {
        if (s.siteId === null && s.assetId === null) {
          return scope.organizationLevelAccess ? s : new actual.CaseScopeError("ORG_LEVEL_FORBIDDEN");
        }
        if (s.assetId !== null) return new actual.CaseScopeError("SCOPE_NOT_FOUND");
        return scope.allowedSiteIds.includes(s.siteId as string) ? s : new actual.CaseScopeError("SCOPE_NOT_FOUND");
      }),
      loadVisibleCaseRows: async (
        _db: unknown,
        scope: { organizationId: string; allowedSiteIds: readonly string[]; organizationLevelAccess: boolean },
        q: { id?: string; excludeId?: string; status?: string; assetId?: string; failureModeIds?: readonly string[]; limit?: number } = {},
      ) => {
        const visible = (r: Row): boolean => {
          if (r.organizationId !== scope.organizationId) return false;
          const site = typeof r.siteId === "string" ? r.siteId : null;
          const asset = typeof r.assetId === "string" ? r.assetId : null;
          if (site === null && asset === null) return scope.organizationLevelAccess;
          return site !== null && asset === null && scope.allowedSiteIds.includes(site);
        };
        return caseRows()
          .filter(visible)
          .filter((r) => q.id === undefined || r.id === q.id)
          .filter((r) => q.excludeId === undefined || r.id !== q.excludeId)
          .filter((r) => q.status === undefined || r.status === q.status)
          .filter((r) => q.assetId === undefined || r.assetId === q.assetId)
          .filter((r) => q.failureModeIds === undefined || q.failureModeIds.includes(String(r.failureModeId)))
          .slice(0, q.limit ?? 50);
      },
    };
  });
}
