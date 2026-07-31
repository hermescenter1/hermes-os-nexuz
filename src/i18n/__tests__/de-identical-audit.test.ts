/**
 * PHASE 88 — German localization closure: identical-value audit enforcement.
 *
 * `de-catalog.test.ts` (86C1…87L.6F) guarantees structure, ICU parity and the
 * namespace-level zero-carryover ceiling. What it could NOT catch is a
 * *value-level* regression inside an already-translated namespace: someone
 * reverting one German sentence back to English would still pass structure.
 *
 * This suite closes that gap with a reviewed per-key allowlist
 * (`de-identical-allowlist.ts`, 362 entries) enforced in BOTH directions, plus
 * catalog-hygiene guards (no Persian script in DE, no whitespace-only values,
 * no raw-key-looking values) that fail with the exact key path and reason.
 */
import { describe, it, expect } from "vitest";
import en from "../../../messages/en.json";
import fa from "../../../messages/fa.json";
import de from "../../../messages/de.json";
import { DE_IDENTICAL_ALLOWLIST, DE_IDENTICAL_COUNTS } from "../de-identical-allowlist";

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
const deFlat = flatten(de);

/** All leaves whose DE value is byte-identical to EN (non-empty strings). */
const identical = [...enFlat]
  .filter(
    ([k, v]) =>
      typeof v === "string" &&
      v.trim() !== "" &&
      deFlat.get(k) === v
  )
  .map(([k]) => k)
  .sort();

describe("de.json — identical-value allowlist (both directions)", () => {
  it("every DE==EN identical value is explicitly allowlisted (no new English carryover)", () => {
    const unlisted = identical
      .filter((k) => !(k in DE_IDENTICAL_ALLOWLIST))
      .map((k) => `${k} = ${JSON.stringify(enFlat.get(k))}`);
    // Fails with the exact key path + value: either translate the value to
    // genuine German, or add a REVIEWED allowlist entry with a category.
    expect(unlisted).toEqual([]);
  });

  it("every allowlist entry is still a real, still-identical leaf (no stale entries)", () => {
    const stale = Object.keys(DE_IDENTICAL_ALLOWLIST).filter(
      (k) => !enFlat.has(k) || deFlat.get(k) !== enFlat.get(k)
    );
    // A stale entry means the value was translated or the key was removed —
    // prune it from the allowlist so the review stays honest.
    expect(stale).toEqual([]);
  });

  it("allowlist size and category counts match the recorded audit summary", () => {
    expect(Object.keys(DE_IDENTICAL_ALLOWLIST).length).toBe(identical.length);
    const counts: Record<string, number> = {};
    for (const cat of Object.values(DE_IDENTICAL_ALLOWLIST)) {
      counts[cat] = (counts[cat] ?? 0) + 1;
    }
    expect(counts).toEqual(DE_IDENTICAL_COUNTS);
  });
});

describe("de.json — catalog hygiene guards", () => {
  it("contains no Persian/Arabic script (no Persian carryover into German)", () => {
    const persian = [...deFlat]
      .filter(([, v]) => typeof v === "string" && /[؀-ۿ]/.test(v))
      .map(([k, v]) => `${k} = ${JSON.stringify(v)}`);
    expect(persian).toEqual([]);
  });

  it("no locale has whitespace-only values (fa/en/de)", () => {
    for (const [name, flat] of [
      ["fa", faFlat],
      ["en", enFlat],
      ["de", deFlat],
    ] as const) {
      const ws = [...flat]
        .filter(([, v]) => typeof v === "string" && v.length > 0 && v.trim() === "")
        .map(([k]) => `${name}:${k}`);
      expect(ws).toEqual([]);
    }
  });

  it("no DE value looks like a raw localization key path", () => {
    // A value like "dashboard.overview.title" leaking into the catalog would
    // render as a raw key at runtime. Real namespaces only — the intentional
    // Prisma-model placeholders (IndustrialAsset.id …) start uppercase and do
    // not match.
    const namespaces = new Set(Object.keys(en as Tree));
    const rawKey = [...deFlat]
      .filter(([, v]) => {
        if (typeof v !== "string") return false;
        const m = v.match(/^([a-z][a-zA-Z0-9]*)\.[a-zA-Z0-9_.]+$/);
        return m !== null && namespaces.has(m[1]) && v !== "robots.txt";
      })
      .map(([k, v]) => `${k} = ${JSON.stringify(v)}`);
    expect(rawKey).toEqual([]);
  });
});
