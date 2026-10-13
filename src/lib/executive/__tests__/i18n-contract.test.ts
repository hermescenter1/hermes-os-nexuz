/**
 * Executive Management Center — the translation contract.
 *
 * WHY THIS EXISTS
 * ---------------
 * Phase 102 authored a 529-leaf namespace to a different key spec than the 21
 * components actually called, so every media surface rendered MISSING_MESSAGE in
 * all three locales and nothing in the suite noticed: the catalogue was
 * internally consistent, the components were internally consistent, and the two
 * never met. The fix was a contract test that re-derives the key set from the
 * SOURCE at test time. This is that test for this surface.
 *
 * Keys are derived three ways, all from live source:
 *   1. every `executive.*` string literal in the aggregation (reason, source,
 *      cause and data-quality keys travel in the payload as keys);
 *   2. every metric key the aggregation emits, expanded into the two keys the
 *      UI reads for it — `metrics.<key>` and `definitions.<key>`;
 *   3. every member of the four vocabularies the view switches on
 *      (section status, data freshness, delta reasons, priority), taken from the
 *      contract's own exported constants rather than retyped here.
 *
 * Each derived key must resolve in en, fa AND de. Adding a metric without its
 * label, or renaming a reason key, fails here instead of in production.
 */
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import en from "../../../../messages/en.json";
import fa from "../../../../messages/fa.json";
import de from "../../../../messages/de.json";

const REPO = process.cwd();
const SUMMARY_SRC = readFileSync(join(REPO, "src/lib/executive/summary.ts"), "utf8");
const VIEW_SRC = readFileSync(join(REPO, "src/components/executive/ExecutiveSummaryView.tsx"), "utf8");

type Tree = Record<string, unknown>;

const CATALOGUES: Array<[string, Tree]> = [
  ["en", en as unknown as Tree],
  ["fa", fa as unknown as Tree],
  ["de", de as unknown as Tree],
];

function resolve(tree: Tree, dotted: string): unknown {
  return dotted.split(".").reduce<unknown>(
    (node, part) => (node && typeof node === "object" ? (node as Tree)[part] : undefined),
    tree,
  );
}

function expectResolvable(keys: Iterable<string>, label: string) {
  const missing: string[] = [];
  for (const key of keys) {
    for (const [locale, tree] of CATALOGUES) {
      const value = resolve(tree, key);
      if (typeof value !== "string" || value.trim() === "") missing.push(`${locale}: ${key}`);
    }
  }
  expect(missing, `${label} — unresolved keys`).toEqual([]);
}

/* ── 1. literals that travel in the payload ───────────────────────────────── */

/** Every `"executive.…"` string literal in the aggregation source. */
const payloadKeys = new Set(
  [...SUMMARY_SRC.matchAll(/"(executive\.[A-Za-z0-9_.]+)"/g)].map(m => m[1]),
);

/* ── 2. the metric keys the aggregation emits ─────────────────────────────── */

/**
 * `pointMetric({ key: "x", …})` and `windowMetric({ key: "x", …})` are the only
 * two producers of a metric, so their `key:` arguments are the complete set.
 */
