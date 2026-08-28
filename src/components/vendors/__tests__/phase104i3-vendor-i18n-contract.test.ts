import { describe, it, expect } from "vitest";
import en from "../../../../messages/en.json";
import de from "../../../../messages/de.json";
import fa from "../../../../messages/fa.json";
import {
  VENDOR_TYPES,
  SERVICES_OPTIONS,
  INDUSTRIAL_EXPERTISE_OPTIONS,
  REGIONS_OPTIONS,
  CERTIFICATIONS_OPTIONS,
} from "@/lib/vendors/types";

/**
 * PHASE 104-I3 — the vendor public surface must be catalogue-backed in all three
 * locales, and the UI/domain boundary must stay where it is.
 *
 * Before this phase /vendors, /vendors/apply and every control inside them were
 * English literals in the component tree, so a German or Persian visitor read an
 * English directory and an English partner-application form. These are contract
 * assertions on the catalogue and on the option taxonomy — not snapshots.
 */

type Tree = Record<string, unknown>;
const V = { en: en.vendors as Tree, de: de.vendors as Tree, fa: fa.vendors as Tree };

const leaves = (o: unknown, p = ""): [string, string][] =>
  o !== null && typeof o === "object"
    ? Object.entries(o as Tree).flatMap(([k, v]) => leaves(v, p ? `${p}.${k}` : k))
    : [[p, String(o)]];

const map = (t: Tree) => new Map(leaves(t));
const EN = map(V.en), DE = map(V.de), FA = map(V.fa);

describe("104-I3 — vendors namespace exists in all three locales with exact parity", () => {
  it("has the same key set in en, de and fa", () => {
    const k = (m: Map<string, string>) => [...m.keys()].sort();
    expect(k(DE)).toEqual(k(EN));
    expect(k(FA)).toEqual(k(EN));
  });

  it("covers the directory, card, apply-form and taxonomy groups", () => {
    for (const group of ["directory", "types", "tiers", "card", "regions", "services", "expertise", "apply"]) {
      expect(Object.keys(V.en), `vendors.${group} missing`).toContain(group);
    }
    // The application form is the surface that was worst affected; assert it is
    // substantially covered rather than stubbed with a handful of keys.
    const formKeys = [...EN.keys()].filter((p) => p.startsWith("apply.form."));
    expect(formKeys.length).toBeGreaterThan(35);
  });

  it("leaves no empty or whitespace-only value in any locale", () => {
    for (const [name, m] of [["en", EN], ["de", DE], ["fa", FA]] as const) {
      const blank = [...m].filter(([, v]) => v.trim() === "").map(([p]) => p);
      expect(blank, `${name} has blank vendor leaves`).toEqual([]);
    }
  });
});

describe("104-I3 — the option taxonomy is fully labelled, values stay canonical", () => {
  /**
   * The chip/select VALUES are persisted (servicesOffered, industrialExpertise,
   * regionsServed) and filtered on server-side (vendorType). A missing label
   * would render a raw key or an untranslated value in the UI, so every
   * canonical option must resolve in every locale.
   */
  const groups = [
    ["types",     VENDOR_TYPES],
    ["services",  SERVICES_OPTIONS],
    ["expertise", INDUSTRIAL_EXPERTISE_OPTIONS],
    ["regions",   REGIONS_OPTIONS],
  ] as const;

  it.each(groups)("every %s option has a label in en, de and fa", (group, options) => {
    for (const opt of options) {
      for (const [name, m] of [["en", EN], ["de", DE], ["fa", FA]] as const) {
        expect(m.get(`${group}.${opt}`), `${name}: ${group}.${opt} unlabelled`).toBeTruthy();
      }
    }
  });

  it("labels no more options than the domain actually defines (no stale labels)", () => {
    for (const [group, options] of groups) {
      const labelled = [...EN.keys()].filter((p) => p.startsWith(`${group}.`)).map((p) => p.slice(group.length + 1));
      expect(labelled.sort()).toEqual([...options].sort());
    }
  });

  it("does NOT translate certifications — they are registered designations", () => {
    // ISO 9001, IEC 62443, TÜV Certified, Siemens Solution Partner … Translating
    // these would misstate what an applicant actually holds, so the component
    // renders the canonical value and no catalogue group exists for them.
    expect(Object.keys(V.en)).not.toContain("certifications");
    expect(CERTIFICATIONS_OPTIONS.length).toBeGreaterThan(0);
  });
});

