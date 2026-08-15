import { describe, expect, it, beforeAll } from "vitest";
import fs from "node:fs";
import path from "node:path";
import sitemap from "../sitemap";
import { BASE_URL, LOCALES } from "@/lib/seo/config";
import { PROTECTED_ROUTE_PREFIXES, PROTECTED_ROUTE_PUBLIC_CHILDREN } from "@/lib/auth/rbac";

/**
 * DISCOVERY-2A — CASE A and CASE B.
 *
 * A sitemap is a set of PROMISES: every URL in it claims to be a public,
 * routable, indexable page. Three classes of promise were being broken at once:
 *
 *   - `/{locale}/videos/{org}/{slug}` had no matching route at all (404);
 *   - `/{locale}/privacy-center` is registered in `PROTECTED_PATHS`, so an
 *     anonymous crawler receives a 307 to `/auth/login`;
 *   - `/{locale}/careers/{id}` advertised five fixtures from
 *     `@/lib/ats/mock-data` as real vacancies.
 *
 * These tests check the sitemap against the two authorities that can actually
 * refute it — the App Router file tree and the RBAC protected-route registry —
 * rather than against a second hand-written list that could drift the same way.
 */

const APP_ROOT = path.resolve(__dirname, "../[locale]");

/** Locale-relative paths, e.g. "/platform", from every emitted URL. */
let paths: string[] = [];

beforeAll(async () => {
  const entries = await sitemap();
  paths = entries.map((e) => {
    expect(e.url.startsWith(`${BASE_URL}/`), `${e.url} must be absolute on the canonical host`).toBe(true);
    const rest = e.url.slice(BASE_URL.length + 1);
    const slash = rest.indexOf("/");
    return slash === -1 ? "" : rest.slice(slash);
  });
});

/**
 * Is `name` an ORDINARY single-segment dynamic directory — `[id]`, `[slug]`,
 * `[org]` — as opposed to a catch-all?
 *
 * PRE-PR HARDENING (F2). The previous predicate was
 * `d.startsWith("[") && d.endsWith("]")`, which also accepts
 * `[...unmatched]` — the locale-level catch-all that exists precisely to turn
 * every unrecognised URL into a localized 404. Because `[...unmatched]/page.tsx`
 * exists, ANY unknown top-level path was reported routable:
 *
 *     routeExists("/no-such-public-page")  →  true   (wrong)
 *     routeExists("/utter-nonsense")       →  true   (wrong)
 *
 * That made CASE A's central claim — "every sitemap URL resolves to a page" —
 * vacuously true for single-segment paths, so a typo'd or deleted route in the
 * sitemap would not have been caught.
 *
 * A catch-all matches *leftover* segments and answers `notFound()`; it is not
 * evidence that a route family exists. Both spellings are excluded:
 *   `[...slug]`   required catch-all
 *   `[[...slug]]` optional catch-all
 *
 * This corrects the TEST HELPER only. Production routing is untouched — the
 * catch-all is deliberate and stays exactly as it is.
 */
function isOrdinaryDynamicSegment(name: string): boolean {
  if (!name.startsWith("[") || !name.endsWith("]")) return false;
  const inner = name.replace(/^\[+/, "").replace(/\]+$/, "");
  return !inner.startsWith("...");
}

/**
 * Does the App Router implement this locale-relative path?
 *
 * A segment matches a literal directory, or an ORDINARY `[dynamic]` directory at
 * that level. Deliberately walks the real tree: a route that is deleted or
 * renamed makes this fail, which is exactly the regression the phase is closing.
 */
function routeExists(relPath: string): boolean {
  const segments = relPath.split("/").filter(Boolean);
  let dir = APP_ROOT;
  for (const segment of segments) {
    const literal = path.join(dir, segment);
    if (fs.existsSync(literal) && fs.statSync(literal).isDirectory()) {
      dir = literal;
      continue;
    }
    const dynamic = fs.existsSync(dir)
      ? fs.readdirSync(dir).find(isOrdinaryDynamicSegment)
      : undefined;
    if (!dynamic) return false;
    dir = path.join(dir, dynamic);
  }
  return fs.existsSync(path.join(dir, "page.tsx"));
}

