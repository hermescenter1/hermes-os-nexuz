import { describe, it, expect, beforeEach, vi } from "vitest";
import { NextRequest } from "next/server";

/**
 * ACADEMY COURSE PATCH — TENANT ISOLATION REGRESSION SUITE.
 *
 * The rest of this branch closes the tenant predicate on the Academy write
 * endpoints that consume a course. `PATCH /api/academy/courses/[id]` is the one
 * that MUTATES the course itself, and it was the last one left: it checked only
 * that the caller is AN admin, never an admin OF THIS COURSE'S organization,
 * and `updateCourse` updated by primary key alone. Any admin of any tenant
 * could retitle, unpublish or republish any other tenant's course — a
 * cross-tenant WRITE, not a read leak.
 *
 * superadmin is deliberately not exempt: the GET on this very route already
 * answers 404 to a superadmin for a foreign course, so granting cross-tenant
 * write where read is denied would be incoherent.
 *
 * The enroll, course-progress, progress and quiz-attempt endpoints are covered
 * by the `Academy enrolment and progress endpoints are tenant-scoped` block in
 * phase99-remediation.test.ts; they are not duplicated here.
 */

const FOREIGN_TITLE = "Org A Confidential Commissioning Programme";

const course = (over: Record<string, unknown> = {}) => ({
  id: "course-1",
  organizationId: "org-A",
  title: FOREIGN_TITLE,
  isPublished: true,
  certificateEnabled: true,
  ...over,
});

describe("PATCH /api/academy/courses/[id] — the update carries the organization", () => {
  let updateCourse: ReturnType<typeof vi.fn>;

  function mockPatch(opts: { role: string | null; orgId: string | null }) {
    updateCourse = vi.fn(async () => ({ id: "course-1" }));
    vi.doMock("@/lib/auth/rbac-server", () => ({ getAuthRole: async () => opts.role }));
    vi.doMock("@/lib/academy/request-scope", () => ({
      resolveAcademyScope: async () => (opts.orgId ? { userId: "u1", orgId: opts.orgId } : null),
      canSeeUnpublishedAcademyContent: (r: string | null) => r === "admin" || r === "superadmin",
    }));
    vi.doMock("@/lib/academy/db", () => ({ updateCourse }));
  }

  async function patch(body: Record<string, unknown> = { title: "Renamed" }) {
    const { PATCH } = await import("@/app/api/academy/courses/[id]/route");
    return PATCH(
      new NextRequest("https://app.example/api/academy/courses/course-1", {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
      }),
      { params: Promise.resolve({ id: "course-1" }) },
    );
  }

  beforeEach(() => vi.resetModules());

  it("403s a non-admin", async () => {
    mockPatch({ role: "viewer", orgId: "org-A" });
    expect((await patch()).status).toBe(403);
    expect(updateCourse).not.toHaveBeenCalled();
  });

  it("404s an admin whose organization cannot be resolved", async () => {
    mockPatch({ role: "admin", orgId: null });
    expect((await patch()).status).toBe(404);
    expect(updateCourse).not.toHaveBeenCalled();
  });

  it("passes the CALLER's organization into the update, never the request's", async () => {
    mockPatch({ role: "admin", orgId: "org-B" });
    await patch({ title: "Renamed", organizationId: "org-A" });
    expect(updateCourse).toHaveBeenCalledWith(
      "course-1",
      expect.objectContaining({ title: "Renamed" }),
      { organizationId: "org-B" },
    );
    const data = (updateCourse.mock.calls[0] as unknown[])[1] as Record<string, unknown>;
    expect(data).not.toHaveProperty("organizationId");
  });

  it("does not exempt superadmin — the scope is still applied", async () => {
    mockPatch({ role: "superadmin", orgId: "org-B" });
    await patch();
    expect((updateCourse.mock.calls[0] as unknown[])[2]).toEqual({ organizationId: "org-B" });
  });

  it("404s when the scoped update matches nothing (foreign or soft-deleted course)", async () => {
    mockPatch({ role: "admin", orgId: "org-B" });
    updateCourse.mockResolvedValueOnce(null);
    const res = await patch();
    expect(res.status).toBe(404);
    expect(JSON.stringify(await res.json())).not.toContain("org-A");
  });
});

describe("updateCourse — the organization predicate lives in the query", () => {
  // The blocks above register a factory mock for @/lib/academy/db. `doMock`
  // registrations outlive `resetModules`, so without this the real function
  // under test here would never be imported and both assertions would pass or
  // fail for the wrong reason.
  beforeEach(() => {
    vi.doUnmock("@/lib/academy/db");
    vi.resetModules();
  });

  it("filters on organizationId and deletedAt in the UPDATE itself, not in the caller", async () => {
    const update = vi.fn(async () => ({ id: "course-1" }));
    vi.doMock("@/lib/db/prisma", () => ({
      getPrisma: async () => ({ academyCourse: { update } }),
    }));
    const { updateCourse } = await import("@/lib/academy/db");
    await updateCourse("course-1", { title: "T" }, { organizationId: "org-A" });

    const args = (update.mock.calls[0] as unknown[])[0] as { where: Record<string, unknown> };
    expect(args.where).toEqual({ id: "course-1", organizationId: "org-A", deletedAt: null });
  });

  it("returns null when Prisma rejects the scoped update, so the route can 404", async () => {
    vi.doMock("@/lib/db/prisma", () => ({
      getPrisma: async () => ({
        academyCourse: { update: async () => { throw new Error("P2025"); } },
      }),
    }));
    const { updateCourse } = await import("@/lib/academy/db");
    expect(await updateCourse("course-1", { title: "T" }, { organizationId: "org-B" })).toBeNull();
  });
});
