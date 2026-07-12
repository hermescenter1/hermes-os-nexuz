/**
 * Phase 86C4B2A-PRE — Workflow Automation message-catalog extraction.
 *
 * The Automation module (src/components/automation/* + src/app/[locale]/automation/*)
 * had its user-facing text lifted out of hardcoded English and
 * `pathname.startsWith("/fa")` locale detection into the `automationOperations`
 * next-intl namespace. ARCHITECTURAL extraction only — this surface is currently
 * English-only, so:
 *   - en = canonical English
 *   - fa = temporary English copy (no Persian existed here to preserve)
 *   - de = temporary English copy (German not translated in this phase)
 *
 * Retained locale logic (allowlisted below):
 *   - usePathname in AutomationNav — active-link detection only
 *   - useLocale for locale-prefixed route (`href`) construction
 *   - toLocaleString/toLocaleDateString/toLocaleTimeString — date/time formatting
 *   - raw enum display (STATUS/TRIGGER/CATEGORY/log level) shown verbatim
 *   - raw JSON placeholder / default config strings in the builder (code, not prose)
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

const COMPONENTS = [
  "AutomationNav", "AutomationDashboardClient", "WorkflowListClient", "ExecutionListClient",
  "ExecutionDetailClient", "TemplateGalleryClient", "TemplateDetailClient", "WebhookListClient",
  "WorkflowDetailClient", "WorkflowBuilderClient",
].map((n) => `src/components/automation/${n}.tsx`);

// Server pages/layout that render user-facing text and now use getTranslations.
const PAGES_WITH_T = [
  "layout", "page", "settings/page", "webhooks/page", "templates/page",
  "executions/page", "workflows/new/page", "workflows/[id]/builder/page",
].map((p) => `src/app/[locale]/automation/${p}.tsx`);

// Detail/list pass-through pages with no own UI text (exempt from getTranslations).
const PAGES_NO_TEXT = [
  "workflows/page", "templates/[id]/page", "executions/[id]/page", "workflows/[id]/page",
].map((p) => `src/app/[locale]/automation/${p}.tsx`);

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

const enAO = (en as Tree).automationOperations;
const faAO = (fa as Tree).automationOperations;
const deAO = (de as Tree).automationOperations;

describe("automationOperations namespace — three-locale parity", () => {
  it("exists in all three catalogs with exactly 188 leaves", () => {
    expect(enAO).toBeTruthy();
    expect(faAO).toBeTruthy();
    expect(deAO).toBeTruthy();
    expect(flatten(enAO).size).toBe(188);
  });

  it("fa and de mirror en key paths and shapes exactly", () => {
    const e = leafPaths(enAO), f = leafPaths(faAO), d = leafPaths(deAO);
    expect([...f.keys()].sort()).toEqual([...e.keys()].sort());
    expect([...d.keys()].sort()).toEqual([...e.keys()].sort());
    for (const [p, shape] of e) {
      expect(f.get(p), `fa shape ${p}`).toBe(shape);
      expect(d.get(p), `de shape ${p}`).toBe(shape);
    }
  });

  it("ICU argument names match and braces are balanced on every key", () => {
    const e = flatten(enAO), f = flatten(faAO), d = flatten(deAO);
    const bad: string[] = [];
    for (const [k, v] of e) {
      if (argNames(v) !== argNames(f.get(k))) bad.push(`fa:${k}`);
      if (argNames(v) !== argNames(d.get(k))) bad.push(`de:${k}`);
      if (!bracesBalanced(v) || !bracesBalanced(f.get(k)) || !bracesBalanced(d.get(k))) bad.push(`icu:${k}`);
    }
    expect(bad).toEqual([]);
  });

  it("has no empty strings in en, fa or de", () => {
    for (const [name, tree] of [["en", enAO], ["fa", faAO], ["de", deAO]] as const) {
      const empty = [...flatten(tree)].filter(([, v]) => v === "").map(([k]) => `${name}:${k}`);
      expect(empty).toEqual([]);
    }
  });

  it("English-only surface: fa and de copy English verbatim (no Persian, no German yet)", () => {
    const e = flatten(enAO), f = flatten(faAO), d = flatten(deAO);
    const faDiverge = [...e].filter(([k, v]) => f.get(k) !== v).map(([k]) => k);
    const deDiverge = [...e].filter(([k, v]) => d.get(k) !== v).map(([k]) => k);
    expect(faDiverge).toEqual([]);
    expect(deDiverge).toEqual([]);
  });

  it("preserves the exact count-plural and placeholder strings", () => {
    const e = flatten(enAO);
    expect(e.get("workflowList.heading")).toBe("{count, plural, one {# Workflow} other {# Workflows}}");
    expect(e.get("executionList.heading")).toBe("{count, plural, one {# Execution} other {# Executions}}");
    expect(e.get("webhooks.heading")).toBe("{count, plural, one {# Webhook} other {# Webhooks}}");
    expect(e.get("dashboard.uses")).toBe("{count} uses");
    expect(e.get("templateDetail.usageCount")).toBe("{count} workflows");
    expect(e.get("executionDetail.steps")).toBe("Execution Steps ({count})");
    expect(e.get("workflowDetail.tabConditions")).toBe("Conditions ({count})");
  });
});

describe("Automation components and pages are fully catalog-backed", () => {
  it("every automation component uses useTranslations(\"automationOperations\")", () => {
    for (const rel of COMPONENTS) {
      expect(read(rel), rel).toMatch(/useTranslations\("automationOperations"\)/);
    }
  });

  it("every text-bearing page/layout uses getTranslations(\"automationOperations\")", () => {
    for (const rel of PAGES_WITH_T) {
      expect(read(rel), rel).toMatch(/getTranslations\("automationOperations"\)/);
    }
  });

  it("no component or page keeps isFa / pathname-locale / locale===fa detection", () => {
    for (const rel of [...COMPONENTS, ...PAGES_WITH_T, ...PAGES_NO_TEXT]) {
      const src = read(rel);
      expect(src, `${rel} isFa`).not.toMatch(/\bisFa\b/);
      expect(src, `${rel} pathname fa`).not.toMatch(/pathname\.startsWith\("\/fa"\)/);
      expect(src, `${rel} locale===fa`).not.toMatch(/locale === "fa"/);
    }
  });

  it("no hardcoded Persian UI strings remain in the automation surface", () => {
    for (const rel of [...COMPONENTS, ...PAGES_WITH_T, ...PAGES_NO_TEXT]) {
      const persian = read(rel).match(/[؀-ۿ]/g) ?? [];
      expect(persian, rel).toEqual([]);
    }
  });

  it("usePathname survives only in AutomationNav (active-link detection, allowlisted)", () => {
    for (const rel of COMPONENTS) {
      const uses = /usePathname/.test(read(rel));
      expect(uses, rel).toBe(rel.endsWith("AutomationNav.tsx"));
    }
  });

  // Curated file-boundary absence: former hardcoded UI strings must no longer be
  // string literals in the component/page — proving they moved into the catalog.
  const ABSENT: Record<string, string[]> = {
    "src/components/automation/AutomationNav.tsx": ["label:"],
    "src/components/automation/AutomationDashboardClient.tsx": ["Active Workflows", "Recent Executions", "Workflow Status Breakdown", "Popular Templates"],
    "src/components/automation/WorkflowListClient.tsx": ["New Workflow", "No workflows yet.", "CRM: Lead Created"],
    "src/components/automation/ExecutionListClient.tsx": ["Triggered By", "No executions yet."],
    "src/components/automation/ExecutionDetailClient.tsx": ["Execution Steps", "Triggered By"],
    "src/components/automation/TemplateGalleryClient.tsx": ["Use Template", "Built-in"],
    "src/components/automation/TemplateDetailClient.tsx": ["Back to Templates", "Always executes."],
    "src/components/automation/WebhookListClient.tsx": ["Register Webhook", "Register New Webhook", "Name and URL are required"],
    "src/components/automation/WorkflowDetailClient.tsx": ["No conditions —", "No actions configured."],
    "src/components/automation/WorkflowBuilderClient.tsx": ["This workflow fires whenever", "Save Changes", "CRM: Opportunity Won", "Name is required"],
    "src/app/[locale]/automation/page.tsx": ["Workflow Automation"],
    "src/app/[locale]/automation/settings/page.tsx": ["Automation Settings", "Workflow Engine Mode", "RBAC Protection"],
    "src/app/[locale]/automation/webhooks/page.tsx": ["Webhook Endpoints"],
    "src/app/[locale]/automation/templates/page.tsx": ["Workflow Templates"],
    "src/app/[locale]/automation/executions/page.tsx": ["Execution History"],
  };

  it("former hardcoded UI strings are gone from their components/pages", () => {
    const leaks: string[] = [];
    for (const [rel, strings] of Object.entries(ABSENT)) {
      const src = read(rel);
      for (const s of strings) if (src.includes(s)) leaks.push(`${rel} :: ${s}`);
    }
    expect(leaks).toEqual([]);
  });
});

describe("Automation behavior and raw values are preserved (allowlisted)", () => {
  it("keeps raw enum option arrays and status/category maps unchanged", () => {
    const builder = read("src/components/automation/WorkflowBuilderClient.tsx");
    expect(builder).toMatch(/"ALWAYS","FIELD_EQUALS"/);
    expect(builder).toMatch(/"CREATE_NOTIFICATION"/);
    expect(builder).toMatch(/"DRAFT","ACTIVE","PAUSED","ARCHIVED"/);
    // Raw JSON placeholder + default config are code, intentionally not extracted.
    expect(builder).toContain('{"key":"value"}');
    expect(builder).toContain('{"channel":"in_app","message":""}');
  });

  it("keeps API fetch URLs and HTTP methods unchanged", () => {
    const webhooks = read("src/components/automation/WebhookListClient.tsx");
    expect(webhooks).toContain('/api/automation/webhooks');
    expect(webhooks).toMatch(/method:\s*"POST"/);
    const builder = read("src/components/automation/WorkflowBuilderClient.tsx");
    expect(builder).toContain("/api/automation/workflows");
    expect(builder).toMatch(/initial \? "PATCH" : "POST"/);
  });

  it("keeps the raw enum trigger values (order preserved) in the builder", () => {
    const builder = read("src/components/automation/WorkflowBuilderClient.tsx");
    expect(builder).toMatch(/TRIGGER_OPTION_VALUES/);
    expect(builder).toMatch(/"MANUAL",/);
    expect(builder).toMatch(/"KNOWLEDGE_ARTICLE_CREATED",/);
  });
});

describe("Phase 86C4B2A-PRE combined — prior work and German state intact", () => {
  it("assetOperations (209) and maintenanceOperations (233) leaf counts unchanged", () => {
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

  it("prior German translations remain intact (assets, CMMS, admin, industrial, journal)", () => {
    const ao = flatten((de as Tree).assetOperations);
    expect(ao.get("nav.items.registry")).toBe("Anlagenregister");
    const mo = flatten((de as Tree).maintenanceOperations);
    expect(mo.get("plans.heading")).toBe("Instandhaltungspläne");
    const ib = flatten((de as Tree).industrialBrain);
    expect(ib.get("status.modules.neuralReasoningMap")).toBe("Neuronale Reasoning-Map");
    const ag = flatten((de as Tree).adminGovernance);
    expect(ag.get("compliance.title")).toBe("Compliance-Dashboard");
    const j = flatten((de as Tree).journal);
    expect([...j.values()].some((v) => /[äöüßÄÖÜ]/.test(String(v)))).toBe(true);
  });

  it("automationOperations is English carryover in de (German deferred, not yet translated)", () => {
    const e = flatten(enAO), d = flatten(deAO);
    expect([...e].every(([k, v]) => d.get(k) === v)).toBe(true);
  });
});
