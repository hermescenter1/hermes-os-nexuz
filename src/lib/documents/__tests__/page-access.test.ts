import { describe, it, expect, vi, afterEach } from "vitest";
import type { TenantDecision } from "@/lib/tenant-selection/selection";
import { documentPageAccessFromDecision } from "../page-access";

/**
 * F-2 — the document pages' access decision.
 *
 * The decision is taken from the SAME tenant resolver the API uses; these
 * tests pin how a resolved (or refused) decision maps to what the page may
 * render. There is no platform-role input at all, so a platform admin can
 * only ever be granted through a real membership.
 */

function granted(role: string): TenantDecision {
  return {
    granted: true,
    userId: "user-a",
    organizationId: "org-a",
    organizationSlug: "org-a",
    organizationRole: role as never,
    selectable: false,
  };
}

afterEach(() => {
  vi.doUnmock("@/lib/tenant-selection/selection");
  vi.resetModules();
});

describe("documentPageAccessFromDecision", () => {
  it.each(["OWNER", "ADMIN", "MANAGER", "ENGINEER"])("%s: view + manage", (role) => {
    expect(documentPageAccessFromDecision(granted(role))).toEqual({
      granted: true,
      organizationId: "org-a",
      canManage: true,
    });
  });

  it.each(["VIEWER", "BILLING_ADMIN"])("%s: view only — no write controls", (role) => {
    expect(documentPageAccessFromDecision(granted(role))).toEqual({
      granted: true,
      organizationId: "org-a",
      canManage: false,
    });
  });

  it.each(["MEMBER", "NOT_A_ROLE"])("%s: no view_documents → FORBIDDEN", (role) => {
    expect(documentPageAccessFromDecision(granted(role))).toEqual({ granted: false, code: "FORBIDDEN" });
  });

  it.each([
    "AUTHENTICATION_REQUIRED",
    "ORGANIZATION_CONTEXT_REQUIRED",
    "ORGANIZATION_SELECTION_REQUIRED",
    "ORGANIZATION_CONTEXT_UNAVAILABLE",
  ] as const)("a refused tenant decision (%s) is passed through unchanged", (code) => {
    expect(documentPageAccessFromDecision({ granted: false, code } as TenantDecision)).toEqual({
      granted: false,
      code,
    });
  });
});

describe("resolveDocumentPageAccess", () => {
  it("maps a resolver failure to ORGANIZATION_CONTEXT_UNAVAILABLE, never to access", async () => {
    vi.doMock("@/lib/tenant-selection/selection", () => ({
      resolveTenantDecisionFromSession: async () => {
        throw new Error("db down");
      },
    }));
    const { resolveDocumentPageAccess } = await import("../page-access");
    expect(await resolveDocumentPageAccess({ get: () => undefined })).toEqual({
      granted: false,
      code: "ORGANIZATION_CONTEXT_UNAVAILABLE",
    });
  });

  it("uses the session resolver's organization and role, and nothing from the caller", async () => {
    const seen: unknown[] = [];
    vi.doMock("@/lib/tenant-selection/selection", () => ({
      resolveTenantDecisionFromSession: async (jar: unknown) => {
        seen.push(jar);
        return granted("VIEWER");
      },
    }));
    const { resolveDocumentPageAccess } = await import("../page-access");
    const jar = { get: () => undefined };
    expect(await resolveDocumentPageAccess(jar)).toEqual({
      granted: true,
      organizationId: "org-a",
      canManage: false,
    });
    expect(seen).toEqual([jar]);
  });
});
