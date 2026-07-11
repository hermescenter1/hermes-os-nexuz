/**
 * Phase 86C4A-PRE — Industrial Brain message-catalog extraction.
 *
 * The Industrial Brain surface (industrial-brain/page.tsx +
 * IndustrialBrainWorkspace.tsx) had its static, user-facing text lifted out of
 * inline `isFa ? … : …` ternaries and hardcoded strings into the
 * `industrialBrain` next-intl namespace. This is an ARCHITECTURAL extraction:
 * German is not translated yet, so de values are temporary English copies.
 *
 * Behaviour is preserved exactly — analysis-data field selection
 * (`isFa ? x.fooFa : x.foo`), the bilingual demo dataset, and locale-specific
 * date formatting stay as documented retained conditionals.
 */
import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";
import en from "../../../messages/en.json";
import fa from "../../../messages/fa.json";
import de from "../../../messages/de.json";
import { ACTIVE_LOCALES, isActiveLocale, isSupportedLocale } from "@/i18n/locales";

type Tree = Record<string, unknown>;

const ROOT = process.cwd();
const read = (rel: string) => fs.readFileSync(path.join(ROOT, rel), "utf8");

const PAGE = "src/app/[locale]/industrial-brain/page.tsx";
const WORKSPACE = "src/components/industrial-brain/IndustrialBrainWorkspace.tsx";

/** Leaf paths (with array/object shape tag). */
function leafPaths(node: unknown, prefix = ""): Map<string, string> {
  const out = new Map<string, string>();
  if (node !== null && typeof node === "object") {
    if (prefix) out.set(prefix + "//shape", Array.isArray(node) ? "array" : "object");
    for (const [k, v] of Object.entries(node as Tree)) {
      const p = prefix ? `${prefix}.${k}` : k;
      for (const [kk, vv] of leafPaths(v, p)) out.set(kk, vv);
    }
  } else {
    out.set(prefix, typeof node);
  }
  return out;
}

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

