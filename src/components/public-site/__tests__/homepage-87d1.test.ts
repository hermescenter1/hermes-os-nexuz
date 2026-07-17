import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import en from "../../../../messages/en.json";
import fa from "../../../../messages/fa.json";
import de from "../../../../messages/de.json";

/**
 * PHASE 87D.1 — homepage content-restoration invariants:
 *   1. the capability sections render in the approved order (hero →
 *      challenge → pillars → flow → intelligence core → operations →
 *      engineering → modules → learning → safe action → enterprise →
 *      ecosystem → demo CTA);
 *   2. the ecosystem section links exactly the eight approved existing
 *      routes with localized purpose + accessible link text;
 *   3. all restored copy stays truthful (no stats/certs/testimonials) and
 *      fully bilingual (fa distinct from en; de = en carryover).
 */

const pageSrc = readFileSync(join(process.cwd(), "src", "app", "[locale]", "page.tsx"), "utf8");

describe("homepage — 87D.1 section order", () => {
  it("renders the sixteen-part narrative in the approved order", () => {
    const markers = [
      "<PublicHero />",                    // 1 hero
      'TrustSection variant="strip"',      // trust band
      '"challenge-title"',                 // 2 industrial challenge
      '"pillars-title"',                   // pillars
      '"flow-title"',                      // 3 evidence-to-safe-action flow
      '"intelligence-title"',              // 4+5 Industrial Brain + Copilot
      '"operations-title"',                // 6+9+10 asset/predictive/multi-site
      '"engineering-title"',               // 7+8+11 knowledge/twin/edge
      '"modules-title"',                   // 12 enterprise modules overview
      '"learning-title"',                  // 13 academy/library/journal
      '"safe-action-title"',               // safe action gates
      'TrustSection variant="features"',   // 14 enterprise security & deployment
      '"ecosystem-title"',                 // 15 ecosystem
      "<PublicCta",                        // 16 demo CTA
    ];
    const positions = markers.map((m) => pageSrc.indexOf(m));
    for (let i = 0; i < markers.length; i++) {
      expect(positions[i], `missing homepage marker ${markers[i]}`).toBeGreaterThan(-1);
      if (i > 0) {
        expect(positions[i], `${markers[i]} must come after ${markers[i - 1]}`).toBeGreaterThan(positions[i - 1]);
      }
    }
  });

  it("the intelligence core links Industrial Brain and Copilot to their live routes", () => {
    expect(pageSrc).toContain('"/industrial-brain"');
    expect(pageSrc).toContain('"/copilot"');
  });
});

describe("ecosystem section — eight doors, existing routes only", () => {
  const EXPECTED: Record<string, string> = {
    industrialBrain: "/industrial-brain",
    copilot: "/copilot",
    services: "/services",
    academy: "/academy",
    library: "/library",
    articles: "/articles",
    vendors: "/vendors",
    careers: "/careers",
  };

  it("page wires each ecosystem card key to its approved route", () => {
    for (const [key, href] of Object.entries(EXPECTED)) {
      const re = new RegExp(`key:\\s*"${key}",\\s*href:\\s*"${href.replace(/\//g, "\\/")}"`);
      expect(pageSrc, `ecosystem card ${key} → ${href}`).toMatch(re);
    }
  });

  it("every ecosystem card has name, purpose and accessible link text in en+fa+de", () => {
    for (const cat of [en, fa, de] as const) {
      const cards = (cat as typeof en).publicSite.ecosystem.cards as Record<
        string,
        { name: string; desc: string; cta: string }
      >;
      expect(Object.keys(cards)).toEqual(Object.keys(EXPECTED));
      for (const [key, card] of Object.entries(cards)) {
        expect(card.name.trim().length, `${key}.name`).toBeGreaterThan(0);
        expect(card.desc.trim().length, `${key}.desc`).toBeGreaterThan(0);
        expect(card.cta.trim().length, `${key}.cta`).toBeGreaterThan(0);
      }
    }
    // accessible link text is unique per locale (no ambiguous "Open" × 8)
    for (const cat of [en, fa] as const) {
      const ctas = Object.values((cat as typeof en).publicSite.ecosystem.cards).map((c) => c.cta);
      expect(new Set(ctas).size).toBe(ctas.length);
    }
  });
});

describe("87D.1 restored copy — truthful and bilingual", () => {
  const NEW_SECTIONS = ["challenge", "intelligence", "operations", "engineering", "learning", "ecosystem"] as const;

  it("adds no statistics, certifications, testimonials or guarantee language", () => {
    for (const [name, cat] of [["en", en], ["fa", fa], ["de", de]] as const) {
      const json = JSON.stringify(
        NEW_SECTIONS.map((s) => (cat as typeof en).publicSite[s]),
      );
      for (const banned of [
        "SOC 2", "ISO 27001", "1,284", "8,500", "2,400", "120+",
        "we guarantee", "guaranteed uptime", "guaranteed outcome",
        "Technology Partners",
      ]) {
        expect(json.includes(banned), `${name}: banned claim "${banned}"`).toBe(false);
      }
      expect(json).not.toMatch(/\d{3,} ?\+/); // no invented "500+" style counters
    }
  });

  it("fa provides real translations for every new section (values differ from en)", () => {
    for (const section of NEW_SECTIONS) {
      const enTitle = en.publicSite[section].title as string;
      const faTitle = (fa as unknown as typeof en).publicSite[section].title as string;
      expect(faTitle, `fa.${section}.title must be translated`).not.toBe(enTitle);
      expect(/[؀-ۿ]/.test(faTitle), `fa.${section}.title must be Persian`).toBe(true);
    }
  });

  it("de remains byte-identical English carryover for the whole namespace", () => {
    expect(JSON.stringify((de as unknown as typeof en).publicSite)).toBe(JSON.stringify(en.publicSite));
  });

  it("predictive-maintenance copy stays explainable-indicator framing (no black-box promise)", () => {
    expect(en.publicSite.operations.cards.predictive.desc).toContain("explainable");
    expect(en.publicSite.operations.cards.predictive.desc).toContain("never black-box guarantees");
  });
});
