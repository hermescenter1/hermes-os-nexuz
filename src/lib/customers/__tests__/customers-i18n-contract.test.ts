/**
 * Customer pages — the translation contract.
 *
 * Keys are DERIVED from the page sources and the label builder (literal
 * `t("customers.…")` and `k("…")` calls) plus the enum-driven families, so a key
 * a page starts using without its sentence fails here in all three languages.
 */
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import en from "../../../../messages/en.json";
import fa from "../../../../messages/fa.json";
import de from "../../../../messages/de.json";
import { INTERACTION_KINDS, PARTY_STATUSES } from "../schemas";

const ROOT = join(__dirname, "..", "..", "..", "..");
const read = (p: string) => readFileSync(join(ROOT, p), "utf8");
const PAGES = [
  "src/app/[locale]/dashboard/clients/page.tsx",
  "src/app/[locale]/dashboard/clients/new/page.tsx",
  "src/app/[locale]/dashboard/clients/[id]/page.tsx",
].map(read);
const LABELS = read("src/components/tenant-customers/labels.ts");

type Catalogue = Record<string, unknown>;
const exec = (c: unknown) => (c as { executive: Catalogue }).executive;
const resolve = (c: Catalogue, dotted: string): unknown =>
  dotted.split(".").reduce<unknown>((n, p) => (n !== null && typeof n === "object" ? (n as Catalogue)[p] : undefined), c);

const literal = PAGES.flatMap(src => [...src.matchAll(/\bt\("(customers\.[A-Za-z0-9_.]+)"/g)].map(m => m[1]));
const formKeys = [...LABELS.matchAll(/\bk\("([A-Za-z0-9_.]+)"\)/g)].map(m => m[1]);
// labels.ts prefixes form keys with "customers." and interaction keys with "customers.interactions.".
const interactionBlock = LABELS.slice(LABELS.indexOf("export function interactionFormLabels"));
const formBlock = LABELS.slice(0, LABELS.indexOf("export function interactionFormLabels"));
const fromLabels = [
  ...[...formBlock.matchAll(/\bk\("([A-Za-z0-9_.]+)"\)/g)].map(m => `customers.${m[1]}`),
  ...[...interactionBlock.matchAll(/\bk\("([A-Za-z0-9_.]+)"\)/g)].map(m => `customers.interactions.${m[1]}`),
];
const families = [
  ...PARTY_STATUSES.map(s => `customers.status.${s}`),
  ...["overdue", "scheduled", "none"].map(f => `customers.followUp.${f}`),
  ...INTERACTION_KINDS.map(k => `customers.interactions.kind.${k}`),
];
const derived = [...new Set([...literal, ...fromLabels, ...families, "errors.SERVICE_UNAVAILABLE"])].sort();

describe("every key the customer pages read exists in all three catalogues", () => {
  it("derives a meaningful key set from the sources", () => {
    expect(formKeys.length).toBeGreaterThan(30);
    expect(derived.length).toBeGreaterThan(80);
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

  it("keeps ICU arguments identical across the three languages", () => {
    const args = (v: unknown) => (typeof v === "string" ? [...new Set([...v.matchAll(/\{(\w+)/g)].map(m => m[1]))].sort() : []);
    const drift = derived.filter(key => {
      const e = JSON.stringify(args(resolve(exec(en), key)));
      return e !== JSON.stringify(args(resolve(exec(fa), key))) || e !== JSON.stringify(args(resolve(exec(de), key)));
    });
    expect(drift).toEqual([]);
  });

  it("writes Persian with Persian ی and ک, never the Arabic forms", () => {
    expect(JSON.stringify(exec(fa).customers)).not.toMatch(/[يك]/);
  });

  it("has the sidebar label in all three languages", () => {
    for (const c of [en, fa, de]) {
      expect((c as { appShell: { nav: { items: Record<string, string> } } }).appShell.nav.items.clients).toBeTruthy();
    }
  });
});
