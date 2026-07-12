/**
 * Phase 86C4B1-PRE Part 2 — CMMS / Maintenance message-catalog extraction.
 *
 * The CMMS surface (src/components/cmms/* + src/app/[locale]/cmms/* pages) had
 * its user-facing text lifted out of inline `isFa ? … : …` ternaries,
 * pathname-based locale detection, and hardcoded English into the
 * `maintenanceOperations` next-intl namespace. Architectural extraction only:
 *   - bilingual strings   -> en = English, fa = Persian (verbatim)
 *   - English-only UI     -> en = English, fa/de = temporary English copy
 * German is NOT translated in this phase.
 *
 * Retained locale logic (allowlisted below): raw enum/status display via
 * `.replace(/_/g," ")` and direct enum values, persisted maintenance data,
 * `toLocaleDateString()/toLocaleTimeString()` formatting, `usePathname` in
 * CmmsNav strictly for active-link detection, and raw "MTBF"/"MTTR" acronym
 * labels shown identically in every locale.
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
  "CmmsNav", "CmmsDashboardClient", "MaintenancePlansClient", "MaintenanceTasksClient",
  "SchedulesClient", "CalendarClient", "DowntimeClient", "FailureReportsClient",
  "HistoryClient", "CostDashboardClient", "ReportsClient", "SparePartsClient", "SettingsClient",
].map((n) => `src/components/cmms/${n}.tsx`);

const PAGES = [
  "dashboard", "plans", "tasks", "schedules", "calendar", "downtime", "failures",
  "history", "costs", "reports", "spares", "settings", "work-orders", "checklists",
  "plans/[id]", "tasks/[id]", "failures/[id]",
].map((p) => `src/app/[locale]/cmms/${p}/page.tsx`);

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
function bracesBalanced(v: unknown): boolean {
  let depth = 0;
  for (const ch of String(v)) {
    if (ch === "{") depth++;
    if (ch === "}") depth--;
    if (depth < 0) return false;
  }
  return depth === 0;
}

const enMO = (en as Tree).maintenanceOperations;
const faMO = (fa as Tree).maintenanceOperations;
const deMO = (de as Tree).maintenanceOperations;

// English-only leaves temp-copied to fa/de: the "CMMS" nav eyebrow plus every
// `pages.*` leaf (all server-page headers/labels are currently English-only).
const isEnglishOnly = (key: string) => key === "nav.eyebrow" || key.startsWith("pages.");

describe("maintenanceOperations namespace — three-locale parity", () => {
  it("exists in all three catalogs with exactly 233 leaves", () => {
    expect(enMO).toBeTruthy();
    expect(faMO).toBeTruthy();
    expect(deMO).toBeTruthy();
    expect(flatten(enMO).size).toBe(233);
  });

  it("fa and de mirror en key paths and shapes exactly", () => {
    const e = leafPaths(enMO), f = leafPaths(faMO), d = leafPaths(deMO);
    expect([...f.keys()].sort()).toEqual([...e.keys()].sort());
    expect([...d.keys()].sort()).toEqual([...e.keys()].sort());
    for (const [p, shape] of e) {
      expect(f.get(p), `fa shape ${p}`).toBe(shape);
      expect(d.get(p), `de shape ${p}`).toBe(shape);
    }
  });

  it("ICU argument names match and braces are balanced on every key", () => {
    const e = flatten(enMO), f = flatten(faMO), d = flatten(deMO);
    const bad: string[] = [];
    for (const [k, v] of e) {
      if (argNames(v) !== argNames(f.get(k))) bad.push(`fa:${k}`);
      if (argNames(v) !== argNames(d.get(k))) bad.push(`de:${k}`);
      if (!bracesBalanced(v) || !bracesBalanced(f.get(k)) || !bracesBalanced(d.get(k))) bad.push(`icu:${k}`);
    }
    expect(bad).toEqual([]);
  });

  it("has no empty strings in en, fa or de", () => {
    for (const [name, tree] of [["en", enMO], ["fa", faMO], ["de", deMO]] as const) {
      const empty = [...flatten(tree)].filter(([, v]) => v === "").map(([k]) => `${name}:${k}`);
      expect(empty).toEqual([]);
    }
  });

  it("de temporarily copies English verbatim (German not translated this phase)", () => {
    const e = flatten(enMO), d = flatten(deMO);
    const divergent = [...e].filter(([k, v]) => d.get(k) !== v).map(([k]) => k);
    expect(divergent).toEqual([]);
  });
});

describe("maintenanceOperations — bilingual vs English-only classification", () => {
  const e = flatten(enMO), f = flatten(faMO);

  it("English-only leaves copy English into fa exactly (preserves current output)", () => {
    const wrong = [...e].filter(([k, v]) => isEnglishOnly(k) && f.get(k) !== v).map(([k]) => k);
    expect(wrong).toEqual([]);
  });

  it("every bilingual leaf carries genuine Persian (contains Persian script)", () => {
    const bad = [...f]
      .filter(([k]) => !isEnglishOnly(k))
      .filter(([, v]) => !/[؀-ۿ]/.test(String(v)))
      .map(([k]) => k);
    expect(bad).toEqual([]);
  });

  it("preserves the exact prior ICU-parameterized plan strings", () => {
    expect(e.get("plans.frequencyEvery")).toBe("Every {days}d");
    expect(f.get("plans.frequencyEvery")).toBe("هر {days} روز");
    expect(e.get("plans.overdueBy")).toBe("Overdue by {days} days");
    expect(f.get("plans.overdueBy")).toBe("معوقه {days} روز");
    expect(e.get("plans.dueIn")).toBe("Due in {days} days");
    expect(f.get("plans.dueIn")).toBe("در {days} روز");
  });
});

describe("CMMS components and pages are fully catalog-backed", () => {
  it("every CMMS component uses useTranslations(\"maintenanceOperations\")", () => {
    for (const rel of COMPONENTS) {
      expect(read(rel), rel).toMatch(/useTranslations\("maintenanceOperations"\)/);
    }
  });

  it("every converted CMMS page uses getTranslations(\"maintenanceOperations\")", () => {
    // work-orders/[id] only redirects — it has no UI text and is exempt.
    for (const rel of PAGES) {
      expect(read(rel), rel).toMatch(/getTranslations\("maintenanceOperations"\)/);
    }
  });

  it("no component or page keeps isFa / pathname-locale / fa-display ternaries", () => {
    for (const rel of [...COMPONENTS, ...PAGES]) {
      const src = read(rel);
      expect(src, `${rel} isFa`).not.toMatch(/\bisFa\b/);
      expect(src, `${rel} pathname fa`).not.toMatch(/pathname\.startsWith\("\/fa"\)/);
      expect(src, `${rel} locale===fa`).not.toMatch(/locale === "fa"/);
    }
  });

  it("no hardcoded Persian UI strings remain in the CMMS surface", () => {
    for (const rel of [...COMPONENTS, ...PAGES]) {
      const persian = read(rel).match(/[؀-ۿ]/g) ?? [];
      expect(persian, rel).toEqual([]);
    }
  });

  it("usePathname survives only in CmmsNav (active-link detection, allowlisted)", () => {
    for (const rel of COMPONENTS) {
      const uses = /usePathname/.test(read(rel));
      expect(uses, rel).toBe(rel.endsWith("CmmsNav.tsx"));
    }
  });

  it("keeps raw MTBF/MTTR acronym labels and raw enum display (allowlisted)", () => {
    expect(read("src/components/cmms/CmmsDashboardClient.tsx")).toMatch(/label: "MTBF"/);
    expect(read("src/components/cmms/ReportsClient.tsx")).toMatch(/label: "MTBF"/);
    expect(read("src/components/cmms/MaintenanceTasksClient.tsx")).toMatch(/\.replace\(\/_\/g, " "\)/);
  });

  it("work-order status filters and transitions remain unchanged", () => {
    const wo = read("src/app/[locale]/cmms/work-orders/page.tsx");
    expect(wo).toMatch(/\["IN_PROGRESS","PLANNED","SCHEDULED","OVERDUE"\]/);
    const reports = read("src/app/[locale]/cmms/reports/page.tsx");
    expect(reports).toMatch(/t\.status === "COMPLETED"/);
    expect(reports).toMatch(/t\.status === "OVERDUE"/);
  });
});

describe("Phase 86C4B1-PRE combined — prior extractions and German state intact", () => {
  it("assetOperations still has exactly 209 leaves", () => {
    expect(flatten((en as Tree).assetOperations).size).toBe(209);
  });

  it("ACTIVE_LOCALES is still exactly fa + en; de supported but inactive", () => {
    expect([...ACTIVE_LOCALES]).toEqual(["fa", "en"]);
    expect(isSupportedLocale("de")).toBe(true);
    expect(isActiveLocale("de")).toBe(false);
  });

  it("prior German translations remain intact", () => {
    const ib = flatten((de as Tree).industrialBrain);
    expect(ib.get("status.modules.neuralReasoningMap")).toBe("Neuronale Reasoning-Map");
    const ag = flatten((de as Tree).adminGovernance);
    expect(ag.get("compliance.title")).toBe("Compliance-Dashboard");
    const j = flatten((de as Tree).journal);
    expect([...j.values()].some((v) => /[äöüßÄÖÜ]/.test(String(v)))).toBe(true);
  });
});
