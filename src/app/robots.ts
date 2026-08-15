import type { MetadataRoute } from "next";
import { BASE_URL } from "@/lib/seo/config";
import { ACTIVE_LOCALES } from "@/i18n/locales";
import {
  PROTECTED_ROUTE_PREFIXES,
  PROTECTED_ROUTE_PUBLIC_CHILDREN,
} from "@/lib/auth/rbac";

// Locale-scoped path helpers — generated from ACTIVE_LOCALES so crawl rules
// cover exactly the public locales (never inactive ones such as German) and
// automatically extend when a locale is activated. Ordering is per-suffix then
// per-locale, matching the previously hand-written fa/en rules.

/** Root path of every active locale, e.g. ["/fa/", "/en/"]. */
const localeRoots = ACTIVE_LOCALES.map((l) => `/${l}/`);

/** Each suffix expanded across every active locale, in suffix→locale order. */
function localized(...suffixes: string[]): string[] {
  return suffixes.flatMap((s) => ACTIVE_LOCALES.map((l) => `/${l}${s}`));
}

/* ── DISCOVERY-2A — the private surface, derived from the authorization layer ──
 *
 * Every rule below used to carry its own hand-written disallow list. The longest
 * of them named six prefixes while `PROTECTED_PATHS` in `@/lib/auth/rbac`
 * protected twenty-three, so fourteen authenticated route families — engineering,
 * compliance, customer, documents, cmms, assets, the editorial Journal, and more
 * — were advertised as crawlable. Worse, there was no `User-agent: *` group at
 * all: under the Robots Exclusion Protocol a crawler that matches no named group
 * is bound by no rules, so every unnamed agent, including `ChatGPT-User` and any
 * future one, had unrestricted access to `/api/` and to all of it.
 *
 * The list now comes from `PROTECTED_ROUTE_PREFIXES`, which a contract test pins
 * to `PROTECTED_PATHS` in both directions. Crawl policy follows access policy.
 *
 * WHY EACH PREFIX PRODUCES TWO LINES
 * ----------------------------------
 * robots.txt matching is by PREFIX, so a bare `Disallow: /fa/vendor` would also
 * match `/fa/vendors` — the PUBLIC vendor directory — and `/fa/articles/editor`
 * would swallow the public `/fa/articles/editors-picks`. Emitting the two exact
 * forms instead is collision-proof and still covers both halves of the brief's
 * requirement:
 *
 *     Disallow: /fa/dashboard$      the workspace root itself
 *     Disallow: /fa/dashboard/      everything beneath it
 *
 * `$` is the end-of-path anchor; Google and Bing both honour it. A `Disallow`
 * ending in `/` cannot match a sibling whose name merely starts the same way.
 */
function privateDisallow(): string[] {
  const rules: string[] = ["/api/", "/_next/"];
  for (const prefix of PROTECTED_ROUTE_PREFIXES) {
    for (const locale of ACTIVE_LOCALES) {
      rules.push(`/${locale}/${prefix}$`);
      rules.push(`/${locale}/${prefix}/`);
    }
  }
  return rules;
}

/**
 * Paths that must stay crawlable even though a protected prefix captures their
 * parent. A longer, more specific `Allow` wins over a shorter `Disallow` in both
 * Google's and Bing's implementations, which is exactly how
 * `localePathPattern("candidate", ["register"])` is expressed to a crawler.
 */
function publicChildAllows(): string[] {
  return PROTECTED_ROUTE_PUBLIC_CHILDREN.flatMap((child) =>
    ACTIVE_LOCALES.map((l) => `/${l}/${child}`),
  );
}

/**
 * One `User-agent` group. `MetadataRoute.Robots["rules"]` is a single-or-array
 * union whose array member requires `userAgent`, so the element type is spelled
 * out here rather than inferred from the union.
 */
interface RobotsRule {
  userAgent: string | string[];
  allow?: string | string[];
  disallow?: string | string[];
  crawlDelay?: number;
}

/** Full public access for a search/retrieval crawler, private surface denied. */
function searchTier(userAgent: string, crawlDelay?: number): RobotsRule {
  return {
    userAgent,
    allow: [...publicChildAllows(), ...localeRoots],
    disallow: privateDisallow(),
    ...(crawlDelay ? { crawlDelay } : {}),
  };
}