/**
 * PRE-PR HARDENING (F2) — controls for the helper itself.
 *
 * Every assertion in CASE A is only as good as `routeExists`. If the helper
 * says "yes" to everything, the suite passes while advertising 404s. These
 * controls run FIRST and pin both directions.
 */
describe("CASE A0 — the routability helper is itself trustworthy", () => {
  it("recognises ordinary dynamic segments and rejects catch-alls", () => {
    expect(isOrdinaryDynamicSegment("[id]")).toBe(true);
    expect(isOrdinaryDynamicSegment("[slug]")).toBe(true);
    expect(isOrdinaryDynamicSegment("[org]")).toBe(true);
    expect(isOrdinaryDynamicSegment("[vendorId]")).toBe(true);
    // Catch-alls are not evidence that a route family exists.
    expect(isOrdinaryDynamicSegment("[...unmatched]")).toBe(false);
    expect(isOrdinaryDynamicSegment("[...slug]")).toBe(false);
    expect(isOrdinaryDynamicSegment("[[...slug]]")).toBe(false);
    // Plain directories are not dynamic segments at all.
    expect(isOrdinaryDynamicSegment("platform")).toBe(false);
    expect(isOrdinaryDynamicSegment("__tests__")).toBe(false);
  });

  it("the locale-level catch-all really is present (the control has a subject)", () => {
    // If `[...unmatched]` were ever removed, the negative controls below would
    // pass for the wrong reason. State the premise instead of assuming it.
    const catchAlls = fs.readdirSync(APP_ROOT).filter((d) => d.startsWith("[..."));
    expect(catchAlls, "the locale catch-all must exist for this control to mean anything")
      .toContain("[...unmatched]");
  });

  it("KNOWN_FAKE_ROUTE — nonexistent paths are rejected, not swallowed", () => {
    // Synthetic names that cannot collide with a real route, at the depths the
    // catch-all used to absorb.
    for (const fake of [
      "/__discovery2a_nonexistent__",
      "/__discovery2a_nonexistent__/child",
      "/library/__discovery2a_nonexistent__/deeper",
      "/videos/__d2a_org__/__d2a_slug__/extra-segment",
    ]) {
      expect(routeExists(fake), `${fake} must NOT be reported routable`).toBe(false);
    }
  });

  it("KNOWN_REAL_ROUTE — genuine static and dynamic families are accepted", () => {
    for (const real of [
      "",                              // the locale homepage
      "/platform",
      "/services/digital-twin",
      "/library",
      "/library/cases",
      "/library/cases/case-abb-acs580-oc",   // [id]
      "/library/vendor/siemens",             // [vendor]
      "/careers/job-001",                    // [jobId]
      "/academy/course/c1",                  // [courseId]
      "/articles/some-slug",                 // [slug]
      "/videos",
      "/videos/hermes-a",                    // [org]
      "/videos/hermes-a/plc-basics",         // [org]/[slug]
    ]) {
      expect(routeExists(real), `${real || "/"} must be reported routable`).toBe(true);
    }
  });

  it("the OLD helper would have accepted a fake path — the fix is load-bearing", () => {
    // Reproduces the defective predicate verbatim so the regression cannot be
    // reintroduced silently: if someone relaxes `isOrdinaryDynamicSegment` back
    // to "starts with [ and ends with ]", this test's premise and the negative
    // control above disagree and CASE A0 fails.
    const oldPredicate = (d: string) => d.startsWith("[") && d.endsWith("]");
    const oldRouteExists = (relPath: string): boolean => {
      const segments = relPath.split("/").filter(Boolean);
      let dir = APP_ROOT;
      for (const segment of segments) {
        const literal = path.join(dir, segment);
        if (fs.existsSync(literal) && fs.statSync(literal).isDirectory()) {
          dir = literal;
          continue;
        }
        const dynamic = fs.existsSync(dir)
          ? fs.readdirSync(dir).find(oldPredicate)
          : undefined;
        if (!dynamic) return false;
        dir = path.join(dir, dynamic);
      }
      return fs.existsSync(path.join(dir, "page.tsx"));
    };

    const fake = "/__discovery2a_nonexistent__";
    expect(oldRouteExists(fake), "the old helper's false positive").toBe(true);
    expect(routeExists(fake), "the corrected helper blocks it").toBe(false);
  });
});

