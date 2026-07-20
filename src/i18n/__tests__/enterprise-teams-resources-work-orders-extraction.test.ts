/**
 * Phase 86C4B2B1C-PRE / -FA / -DE — ERP Teams, Resources & Work Orders:
 * message-catalog extraction + Persian + German translation.
 *
 * Part C of four ERP extraction phases. The ERP Teams/Resources/Work Orders
 * surface
 *   Teams:       src/app/[locale]/erp/teams/{page,[id]/page} +
 *                src/components/erp/{TeamListClient,TeamDetailClient}
 *   Resources:   src/app/[locale]/erp/resources/page +
 *                src/components/erp/ResourceListClient
 *   Work Orders: src/app/[locale]/erp/work-orders/{page,[id]/page} +
 *                src/components/erp/{WorkOrderListClient,WorkOrderDetailClient}
 * had its user-facing text lifted out of hardcoded English and
 * `pathname.startsWith("/fa")` locale detection into three NEW sub-objects of
 * the existing `enterpriseOperations` next-intl namespace: `teams` (7 leaves),
 * `resources` (10) and `workOrders` (15) — 32 new leaves, bringing the
 * namespace to 117:
 *   - en = canonical English (exact former rendered text, including the
 *     lowercase enum-derived display labels)
 *   - fa = professional Persian (Phase 86C4B2B1C-FA translated all 32 leaves;
 *     FA_ENGLISH_ALLOW is empty — zero fa values equal English)
 *   - de = professional German (Phase 86C4B2B1C-DE; 30 translated + 2
 *     legitimate German-identical terms allowlisted: Teams, Team)
 * German stays INACTIVE (ACTIVE_LOCALES = ["fa","en"]).
 *
 * Retained locale/raw logic (allowlisted below):
 *   - useLocale in TeamList/TeamDetail/WorkOrderList/WorkOrderDetail clients —
 *     locale-prefixed `href` construction only (`/${locale}/erp/...`);
 *     ResourceListClient renders no links and uses no locale at all
 *   - toLocaleDateString — date formatting (work-order list/detail)
 *   - raw `{wo.priority}` display (untransformed enum token, mirrors the
 *     retained `{task.priority}` convention from Part B) — NOT translated
 *   - raw `m.role?.toLowerCase()` display — team-member role is an OPEN string
 *     column (Prisma String, no enum), so no closed label map is possible;
 *     only the null-fallback literal ("member") moved to the catalog
 *   - `$${r.costRate}/h` — currency symbol + numeric + unit composition
 *   - `"—"` em-dash empty-value markers (symbols, not text)
 *   - raw IDs rendered directly: {m.userId}, wo.teamId
 *   - persisted runtime content rendered directly: team.name/description,
 *     r.name/description, wo.title/description, a.notes ?? a.action,
 *     wo.completionNote
 *   - noIndexMetadata("…") static module labels (shared helper left unchanged)
 *
 * NOTE: teams/[id]/page.tsx and work-orders/[id]/page.tsx delegate entirely to
 * their detail clients and carry no user-facing text, so they are intentionally
 * left unmodified (same convention as projects/[id]/page.tsx in Part B).
 */
import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";
import en from "../../../messages/en.json";
import fa from "../../../messages/fa.json";
import de from "../../../messages/de.json";
import {
  ACTIVE_LOCALES,
  isActiveLocale,
  isSupportedLocale,
  activeLocaleOptions,
} from "@/i18n/locales";
import { routing } from "@/i18n/routing";

type Tree = Record<string, unknown>;
const ROOT = process.cwd();
const read = (rel: string) => fs.readFileSync(path.join(ROOT, rel), "utf8");

