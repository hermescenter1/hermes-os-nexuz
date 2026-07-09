import { vi } from "vitest";
import type { CurrentUser } from "@/lib/auth/session";
import type { Role } from "@/lib/auth/roles";

/**
 * Shared auth mock for route-handler tests (Phase 82D.1).
 *
 * Hardened routes gate on `requireAuthoring()` → `getCurrentUser()` →
 * `cookies()`, which throws "cookies was called outside a request scope" in
 * the Vitest node environment. These helpers replace `@/lib/auth/session` so
 * the guard sees a deterministic user (or none) instead of touching cookies.
 *
 * CRITICAL (Phase 82C.1 finding): stacking a second `vi.doMock` over a
 * `beforeEach` default is NOT reliably applied — every helper here calls
 * `vi.doUnmock` first so the most recent role always wins. Call after
 * `vi.resetModules()` and before the route module is imported.
 *
 * Auth-only by design: it does not reset DB/session-store globals — store
 * keys differ per API family, so each suite keeps its own reset pattern.
 */

const SESSION_MODULE = "@/lib/auth/session";

/** Build a minimal `CurrentUser` matching what the route guards read. */
export function buildUser(role: Role, overrides: Partial<CurrentUser> = {}): CurrentUser {
  return { id: "u-test", email: "test@hermes.local", name: "Test User", role, ...overrides };
}

/** Mock `getCurrentUser()` to resolve to `user` (or `null` for anonymous). */
export function mockAuthUser(user: CurrentUser | null): void {
  vi.doUnmock(SESSION_MODULE);
  vi.doMock(SESSION_MODULE, () => ({
    getCurrentUser: async () => user,
  }));
}

/** No session — the guard should answer 401. */
export function mockNoUser(): void {
  mockAuthUser(null);
}

/** Authenticated but without the "authoring" capability — expect 403. */
export function mockViewer(overrides: Partial<CurrentUser> = {}): CurrentUser {
  const user = buildUser("viewer", overrides);
  mockAuthUser(user);
  return user;
}

/** Authenticated authoring user (engineer) — reaches business logic. */
export function mockEngineer(overrides: Partial<CurrentUser> = {}): CurrentUser {
  const user = buildUser("engineer", overrides);
  mockAuthUser(user);
  return user;
}

/** Authenticated admin (authoring + admin) — for admin-gated routes. */
export function mockAdmin(overrides: Partial<CurrentUser> = {}): CurrentUser {
  const user = buildUser("admin", overrides);
  mockAuthUser(user);
  return user;
}

/** Remove the session mock — call in `afterEach` to avoid cross-test bleed. */
export function unmockAuth(): void {
  vi.doUnmock(SESSION_MODULE);
}
