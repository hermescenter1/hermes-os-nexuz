/**
 * Phase 86C4B2B1A-PRE / -FA / -DE — ERP Core (nav, dashboard, KPIs, settings):
 * extraction + Persian + German translation.
 *
 * Part A of four ERP extraction phases. The ERP Core surface
 * (src/components/erp/{ErpNav,ErpDashboardClient,KpiDashboardClient} +
 * src/app/[locale]/erp/{layout,page,kpis/page,settings/page}) had its
 * user-facing text lifted out of hardcoded English and
 * `pathname.startsWith("/fa")` locale detection into the `enterpriseOperations`
 * next-intl namespace:
 *   - en = canonical English
 *   - fa = professional Persian (Phase 86C4B2B1A-FA translated all 50 leaves)
 *   - de = professional German (Phase 86C4B2B1A-DE translated all 50 leaves)
 *
 * German stays INACTIVE (ACTIVE_LOCALES = ["fa","en"]); only the de values
 * changed. Zero fa values equal English (FA_ENGLISH_ALLOW empty). A narrow set
 * of de values stay identical — the German-identical terms Dashboard, Teams,
 * KPIs (DE_ENGLISH_ALLOW). Any other fa===en or de===en pair fails the audit.
 *
 * This phase adds only the `nav`, `dashboard`, `kpis`, `settings` sub-objects.
 * ErpNav carries the full 10-item ERP navigation label set (later phases reuse
 * it). Later ERP modules (projects/tasks/teams/resources/workOrders/inventory/
 * approvals) are NOT extracted here.
 *
 * Retained locale logic (allowlisted below):
 *   - usePathname in ErpNav — active-link detection only
 *   - useLocale for locale-prefixed route (`href`) construction
 *   - toLocaleDateString — date formatting
 *   - raw enum display via `.replace(/_/g," ")` / `.toLowerCase()` (dashboard)
 *   - noIndexMetadata("…") static module labels (shared helper left unchanged)
 */
import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";
import en from "../../../messages/en.json";
import fa from "../../../messages/fa.json";
import de from "../../../messages/de.json";
import { ACTIVE_LOCALES, isActiveLocale, isSupportedLocale } from "@/i18n/locales";
import { routing } from "@/i18n/routing";

type Tree = Record<string, unknown>;
const ROOT = process.cwd();
const read = (rel: string) => fs.readFileSync(path.join(ROOT, rel), "utf8");

const CLIENTS = [
  "src/components/erp/ErpNav.tsx",
  "src/components/erp/ErpDashboardClient.tsx",
  "src/components/erp/KpiDashboardClient.tsx",
];
const PAGES = [
  "src/app/[locale]/erp/layout.tsx",
  "src/app/[locale]/erp/page.tsx",
  "src/app/[locale]/erp/kpis/page.tsx",
  "src/app/[locale]/erp/settings/page.tsx",
];
const SEVEN = [...CLIENTS, ...PAGES];

// All later-phase ERP surfaces (Projects/Tasks, Teams/Resources/Work Orders and
// finally Inventory/Approvals in Phase 86C4B2B1D) have now been extracted, so
// there are no remaining ERP files to guard as "still untouched" here. Each
// phase's own extraction test now positively asserts that its files are fully
// catalog-backed.

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

const enEO = (en as Tree).enterpriseOperations;
const faEO = (fa as Tree).enterpriseOperations;
const deEO = (de as Tree).enterpriseOperations;

// The ERP Core phase owns exactly these four sub-objects. Later ERP subphases
// (Projects & Tasks, Teams/Resources/Work Orders, Inventory/Approvals) extend
// the SAME enterpriseOperations namespace, adding their own initially-English
// leaves. Core leaf-count and Core fa/de translation-quality assertions are
// therefore scoped to these four sub-objects so they stay valid as the
// namespace grows; whole-namespace parity/ICU/empty checks remain unscoped.
const CORE_KEYS = ["nav", "dashboard", "kpis", "settings"] as const;
const coreOnly = (o: unknown): Tree =>
  Object.fromEntries(CORE_KEYS.map((k) => [k, (o as Tree)[k]]));
const enCore = coreOnly(enEO), faCore = coreOnly(faEO), deCore = coreOnly(deEO);

