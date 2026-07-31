/**
 * PHASE 89 — Persian localization closure: identical-value audit enforcement.
 *
 * The catalog-structure suites guarantee key parity and ICU parity across
 * fa/en/de. What they could NOT catch is a *value-level* regression: an English
 * string left untranslated inside the Persian catalog (Phase 89 found 352 such
 * genuine carryover leaves and translated them). Any future reintroduction —
 * a new key shipped English-only, or a Persian value reverted to English —
 * would still pass structure checks.
 *
 * This suite closes that gap with a reviewed per-key allowlist
 * (`fa-identical-allowlist.ts`, 57 language-neutral entries) enforced in BOTH
 * directions, plus catalog-hygiene guards that fail with the exact key path.
 */
import { describe, it, expect } from "vitest";
import en from "../../../messages/en.json";
import fa from "../../../messages/fa.json";
import { FA_IDENTICAL_ALLOWLIST, FA_IDENTICAL_COUNTS } from "../fa-identical-allowlist";

type Tree = Record<string, unknown>;

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

const enFlat = flatten(en);
const faFlat = flatten(fa);

/** All leaves whose FA value is byte-identical to EN (non-empty strings). */
const identical = [...enFlat]
  .filter(
    ([k, v]) =>
      typeof v === "string" &&
      v.trim() !== "" &&
      faFlat.get(k) === v
  )
  .map(([k]) => k)
  .sort();

describe("fa.json — identical-value allowlist (both directions)", () => {
  it("every FA==EN identical value is explicitly allowlisted (no new English carryover)", () => {
    const unlisted = identical
      .filter((k) => !(k in FA_IDENTICAL_ALLOWLIST))
      .map((k) => `${k} = ${JSON.stringify(enFlat.get(k))}`);
    // Fails with the exact key path + value: either translate the value to
    // genuine Persian, or add a REVIEWED allowlist entry with a category.
    expect(unlisted).toEqual([]);
  });

  it("every allowlist entry is still a real, still-identical leaf (no stale entries)", () => {
    const stale = Object.keys(FA_IDENTICAL_ALLOWLIST).filter(
      (k) => !enFlat.has(k) || faFlat.get(k) !== enFlat.get(k)
    );
    // A stale entry means the value was translated or the key was removed —
    // prune it from the allowlist so the review stays honest.
    expect(stale).toEqual([]);
  });

  it("allowlist size and category counts match the recorded audit summary", () => {
    expect(Object.keys(FA_IDENTICAL_ALLOWLIST).length).toBe(identical.length);
    const counts: Record<string, number> = {};
    for (const cat of Object.values(FA_IDENTICAL_ALLOWLIST)) {
      counts[cat] = (counts[cat] ?? 0) + 1;
    }
    expect(counts).toEqual(FA_IDENTICAL_COUNTS);
  });
});

describe("fa.json — catalog hygiene guards", () => {
  it("no allowlisted identical value contains Persian/Arabic script", () => {
    // Every legitimately-identical FA value is language-neutral (protocol,
    // brand, vendor, URL, or dash/markdown token). A Persian character in an
    // allowlisted value is a contradiction — it could not be identical to EN.
    const withPersian = Object.keys(FA_IDENTICAL_ALLOWLIST)
      .filter((k) => typeof faFlat.get(k) === "string" && /[؀-ۿ]/.test(faFlat.get(k) as string))
      .map((k) => `${k} = ${JSON.stringify(faFlat.get(k))}`);
    expect(withPersian).toEqual([]);
  });

  it("no FA value looks like a raw localization key path", () => {
    // A value like "dashboard.overview.title" leaking into the catalog would
    // render as a raw key at runtime. Real namespaces only — the intentional
    // Prisma-model placeholders (IndustrialAsset.id …) start uppercase and do
    // not match.
    const namespaces = new Set(Object.keys(en as Tree));
    const rawKey = [...faFlat]
      .filter(([, v]) => {
        if (typeof v !== "string") return false;
        const m = v.match(/^([a-z][a-zA-Z0-9]*)\.[a-zA-Z0-9_.]+$/);
        return m !== null && namespaces.has(m[1]) && v !== "robots.txt";
      })
      .map(([k, v]) => `${k} = ${JSON.stringify(v)}`);
    expect(rawKey).toEqual([]);
  });
});
