import { describe, it, expect, beforeEach, vi } from "vitest";
import { NextRequest } from "next/server";

/**
 * ACADEMY COURSE WRITES — TENANT ISOLATION REGRESSION SUITE.
 *
 * GET /api/academy/courses/[id] has applied `course.organizationId !==
 * scope.orgId` since Phase 99. Two write paths on the same surface did not:
 *
 *   POST .../[id]/enroll gated on `isPublished` alone, so a member of org B
 *   could enroll in org A's published course. The resulting enrollment row
 *   (owned by B, pointing at A's course) then unlocked POST
 *   /api/academy/progress, which passes `course.title` into issueCertificate —
 *   so A's course title came back to B on a certificate.
 *
 *   PATCH .../[id] checked only that the caller is AN admin, never an admin OF
 *   THIS COURSE'S organization, and updated by primary key alone. Any admin
 *   could retitle, unpublish or republish any other tenant's course — a
 *   cross-tenant WRITE, not merely a read leak.
 *
 * These tests pin both predicates, the 404 (not 403) responses so a foreign
 * course id is not an existence oracle, and — the part that actually matters —
 * that no row is written for a foreign course.
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

describe("POST /api/academy/courses/[id]/enroll — organization predicate", () => {
  let enrollUser: ReturnType<typeof vi.fn>;

  function mockEnroll(opts: {
    orgId: string | null;
    course: Record<string, unknown> | null;
    existingEnrollment?: Record<string, unknown> | null;
  }) {
    enrollUser = vi.fn(async () => ({ id: "enr-1", courseId: "course-1" }));
    vi.doMock("@/lib/academy/request-scope", () => ({
      resolveAcademyScope: async () => (opts.orgId ? { userId: "u1", orgId: opts.orgId } : null),
    }));
    vi.doMock("@/lib/academy/db", () => ({
      getCourseById: async () => opts.course,
      getEnrollment: async () => opts.existingEnrollment ?? null,
      enrollUser,
    }));
  }

  async function post() {
    const { POST } = await import("@/app/api/academy/courses/[id]/enroll/route");
    return POST(
      new NextRequest("https://app.example/api/academy/courses/course-1/enroll", { method: "POST" }),
      { params: Promise.resolve({ id: "course-1" }) },
    );
  }

  beforeEach(() => vi.resetModules());

  it("401s an anonymous caller", async () => {
    mockEnroll({ orgId: null, course: course() });
    const res = await post();
    expect(res.status).toBe(401);
  });

  it("404s a published course owned by ANOTHER organization", async () => {
    mockEnroll({ orgId: "org-B", course: course() });
    const res = await post();
    expect(res.status).toBe(404);
  });

  it("writes NO enrollment row for a foreign course", async () => {
    mockEnroll({ orgId: "org-B", course: course() });
    await post();
    expect(enrollUser).not.toHaveBeenCalled();
  });

  it("leaks neither the foreign course title nor its organization id", async () => {
    mockEnroll({ orgId: "org-B", course: course() });
    const body = JSON.stringify(await (await post()).json());
    expect(body).not.toContain(FOREIGN_TITLE);
    expect(body).not.toContain("org-A");
  });

  it("404s a foreign course that is ALSO unpublished (both predicates hold)", async () => {
    mockEnroll({ orgId: "org-B", course: course({ isPublished: false }) });
    const res = await post();
    expect(res.status).toBe(404);
    expect(enrollUser).not.toHaveBeenCalled();
  });

  it("still 404s an unpublished course inside the caller's own organization", async () => {
    mockEnroll({ orgId: "org-A", course: course({ isPublished: false }) });
    const res = await post();
    expect(res.status).toBe(404);
    expect(enrollUser).not.toHaveBeenCalled();
  });

  it("still 404s a missing or soft-deleted course", async () => {
    mockEnroll({ orgId: "org-A", course: null });
    const res = await post();
    expect(res.status).toBe(404);
    expect(enrollUser).not.toHaveBeenCalled();
  });

  it("still enrolls a member in their OWN organization's published course", async () => {
    mockEnroll({ orgId: "org-A", course: course() });
    const res = await post();
    expect(res.status).toBe(201);
    expect((await res.json()).enrollment.id).toBe("enr-1");
  });

  it("stamps the enrollment with the caller's organization, never the request's", async () => {
    mockEnroll({ orgId: "org-A", course: course() });
    await post();
    expect(enrollUser).toHaveBeenCalledWith(
      expect.objectContaining({ organizationId: "org-A", userId: "u1", courseId: "course-1" }),
    );
  });

  it("still short-circuits an already-enrolled member without writing again", async () => {
    mockEnroll({ orgId: "org-A", course: course(), existingEnrollment: { id: "enr-old" } });
    const res = await post();
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.alreadyEnrolled).toBe(true);
    expect(enrollUser).not.toHaveBeenCalled();
  });
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
