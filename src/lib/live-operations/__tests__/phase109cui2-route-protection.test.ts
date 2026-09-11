/**
 * PHASE 109-C-UI.2 — the route must not be publicly reachable.
 *
 * A new top-level locale route is PUBLIC in this product until it is named in
 * `PROTECTED_PATHS` *and* branched on in `isAuthorizedForPath`. Creating
 * `/live-operations` without both would have published tenant-scoped plant
 * records to anonymous visitors (finding F-03).
 *
 * These assertions are cheap and the failure they guard against is silent, which
 * is exactly the combination that justifies a test.
 */

import { describe, expect, it } from "vitest";

import { isProtectedPath, isAuthorizedForPath } from "@/lib/auth/rbac";
import type { Role } from "@/lib/auth/roles";

const LOCALES = ["en", "fa", "de"] as const;

describe("109-C-UI.2 · /live-operations is behind the middleware gate", () => {
  it.each(LOCALES)("%s is a protected path", (locale) => {
    expect(isProtectedPath(`/${locale}/live-operations`)).toBe(true);
  });

  it("protects nested paths under it too", () => {
    expect(isProtectedPath("/en/live-operations/anything")).toBe(true);
  });

  it("matches only a COMPLETE segment", () => {
    // The segment-boundary rule this repository already relies on: a bare prefix
    // match would also capture an unrelated future route.
    expect(isProtectedPath("/en/live-operations-public")).toBe(false);
  });

  it("does not accidentally protect the whole locale root", () => {
    expect(isProtectedPath("/en")).toBe(false);
  });
});

describe("109-C-UI.2 · only engineering-capable platform roles may open it", () => {
  // Read from the same source the product uses, so this cannot drift into
  // asserting a role list that no longer exists.
  const ALLOWED: readonly Role[] = ["engineer", "admin", "superadmin"];
  const REFUSED: readonly Role[] = ["viewer", "candidate"];

  it.each(ALLOWED)("%s is authorized", (role) => {
    expect(isAuthorizedForPath(role, "/en/live-operations")).toBe(true);
  });

  it.each(REFUSED)("%s is refused", (role) => {
    expect(isAuthorizedForPath(role, "/en/live-operations")).toBe(false);
  });

  it("refuses in every locale, not only English", () => {
    for (const locale of LOCALES) {
      expect(isAuthorizedForPath("viewer", `/${locale}/live-operations`)).toBe(false);
    }
  });

  it("gives it the same platform gate as the engineering estate", () => {
    // Not a claim that the two routes are equivalent — the ORGANIZATION
    // permission and the site boundary are enforced again inside the page. This
    // pins that the platform-level answer is the same one, so a future change to
    // engineering access cannot leave this route quietly more permissive.
    for (const role of [...ALLOWED, ...REFUSED]) {
      expect(
        isAuthorizedForPath(role, "/en/live-operations"),
        role,
      ).toBe(isAuthorizedForPath(role, "/en/engineering"));
    }
  });
});
