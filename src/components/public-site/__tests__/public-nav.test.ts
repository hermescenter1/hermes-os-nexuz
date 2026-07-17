import { describe, it, expect } from "vitest";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import {
  PUBLIC_NAV_GROUPS,
  PUBLIC_FOOTER_COLUMNS,
  allPublicShellHrefs,
} from "@/components/public-site/nav";
import { isProtectedPath } from "@/lib/auth/rbac";
import { buildMetadata } from "@/lib/seo/metadata";
import { BASE_URL } from "@/lib/seo/config";
import en from "../../../../messages/en.json";
import fa from "../../../../messages/fa.json";
import de from "../../../../messages/de.json";

/**
 * PHASE 87D — public-site registry, catalog, content-integrity, SEO and
 * font-gate invariants (mirrors the site-nav / app-nav test contracts):
 *
 *   1. every rendered href is a real route file and is publicly reachable
 *      (never middleware-protected) in both locales;
 *   2. the approved conversion routes are /demo and /platform only;
 *   3. publicSite catalogs: en/fa/de key-path parity, de = English verbatim
 *      (no German activation), Persian orthography, no empty strings;
 *   4. content integrity: no certifications, no invented statistics;
 *   5. per-page metadata keeps the buildMetadata canonical/hreflang contract;
 *   6. the Inter font gate is resolved (asset + license + per-locale wiring).
 */

const LOCALES = ["en", "fa"] as const;
type Catalog = typeof en;
const CATALOGS: ReadonlyArray<readonly [string, Catalog]> = [
  ["en", en],
  ["fa", fa as unknown as Catalog],
  ["de", de as unknown as Catalog],
];

