/**
 * PHASE 99 — static security invariants over the committed source tree.
 *
 * These assertions are the standing guard on properties that are true today and
 * must stay true: no user-controlled raw SQL, no unreviewed server-side outbound
 * destination, no unsanitised raw-HTML sink, no upload path without size/type/
 * authorization controls, no state-changing GET, and no route in the API surface
 * whose authorization posture cannot be derived from its own source.
 *
 * They also lock in the remediations whose defect is a code SHAPE rather than a
 * response value (findings P99-INT-008, -009, -012, -013), so a future edit that
 * reintroduces the shape fails here rather than in production.
 *
 * Pure filesystem reads. No database, no network, no Docker.
 */
import { describe, it, expect, vi } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

// PHASE 99.7 — these invariants scan ~1850 source files. Their cost is real
// work, not a hang, and it varies several-fold with machine load: under a
// concurrent Docker build the same passing assertions intermittently blew
// vitest's 5s default and were reported as timeouts. A red result that says
// nothing about the invariant is worse than a slow one, so the budget is
// explicit. No assertion is relaxed — a genuinely violated invariant still
// fails, just not on a stopwatch that was never part of the contract.
vi.setConfig({ testTimeout: 60_000, hookTimeout: 60_000 });

import {
  rawSqlInventory,
  outboundSinkInventory,
  userControlledSinkScan,
  htmlSinkInventory,
  uploadSurfaceInventory,
  cookieSecurityReview,
  infrastructureReview,
} from "../../../../scripts/security/phase99/static-invariants.mjs";
import { buildRouteInventory, summarizeInventory, stripComments } from "../../../../scripts/security/phase99/route-inventory.mjs";

const ROOT = resolve(__dirname, "../../../..");
const read = (p: string) => readFileSync(resolve(ROOT, p), "utf8");
/**
 * Read a source file with comments removed. These assertions are about what the
 * CODE does; a comment explaining why a header is untrusted must not read as the
 * code trusting it. (Seven routes document the X-Forwarded-For decision in prose
 * precisely because Phase 93 fixed it.)
 */
const readCode = (p: string): string => stripComments(read(p));

describe("PHASE 99 — SQL injection", () => {
  it("every raw SQL site is a literal, a bound-parameter template or a constant identifier", () => {
    const inv = rawSqlInventory(ROOT);
    expect(inv.items.length).toBeGreaterThan(0); // the scanner must actually find the sites
    expect(inv.unsafe.map((i: { file: string; line: number }) => `${i.file}:${i.line}`)).toEqual([]);
    expect(inv.counters.UNSAFE_USER_CONTROLLED_RAW_SQL).toBe(0);
    // A reviewed site that no longer exists (or whose interpolation changed)
    // must invalidate its review rather than keep vouching for something else.
    expect(inv.staleReviews.map((a: { file: string }) => a.file)).toEqual([]);
  });
});

describe("PHASE 99 — SSRF", () => {
  it("no API route lets a request decide an outbound destination", () => {
    const scan = userControlledSinkScan(ROOT);
    expect(scan.hits).toEqual([]);
    expect(scan.counters.SSRF_USER_CONTROLLED_SINKS).toBe(0);
  });

  it("every server-side outbound sink is classified, and the review allowlist is not stale", () => {
    const inv = outboundSinkInventory(ROOT);
    expect(inv.needsReview.map((i: { file: string; line: number }) => `${i.file}:${i.line}`)).toEqual([]);
    expect(inv.stale.map((a: { file: string }) => a.file)).toEqual([]);
  });
});

describe("PHASE 99 — XSS", () => {
  it("no raw-HTML sink receives anything but serialized JSON or a static literal", () => {
    const inv = htmlSinkInventory(ROOT);
    expect(inv.unsanitised.map((i: { file: string; line: number }) => `${i.file}:${i.line}`)).toEqual([]);
    expect(inv.counters.UNSANITIZED_RAW_HTML_SINK).toBe(0);
  });
});

describe("PHASE 99 — file upload", () => {
  it("every multipart route bounds size, checks type, controls the filename and is authorized", () => {
    const inv = uploadSurfaceInventory(ROOT);
    expect(inv.items.length).toBeGreaterThan(0);
    expect(inv.failures).toEqual([]);
  });
});

describe("PHASE 99 — CSRF contract", () => {
  it("authentication cookies are httpOnly, Secure in production and SameSite Lax or stricter", () => {
    const review = cookieSecurityReview(ROOT);
    expect(review.findings).toEqual([]);
    for (const c of review.cookies) {
      expect(["lax", "strict"]).toContain(c.sameSite);
      expect(c.httpOnly).toBe(true);
      expect(c.secure).toBe(true);
    }
  });

  it("no GET handler mutates state", () => {
    // The SameSite contract only holds while GET is safe: a cross-site GET does
    // carry a Lax cookie, so a mutating GET would be directly forgeable.
    const routes = buildRouteInventory({ repoRoot: ROOT });
    const offenders = routes
      .filter((r: { method: string; mutates: boolean }) => r.method === "GET" && r.mutates)
      .map((r: { apiPath: string }) => r.apiPath);
    expect(offenders).toEqual([]);
  });
});

