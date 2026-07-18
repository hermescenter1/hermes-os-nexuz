/**
 * Phase 86C4B1 — CMMS / Maintenance message catalog: extraction + German.
 *
 * The CMMS surface (src/components/cmms/* + src/app/[locale]/cmms/* pages) had
 * its user-facing text lifted out of inline `isFa ? … : …` ternaries,
 * pathname-based locale detection, and hardcoded English into the
 * `maintenanceOperations` next-intl namespace:
 *   - bilingual strings   -> en = English, fa = Persian (verbatim)
 *   - English-only UI     -> en = English, fa = temporary English copy
 * Phase 86C4B1 then translated every German (`de`) value into professional
 * native German for CMMS / preventive & corrective maintenance. German stays
 * INACTIVE (ACTIVE_LOCALES = ["fa","en"]); only the de catalog values changed.
 *
 * A small set of `de` values legitimately stays identical to English — the CMMS
 * acronym, "Dashboard", and words already German (Name, Status, Team, Min).
 * They are enumerated in GERMAN_IDENTICAL; any other de===en pair fails audit.
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

// English-only leaves temp-copied to fa: the "CMMS" nav eyebrow plus every
// `pages.*` leaf (all server-page headers/labels are currently English-only).
const isEnglishOnly = (key: string) => key === "nav.eyebrow" || key.startsWith("pages.");

// German values that legitimately stay identical to English: the CMMS acronym,
// the "Dashboard" loanword, and words already spelled the same in German.
const GERMAN_IDENTICAL = new Set<string>([
  "nav.eyebrow",            // CMMS
  "nav.items.dashboard",    // Dashboard
  "dashboard.colStatus",    // Status
  "tasks.colStatus",        // Status
  "schedules.colName",      // Name
  "schedules.colStatus",    // Status
  "spares.colName",         // Name
  "spares.colMin",          // Min
  "settings.colName",       // Name
  "settings.colTeam",       // Team
  "settings.colStatus",     // Status
  "pages.planDetail.status", // Status
]);

// Informal German second-person address is forbidden (enterprise formal "Sie").
const INFORMAL_ADDRESS =
  /\b(du|dein|deine|deiner|deinem|deinen|dich|dir|euch|euer|eure|eurem|euren|eurer)\b/i;

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

});

describe("maintenanceOperations — German translation (Phase 86C4B1)", () => {
  const e = flatten(enMO), d = flatten(deMO);

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

  it("preserves protected reliability acronyms untranslated where present", () => {
    expect(d.get("nav.eyebrow")).toBe("CMMS");
    // MTBF/MTTR remain as raw tokens in the reports subtitle.
    expect(String(d.get("pages.reportsPage.subtitle"))).toMatch(/\bMTBF\b/);
    expect(String(d.get("pages.reportsPage.subtitle"))).toMatch(/\bMTTR\b/);
    // KPI acronym retained in the reliability heading.
    expect(String(d.get("reports.reliabilityKpis"))).toMatch(/\bKPIs?\b/);
  });

  it("keeps maintenance safety wording explicit (monitor-only, no control)", () => {
    expect(d.get("dashboard.monitorOnly")).toBe("Nur Überwachung — keine Steuerung");
  });

  it("uses consistent work-order and maintenance terminology", () => {
    expect(d.get("tasks.defaultHeading")).toBe("Arbeitsaufträge");
    expect(d.get("plans.workOrders")).toBe("Arbeitsaufträge");
    expect(d.get("plans.heading")).toBe("Instandhaltungspläne");
    expect(d.get("failures.resolved")).toBe("Behoben");
    expect(d.get("reports.sumOverdue")).toBe("Überfällig");
  });

  it("translates the ICU plan strings while preserving {days}", () => {
    expect(d.get("plans.frequencyEvery")).toBe("Alle {days} Tage");
    expect(d.get("plans.overdueBy")).toBe("Überfällig seit {days} Tagen");
    expect(d.get("plans.dueIn")).toBe("Fällig in {days} Tagen");
  });

  it("has no empty German strings and matching ICU args", () => {
    const bad = [...e]
      .filter(([k, v]) => d.get(k) === "" || argNames(v) !== argNames(d.get(k)))
      .map(([k]) => k);
    expect(bad).toEqual([]);
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

  it("keeps raw MTBF/MTTR acronym labels (still allowlisted — they are acronyms)", () => {
    expect(read("src/components/cmms/CmmsDashboardClient.tsx")).toMatch(/label: "MTBF"/);
    expect(read("src/components/cmms/ReportsClient.tsx")).toMatch(/label: "MTBF"/);
  });

  // PHASE 87L.5 SUPERSEDES the raw-enum half of the former allowlist: task
  // status is a user-visible label, not an acronym, and the underscore
  // transform rendered "IN PROGRESS" inside the Persian UI.
  it("routes task-status display through the localized formatter", () => {
    const src = read("src/components/cmms/MaintenanceTasksClient.tsx");
    expect(src).not.toMatch(/\.replace\(\/_\/g, " "\)/);
    expect(src).toContain('from "@/lib/i18n/enum-label"');
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
