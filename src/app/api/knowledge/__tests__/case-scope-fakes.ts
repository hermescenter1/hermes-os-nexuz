/**
 * Test-only doubles that let the existing in-memory-Prisma route tests keep exercising the
 * knowledge case routes after RV-01 moved case visibility into a database-side policy
 * (`lib/knowledge/case-visibility.ts`, which needs a real PostgreSQL to evaluate).
 *
 * WHAT IS FAKED: only (a) the viewer scope — a fixed site list plus the OWNER/ADMIN
 * organisation-level flag derived from the role exactly like production, and (b) the read of
 * visible case rows, re-implemented in plain JS over the fake table. The JS mirror is
 * deliberately small and is NOT evidence of the SQL: the real SQL is proven by
 * `src/lib/knowledge-graph/__tests__/pg/*.pg.test.ts` against PostgreSQL.
 * WHAT IS REAL: the routes, the services, the scope-write validation (`assertCaseScopeWritable`),
 * the error mapping and the tenant-pinned writes.
 */
import type { vi as ViType } from "vitest";

type Row = Record<string, unknown>;
type Vi = typeof ViType;

export const TEST_SITE = "site-A";

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