describe("PHASE 99 — route security inventory", () => {
  it("every handler's authorization posture is derivable; UNKNOWN is not permitted", () => {
    const routes = buildRouteInventory({ repoRoot: ROOT });
    const summary = summarizeInventory(routes);
    const unknown = routes
      .filter((r: { classification: string }) => r.classification === "UNKNOWN")
      .map((r: { method: string; apiPath: string }) => `${r.method} ${r.apiPath}`);
    expect(unknown).toEqual([]);
    expect(summary.unknown).toBe(0);
    expect(summary.handlers).toBeGreaterThan(400);
  });

  it("every declared webhook authenticates its sender", () => {
    const routes = buildRouteInventory({ repoRoot: ROOT });
    const webhooks = routes.filter((r: { classification: string }) => r.classification === "WEBHOOK");
    expect(webhooks.length).toBeGreaterThan(0);
    for (const w of webhooks) expect(w.senderAuthenticated).toBe(true);
  });
});

describe("PHASE 99 — infrastructure", () => {
  it("container, ports, headers and CORS meet the Phase 99 baseline", () => {
    const review = infrastructureReview(ROOT);
    expect(review.findings).toEqual([]);
    expect(review.counters.ROOT_APP_CONTAINER).toBe(0);
    expect(review.counters.UNNECESSARY_PUBLIC_PORT).toBe(0);
    expect(review.counters.CORS_WILDCARD_WITH_CREDENTIALS).toBe(0);
    expect(review.counters.MISSING_CRITICAL_SECURITY_HEADERS).toBe(0);
    expect(review.counters.SECRET_IN_IMAGE_LAYER).toBe(0);
  });
});

// ── Remediation shape locks ───────────────────────────────────────────────────

describe("P99-INT-008 — rate-limit keys never come from a client-controlled header", () => {
  it("the public lead endpoint keys on resolveClientIp, not X-Forwarded-For", () => {
    const src = readCode("src/app/api/sales/leads/route.ts");
    expect(src).toContain("resolveClientIp(req)");
    expect(src).not.toMatch(/headers\.get\(\s*["']x-forwarded-for["']\s*\)/i);
  });

  it("no rate-limited route reads X-Forwarded-For in code", () => {
    const routes = buildRouteInventory({ repoRoot: ROOT });
    const offenders: string[] = [];
    for (const file of new Set(routes.map((r: { file: string }) => r.file))) {
      const src = readCode(file as string);
      if (!/checkRateLimit|checkAndIncrRateLimit|_rl\b/.test(src)) continue;
      if (/x-forwarded-for/i.test(src)) offenders.push(file as string);
    }
    expect(offenders).toEqual([]);
  });
});

describe("P99-INT-009 / P99-INT-012 — anonymous write endpoints carry abuse controls", () => {
  const ANONYMOUS_WRITE_ROUTES = [
    "src/app/api/vendors/apply/route.ts",
    "src/app/api/industrial-brain/analyze/route.ts",
    "src/app/api/careers/apply/route.ts",
    "src/app/api/copilot/demo/route.ts",
  ];

  it("each bounds the body, checks the media type and applies a rate limit", () => {
    for (const file of ANONYMOUS_WRITE_ROUTES) {
      const src = read(file);
      expect(src, `${file}: bounded body`).toContain("readBoundedTextBody");
      expect(src, `${file}: media type`).toContain("isJsonContentType");
      expect(src, `${file}: rate limit`).toContain("checkRateLimit");
    }
  });

  it("no anonymous application endpoint persists the authentication cookie", () => {
    for (const file of ["src/app/api/vendors/apply/route.ts", "src/app/api/careers/apply/route.ts"]) {
      expect(readCode(file), `${file}: must not read the session cookie`).not.toContain("hermes_session");
      expect(readCode(file), `${file}: must not read the session cookie`).not.toContain("SESSION_COOKIE");
    }
  });
});

describe("P99-INT-013 — certificate verification honours expiry", () => {
  it("validity is derived from expiresAt rather than hard-coded", () => {
    const src = read("src/app/api/academy/certificates/[id]/route.ts");
    expect(src).not.toMatch(/valid:\s*true\s*,?\s*\n?\s*\}\);/);
    expect(src).toContain("cert.expiresAt");
    expect(src).toContain("Date.now()");
  });
});

describe("P99-INT-001 / P99-INT-002 — consent never touches the authentication session", () => {
  it("the consent route neither reads nor writes the session cookie", () => {
    const src = read("src/app/api/compliance/cookie-consent/route.ts");
    expect(src).not.toContain("hermes_session");
    expect(src).not.toContain("SESSION_COOKIE");
    expect(src).toContain("CONSENT_ID_COOKIE");
  });

  it("the consent subject identifier never reaches a log statement", () => {
    const src = read("src/lib/compliance/db.ts");
    expect(src).not.toMatch(/console\.\w+\([^)]*sessionId/);
  });
});