// ── the 10 approved source files ────────────────────────────────────────────
const SERVER_PAGES_WITH_T = [
  "src/app/[locale]/erp/teams/page.tsx",
  "src/app/[locale]/erp/resources/page.tsx",
  "src/app/[locale]/erp/work-orders/page.tsx",
];
// Clients that build locale-prefixed links (useLocale + useTranslations).
const CLIENTS_WITH_LOCALE = [
  "src/components/erp/TeamListClient.tsx",
  "src/components/erp/TeamDetailClient.tsx",
  "src/components/erp/WorkOrderListClient.tsx",
  "src/components/erp/WorkOrderDetailClient.tsx",
];
// ResourceListClient renders no links — useTranslations only, no useLocale.
const CLIENT_NO_LOCALE = "src/components/erp/ResourceListClient.tsx";
const CLIENTS = [...CLIENTS_WITH_LOCALE, CLIENT_NO_LOCALE];
// Delegate to their detail clients; no user-facing text — intentionally untouched.
const DELEGATING_PAGES = [
  "src/app/[locale]/erp/teams/[id]/page.tsx",
  "src/app/[locale]/erp/work-orders/[id]/page.tsx",
];
const TEN = [...SERVER_PAGES_WITH_T, ...CLIENTS, ...DELEGATING_PAGES];

// Part D (Inventory/Approvals) extraction is now performed and owned by
// enterprise-inventory-approvals-extraction.test.ts, which asserts those files
// ARE fully catalog-backed (useTranslations, no pathname debt). The prior
// "still untouched" negative guard is therefore retired from this phase's test.

// ── tree helpers (shared shape with the prior ERP extraction tests) ──────────
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
const withPrefix = (m: Map<string, unknown>, p: string) =>
  new Map([...m].map(([k, v]) => [`${p}.${k}`, v] as [string, unknown]));

const enEO = (en as Tree).enterpriseOperations as Tree;
const faEO = (fa as Tree).enterpriseOperations as Tree;
const deEO = (de as Tree).enterpriseOperations as Tree;

const newLeaves = (tree: Tree) =>
  new Map<string, unknown>([
    ...withPrefix(flatten(tree.teams), "teams"),
    ...withPrefix(flatten(tree.resources), "resources"),
    ...withPrefix(flatten(tree.workOrders), "workOrders"),
  ]);

