import { describe, it, expect } from "vitest";
import { resolveRobots } from "next/dist/build/webpack/loaders/metadata/resolve-route-data";
import robots from "@/app/robots";
import { PROTECTED_ROUTE_PREFIXES } from "@/lib/auth/rbac";
import { ACTIVE_LOCALES } from "@/i18n/locales";

/**
 * SPRINT 1C-A - Googlebot may fetch the resources it needs to RENDER this site.
 *
 * THE DEFECT THIS PINS SHUT
 * -------------------------
 * `privateDisallow()` put `Disallow: /_next/` in every crawler group, and the
 * default group's note claimed classic search engines do not need `/_next/`
 * "for text extraction". True of text extraction; false of rendering, which is
 * what Googlebot does. Measured against production on 2026-09-28 the public
 * homepage referenced exactly these, and nothing allowed them:
 *
 *     /_next/static/css/bb5fff2dbde72c72.css
 *     /_next/static/css/85dc6ba0c1dfd510.css
 *     /_next/static/media/<hash>-s.p.woff2      (all three font families)
 *     /_next/static/chunks/webpack-<hash>.js
 *
 * `HEAD /_next/static/css/bb5fff2dbde72c72.css` answered `200 text/css`, so the
 * origin served them and only crawl policy withheld them. Every font is
 * declared by `@font-face` INSIDE those stylesheets - the HTML carries no
 * `<link rel="preload" as="font">` - so a crawler denied `/_next/static/`
 * renders the site with neither layout nor typeface.
 *
 * WHY THIS FILE PARSES THE GENERATED TEXT
 * ---------------------------------------
 * It asserts against the robots.txt BODY that Next.js actually serves, built by
 * the framework's own `resolveRobots` serializer from this route's return value,
 * then re-parsed into groups and evaluated with the Robots Exclusion Protocol's
 * longest-match rule. A source-string grep would pass on a rule Next never
 * emits, or on one emitted into the wrong group; this cannot.
 */

// ---------------------------------------------------------------------------
// The shipped artifact.
// ---------------------------------------------------------------------------

const BODY: string = resolveRobots(robots());

interface Group {
  agents: string[];
  allow: string[];
  disallow: string[];
}

/** Parse a robots.txt body into its User-Agent groups, as a crawler would. */
function parse(body: string): Group[] {
  const groups: Group[] = [];
  let current: Group | null = null;
  let expectingAgents = false;
  for (const raw of body.split(/\r?\n/)) {
    const line = raw.trim();
    if (line === "" || line.startsWith("#")) continue;
    const idx = line.indexOf(":");
    if (idx === -1) continue;
    const field = line.slice(0, idx).trim().toLowerCase();
    const value = line.slice(idx + 1).trim();
    if (field === "user-agent") {
      if (!current || !expectingAgents) {
        current = { agents: [], allow: [], disallow: [] };
        groups.push(current);
        expectingAgents = true;
      }
      current.agents.push(value);
      continue;
    }
    if (!current) continue;
    expectingAgents = false;
    if (field === "allow" && value !== "") current.allow.push(value);
    if (field === "disallow" && value !== "") current.disallow.push(value);
  }
  return groups;
}

const GROUPS = parse(BODY);

function group(agent: string): Group {
  const g = GROUPS.find((x) => x.agents.includes(agent));
  if (!g) throw new Error(`no group for ${agent} in the generated robots.txt`);
  return g;
}

/**
 * The Robots Exclusion Protocol decision, applied to the parsed group: the
 * longest matching directive wins and `Allow` beats `Disallow` on a tie. `$` is
 * the end-of-path anchor. This is the rule that makes `/_next/static/` (14
 * characters) govern its subtree while `/_next/` (7) keeps everything else.
 */
function isAllowed(g: Group, path: string): boolean {
  const match = (pattern: string): number => {
    if (pattern.endsWith("$")) {
      const literal = pattern.slice(0, -1);
      return path === literal ? literal.length : -1;
    }
    return path.startsWith(pattern) ? pattern.length : -1;
  };
  let bestAllow = -1;
  let bestDisallow = -1;
  for (const p of g.allow) bestAllow = Math.max(bestAllow, match(p));
  for (const p of g.disallow) bestDisallow = Math.max(bestDisallow, match(p));
  if (bestDisallow === -1) return true;
  return bestAllow >= bestDisallow;
}

