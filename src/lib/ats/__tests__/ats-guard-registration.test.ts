/**
 * ATS-S0/S1 — the three ATS guards registered in the Phase 99 route-security
 * registry are real, on both halves.
 *
 * A GUARD_TOKENS entry is a CLAIM: it tells the route classifier "a handler
 * that calls this name is authorized at this scope". Registering any name at
 * all would silence the classifier, so — following the precedent set by
 * `phase103-voice-guard-recognition.test.ts` and
 * `phase109cui2r8-worker-registration.test.ts` — each claim is locked twice:
 *
 *   Half one — the routes really delegate to the guard, BEFORE doing any work.
 *   Half two — the guard really performs the checks its entry vouches for.
 *
 * It also locks the removal of the five stale `/api/ats/*` public-surface
 * declarations. A declaration short-circuits classification before evidence is
 * read, so a declaration that returns would make an authenticated route read
 * PUBLIC_READ again without any test noticing.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const REPO = process.cwd();
const read = (p: string) => readFileSync(join(REPO, p), "utf8");
/** Code only — a comment that NAMES a check is not the check. */
const code = (p: string) =>
  read(p)
    .replace(/\/\*[\s\S]*?\*\//g, " ")
    .replace(/(^|[^:])\/\/.*$/gm, "$1");

const registry = read("scripts/security/phase99/route-inventory.mjs");
const publicSurface = code("scripts/security/phase99/public-surface.mjs");

/** Assert `guardCall` appears in the handler before any of `workMarkers`. */
function guardsFirst(file: string, method: string, guardCall: string, workMarkers: RegExp) {
  const src = code(file);
  const start = src.search(new RegExp(`export async function ${method}\\b`));
  expect(start, `${file} exports ${method}`).toBeGreaterThan(-1);
  const rest = src.slice(start + 1);
  const next = rest.search(/export async function (GET|POST|PATCH|PUT|DELETE)\b/);
  const handler = src.slice(start, next === -1 ? undefined : start + 1 + next);
  const guardAt = handler.indexOf(guardCall);
  const workAt = handler.search(workMarkers);
  expect(guardAt, `${file} ${method} calls ${guardCall}`).toBeGreaterThan(-1);
  expect(workAt, `${file} ${method} does work`).toBeGreaterThan(-1);
  expect(workAt, `${file} ${method}: ${guardCall} must precede the work`).toBeGreaterThan(guardAt);
}

describe("requireAtsActor — registered at TENANT scope", () => {
  it("the registry declares it at tenant scope", () => {
    expect(registry).toContain('{ token: "requireAtsActor", scope: "tenant" }');
  });

  it("half one — every S1 route calls it before touching the body, the store or a service", () => {
    const WORK = /req\.json\(|getPrisma\(|recordGateDecision\(|transitionApplication\(|applyRoleProfileToJob\(|listJobCriteria\(/;
    guardsFirst("src/app/api/ats/applications/[id]/decision/route.ts", "POST", "requireAtsActor(req", WORK);
    guardsFirst("src/app/api/ats/applications/[id]/review/route.ts", "GET", "requireAtsActor(req", WORK);
    guardsFirst("src/app/api/ats/applications/[id]/status/route.ts", "PATCH", "requireAtsActor(req", WORK);
    guardsFirst("src/app/api/ats/jobs/[id]/criteria/route.ts", "GET", "requireAtsActor(req", WORK);
    guardsFirst("src/app/api/ats/jobs/[id]/criteria/route.ts", "POST", "requireAtsActor(req", WORK);
  });

  it("half one — the organization every service receives is the ACTOR's, never a request value", () => {
    for (const f of [
      "src/app/api/ats/applications/[id]/decision/route.ts",
      "src/app/api/ats/applications/[id]/status/route.ts",
      "src/app/api/ats/jobs/[id]/criteria/route.ts",
    ]) {
      const src = code(f);
      expect(src, f).toMatch(/organizationId:\s*actor\.ctx\.orgId/);
      expect(src, f).not.toMatch(/organizationId:\s*(parsed|body|raw)\./);
    }
  });

  it("half two — it resolves the organization server-side and checks the capability against the PROVEN role", () => {
    const src = code("src/lib/ats/rbac.ts");
    expect(src).toContain('from "@/lib/billing/context"');
    const fn = src.slice(src.indexOf("export async function requireAtsActor"));
    // Organization first (401/409/428/503 come from here), capability second.
    const orgAt = fn.indexOf("await resolveOrgContext(req)");
    const capAt = fn.indexOf("atsCan(org.ctx.role, capability)");
    expect(orgAt).toBeGreaterThan(-1);
    expect(capAt).toBeGreaterThan(orgAt);
    expect(fn).toMatch(/if \(!org\.ok\) return \{ ok: false, response: atsRefusal\(org\.reason\) \}/);
    expect(fn).toContain('atsRefusal("FORBIDDEN")');
    // The context it hands back is the resolver's, not the request's.
    expect(fn).toMatch(/orgId:\s*org\.ctx\.orgId/);
    expect(fn).not.toMatch(/req\.(headers|nextUrl|json|url)/);
  });
});

describe("authorizeReviewWorker — registered at PLATFORM scope", () => {
  const guard = code("src/lib/ats/review/worker-auth.ts");

  it("the registry declares it at platform scope", () => {
    expect(registry).toContain('{ token: "authorizeReviewWorker", scope: "platform" }');
  });

  it("half one — the deliver route calls it before running a pass", () => {
    guardsFirst("src/app/api/ats/review/deliver/route.ts", "POST", "authorizeReviewWorker(req)", /runAiReviewPass\(/);
  });

  it("half two — constant-time comparison against an ENV-ONLY secret", () => {
    expect(guard).toContain("timingSafeEqual");
    expect(guard).toContain("process.env[ENV.REVIEW_WORKER_TOKEN]");
    expect(guard).toMatch(/if \(!expected\) return false/);
    expect(guard).not.toMatch(/req\.headers\.get\(["']x-/i);
  });

  it("half two — the fallback is an ADMIN session, never open access", () => {
    expect(guard).toContain("getCurrentUser");
    expect(guard).toContain('can(user.role, "admin")');
    expect(guard).toMatch(/status:\s*401/);
    expect(guard).toMatch(/status:\s*403/);
  });
});

describe("requireRecruitmentReader — registered at USER scope, deliberately not tenant", () => {
  const guard = code("src/lib/ats/management-guard.ts");

  it("the registry declares it at user scope — the inventory must not overstate it", () => {
    expect(registry).toContain('{ token: "requireRecruitmentReader", scope: "user" }');
    expect(registry).not.toContain('{ token: "requireRecruitmentReader", scope: "tenant" }');
  });

  it("half one — the four S0 routes call it before reading the fixture", () => {
    for (const f of [
      "src/app/api/ats/overview/route.ts",
      "src/app/api/ats/analytics/route.ts",
      "src/app/api/ats/pipeline/route.ts",
      "src/app/api/ats/candidates/route.ts",
    ]) {
      guardsFirst(f, "GET", "requireRecruitmentReader(req)", /JOBS|CANDIDATES|searchParams/);
    }
  });

  it("half two — authenticated identity, then the authoring capability; nothing about a tenant", () => {
    expect(guard).toContain("await getAuthRole(req)");
    expect(guard).toContain('can(role, "authoring")');
    expect(guard).toContain('recruitmentRefusal("AUTHENTICATION_REQUIRED")');
    expect(guard).toContain('recruitmentRefusal("FORBIDDEN")');
    // If this ever starts resolving an organization, re-register it at tenant scope.
    expect(guard).not.toContain("resolveOrgContext(");
  });
});

describe("the stale ATS public-surface declarations stay removed", () => {
  it.each(["/api/ats/analytics", "/api/ats/candidates", "/api/ats/jobs", "/api/ats/overview", "/api/ats/pipeline"])(
    "%s is not declared public",
    (path) => {
      expect(publicSurface).not.toContain(`path: "${path}"`);
    },
  );

  it("the genuinely public careers surface is still declared", () => {
    expect(publicSurface).toContain('path: "/api/careers/apply"');
    expect(publicSurface).toContain('path: "/api/careers/jobs"');
  });
});
