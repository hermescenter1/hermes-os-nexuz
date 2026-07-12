/**
 * Phase 86C4B1-PRE — Asset Registry message-catalog extraction.
 *
 * The Asset Registry surface (src/components/assets/*) had its user-facing text
 * lifted out of inline `isFa ? … : …` ternaries / hardcoded English into the
 * `assetOperations` next-intl namespace. This is an ARCHITECTURAL extraction:
 *   - bilingual strings  -> en = English, fa = Persian (verbatim)
 *   - English-only labels -> en = English, fa/de = temporary English copy
 * German is NOT translated in this phase (de temporarily copies English).
 *
 * Retained locale logic (documented + allowlisted below): raw-enum display via
 * `.replace(/_/g," ")`, direct enum values, persisted asset data, and
 * `toLocaleDateString()` date formatting — none emit hardcoded UI strings.
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

const COMPONENTS = [
  "AssetsNav", "AssetsRegistryClient", "AssetsDashboardClient", "AssetDetailClient",
  "AssetCriticalityClient", "AssetHealthClient", "AssetHierarchyClient",
  "AssetLifecycleClient", "AssetMaintenanceClient", "AssetDocumentsClient",
  "AssetAnalyticsClient", "AssetSettingsClient",
].map((n) => `src/components/assets/${n}.tsx`);

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
function argNames(v: unknown): string {
  const a = new Set<string>();
  for (const m of String(v).matchAll(/\{\s*([a-zA-Z_][a-zA-Z0-9_]*)/g)) a.add(m[1]);
  return [...a].sort().join("|");
}

const enAO = (en as Tree).assetOperations;
const faAO = (fa as Tree).assetOperations;
const deAO = (de as Tree).assetOperations;

// English-only leaves temporarily copied to fa/de (nav eyebrow, enum labels,
// unit words with no current Persian, page metadata title).
const ENGLISH_ONLY = new Set<string>([
  "nav.eyebrow",
  "detail.years",
  "meta.registry",
  ...["PRODUCTION_LINE","MACHINE","PLC","HMI","SCADA_NODE","ELECTRICAL_PANEL","MCC_PANEL","VFD","MOTOR","PUMP","VALVE","SENSOR","INSTRUMENT","ROBOT","CONVEYOR","COMPRESSOR","UTILITY_SYSTEM","SAFETY_SYSTEM","NETWORK_DEVICE","INDUSTRIAL_PC"].flatMap((k) => [`enums.typeCompact.${k}`, `enums.typeFull.${k}`]),
  ...["IN_SERVICE","DEGRADED","UNDER_MAINTENANCE","STANDBY","PLANNED","COMMISSIONED","RETIRED","REPLACED","DECOMMISSIONED"].map((k) => `enums.status.${k}`),
  ...["CRITICAL","HIGH","MEDIUM","LOW","NON_CRITICAL"].map((k) => `enums.criticality.${k}`),
]);

describe("assetOperations namespace — three-locale parity", () => {
  it("exists in all three catalogs", () => {
    expect(enAO).toBeTruthy();
    expect(faAO).toBeTruthy();
    expect(deAO).toBeTruthy();
  });

  it("fa mirrors en key paths and shapes exactly", () => {
    const e = leafPaths(enAO), f = leafPaths(faAO);
    expect([...f.keys()].sort()).toEqual([...e.keys()].sort());
    for (const [p, shape] of e) expect(f.get(p), `shape ${p}`).toBe(shape);
  });

  it("de mirrors en key paths and shapes exactly", () => {
    const e = leafPaths(enAO), d = leafPaths(deAO);
    expect([...d.keys()].sort()).toEqual([...e.keys()].sort());
    for (const [p, shape] of e) expect(d.get(p), `shape ${p}`).toBe(shape);
  });

  it("ICU argument names match across en/fa/de on every key", () => {
    const e = flatten(enAO), f = flatten(faAO), d = flatten(deAO);
    const bad: string[] = [];
    for (const [k, v] of e) {
      if (argNames(v) !== argNames(f.get(k))) bad.push(`fa:${k}`);
      if (argNames(v) !== argNames(d.get(k))) bad.push(`de:${k}`);
    }
    expect(bad).toEqual([]);
  });

  it("has no empty strings in en, fa or de", () => {
    for (const [name, tree] of [["en", enAO], ["fa", faAO], ["de", deAO]] as const) {
      const empty = [...flatten(tree)].filter(([, v]) => v === "").map(([k]) => `${name}:${k}`);
      expect(empty).toEqual([]);
    }
  });

  it("de temporarily copies English verbatim (German not translated this phase)", () => {
    const e = flatten(enAO), d = flatten(deAO);
    const divergent = [...e].filter(([k, v]) => d.get(k) !== v).map(([k]) => k);
    expect(divergent).toEqual([]);
  });
});

describe("assetOperations — bilingual vs English-only classification", () => {
  const e = flatten(enAO), f = flatten(faAO);

  it("English-only leaves temp-copy English into fa (preserves current behavior)", () => {
    const wrong = [...ENGLISH_ONLY].filter((k) => f.get(k) !== e.get(k));
    expect(wrong).toEqual([]);
  });

  it("every other (bilingual) leaf carries genuine Persian, not English", () => {
    const notTranslated = [...e]
      .filter(([k]) => !ENGLISH_ONLY.has(k))
      .filter(([k, v]) => f.get(k) === v)
      .map(([k]) => k);
    expect(notTranslated).toEqual([]);
  });

  it("bilingual Persian values actually contain Persian script", () => {
    const missingPersian = [...f]
      .filter(([k]) => !ENGLISH_ONLY.has(k))
      .filter(([, v]) => !/[؀-ۿ]/.test(String(v)))
      .map(([k]) => k);
    expect(missingPersian).toEqual([]);
  });
});

describe("Asset components are fully catalog-backed", () => {
  it("every asset component uses useTranslations(\"assetOperations\")", () => {
    for (const rel of COMPONENTS) {
      expect(read(rel), rel).toMatch(/useTranslations\("assetOperations"\)/);
    }
  });

  it("no component derives locale from pathname or keeps fa/en display ternaries", () => {
    for (const rel of COMPONENTS) {
      const src = read(rel);
      expect(src, `${rel} isFa`).not.toMatch(/\bisFa\b/);
      expect(src, `${rel} pathname fa`).not.toMatch(/pathname\.startsWith\("\/fa"\)/);
      expect(src, `${rel} locale===fa`).not.toMatch(/locale === "fa"/);
    }
  });

  it("no hardcoded Persian UI strings remain in any asset component", () => {
    for (const rel of COMPONENTS) {
      const persian = read(rel).match(/[؀-ۿ]/g) ?? [];
      expect(persian, rel).toEqual([]);
    }
  });

  it("retains raw-enum display formatting (documented allowlist) — not translated", () => {
    // These raw-enum -> display transforms intentionally stay in code; they show
    // persisted enum values, not localized UI text.
    expect(read("src/components/assets/AssetsRegistryClient.tsx")).toMatch(/\.replace\(\/_\/g, " "\)/);
    expect(read("src/components/assets/AssetDetailClient.tsx")).toMatch(/\.replace\(\/_\/g, " "\)/);
  });
});

describe("Asset extraction preserves prior behavior and German inactivity", () => {
  it("ACTIVE_LOCALES is still exactly fa + en", () => {
    expect([...ACTIVE_LOCALES]).toEqual(["fa", "en"]);
  });
  it("de is supported but not active", () => {
    expect(isSupportedLocale("de")).toBe(true);
    expect(isActiveLocale("de")).toBe(false);
  });
  it("prior German translations remain intact (industrialBrain, adminGovernance)", () => {
    expect((de as Tree).industrialBrain).toBeTruthy();
    const ib = flatten((de as Tree).industrialBrain);
    expect(ib.get("status.modules.neuralReasoningMap")).toBe("Neuronale Reasoning-Map");
    const ag = flatten((de as Tree).adminGovernance);
    expect(ag.get("compliance.title")).toBe("Compliance-Dashboard");
  });
});