/** The exact resources the measured production homepage references. */
const RENDER_RESOURCES = [
  "/_next/static/css/bb5fff2dbde72c72.css",
  "/_next/static/css/85dc6ba0c1dfd510.css",
  "/_next/static/chunks/webpack-a66eee5f77a4d655.js",
  "/_next/static/chunks/main-app-8721ca6ecfabcadd.js",
  "/_next/static/media/4ff1260a1bda0420-s.p.woff2",
] as const;

/** Groups that carry the private disallow list and therefore need the fix. */
const RENDERING_GROUPS = GROUPS.filter((g) => g.disallow.includes("/_next/"));

/** Groups that are blocked from the whole site by owner policy. */
const BLOCKED_AGENTS = ["AhrefsBot", "SemrushBot", "MJ12bot", "DotBot", "BLEXBot"] as const;

describe("SPRINT 1C-A / the generated robots.txt is a real artifact", () => {
  it("serializes to a robots.txt body with groups, a sitemap and a host", () => {
    expect(BODY).toMatch(/^User-Agent: \*/m);
    expect(BODY).toMatch(/^Sitemap: https:\/\/hermesnovin\.com\/sitemap\.xml$/m);
    expect(BODY).toMatch(/^Host: hermesnovin\.com$/m);
  });

  it("the private surface is still declared - the fix did not empty the file", () => {
    expect(RENDERING_GROUPS.length).toBeGreaterThanOrEqual(16);
    expect(GROUPS.length).toBeGreaterThanOrEqual(22);
  });
});

describe("7 - every group that blocks /_next/ can still fetch /_next/static/", () => {
  it("each such group declares the render-resource allowance", () => {
    for (const g of RENDERING_GROUPS) {
      expect(g.allow, g.agents.join(",")).toContain("/_next/static/");
    }
  });

  it.each(RENDER_RESOURCES)("%s is crawlable by every one of those groups", (resource) => {
    for (const g of RENDERING_GROUPS) {
      expect(isAllowed(g, resource), `${g.agents.join(",")} -> ${resource}`).toBe(true);
    }
  });

  it("Googlebot and the default group specifically may fetch CSS, JS and fonts", () => {
    for (const agent of ["*", "Googlebot", "Bingbot"]) {
      for (const resource of RENDER_RESOURCES) {
        expect(isAllowed(group(agent), resource), `${agent} -> ${resource}`).toBe(true);
      }
    }
  });

  it("Googlebot-Image, which never carried the block, is unchanged", () => {
    const g = group("Googlebot-Image");
    expect(g.disallow).toEqual([]);
    expect(g.allow).toContain("/brand/");
  });

  it("no speculative allowance was added for the image optimizer", () => {
    // No captured public page references `/_next/image`; an allowance with no
    // evidence behind it is exactly what this rule replaces.
    expect(BODY).not.toContain("/_next/image");
  });
});

