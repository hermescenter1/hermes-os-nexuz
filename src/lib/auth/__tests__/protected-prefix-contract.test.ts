import { describe, expect, it } from "vitest";
import {
  PROTECTED_PATHS,
  PROTECTED_ROUTE_PREFIXES,
  PROTECTED_ROUTE_PUBLIC_CHILDREN,
  isProtectedPath,
} from "../rbac";
import { ACTIVE_LOCALES } from "@/i18n/locales";

/**
 * DISCOVERY-2A — the coupling that makes `robots.ts` and the sitemap guard safe.
 *
 * `PROTECTED_ROUTE_PREFIXES` restates, as plain strings, the same route literals
 * that are compiled into `PROTECTED_PATHS`. Crawl policy and the sitemap guard
 * both read the string form; the middleware reads the compiled form. If the two
 * drift, `robots.txt` starts advertising an authenticated workspace again —
 * which is exactly the defect this phase closed, where robots knew about six
 * prefixes and the middleware protected twenty-three.
 *
 * Deriving `PROTECTED_PATHS` from the array would have rewritten the regexes
 * gating every authenticated request in the product, to fix an indexing bug.
 * That trade is refused; this test buys the same guarantee for free, in BOTH
 * directions.
 */

describe("every declared prefix really is protected", () => {
  it.each(PROTECTED_ROUTE_PREFIXES)("/%s is matched by PROTECTED_PATHS in every locale", (prefix) => {
    for (const locale of ACTIVE_LOCALES) {
      expect(isProtectedPath(`/${locale}/${prefix}`), `/${locale}/${prefix}`).toBe(true);
      expect(isProtectedPath(`/${locale}/${prefix}/`), `/${locale}/${prefix}/`).toBe(true);
      expect(isProtectedPath(`/${locale}/${prefix}/anything`)).toBe(true);
    }
  });
});

/**
 * The route expression a pattern was compiled from, expanded across any
 * alternation.
 *
 * `localePathPattern(route)` produces `^/[a-z]{2}/(?:<route>)(?=/|$)…`, so the
 * route literals are recoverable from the source. `articles/(a|b|c)` expands to
 * three routes; `dashboard/billing` stays one.
 */
function routesOf(pattern: RegExp): string[] {
  const group = /\(\?:(.+?)\)\(\?=/.exec(pattern.source);
  if (!group) throw new Error(`unrecognised protected pattern: ${pattern.source}`);
  const route = group[1].replace(/\\\//g, "/");
  const alternation = /^(.*?)\(([^)]+)\)$/.exec(route);
  if (!alternation) return [route];
  return alternation[2].split("|").map((leaf) => `${alternation[1]}${leaf}`);
}

describe("every protected pattern is covered by a declared prefix", () => {
  it("no pattern protects a route family the prefix list does not name", () => {
    // A new protected matcher that nobody added to the prefix list would leave
    // its route family crawlable. This is the direction that actually fails
    // closed: it proves the list is COMPLETE, not merely non-empty.
    //
    // Coverage is SUBSUMPTION, not equality: `dashboard/billing` is protected by
    // a pattern of its own only to express a stricter ROLE requirement, and every
    // path it matches already lies under the declared `dashboard` prefix. A crawl
    // rule for `dashboard` therefore covers it, and listing it separately would
    // add nothing.
    const uncovered: string[] = [];
    for (const pattern of PROTECTED_PATHS) {
      for (const route of routesOf(pattern)) {
        const covered = PROTECTED_ROUTE_PREFIXES.some(
          (prefix) => route === prefix || route.startsWith(`${prefix}/`),
        );
        if (!covered) uncovered.push(route);
      }
    }
    expect(uncovered, "add these route families to PROTECTED_ROUTE_PREFIXES").toEqual([]);
  });

  it("no declared prefix is dead — each one comes from a real pattern", () => {
    // The other direction: a prefix nobody protects would silently block a
    // public route in robots.txt.
    const allRoutes = PROTECTED_PATHS.flatMap(routesOf);
    const orphans = PROTECTED_ROUTE_PREFIXES.filter(
      (prefix) => !allRoutes.some((r) => r === prefix || r.startsWith(`${prefix}/`)),
    );
    expect(orphans, "these prefixes protect nothing").toEqual([]);
  });

  it("the counts are consistent — 23 patterns, 30 prefixes", () => {
    // The prefix list is LONGER on purpose: two patterns are regex alternations
    // covering six and six route families respectively, and three
    // `dashboard/*` patterns exist only to express a stricter ROLE requirement,
    // not a wider path, so they collapse into `dashboard`.
    expect(PROTECTED_PATHS.length).toBe(23);
    expect(PROTECTED_ROUTE_PREFIXES.length).toBe(30);
  });
});

describe("declared public children stay public", () => {
  it.each(PROTECTED_ROUTE_PUBLIC_CHILDREN)("/%s is NOT protected", (child) => {
    for (const locale of ACTIVE_LOCALES) {
      expect(isProtectedPath(`/${locale}/${child}`), `/${locale}/${child}`).toBe(false);
    }
  });

  it("each public child sits under a declared protected prefix", () => {
    // A public child that belongs to no protected parent would be a stale entry
    // silently re-allowing something in robots.txt.
    for (const child of PROTECTED_ROUTE_PUBLIC_CHILDREN) {
      const parent = child.split("/")[0];
      expect(PROTECTED_ROUTE_PREFIXES).toContain(parent);
    }
  });
});

describe("no prefix accidentally captures a public sibling", () => {
  // These are the collisions that make a naive `Disallow: /fa/vendor` unsafe.
  const PUBLIC_SIBLINGS = [
    "vendors",
    "vendors/apply",
    "articles",
    "articles/editors-picks",
    "articles/latest",
    "articles/trending",
    "videos",
    "library",
    "library/cases",
    "academy",
    "services",
    "careers",
    "about",
    "contact",
    "pricing",
    "demo",
    "brain",
    "industrial-brain",
    "copilot",
    "platform",
    "architecture",
  ] as const;

  it.each(PUBLIC_SIBLINGS)("/%s stays public in every locale", (route) => {
    for (const locale of ACTIVE_LOCALES) {
      expect(isProtectedPath(`/${locale}/${route}`), `/${locale}/${route}`).toBe(false);
    }
  });
});
