import { describe, it, expect } from "vitest";
import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { PUBLIC_NAV_GROUPS } from "@/components/public-site/nav";
import {
  CAPABILITY_KEYS,
  CAPABILITY_HREF,
  CAPABILITY_CONNECTIONS,
  relatedHref,
} from "@/lib/capabilities/registry";
import { isProtectedPath } from "@/lib/auth/rbac";
import en from "../../../../messages/en.json";
import fa from "../../../../messages/fa.json";
import de from "../../../../messages/de.json";

/**
 * R2 corrective pass (F1–F4) — public capability DISCOVERY contract.
 *
 * The first R2 commit put the capability nav entries in
 * `lib/navigation/site-nav.ts`, which the public shell does not render, and
 * left the homepage capability cards as dead text because their `.map()`
 * discarded the declared `href`. Both defects were invisible to the existing
 * suites: one asserted registry membership in the wrong registry, the other
 * asserted nothing about the homepage at all.
 *
 * These tests therefore assert the RENDERED path — the registry the public
 * header actually reads, and the props the homepage actually forwards — not
 * merely that a URL string exists somewhere in the tree.
 */

const ROOT = process.cwd();
const read = (rel: string) => readFileSync(join(ROOT, rel), "utf8");

type Catalog = typeof en;
const CATALOGS: ReadonlyArray<readonly [string, Catalog]> = [
  ["en", en],
  ["fa", fa as unknown as Catalog],
  ["de", de as unknown as Catalog],
];

/** The eight implemented capabilities this increment exposes publicly. */
const CAPABILITY_ROUTES = CAPABILITY_KEYS.map((k) => CAPABILITY_HREF[k]);

/* ── 1. Public navigation registry ───────────────────────────────────────── */

describe("F2 — the eight capabilities are in the REAL public navigation", () => {
  it("PublicHeader renders PublicNavMenus, which reads PUBLIC_NAV_GROUPS", () => {
    // Proves the chain, so this suite cannot pass against an unrendered registry.
    expect(read("src/components/public-site/PublicHeader.tsx")).toContain("PublicNavMenus");
    expect(read("src/components/public-site/PublicNavMenus.tsx")).toContain(
      'import { PUBLIC_NAV_GROUPS } from "./nav"',
    );
    expect(read("src/components/public-site/PublicMobileNav.tsx")).toContain(
      'import { PUBLIC_NAV_GROUPS } from "./nav"',
    );
    expect(read("src/components/public-site/PublicPageShell.tsx")).toContain("PublicHeader");
  });

  it("every capability route appears in PUBLIC_NAV_GROUPS", () => {
    const navHrefs = PUBLIC_NAV_GROUPS.flatMap((g) => g.items.map((i) => i.href));
    for (const href of CAPABILITY_ROUTES) {
      expect(navHrefs, `${href} missing from the rendered public nav`).toContain(href);
    }
  });

  it("they live in one dedicated group, so no panel becomes unusably long", () => {
    const group = PUBLIC_NAV_GROUPS.find((g) => g.groupKey === "capabilities");
    expect(group).toBeDefined();
    expect(group!.items).toHaveLength(8);
    for (const g of PUBLIC_NAV_GROUPS) {
      expect(g.items.length, `${g.groupKey} panel too long`).toBeLessThanOrEqual(8);
    }
  });

  it("no capability nav entry links an anonymous visitor into the login wall", () => {
    for (const href of CAPABILITY_ROUTES) {
      for (const loc of ["en", "fa", "de"]) {
        expect(isProtectedPath(`/${loc}${href}`), `${href} is protected`).toBe(false);
      }
    }
  });
});

/* ── 2 + 3. Homepage cards render real links, labelled in every locale ───── */