describe("CASE A — every sitemap URL is a real public route family", () => {
  it("the sitemap is not empty (so the assertions below mean something)", () => {
    expect(paths.length).toBeGreaterThan(100);
  });

  it("every URL carries an active locale prefix", async () => {
    const entries = await sitemap();
    for (const e of entries) {
      const locale = e.url.slice(BASE_URL.length + 1).split("/")[0];
      expect(LOCALES as readonly string[]).toContain(locale);
    }
  });

  it("every URL resolves to a page.tsx in the App Router tree", () => {
    const unroutable = [...new Set(paths)].filter((p) => !routeExists(p));
    expect(unroutable, `these sitemap paths have no route: ${unroutable.join(", ")}`).toEqual([]);
  });

  it("no URL carries a query string or a fragment", () => {
    // A canonical URL must be addressable on its own. `/videos/{slug}?org=` was
    // the shape this rules out for good.
    const dirty = paths.filter((p) => p.includes("?") || p.includes("#"));
    expect(dirty).toEqual([]);
  });

  it("the evidence corpus is present: 14 engineering cases and 7 vendor pages", async () => {
    const { CASES, CASE_CONTENT_LOCALES } = await import("@/lib/industrial/cases");
    const { VENDORS } = await import("@/lib/industrial/vendors");

    const casePaths = paths.filter((p) => p.startsWith("/library/cases/"));
    const vendorPaths = paths.filter((p) => p.startsWith("/library/vendor/"));

    // Cases are en+fa only — `EngineeringCase` has no German body, so /de is not
    // a German representation and is deliberately not advertised.
    expect(CASES).toHaveLength(14);
    expect(casePaths).toHaveLength(CASES.length * CASE_CONTENT_LOCALES.length);

    // Vendor pages render entirely from the fa/en/de catalogs, so all three are
    // genuine representations.
    expect(VENDORS).toHaveLength(7);
    expect(vendorPaths).toHaveLength(VENDORS.length * LOCALES.length);
  });

  it("the empty video hub root is no longer advertised", () => {
    // `/videos` cannot render a library without an organization, so listing it
    // advertised a permanent soft-404.
    expect(paths.filter((p) => p === "/videos")).toEqual([]);
  });
});

describe("CASE B — no protected route can enter the sitemap", () => {
  it("no URL begins with a protected prefix", () => {
    const publicChildren = PROTECTED_ROUTE_PUBLIC_CHILDREN.map((c) => `/${c}`);
    const leaked: string[] = [];
    for (const p of [...new Set(paths)]) {
      if (publicChildren.some((c) => p === c || p.startsWith(`${c}/`))) continue;
      for (const prefix of PROTECTED_ROUTE_PREFIXES) {
        if (p === `/${prefix}` || p.startsWith(`/${prefix}/`)) leaked.push(p);
      }
    }
    expect(leaked, `authenticated URLs leaked into the sitemap: ${leaked.join(", ")}`).toEqual([]);
  });

  it("privacy-center specifically is gone — it is in PROTECTED_PATHS", async () => {
    const { isProtectedPath } = await import("@/lib/auth/rbac");
    // The premise: it really is protected. If that ever stops being true the
    // assertion below becomes meaningless, so it is stated rather than assumed.
    expect(isProtectedPath("/fa/privacy-center")).toBe(true);
    expect(paths.filter((p) => p.startsWith("/privacy-center"))).toEqual([]);
  });

  it("the well-known private workspaces are absent", () => {
    for (const prefix of ["/dashboard", "/admin", "/crm", "/erp", "/documents", "/cmms", "/assets"]) {
      expect(paths.filter((p) => p.startsWith(prefix))).toEqual([]);
    }
  });
});
