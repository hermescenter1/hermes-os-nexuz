import { describe, it, expect } from "vitest";
import robots from "@/app/robots";
import { PROTECTED_ROUTE_PREFIXES, PROTECTED_ROUTE_PUBLIC_CHILDREN } from "@/lib/auth/rbac";
import { ACTIVE_LOCALES } from "@/i18n/locales";

const result = robots();
const serialized = JSON.stringify(result);

function ruleFor(agent: string) {
  const rules = Array.isArray(result.rules) ? result.rules : [result.rules];
  const rule = rules.find((r) => r.userAgent === agent);
  if (!rule) throw new Error(`missing rule for ${agent}`);
  return rule;
}

function disallowOf(agent: string): string[] {
  const d = ruleFor(agent).disallow;
  return Array.isArray(d) ? d : d ? [d] : [];
}

function allowOf(agent: string): string[] {
  const a = ruleFor(agent).allow;
  return Array.isArray(a) ? a : a ? [a] : [];
}

/**
 * Would a crawler obeying this group be allowed to fetch `path`?
 *
 * Implements the REP longest-match rule: the most specific matching directive
 * wins, and `Allow` beats `Disallow` on a tie. `$` is the end-of-path anchor.
 * Written out because that rule is the whole reason the two-form disallow
 * (`/fa/vendor$` + `/fa/vendor/`) is safe where a bare `/fa/vendor` is not.
 */
function isAllowed(agent: string, targetPath: string): boolean {
  const match = (pattern: string): number => {
    if (pattern.endsWith("$")) {
      const literal = pattern.slice(0, -1);
      return targetPath === literal ? literal.length : -1;
    }
    return targetPath.startsWith(pattern) ? pattern.length : -1;
  };
  let bestAllow = -1;
  let bestDisallow = -1;
  for (const p of allowOf(agent)) bestAllow = Math.max(bestAllow, match(p));
  for (const p of disallowOf(agent)) bestDisallow = Math.max(bestDisallow, match(p));
  if (bestDisallow === -1) return true;
  return bestAllow >= bestDisallow;
}

/** Every crawler group that gets full public access. */
const SEARCH_TIER = [
  "Googlebot", "Bingbot", "OAI-SearchBot", "ChatGPT-User", "Claude-SearchBot",
  "Claude-User", "PerplexityBot", "Applebot", "DuckDuckBot", "YandexBot",
] as const;

/** Every crawler group scoped to the owner-approved training surfaces. */
const TRAINING_TIER = [
  "GPTBot", "ClaudeBot", "Google-Extended", "Applebot-Extended", "CCBot",
] as const;

const BLOCKED_BOTS = ["AhrefsBot", "SemrushBot", "MJ12bot", "DotBot", "BLEXBot"] as const;

describe("robots.ts — active locales (87L.6: fa+en+de)", () => {
  it("references /fa/, /en/ and /de/", () => {
    expect(serialized).toContain("/fa/");
    expect(serialized).toContain("/en/");
    expect(serialized).toContain("/de/");
  });

  it("declares the sitemap and a bare hostname for Host", () => {
    expect(result.sitemap).toContain("/sitemap.xml");
    // `Host:` is a Yandex extension taking a hostname, not a URL. It used to
    // emit "https://hermesnovin.com", which is not a valid value.
    expect(result.host).not.toContain("://");
  });
});

// ── CASE G ───────────────────────────────────────────────────────────────────

describe("CASE G — a default policy exists", () => {
  it('there is a "*" group', () => {
    // Under the Robots Exclusion Protocol a crawler matching no named group is
    // bound by NO rules. Before DISCOVERY-2A this file had no "*" group at all,
    // so every unnamed agent had unrestricted access to /api/ and to all 23
    // authenticated route families.
    expect(() => ruleFor("*")).not.toThrow();
  });

  it("the default group grants the public locale surfaces", () => {
    for (const locale of ACTIVE_LOCALES) {
      expect(allowOf("*")).toContain(`/${locale}/`);
    }
  });
});

// ── CASE H ───────────────────────────────────────────────────────────────────

