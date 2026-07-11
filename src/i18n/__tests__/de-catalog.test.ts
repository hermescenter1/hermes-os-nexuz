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

/** Sorted ICU placeholder signature of a message, e.g. "{count}|{name}". */
function placeholders(value: unknown): string {
  return (String(value).match(/\{[^}]*\}/g) ?? []).sort().join("|");
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
    expect(Object.keys(de).length).toBe(44);
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

  it("carries the expected total leaf count", () => {
    const leaves = [...dePaths.keys()].filter((k) => !k.endsWith("//shape"));
    expect(leaves.length).toBe(2467);
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

describe("German remains inactive and hidden", () => {
  it("ACTIVE_LOCALES is still exactly fa + en", () => {
    expect([...ACTIVE_LOCALES]).toEqual(["fa", "en"]);
  });

  it("de is supported but not active", () => {
    expect(isSupportedLocale("de")).toBe(true);
    expect(isActiveLocale("de")).toBe(false);
    expect([...SUPPORTED_LOCALES]).toContain("de");
  });

  it("/de is not routable (routing.locales excludes de)", () => {
    expect([...routing.locales]).not.toContain("de");
  });

  it("switcher options do not include German", () => {
    const codes = activeLocaleOptions().map((o) => o.code);
    expect(codes).toEqual(["fa", "en"]);
    const names = activeLocaleOptions().map((o) => o.nativeName);
    expect(names).not.toContain("Deutsch");
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
  const batch = rows.filter((r) => batchSet.has(r.ns));
  const nonBatch = rows.filter((r) => !batchSet.has(r.ns));
  const translated = batch.filter((r) => r.de !== r.en);
  const preservedInBatch = batch.filter((r) => r.de === r.en);
  const carryover = nonBatch.filter((r) => r.de === r.en);

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

  it("all non-batch namespaces temporarily carry English verbatim", () => {
    expect(nonBatch.length).toBe(1929);
    expect(carryover.length).toBe(1929);
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
    expect(report.totalLeafKeys).toBe(2467);
    expect(report.placeholderMismatches).toBe(0);
    expect(report.emptyStrings).toBe(0);
    expect(report.malformedIcu).toBe(0);
  });
});