describe("F3 — homepage capability cards are real links", () => {
  const home = read("src/app/[locale]/page.tsx");

  it("both previously-broken card groups now forward href AND ctaLabel", () => {
    for (const group of ["OPERATIONS_CARDS", "ENGINEERING_CARDS"]) {
      const map = home.match(new RegExp(group + "\\.map\\(\\(\\{([^}]*)\\}"));
      expect(map, `${group} .map() not found`).toBeTruthy();
      expect(map![1], `${group} still discards href`).toMatch(/\bhref\b/);
    }
    // ctaLabel must actually be passed, or CapabilityGrid renders no anchor.
    expect(home).toContain("ctaLabel: t(`operations.cards.${key}.cta`)");
    expect(home).toContain("ctaLabel: t(`engineering.cards.${key}.cta`)");
  });

  it("CapabilityGrid only renders an anchor when BOTH href and ctaLabel exist", () => {
    // The reason a missing ctaLabel silently produced dead text.
    expect(read("src/components/public-site/CapabilityGrid.tsx")).toContain(
      "item.href && item.ctaLabel",
    );
  });

  it("the implemented capabilities point at their canonical capability route", () => {
    expect(home).toContain('href: "/services/predictive-maintenance"');
    expect(home).toContain('href: "/services/multi-site"');
    expect(home).toContain('href: "/services/digital-twin"');
    expect(home).toContain('href: "/services/ot-edge"');
  });

  it("cards WITHOUT a dedicated capability page are not redirected to one", () => {
    // `asset` has no /services page; `knowledge` belongs to the library.
    expect(home).toMatch(/key: "asset",\s+accent: "success",\s+href: "\/platform"/);
    expect(home).toMatch(/key: "knowledge", accent: "azure",\s+href: "\/library"/);
  });

  it("every linked homepage card has a cta label in en, fa AND de", () => {
    for (const [name, cat] of CATALOGS) {
      for (const section of ["operations", "engineering"] as const) {
        const cards = cat.publicSite[section].cards as Record<string, { cta?: string }>;
        for (const [key, card] of Object.entries(cards)) {
          expect(card.cta?.trim(), `${name}: ${section}.${key} has no cta`).toBeTruthy();
        }
      }
    }
  });
});

/* ── 3. Capability labels exist in FA/EN/DE ──────────────────────────────── */

describe("F2/F3 — capability labels exist in every locale", () => {
  it("each nav capability item has a non-empty label in en, fa and de", () => {
    const group = PUBLIC_NAV_GROUPS.find((g) => g.groupKey === "capabilities")!;
    for (const [name, cat] of CATALOGS) {
      expect(
        (cat.publicSite.header.groups as Record<string, string>).capabilities,
        `${name}: missing capabilities group label`,
      ).toBeTruthy();
      for (const item of group.items) {
        expect(
          (cat.publicSite.header.nav as Record<string, string>)[item.labelKey]?.trim(),
          `${name}: missing nav label ${item.labelKey}`,
        ).toBeTruthy();
      }
    }
  });

  it("each capability page has title/lede/cta content in en, fa and de", () => {
    for (const [name, cat] of CATALOGS) {
      for (const key of CAPABILITY_KEYS) {
        const c = (cat.services.capabilities as Record<string, {
          title?: string; lede?: string; cta?: { title?: string };
        }>)[key];
        expect(c, `${name}: missing capability ${key}`).toBeDefined();
        expect(c.title?.trim(), `${name}: ${key} title`).toBeTruthy();
        expect(c.lede?.trim(), `${name}: ${key} lede`).toBeTruthy();
        expect(c.cta?.title?.trim(), `${name}: ${key} cta`).toBeTruthy();
      }
    }
  });
});

/* ── 4. No unsupported real-time claim ───────────────────────────────────── */

