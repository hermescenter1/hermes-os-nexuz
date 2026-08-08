/**
 * PHASE 99 — regression tests for the security defects found by the Phase 99
 * internal review.
 *
 * Every test here reproduces a REAL defect that existed on the Phase 98 head and
 * fails against the unfixed code. They are the retest evidence referenced by
 * `docs/security/phase99-findings.json`; each `describe` block names its finding
 * id so a reader can go from register entry to proof and back.
 *
 * Offline and deterministic: no database, no network, no Docker. The routes are
 * imported dynamically after their dependencies are mocked, following the
 * existing route-test pattern in `src/app/api/compliance/__tests__/`.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { NextRequest } from "next/server";
import { SESSION_COOKIE, ACCESS_TOKEN_COOKIE } from "@/lib/auth/config";
import { CONSENT_ID_COOKIE, isConsentId, newConsentId } from "@/lib/compliance/consent-cookie";

const MOCKED = [
  "@/lib/compliance/db",
  "@/lib/auth/jwt",
  "@/lib/ats/db",
  "@/lib/academy/db",
  "@/lib/academy/request-scope",
  "@/lib/auth/rbac-server",
  "@/lib/auth/token-session",
  "@/lib/articles/db",
];

afterEach(() => {
  for (const m of MOCKED) vi.doUnmock(m);
  vi.resetModules();
});

// ── P99-INT-001 — session fixation via the cookie-consent endpoint ────────────
describe("P99-INT-001 — cookie consent must never write the authentication session", () => {
  let upserted: Array<Record<string, unknown>>;

  beforeEach(() => {
    vi.resetModules();
    upserted = [];
    vi.doMock("@/lib/compliance/db", () => ({
      getCookieConsent: async () => null,
      upsertCookieConsent: async (d: Record<string, unknown>) => {
        upserted.push(d);
        return {
          necessary: true, analytics: false, marketing: false, preferences: false,
          locale: "en", consentVersion: "1.0", createdAt: new Date(0), updatedAt: new Date(0),
          userId: "victim-user", ipAddress: "10.0.0.9", sessionId: d.sessionId,
        };
      },
      createConsentRecord: async () => null,
    }));
    vi.doMock("@/lib/auth/jwt", () => ({ verifyAccessToken: async () => null }));
  });

  it("ignores a client-supplied sessionId and never sets the auth cookie", async () => {
    const { POST } = await import("@/app/api/compliance/cookie-consent/route");
    const attackerSession = "attacker.signed.session.token";
    const req = new NextRequest("https://app.example/api/compliance/cookie-consent", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ analytics: true, sessionId: attackerSession }),
    });

    const res = await POST(req);

    // The authentication cookie must not appear in the response at all.
    const setCookie = res.headers.getSetCookie().join("\n");
    expect(setCookie).not.toContain(`${SESSION_COOKIE}=`);
    // The consent identifier is server-minted and is NOT the supplied value.
    expect(res.cookies.get(CONSENT_ID_COOKIE)?.value).toBeDefined();
    expect(res.cookies.get(CONSENT_ID_COOKIE)?.value).not.toBe(attackerSession);
    expect(isConsentId(res.cookies.get(CONSENT_ID_COOKIE)!.value)).toBe(true);
    // Nothing attacker-controlled reached persistence either.
    expect(upserted[0]?.sessionId).not.toBe(attackerSession);
    expect(isConsentId(String(upserted[0]?.sessionId))).toBe(true);
  });

  it("reuses an existing well-formed consent id but rejects a forged one", async () => {
    const { POST } = await import("@/app/api/compliance/cookie-consent/route");
    const mine = newConsentId();

    const good = new NextRequest("https://app.example/api/compliance/cookie-consent", {
      method: "POST",
      headers: { "content-type": "application/json", cookie: `${CONSENT_ID_COOKIE}=${mine}` },
      body: JSON.stringify({ analytics: true }),
    });
    await POST(good);
    expect(upserted[0]?.sessionId).toBe(mine);

    // A value shaped like an auth token (or anything else) is treated as absent.
    const forged = new NextRequest("https://app.example/api/compliance/cookie-consent", {
      method: "POST",
      headers: { "content-type": "application/json", cookie: `${CONSENT_ID_COOKIE}=not-a-consent-id` },
      body: JSON.stringify({ analytics: true }),
    });
    await POST(forged);
    expect(upserted[1]?.sessionId).not.toBe("not-a-consent-id");
    expect(isConsentId(String(upserted[1]?.sessionId))).toBe(true);
  });
});

// ── P99-INT-002 — consent read must not be an evidence oracle ─────────────────
describe("P99-INT-002 — cookie consent read exposes no subject evidence", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.doMock("@/lib/compliance/db", () => ({
      getCookieConsent: async () => ({
        id: "row-1", sessionId: "c_x", userId: "victim-user",
        necessary: true, analytics: true, marketing: false, preferences: false,
        ipAddress: "203.0.113.9", userAgent: "VictimBrowser/1.0",
        locale: "en", consentVersion: "1.0", createdAt: new Date(0), updatedAt: new Date(0),
      }),
      upsertCookieConsent: async () => null,
      createConsentRecord: async () => null,
    }));
    vi.doMock("@/lib/auth/jwt", () => ({ verifyAccessToken: async () => null }));
  });

  it("treats a non-consent-id cookie as absent", async () => {
    const { GET } = await import("@/app/api/compliance/cookie-consent/route");
    const req = new NextRequest("https://app.example/api/compliance/cookie-consent", {
      headers: { cookie: `${CONSENT_ID_COOKIE}=anon_1700000000000` },
    });
    const body = await (await GET(req)).json();
    expect(body.consent).toBeNull();
    expect(body.defaults).toEqual({ necessary: true, analytics: false, marketing: false, preferences: false });
  });

  it("projects preferences only — never userId, ipAddress or userAgent", async () => {
    const { GET } = await import("@/app/api/compliance/cookie-consent/route");
    const req = new NextRequest("https://app.example/api/compliance/cookie-consent", {
      headers: { cookie: `${CONSENT_ID_COOKIE}=${newConsentId()}` },
    });
    const res = await GET(req);
    const raw = JSON.stringify(await res.json());
    expect(raw).not.toContain("victim-user");
    expect(raw).not.toContain("203.0.113.9");
    expect(raw).not.toContain("VictimBrowser");
    expect(JSON.parse(raw).consent.analytics).toBe(true);
  });
});

// ── P99-INT-003 — candidate profile mass assignment ───────────────────────────
describe("P99-INT-003 — candidate profile accepts only self-service fields", () => {
  let updateArgs: Record<string, unknown> | null;

  beforeEach(() => {
    vi.resetModules();
    updateArgs = null;
    vi.doMock("@/lib/auth/token-session", () => ({
      getTokenUser: async () => ({ id: "user-1", role: "candidate" }),
    }));
    vi.doMock("@/lib/ats/db", () => ({
      getCandidateByUserId: async () => ({ id: "cand-1" }),
      updateCandidate: async (_id: string, data: Record<string, unknown>) => { updateArgs = data; return { id: "cand-1", ...data }; },
      getJobById: async () => null,
      getApplicationsByCandidate: async () => [],
    }));
  });

  it("drops identity and relation fields the client tried to set", async () => {
    const { PUT } = await import("@/app/api/candidate/profile/route");
    const req = new NextRequest("https://app.example/api/candidate/profile", {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        name: "Legitimate Name",
        email: "victim@example.test",
        userId: "victim-user-id",
        deletedAt: null,
        applications: { connect: { id: "someone-elses-application" } },
      }),
    });
    await PUT(req);

    expect(updateArgs).not.toBeNull();
    expect(updateArgs).toHaveProperty("name", "Legitimate Name");
    for (const forbidden of ["email", "userId", "deletedAt", "applications"]) {
      expect(Object.prototype.hasOwnProperty.call(updateArgs!, forbidden)).toBe(false);
    }
  });

  it("does not invent fields the client never sent", async () => {
    const { PUT } = await import("@/app/api/candidate/profile/route");
    const req = new NextRequest("https://app.example/api/candidate/profile", {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ phone: "+1 555 0100" }),
    });
    await PUT(req);
    expect(Object.keys(updateArgs!)).toEqual(["phone"]);
  });
});

// ── P99-INT-004 — public careers detail must be published-only ────────────────
describe("P99-INT-004 — public job detail is published-only", () => {
  const job = (over: Record<string, unknown>) => ({
    id: "job-1", organizationId: "org-A", title: "Internal", status: "OPEN", isPublic: true, ...over,
  });

  beforeEach(() => vi.resetModules());

  it("404s a DRAFT posting instead of returning the record", async () => {
    vi.doMock("@/lib/ats/db", () => ({ getJobById: async () => job({ status: "DRAFT" }) }));
    const { GET } = await import("@/app/api/careers/jobs/[jobId]/route");
    const res = await GET(new Request("https://app.example/api/careers/jobs/job-1"), { params: Promise.resolve({ jobId: "job-1" }) });
    expect(res.status).toBe(404);
    expect(JSON.stringify(await res.json())).not.toContain("org-A");
  });

  it("404s a non-public posting", async () => {
    vi.doMock("@/lib/ats/db", () => ({ getJobById: async () => job({ isPublic: false }) }));
    const { GET } = await import("@/app/api/careers/jobs/[jobId]/route");
    const res = await GET(new Request("https://app.example/api/careers/jobs/job-1"), { params: Promise.resolve({ jobId: "job-1" }) });
    expect(res.status).toBe(404);
  });

  it("still serves an OPEN, public posting", async () => {
    vi.doMock("@/lib/ats/db", () => ({ getJobById: async () => job({}) }));
    const { GET } = await import("@/app/api/careers/jobs/[jobId]/route");
    const res = await GET(new Request("https://app.example/api/careers/jobs/job-1"), { params: Promise.resolve({ jobId: "job-1" }) });
    expect(res.status).toBe(200);
    expect((await res.json()).job.id).toBe("job-1");
  });
});

// ── P99-INT-005 / P99-INT-006 — Academy detail tenant + published predicates ──
describe("P99-INT-005/006 — Academy detail endpoints are tenant- and published-scoped", () => {
  const course = (over: Record<string, unknown> = {}) => ({
    id: "course-1", organizationId: "org-A", isPublished: true, title: "Draft course", ...over,
  });

  function mockAcademy(opts: { role: string | null; orgId: string | null; course: Record<string, unknown> | null }) {
    vi.doMock("@/lib/auth/rbac-server", () => ({ getAuthRole: async () => opts.role }));
    vi.doMock("@/lib/academy/request-scope", () => ({
      resolveAcademyScope: async () => (opts.orgId ? { userId: "u1", orgId: opts.orgId } : null),
      canSeeUnpublishedAcademyContent: (r: string | null) => r === "admin" || r === "superadmin",
    }));
    vi.doMock("@/lib/academy/db", () => ({
      getCourseById: async () => opts.course,
      getCourseModules: async () => [],
      getCourseLessons: async () => [],
      getCourseQuizzes: async () => [],
      updateCourse: async () => null,
      getQuizById: async () => ({ id: "quiz-1", courseId: "course-1", title: "Exam", passingScore: 70, maxAttempts: 2, timeLimitMinutes: 30, shuffleQuestions: false }),
      getQuizQuestions: async () => [{ id: "q1", questionText: "Secret question", questionType: "single", options: [], points: 1, orderIndex: 0 }],
    }));
  }

  beforeEach(() => vi.resetModules());

  it("401s an anonymous course read", async () => {
    mockAcademy({ role: null, orgId: null, course: course() });
    const { GET } = await import("@/app/api/academy/courses/[id]/route");
    const res = await GET(new NextRequest("https://app.example/api/academy/courses/course-1"), { params: Promise.resolve({ id: "course-1" }) });
    expect(res.status).toBe(401);
  });

  it("404s a course owned by another organization", async () => {
    mockAcademy({ role: "viewer", orgId: "org-B", course: course() });
    const { GET } = await import("@/app/api/academy/courses/[id]/route");
    const res = await GET(new NextRequest("https://app.example/api/academy/courses/course-1"), { params: Promise.resolve({ id: "course-1" }) });
    expect(res.status).toBe(404);
    expect(JSON.stringify(await res.json())).not.toContain("org-A");
  });

  it("404s an unpublished course for a non-admin member of the owning org", async () => {
    mockAcademy({ role: "viewer", orgId: "org-A", course: course({ isPublished: false }) });
    const { GET } = await import("@/app/api/academy/courses/[id]/route");
    const res = await GET(new NextRequest("https://app.example/api/academy/courses/course-1"), { params: Promise.resolve({ id: "course-1" }) });
    expect(res.status).toBe(404);
  });

  it("serves an unpublished course to an admin of the owning org", async () => {
    mockAcademy({ role: "admin", orgId: "org-A", course: course({ isPublished: false }) });
    const { GET } = await import("@/app/api/academy/courses/[id]/route");
    const res = await GET(new NextRequest("https://app.example/api/academy/courses/course-1"), { params: Promise.resolve({ id: "course-1" }) });
    expect(res.status).toBe(200);
  });

  it("401s an anonymous quiz read and 404s a foreign-tenant quiz", async () => {
    mockAcademy({ role: null, orgId: null, course: course() });
    let mod = await import("@/app/api/academy/quizzes/[id]/route");
    let res = await mod.GET(new NextRequest("https://app.example/api/academy/quizzes/quiz-1"), { params: Promise.resolve({ id: "quiz-1" }) });
    expect(res.status).toBe(401);

    vi.resetModules();
    mockAcademy({ role: "viewer", orgId: "org-B", course: course() });
    mod = await import("@/app/api/academy/quizzes/[id]/route");
    res = await mod.GET(new NextRequest("https://app.example/api/academy/quizzes/quiz-1"), { params: Promise.resolve({ id: "quiz-1" }) });
    expect(res.status).toBe(404);
    expect(JSON.stringify(await res.json())).not.toContain("Secret question");
  });
});

// ── P99-INT-007 — raw SQL identifier interpolation ────────────────────────────
describe("P99-INT-007 — pgvector metadata filter keys are validated identifiers", () => {
  it("accepts plain identifiers and rejects anything that could reach the SQL text", async () => {
    const { isSafeMetadataFilterKey } = await import("@/lib/rag/vector-store-pgvector");
    for (const ok of ["projectId", "source_type", "_internal", "a1"]) {
      expect(isSafeMetadataFilterKey(ok)).toBe(true);
    }
    for (const bad of [
      "project'||''",
      "a' OR '1'='1",
      "a; DROP TABLE x",
      "a b",
      "1abc",
      "",
      "x".repeat(65),
      'a"b',
    ]) {
      expect(isSafeMetadataFilterKey(bad)).toBe(false);
    }
  });
});

// ── P99-INT-010 — bounded page size on the public articles endpoint ───────────
describe("P99-INT-010 — public article listing bounds its page size", () => {
  let captured: Record<string, unknown> | null;

  beforeEach(() => {
    vi.resetModules();
    captured = null;
    vi.doMock("@/lib/articles/db", () => ({
      getPublicArticles: async (f: Record<string, unknown>) => { captured = f; return []; },
    }));
  });

  it("clamps an oversized limit and rejects non-integer input", async () => {
    const { GET } = await import("@/app/api/articles/route");
    await GET(new Request("https://app.example/api/articles?limit=500000&page=2"));
    expect(captured!.limit).toBe(100);
    expect(captured!.page).toBe(2);

    await GET(new Request("https://app.example/api/articles?limit=abc&page=-4"));
    expect(captured!.limit).toBe(20);
    expect(captured!.page).toBe(1);
  });
});

// ── consent identifier contract ───────────────────────────────────────────────
describe("consent identifier contract", () => {
  it("mints unguessable ids and accepts only its own shape", () => {
    const a = newConsentId();
    const b = newConsentId();
    expect(a).not.toBe(b);
    expect(isConsentId(a)).toBe(true);
    for (const bad of [ACCESS_TOKEN_COOKIE, "anon_1700000000000", "c_not-a-uuid", "", null, undefined]) {
      expect(isConsentId(bad as string)).toBe(false);
    }
  });
});
