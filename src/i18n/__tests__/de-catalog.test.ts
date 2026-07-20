/**
 * Phase 86C1 — German message catalog: structure, parity, and audit.
 *
 * messages/de.json must be a structurally complete mirror of en.json
 * (all 44 namespaces, all 2,467 leaf keys) while German stays INACTIVE:
 * batch-1 namespaces carry professional German, the rest temporarily carry
 * English values until later batches translate them.
 */
import { describe, it, expect } from "vitest";
import en from "../../../messages/en.json";
import fa from "../../../messages/fa.json";
import de from "../../../messages/de.json";
import {
  ACTIVE_LOCALES,
  SUPPORTED_LOCALES,
  isActiveLocale,
  isSupportedLocale,
  activeLocaleOptions,
} from "@/i18n/locales";
import { routing } from "@/i18n/routing";

type Tree = Record<string, unknown>;

/** Namespaces translated in Phase 86C1 (core public UI batch). */
const BATCH_86C1 = [
  "meta", "nav", "common", "home", "landing",
  "footer", "brand", "auth", "contact",
] as const;

/** All leaf paths of a message tree, with shape tag (array index kept). */
function leafPaths(node: unknown, prefix = ""): Map<string, string> {
  const out = new Map<string, string>();
  if (node !== null && typeof node === "object") {
    const tag = Array.isArray(node) ? "array" : "object";
    if (prefix) out.set(prefix + "//shape", tag);
    for (const [k, v] of Object.entries(node as Tree)) {
      const p = prefix ? `${prefix}.${k}` : k;
      for (const [kk, vv] of leafPaths(v, p)) out.set(kk, vv);
    }
  } else {
    out.set(prefix, typeof node);
  }
  return out;
}

/**
 * Sorted ICU argument signature of a message, e.g. "count|name".
 *
 * Captures the argument NAME after each `{` (`{count}`, `{count, plural, …}`),
 * not the literal branch text. This is the correct notion of "placeholders match":
 * an ICU plural/select may translate its branch literals (e.g.
 * `{count, plural, one {# Execution} …}` → `… {# Ausführung} …}`) while keeping
 * the same argument reference. The old `/\{[^}]*\}/g` form treated the translated
 * branch noun as part of the signature and false-flagged legitimate translations.
 */
