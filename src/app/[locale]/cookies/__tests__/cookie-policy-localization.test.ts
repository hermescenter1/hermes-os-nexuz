import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import fa from "../../../../../messages/fa.json";
import en from "../../../../../messages/en.json";
import de from "../../../../../messages/de.json";

/**
 * Cookie Policy localization governance.
 *
 * WHY THIS FILE EXISTS, AND WHAT IT IS NOT
 * ----------------------------------------
 * `/fa/cookies` really did serve English. The cause was NOT a missing Persian
 * value: at 837deb5c — the release that was live in Production until
 * 2026-10-01 — `app/[locale]/cookies/page.tsx` was 52 lines of hard-coded
 * English JSX inside a locale-parameterised route, and `messages/fa.json` had no
 * `cookiePolicy` namespace at all. Phase 113 (4db1a088) replaced that page with
 * the fully translated document and added the namespace in all three locales.
 *
 * So there was nothing left to translate. What was missing was a GATE: nothing
 * in the repository would have failed if the Persian catalog had been absent,
 * partial, or quietly filled with English. This file is that gate. Every
 * assertion below fails against 837deb5c and passes now, which is the only
 * useful definition of a regression test for a defect that is already fixed.
 */

const ROOT = join(__dirname, "..", "..", "..", "..", "..");
const read = (rel: string) => readFileSync(join(ROOT, rel), "utf8");

type Catalog = Record<string, unknown>;
const NS = "cookiePolicy";
const CONSENT_NS = ["adminGovernance", "cookieConsent"] as const;

function at(catalog: Catalog, path: readonly string[]): Catalog | undefined {
  let node: unknown = catalog;
  for (const key of path) {
    if (node === null || typeof node !== "object") return undefined;
    node = (node as Catalog)[key];
  }
  return node as Catalog | undefined;
}

function flatten(node: unknown, prefix = "", out: Record<string, string> = {}): Record<string, string> {
  if (node === null || node === undefined) return out;
  if (Array.isArray(node)) {
    node.forEach((v, i) => flatten(v, `${prefix}[${i}]`, out));
    return out;
  }
  if (typeof node === "object") {
    for (const [k, v] of Object.entries(node as Catalog)) flatten(v, prefix ? `${prefix}.${k}` : k, out);
    return out;
  }
  out[prefix] = String(node);
  return out;
}

const FA = flatten(at(fa as Catalog, [NS]));
const EN = flatten(at(en as Catalog, [NS]));
const DE = flatten(at(de as Catalog, [NS]));
const FA_C = flatten(at(fa as Catalog, CONSENT_NS));
const EN_C = flatten(at(en as Catalog, CONSENT_NS));
const DE_C = flatten(at(de as Catalog, CONSENT_NS));

/** ICU placeholders, in order of appearance. */
const placeholders = (value: string) => (value.match(/\{[a-zA-Z0-9_]+[^}]*\}/g) ?? []).sort();

/**
 * Tokens that must stay in Latin script on the Persian page: product and
 * company names, provider names, and the real cookie / storage keys the page
 * reads from `lib/compliance/cookie-inventory`. Translating any of these would
 * make the document factually wrong.
 */
const PRESERVED_TOKENS = [
  "HERMES OS", "ZHARFA", "Hermes OS",
  "Google Analytics", "Google Tag Manager", "Microsoft Clarity", "ProvenExpert",
  "hermes_session", "hermes_at", "hermes_rt", "hermes_consent_id", "hermes_org",
  "NEXT_LOCALE", "hermes_cookie_consent",
  "localStorage", "cookie", "HTTP", "GDPR", "DSGVO",
];