describe("enterpriseOperations (ERP Core) — three-locale parity", () => {
  it("exists in all three catalogs with the 50 ERP Core leaves intact", () => {
    expect(enEO).toBeTruthy();
    expect(faEO).toBeTruthy();
    expect(deEO).toBeTruthy();
    expect(flatten(enCore).size).toBe(50);
  });

  it("sub-object leaf counts: nav 11, dashboard 20, kpis 14, settings 5", () => {
    const c = (o: unknown) => flatten(o).size;
    expect(c((enEO as Tree).nav)).toBe(11);
    expect(c((enEO as Tree).dashboard)).toBe(20);
    expect(c((enEO as Tree).kpis)).toBe(14);
    expect(c((enEO as Tree).settings)).toBe(5);
  });

  it("nav/dashboard/kpis/settings remain the ERP Core top-level objects", () => {
    for (const k of CORE_KEYS) expect(Object.keys(enEO as Tree)).toContain(k);
  });

  it("fa and de mirror en key paths and shapes exactly", () => {
    const e = leafPaths(enEO), f = leafPaths(faEO), d = leafPaths(deEO);
    expect([...f.keys()].sort()).toEqual([...e.keys()].sort());
    expect([...d.keys()].sort()).toEqual([...e.keys()].sort());
    for (const [p, shape] of e) {
      expect(f.get(p), `fa shape ${p}`).toBe(shape);
      expect(d.get(p), `de shape ${p}`).toBe(shape);
    }
  });

  it("ICU argument names match and braces are balanced on every key", () => {
    const e = flatten(enEO), f = flatten(faEO), d = flatten(deEO);
    const bad: string[] = [];
    for (const [k, v] of e) {
      if (argNames(v) !== argNames(f.get(k))) bad.push(`fa:${k}`);
      if (argNames(v) !== argNames(d.get(k))) bad.push(`de:${k}`);
      if (!bracesBalanced(v) || !bracesBalanced(f.get(k)) || !bracesBalanced(d.get(k))) bad.push(`icu:${k}`);
    }
    expect(bad).toEqual([]);
  });

  it("has no empty strings in en, fa or de", () => {
    for (const [name, tree] of [["en", enEO], ["fa", faEO], ["de", deEO]] as const) {
      const empty = [...flatten(tree)].filter(([, v]) => v === "").map(([k]) => `${name}:${k}`);
      expect(empty).toEqual([]);
    }
  });

  it("carries the exact navigation label set", () => {
    const nav = flatten((enEO as Tree).nav);
    expect(nav.get("eyebrow")).toBe("ERP Operations");
    expect(nav.get("items.dashboard")).toBe("Dashboard");
    expect(nav.get("items.workOrders")).toBe("Work Orders");
    expect(nav.get("items.kpis")).toBe("KPIs");
    expect(nav.get("items.settings")).toBe("Settings");
  });
});

// No enterpriseOperations fa value legitimately stays identical to English —
// even "KPIs" is translated to شاخص‌های کلیدی عملکرد. The allowlist is empty.
const FA_ENGLISH_ALLOW = new Set<string>([]);

describe("enterpriseOperations — Persian translation quality (Phase 86C4B2B1A-FA)", () => {
  const e = flatten(enCore), f = flatten(faCore);

  it("every fa leaf outside the allowlist is translated (fa !== en)", () => {
    const untranslated = [...e]
      .filter(([k]) => !FA_ENGLISH_ALLOW.has(k))
      .filter(([k, v]) => f.get(k) === v)
      .map(([k, v]) => `${k}=${JSON.stringify(v)}`);
    expect(untranslated).toEqual([]);
  });

  it("English-identical fa values are exactly the (empty) allowlist", () => {
    const identical = [...e].filter(([k, v]) => f.get(k) === v).map(([k]) => k);
    expect(identical.sort()).toEqual([...FA_ENGLISH_ALLOW].sort());
  });

  it("every fa leaf contains real Persian script", () => {
    const bad = [...f].filter(([, v]) => !/[؀-ۿ]/.test(String(v))).map(([k]) => k);
    expect(bad).toEqual([]);
  });

  it("uses no Arabic ي (U+064A) or ك (U+0643) — Persian ی/ک only", () => {
    expect([...f].filter(([, v]) => /ي/.test(String(v))).map(([k]) => k)).toEqual([]);
    expect([...f].filter(([, v]) => /ك/.test(String(v))).map(([k]) => k)).toEqual([]);
  });

  it("uses the expected core ERP terminology consistently", () => {
    expect(f.get("nav.eyebrow")).toBe("عملیات ERP");
    expect(f.get("dashboard.pageTitle")).toBe("داشبورد عملیات");
    expect(f.get("nav.items.projects")).toBe("پروژه‌ها");
    expect(f.get("nav.items.tasks")).toBe("وظایف");
    expect(f.get("nav.items.resources")).toBe("منابع");
    expect(f.get("nav.items.inventory")).toBe("موجودی");
    expect(f.get("nav.items.workOrders")).toBe("سفارش‌های کاری");
    expect(f.get("nav.items.approvals")).toBe("تأییدها");
    expect(f.get("nav.items.kpis")).toBe("شاخص‌های کلیدی عملکرد");
    expect(f.get("dashboard.totalBudget")).toBe("کل بودجه");
    expect(f.get("dashboard.actualCost")).toBe("هزینه واقعی");
    expect(f.get("dashboard.variance")).toBe("انحراف");
  });

  it("KPI / budget / variance meanings are the intended ones", () => {
    expect(f.get("kpis.taskThroughput")).toBe("نرخ انجام وظایف");        // completed-task rate, not network
    expect(f.get("dashboard.kpiResourceUtilization")).toBe("بهره‌برداری از منابع"); // utilization, not ownership
    expect(f.get("kpis.budgetVariance")).toBe("انحراف بودجه");           // deviation from budget
    expect(f.get("kpis.scheduleVariance")).toBe("انحراف برنامه زمان‌بندی");
    expect(f.get("kpis.approvalCycleTime")).toBe("زمان چرخه تأیید");     // elapsed approval duration
  });

  it("keeps protected ERP/KPI tokens and Latin digits intact", () => {
    expect(f.get("nav.eyebrow")).toContain("ERP");
    expect(f.get("settings.pageTitle")).toContain("ERP");
    expect(f.get("settings.moduleStatusDesc")).toContain("ERP");
    // Phase 67 engine reference keeps Latin "67" (no Persian digits hardcoded).
    expect(f.get("settings.workflowIntegrationDesc")).toContain("67");
    expect(f.get("settings.workflowIntegrationDesc")).not.toContain("۶۷");
  });
});

