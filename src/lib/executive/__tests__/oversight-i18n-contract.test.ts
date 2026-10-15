/**
 * Financial activity and approvals — the translation contract.
 *
 * The keys are derived from the VIEW'S OWN SOURCE at test time, not retyped
 * here, so a label added to the component without its catalogue entry fails
 * this test instead of rendering MISSING_MESSAGE in production. Template keys
 * (`age.*`, `outcome.*`) are expanded from the same closed lists the view and
 * the aggregation use.
 */
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import en from "../../../../messages/en.json";
import fa from "../../../../messages/fa.json";
import de from "../../../../messages/de.json";

const ROOT = join(__dirname, "..", "..", "..", "..");
const VIEW = readFileSync(join(ROOT, "src/components/executive/FinancialOversightView.tsx"), "utf8");
const PAGE = readFileSync(join(ROOT, "src/app/[locale]/dashboard/executive/oversight/page.tsx"), "utf8");
const SUMMARY_VIEW = readFileSync(join(ROOT, "src/components/executive/ExecutiveSummaryView.tsx"), "utf8");

type Catalogue = Record<string, unknown>;

function resolve(catalogue: Catalogue, dotted: string): unknown {
  return dotted.split(".").reduce<unknown>(
    (node, part) => (node !== null && typeof node === "object" ? (node as Record<string, unknown>)[part] : undefined),
    catalogue,
  );
}

function literalKeys(source: string): string[] {
  return [...source.matchAll(/\bt\("([A-Za-z0-9_.]+)"/g)].map(m => m[1]);
}

const AGE_KEYS = ["underOneDay", "oneToThreeDays", "threeToSevenDays", "overSevenDays"];
const OUTCOME_KEYS = ["approved", "rejected", "cancelled"];

const derived = [
  ...new Set([
    ...literalKeys(VIEW),
    ...literalKeys(PAGE),
    ...literalKeys(SUMMARY_VIEW).filter(k => k.startsWith("oversight.")),
    ...AGE_KEYS.map(k => `oversight.approvals.age.${k}`),
    ...OUTCOME_KEYS.map(k => `oversight.approvals.outcome.${k}`),
  ]),
].sort();

describe("every key the oversight surface reads exists in all three catalogues", () => {
  it("derives a non-trivial key set from the source (guards the derivation itself)", () => {
    expect(derived.length).toBeGreaterThan(40);
    expect(derived).toContain("oversight.cost.noExchangeRate");
    expect(derived).toContain("oversight.cost.notAccounting");
  });

  for (const [name, catalogue] of [
    ["en", en],
    ["fa", fa],
    ["de", de],
  ] as const) {
    it(`${name} resolves every derived key to a non-empty string`, () => {
      const missing = derived.filter(key => {
        const value = resolve((catalogue as Catalogue).executive as Catalogue, key);
        return typeof value !== "string" || value.trim().length === 0;
      });
      expect(missing).toEqual([]);
    });
  }

  it("keeps the ICU arguments identical across the three languages", () => {
    const args = (value: unknown) =>
      typeof value === "string" ? [...new Set([...value.matchAll(/\{(\w+)/g)].map(m => m[1]))].sort() : [];
    const drift = derived.filter(key => {
      const e = args(resolve((en as Catalogue).executive as Catalogue, key));
      const f = args(resolve((fa as Catalogue).executive as Catalogue, key));
      const d = args(resolve((de as Catalogue).executive as Catalogue, key));
      return JSON.stringify(e) !== JSON.stringify(f) || JSON.stringify(e) !== JSON.stringify(d);
    });
    expect(drift).toEqual([]);
  });

  it("never interpolates a count as a bare argument, so Persian prints Persian digits", () => {
    // A bare {approved} hands ICU a raw JavaScript number, which renders as
    // Latin digits inside Persian text. Found live: "1 تأیید · 0 رد". A count
    // must go through `, number` or a plural, both of which localise digits.
    for (const catalogue of [en, fa, de]) {
      const text = JSON.stringify((catalogue as unknown as { executive: { oversight: unknown } }).executive.oversight);
      expect(text).not.toMatch(/\{(approved|rejected|sampled|total|over|count)\}/);
    }
  });

  it("writes Persian with Persian ی and ک, never the Arabic forms", () => {
    const oversight = JSON.stringify((fa as Catalogue & { executive: { oversight: unknown } }).executive.oversight);
    expect(oversight).not.toMatch(/[يك]/);
  });

  it("says, in every language, that currencies are never added together and that this is not accounting", () => {
    for (const catalogue of [en, fa, de]) {
      const o = (catalogue as unknown as { executive: { oversight: { cost: Record<string, string> } } }).executive
        .oversight.cost;
      expect(o.noExchangeRate.length).toBeGreaterThan(40);
      expect(o.notAccounting.length).toBeGreaterThan(40);
    }
  });
});
