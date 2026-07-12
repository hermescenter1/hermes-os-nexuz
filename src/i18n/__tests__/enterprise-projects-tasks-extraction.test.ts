/**
 * Phase 86C4B2B1B-PRE / -FA — ERP Projects & Tasks: extraction + Persian
 * translation.
 *
 * Part B of four ERP extraction phases. The ERP Projects + Tasks surface
 *   Projects: src/app/[locale]/erp/projects/{page,new/page,[id]/page,
 *             [id]/milestones/page} + src/components/erp/{ProjectListClient,
 *             ProjectDetailClient}
 *   Tasks:    src/app/[locale]/erp/tasks/{page,[id]/page} +
 *             src/components/erp/{TaskListClient,TaskDetailClient}
 * had its user-facing text lifted out of hardcoded English and
 * `pathname.startsWith("/fa")` locale detection into two NEW sub-objects of the
 * existing `enterpriseOperations` next-intl namespace: `projects` (21 leaves)
 * and `tasks` (14 leaves) — 35 new leaves, bringing the namespace to 85:
 *   - en = canonical English
 *   - fa = professional Persian (Phase 86C4B2B1B-FA translated all 35 leaves)
 *   - de = temporary English copy (German translation happens in -DE)
 * German stays INACTIVE (ACTIVE_LOCALES = ["fa","en"]).
 *
 * The Persian locale is ACTIVE, so fa is real user-visible UI. Zero fa values
 * remain identical to English (FA_ENGLISH_ALLOW is empty); any fa===en pair
 * fails the audit.
 *
 * Retained locale logic (allowlisted below):
 *   - useLocale in the four client components — locale-prefixed `href`
 *     construction only (`/${locale}/erp/...`)
 *   - toLocaleDateString — date formatting (list/detail/milestones)
 *   - raw enum display via `.toLowerCase().replace("_"," ")` (project/task
 *     status) and raw `{task.priority}` — persisted enum values, NOT translated
 *   - noIndexMetadata("…") static module labels (shared helper left unchanged)
 *   - `POST /api/erp/projects` code sample — raw API route, not translated
 *
 * NOTE: projects/[id]/page.tsx delegates entirely to ProjectDetailClient and
 * carries no user-facing text, so it is intentionally left unmodified.
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

// ── the 10 approved source files ────────────────────────────────────────────
const SERVER_PAGES_WITH_T = [
  "src/app/[locale]/erp/projects/page.tsx",
  "src/app/[locale]/erp/projects/new/page.tsx",
  "src/app/[locale]/erp/projects/[id]/milestones/page.tsx",
  "src/app/[locale]/erp/tasks/page.tsx",
  "src/app/[locale]/erp/tasks/[id]/page.tsx",
];
const CLIENTS = [
  "src/components/erp/ProjectListClient.tsx",
  "src/components/erp/ProjectDetailClient.tsx",
  "src/components/erp/TaskListClient.tsx",
  "src/components/erp/TaskDetailClient.tsx",
];
// Delegates to ProjectDetailClient; no user-facing text — intentionally untouched.
const DELEGATING_PAGE = "src/app/[locale]/erp/projects/[id]/page.tsx";
const TEN = [...SERVER_PAGES_WITH_T, ...CLIENTS, DELEGATING_PAGE];

// Later-phase ERP files that MUST remain untouched this phase — they still carry
// their hardcoded `pathname.startsWith("/fa")` debt (proof of non-modification).
const LATER_ERP_UNTOUCHED = [
  "src/components/erp/TeamListClient.tsx",
  "src/components/erp/WorkOrderListClient.tsx",
  "src/components/erp/InventoryListClient.tsx",
  "src/components/erp/ApprovalListClient.tsx",
];

// ── tree helpers (shared shape with the ERP Core extraction test) ────────────
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
const PERSIAN = /[؀-ۿ]/;

const enEO = (en as Tree).enterpriseOperations as Tree;
const faEO = (fa as Tree).enterpriseOperations as Tree;
const deEO = (de as Tree).enterpriseOperations as Tree;

// ─────────────────────────────────────────────────────────────────────────────
describe("enterpriseOperations projects/tasks — catalog structure & parity", () => {
  it("enterpriseOperations exists in en/fa/de", () => {
    expect(enEO).toBeTruthy();
    expect(faEO).toBeTruthy();
    expect(deEO).toBeTruthy();
  });

  it("top-level objects are exactly nav/dashboard/kpis/settings/projects/tasks", () => {
    const expected = ["dashboard", "kpis", "nav", "projects", "settings", "tasks"];
    expect(Object.keys(enEO).sort()).toEqual(expected);
    expect(Object.keys(faEO).sort()).toEqual(expected);
    expect(Object.keys(deEO).sort()).toEqual(expected);
  });

  it("projects has exactly 21 leaves, tasks exactly 14 (35 combined new)", () => {
    expect(flatten(enEO.projects).size).toBe(21);
    expect(flatten(enEO.tasks).size).toBe(14);
    expect(flatten(enEO.projects).size + flatten(enEO.tasks).size).toBe(35);
  });

  it("enterpriseOperations total is exactly 85 leaves (50 core + 35 new)", () => {
    expect(flatten(enEO).size).toBe(85);
    // core sub-objects unchanged by this phase
    expect(flatten(enEO.nav).size).toBe(11);
    expect(flatten(enEO.dashboard).size).toBe(20);
    expect(flatten(enEO.kpis).size).toBe(14);
    expect(flatten(enEO.settings).size).toBe(5);
  });

  it("fa and de mirror en key paths and object/array shapes exactly", () => {
    const e = leafPaths(enEO), f = leafPaths(faEO), d = leafPaths(deEO);
    expect([...f.keys()].sort()).toEqual([...e.keys()].sort());
    expect([...d.keys()].sort()).toEqual([...e.keys()].sort());
    for (const [p, shape] of e) {
      expect(f.get(p), `fa shape ${p}`).toBe(shape);
      expect(d.get(p), `de shape ${p}`).toBe(shape);
    }
  });

  it("has zero empty values across en/fa/de projects+tasks", () => {
    for (const [name, tree] of [["en", enEO], ["fa", faEO], ["de", deEO]] as const) {
      for (const sub of ["projects", "tasks"] as const) {
        const empty = [...flatten((tree as Tree)[sub])].filter(([, v]) => v === "").map(([k]) => `${name}:${sub}.${k}`);
        expect(empty).toEqual([]);
      }
    }
  });

  it("ICU argument names match across locales and braces are balanced", () => {
    for (const sub of ["projects", "tasks"] as const) {
      const e = flatten(enEO[sub]), f = flatten(faEO[sub]), d = flatten(deEO[sub]);
      const bad: string[] = [];
      for (const [k, v] of e) {
        if (argNames(v) !== argNames(f.get(k))) bad.push(`fa:${sub}.${k}`);
        if (argNames(v) !== argNames(d.get(k))) bad.push(`de:${sub}.${k}`);
        if (!bracesBalanced(v) || !bracesBalanced(f.get(k)) || !bracesBalanced(d.get(k))) bad.push(`icu:${sub}.${k}`);
      }
      expect(bad).toEqual([]);
    }
  });

  it("declares the intended ICU placeholders for count/date interpolation", () => {
    const p = flatten(enEO.projects);
    expect(p.get("count")).toBe("{count, plural, one {# project} other {# projects}}");
    expect(p.get("due")).toBe("Due {date}");
    expect(p.get("tasksCount")).toBe("Tasks ({count})");
    expect(p.get("viewAllTasks")).toBe("View all {count} tasks");
  });

  it("task board columns are keyed by the raw status enum (grouping keys preserved)", () => {
    expect(Object.keys(enEO.tasks as Tree)).toContain("columns");
    expect(Object.keys((enEO.tasks as Tree).columns as Tree).sort()).toEqual(
      ["BLOCKED", "DONE", "IN_PROGRESS", "REVIEW", "TODO"],
    );
  });
});

// ─────────────────────────────────────────────────────────────────────────────
describe("enterpriseOperations projects/tasks — temporary de === English", () => {
  for (const sub of ["projects", "tasks"] as const) {
    it(`every newly extracted de ${sub} value equals English`, () => {
      const e = flatten(enEO[sub]), d = flatten(deEO[sub]);
      const diff = [...e].filter(([k, v]) => d.get(k) !== v).map(([k]) => `${sub}.${k}`);
      expect(diff).toEqual([]);
    });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// No projects/tasks fa value legitimately stays identical to English — every
// leaf (including both ICU plural branches) carries real Persian. The
// allowlist is empty.
const FA_ENGLISH_ALLOW = new Set<string>([]);

const withPrefix = (m: Map<string, unknown>, p: string) =>
  new Map([...m].map(([k, v]) => [`${p}.${k}`, v] as [string, unknown]));

describe("enterpriseOperations projects/tasks — Persian translation quality (Phase 86C4B2B1B-FA)", () => {
  const e = new Map([
    ...withPrefix(flatten(enEO.projects), "projects"),
    ...withPrefix(flatten(enEO.tasks), "tasks"),
  ]);
  const f = new Map([
    ...withPrefix(flatten(faEO.projects), "projects"),
    ...withPrefix(flatten(faEO.tasks), "tasks"),
  ]);

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
    const bad = [...f].filter(([, v]) => !PERSIAN.test(String(v))).map(([k]) => k);
    expect(bad).toEqual([]);
  });

  it("uses no Arabic ي (U+064A) or ك (U+0643) — Persian ی/ک only", () => {
    expect([...f].filter(([, v]) => /ي/.test(String(v))).map(([k]) => k)).toEqual([]);
    expect([...f].filter(([, v]) => /ك/.test(String(v))).map(([k]) => k)).toEqual([]);
  });

  it("aligns terminology with the committed ERP Core Persian glossary", () => {
    const faCore = flatten(faEO);
    expect(f.get("projects.pageTitle")).toBe(faCore.get("nav.items.projects")); // پروژه‌ها
    expect(f.get("projects.tasks")).toBe(faCore.get("nav.items.tasks"));        // وظایف
    expect(f.get("projects.actualCost")).toBe(faCore.get("dashboard.actualCost")); // هزینه واقعی
    expect(f.get("projects.pageTitle")).toBe("پروژه‌ها");
    expect(f.get("projects.milestones")).toBe("نقاط عطف");
    expect(f.get("projects.milestonesPageTitle")).toBe("نقاط عطف");
    expect(f.get("tasks.pageTitle")).toBe("تابلوی وظایف");
  });

  it("task board column labels are the intended kanban terms", () => {
    expect(f.get("tasks.columns.TODO")).toBe("برای انجام");
    expect(f.get("tasks.columns.IN_PROGRESS")).toBe("در حال انجام");
    expect(f.get("tasks.columns.BLOCKED")).toBe("مسدود");
    expect(f.get("tasks.columns.REVIEW")).toBe("بازبینی");
    expect(f.get("tasks.columns.DONE")).toBe("انجام‌شده");
    // milestone completion badge uses the same term as the DONE column
    expect(f.get("projects.milestoneDone")).toBe("انجام‌شده");
  });

  it("keeps ICU structure and Latin digits (no Persian digits)", () => {
    expect(f.get("projects.count")).toBe("{count, plural, one {# پروژه} other {# پروژه}}");
    expect(String(f.get("projects.due"))).toContain("{date}");
    expect(String(f.get("projects.tasksCount"))).toContain("{count}");
    expect(String(f.get("projects.viewAllTasks"))).toContain("{count}");
    const persianDigits = [...f].filter(([, v]) => /[۰-۹]/.test(String(v))).map(([k]) => k);
    expect(persianDigits).toEqual([]);
  });

  it("keeps protected Latin product tokens intact", () => {
    expect(String(f.get("projects.newDescIntro"))).toContain("API");
    expect(String(f.get("projects.newDescIntro"))).toContain("CRM");
    expect(String(f.get("projects.newDescApi"))).toContain("ERP");
    expect(String(f.get("projects.newDescApi"))).toContain("API");
  });
});

// ─────────────────────────────────────────────────────────────────────────────
describe("Projects/Tasks source is fully catalog-backed via next-intl", () => {
  it("server pages use getTranslations(\"enterpriseOperations\")", () => {
    for (const rel of SERVER_PAGES_WITH_T) {
      expect(read(rel), rel).toMatch(/getTranslations\("enterpriseOperations"\)/);
    }
  });

  it("client components use useTranslations(\"enterpriseOperations\")", () => {
    for (const rel of CLIENTS) {
      expect(read(rel), rel).toMatch(/useTranslations\("enterpriseOperations"\)/);
    }
  });

  it("no pathname-based display-language selection remains in any of the 10 files", () => {
    for (const rel of TEN) {
      const src = read(rel);
      expect(src, `${rel} pathname fa`).not.toMatch(/pathname\.startsWith\("\/fa"\)/);
      expect(src, `${rel} pathname includes fa`).not.toMatch(/pathname\.includes\("\/fa"\)/);
      expect(src, `${rel} usePathname`).not.toMatch(/\busePathname\b/);
      expect(src, `${rel} isFa`).not.toMatch(/\bisFa\b/);
      expect(src, `${rel} locale===fa`).not.toMatch(/locale === "fa"/);
      expect(src, `${rel} locale.startsWith fa`).not.toMatch(/locale\.startsWith\("fa"\)/);
      expect(src, `${rel} labelFa`).not.toMatch(/label(En|Fa)\b/);
    }
  });

  it("useLocale survives in clients strictly for locale-prefixed href construction", () => {
    for (const rel of CLIENTS) {
      const src = read(rel);
      expect(src, `${rel} useLocale`).toMatch(/const locale = useLocale\(\)/);
      // every locale use is inside a `/${locale}/erp/...` href — no locale branching
      expect(src, `${rel} href pattern`).toMatch(/`\/\$\{locale\}\/erp/);
      expect(src, `${rel} no locale ternary`).not.toMatch(/locale\s*[=!]==?\s*"/);
    }
  });

  it("no hardcoded Persian UI strings exist in any of the 10 files", () => {
    for (const rel of TEN) {
      expect(PERSIAN.test(read(rel)), `${rel} contains Persian`).toBe(false);
    }
  });

  // Former hardcoded UI strings that MUST be gone. Retained noIndexMetadata
  // labels ("Projects"/"New Project"/"Project"/"Milestones"/"Tasks"/"Task") are
  // deliberately NOT asserted absent — only body text is checked.
  const ABSENT: Record<string, string[]> = {
    "src/app/[locale]/erp/projects/page.tsx": [">Projects</h1>"],
    "src/app/[locale]/erp/projects/new/page.tsx": [
      "Create a project via the API", "import from CRM opportunities",
      "The ERP project creation form", "Back to Projects", ">New Project</h1>",
    ],
    "src/app/[locale]/erp/projects/[id]/milestones/page.tsx": [
      "No milestones yet.", ">Milestones</h1>", ">Done</span>",
    ],
    "src/components/erp/ProjectListClient.tsx": [
      "New Project", "No projects found.", "Due {dueStr}", '!== 1 ? "s"',
    ],
    "src/components/erp/ProjectDetailClient.tsx": [
      'label: "Status"', 'label: "Budget"', "Actual Cost", "Completion</span>",
      ">Milestones<", ">Tasks<", "Tasks ({project.tasks.length})", "View all ",
    ],
    "src/app/[locale]/erp/tasks/page.tsx": ["Task Board"],
    "src/app/[locale]/erp/tasks/[id]/page.tsx": ["Task Detail"],
    "src/components/erp/TaskListClient.tsx": [
      "COL_LABEL", "To Do", "In Progress", ">Empty</div>",
    ],
    "src/components/erp/TaskDetailClient.tsx": [
      "Due Date", "Estimated Hours", "Actual Hours", 'label: "Priority"',
      "View project", "Back to Tasks",
    ],
  };

  it("no hardcoded user-facing English body text remains (metadata labels excepted)", () => {
    const stripComments = (s: string) => s.replace(/\{\/\*[\s\S]*?\*\/\}/g, "");
    const leaks: string[] = [];
    for (const [rel, strings] of Object.entries(ABSENT)) {
      const src = stripComments(read(rel));
      for (const s of strings) if (src.includes(s)) leaks.push(`${rel} :: ${s}`);
    }
    expect(leaks).toEqual([]);
  });

  it("the delegating project detail page stays untouched (no getTranslations, still delegates)", () => {
    const src = read(DELEGATING_PAGE);
    expect(src).toContain("<ProjectDetailClient");
    expect(src).toContain('noIndexMetadata("Project")');
    expect(src).not.toMatch(/getTranslations/);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
describe("Projects/Tasks behavior & raw values preserved", () => {
  it("raw project status enum display is preserved (labels not translated)", () => {
    const list = read("src/components/erp/ProjectListClient.tsx");
    expect(list).toMatch(/const STATUS_COLOR: Record<string, string> = \{/);
    for (const s of ["ACTIVE", "PLANNED", "ON_HOLD", "COMPLETED", "CANCELLED"]) {
      expect(list, `STATUS_COLOR ${s}`).toContain(`${s}:`);
    }
    expect(list).toContain('p.status.toLowerCase().replace("_"," ")');
    const detail = read("src/components/erp/ProjectDetailClient.tsx");
    expect(detail).toContain('project.status.toLowerCase().replace("_"," ")');
    expect(detail).toContain('task.status.toLowerCase().replace("_"," ")');
  });

  it("raw task status enum grouping keys are preserved (columns unchanged)", () => {
    const list = read("src/components/erp/TaskListClient.tsx");
    expect(list).toContain('const COLUMNS = ["TODO","IN_PROGRESS","BLOCKED","REVIEW","DONE"] as const');
    expect(list).toContain("tasks.filter(task => task.status === col)");
    expect(read("src/components/erp/TaskDetailClient.tsx")).toContain(
      'task.status.toLowerCase().replace("_"," ")',
    );
  });

  it("raw priority enum values are preserved (rendered directly, not translated)", () => {
    const list = read("src/components/erp/TaskListClient.tsx");
    expect(list).toMatch(/const PRIORITY_COLOR: Record<string, string> = \{/);
    for (const p of ["LOW", "MEDIUM", "HIGH", "CRITICAL"]) {
      expect(list, `PRIORITY_COLOR ${p}`).toContain(`${p}:`);
    }
    expect(list).toContain("{task.priority}");
    expect(read("src/components/erp/TaskDetailClient.tsx")).toContain("{task.priority}");
  });

  it("data-access calls, HTTP method sample and route segments are unchanged", () => {
    expect(read("src/app/[locale]/erp/projects/page.tsx")).toContain("getProjects(status)");
    expect(read("src/app/[locale]/erp/projects/[id]/page.tsx")).toContain("getProjectById(id)");
    expect(read("src/app/[locale]/erp/projects/[id]/milestones/page.tsx")).toContain("getProjectById(id)");
    expect(read("src/app/[locale]/erp/tasks/page.tsx")).toContain("getTasks(projectId, status)");
    expect(read("src/app/[locale]/erp/tasks/[id]/page.tsx")).toContain("getTaskById(id)");
    // raw API route + HTTP method left as a literal code sample (not translated)
    expect(read("src/app/[locale]/erp/projects/new/page.tsx")).toContain("POST /api/erp/projects");
    expect(read("src/app/[locale]/erp/projects/new/page.tsx")).toContain('href="../projects"');
  });

  it("filtering/sorting/progress calculations are unchanged", () => {
    const detail = read("src/components/erp/ProjectDetailClient.tsx");
    expect(detail).toContain('project.tasks?.filter(task => task.status === "DONE")');
    expect(detail).toContain("Math.round((doneCount / taskCount) * 100)");
  });

  it("milestone logic (completion flag, ordering, date formatting) is preserved", () => {
    const ms = read("src/app/[locale]/erp/projects/[id]/milestones/page.tsx");
    expect(ms).toContain("(project.milestones ?? []).map");
    expect(ms).toContain("m.completedAt");
    expect(ms).toContain("new Date(m.dueDate).toLocaleDateString()");
  });

  it("persisted project/task content is still rendered as runtime data", () => {
    expect(read("src/components/erp/ProjectDetailClient.tsx")).toContain("{project.name}");
    expect(read("src/components/erp/ProjectListClient.tsx")).toContain("{p.name}");
    expect(read("src/components/erp/TaskDetailClient.tsx")).toContain("{task.title}");
    expect(read("src/app/[locale]/erp/projects/[id]/milestones/page.tsx")).toContain("{m.name}");
  });

  it("noIndexMetadata static module labels remain (shared helper untouched)", () => {
    expect(read("src/app/[locale]/erp/projects/page.tsx")).toContain('noIndexMetadata("Projects")');
    expect(read("src/app/[locale]/erp/projects/new/page.tsx")).toContain('noIndexMetadata("New Project")');
    expect(read("src/app/[locale]/erp/projects/[id]/page.tsx")).toContain('noIndexMetadata("Project")');
    expect(read("src/app/[locale]/erp/projects/[id]/milestones/page.tsx")).toContain('noIndexMetadata("Milestones")');
    expect(read("src/app/[locale]/erp/tasks/page.tsx")).toContain('noIndexMetadata("Tasks")');
    expect(read("src/app/[locale]/erp/tasks/[id]/page.tsx")).toContain('noIndexMetadata("Task")');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
describe("locale configuration and later ERP modules unchanged", () => {
  it("ACTIVE_LOCALES is still exactly fa + en; de supported but inactive", () => {
    expect([...ACTIVE_LOCALES]).toEqual(["fa", "en"]);
    expect(isSupportedLocale("de")).toBe(true);
    expect(isActiveLocale("de")).toBe(false);
  });

  it("German stays out of routing (not routable / no active switcher exposure)", () => {
    expect([...routing.locales]).not.toContain("de");
  });

  it("later ERP module files remain untouched (still carry pathname-locale debt)", () => {
    for (const rel of LATER_ERP_UNTOUCHED) {
      expect(read(rel), rel).toMatch(/pathname\.startsWith\("\/fa"\)/);
    }
  });
});

// ─────────────────────────────────────────────────────────────────────────────
describe("prior translations remain intact", () => {
  it("prior namespace leaf counts unchanged (automation 188, asset 209, maintenance 233)", () => {
    expect(flatten((en as Tree).automationOperations).size).toBe(188);
    expect(flatten((en as Tree).assetOperations).size).toBe(209);
    expect(flatten((en as Tree).maintenanceOperations).size).toBe(233);
  });

  it("ERP Core Persian & German translations remain intact", () => {
    const f = flatten(faEO), d = flatten(deEO);
    expect(f.get("nav.items.projects")).toBe("پروژه‌ها");
    expect(f.get("nav.items.tasks")).toBe("وظایف");
    expect(d.get("nav.items.projects")).toBe("Projekte");
    expect(d.get("nav.items.tasks")).toBe("Aufgaben");
  });

  it("Automation / Asset / CMMS / Industrial Brain / Admin translations remain intact", () => {
    expect(flatten((fa as Tree).automationOperations).get("nav.items.workflows")).toBe("گردش‌کارها");
    expect(flatten((de as Tree).automationOperations).get("executionDetail.title")).toBe("Ausführung");
    expect(flatten((de as Tree).assetOperations).get("nav.items.registry")).toBe("Anlagenregister");
    expect(flatten((de as Tree).maintenanceOperations).get("plans.heading")).toBe("Instandhaltungspläne");
    expect(flatten((de as Tree).industrialBrain).get("status.modules.neuralReasoningMap")).toBe("Neuronale Reasoning-Map");
    expect(flatten((de as Tree).adminGovernance).get("compliance.title")).toBe("Compliance-Dashboard");
  });

  it("Journal translations remain intact (present in all three, Persian retained)", () => {
    expect((en as Tree).journal).toBeTruthy();
    expect((fa as Tree).journal).toBeTruthy();
    expect((de as Tree).journal).toBeTruthy();
    const faJournal = [...flatten((fa as Tree).journal).values()];
    expect(faJournal.some((v) => PERSIAN.test(String(v)))).toBe(true);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
describe("this test file is hygienic (no skipped/focused/swallowed assertions)", () => {
  // Needles are assembled at runtime so this file never literally contains the
  // forbidden tokens it forbids (avoids self-matching false positives).
  it("contains no skip / only / swallowed-catch constructs", () => {
    const self = read("src/i18n/__tests__/enterprise-projects-tasks-extraction.test.ts");
    const skip = "sk" + "ip";
    const only = "on" + "ly";
    const swallow = "." + "catch" + "(";
    for (const kw of ["it", "test", "describe"]) {
      expect(self.includes(`${kw}.${skip}`), `${kw}.${skip}`).toBe(false);
      expect(self.includes(`${kw}.${only}`), `${kw}.${only}`).toBe(false);
    }
    expect(self.includes(swallow), "swallowed failure").toBe(false);
  });
});