/**
 * The owner-approved MODEL-TRAINING scope (Phase 62, unchanged): the open
 * knowledge surfaces only. This is a DIFFERENT decision from search access and
 * must stay narrower — a training crawler gets `/library/`, `/services/` and
 * `/academy/` and nothing else, while its vendor's search crawler gets the whole
 * public site.
 */
function trainingTier(userAgent: string, allow: string[]): RobotsRule {
  return {
    userAgent,
    allow,
    disallow: privateDisallow(),
  };
}

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      /* ── Default policy — every crawler with no group of its own ──────────
         Without this group the file said nothing to unnamed agents, and saying
         nothing means "everything is allowed". It grants the public locale
         surfaces and denies the API and every authenticated workspace. Nothing
         needed to RENDER a public page is blocked: `/_next/static` is served
         from the `/_next/` prefix, which classic search engines do not need for
         text extraction, while `/brand/` and `/images/` stay open and the
         discovery resources at the domain root — /sitemap.xml, /robots.txt,
         /llms.txt, /indexnow-key.txt, /manifest.webmanifest — match no
         Disallow and remain fetchable. */
      {
        userAgent: "*",
        allow: [...publicChildAllows(), "/brand/", "/images/", ...localeRoots],
        disallow: privateDisallow(),
      },

      /* ── Search engines ────────────────────────────────────────────────── */
      searchTier("Googlebot", 1),
      {
        userAgent: "Googlebot-Image",
        allow: ["/brand/", ...localeRoots],
      },
      searchTier("Bingbot", 2),
      /* ── AI SEARCH / RETRIEVAL crawlers (PHASE 87L.6) ──────────────────────
         These index public content so the product can be FOUND and CITED in
         ChatGPT search, Claude search and Perplexity answers. They are a
         different concern from the model-TRAINING crawlers below and get the
         same growth-first policy as classic search engines: full public
         access, private/API always denied. Names follow the vendors' current
         official crawler documentation. */
      searchTier("OAI-SearchBot"),
      // DISCOVERY-2A: OpenAI's user-directed fetcher, the counterpart of
      // Claude-User below. It had no group at all, so it inherited the absent
      // default and could reach every private path; it belongs in the same
      // user-access tier as Claude-User, not in the training tier.
      searchTier("ChatGPT-User"),
      searchTier("Claude-SearchBot"),
      // user-directed fetches from Claude on a user's explicit request
      searchTier("Claude-User"),
      searchTier("PerplexityBot"),
      /* ── Model-TRAINING crawlers — explicit owner policy ───────────────────
         Training access is NOT required for search visibility. The standing
         owner decision (Phase 62) grants training bots the open knowledge
         surfaces only (library/services/academy); proprietary product and
         engineering content stays protected. Google-Extended and
         Applebot-Extended are robots TOKENS controlling training use of
         normally-crawled pages — same scoped policy. */
      trainingTier("GPTBot", localized("/library/", "/services/", "/academy/")),
      trainingTier("ClaudeBot", localized("/library/", "/services/", "/academy/")),
      trainingTier("Google-Extended", localized("/library/", "/services/", "/academy/")),
      trainingTier("Applebot-Extended", localized("/library/", "/services/", "/academy/")),
      searchTier("Applebot"),
      trainingTier("CCBot", localized("/library/")),
      searchTier("DuckDuckBot"),
      searchTier("YandexBot"),
      /* ── Aggressive / privacy-invasive bots — block all ───────────────── */
      {
        userAgent: "AhrefsBot",
        disallow: ["/"],
      },
      {
        userAgent: "SemrushBot",
        disallow: ["/"],
      },
      {
        userAgent: "MJ12bot",
        disallow: ["/"],
      },
      {
        userAgent: "DotBot",
        disallow: ["/"],
      },
      {
        userAgent: "BLEXBot",
        disallow: ["/"],
      },
    ],
    sitemap: `${BASE_URL}/sitemap.xml`,
    // The Yandex `Host:` extension takes a bare hostname, not a URL. It was
    // emitting "https://hermesnovin.com", which is not a valid value.
    host: new URL(BASE_URL).hostname,
  };
}