// German values that legitimately stay identical to English: standard German
// terms/acronyms already spelled the same — Dashboard, Teams, KPIs.
const DE_ENGLISH_ALLOW = new Set<string>([
  "nav.items.dashboard", "nav.items.teams", "nav.items.kpis",
]);

// Informal German second-person address is forbidden (enterprise formal "Sie").
const INFORMAL_ADDRESS =
  /\b(du|dein|deine|deiner|deinem|deinen|dich|dir|euch|euer|eure|eurem|euren|eurer)\b/i;

describe("enterpriseOperations — German translation quality (Phase 86C4B2B1A-DE)", () => {
  const e = flatten(enCore), d = flatten(deCore);

  it("every de leaf outside the allowlist is translated (de !== en)", () => {
    const untranslated = [...e]
      .filter(([k]) => !DE_ENGLISH_ALLOW.has(k))
      .filter(([k, v]) => d.get(k) === v)
      .map(([k, v]) => `${k}=${JSON.stringify(v)}`);
    expect(untranslated).toEqual([]);
  });

  it("the English-identical de values are exactly the allowlist", () => {
    const identical = [...e].filter(([k, v]) => d.get(k) === v).map(([k]) => k);
    expect(identical.sort()).toEqual([...DE_ENGLISH_ALLOW].sort());
  });

  it("uses no informal German address (enterprise formal Sie only)", () => {
    const informal = [...d].filter(([, v]) => INFORMAL_ADDRESS.test(String(v))).map(([k]) => k);
    expect(informal).toEqual([]);
  });

  it("carries genuine German (umlaut/ß present across the namespace)", () => {
    expect([...d.values()].some((v) => /[äöüßÄÖÜ]/.test(String(v)))).toBe(true);
  });

  it("uses the expected core ERP terminology consistently", () => {
    expect(d.get("nav.eyebrow")).toBe("ERP-Betrieb");
    expect(d.get("dashboard.pageTitle")).toBe("Betriebsdashboard");
    expect(d.get("nav.items.projects")).toBe("Projekte");
    expect(d.get("nav.items.tasks")).toBe("Aufgaben");
    expect(d.get("nav.items.resources")).toBe("Ressourcen");
    expect(d.get("nav.items.inventory")).toBe("Bestand");
    expect(d.get("nav.items.workOrders")).toBe("Arbeitsaufträge");
    expect(d.get("nav.items.approvals")).toBe("Genehmigungen");
    expect(d.get("kpis.heading")).toBe("Operative KPIs");
    expect(d.get("dashboard.totalBudget")).toBe("Gesamtbudget");
  });

  it("KPI / budget / variance / schedule meanings are the intended ones", () => {
    expect(d.get("dashboard.actualCost")).toBe("Istkosten");             // Istkosten, not tatsächliche Preise
    expect(d.get("kpis.taskThroughput")).toBe("Aufgabendurchsatz");      // completed-task rate
    expect(d.get("dashboard.kpiResourceUtilization")).toBe("Ressourcenauslastung");
    expect(d.get("dashboard.variance")).toBe("Abweichung");             // deviation (Abweichung, not Differenz)
    expect(d.get("kpis.budgetVariance")).toBe("Budgetabweichung");
    expect(d.get("kpis.scheduleVariance")).toBe("Terminabweichung");    // schedule deviation, distinct
    expect(d.get("kpis.approvalCycleTime")).toBe("Genehmigungsdurchlaufzeit");
  });

  it("keeps protected ERP/KPI tokens and Latin Phase 67 intact", () => {
    expect(d.get("nav.eyebrow")).toContain("ERP");
    expect(d.get("settings.pageTitle")).toContain("ERP");
    expect(d.get("settings.moduleStatusDesc")).toContain("ERP");
    expect(d.get("kpis.heading")).toContain("KPIs");
    expect(d.get("settings.workflowIntegrationDesc")).toContain("Phase 67");
  });
});