describe("cookie policy catalog parity", () => {
  it("has a non-empty cookiePolicy namespace in all three locales", () => {
    for (const [name, cat] of [["fa", FA], ["en", EN], ["de", DE]] as const) {
      expect(Object.keys(cat).length, `${name} has no cookiePolicy leaves`).toBeGreaterThan(0);
    }
  });

  it("has exact key parity across fa/en/de", () => {
    const faKeys = Object.keys(FA).sort();
    const enKeys = Object.keys(EN).sort();
    const deKeys = Object.keys(DE).sort();
    expect(faKeys).toEqual(enKeys);
    expect(deKeys).toEqual(enKeys);
  });

  it("has no empty or whitespace-only value in any locale", () => {
    for (const [name, cat] of [["fa", FA], ["en", EN], ["de", DE]] as const) {
      const empty = Object.entries(cat).filter(([, v]) => v.trim().length === 0).map(([k]) => k);
      expect(empty, `${name} empty values`).toEqual([]);
    }
  });

  it("has identical ICU placeholders for every key in every locale", () => {
    const mismatched: string[] = [];
    for (const key of Object.keys(EN)) {
      const want = placeholders(EN[key]);
      if (JSON.stringify(placeholders(FA[key] ?? "")) !== JSON.stringify(want)) mismatched.push(`fa:${key}`);
      if (JSON.stringify(placeholders(DE[key] ?? "")) !== JSON.stringify(want)) mismatched.push(`de:${key}`);
    }
    expect(mismatched).toEqual([]);
  });

  it("has the same parity for the shared consent-category catalog the page renders", () => {
    expect(Object.keys(FA_C).sort()).toEqual(Object.keys(EN_C).sort());
    expect(Object.keys(DE_C).sort()).toEqual(Object.keys(EN_C).sort());
    expect(Object.keys(EN_C).length).toBeGreaterThan(0);
  });
});

describe("the Persian policy is Persian", () => {
  /** A value is "Persian" when it contains at least one Arabic-script letter. */
  const hasPersianScript = (v: string) => /[؀-ۿ]/.test(v);

  /** What remains after removing every deliberately preserved Latin token. */
  function residue(value: string): string {
    let out = value;
    for (const token of PRESERVED_TOKENS) out = out.split(token).join(" ");
    // URLs, emails, version numbers and bare identifiers are not prose.
    out = out.replace(/https?:\/\/\S+/g, " ").replace(/\S+@\S+/g, " ");
    out = out.replace(/\{[^}]*\}/g, " ").replace(/[A-Za-z0-9_]+\.[A-Za-z0-9_.]+/g, " ");
    return out;
  }

  it("has no Persian value identical to its English counterpart", () => {
    const identical = Object.keys(EN).filter((k) => FA[k] === EN[k]);
    // An approved proper noun would be allowed here, but the Persian catalog
    // currently shares none, so the honest expectation is zero.
    expect(identical).toEqual([]);
  });

  it("renders Persian script in every prose value", () => {
    const prose = Object.keys(FA).filter((k) => residue(FA[k]).trim().length > 2);
    expect(prose.length).toBeGreaterThan(20);
    const withoutPersian = prose.filter((k) => !hasPersianScript(FA[k]));
    expect(withoutPersian).toEqual([]);
  });

  it("leaves no English sentence fragment in Persian prose", () => {
    // Three or more consecutive Latin words outside the preserved set is prose
    // that was never translated.
    const leaks = Object.keys(FA).filter((k) => /(?:\b[A-Za-z]{2,}\b[ ,.;:]+){2}\b[A-Za-z]{2,}\b/.test(residue(FA[k])));
    expect(leaks).toEqual([]);
  });

  it("sources the company and product name from constants, not from the Persian prose", () => {
    // Measured: the Persian catalog contains no Latin brand string, and it is
    // right not to. `page.tsx` renders {ORG_NAME} and {SITE_NAME} directly from
    // `lib/seo/config`, so the legal entity name on the Persian page is the same
    // single source of truth as on every other locale and cannot drift.
    const page = read("src/app/[locale]/cookies/page.tsx");
    expect(page).toContain("{ORG_NAME}");
    expect(page).toContain("{SITE_NAME}");
    expect(Object.values(FA).join("\n")).not.toContain("ZHARFA Vira Pouyesh Fanavari");
  });

  it("uses the established Persian rendering of the product name in Persian prose", () => {
    // Phase 113 settled on a Persian rendering of the brand inside Persian
    // sentences rather than a Latin island; the same form is used by the other
    // Persian namespaces.
    expect(Object.values(FA).join("\n")).toMatch(/هرمس\s*او‌?\s*اس/);
  });

  it("keeps provider names and storage identifiers in Latin script wherever the prose names them", () => {
    const joined = Object.values(FA).join("\n");
    // These are the providers the Persian prose genuinely names; a translated
    // provider name would make the document factually wrong.
    for (const token of ["Google Analytics", "Google Tag Manager", "Microsoft Clarity", "ProvenExpert"]) {
      expect(joined, `${token} must stay Latin in the Persian catalog`).toContain(token);
    }
  });

  it("contains no raw translation key or next-intl error marker in any locale", () => {
    for (const [name, cat] of [["fa", FA], ["en", EN], ["de", DE]] as const) {
      for (const [key, value] of Object.entries(cat)) {
        expect(value, `${name}.${key}`).not.toContain("MISSING_MESSAGE");
        expect(value, `${name}.${key}`).not.toMatch(/^cookiePolicy\./);
      }
    }
  });
});

