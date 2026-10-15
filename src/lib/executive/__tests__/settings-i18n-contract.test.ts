/**
 * Executive settings — the translation contract.
 *
 * Literal keys come from the page's own source; the validation-problem keys
 * come from the problem codes the settings module can actually produce, so a
 * new problem code without its sentence fails here in all three languages.
 */
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import en from "../../../../messages/en.json";
import fa from "../../../../messages/fa.json";
import de from "../../../../messages/de.json";

const ROOT = join(__dirname, "..", "..", "..", "..");
const PAGE = readFileSync(join(ROOT, "src/app/[locale]/dashboard/executive/settings/page.tsx"), "utf8");
const SETTINGS = readFileSync(join(ROOT, "src/lib/executive/settings.ts"), "utf8");
const PRIORITIES = readFileSync(join(ROOT, "src/lib/executive/priorities.ts"), "utf8");

type Catalogue = Record<string, unknown>;
const exec = (c: unknown) => (c as { executive: Catalogue }).executive;
const resolve = (c: Catalogue, dotted: string): unknown =>
  dotted.split(".").reduce<unknown>((n, p) => (n !== null && typeof n === "object" ? (n as Catalogue)[p] : undefined), c);

/** Every `problem: "CODE"` literal the two validators can emit. */
const problemCodes = [
  ...new Set([...SETTINGS.matchAll(/problem: "([A-Z_]+)"/g), ...PRIORITIES.matchAll(/problem: "([A-Z_]+)"/g)].map(m => m[1])),
].sort();

const derived = [
  ...new Set([
    ...[...PAGE.matchAll(/\bt\("([A-Za-z0-9_.]+)"/g)].map(m => m[1]),
    ...problemCodes.map(code => `settings.problem.${code}`),
    "priorities.configNote",
    "priorities.configNoteOrganization",
    "settings.linkFromSummary",
    "settings.linkFromPriorities",
  ]),
].sort();

describe("every key the settings surface reads exists in all three catalogues", () => {
  it("derives the problem codes from the validators themselves", () => {
    expect(problemCodes).toEqual(["NOT_AFTER_STALE", "NOT_AN_INTEGER", "NOT_A_STRING", "OUT_OF_RANGE", "UNKNOWN_TIME_ZONE"]);
    expect(derived.length).toBeGreaterThan(25);
  });

  for (const [name, catalogue] of [
    ["en", en],
    ["fa", fa],
    ["de", de],
  ] as const) {
    it(`${name} resolves every derived key to a non-empty string`, () => {
      const missing = derived.filter(key => {
        const v = resolve(exec(catalogue), key);
        return typeof v !== "string" || v.trim().length === 0;
      });
      expect(missing).toEqual([]);
    });
  }

  it("keeps the ICU arguments identical across the three languages", () => {
    const args = (v: unknown) => (typeof v === "string" ? [...new Set([...v.matchAll(/\{(\w+)/g)].map(m => m[1]))].sort() : []);
    const drift = derived.filter(key => {
      const e = JSON.stringify(args(resolve(exec(en), key)));
      return e !== JSON.stringify(args(resolve(exec(fa), key))) || e !== JSON.stringify(args(resolve(exec(de), key)));
    });
    expect(drift).toEqual([]);
  });

  it("writes Persian with Persian ی and ک, never the Arabic forms", () => {
    expect(JSON.stringify(exec(fa).settings)).not.toMatch(/[يك]/);
  });

  it("no longer claims that per-organization thresholds are unavailable", () => {
    for (const catalogue of [en, fa, de]) {
      const note = (exec(catalogue).priorities as { configNote: string }).configNote;
      expect(note).not.toMatch(/not available|در دسترس نیست|nicht verfügbar/);
    }
  });
});