function pageFileFor(route: string): string {
  const segment = route === "/" ? "" : route.replace(/^\//, "");
  return join(process.cwd(), "src", "app", "[locale]", segment, "page.tsx");
}

function keyPaths(obj: Record<string, unknown>, prefix = ""): string[] {
  const out: string[] = [];
  for (const k of Object.keys(obj)) {
    const p = prefix ? `${prefix}.${k}` : k;
    const v = obj[k];
    if (v && typeof v === "object") out.push(...keyPaths(v as Record<string, unknown>, p));
    else out.push(p);
  }
  return out;
}

describe("public-site nav registry — structure (87D.1 grouped IA)", () => {
  it("header exposes the five approved groups with their grouped destinations", () => {
    expect(
      PUBLIC_NAV_GROUPS.map((g) => `${g.groupKey}:${g.items.map((i) => i.href).join(",")}`),
    ).toEqual([
      "platform:/platform,/architecture,/services",
      "intelligence:/industrial-brain,/brain,/copilot",
      "knowledge:/library,/academy,/articles",
      "resources:/demo,/vendors",
      "company:/about,/careers,/contact",
    ]);
  });

  it("every shell href is locale-agnostic and points at a real route file", () => {
    for (const href of allPublicShellHrefs()) {
      expect(href.startsWith("/")).toBe(true);
      expect(href).not.toMatch(/^\/(en|fa|de)(\/|$)/);
      expect(existsSync(pageFileFor(href)), `missing page for ${href}`).toBe(true);
    }
  });

  it("no shell href is middleware-protected — anonymous visitors are never linked into the login wall", () => {
    for (const href of allPublicShellHrefs()) {
      for (const loc of LOCALES) {
        expect(isProtectedPath(`/${loc}${href}`), `${href} is protected`).toBe(false);
      }
    }
  });

  it("footer fixes the legacy misdirections: Platform Overview → /platform (not /) and carries the /demo conversion link", () => {
    const platformCol = PUBLIC_FOOTER_COLUMNS.find((c) => c.columnKey === "platform")!;
    expect(platformCol.links.find((l) => l.labelKey === "platformOverview")?.href).toBe("/platform");
    expect(platformCol.links.map((l) => l.href)).not.toContain("/");
    const companyCol = PUBLIC_FOOTER_COLUMNS.find((c) => c.columnKey === "company")!;
    expect(companyCol.links.map((l) => l.href)).toContain("/demo");
  });

  it("hrefs are unique across the whole header IA and within each footer column", () => {
    const nav = PUBLIC_NAV_GROUPS.flatMap((g) => g.items.map((i) => i.href));
    expect(new Set(nav).size).toBe(nav.length);
    for (const col of PUBLIC_FOOTER_COLUMNS) {
      const hrefs = col.links.map((l) => l.href);
      expect(new Set(hrefs).size, `duplicate href in ${col.columnKey}`).toBe(hrefs.length);
    }
  });

  it("every group, item and footer label key exists in en, fa and de catalogs", () => {
    for (const [name, cat] of CATALOGS) {
      const ps = cat.publicSite;
      for (const group of PUBLIC_NAV_GROUPS) {
        expect(
          (ps.header.groups as Record<string, string>)[group.groupKey],
          `${name}: missing group label ${group.groupKey}`,
        ).toBeTruthy();
        for (const item of group.items) {
          expect(
            (ps.header.nav as Record<string, string>)[item.labelKey],
            `${name}: missing header label ${item.labelKey}`,
          ).toBeTruthy();
        }
      }
      for (const col of PUBLIC_FOOTER_COLUMNS) {
        expect(
          (ps.footer.columns as Record<string, string>)[col.columnKey],
          `${name}: missing column ${col.columnKey}`,
        ).toBeTruthy();
        for (const link of col.links) {
          expect(
            (ps.footer.links as Record<string, string>)[link.labelKey],
            `${name}: missing footer label ${link.labelKey}`,
          ).toBeTruthy();
        }
      }
    }
  });

  it("no duplicate visible labels create accessibility ambiguity (per locale)", () => {
    for (const [name, cat] of CATALOGS.slice(0, 2)) { // en + fa (de = en)
      const ps = cat.publicSite;
      const groups = ps.header.groups as Record<string, string>;
      const nav = ps.header.nav as Record<string, string>;
      // group labels unique
      const groupLabels = PUBLIC_NAV_GROUPS.map((g) => groups[g.groupKey]);
      expect(new Set(groupLabels).size, `${name}: duplicate group labels`).toBe(groupLabels.length);
      // item labels unique across the entire header
      const itemLabels = PUBLIC_NAV_GROUPS.flatMap((g) => g.items.map((i) => nav[i.labelKey]));
      expect(new Set(itemLabels).size, `${name}: duplicate item labels`).toBe(itemLabels.length);
      // no item shares its own group's visible label
      for (const g of PUBLIC_NAV_GROUPS) {
        for (const i of g.items) {
          expect(nav[i.labelKey], `${name}: ${i.labelKey} duplicates group ${g.groupKey}`).not.toBe(groups[g.groupKey]);
        }
      }
      // footer link labels unique within each column
      const links = ps.footer.links as Record<string, string>;
      for (const col of PUBLIC_FOOTER_COLUMNS) {
        const labels = col.links.map((l) => links[l.labelKey]);
        expect(new Set(labels).size, `${name}: duplicate labels in footer ${col.columnKey}`).toBe(labels.length);
      }
    }
  });
});

describe("publicSite catalogs — parity and orthography", () => {
  it("en/fa/de publicSite key paths are identical and ordered identically", () => {
    const enPaths = keyPaths(en.publicSite as unknown as Record<string, unknown>);
    expect(keyPaths((fa as unknown as Catalog).publicSite as unknown as Record<string, unknown>)).toEqual(enPaths);
    expect(keyPaths((de as unknown as Catalog).publicSite as unknown as Record<string, unknown>)).toEqual(enPaths);
  });

  it("de.publicSite is byte-identical English carryover — German is NOT activated", () => {
    expect(JSON.stringify((de as unknown as Catalog).publicSite)).toBe(JSON.stringify(en.publicSite));
  });

  it("no publicSite value is an empty string in any catalog", () => {
    for (const [name, cat] of CATALOGS) {
      const walk = (o: Record<string, unknown>, p: string) => {
        for (const [k, v] of Object.entries(o)) {
          if (v && typeof v === "object") walk(v as Record<string, unknown>, `${p}.${k}`);
          else expect(String(v).trim().length, `${name}: empty ${p}.${k}`).toBeGreaterThan(0);
        }
      };
      walk(cat.publicSite as unknown as Record<string, unknown>, "publicSite");
    }
  });

  it("fa.publicSite uses Persian ی/ک — never Arabic ي/ك", () => {
    const faJson = JSON.stringify((fa as unknown as Catalog).publicSite);
    expect(faJson).not.toMatch(/[يك]/);
  });

  it("the canonical nine-stage pipeline is present in exact order", () => {
    expect(Object.keys(en.publicSite.flow.stages)).toEqual([
      "data", "context", "classification", "hypotheses", "evidence",
      "confidence", "risk", "safeAction", "report",
    ]);
  });
});

describe("publicSite content integrity — no fabricated claims", () => {
  it("carries no certification claims and no invented statistics in any locale", () => {
    for (const [name, cat] of CATALOGS) {
      const json = JSON.stringify(cat.publicSite);
      for (const banned of [
        "SOC 2", "SOC2", "ISO 27001", "ISO27001",   // certifications never held
        "1,284", "8,500", "8500+", "2,400", "120+", // invented fleet/corpus numbers
        "Technology Partners",                        // unaffiliated-vendor framing
      ]) {
        expect(json.includes(banned), `${name}: contains banned claim "${banned}"`).toBe(false);
      }
    }
  });

  it("the hero evidence panel is explicitly captioned as illustrative in en and fa", () => {
    expect(en.publicSite.evidence.caption).toMatch(/Illustrative/);
    expect((fa as unknown as Catalog).publicSite.evidence.caption).toContain("نمونهٔ");
  });
});

describe("homepage + platform metadata — buildMetadata contract preserved", () => {
  it("homepage canonical is the locale root and hreflang covers active locales only", () => {
    const meta = buildMetadata({ locale: "en", path: "", title: "t", description: "d" });
    expect(meta.alternates?.canonical).toBe(`${BASE_URL}/en`);
    const langs = meta.alternates?.languages as Record<string, string>;
    expect(Object.keys(langs).sort()).toEqual(["en", "fa", "x-default"]);
    expect(langs["x-default"]).toBe(`${BASE_URL}/fa`);
    expect(Object.keys(langs)).not.toContain("de");
  });

  it("platform canonical carries the /platform path in both locales", () => {
    for (const loc of LOCALES) {
      const meta = buildMetadata({ locale: loc, path: "/platform", title: "t", description: "d" });
      expect(meta.alternates?.canonical).toBe(`${BASE_URL}/${loc}/platform`);
    }
  });

  it("meta.pages.platform still exists in en and fa (metadata source of the platform page)", () => {
    for (const cat of [en, fa as unknown as Catalog]) {
      const platform = cat.meta.pages.platform;
      expect(platform.title).toBeTruthy();
      expect(platform.description).toBeTruthy();
    }
  });
});

describe("PHASE 87D font gate — Inter resolved via the vendored-OFL pattern", () => {
  const root = process.cwd();

  it("ships the Inter variable asset with its OFL license next to the existing fonts", () => {
    expect(existsSync(join(root, "src", "fonts", "Inter.woff2"))).toBe(true);
    const license = readFileSync(join(root, "src", "fonts", "OFL-Inter.txt"), "utf8");
    expect(license).toContain("The Inter Project Authors");
    expect(license).toContain("SIL Open Font License, Version 1.1");
  });

  it("the locale layout loads Inter through next/font/local as --font-inter", () => {
    const layout = readFileSync(join(root, "src", "app", "[locale]", "layout.tsx"), "utf8");
    expect(layout).toContain('src: "../../fonts/Inter.woff2"');
    expect(layout).toContain('variable: "--font-inter"');
    expect(layout).toMatch(/\$\{estedad\.variable\} \$\{vazir\.variable\} \$\{inter\.variable\}/);
  });

  it("globals.css re-points --font-display/--font-body to Inter for English only", () => {
    const css = readFileSync(join(root, "src", "app", "globals.css"), "utf8");
    expect(css).toContain('html[lang^="en"]');
    const override = css.slice(css.indexOf('html[lang^="en"]'));
    expect(override).toMatch(/--font-display:\s*var\(--font-inter/);
    expect(override).toMatch(/--font-body:\s*var\(--font-inter/);
    // Persian typography rules stay untouched.
    expect(css).toContain(":lang(fa)");
  });
});