describe("ERP Core components and pages are fully catalog-backed", () => {
  it("client components use useTranslations(\"enterpriseOperations\")", () => {
    for (const rel of CLIENTS) {
      expect(read(rel), rel).toMatch(/useTranslations\("enterpriseOperations"\)/);
    }
  });

  it("PHASE 87H: the ERP landing migrated to the AppShell + businessOps command surface; nav labels stay catalog-backed", () => {
    // The landing page + layout were transformed in PHASE 87H (premium
    // business-operations command surface). The page now renders from the
    // additive `businessOps` namespace (enterpriseOperations is fully German
    // and frozen); the layout composes the AppShell + the localized ErpSubNav,
    // which REUSES the existing enterpriseOperations.nav labels — so the ERP
    // landing surface remains fully catalog-backed with no hardcoded strings.
    expect(read("src/app/[locale]/erp/page.tsx")).toMatch(/getTranslations\("businessOps"\)/);
    expect(read("src/app/[locale]/erp/layout.tsx")).toContain("ErpSubNav");
    expect(read("src/components/business-operations/ErpSubNav.tsx")).toMatch(
      /useTranslations\("enterpriseOperations\.nav\.items"\)/,
    );
  });

  it("no ERP Core file keeps isFa / pathname-locale / locale===fa detection", () => {
    for (const rel of SEVEN) {
      const src = read(rel);
      expect(src, `${rel} isFa`).not.toMatch(/\bisFa\b/);
      expect(src, `${rel} pathname fa`).not.toMatch(/pathname\.startsWith\("\/fa"\)/);
      expect(src, `${rel} locale===fa`).not.toMatch(/locale === "fa"/);
    }
  });

  it("usePathname survives only in ErpNav (active-link detection, allowlisted)", () => {
    for (const rel of CLIENTS) {
      const uses = /usePathname/.test(read(rel));
      expect(uses, rel).toBe(rel.endsWith("ErpNav.tsx"));
    }
    // ErpNav uses useLocale strictly for href construction.
    expect(read("src/components/erp/ErpNav.tsx")).toMatch(/const href\s*=\s*`\/\$\{locale\}\$\{item\.href\}`/);
  });

  // Former hardcoded UI strings must be gone from body text. Metadata labels
  // ("ERP", "ERP Dashboard", "ERP Settings", "Operational KPIs") legitimately
  // remain via noIndexMetadata(...), so those files/strings are not asserted.
  const ABSENT: Record<string, string[]> = {
    "src/components/erp/ErpNav.tsx": ["label:"],
    "src/components/erp/ErpDashboardClient.tsx": ["Active Projects", "Budget Overview", "Projects by Status", "Recent Activity", "No recent activity.", "Full report", "View all"],
    "src/components/erp/KpiDashboardClient.tsx": ["Project Completion", "Task Throughput", "avg time to decision", "Approval Cycle Time"],
    "src/app/[locale]/erp/layout.tsx": ["ERP Operations"],
    "src/app/[locale]/erp/page.tsx": ["Operations Dashboard"],
    "src/app/[locale]/erp/settings/page.tsx": ["Module Status", "All ERP modules are active", "Workflow Integration"],
  };

  it("former hardcoded UI strings are gone from their files (JSX comments ignored)", () => {
    const stripComments = (s: string) => s.replace(/\{\/\*[\s\S]*?\*\/\}/g, "");
    const leaks: string[] = [];
    for (const [rel, strings] of Object.entries(ABSENT)) {
      const src = stripComments(read(rel));
      for (const s of strings) if (src.includes(s)) leaks.push(`${rel} :: ${s}`);
    }
    expect(leaks).toEqual([]);
  });

  it("keeps noIndexMetadata static module labels (shared helper untouched)", () => {
    expect(read("src/app/[locale]/erp/layout.tsx")).toContain('noIndexMetadata("ERP")');
    expect(read("src/app/[locale]/erp/page.tsx")).toContain('noIndexMetadata("ERP Dashboard")');
    expect(read("src/app/[locale]/erp/kpis/page.tsx")).toContain('noIndexMetadata("Operational KPIs")');
    expect(read("src/app/[locale]/erp/settings/page.tsx")).toContain('noIndexMetadata("ERP Settings")');
  });
});