describe("CASE H — the default policy blocks private surfaces without prefix collisions", () => {
  it("blocks /api/", () => {
    expect(isAllowed("*", "/api/media/public/videos")).toBe(false);
  });

  it.each(PROTECTED_ROUTE_PREFIXES)("blocks /{locale}/%s — both the root and the subtree", (prefix) => {
    for (const locale of ACTIVE_LOCALES) {
      // The brief's requirement: BOTH must be covered.
      expect(isAllowed("*", `/${locale}/${prefix}`), `/${locale}/${prefix}`).toBe(false);
      expect(isAllowed("*", `/${locale}/${prefix}/`), `/${locale}/${prefix}/`).toBe(false);
      expect(isAllowed("*", `/${locale}/${prefix}/anything`)).toBe(false);
    }
  });

  it("does NOT block the public siblings a prefix match would swallow", () => {
    // These are the two real collisions in this route set:
    //   protected "vendor"          vs public "vendors", "vendors/apply"
    //   protected "articles/editor" vs public "articles/editors-picks"
    // A bare `Disallow: /fa/vendor` would block the vendor DIRECTORY.
    const MUST_STAY_CRAWLABLE = [
      "vendors",
      "vendors/apply",
      "articles",
      "articles/editors-picks",
      "articles/latest",
      "articles/trending",
      "library",
      "library/cases",
      "library/cases/case-abb-acs580-oc",
      "library/vendor/siemens",
      "videos",
      "videos/acme/plc-basics",
      "services",
      "services/digital-twin",
      "academy",
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
    ];
    for (const locale of ACTIVE_LOCALES) {
      for (const route of MUST_STAY_CRAWLABLE) {
        expect(isAllowed("*", `/${locale}/${route}`), `/${locale}/${route}`).toBe(true);
      }
    }
  });

  it("re-allows the declared public children of protected prefixes", () => {
    for (const locale of ACTIVE_LOCALES) {
      for (const child of PROTECTED_ROUTE_PUBLIC_CHILDREN) {
        expect(isAllowed("*", `/${locale}/${child}`), `/${locale}/${child}`).toBe(true);
      }
      // …while the protected parent itself stays blocked.
      expect(isAllowed("*", `/${locale}/candidate`)).toBe(false);
      expect(isAllowed("*", `/${locale}/candidate/applications`)).toBe(false);
    }
  });

  it("never blocks the discovery and rendering resources", () => {
    for (const asset of [
      "/sitemap.xml",
      "/robots.txt",
      "/llms.txt",
      "/indexnow-key.txt",
      "/manifest.webmanifest",
      "/favicon.ico",
      "/favicon.svg",
      "/brand/og-default.jpg",
      "/images/hero.webp",
    ]) {
      expect(isAllowed("*", asset), asset).toBe(true);
    }
  });

  it("every named group carries the same complete private list", () => {
    // The coverage gap was not only in the missing "*" group: the named groups
    // knew about six prefixes while 23 route families were protected.
    for (const agent of [...SEARCH_TIER, ...TRAINING_TIER]) {
      for (const locale of ACTIVE_LOCALES) {
        for (const prefix of ["dashboard", "admin", "crm", "erp", "documents", "cmms", "assets", "engineering", "compliance", "customer"]) {
          expect(isAllowed(agent, `/${locale}/${prefix}/x`), `${agent} → /${locale}/${prefix}/x`).toBe(false);
        }
      }
      expect(isAllowed(agent, "/api/anything"), `${agent} → /api/`).toBe(false);
    }
  });
});

// ── CASE I ───────────────────────────────────────────────────────────────────

describe("CASE I — the search / model-training distinction is intact", () => {
  it("every SEARCH crawler reaches the whole public site", () => {
    for (const agent of SEARCH_TIER) {
      for (const locale of ACTIVE_LOCALES) {
        for (const route of ["", "platform", "articles", "videos", "pricing", "vendors"]) {
          expect(isAllowed(agent, `/${locale}/${route}`), `${agent} → /${locale}/${route}`).toBe(true);
        }
      }
    }
  });

  it("ChatGPT-User joined the search/user tier, not the training tier", () => {
    // It previously had no group at all, so it silently inherited the absent
    // default. It is OpenAI's user-directed fetcher — the counterpart of
    // Claude-User — so it belongs with search access, not training access.
    expect(isAllowed("ChatGPT-User", "/en/platform")).toBe(true);
    expect(isAllowed("ChatGPT-User", "/en/dashboard")).toBe(false);
  });

  it("every TRAINING crawler stays scoped to the owner-approved surfaces", () => {
    for (const agent of TRAINING_TIER) {
      const allow = allowOf(agent);
      // CCBot is narrower still — library only.
      const expected = agent === "CCBot"
        ? ["/library/"]
        : ["/library/", "/services/", "/academy/"];
      for (const suffix of expected) {
        for (const locale of ACTIVE_LOCALES) {
          expect(allow, `${agent} must allow /${locale}${suffix}`).toContain(`/${locale}${suffix}`);
        }
      }
      // The critical half: training access must NOT have been widened to the
      // whole public site the way the search tier is.
      for (const locale of ACTIVE_LOCALES) {
        expect(allow, `${agent} must not allow the locale root`).not.toContain(`/${locale}/`);
      }
    }
  });

  it("GPTBot allow list preserves per-suffix fa/en/de ordering", () => {
    expect(allowOf("GPTBot")).toEqual([
      "/fa/library/", "/en/library/", "/de/library/",
      "/fa/services/", "/en/services/", "/de/services/",
      "/fa/academy/", "/en/academy/", "/de/academy/",
    ]);
  });

  it("a vendor's search crawler and its training crawler have DIFFERENT policies", () => {
    // Collapsing these would silently grant training rights the owner withheld.
    expect(allowOf("OAI-SearchBot")).not.toEqual(allowOf("GPTBot"));
    expect(allowOf("Claude-SearchBot")).not.toEqual(allowOf("ClaudeBot"));
    expect(allowOf("Applebot")).not.toEqual(allowOf("Applebot-Extended"));
  });

  it("Googlebot keeps its crawl delay and Googlebot-Image its brand allowance", () => {
    expect(ruleFor("Googlebot").crawlDelay).toBe(1);
    expect(ruleFor("Bingbot").crawlDelay).toBe(2);
    expect(allowOf("Googlebot-Image")).toEqual(["/brand/", "/fa/", "/en/", "/de/"]);
  });

  it("no crawler group accidentally blocks the whole site except the known bad bots", () => {
    for (const agent of [...SEARCH_TIER, ...TRAINING_TIER, "*"]) {
      expect(disallowOf(agent), `${agent} blocks root`).not.toContain("/");
      expect(BLOCKED_BOTS as readonly string[]).not.toContain(agent);
    }
  });

  it("aggressive bots still fully blocked", () => {
    for (const agent of BLOCKED_BOTS) {
      expect(disallowOf(agent)).toEqual(["/"]);
    }
  });
});
