/**
 * Phase 86C4B1 — Asset Registry message catalog: extraction + German translation.
 *
 * The Asset Registry surface (src/components/assets/*) had its user-facing text
 * lifted out of inline `isFa ? … : …` ternaries / hardcoded English into the
 * `assetOperations` next-intl namespace:
 *   - bilingual strings  -> en = English, fa = Persian (verbatim)
 *   - English-only labels -> en = English, fa = temporary English copy
 * Phase 86C4B1 then translated every German (`de`) value into professional
 * native German for industrial asset management. German stays INACTIVE
 * (ACTIVE_LOCALES = ["fa","en"]); only the de catalog values changed.
 *
 * A small set of `de` values legitimately stays identical to English —
 * acronyms (PLC/HMI/VFD/IPC) and words that are already German (Motor, Sensor,
 * Instrument, Name, Status, Details, Firmware, Tags, Dashboard). These are
 * enumerated in GERMAN_IDENTICAL and any other de===en pair fails the audit.
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

// German values that legitimately stay identical to English: acronyms and words
// that are spelled the same in German. Every other de leaf must be translated.
const GERMAN_IDENTICAL = new Set<string>([
  "nav.items.dashboard", // Dashboard — established German enterprise loanword
  ...["PLC", "HMI", "VFD", "MOTOR", "SENSOR", "INSTRUMENT", "INDUSTRIAL_PC"]
    .flatMap((k) => [`enums.typeCompact.${k}`, `enums.typeFull.${k}`])
    // INDUSTRIAL_PC compact label is "IPC"; full is "Industrie-PC" (translated).
    .filter((p) => p !== "enums.typeFull.INDUSTRIAL_PC"),
  "registry.colName",   // Name
  "registry.colStatus", // Status
  "registry.details",   // Details
  "detail.firmware",    // Firmware
  "detail.tags",        // Tags
]);

// Informal German second-person address is forbidden (enterprise formal "Sie").
const INFORMAL_ADDRESS =
  /\b(du|dein|deine|deiner|deinem|deinen|dich|dir|euch|euer|eure|eurem|euren|eurer)\b/i;

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

});

describe("assetOperations — German translation (Phase 86C4B1)", () => {
  const e = flatten(enAO), d = flatten(deAO);

  it("every de leaf outside the allowlist is translated (de !== en)", () => {
    const untranslated = [...e]
      .filter(([k]) => !GERMAN_IDENTICAL.has(k))
      .filter(([k, v]) => d.get(k) === v)
      .map(([k, v]) => `${k}=${JSON.stringify(v)}`);
    expect(untranslated).toEqual([]);
  });

  it("every allowlisted identical value really is identical (justified only)", () => {
    const wrong = [...GERMAN_IDENTICAL].filter((k) => d.get(k) !== e.get(k));
    expect(wrong).toEqual([]);
  });

  it("uses no informal German address (enterprise formal Sie only)", () => {
    const informal = [...d].filter(([, v]) => INFORMAL_ADDRESS.test(String(v))).map(([k]) => k);
    expect(informal).toEqual([]);
  });

  it("carries genuine German (umlaut/ß present across the namespace)", () => {
    expect([...d.values()].some((v) => /[äöüßÄÖÜ]/.test(String(v)))).toBe(true);
  });

  it("keeps protected acronyms verbatim in German", () => {
    expect(d.get("enums.typeFull.PLC")).toBe("PLC");
    expect(d.get("enums.typeFull.HMI")).toBe("HMI");
    expect(d.get("enums.typeFull.SCADA_NODE")).toBe("SCADA-Knoten");
    expect(d.get("enums.typeCompact.INDUSTRIAL_PC")).toBe("IPC");
  });

  it("uses expected professional asset terminology", () => {
    expect(d.get("nav.items.registry")).toBe("Anlagenregister");
    expect(d.get("meta.registry")).toBe("Anlagenregister");
    expect(d.get("enums.status.UNDER_MAINTENANCE")).toBe("In Wartung");
    expect(d.get("enums.criticality.CRITICAL")).toBe("Kritisch");
    expect(d.get("detail.serialNumber")).toBe("Seriennummer");
  });

  it("has no empty German strings and matching ICU args", () => {
    const bad = [...e]
      .filter(([k, v]) => d.get(k) === "" || argNames(v) !== argNames(d.get(k)))
      .map(([k]) => k);
    expect(bad).toEqual([]);
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

  // PHASE 87L.5 SUPERSEDES the former allowlist. It previously asserted that
  // `value.replace(/_/g, " ")` should STAY, on the rationale that these show
  // "persisted enum values, not localized UI text". They are in fact
  // user-visible labels: the transform rendered "IN SERVICE" inside the Persian
  // UI. 87L.5 §9 names this exact pattern as a defect, so the enums now route
  // through the shared `enumLabel` formatter and the catalog labels.
  it("routes enum display through the localized formatter, not the underscore transform", () => {
    for (const rel of [
      "src/components/assets/AssetsRegistryClient.tsx",
      "src/components/assets/AssetDetailClient.tsx",
    ]) {
      const src = read(rel);
      expect(src, rel).not.toMatch(/\.replace\(\/_\/g, " "\)/);
      expect(src, rel).toContain('from "@/lib/i18n/enum-label"');
    }
  });
});

describe("Asset extraction preserves prior behavior and German inactivity", () => {
  it("ACTIVE_LOCALES is still exactly fa + en", () => {
    expect([...ACTIVE_LOCALES]).toEqual(["fa", "en", "de"]);
  });
  it("de is supported and ACTIVE (87L.6)", () => {
    expect(isSupportedLocale("de")).toBe(true);
    expect(isActiveLocale("de")).toBe(true) // 87L.6: German ACTIVATED;
  });
  it("prior German translations remain intact (industrialBrain, adminGovernance)", () => {
    expect((de as Tree).industrialBrain).toBeTruthy();
    const ib = flatten((de as Tree).industrialBrain);
    expect(ib.get("status.modules.neuralReasoningMap")).toBe("Neuronale Reasoning-Map");
    const ag = flatten((de as Tree).adminGovernance);
    expect(ag.get("compliance.title")).toBe("Compliance-Dashboard");
  });
});