describe("ERP Core behavior and navigation preserved (allowlisted)", () => {
  it("ErpNav keeps exact hrefs and ordering (keys mapped, hrefs/order unchanged)", () => {
    const nav = read("src/components/erp/ErpNav.tsx");
    const hrefs = [...nav.matchAll(/href:\s*"([^"]+)"/g)].map((m) => m[1]);
    expect(hrefs).toEqual([
      "/erp", "/erp/projects", "/erp/tasks", "/erp/teams", "/erp/resources",
      "/erp/inventory", "/erp/work-orders", "/erp/approvals", "/erp/kpis", "/erp/settings",
    ]);
    // active-link logic unchanged
    expect(nav).toMatch(/pathname === href \|\| \(item\.href !== "\/erp"/);
  });

  it("keeps dashboard/KPI data calls and calculations unchanged", () => {
    expect(read("src/app/[locale]/erp/page.tsx")).toContain("getErpOverview()");
    expect(read("src/app/[locale]/erp/kpis/page.tsx")).toContain("getErpKpiReport()");
    const dash = read("src/components/erp/ErpDashboardClient.tsx");
    expect(dash).toMatch(/const KPI_COLOR =/);
    expect(dash).toContain("(overview.totalActualCost - overview.totalBudget)");
    expect(read("src/components/erp/KpiDashboardClient.tsx")).toMatch(/const PCT_BAR =/);
  });

  it("keeps raw enum display formatting in the dashboard (allowlisted)", () => {
    const dash = read("src/components/erp/ErpDashboardClient.tsx");
    expect(dash).toMatch(/\.toLowerCase\(\)\.replace\(/);
  });
  // The former "later ERP module files remain untouched" guard is retired: every
  // later ERP surface (through Inventory/Approvals, Phase 86C4B2B1D) is now
  // extracted, and each is positively covered by its own phase's extraction test.
});

describe("Phase 86C4B2B1A-PRE combined — prior work and German state intact", () => {
  it("automation (188), asset (209), maintenance (233) leaf counts unchanged", () => {
    expect(flatten((en as Tree).automationOperations).size).toBe(188);
    expect(flatten((en as Tree).assetOperations).size).toBe(209);
    expect(flatten((en as Tree).maintenanceOperations).size).toBe(233);
  });

  it("ACTIVE_LOCALES is still exactly fa + en; de supported but inactive", () => {
    expect([...ACTIVE_LOCALES]).toEqual(["fa", "en"]);
    expect(isSupportedLocale("de")).toBe(true);
    expect(isActiveLocale("de")).toBe(false);
  });

  it("German stays out of routing (de not routable)", () => {
    expect([...routing.locales]).not.toContain("de");
  });

  it("prior Persian/German translations remain intact", () => {
    // Automation Persian + German
    expect(flatten((fa as Tree).automationOperations).get("nav.items.workflows")).toBe("گردش‌کارها");
    expect(flatten((de as Tree).automationOperations).get("executionDetail.title")).toBe("Ausführung");
    // Asset/CMMS German
    expect(flatten((de as Tree).assetOperations).get("nav.items.registry")).toBe("Anlagenregister");
    expect(flatten((de as Tree).maintenanceOperations).get("plans.heading")).toBe("Instandhaltungspläne");
    // Industrial Brain / Admin German
    expect(flatten((de as Tree).industrialBrain).get("status.modules.neuralReasoningMap")).toBe("Neuronale Reasoning-Map");
    expect(flatten((de as Tree).adminGovernance).get("compliance.title")).toBe("Compliance-Dashboard");
  });

  it("ERP Core fa and de are both fully translated (narrow allowlists)", () => {
    const e = flatten(enCore);
    // fa fully translated — no Core leaf equals English.
    expect([...e].filter(([k, v]) => flatten(faCore).get(k) === v).map(([k]) => k)).toEqual([]);
    // de fully translated except the 3 German-identical terms (Dashboard/Teams/KPIs).
    expect([...e].filter(([k, v]) => flatten(deCore).get(k) === v).length).toBe(3);
  });
});