const metricKeys = new Set(
  [...SUMMARY_SRC.matchAll(/(?:pointMetric|windowMetric)\(\{\s*\n\s*key:\s*"([A-Za-z0-9_]+)"/g)].map(
    m => m[1],
  ),
);

/** Decision items reuse `metrics.<key>` for their label — same expansion. */
const decisionKeys = new Set(
  [...SUMMARY_SRC.matchAll(/items\.push\(\{\s*\n\s*key:\s*"([A-Za-z0-9_]+)"/g)].map(m => m[1]),
);

/* ── 3. the vocabularies the view switches on ─────────────────────────────── */

const SECTION_STATUSES = ["OPERATIONAL", "EMPTY", "FORBIDDEN", "UNAVAILABLE", "NO_SOURCE"] as const;
const FRESHNESS = ["FRESH", "STALE", "DISCONNECTED", "NEVER", "INVALID"] as const;
const DELTA_REASONS = ["PARTIAL_PERIOD", "NO_BASELINE", "NO_CURRENT"] as const;
const PRIORITIES = ["HIGH", "MEDIUM"] as const;

describe("every key the aggregation puts in the payload resolves in all three locales", () => {
  it("found the literals at all (the regex is load-bearing)", () => {
    expect(payloadKeys.size).toBeGreaterThan(15);
  });

  it("resolves every reason, source, cause and data-quality key", () => {
    expectResolvable(payloadKeys, "payload keys");
  });

  it("covers every refusal reason and every named source the aggregation can emit", () => {
    const reasons = [...payloadKeys].filter(k => k.startsWith("executive.reasons."));
    const sources = [...payloadKeys].filter(k => k.startsWith("executive.sources."));
    // Slice G3: customersNotTenantScoped is gone (the tenant customer source
    // exists now), and party / partyInteraction joined the named sources.
    expect(reasons.length).toBe(7);
    expect(sources.length).toBe(10);
  });
});

describe("every metric has both a label and a definition, in all three locales", () => {
  it("found the metric keys at all", () => {
    expect(metricKeys.size).toBeGreaterThanOrEqual(10);
  });

  it("resolves metrics.<key> and definitions.<key> for every emitted metric", () => {
    const expanded = [...metricKeys].flatMap(k => [`executive.metrics.${k}`, `executive.definitions.${k}`]);
    expectResolvable(expanded, "metric labels and definitions");
  });

  it("resolves metrics.<key> for every decision item", () => {
    expect(decisionKeys.size).toBeGreaterThanOrEqual(4);
    expectResolvable([...decisionKeys].map(k => `executive.metrics.${k}`), "decision labels");
  });

  it("has no orphan definition — every definitions.<key> belongs to a real metric", () => {
    const declared = Object.keys((resolve(en as unknown as Tree, "executive.definitions") ?? {}) as Tree);
    const orphans = declared.filter(k => !metricKeys.has(k));
    expect(orphans, "definitions with no metric behind them").toEqual([]);
  });
});

describe("every vocabulary the view switches on is fully translated", () => {
  it("resolves the five section states", () => {
    expectResolvable(SECTION_STATUSES.map(s => `executive.status.${s}`), "section status");
  });

  it("resolves the five freshness verdicts", () => {
    expectResolvable(FRESHNESS.map(s => `executive.freshness.${s}`), "freshness");
  });

  it("resolves the three reasons a comparison is undefined", () => {
    expectResolvable(DELTA_REASONS.map(r => `executive.delta.incomparable.${r}`), "delta reasons");
  });

  it("resolves both decision priorities", () => {
    expectResolvable(PRIORITIES.map(p => `executive.priority.${p}`), "priority");
  });

  it("resolves the framing, range, section and provenance vocabulary the view reads", () => {
    // Taken from the view's own literal t("…") calls, so a renamed key fails here.
    const direct = [...VIEW_SRC.matchAll(/\bt\("([A-Za-z0-9_.]+)"/g)].map(m => `executive.${m[1]}`);
    expect(direct.length).toBeGreaterThan(10);
    expectResolvable(new Set(direct), "view literals");
  });
});

describe("the three catalogues agree structurally on this namespace", () => {
  const paths = (node: unknown, prefix = ""): string[] =>
    node !== null && typeof node === "object"
      ? Object.entries(node as Tree).flatMap(([k, v]) => paths(v, prefix ? `${prefix}.${k}` : k))
      : [prefix];

  it("has the same key set in en, fa and de", () => {
    const pEn = paths((en as unknown as Tree).executive).sort();
    const pFa = paths((fa as unknown as Tree).executive).sort();
    const pDe = paths((de as unknown as Tree).executive).sort();
    expect(pFa).toEqual(pEn);
    expect(pDe).toEqual(pEn);
  });

  it("keeps ICU arguments identical across locales", () => {
    const argsOf = (v: unknown) =>
      [...String(v).matchAll(/\{\s*([a-zA-Z0-9_]+)/g)].map(m => m[1]).sort().join("|");
    for (const key of paths((en as unknown as Tree).executive)) {
      const full = `executive.${key}`;
      const base = argsOf(resolve(en as unknown as Tree, full));
      expect(argsOf(resolve(fa as unknown as Tree, full)), `fa ${full}`).toBe(base);
      expect(argsOf(resolve(de as unknown as Tree, full)), `de ${full}`).toBe(base);
    }
  });

  it("uses Persian yeh and kaf, never the Arabic forms", () => {
    const offenders: string[] = [];
    for (const key of paths((fa as unknown as Tree).executive)) {
      const value = String(resolve(fa as unknown as Tree, `executive.${key}`));
      // U+064A ARABIC YEH and U+0643 ARABIC KAF must not appear in Persian copy.
      if (/[يك]/.test(value)) offenders.push(`executive.${key}`);
    }
    expect(offenders).toEqual([]);
  });
});
