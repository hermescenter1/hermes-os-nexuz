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
  "@/lib/db/prisma",
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

// ── Academy enrolment + progress tenant predicate ─────────────────────────────
/**
 * A defect of the same family as P99-INT-005/006 that the Phase 99 pass left
 * behind, so it carries no register id yet: the WRITE side of the Academy never
 * got the tenant predicate the READ side received.
 *
 * `POST /api/academy/courses/[id]/enroll` gated on `isPublished` alone and never
 * compared `course.organizationId` with the caller's, while the sibling detail
 * endpoint already did. enrollUser() stamps the CALLER's organizationId onto the
 * row it writes, so a member of org B holding a course id from org A could
 * create a local enrollment pointing at a foreign course; the progress path then
 * read that course's title back out through the issued certificate. The two
 * progress endpoints look their enrollment up by (courseId, userId) only, so
 * they consumed such a row without ever questioning which tenant owned the
 * course. All three now resolve the caller through resolveAcademyScope and
 * answer 404 — never 403 — for a foreign or unknown id.
 */
describe("Academy enrolment and progress endpoints are tenant-scoped", () => {
  const course = (over: Record<string, unknown> = {}) => ({
    id: "course-1", organizationId: "org-A", isPublished: true,
    title: "Org A confidential course", certificateEnabled: true, ...over,
  });

  let enrolled:  Array<Record<string, unknown>>;
  let completed: Array<Record<string, unknown>>;
  let issued:    Array<Record<string, unknown>>;
  let attempted: Array<Record<string, unknown>>;

  function mockAcademy(opts: {
    role: string | null;
    orgId: string | null;
    course: Record<string, unknown> | null;
    enrollment?: Record<string, unknown> | null;
    lesson?: Record<string, unknown> | null;
  }) {
    vi.doMock("@/lib/auth/rbac-server", () => ({ getAuthRole: async () => opts.role }));
    vi.doMock("@/lib/academy/request-scope", () => ({
      resolveAcademyScope: async () => (opts.orgId ? { userId: "u1", orgId: opts.orgId } : null),
      canSeeUnpublishedAcademyContent: (r: string | null) => r === "admin" || r === "superadmin",
    }));
    // `/api/academy/progress` resolves its own scope inline because it also needs
    // the display name for the certificate, so it is driven through jwt + prisma.
    vi.doMock("@/lib/auth/jwt", () => ({
      verifyAccessToken: async () => ({ sub: "u1", name: "User One", role: opts.role }),
    }));
    vi.doMock("@/lib/db/prisma", () => ({
      getPrisma: async () =>
        opts.orgId
          ? { organizationMember: { findFirst: async () => ({ organizationId: opts.orgId }) } }
          : null,
    }));
    vi.doMock("@/lib/academy/db", () => ({
      getCourseById:  async () => opts.course,
      getEnrollment:  async () => opts.enrollment ?? null,
      enrollUser:     async (d: Record<string, unknown>) => { enrolled.push(d); return { id: "enr-1", ...d }; },
      getCourseLessons:  async () => [{ id: "lesson-1", moduleId: "m1", title: "Org A confidential lesson", durationMinutes: 10, orderIndex: 0 }],
      getLessonById:     async () => opts.lesson ?? { id: "lesson-1", courseId: "course-1", organizationId: "org-A", title: "Org A confidential lesson" },
      getCourseQuizzes:  async () => [],
      getLessonProgress: async () => [{ lessonId: "lesson-1", completedAt: new Date(0) }],
      hasPassed:         async () => true,
      getCertificateByEnrollment: async () => null,
      updateEnrollmentProgress:   async () => null,
      markLessonComplete: async (d: Record<string, unknown>) => { completed.push(d); return { id: "prog-1", ...d }; },
      issueCertificate:   async (d: Record<string, unknown>) => { issued.push(d); return { id: "cert-1", ...d }; },
      getQuizById:    async () => ({ id: "quiz-1", courseId: "course-1", title: "Org A exam", passingScore: 70, maxAttempts: 2 }),
      getQuizAttempts: async () => [],
      submitQuizAttempt: async (d: Record<string, unknown>) => {
        attempted.push(d);
        return {
          attempt: { id: "att-1", attemptNumber: 1 }, score: 100, passed: true,
          explanations: [{ questionId: "q1", correct: true, explanation: "Org A answer key rationale" }],
        };
      },
    }));
  }

  // Every request carries the access-token cookie the routes used to resolve
  // their caller with, so these cases exercise the real pre-fix code path — an
  // authenticated org-B member — rather than stopping at the authentication gate.
  const cookie = `${ACCESS_TOKEN_COOKIE}=access.token`;
  const enrollReq = () =>
    new NextRequest("https://app.example/api/academy/courses/course-1/enroll", {
      method: "POST", headers: { cookie },
    });
  const courseProgressReq = () =>
    new NextRequest("https://app.example/api/academy/courses/course-1/progress", { headers: { cookie } });
  const progressReq = () =>
    new NextRequest("https://app.example/api/academy/progress", {
      method:  "POST",
      headers: { "content-type": "application/json", cookie },
      body:    JSON.stringify({ courseId: "course-1", lessonId: "lesson-1" }),
    });
  const attemptReq = (enrollmentId: string) =>
    new NextRequest("https://app.example/api/academy/quizzes/quiz-1/attempt", {
      method:  "POST",
      headers: { "content-type": "application/json", cookie },
      body:    JSON.stringify({ enrollmentId, answers: [{ questionId: "q1", selectedAnswers: [0] }] }),
    });

  beforeEach(() => {
    vi.resetModules();
    enrolled = []; completed = []; issued = []; attempted = [];
  });

  it("401s an anonymous enrolment and writes nothing", async () => {
    mockAcademy({ role: null, orgId: null, course: course() });
    const { POST } = await import("@/app/api/academy/courses/[id]/enroll/route");
    const res = await POST(enrollReq(), { params: Promise.resolve({ id: "course-1" }) });
    expect(res.status).toBe(401);
    expect(enrolled).toHaveLength(0);
  });

  it("404s an enrolment in another organization's course and writes no enrollment row", async () => {
    mockAcademy({ role: "viewer", orgId: "org-B", course: course() });
    const { POST } = await import("@/app/api/academy/courses/[id]/enroll/route");
    const res = await POST(enrollReq(), { params: Promise.resolve({ id: "course-1" }) });
    expect(res.status).toBe(404);
    expect(enrolled).toHaveLength(0);
    const body = JSON.stringify(await res.json());
    expect(body).not.toContain("Org A confidential course");
    expect(body).not.toContain("org-A");
  });

  it("still 404s an unpublished course inside the caller's own organization", async () => {
    mockAcademy({ role: "viewer", orgId: "org-A", course: course({ isPublished: false }) });
    const { POST } = await import("@/app/api/academy/courses/[id]/enroll/route");
    const res = await POST(enrollReq(), { params: Promise.resolve({ id: "course-1" }) });
    expect(res.status).toBe(404);
    expect(enrolled).toHaveLength(0);
  });

  it("enrols a member in a published course owned by their own organization", async () => {
    mockAcademy({ role: "viewer", orgId: "org-A", course: course() });
    const { POST } = await import("@/app/api/academy/courses/[id]/enroll/route");
    const res = await POST(enrollReq(), { params: Promise.resolve({ id: "course-1" }) });
    expect(res.status).toBe(201);
    expect(enrolled).toHaveLength(1);
    expect(enrolled[0]).toMatchObject({ courseId: "course-1", organizationId: "org-A", userId: "u1" });
  });

  it("404s the course progress read for a foreign course even when an enrollment row exists", async () => {
    // The legacy row the unfixed enroll endpoint could produce: org-B enrollment,
    // org-A course. It must no longer unlock org A's lesson and quiz set.
    mockAcademy({
      role: "viewer", orgId: "org-B", course: course(),
      enrollment: { id: "enr-legacy", organizationId: "org-B", courseId: "course-1" },
    });
    const { GET } = await import("@/app/api/academy/courses/[id]/progress/route");
    const res = await GET(courseProgressReq(), { params: Promise.resolve({ id: "course-1" }) });
    expect(res.status).toBe(404);
    expect(JSON.stringify(await res.json())).not.toContain("Org A confidential lesson");
  });

  it("serves the course progress read inside the caller's own organization", async () => {
    mockAcademy({
      role: "viewer", orgId: "org-A", course: course(),
      enrollment: { id: "enr-1", organizationId: "org-A", courseId: "course-1" },
    });
    const { GET } = await import("@/app/api/academy/courses/[id]/progress/route");
    const res = await GET(courseProgressReq(), { params: Promise.resolve({ id: "course-1" }) });
    expect(res.status).toBe(200);
    expect((await res.json()).enrolled).toBe(true);
  });

  it("404s a progress write against a foreign course and issues no certificate", async () => {
    mockAcademy({
      role: "viewer", orgId: "org-B", course: course(),
      enrollment: { id: "enr-legacy", organizationId: "org-B", courseId: "course-1" },
    });
    const { POST } = await import("@/app/api/academy/progress/route");
    const res = await POST(progressReq());
    expect(res.status).toBe(404);
    expect(completed).toHaveLength(0);
    expect(issued).toHaveLength(0);
    expect(JSON.stringify(await res.json())).not.toContain("Org A confidential course");
  });

  it("records progress and issues the certificate inside the caller's own organization", async () => {
    mockAcademy({
      role: "viewer", orgId: "org-A", course: course(),
      enrollment: { id: "enr-1", organizationId: "org-A", courseId: "course-1" },
    });
    const { POST } = await import("@/app/api/academy/progress/route");
    const res = await POST(progressReq());
    expect(res.status).toBe(200);
    expect(completed).toHaveLength(1);
    expect(issued).toHaveLength(1);
    expect(issued[0]).toMatchObject({ organizationId: "org-A", courseTitle: "Org A confidential course" });
  });

  it("404s a quiz attempt against another organization's exam and grades nothing", async () => {
    mockAcademy({
      role: "viewer", orgId: "org-B", course: course(),
      enrollment: { id: "enr-legacy", organizationId: "org-B", courseId: "course-1" },
    });
    const { POST } = await import("@/app/api/academy/quizzes/[id]/attempt/route");
    const res = await POST(attemptReq("enr-legacy"), { params: Promise.resolve({ id: "quiz-1" }) });
    expect(res.status).toBe(404);
    expect(attempted).toHaveLength(0);
    const body = JSON.stringify(await res.json());
    expect(body).not.toContain("Org A answer key rationale");
    expect(body).not.toContain("Org A exam");
  });

  it("refuses a quiz attempt recorded against an enrollment that is not the caller's", async () => {
    mockAcademy({
      role: "viewer", orgId: "org-A", course: course(),
      enrollment: { id: "enr-mine", organizationId: "org-A", courseId: "course-1" },
    });
    const { POST } = await import("@/app/api/academy/quizzes/[id]/attempt/route");
    const res = await POST(attemptReq("enr-someone-else"), { params: Promise.resolve({ id: "quiz-1" }) });
    expect(res.status).toBe(403);
    expect(attempted).toHaveLength(0);
  });

  it("grades a quiz attempt against the caller's own server-derived enrollment", async () => {
    mockAcademy({
      role: "viewer", orgId: "org-A", course: course(),
      enrollment: { id: "enr-mine", organizationId: "org-A", courseId: "course-1" },
    });
    const { POST } = await import("@/app/api/academy/quizzes/[id]/attempt/route");
    const res = await POST(attemptReq("enr-mine"), { params: Promise.resolve({ id: "quiz-1" }) });
    expect(res.status).toBe(200);
    expect(attempted).toHaveLength(1);
    expect(attempted[0]).toMatchObject({ enrollmentId: "enr-mine", organizationId: "org-A" });
    // The completion path still issues the certificate for the caller's own org.
    expect(issued[0]).toMatchObject({ enrollmentId: "enr-mine", courseTitle: "Org A confidential course" });
  });

  it("404s a progress write whose lessonId belongs to a different course", async () => {
    mockAcademy({
      role: "viewer", orgId: "org-A", course: course(),
      enrollment: { id: "enr-1", organizationId: "org-A", courseId: "course-1" },
      lesson: { id: "lesson-1", courseId: "another-course", organizationId: "org-A" },
    });
    const { POST } = await import("@/app/api/academy/progress/route");
    const res = await POST(progressReq());
    expect(res.status).toBe(404);
    expect(completed).toHaveLength(0);
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