// ─────────────────────────────────────────────────────────────────────────────
describe("enterpriseOperations teams/resources/workOrders — catalog structure & parity", () => {
  it("enterpriseOperations exists in en/fa/de", () => {
    expect(enEO).toBeTruthy();
    expect(faEO).toBeTruthy();
    expect(deEO).toBeTruthy();
  });

  // The exact post-D top-level set (adds inventory/approvals) is owned by
  // enterprise-inventory-approvals-extraction.test.ts. Here we assert only that
  // the nine sub-objects this phase relies on remain present — forward-compatible
  // as later phases extend enterpriseOperations.
  it("the nine post-C sub-objects remain top-level objects", () => {
    const expected = [
      "dashboard", "kpis", "nav", "projects", "resources",
      "settings", "tasks", "teams", "workOrders",
    ];
    for (const k of expected) {
      expect(Object.keys(enEO), `en ${k}`).toContain(k);
      expect(Object.keys(faEO), `fa ${k}`).toContain(k);
      expect(Object.keys(deEO), `de ${k}`).toContain(k);
    }
  });

  it("teams has exactly 7 leaves, resources 10, workOrders 15 (32 combined new)", () => {
    expect(flatten(enEO.teams).size).toBe(7);
    expect(flatten(enEO.resources).size).toBe(10);
    expect(flatten(enEO.workOrders).size).toBe(15);
    expect(newLeaves(enEO).size).toBe(32);
  });

  it("the nine post-C sub-objects still sum to 117 leaves (85 prior + 32 new)", () => {
    // Whole-namespace total is owned by the inventory/approvals phase; assert the
    // sum of the nine sub-objects this phase knows about (forward-compatible).
    const nine = [
      "nav", "dashboard", "kpis", "settings",
      "projects", "tasks", "teams", "resources", "workOrders",
    ];
    expect(nine.reduce((s, k) => s + flatten(enEO[k]).size, 0)).toBe(117);
    // Part A + B sub-objects unchanged by this phase
    expect(flatten(enEO.nav).size).toBe(11);
    expect(flatten(enEO.dashboard).size).toBe(20);
    expect(flatten(enEO.kpis).size).toBe(14);
    expect(flatten(enEO.settings).size).toBe(5);
    expect(flatten(enEO.projects).size).toBe(21);
    expect(flatten(enEO.tasks).size).toBe(14);
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

  it("has zero empty values across the whole namespace in en/fa/de", () => {
    for (const [name, tree] of [["en", enEO], ["fa", faEO], ["de", deEO]] as const) {
      const empty = [...flatten(tree)].filter(([, v]) => v === "").map(([k]) => `${name}:${k}`);
      expect(empty).toEqual([]);
    }
  });

  it("ICU argument names match across locales and braces are balanced", () => {
    const e = flatten(enEO), f = flatten(faEO), d = flatten(deEO);
    const bad: string[] = [];
    for (const [k, v] of e) {
      if (argNames(v) !== argNames(f.get(k))) bad.push(`fa:${k}`);
      if (argNames(v) !== argNames(d.get(k))) bad.push(`de:${k}`);
      if (!bracesBalanced(v) || !bracesBalanced(f.get(k)) || !bracesBalanced(d.get(k))) bad.push(`icu:${k}`);
    }
    expect(bad).toEqual([]);
  });

  it("declares the intended ICU placeholders for capacity/date interpolation", () => {
    expect(flatten(enEO.teams).get("capacityValue")).toBe("Capacity: {value}");
    expect(flatten(enEO.workOrders).get("due")).toBe("Due {date}");
  });

  it("resource type labels are keyed by the raw ErpResourceType enum", () => {
    expect(Object.keys((enEO.resources as Tree).types as Tree).sort()).toEqual(
      ["EQUIPMENT", "FACILITY", "HUMAN", "SOFTWARE", "TOOL", "VEHICLE"],
    );
  });

  it("work-order status labels are keyed by the raw ErpWorkOrderStatus enum", () => {
    expect(Object.keys((enEO.workOrders as Tree).status as Tree).sort()).toEqual(
      ["ASSIGNED", "CANCELLED", "COMPLETED", "IN_PROGRESS", "OPEN", "WAITING_APPROVAL"],
    );
  });

  it("en labels preserve the exact former rendered text (lowercase enum-derived)", () => {
    const s = flatten(enEO.workOrders);
    expect(s.get("status.OPEN")).toBe("open");
    expect(s.get("status.IN_PROGRESS")).toBe("in progress");
    expect(s.get("status.WAITING_APPROVAL")).toBe("waiting approval");
    const r = flatten(enEO.resources);
    expect(r.get("types.HUMAN")).toBe("human");
    expect(r.get("types.EQUIPMENT")).toBe("equipment");
    expect(flatten(enEO.teams).get("memberRoleFallback")).toBe("member");
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// No teams/resources/workOrders fa value legitimately stays identical to
// English — every leaf carries real Persian. The allowlist is empty.
const FA_ENGLISH_ALLOW = new Set<string>([]);

const WO_STATUSES = [
  "OPEN", "ASSIGNED", "IN_PROGRESS", "WAITING_APPROVAL", "COMPLETED", "CANCELLED",
] as const;

describe("enterpriseOperations teams/resources/workOrders — Persian translation quality (Phase 86C4B2B1C-FA)", () => {
  const e = newLeaves(enEO);
  const f = newLeaves(faEO);

  it("covers all 32 new leaves (guards against vacuous passes)", () => {
    expect(e.size).toBe(32);
    expect(f.size).toBe(32);
  });

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

  it("aligns terminology with the committed ERP Persian glossary", () => {
    const faAll = flatten(faEO);
    expect(f.get("teams.pageTitle")).toBe(faAll.get("nav.items.teams"));            // تیم‌ها
    expect(f.get("resources.pageTitle")).toBe(faAll.get("nav.items.resources"));    // منابع
    expect(f.get("workOrders.pageTitle")).toBe(faAll.get("nav.items.workOrders"));  // سفارش‌های کاری
    expect(f.get("workOrders.dueDate")).toBe(faAll.get("tasks.dueDate"));           // تاریخ سررسید
    // in-progress work orders use the same term as the kanban column
    expect(f.get("workOrders.status.IN_PROGRESS")).toBe(faAll.get("tasks.columns.IN_PROGRESS"));
    // due badge mirrors the committed projects.due shape «سررسید {date}»
    expect(f.get("workOrders.due")).toBe("سررسید {date}");
    // waiting-approval status uses the committed approval stem (تأیید)
    expect(String(f.get("workOrders.status.WAITING_APPROVAL"))).toContain("تأیید");
    expect(f.get("teams.pageTitle")).toBe("تیم‌ها");
    expect(f.get("workOrders.pageTitle")).toBe("سفارش‌های کاری");
  });

  it("work-order status labels are all distinct (no two states collapse)", () => {
    const labels = WO_STATUSES.map((s) => f.get(`workOrders.status.${s}`));
    expect(new Set(labels).size).toBe(labels.length);
  });

  it("resource type labels are all distinct", () => {
    const labels = ["HUMAN", "EQUIPMENT", "SOFTWARE", "VEHICLE", "FACILITY", "TOOL"]
      .map((t) => f.get(`resources.types.${t}`));
    expect(new Set(labels).size).toBe(labels.length);
  });

  it("keeps ICU structure and Latin digits (no Persian digits)", () => {
    expect(String(f.get("teams.capacityValue"))).toContain("{value}");
    expect(String(f.get("workOrders.due"))).toContain("{date}");
    const persianDigits = [...f].filter(([, v]) => /[۰-۹]/.test(String(v))).map(([k]) => k);
    expect(persianDigits).toEqual([]);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// German-identical values that are legitimate German terms — "Teams" and
// "Team" are the standard German words. Everything else must differ from
// English. The allowlist is explicit, never derived from output.
const DE_ENGLISH_ALLOW = new Set<string>(["teams.pageTitle", "workOrders.team"]);

// Informal German second-person address is forbidden (enterprise formal "Sie").
const INFORMAL_ADDRESS =
  /\b(du|dein|deine|deiner|deinem|deinen|dich|dir|euch|euer|eure|eurem|euren|eurer)\b/i;

describe("enterpriseOperations teams/resources/workOrders — German translation quality (Phase 86C4B2B1C-DE)", () => {
  const e = newLeaves(enEO);
  const d = newLeaves(deEO);

  it("covers all 32 new leaves (guards against vacuous passes)", () => {
    expect(e.size).toBe(32);
    expect(d.size).toBe(32);
  });

  it("every de leaf outside the allowlist is translated (de !== en)", () => {
    const untranslated = [...e]
      .filter(([k]) => !DE_ENGLISH_ALLOW.has(k))
      .filter(([k, v]) => d.get(k) === v)
      .map(([k, v]) => `${k}=${JSON.stringify(v)}`);
    expect(untranslated).toEqual([]);
  });

  it("English-identical de values are exactly the 2-term allowlist", () => {
    const identical = [...e].filter(([k, v]) => d.get(k) === v).map(([k]) => k);
    expect(identical.sort()).toEqual([...DE_ENGLISH_ALLOW].sort());
  });

  it("uses no informal German address (enterprise formal Sie only)", () => {
    const informal = [...d].filter(([, v]) => INFORMAL_ADDRESS.test(String(v))).map(([k]) => k);
    expect(informal).toEqual([]);
  });

  it("carries genuine German (umlaut/ß present across the sub-objects)", () => {
    expect([...d.values()].some((v) => /[äöüßÄÖÜ]/.test(String(v)))).toBe(true);
  });

  it("aligns terminology with the committed ERP German glossary", () => {
    const deAll = flatten(deEO);
    expect(d.get("teams.pageTitle")).toBe(deAll.get("nav.items.teams"));            // Teams
    expect(d.get("resources.pageTitle")).toBe(deAll.get("nav.items.resources"));    // Ressourcen
    expect(d.get("workOrders.pageTitle")).toBe(deAll.get("nav.items.workOrders"));  // Arbeitsaufträge
    expect(d.get("workOrders.dueDate")).toBe(deAll.get("tasks.dueDate"));           // Fälligkeitsdatum
    // in-progress work orders use the same term as the kanban column
    expect(d.get("workOrders.status.IN_PROGRESS")).toBe(deAll.get("tasks.columns.IN_PROGRESS"));
    // due badge mirrors the committed projects.due shape "Fällig: {date}"
    expect(d.get("workOrders.due")).toBe("Fällig: {date}");
    // waiting-approval status uses the committed approval stem (Genehmigung)
    expect(String(d.get("workOrders.status.WAITING_APPROVAL"))).toContain("Genehmigung");
    expect(d.get("workOrders.pageTitle")).toBe("Arbeitsaufträge");
  });

  it("work-order status labels are all distinct (no two states collapse)", () => {
    const labels = WO_STATUSES.map((s) => d.get(`workOrders.status.${s}`));
    expect(new Set(labels).size).toBe(labels.length);
  });

  it("resource type labels are all distinct", () => {
    const labels = ["HUMAN", "EQUIPMENT", "SOFTWARE", "VEHICLE", "FACILITY", "TOOL"]
      .map((t) => d.get(`resources.types.${t}`));
    expect(new Set(labels).size).toBe(labels.length);
  });

  it("keeps ICU structure intact", () => {
    expect(String(d.get("teams.capacityValue"))).toContain("{value}");
    expect(String(d.get("workOrders.due"))).toContain("{date}");
  });
});

// ─────────────────────────────────────────────────────────────────────────────
describe("Teams/Resources/Work Orders source is fully catalog-backed via next-intl", () => {
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
      expect(src, `${rel} bilingual field pairs`).not.toMatch(/\b(label|title|description|name)(En|Fa)\b/);
    }
  });

  it("useLocale survives strictly for locale-prefixed href construction", () => {
    for (const rel of CLIENTS_WITH_LOCALE) {
      const src = read(rel);
      expect(src, `${rel} useLocale`).toMatch(/const locale = useLocale\(\)/);
      // every locale use is inside a `/${locale}/erp/...` href — no locale branching
      expect(src, `${rel} href pattern`).toMatch(/`\/\$\{locale\}\/erp/);
      expect(src, `${rel} no locale ternary`).not.toMatch(/locale\s*[=!]==?\s*"/);
    }
    // ResourceListClient renders no links: no useLocale at all
    expect(read(CLIENT_NO_LOCALE)).not.toMatch(/\buseLocale\b/);
  });

  it("no hardcoded Persian UI strings exist in any of the 10 files", () => {
    for (const rel of TEN) {
      expect(PERSIAN.test(read(rel)), `${rel} contains Persian`).toBe(false);
    }
  });

  // Former hardcoded UI strings that MUST be gone. Retained noIndexMetadata
  // labels ("Teams"/"Team"/"Resources"/"Work Orders"/"Work Order") are
  // deliberately NOT asserted absent — only body text is checked.
  const ABSENT: Record<string, string[]> = {
    "src/app/[locale]/erp/teams/page.tsx": [">Teams</h1>"],
    "src/app/[locale]/erp/resources/page.tsx": [">Resources</h1>"],
    "src/app/[locale]/erp/work-orders/page.tsx": [">Work Orders</h1>"],
    "src/components/erp/TeamListClient.tsx": [
      "Capacity: {team.capacity}", "No teams found.",
    ],
    "src/components/erp/TeamDetailClient.tsx": [
      ">Members</div>", ">Capacity</div>", ">Members</h3>",
      '?? "member"', "Back to Teams",
    ],
    "src/components/erp/ResourceListClient.tsx": [
      "r.type.toLowerCase()", '"Available"', '"In Use"', "No resources found.",
    ],
    "src/components/erp/WorkOrderListClient.tsx": [
      "Due {new Date", "wo.status.toLowerCase()", "No work orders found.",
    ],
    "src/components/erp/WorkOrderDetailClient.tsx": [
      "wo.status.toLowerCase()", ">Requires Approval<", 'label: "Due Date"',
      'label: "Team"', ">Activity Log<", ">Completion Note<", "Back to Work Orders",
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

  it("enum-derived display labels now come from the catalog (raw value as key)", () => {
    expect(read("src/components/erp/ResourceListClient.tsx")).toContain(
      "t(`resources.types.${r.type}`)",
    );
    expect(read("src/components/erp/WorkOrderListClient.tsx")).toContain(
      "t(`workOrders.status.${wo.status}`)",
    );
    expect(read("src/components/erp/WorkOrderDetailClient.tsx")).toContain(
      "t(`workOrders.status.${wo.status}`)",
    );
  });

  it("the delegating detail pages stay untouched (no getTranslations, still delegate)", () => {
    const teamPage = read("src/app/[locale]/erp/teams/[id]/page.tsx");
    expect(teamPage).toContain("<TeamDetailClient");
    expect(teamPage).toContain('noIndexMetadata("Team")');
    expect(teamPage).not.toMatch(/getTranslations/);
    const woPage = read("src/app/[locale]/erp/work-orders/[id]/page.tsx");
    expect(woPage).toContain("<WorkOrderDetailClient");
    expect(woPage).toContain('noIndexMetadata("Work Order")');
    expect(woPage).not.toMatch(/getTranslations/);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
describe("Teams/Resources/Work Orders behavior & raw values preserved", () => {
  it("raw resource type enum keys and CSS map lookups are unchanged", () => {
    const src = read("src/components/erp/ResourceListClient.tsx");
    expect(src).toMatch(/const TYPE_COLOR: Record<string, string> = \{/);
    for (const k of ["HUMAN", "EQUIPMENT", "SOFTWARE", "VEHICLE", "FACILITY", "TOOL"]) {
      expect(src, `TYPE_COLOR ${k}`).toContain(`${k}:`);
    }
    expect(src).toContain("TYPE_COLOR[r.type]");
  });

  it("raw resource availability boolean logic is unchanged (labels translated only)", () => {
    const src = read("src/components/erp/ResourceListClient.tsx");
    expect(src).toContain(
      'r.isAvailable ? "bg-green-500/15 text-green-400" : "bg-red-500/15 text-red-400"',
    );
    expect(src).toContain('r.isAvailable ? t("resources.available") : t("resources.inUse")');
  });

  it("raw work-order status enum keys and CSS map lookups are unchanged", () => {
    const src = read("src/components/erp/WorkOrderListClient.tsx");
    expect(src).toMatch(/const STATUS_COLOR: Record<string, string> = \{/);
    for (const k of ["OPEN", "ASSIGNED", "IN_PROGRESS", "WAITING_APPROVAL", "COMPLETED", "CANCELLED"]) {
      expect(src, `STATUS_COLOR ${k}`).toContain(`${k}:`);
    }
    expect(src).toContain("STATUS_COLOR[wo.status]");
  });

  it("raw work-order priority enum keys stay raw (dot map + untransformed display)", () => {
    const list = read("src/components/erp/WorkOrderListClient.tsx");
    expect(list).toMatch(/const PRIORITY_DOT: Record<string, string> = \{/);
    for (const k of ["LOW", "MEDIUM", "HIGH", "CRITICAL"]) {
      expect(list, `PRIORITY_DOT ${k}`).toContain(`${k}:`);
    }
    expect(list).toContain("PRIORITY_DOT[wo.priority]");
    // detail keeps the raw enum token rendered directly (Part B convention)
    expect(read("src/components/erp/WorkOrderDetailClient.tsx")).toContain("{wo.priority}");
  });

  it("team membership logic and member counting are unchanged", () => {
    const src = read("src/components/erp/TeamDetailClient.tsx");
    expect(src).toContain("{team.members?.length ?? 0}");
    expect(src).toContain("team.members && team.members.length > 0");
    expect(src).toContain("team.members.map((m, i)");
    // open-string role column: raw lowercased display retained, only the
    // null-fallback label moved to the catalog
    expect(src).toContain('m.role?.toLowerCase() ?? t("teams.memberRoleFallback")');
    expect(src).toContain("{m.userId}");
  });

  it("capacity display logic is unchanged (label translated only)", () => {
    expect(read("src/components/erp/TeamListClient.tsx")).toContain("team.capacity != null");
    expect(read("src/components/erp/TeamListClient.tsx")).toContain(
      't("teams.capacityValue", { value: team.capacity })',
    );
    expect(read("src/components/erp/TeamDetailClient.tsx")).toContain('{team.capacity ?? "—"}');
  });

  it("cost-rate currency/unit composition stays inline (currency + number + unit)", () => {
    expect(read("src/components/erp/ResourceListClient.tsx")).toContain("${r.costRate}/h");
  });

  it("data-access calls and searchParams filter pass-through are unchanged", () => {
    expect(read("src/app/[locale]/erp/teams/page.tsx")).toContain("getTeams()");
    expect(read("src/app/[locale]/erp/teams/[id]/page.tsx")).toContain("getTeamById(id)");
    expect(read("src/app/[locale]/erp/resources/page.tsx")).toContain("getResources(type)");
    expect(read("src/app/[locale]/erp/resources/page.tsx")).toContain("const { type } = await searchParams;");
    expect(read("src/app/[locale]/erp/work-orders/page.tsx")).toContain("getWorkOrders(status, projectId)");
    expect(read("src/app/[locale]/erp/work-orders/page.tsx")).toContain(
      "const { status, projectId } = await searchParams;",
    );
    expect(read("src/app/[locale]/erp/work-orders/[id]/page.tsx")).toContain("getWorkOrderById(id)");
  });

  it("no HTTP/API mutation surface exists or was introduced in the 10 files", () => {
    for (const rel of TEN) {
      const src = read(rel);
      expect(src, `${rel} fetch`).not.toMatch(/\bfetch\s*\(/);
      expect(src, `${rel} axios`).not.toMatch(/\baxios\b/);
      expect(src, `${rel} useMutation`).not.toMatch(/\buseMutation\b/);
      expect(src, `${rel} api route literal`).not.toContain("/api/");
    }
  });

  it("date formatting is locale-aware via the shared formatter (89B-FINAL)", () => {
    expect(read("src/components/erp/WorkOrderListClient.tsx")).toContain(
      "formatDate(wo.dueDate, locale)",
    );
    const detail = read("src/components/erp/WorkOrderDetailClient.tsx");
    expect(detail).toContain("formatDate(wo.dueDate, locale)");
    expect(detail).toContain("formatDate(a.createdAt, locale)");
  });

  it("persisted runtime content is still rendered as raw data", () => {
    expect(read("src/components/erp/TeamListClient.tsx")).toContain("{team.name}");
    expect(read("src/components/erp/TeamDetailClient.tsx")).toContain("{team.name}");
    expect(read("src/components/erp/TeamDetailClient.tsx")).toContain("{team.description}");
    expect(read("src/components/erp/ResourceListClient.tsx")).toContain("{r.name}");
    expect(read("src/components/erp/ResourceListClient.tsx")).toContain("{r.description}");
    expect(read("src/components/erp/WorkOrderListClient.tsx")).toContain("{wo.title}");
    const detail = read("src/components/erp/WorkOrderDetailClient.tsx");
    expect(detail).toContain("{wo.title}");
    expect(detail).toContain("{a.notes ?? a.action}");
    expect(detail).toContain("{wo.completionNote}");
    expect(detail).toContain('wo.teamId ?? "—"');
  });

  it("CSS text-transform classes on translated spots are unchanged (visual parity)", () => {
    // detail status badge keeps `capitalize` (renders "In Progress" as before)
    expect(read("src/components/erp/WorkOrderDetailClient.tsx")).toContain("rounded-full capitalize");
    // team-member role span keeps `capitalize` over the raw lowercased role
    expect(read("src/components/erp/TeamDetailClient.tsx")).toContain("text-muted-foreground capitalize");
  });

  it("noIndexMetadata static module labels remain (shared helper untouched)", () => {
    expect(read("src/app/[locale]/erp/teams/page.tsx")).toContain('noIndexMetadata("Teams")');
    expect(read("src/app/[locale]/erp/teams/[id]/page.tsx")).toContain('noIndexMetadata("Team")');
    expect(read("src/app/[locale]/erp/resources/page.tsx")).toContain('noIndexMetadata("Resources")');
    expect(read("src/app/[locale]/erp/work-orders/page.tsx")).toContain('noIndexMetadata("Work Orders")');
    expect(read("src/app/[locale]/erp/work-orders/[id]/page.tsx")).toContain('noIndexMetadata("Work Order")');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
describe("locale configuration unchanged", () => {
  it("ACTIVE_LOCALES is fa + en + de (87L.6 activation)", () => {
    expect([...ACTIVE_LOCALES]).toEqual(["fa", "en", "de"]);
    expect(isSupportedLocale("de")).toBe(true);
    expect(isActiveLocale("de")).toBe(true) // 87L.6: German ACTIVATED;
  });

  it("German is routable and in the switcher (87L.6)", () => {
    expect([...routing.locales]).toContain("de") // 87L.6: German ACTIVATED;
    const codes = activeLocaleOptions().map((o) => o.code);
    expect(codes).toEqual(["fa", "en", "de"]);
    expect(activeLocaleOptions().map((o) => o.nativeName)).toContain("Deutsch");
  });
  // The former "Part D Inventory/Approvals remain untouched" and "no
  // inventory/approvals sub-objects added" guards are retired: Part D is now
  // implemented and those positive assertions live in
  // enterprise-inventory-approvals-extraction.test.ts.
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
    expect(f.get("nav.items.teams")).toBe("تیم‌ها");
    expect(f.get("nav.items.resources")).toBe("منابع");
    expect(f.get("nav.items.workOrders")).toBe("سفارش‌های کاری");
    expect(d.get("nav.items.resources")).toBe("Ressourcen");
    expect(d.get("nav.items.workOrders")).toBe("Arbeitsaufträge");
  });

  it("ERP Projects & Tasks Persian & German translations remain intact", () => {
    const f = flatten(faEO), d = flatten(deEO);
    expect(f.get("projects.pageTitle")).toBe("پروژه‌ها");
    expect(f.get("tasks.pageTitle")).toBe("تابلوی وظایف");
    expect(f.get("tasks.columns.IN_PROGRESS")).toBe("در حال انجام");
    expect(d.get("projects.pageTitle")).toBe("Projekte");
    expect(d.get("tasks.pageTitle")).toBe("Aufgabenboard");
    expect(d.get("tasks.columns.DONE")).toBe("Erledigt");
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
    const self = read("src/i18n/__tests__/enterprise-teams-resources-work-orders-extraction.test.ts");
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