describe("8 - the private surface is still closed", () => {
  it("the API stays blocked for every group that blocked it before", () => {
    for (const g of RENDERING_GROUPS) {
      expect(isAllowed(g, "/api/academy/courses/abc"), g.agents.join(",")).toBe(false);
      expect(isAllowed(g, "/api/admin/vendors"), g.agents.join(",")).toBe(false);
    }
  });

  it("everything under /_next/ that is NOT static output stays blocked", () => {
    for (const g of RENDERING_GROUPS) {
      for (const path of [
        "/_next/data/build-id/fa.json",
        "/_next/image?url=%2Fbrand%2Fog-default.jpg",
        "/_next/server/app-paths-manifest.json",
        "/_next/",
      ]) {
        expect(isAllowed(g, path), `${g.agents.join(",")} -> ${path}`).toBe(false);
      }
    }
  });

  it("every protected route prefix stays blocked in every locale", () => {
    for (const g of RENDERING_GROUPS) {
      for (const prefix of PROTECTED_ROUTE_PREFIXES) {
        for (const locale of ACTIVE_LOCALES) {
          const root = `/${locale}/${prefix}`;
          expect(isAllowed(g, root), `${g.agents.join(",")} -> ${root}`).toBe(false);
          expect(isAllowed(g, `${root}/anything`), `${g.agents.join(",")} -> ${root}/anything`).toBe(false);
        }
      }
    }
  });

  it("admin and dashboard specifically stay blocked", () => {
    for (const agent of ["*", "Googlebot", "GPTBot"]) {
      for (const path of ["/fa/admin", "/en/admin/seo", "/de/dashboard", "/fa/dashboard/ats/candidates"]) {
        expect(isAllowed(group(agent), path), `${agent} -> ${path}`).toBe(false);
      }
    }
  });

  it("the public estate is still crawlable", () => {
    for (const agent of ["*", "Googlebot"]) {
      for (const path of ["/fa/", "/en/academy", "/de/library/cases", "/fa/candidate/register"]) {
        expect(isAllowed(group(agent), path), `${agent} -> ${path}`).toBe(true);
      }
    }
  });

  it("the allowance changed the decision for /_next/static/ AND NOTHING ELSE", () => {
    // The strongest statement available: reconstruct each group exactly as it
    // was before this sprint (the same group minus the one new Allow) and
    // compare the two decisions across a broad probe set. Any path whose
    // verdict moved must be under /_next/static/. This is what proves the
    // change is minimal rather than a quietly widened policy - and it keeps
    // proving it if someone later adds a different entry to the same list.
    //
    // NOTE, deliberately not "fixed" here: the training tier expresses its
    // scope with `Allow` entries and carries no catch-all `Disallow: /`, so a
    // training crawler was already permitted everything outside the private
    // list. That is pre-existing crawl POLICY, unchanged by this sprint and
    // out of its scope; this assertion pins that it is unchanged.
    const PROBES = [
      "/", "/fa/", "/en/", "/de/",
      "/fa/academy", "/fa/library/vfd", "/fa/services/plc", "/fa/pricing",
      "/fa/articles/modern-scada-architecture-industrial-facilities",
      "/fa/candidate/register", "/brand/og-default.jpg", "/images/x.png",
      "/sitemap.xml", "/robots.txt", "/llms.txt",
      "/api/", "/api/academy/courses/abc",
      "/fa/admin", "/en/dashboard", "/de/compliance", "/fa/documents/1",
      "/_next/", "/_next/data/b/fa.json", "/_next/image?url=x",
      ...RENDER_RESOURCES,
    ];
    for (const g of RENDERING_GROUPS) {
      const before: Group = { ...g, allow: g.allow.filter((a) => a !== "/_next/static/") };
      for (const path of PROBES) {
        const changed = isAllowed(g, path) !== isAllowed(before, path);
        if (changed) {
          expect(path.startsWith("/_next/static/"), `${g.agents.join(",")} -> ${path}`).toBe(true);
          expect(isAllowed(g, path)).toBe(true);
        }
      }
    }
  });

  it("the training tier still reaches its owner-approved surfaces", () => {
    const g = group("GPTBot");
    expect(g.allow).toContain("/fa/library/");
    expect(g.allow).toContain("/fa/services/");
    expect(g.allow).toContain("/fa/academy/");
    expect(isAllowed(g, "/fa/library/vfd")).toBe(true);
    expect(isAllowed(g, "/fa/services/plc")).toBe(true);
    // ...and is still refused the private surface.
    expect(isAllowed(g, "/fa/dashboard")).toBe(false);
    expect(isAllowed(g, "/api/brain")).toBe(false);
  });

  it.each(BLOCKED_AGENTS)("%s is still refused the whole site", (agent) => {
    const g = group(agent);
    expect(g.disallow).toContain("/");
    expect(isAllowed(g, "/fa/")).toBe(false);
    expect(isAllowed(g, "/_next/static/css/bb5fff2dbde72c72.css")).toBe(false);
  });
});
