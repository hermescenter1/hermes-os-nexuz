/**
 * Tomorrow's priorities — the translation contract.
 *
 * Literal keys come from the view's own source; the per-rule keys come from
 * `PRIORITY_RULES` itself, so adding a rule without its reason sentence and its
 * documentation sentence fails here — in all three languages — rather than
 * rendering a raw key on the screen a manager acts from.
 */
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import en from "../../../../messages/en.json";
import fa from "../../../../messages/fa.json";
import de from "../../../../messages/de.json";
import { PRIORITY_RULES } from "../priorities";

const ROOT = join(__dirname, "..", "..", "..", "..");
const VIEW = readFileSync(join(ROOT, "src/components/executive/TomorrowsPrioritiesView.tsx"), "utf8");
const PAGE = readFileSync(join(ROOT, "src/app/[locale]/dashboard/executive/priorities/page.tsx"), "utf8");

type Catalogue = Record<string, unknown>;
const exec = (c: unknown) => (c as { executive: Catalogue }).executive;

function resolve(catalogue: Catalogue, dotted: string): unknown {
  return dotted
    .split(".")
    .reduce<unknown>((node, part) => (node !== null && typeof node === "object" ? (node as Catalogue)[part] : undefined), catalogue);
}

const literal = (source: string) => [...source.matchAll(/\bt\("([A-Za-z0-9_.]+)"/g)].map(m => m[1]);

const derived = [
  ...new Set([
    ...literal(VIEW),
    ...literal(PAGE),
    ...PRIORITY_RULES.flatMap(r => [`priorities.reason.${r.id}`, `priorities.rule.${r.id}`]),
    ...[1, 2, 3].map(n => `priorities.tier.${n}`),
    ...["TASK", "WORK_ORDER", "APPROVAL", "ALERT"].map(k => `priorities.kind.${k}`),
    ...["tasks", "workOrders", "approvals", "alerts"].map(s => `priorities.source.${s}`),
    "priorities.duration.days",
    "priorities.duration.hours",
  ]),
].sort();

describe("every key the priorities surface reads exists in all three catalogues", () => {
  it("derives a non-trivial key set (guards the derivation itself)", () => {
    expect(derived.length).toBeGreaterThan(40);
    expect(derived).toContain("priorities.reason.APPROVAL_CRITICALLY_LATE");
    expect(derived).toContain("priorities.rule.WORK_DUE_SOON");
  });

  for (const [name, catalogue] of [
    ["en", en],
    ["fa", fa],
    ["de", de],
  ] as const) {
    it(`${name} resolves every derived key to a non-empty string`, () => {
      const missing = derived.filter(key => {
        const value = resolve(exec(catalogue), key);
        return typeof value !== "string" || value.trim().length === 0;
      });
      expect(missing).toEqual([]);
    });
  }

  it("keeps the ICU arguments identical across the three languages", () => {
    const args = (v: unknown) =>
      typeof v === "string" ? [...new Set([...v.matchAll(/\{(\w+)/g)].map(m => m[1]))].sort() : [];
    const drift = derived.filter(key => {
      const e = JSON.stringify(args(resolve(exec(en), key)));
      return e !== JSON.stringify(args(resolve(exec(fa), key))) || e !== JSON.stringify(args(resolve(exec(de), key)));
    });
    expect(drift).toEqual([]);
  });

  it("never interpolates a count as a bare argument, so Persian prints Persian digits", () => {
    for (const catalogue of [en, fa, de]) {
      const text = JSON.stringify(exec(catalogue).priorities);
      expect(text).not.toMatch(/\{(count|days|hours|threshold|shown|total|limit)\}/);
    }
  });

  it("writes Persian with Persian ی and ک, never the Arabic forms", () => {
    expect(JSON.stringify(exec(fa).priorities)).not.toMatch(/[يك]/);
  });

  it("states, in every language, that there is no score", () => {
    for (const catalogue of [en, fa, de]) {
      const lede = (exec(catalogue).priorities as { rulesLede: string }).rulesLede;
      expect(lede.length).toBeGreaterThan(60);
    }
  });
});