describe("104-I3 — German and Persian are genuinely translated, not carried over", () => {
  /**
   * Leaves that are legitimately identical across locales: sample tokens, URLs,
   * loanwords and place names. Anything else being identical means the string
   * was never translated.
   */
  const INTENTIONAL_DE = new Set([
    "apply.form.websiteUrl",              // "Website" is the German word too
    "apply.form.websiteUrlPlaceholder",   // URL token
    "regions.Iran",                        // place name
    "tiers.PREMIUM", "tiers.STANDARD",    // established loanwords
    "types.DISTRIBUTOR",                   // identical in German
    "card.compliance",                     // established loanword
  ]);
  const INTENTIONAL_FA = new Set([
    "apply.form.websiteUrlPlaceholder",
    "apply.form.contactEmailPlaceholder",
  ]);

  it("has no unapproved German carryover in the vendors namespace", () => {
    const carried = [...EN].filter(([p, v]) => DE.get(p) === v && !INTENTIONAL_DE.has(p)).map(([p]) => p);
    expect(carried).toEqual([]);
  });

  it("has no unapproved English carryover in the Persian vendors namespace", () => {
    const carried = [...EN].filter(([p, v]) => FA.get(p) === v && !INTENTIONAL_FA.has(p)).map(([p]) => p);
    expect(carried).toEqual([]);
  });

  it("keeps Persian script out of the English and German catalogues", () => {
    const PERSIAN = /[؀-ۿ]/;
    for (const [name, m] of [["en", EN], ["de", DE]] as const) {
      const hits = [...m].filter(([, v]) => PERSIAN.test(v)).map(([p]) => p);
      expect(hits, `${name} carries Persian script`).toEqual([]);
    }
  });

  it("uses Persian ی and ک, never the Arabic forms", () => {
    const ARABIC_YEH = /ي/, ARABIC_KAF = /ك/;
    const bad = [...FA].filter(([, v]) => ARABIC_YEH.test(v) || ARABIC_KAF.test(v)).map(([p]) => p);
    expect(bad).toEqual([]);
  });
});

describe("104-I3 — no fabricated business claims on the vendor surface", () => {
  it("promises no review turnaround anywhere in the namespace", () => {
    // The former apply lede and success message both asserted a "within 5
    // business days" review. Nothing in the product evidences a turnaround, so
    // no locale may claim one.
    const claim = /\b\d+\s*(business\s+day|Werktag|Arbeitstag)/i;
    for (const [name, m] of [["en", EN], ["de", DE], ["fa", FA]] as const) {
      const hits = [...m].filter(([, v]) => claim.test(v)).map(([p]) => p);
      expect(hits, `${name} promises a turnaround`).toEqual([]);
    }
    const faDays = [...FA].filter(([, v]) => /روز\s*کاری/.test(v)).map(([p]) => p);
    expect(faDays).toEqual([]);
  });

  it("uses no invented company name as a placeholder", () => {
    // "Acme Industrial Solutions" was shipped as the company-name placeholder.
    // Placeholders now describe the expected input instead of inventing a firm.
    for (const [name, m] of [["en", EN], ["de", DE], ["fa", FA]] as const) {
      const hits = [...m].filter(([, v]) => /\bacme\b/i.test(v)).map(([p]) => p);
      expect(hits, `${name} still ships an invented company`).toEqual([]);
    }
  });

  it("distinguishes 'nothing published' from 'filters matched nothing'", () => {
    // Collapsing these misreports an empty directory as a failed search.
    for (const [name, m] of [["en", EN], ["de", DE], ["fa", FA]] as const) {
      expect(m.get("directory.emptyNone"), name).toBeTruthy();
      expect(m.get("directory.emptyFiltered"), name).toBeTruthy();
      expect(m.get("directory.emptyNone")).not.toBe(m.get("directory.emptyFiltered"));
    }
  });
});