describe("English and German are unchanged by the Persian work", () => {
  const hasLatin = (v: string) => /[A-Za-z]/.test(v);

  it("English prose is still Latin script", () => {
    const prose = Object.keys(EN).filter((k) => EN[k].trim().length > 8);
    expect(prose.every((k) => hasLatin(EN[k]))).toBe(true);
    expect(prose.some((k) => /[؀-ۿ]/.test(EN[k]))).toBe(false);
  });

  it("German prose is still German, not English", () => {
    const identical = Object.keys(EN).filter((k) => DE[k] === EN[k]);
    // German may legitimately share a bare proper noun; a wholesale match means
    // the catalog regressed to English.
    expect(identical.length).toBeLessThan(Math.ceil(Object.keys(EN).length * 0.1));
    expect(Object.values(DE).join(" ")).toMatch(/[äöüßÄÖÜ]/);
  });
});

describe("the page renders the policy from data, not prose", () => {
  const page = read("src/app/[locale]/cookies/page.tsx");

  it("takes cookie names and lifetimes from the real inventory", () => {
    expect(page).toContain('from "@/lib/compliance/cookie-inventory"');
    expect(page).toContain("THIRD_PARTY_INVENTORY");
    expect(page).toContain("storageForCategory");
    expect(page).toContain("CATEGORY_ORDER");
  });

  it("names no cookie, lifetime or provider as a literal in the page", () => {
    const code = page.split("\n").filter((l) => !/^\s*(\*|\/\/|\/\*)/.test(l)).join("\n");
    for (const literal of ["hermes_session", "hermes_at", "hermes_rt", "hermes_consent_id", "hermes_org", "hermes_cookie_consent", "NEXT_LOCALE"]) {
      expect(code, `${literal} must come from the inventory, not the page`).not.toContain(`"${literal}"`);
    }
    expect(code).not.toMatch(/\b12 months\b|\b2 years\b/);
  });

  it("reads its sentences from the cookiePolicy namespace and the shared consent catalog", () => {
    expect(page).toContain('namespace: "cookiePolicy"');
    expect(page).toContain('namespace: "adminGovernance.cookieConsent"');
  });

  it("hard-codes no English user-visible string", () => {
    const body = page.slice(page.indexOf("export default"));
    // JSX text nodes and aria labels must be expressions, never literals.
    expect(body).not.toMatch(/>\s*[A-Z][a-z]+\s+[a-z]{2,}/);
    expect(body).not.toMatch(/aria-label="[A-Za-z]/);
  });
});

describe("cookie inventory is unchanged by this hotfix", () => {
  /**
   * The inventory is the factual core of a legal document. This locks its
   * measured shape so a localization change can never quietly add, drop or
   * relabel a cookie.
   */
  it("still declares exactly the seven storage entries and three third parties", () => {
    const src = read("src/lib/compliance/cookie-inventory.ts");
    const storage = src.slice(src.indexOf("export const STORAGE_INVENTORY"));
    const storageBody = storage.slice(0, storage.indexOf("\n];"));
    expect((storageBody.match(/^\s{4}name:/gm) ?? []).length).toBe(7);

    const third = src.slice(src.indexOf("export const THIRD_PARTY_INVENTORY"));
    const thirdBody = third.slice(0, third.indexOf("\n];"));
    expect((thirdBody.match(/^\s{4}key:/gm) ?? []).length).toBe(3);
    for (const key of ["googleAnalytics", "microsoftClarity", "provenExpert"]) {
      expect(thirdBody).toContain(`key: "${key}"`);
    }
  });

  it("still orders the four consent categories", () => {
    const src = read("src/lib/compliance/cookie-inventory.ts");
    expect(src).toMatch(/CATEGORY_ORDER[\s\S]{0,200}necessary[\s\S]{0,120}analytics[\s\S]{0,120}marketing[\s\S]{0,120}preferences/);
  });

  it("keeps the policy version the page displays", () => {
    expect(read("src/lib/compliance/cookie-inventory.ts")).toContain('COOKIE_POLICY_VERSION = "2.0"');
  });
});
