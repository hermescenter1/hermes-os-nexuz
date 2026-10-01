import { vi } from "vitest";
import { NextRequest } from "next/server";
import type { ContextRefusal } from "@/lib/auth/context-result";

/**
 * F-2 — shared guard harness for the /api/documents* route tests.
 * Not a test file (no `.test.ts` suffix).
 *
 * `requirePlatformAuth` and `requireOrgActor` both need a real signed session
 * cookie and a database, which this environment does not provide, so they are
 * replaced here — the same technique as
 * `src/app/api/knowledge/__tests__/org-knowledge-access.test.ts`. The mocks
 * keep the two properties the routes depend on:
 *
 *   - a refusal from `requirePlatformAuth` is the repository's own
 *     `refuse(code)` payload (status + code), so 401 / 409 / 428 pass through
 *     exactly as in production;
 *   - `requireOrgActor(req, orgId)` grants membership ONLY for the org the
 *     actor really belongs to — asking for any other org is refused 403, as
 *     the real guard does after its membership lookup.
 *
 * `orgActorRefusalCode`, `requirePermission`, `requireTrustedOrigin`, the
 * scoped repository, object storage and the audit buffer are all REAL.
 */

export const ORG_A = "org-a";
export const ORG_B = "org-b";
export const USER_A = "user-a";

export type GuardState =
  | { kind: "refused"; code: ContextRefusal }
  | { kind: "nonMember"; orgId?: string }
  | { kind: "member"; role: string; orgId?: string; userId?: string };

export const member = (role: string, orgId = ORG_A): GuardState => ({ kind: "member", role, orgId });

/** Organizations `requireOrgActor` was asked about, in call order. */
export const orgActorCalls: string[] = [];

export async function mockGuards(state: GuardState): Promise<void> {
  const { refuse } = await import("@/lib/auth/context-result");
  const actorOrg = state.kind === "refused" ? ORG_A : (state.orgId ?? ORG_A);
  const userId = state.kind === "member" ? (state.userId ?? USER_A) : USER_A;
  orgActorCalls.length = 0;

  vi.doMock("@/lib/api/auth", () => ({
    requirePlatformAuth: async () =>
      state.kind === "refused"
        ? refuse(state.code)
        : { ctx: { userId, orgId: actorOrg, authMethod: "jwt", scopes: ["admin"] } },
  }));

  vi.doMock("@/lib/org/context", async (importOriginal) => {
    const actual = await importOriginal<typeof import("@/lib/org/context")>();
    return {
      ...actual,
      requireOrgActor: async (_req: NextRequest, orgId: string) => {
        orgActorCalls.push(orgId);
        if (state.kind !== "member" || orgId !== actorOrg) {
          return { error: "Not a member of this organization", status: 403 };
        }
        return { ctx: { userId, orgId, memberId: "mem-a", role: state.role, status: "ACTIVE" } };
      },
    };
  });
}

export function unmockGuards(): void {
  vi.doUnmock("@/lib/api/auth");
  vi.doUnmock("@/lib/org/context");
}

/** Same-origin by default (an allowed test origin); pass `origin: null` to omit it. */
export function docRequest(
  url: string,
  init: { method: string; body?: BodyInit; headers?: Record<string, string>; origin?: string | null },
): NextRequest {
  const headers = new Headers(init.headers);
  const origin = init.origin === undefined ? "http://localhost" : init.origin;
  if (origin !== null) headers.set("origin", origin);
  return new NextRequest(`http://localhost${url}`, { method: init.method, body: init.body, headers });
}

export interface RecordedAudit {
  action: string;
  userId: string | null;
  organizationId: string | null;
  entityId: string | null;
}

export function resetAudit(): void {
  (globalThis as unknown as { __hermesAudit?: unknown[] }).__hermesAudit = [];
}

export function auditEvents(): RecordedAudit[] {
  return ((globalThis as unknown as { __hermesAudit?: RecordedAudit[] }).__hermesAudit ?? []).slice();
}
