import { describe, it, expect } from "vitest";
import { readFileSync, existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

/**
 * PHASE 99.6 — release-candidate reconciliation gates.
 *
 * Phases 95-99 were developed as a stacked branch chain that never contained the
 * Phase 99.5 STOP-SHIP hotfix merged directly into main. Reconciling the two
 * creates a specific class of regression: an older stacked implementation of a
 * file silently replacing the newer hardened one. These are static gates over
 * the integrated source that fail if any of those regressions reappear.
 */

const SRC = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");
const read = (rel: string) => readFileSync(path.join(SRC, rel), "utf8");

describe("phase 99.6 — Phase 99.5 hotfix survives reconciliation", () => {
  it("consent is keyed on the dedicated consent id, never the auth session cookie", () => {
    const route = read("app/api/compliance/cookie-consent/route.ts");
    // The subject identifier must come from CONSENT_ID_COOKIE only.
    expect(route).toContain("CONSENT_ID_COOKIE");
    // SESSION_COOKIE must not be imported or written by the consent surface.
    expect(/\bSESSION_COOKIE\b/.test(route)).toBe(false);
    expect(/hermes_session/.test(route)).toBe(false);
  });

  it("the consent subject identifier is never taken from the request body", () => {
    const route = read("app/api/compliance/cookie-consent/route.ts");
    // `sessionId` may be mentioned in prose, but must never be read off the body.
    expect(/body\s*\.\s*sessionId/.test(route)).toBe(false);
    expect(/read\.value\s*\.\s*sessionId/.test(route)).toBe(false);
  });

  it("the anonymous consent write is rate limited and reads a bounded body", () => {
    const route = read("app/api/compliance/cookie-consent/route.ts");
    expect(route).toContain("checkRateLimit");
    expect(route).toContain("readBoundedJson");
    expect(route).toContain("SMALL_JSON_BODY_BYTES");
  });

  it("the candidate profile update keeps an explicit allow-list", () => {
    const route = read("app/api/candidate/profile/route.ts");
    expect(route).toContain("EDITABLE");
    // Identity-bearing / relation fields must not be assignable.
    for (const forbidden of ["email", "userId"]) {
      expect(new RegExp(`EDITABLE[\\s\\S]{0,400}["']${forbidden}["']`).test(route)).toBe(false);
    }
  });

  it("industrial read paths still constrain an explicit siteId to the allow-list", () => {
    for (const rel of ["lib/industrial/assets.ts", "lib/industrial/gateways.ts", "lib/industrial/connectors.ts"]) {
      expect(read(rel), rel).toContain("allowedSiteIds");
    }
  });

  it("industrial create handlers authorize the client-supplied target site (P99-INT-018)", () => {
    for (const rel of [
      "app/api/industrial/assets/route.ts",
      "app/api/industrial/gateways/route.ts",
      "app/api/industrial/connectors/route.ts",
    ]) {
      const route = read(rel);
      expect(route, rel).toContain("requireSiteActor");
      expect(route, rel).toContain("requireSitePermission");
    }
  });

  it("the unconditional GoogleAnalytics component stays deleted", () => {
    expect(existsSync(path.join(SRC, "components/analytics/GoogleAnalytics.tsx"))).toBe(false);
  });
});

describe("phase 99.6 — P99-INT-020 compliance evidence IP is not client-controlled", () => {
  const EVIDENCE_ROUTES = [
    "app/api/compliance/consents/route.ts",
    "app/api/compliance/data-deletion/route.ts",
    "app/api/compliance/data-export/route.ts",
    "app/api/compliance/privacy-requests/route.ts",
  ];

  it("derives the recorded IP from resolveClientIp, never from X-Forwarded-For", () => {
    for (const rel of EVIDENCE_ROUTES) {
      const route = read(rel);
      expect(route, rel).toContain("resolveClientIp");
      // Prose may name the header; what must not exist is a read of it.
      expect(
        /headers\s*\.\s*get\s*\(\s*["'`]x-forwarded-for["'`]/i.test(route),
        `${rel} still reads X-Forwarded-For`,
      ).toBe(false);
    }
  });

  it("stores an unresolvable IP as absent rather than as the literal \"unknown\"", () => {
    for (const rel of EVIDENCE_ROUTES) {
      expect(read(rel), rel).toContain('=== "unknown" ? undefined');
    }
  });
});

describe("phase 99.6 — rate-limit key derivation is un-spoofable app-wide", () => {
  it("resolveClientIp trusts X-Real-IP only", () => {
    const guards = read("lib/security/request-guards.ts");
    const body = guards.slice(guards.indexOf("export function resolveClientIp"));
    const fn = body.slice(0, body.indexOf("\n}") + 2);
    expect(fn).toContain("x-real-ip");
    expect(/headers\s*\.\s*get\s*\(\s*["'`](x-forwarded-for|cf-connecting-ip)["'`]/i.test(fn)).toBe(false);
  });
});