/** Sorted ICU argument-name signature (matches en plural+other vs fa other). */
function argNames(value: unknown): string {
  const a = new Set<string>();
  for (const m of String(value).matchAll(/\{\s*([a-zA-Z_][a-zA-Z0-9_]*)/g)) a.add(m[1]);
  return [...a].sort().join("|");
}

const enIB = (en as Tree).industrialBrain;
const faIB = (fa as Tree).industrialBrain;
const deIB = (de as Tree).industrialBrain;

describe("industrialBrain namespace — three-locale parity", () => {
  it("exists in all three catalogs", () => {
    expect(enIB).toBeTruthy();
    expect(faIB).toBeTruthy();
    expect(deIB).toBeTruthy();
  });

  it("fa mirrors en key paths and shapes exactly", () => {
    const e = leafPaths(enIB), f = leafPaths(faIB);
    expect([...f.keys()].sort()).toEqual([...e.keys()].sort());
    for (const [p, shape] of e) expect(f.get(p), `shape ${p}`).toBe(shape);
  });

  it("de mirrors en key paths and shapes exactly", () => {
    const e = leafPaths(enIB), d = leafPaths(deIB);
    expect([...d.keys()].sort()).toEqual([...e.keys()].sort());
    for (const [p, shape] of e) expect(d.get(p), `shape ${p}`).toBe(shape);
  });

  it("ICU argument names match across en/fa/de on every key", () => {
    const e = flatten(enIB), f = flatten(faIB), d = flatten(deIB);
    const mismatched: string[] = [];
    for (const [k, v] of e) {
      if (argNames(v) !== argNames(f.get(k))) mismatched.push(`fa:${k}`);
      if (argNames(v) !== argNames(d.get(k))) mismatched.push(`de:${k}`);
    }
    expect(mismatched).toEqual([]);
  });

  it("has no empty strings in fa or de", () => {
    const empty = [
      ...[...flatten(faIB)].filter(([, v]) => v === "").map(([k]) => `fa:${k}`),
      ...[...flatten(deIB)].filter(([, v]) => v === "").map(([k]) => `de:${k}`),
    ];
    expect(empty).toEqual([]);
  });

  it("de temporarily copies English verbatim (German not yet translated)", () => {
    const e = flatten(enIB), d = flatten(deIB);
    const divergent = [...e].filter(([k, v]) => d.get(k) !== v).map(([k]) => k);
    expect(divergent).toEqual([]);
  });

  it("fa is genuinely Persian, not an English carbon copy", () => {
    const e = flatten(enIB), f = flatten(faIB);
    const persian = [...f].filter(([, v]) => /[؀-ۿ]/.test(String(v)));
    // The vast majority of leaves carry Persian; only technical tokens match.
    expect(persian.length).toBeGreaterThan(e.size * 0.7);
  });
});

describe("industrial-brain/page.tsx — fully catalog-backed", () => {
  const src = read(PAGE);

  it("uses server-side getTranslations, not inline locale ternaries", () => {
    expect(src).toMatch(/getTranslations/);
  });

  it("contains no Persian display literals (all lifted to the catalog)", () => {
    const persian = src.match(/[؀-ۿ]/g) ?? [];
    expect(persian).toEqual([]);
  });

  it("preserves the RBAC gate for Save-as-Engineering-Case unchanged", () => {
    expect(src).toMatch(/getCurrentUser\(\)/);
    expect(src).toMatch(/can\(user\?\.role,\s*"authoring"\)/);
  });
});

describe("IndustrialBrainWorkspace.tsx — catalog-backed with documented retained data conditionals", () => {
  const src = read(WORKSPACE);

  // The bilingual demo dataset (SAMPLE_SCENARIOS) is persisted locale content,
  // not UI chrome; isolate it so the remaining component body can be asserted
  // Persian-free.
  const sampleStart = src.indexOf("const SAMPLE_SCENARIOS");
  const sampleEnd = src.indexOf("// ─── Evidence Pack");
  const outsideSample = src.slice(0, sampleStart) + src.slice(sampleEnd);

  it("isolates a real SAMPLE_SCENARIOS demo dataset block", () => {
    expect(sampleStart).toBeGreaterThan(0);
    expect(sampleEnd).toBeGreaterThan(sampleStart);
  });

  it("uses the industrialBrain namespace via useTranslations", () => {
    expect(src).toMatch(/useTranslations\("industrialBrain"\)/);
  });

  it("has no Persian display literals outside the demo dataset", () => {
    const persian = outsideSample.match(/[؀-ۿ]/g) ?? [];
    expect(persian).toEqual([]);
  });

  it("every remaining isFa ternary is a documented retained (non-display) conditional", () => {
    // Allowed retained forms: analysis-data field selection (property access on
    // either branch), the demo-dataset key/label lookups, and locale-specific
    // date formatting. None emit hardcoded UI strings.
    const ternaries = outsideSample.match(/isFa\s*\?[^\n;]*?:[^\n;)]*/g) ?? [];
    const allowed = (frag: string) =>
      /\?\s*[\w.]+\.\w*Fa\b/.test(frag) ||             // isFa ? x.fooFa : x.foo
      /\?\s*[\w.]+\.fa\s*:\s*[\w.]+\.en\b/.test(frag) || // isFa ? item.fa : item.en (engine bilingual data)
      /\?\s*"fa"\s*:\s*"en"/.test(frag) ||             // dataset key lookup
      /\?\s*"fa-IR"\s*:\s*"en-US"/.test(frag) ||       // date locale
      /SAMPLE_SCENARIOS\[key\]\.labelFa/.test(frag);   // demo-dataset caption
    const unexplained = ternaries.filter((frag) => !allowed(frag));
    expect(unexplained).toEqual([]);
  });

  it("keeps the analyze + save-case API endpoints and print flow unchanged", () => {
    expect(src).toMatch(/"\/api\/industrial-brain\/analyze"/);
    expect(src).toMatch(/"\/api\/industrial-brain\/save-case"/);
    expect(src).toMatch(/window\.print\(\)/);
  });
});

describe("Sibling Industrial Intelligence clients — retained percent-symbol conditionals (allowlist)", () => {
  // Each already-catalog-backed client keeps exactly one legitimate
  // number-formatting conditional: the Persian percent sign U+066A (٪) vs "%".
  // This is locale-specific numeric formatting, not display text.
  const CLIENTS = [
    "src/components/brain/BrainClient.tsx",
    "src/components/copilot/CopilotClient.tsx",
    "src/components/knowledge/KnowledgeStudioClient.tsx",
    "src/components/knowledge/CaseStudioClient.tsx",
    "src/components/intelligence/UnknownCenterClient.tsx",
  ];

  it.each(CLIENTS)("%s keeps only the pct = fa ? ٪ : %% conditional", (rel) => {
    const src = read(rel);
    expect(src).toMatch(/const pct = locale === "fa" \? "(٪|\\u066A)" : "%"/);
    // No other fa/en display ternary should remain.
    const others = (src.match(/locale === "fa"\s*\?/g) ?? []).length;
    expect(others).toBe(1);
  });
});

describe("German stays inactive during this extraction", () => {
  it("ACTIVE_LOCALES is still exactly fa + en", () => {
    expect([...ACTIVE_LOCALES]).toEqual(["fa", "en"]);
  });
  it("de is supported but not active", () => {
    expect(isSupportedLocale("de")).toBe(true);
    expect(isActiveLocale("de")).toBe(false);
  });
});