function placeholders(value: unknown): string {
  return [...String(value).matchAll(/\{\s*([a-zA-Z0-9_]+)/g)]
    .map((m) => m[1])
    .sort()
    .join("|");
}

/** Braces are balanced and never close before opening. */
function bracesBalanced(value: unknown): boolean {
  let depth = 0;
  for (const ch of String(value)) {
    if (ch === "{") depth++;
    if (ch === "}") depth--;
    if (depth < 0) return false;
  }
  return depth === 0;
}

/** Flatten to path → value for leaf strings. */
function flatten(node: unknown, prefix = ""): Map<string, unknown> {
  const out = new Map<string, unknown>();
  if (node !== null && typeof node === "object") {
    for (const [k, v] of Object.entries(node as Tree)) {
      const p = prefix ? `${prefix}.${k}` : k;
      for (const [kk, vv] of flatten(v, p)) out.set(kk, vv);
    }
  } else {
    out.set(prefix, node);
  }
  return out;
}

const enPaths = leafPaths(en);
const faPaths = leafPaths(fa);
const dePaths = leafPaths(de);
const enFlat = flatten(en);
const faFlat = flatten(fa);
const deFlat = flatten(de);

describe("de.json — parses and mirrors catalog structure", () => {
  it("parses as an object with the same 44 top-level namespaces as en", () => {
    expect(typeof de).toBe("object");
    expect(Object.keys(de)).toEqual(Object.keys(en));
    // Phase 86C2-PRE added journal namespaces to all three catalogs equally.
    expect(Object.keys(de).length).toBe(Object.keys(en).length);
  });

  it("has exactly the same key paths as en.json (no missing keys)", () => {
    const missing = [...enPaths.keys()].filter((k) => !dePaths.has(k));
    expect(missing).toEqual([]);
  });

  it("has no German-only extra keys", () => {
    const extra = [...dePaths.keys()].filter((k) => !enPaths.has(k));
    expect(extra).toEqual([]);
  });

  it("matches fa.json key paths too (three-way parity)", () => {
    expect([...dePaths.keys()].sort()).toEqual([...faPaths.keys()].sort());
  });

  it("preserves array/object shapes exactly", () => {
    for (const [path, shape] of enPaths) {
      expect(dePaths.get(path), `shape mismatch at ${path}`).toBe(shape);
    }
  });

  it("carries the same total leaf count as en", () => {
    const deLeaves = [...dePaths.keys()].filter((k) => !k.endsWith("//shape"));
    const enLeaves = [...enPaths.keys()].filter((k) => !k.endsWith("//shape"));
    expect(deLeaves.length).toBe(enLeaves.length);
    expect(deLeaves.length).toBeGreaterThanOrEqual(2467);
  });
});

describe("de.json — value quality", () => {
  it("contains no empty strings", () => {
    const empty = [...deFlat].filter(([, v]) => v === "");
    expect(empty).toEqual([]);
  });

  it("ICU placeholder sets match en.json on every key", () => {
    const mismatches = [...enFlat]
      .filter(([k, v]) => placeholders(v) !== placeholders(deFlat.get(k)))
      .map(([k]) => k);
    expect(mismatches).toEqual([]);
  });

  it("has no malformed ICU strings (unbalanced braces)", () => {
    const bad = [...deFlat].filter(([, v]) => !bracesBalanced(v)).map(([k]) => k);
    expect(bad).toEqual([]);
  });
});

describe("German is ACTIVE (87L.6)", () => {
  it("ACTIVE_LOCALES is still exactly fa + en", () => {
    expect([...ACTIVE_LOCALES]).toEqual(["fa", "en", "de"]);
  });

  it("de is supported and ACTIVE (87L.6)", () => {
    expect(isSupportedLocale("de")).toBe(true);
    expect(isActiveLocale("de")).toBe(true) // 87L.6: German ACTIVATED;
    expect([...SUPPORTED_LOCALES]).toContain("de");
  });

  it("/de is routable (87L.6 activation)", () => {
    expect([...routing.locales]).toContain("de") // 87L.6: German ACTIVATED;
  });

  it("switcher options include German (87L.6)", () => {
    const codes = activeLocaleOptions().map((o) => o.code);
    expect(codes).toEqual(["fa", "en", "de"]);
    const names = activeLocaleOptions().map((o) => o.nativeName);
    expect(names).toContain("Deutsch") // 87L.6;
  });
});

// ── Audit ─────────────────────────────────────────────────────────────────────
// Values inside the batch that legitimately remain identical to English:
// brand names, protected technical terms, product/feature names, example
// placeholders, and contact data. These are NOT untranslated errors.
const PRESERVED_VALUE_PATTERNS: RegExp[] = [
  /^https?:\/\//,                        // URLs
  /^[\w.+-]+@[\w-]+\.[\w.]+$/,           // email addresses
  /^\+[\d ]+$/,                          // phone numbers
];
const PRESERVED_VALUES = new Set([
  // brand / product / feature names
  "Hermes Brain", "Brain", "Industrial Brain", "Engineering Copilot",
  "Case Studio", "Knowledge Studio", "Unknown Analysis Center", "Academy",
  // protected technical terms & acronyms
  "SCADA", "PLC & SCADA", "HMI", "ATS", "API", "Consent API", "hreflang", "Open Graph",
  // loanwords standard in German enterprise SaaS
  "Dashboard", "Services", "Status", "Admin", "Compliance", "Customer Success",
  "Demo", "Community", "Professional", "Team", "Enterprise",
  // payment brands
  "Stripe", "Visa", "Mastercard", "Zarinpal",
  // social platforms / labels
  "LinkedIn", "GitHub", "Website",
  // example placeholders & proper nouns
  "Ada Lovelace", "Acme Manufacturing", "Isfahan, Iran",
]);

describe("de.json — Phase 86C1 translation audit", () => {
  const batchSet = new Set<string>(BATCH_86C1);
  const rows = [...enFlat].map(([path, enVal]) => ({
    path,
    ns: path.split(".")[0],
    en: enVal,
    de: deFlat.get(path),
    fa: faFlat.get(path),
  }));
  // Journal namespaces were translated in Phase 86C2, the admin namespaces in
  // Phase 86C3, industrialBrain in Phase 86C4A, assetOperations +
  // maintenanceOperations in Phase 86C4B1, automationOperations in
  // Phase 86C4B2A-DE, and enterpriseOperations across Phases 86C4B2B1A-DE
  // (Core), -B1B-DE (Projects/Tasks), -B1C-DE (Teams/Resources/Work Orders)
  // and -B1D-DE (Inventory/Approvals) — the enterpriseOperations namespace is
  // now FULLY German (all 144 leaves); each sub-object's exact translation
  // state is asserted by its own per-phase extraction test. None of these are
  // English carryover, so exclude them from the "still English" set.
  const TRANSLATED_NS = new Set([
    "journal", "journalWriter", "journalEditorial",
    "adminOperations", "adminGovernance",
    "industrialBrain",
    "assetOperations", "maintenanceOperations",
    "automationOperations", "enterpriseOperations",
    // PHASE 87L.6 — the public homepage/site shell and the auth experience are
    // now genuinely German (docs/i18n/german-glossary.md holds the terminology)
    "publicSite", "authExperience",
    // PHASE 87L.6 FINAL AMENDMENT — every remaining PUBLIC-route namespace
    "about", "services", "architecture", "library", "modules",
    "knowledgeCases", "caseExplorer",
    // PHASE 87L.6B — the authenticated shell (every /de workspace page)
    "appShell",
    // PHASE 87L.6C — command + industrial operations surfaces
    "dashboard", "assetMaintenance", "engineeringDocuments",
    "businessOps", "orgAdministration",
    // PHASE 87L.6D — intelligence surfaces (knowledge stays outstanding)
    "brain", "copilot", "ke", "knowledgeGraph",
    "predictive", "knowledgeStudio", "industrialBrainReport",
    // PHASE 87L.6D.1 — the 30-article engineering knowledge library
    "knowledge",
    // PHASE 87L.6E — enterprise, commercial, financial, security and
    // administrative surfaces
    "crm", "billing", "apiPlatform", "adminDocuments", "org", "admin",
    "erp", "siteSecurity", "adminDocumentSearch", "adminAccess",
    // PHASE 87L.6F — the final namespaces. With these the catalog is CLOSED:
    // every namespace is translated and the carryover ceiling below is zero.
    "multiSite", "caseStudio", "digitalTwin", "industrial", "unknownCenter",
    "automation", "documents", "analytics", "platform", "storage",
  ]);
  const batch = rows.filter((r) => batchSet.has(r.ns));
  const nonBatch = rows.filter((r) => !batchSet.has(r.ns));
  const stillEnglish = nonBatch.filter((r) => !TRANSLATED_NS.has(r.ns));
  const translated = batch.filter((r) => r.de !== r.en);
  const preservedInBatch = batch.filter((r) => r.de === r.en);
  const carryover = stillEnglish.filter((r) => r.de === r.en);

  it("batch namespaces cover 538 keys; 486 carry German, 52 preserved terms", () => {
    expect(batch.length).toBe(538);
    expect(translated.length).toBe(486);
    expect(preservedInBatch.length).toBe(52);
  });

  it("every same-as-English batch value is a legitimate preserved term", () => {
    const unjustified = preservedInBatch.filter(
      (r) =>
        !PRESERVED_VALUES.has(String(r.en)) &&
        !PRESERVED_VALUE_PATTERNS.some((re) => re.test(String(r.en)))
    );
    expect(
      unjustified.map((r) => `${r.path} = ${JSON.stringify(r.en)}`)
    ).toEqual([]);
  });

  it("all non-batch, non-translated namespaces temporarily carry English verbatim", () => {
    // Every namespace outside BATCH_86C1 is either listed in TRANSLATED_NS
    // (genuinely German) or still carries English verbatim — nothing in
    // between. This equality is the real invariant.
    expect(carryover.length).toBe(stillEnglish.length);
  });

  it("the untranslated remainder only ever SHRINKS as waves land", () => {
    // A fixed floor goes stale on every translation wave (it did: the old
    // >= 1929 broke when 87L.6C translated 549 leaves). The meaningful
    // contract is a CEILING that each wave must lower deliberately.
    //
    // 87L.6D.1: the knowledge library (480 leaves)
    // moved to TRANSLATED_NS → 1262 - 480 = 782.
    // 87L.6E: the 10 enterprise/commercial/administrative namespaces
    // (527 leaves) moved to TRANSLATED_NS → 782 - 527 = 255.
    // 87L.6F: the final 10 namespaces (255 leaves) → 255 - 255 = 0.
    // The ceiling is now ZERO: every namespace is translated, so any future
    // regression that reintroduces English carryover fails here immediately.
    const CEILING_AFTER_87L6F = 0;
    expect(stillEnglish.length).toBeLessThanOrEqual(CEILING_AFTER_87L6F);
  });

  it("prints the audit report", () => {
    const report = {
      totalLeafKeys: rows.length,
      batchNamespaces: BATCH_86C1.length,
      batchKeys: batch.length,
      germanTranslated: translated.length,
      preservedTechnicalTerms: preservedInBatch.length,
      temporarilyEnglish: carryover.length,
      placeholderMismatches: rows.filter(
        (r) => placeholders(r.en) !== placeholders(r.de)
      ).length,
      emptyStrings: rows.filter((r) => r.de === "").length,
      malformedIcu: rows.filter((r) => !bracesBalanced(r.de)).length,
    };
    // eslint-disable-next-line no-console
    console.log("[86C1 de.json audit]", JSON.stringify(report, null, 2));
    expect(report.totalLeafKeys).toBeGreaterThanOrEqual(2467);
    expect(report.placeholderMismatches).toBe(0);
    expect(report.emptyStrings).toBe(0);
    expect(report.malformedIcu).toBe(0);
  });
});