describe("F1 — no unsupported real-time telemetry claim", () => {
  /**
   * Repository evidence: `src/lib/digital-twin/health.ts` computes health ON
   * REQUEST from the most recent stored TelemetryRecord, and telemetry arrives
   * as gateway-posted batches. There is no stream, socket or push channel
   * anywhere under lib/digital-twin or api/digital-twin — so "real time",
   * "live", "Echtzeit" and "زنده" are claims the code does not support.
   */
  const BANNED = /real[- ]?time|Echtzeit|Live-|streaming|kontinuierlich aktualisiert|به‌صورت زنده|لحظه‌ای به‌روز/i;

  it("the digital-twin capability copy makes no real-time claim in any locale", () => {
    for (const [name, cat] of CATALOGS) {
      const twin = JSON.stringify(
        (cat.services.capabilities as Record<string, unknown>).digitalTwin,
      );
      const hit = twin.match(BANNED);
      expect(hit?.[0], `${name}: digitalTwin claims "${hit?.[0]}"`).toBeUndefined();
    }
  });

  it("the /architecture delivered section makes no real-time claim either", () => {
    for (const [name, cat] of CATALOGS) {
      const delivered = JSON.stringify(cat.architecture.delivered);
      const hit = delivered.match(BANNED);
      expect(hit?.[0], `${name}: architecture.delivered claims "${hit?.[0]}"`).toBeUndefined();
    }
  });

  it("no capability page anywhere reintroduces the claim", () => {
    for (const [name, cat] of CATALOGS) {
      const all = JSON.stringify(cat.services.capabilities);
      const hit = all.match(BANNED);
      expect(hit?.[0], `${name}: services.capabilities claims "${hit?.[0]}"`).toBeUndefined();
    }
  });

  it("no streaming mechanism exists that would make such a claim true", () => {
    const health = read("src/lib/digital-twin/health.ts");
    expect(health).toMatch(/findFirst/);           // reads the latest stored row
    expect(health).not.toMatch(/WebSocket|EventSource|subscribe\(/);
  });
});

/* ── 5. Related links keep destination-specific accessible names ─────────── */

describe("F4 — related-capability links stay identifiable", () => {
  it("the visible label is generic but the accessible name names the destination", () => {
    const src = read("src/components/public-site/CapabilityDetail.tsx");
    expect(src).toContain("chrome.relatedCta");
    expect(src).toContain('t("capabilityChrome.relatedCtaAria", { name: item.name })');
    // the anchor must no longer simply repeat its own card heading
    expect(src).not.toMatch(/<CapabilityLink[\s\S]{0,400}?>\s*\{item\.name\}/);
  });

  it("CapabilityLink forwards the accessible name to the rendered anchor", () => {
    const src = read("src/components/analytics/CapabilityLink.tsx");
    expect(src).toContain("aria-label={ariaLabel}");
  });

  it("the aria template carries the {name} argument in every locale", () => {
    for (const [name, cat] of CATALOGS) {
      const chrome = cat.services.capabilityChrome as Record<string, string>;
      expect(chrome.relatedCta?.trim(), `${name}: relatedCta`).toBeTruthy();
      expect(chrome.relatedCtaAria, `${name}: relatedCtaAria must interpolate {name}`).toContain(
        "{name}",
      );
    }
  });
});

/* ── 6. Phase 105 Brain distinction survives ─────────────────────────────── */

describe("Phase 105 — the two Brain capabilities remain distinct", () => {
  it("neither page canonicalises onto the other", () => {
    const brain = read("src/app/[locale]/brain/page.tsx");
    const industrial = read("src/app/[locale]/industrial-brain/page.tsx");
    expect(brain).toMatch(/path:\s*"\/brain"/);
    expect(industrial).toMatch(/path:\s*"\/industrial-brain"/);
    // Neither may be noindexed by this increment.
    expect(brain).not.toContain("noIndex");
    expect(industrial).not.toContain("noIndex");
  });

  it("each still carries its own reciprocal explanation in every locale", () => {
    for (const [name, cat] of CATALOGS) {
      expect(cat.brain.crossLink?.trim(), `${name}: brain`).toBeTruthy();
      expect(cat.industrialBrain.crossLink?.trim(), `${name}: industrialBrain`).toBeTruthy();
    }
  });
});

/* ── 7. Sitemap + llms.txt discoverability ───────────────────────────────── */

describe("all eight capabilities stay machine-discoverable", () => {
  it("each route has a real page file", () => {
    for (const href of CAPABILITY_ROUTES) {
      const f = join(ROOT, "src", "app", "[locale]", href.replace(/^\//, ""), "page.tsx");
      expect(existsSync(f), `missing page for ${href}`).toBe(true);
    }
  });

  it("each route is listed in the sitemap source and in llms.txt", () => {
    const sitemap = read("src/app/sitemap.ts");
    const llms = read("src/app/llms.txt/route.ts");
    for (const href of CAPABILITY_ROUTES) {
      expect(sitemap, `${href} missing from sitemap`).toContain(`"${href}"`);
      expect(llms, `${href} missing from llms.txt`).toContain(href);
    }
  });

  it("the human connection graph still resolves to public routes only", () => {
    for (const key of CAPABILITY_KEYS) {
      for (const target of CAPABILITY_CONNECTIONS[key]) {
        expect(relatedHref(target)).not.toMatch(/\/dashboard|\/admin|\/api\/|\/auth\//);
      }
    }
  });
});
