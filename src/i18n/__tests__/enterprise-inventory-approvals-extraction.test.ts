/**
 * Phase 86C4B2B1D-PRE — ERP Inventory & Approvals: message-catalog extraction.
 *
 * Part D (final) of the four ERP extraction phases. The ERP Inventory / Approvals
 * surface
 *   Inventory: src/app/[locale]/erp/inventory/{page,[id]/page} +
 *              src/components/erp/{InventoryListClient,InventoryDetailClient}
 *   Approvals: src/app/[locale]/erp/approvals/page +
 *              src/components/erp/ApprovalListClient
 * had its user-facing text lifted out of hardcoded English and
 * `pathname.startsWith("/fa")` locale detection into two NEW sub-objects of the
 * existing `enterpriseOperations` next-intl namespace: `inventory` (18 leaves)
 * and `approvals` (9) — 27 new leaves, bringing the namespace to 144:
 *   - en = canonical English (exact former rendered text, including the
 *     lowercase enum-derived approval-status labels and the "Qty" abbreviation)
 *   - fa = professional Persian (Phase 86C4B2B1D-FA translated all 27 leaves;
 *     FA_ENGLISH_ALLOW = {inventory.columns.sku} — the "SKU" Latin acronym only)
 *   - de = professional German (Phase 86C4B2B1D-DE translated all 27 leaves;
 *     DE_ENGLISH_ALLOW = {inventory.columns.sku, .name, .status} — "SKU", "Name"
 *     and "Status" are standard German-identical terms). This completes the
 *     entire enterpriseOperations namespace (144 leaves) in German.
 * German stays INACTIVE (ACTIVE_LOCALES = ["fa","en"]).
 *
 * Retained locale/raw logic (allowlisted below):
 *   - useLocale in InventoryList/InventoryDetail clients — locale-prefixed `href`
 *     construction only (`/${locale}/erp/inventory...`)
 *   - ApprovalListClient renders no locale-prefixed links and uses no locale at
 *     all (its former `locale` was dead code and was removed)
 *   - toLocaleDateString — date formatting (inventory movements, approval dates)
 *   - raw `{m.type}` movement token (untransformed enum, mirrors the retained
 *     `{wo.priority}` convention) — NOT translated
 *   - raw `{item.category ?? "—"}` — inventory category is a free-text Prisma
 *     String column (persisted data), rendered directly
 *   - `$${item.unitCost}` — currency symbol + numeric composition
 *   - `"—"` / `"+"` symbol markers (not text)
 *   - raw IDs and persisted content: item.sku/name/location, apr.title/description
 *   - the approval decision mutation `fetch("/api/erp/approvals/{id}", PATCH)` —
 *     business behavior, preserved verbatim
 *   - noIndexMetadata("…") static module labels (shared helper left unchanged)
 *
 * NOTE: inventory/[id]/page.tsx delegates entirely to InventoryDetailClient and
 * carries no user-facing text, so it is intentionally left unmodified (same
 * convention as projects/[id], teams/[id] and work-orders/[id] in Parts B/C).
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

// ── the 6 approved source files ─────────────────────────────────────────────
const SERVER_PAGES_WITH_T = [
  "src/app/[locale]/erp/inventory/page.tsx",
  "src/app/[locale]/erp/approvals/page.tsx",
];
// Clients that build locale-prefixed links (useLocale + useTranslations).
const CLIENTS_WITH_LOCALE = [
  "src/components/erp/InventoryListClient.tsx",
  "src/components/erp/InventoryDetailClient.tsx",
];
// ApprovalListClient renders no locale-prefixed links — useTranslations only.
const CLIENT_NO_LOCALE = "src/components/erp/ApprovalListClient.tsx";
const CLIENTS = [...CLIENTS_WITH_LOCALE, CLIENT_NO_LOCALE];
// Delegates to its detail client; no user-facing text — intentionally untouched.
const DELEGATING_PAGE = "src/app/[locale]/erp/inventory/[id]/page.tsx";
const SIX = [...SERVER_PAGES_WITH_T, ...CLIENTS, DELEGATING_PAGE];
// Inventory files carry no HTTP mutation; the approval client legitimately does.
const INVENTORY_FILES = [
  "src/app/[locale]/erp/inventory/page.tsx",
  "src/components/erp/InventoryListClient.tsx",
  "src/components/erp/InventoryDetailClient.tsx",
];

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
    ...withPrefix(flatten(tree.inventory), "inventory"),
    ...withPrefix(flatten(tree.approvals), "approvals"),
  ]);

const APPROVAL_STATUSES = ["PENDING", "APPROVED", "REJECTED", "CANCELLED"] as const;

// ─────────────────────────────────────────────────────────────────────────────
describe("enterpriseOperations inventory/approvals — catalog structure & parity", () => {
  it("enterpriseOperations exists in en/fa/de", () => {
    expect(enEO).toBeTruthy();
    expect(faEO).toBeTruthy();
    expect(deEO).toBeTruthy();
  });

  it("top-level objects are exactly the eleven post-D sub-objects", () => {
    const expected = [
      "approvals", "dashboard", "inventory", "kpis", "nav", "projects",
      "resources", "settings", "tasks", "teams", "workOrders",
    ];
    expect(Object.keys(enEO).sort()).toEqual(expected);
    expect(Object.keys(faEO).sort()).toEqual(expected);
    expect(Object.keys(deEO).sort()).toEqual(expected);
  });

  it("inventory has exactly 18 leaves, approvals 9 (27 combined new)", () => {
    expect(flatten(enEO.inventory).size).toBe(18);
    expect(flatten(enEO.approvals).size).toBe(9);
    expect(newLeaves(enEO).size).toBe(27);
  });

  it("enterpriseOperations total is exactly 144 leaves (117 prior + 27 new)", () => {
    expect(flatten(enEO).size).toBe(144);
    // Prior sub-objects unchanged by this phase
    expect(flatten(enEO.nav).size).toBe(11);
    expect(flatten(enEO.dashboard).size).toBe(20);
    expect(flatten(enEO.kpis).size).toBe(14);
    expect(flatten(enEO.settings).size).toBe(5);
    expect(flatten(enEO.projects).size).toBe(21);
    expect(flatten(enEO.tasks).size).toBe(14);
    expect(flatten(enEO.teams).size).toBe(7);
    expect(flatten(enEO.resources).size).toBe(10);
    expect(flatten(enEO.workOrders).size).toBe(15);
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

  it("declares the intended ICU placeholder for the approval-step label", () => {
    expect(flatten(enEO.approvals).get("step")).toBe("Step {order}");
    expect(argNames(flatten(enEO.approvals).get("step"))).toBe("order");
  });

  it("inventory carries the expected sub-shape (columns / stock / metrics + labels)", () => {
    const inv = enEO.inventory as Tree;
    expect(Object.keys(inv.columns as Tree).sort()).toEqual(
      ["category", "name", "quantity", "reorder", "sku", "status"],
    );
    expect(Object.keys(inv.stock as Tree).sort()).toEqual(["inStock", "low", "ok"]);
    expect(Object.keys(inv.metrics as Tree).sort()).toEqual(
      ["quantity", "reorderAt", "reserved", "unitCost"],
    );
    for (const k of ["pageTitle", "location", "recentMovements", "backToInventory", "empty"]) {
      expect(Object.keys(inv), `inventory.${k}`).toContain(k);
    }
  });

  it("approval status labels are keyed by the raw ErpApprovalStatus enum", () => {
    expect(Object.keys((enEO.approvals as Tree).status as Tree).sort()).toEqual(
      [...APPROVAL_STATUSES].sort(),
    );
  });

  it("en labels preserve the exact former rendered text (lowercase enum-derived + Qty)", () => {
    const inv = flatten(enEO.inventory);
    expect(inv.get("columns.sku")).toBe("SKU");
    expect(inv.get("columns.quantity")).toBe("Qty");        // abbreviated header
    expect(inv.get("metrics.quantity")).toBe("Quantity");   // full metric label
    expect(inv.get("metrics.reorderAt")).toBe("Reorder At");
    expect(inv.get("stock.low")).toBe("Low Stock");
    expect(inv.get("stock.ok")).toBe("OK");
    expect(inv.get("stock.inStock")).toBe("In Stock");
    const apr = flatten(enEO.approvals);
    expect(apr.get("pageTitle")).toBe("Approval Requests");
    expect(apr.get("status.PENDING")).toBe("pending");
    expect(apr.get("status.APPROVED")).toBe("approved");
    expect(apr.get("status.REJECTED")).toBe("rejected");
    expect(apr.get("status.CANCELLED")).toBe("cancelled");
    expect(apr.get("approve")).toBe("Approve");
    expect(apr.get("reject")).toBe("Reject");
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Only the "SKU" column header legitimately stays identical to English (a Latin
// acronym with no useful Persian equivalent). Every other new leaf is translated.
// The allowlist is explicit, never derived from output.
const FA_ENGLISH_ALLOW = new Set<string>(["inventory.columns.sku"]);
const STOCK_KEYS = ["low", "ok", "inStock"] as const;

describe("inventory/approvals — Persian translation quality (Phase 86C4B2B1D-FA)", () => {
  const e = newLeaves(enEO);
  const f = newLeaves(faEO);
  const d = newLeaves(deEO);

  it("covers all 27 new leaves (guards against vacuous passes)", () => {
    expect(e.size).toBe(27);
    expect(f.size).toBe(27);
    expect(d.size).toBe(27);
  });

  it("every fa leaf outside the allowlist is translated (fa !== en)", () => {
    const untranslated = [...e]
      .filter(([k]) => !FA_ENGLISH_ALLOW.has(k))
      .filter(([k, v]) => f.get(k) === v)
      .map(([k, v]) => `${k}=${JSON.stringify(v)}`);
    expect(untranslated).toEqual([]);
  });

  it("English-identical fa values are exactly the allowlist (SKU only)", () => {
    const identical = [...e].filter(([k, v]) => f.get(k) === v).map(([k]) => k);
    expect(identical.sort()).toEqual([...FA_ENGLISH_ALLOW].sort());
  });

  it("every non-allowlisted fa leaf contains real Persian script", () => {
    const bad = [...f]
      .filter(([k]) => !FA_ENGLISH_ALLOW.has(k))
      .filter(([, v]) => !PERSIAN.test(String(v)))
      .map(([k]) => k);
    expect(bad).toEqual([]);
  });

  it("SKU stays Latin/unchanged (the sole allowlisted header)", () => {
    expect(f.get("inventory.columns.sku")).toBe("SKU");
  });

  it("uses no Arabic ي (U+064A) or ك (U+0643) — Persian ی/ک only", () => {
    expect([...f].filter(([, v]) => /ي/.test(String(v))).map(([k]) => k)).toEqual([]);
    expect([...f].filter(([, v]) => /ك/.test(String(v))).map(([k]) => k)).toEqual([]);
  });

  it("keeps the {order} ICU placeholder and Latin digits (no Persian digits)", () => {
    expect(f.get("approvals.step")).toBe("مرحله {order}");
    expect(String(f.get("approvals.step"))).toContain("{order}");
    const persianDigits = [...f].filter(([, v]) => /[۰-۹]/.test(String(v))).map(([k]) => k);
    expect(persianDigits).toEqual([]);
  });

  it("aligns Inventory terminology with the committed ERP Persian glossary", () => {
    const faAll = flatten(faEO);
    expect(f.get("inventory.pageTitle")).toBe(faAll.get("nav.items.inventory")); // موجودی
    expect(f.get("inventory.columns.category")).toBe("دسته‌بندی");
    expect(f.get("inventory.columns.quantity")).toBe("تعداد");
    expect(f.get("inventory.metrics.quantity")).toBe("تعداد");
    expect(f.get("inventory.metrics.reorderAt")).toBe("سطح سفارش مجدد");
    expect(f.get("inventory.metrics.unitCost")).toBe("هزینه واحد");
    expect(f.get("inventory.location")).toBe("محل");
    expect(f.get("inventory.recentMovements")).toBe("جابه‌جایی‌های اخیر");
    expect(f.get("inventory.backToInventory")).toBe("بازگشت به موجودی");
    expect(String(f.get("inventory.empty"))).toContain("قلم موجودی");
  });

  it("stock labels carry the required Persian terms and stay distinct", () => {
    expect(f.get("inventory.stock.low")).toBe("موجودی کم");
    expect(f.get("inventory.stock.inStock")).toBe("موجود");
    const labels = STOCK_KEYS.map((k) => f.get(`inventory.stock.${k}`));
    expect(new Set(labels).size).toBe(labels.length);
  });

  it("aligns Approval terminology and keeps the action labels concise", () => {
    const faAll = flatten(faEO);
    expect(faAll.get("nav.items.approvals")).toBe("تأییدها"); // committed glossary anchor
    expect(String(f.get("approvals.pageTitle"))).toContain("تأیید");
    expect(f.get("approvals.approve")).toBe("تأیید");
    expect(f.get("approvals.reject")).toBe("رد");
    expect(f.get("approvals.status.PENDING")).toBe("در انتظار");
    expect(f.get("approvals.status.APPROVED")).toBe("تأییدشده");
    expect(f.get("approvals.status.REJECTED")).toBe("ردشده");
    expect(f.get("approvals.status.CANCELLED")).toBe("لغوشده");
  });

  it("approval status labels are all distinct, and actions differ from states", () => {
    const labels = APPROVAL_STATUSES.map((s) => f.get(`approvals.status.${s}`));
    expect(new Set(labels).size).toBe(labels.length);
    expect(f.get("approvals.approve")).not.toBe(f.get("approvals.status.APPROVED"));
    expect(f.get("approvals.reject")).not.toBe(f.get("approvals.status.REJECTED"));
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// German-identical values that are legitimate standard German terms: "SKU" (a
// Latin acronym), "Name" and "Status" are spelled identically in German.
// Everything else must differ from English. The allowlist is explicit, never
// derived from output.
const DE_ENGLISH_ALLOW = new Set<string>([
  "inventory.columns.sku",
  "inventory.columns.name",
  "inventory.columns.status",
]);

// Informal German second-person address is forbidden (enterprise formal "Sie").
const INFORMAL_ADDRESS =
  /\b(du|dein|deine|deiner|deinem|deinen|dich|dir|euch|euer|eure|eurem|euren|eurer)\b/i;

describe("inventory/approvals — German translation quality (Phase 86C4B2B1D-DE)", () => {
  const e = newLeaves(enEO);
  const d = newLeaves(deEO);

  it("covers all 27 new leaves (guards against vacuous passes)", () => {
    expect(e.size).toBe(27);
    expect(d.size).toBe(27);
  });

  it("every de leaf outside the allowlist is translated (de !== en)", () => {
    const untranslated = [...e]
      .filter(([k]) => !DE_ENGLISH_ALLOW.has(k))
      .filter(([k, v]) => d.get(k) === v)
      .map(([k, v]) => `${k}=${JSON.stringify(v)}`);
    expect(untranslated).toEqual([]);
  });

  it("English-identical de values are exactly the 3-term allowlist (SKU/Name/Status)", () => {
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

  it("SKU stays Latin/unchanged (allowlisted header)", () => {
    expect(d.get("inventory.columns.sku")).toBe("SKU");
  });

  it("keeps the {order} ICU placeholder in the approval-step label", () => {
    expect(d.get("approvals.step")).toBe("Schritt {order}");
    expect(String(d.get("approvals.step"))).toContain("{order}");
  });

  it("aligns Inventory terminology with the committed ERP German glossary", () => {
    const deAll = flatten(deEO);
    expect(d.get("inventory.pageTitle")).toBe(deAll.get("nav.items.inventory")); // Bestand
    expect(d.get("inventory.columns.category")).toBe("Kategorie");
    expect(d.get("inventory.columns.quantity")).toBe("Menge");
    expect(d.get("inventory.metrics.quantity")).toBe("Menge");
    expect(d.get("inventory.metrics.reorderAt")).toBe("Meldebestand");
    expect(d.get("inventory.metrics.unitCost")).toBe("Stückkosten");
    expect(d.get("inventory.location")).toBe("Standort");
    expect(d.get("inventory.recentMovements")).toBe("Letzte Bestandsbewegungen");
    expect(d.get("inventory.backToInventory")).toBe("Zurück zum Bestand");
    expect(String(d.get("inventory.empty"))).toContain("Bestandsartikel");
  });

  it("stock labels carry the required German terms and stay distinct", () => {
    expect(d.get("inventory.stock.low")).toBe("Niedriger Bestand");
    expect(d.get("inventory.stock.ok")).toBe("Ausreichender Bestand");
    expect(d.get("inventory.stock.inStock")).toBe("Auf Lager");
    const labels = STOCK_KEYS.map((k) => d.get(`inventory.stock.${k}`));
    expect(new Set(labels).size).toBe(labels.length);
  });

  it("aligns Approval terminology and keeps the action labels concise", () => {
    const deAll = flatten(deEO);
    expect(deAll.get("nav.items.approvals")).toBe("Genehmigungen"); // committed glossary anchor
    expect(d.get("approvals.pageTitle")).toBe("Genehmigungsanträge");
    expect(d.get("approvals.approve")).toBe("Genehmigen");
    expect(d.get("approvals.reject")).toBe("Ablehnen");
    expect(d.get("approvals.status.PENDING")).toBe("Ausstehend");
    expect(d.get("approvals.status.APPROVED")).toBe("Genehmigt");
    expect(d.get("approvals.status.REJECTED")).toBe("Abgelehnt");
    expect(d.get("approvals.status.CANCELLED")).toBe("Abgebrochen");
  });

  it("approval status labels are all distinct, and actions differ from states", () => {
    const labels = APPROVAL_STATUSES.map((s) => d.get(`approvals.status.${s}`));
    expect(new Set(labels).size).toBe(labels.length);
    expect(d.get("approvals.approve")).not.toBe(d.get("approvals.status.APPROVED"));
    expect(d.get("approvals.reject")).not.toBe(d.get("approvals.status.REJECTED"));
  });
});

// ─────────────────────────────────────────────────────────────────────────────
describe("Inventory/Approvals source is fully catalog-backed via next-intl", () => {
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

  it("no pathname-based display-language selection remains in any of the 6 files", () => {
    for (const rel of SIX) {
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
      expect(src, `${rel} href pattern`).toMatch(/`\/\$\{locale\}\/erp\/inventory/);
      expect(src, `${rel} no locale ternary`).not.toMatch(/locale\s*[=!]==?\s*"/);
    }
    // ApprovalListClient renders no locale-prefixed links: no useLocale at all
    expect(read(CLIENT_NO_LOCALE)).not.toMatch(/\buseLocale\b/);
  });

  it("no hardcoded Persian UI strings exist in any of the 6 files", () => {
    for (const rel of SIX) {
      expect(PERSIAN.test(read(rel)), `${rel} contains Persian`).toBe(false);
    }
  });

  // Former hardcoded UI strings that MUST be gone. Retained noIndexMetadata
  // labels ("Inventory"/"Inventory Item"/"Approvals") are deliberately NOT
  // asserted absent — only body text is checked.
  const ABSENT: Record<string, string[]> = {
    "src/app/[locale]/erp/inventory/page.tsx": [">Inventory</h1>"],
    "src/app/[locale]/erp/approvals/page.tsx": [">Approval Requests</h1>"],
    "src/components/erp/InventoryListClient.tsx": [
      ">SKU</th>", ">Name</th>", ">Category</th>", ">Qty</th>", ">Reorder</th>",
      ">Status</th>", '"Low Stock" : "OK"', "No inventory items found.",
    ],
    "src/components/erp/InventoryDetailClient.tsx": [
      '"Low Stock" : "In Stock"', 'label: "Quantity"', 'label: "Reserved"',
      'label: "Reorder At"', 'label: "Unit Cost"', "Location:</span>",
      ">Recent Movements</h3>", "Back to Inventory",
    ],
    "src/components/erp/ApprovalListClient.tsx": [
      "apr.status.toLowerCase()", ">Approve</button>", ">Reject</button>",
      "Step {step.order}", "step.status.toLowerCase()", "No approval requests found.",
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

  it("enum-derived approval-status labels now come from the catalog (raw value as key)", () => {
    const src = read("src/components/erp/ApprovalListClient.tsx");
    expect(src).toContain("t(`approvals.status.${apr.status}`)");
    expect(src).toContain("t(`approvals.status.${step.status}`)");
    expect(src).toContain('t("approvals.step", { order: step.order })');
  });

  it("the delegating inventory detail page stays untouched (no getTranslations, still delegates)", () => {
    const page = read(DELEGATING_PAGE);
    expect(page).toContain("<InventoryDetailClient");
    expect(page).toContain('noIndexMetadata("Inventory Item")');
    expect(page).not.toMatch(/getTranslations/);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
describe("Inventory/Approvals behavior & raw values preserved", () => {
  it("raw approval status enum keys and CSS map lookups are unchanged", () => {
    const src = read("src/components/erp/ApprovalListClient.tsx");
    expect(src).toMatch(/const STATUS_COLOR: Record<string, string> = \{/);
    for (const k of APPROVAL_STATUSES) {
      expect(src, `STATUS_COLOR ${k}`).toContain(`${k}:`);
    }
    expect(src).toContain("STATUS_COLOR[apr.status]");
    // step decision comparisons stay on raw enum tokens
    expect(src).toContain('step.status === "APPROVED"');
    expect(src).toContain('step.status === "REJECTED"');
    expect(src).toContain('apr.status === "PENDING"');
  });

  it("the approval decision mutation is preserved verbatim (PATCH /api/erp/approvals)", () => {
    const src = read("src/components/erp/ApprovalListClient.tsx");
    expect(src).toContain("fetch(`/api/erp/approvals/${id}`");
    expect(src).toContain('method: "PATCH"');
    expect(src).toContain("JSON.stringify({ status })");
    expect(src).toContain('decide(apr.id, "APPROVED")');
    expect(src).toContain('decide(apr.id, "REJECTED")');
    // optimistic list update retained
    expect(src).toContain("useState(initial)");
  });

  it("raw inventory movement enum tokens stay raw (color map + untransformed display)", () => {
    // Phase 86C4B2B1D-HARDEN: MOVE_COLOR is now compile-time exhaustive over
    // the canonical ErpInventoryMovementType union (legacy ADJUST/SCRAP keys
    // removed) — see inventory-movement-enum-alignment.test.ts for the full
    // alignment contract.
    const src = read("src/components/erp/InventoryDetailClient.tsx");
    expect(src).toMatch(/const MOVE_COLOR = \{/);
    expect(src).toMatch(/\} satisfies Record<ErpInventoryMovementType, string>;/);
    for (const k of ["IN", "OUT", "TRANSFER", "ADJUSTMENT", "RESERVED", "RELEASED"]) {
      expect(src, `MOVE_COLOR ${k}`).toContain(`${k}:`);
    }
    expect(src).toContain("MOVE_COLOR[m.type]");
    expect(src).toContain("{m.type}"); // untransformed enum token rendered directly
  });

  it("inventory low-stock threshold logic is unchanged (label extracted only)", () => {
    const list = read("src/components/erp/InventoryListClient.tsx");
    expect(list).toContain("item.quantity <= item.reorderLevel");
    expect(list).toContain('low ? t("inventory.stock.low") : t("inventory.stock.ok")');
    const detail = read("src/components/erp/InventoryDetailClient.tsx");
    expect(detail).toContain("item.quantity <= item.reorderLevel");
    expect(detail).toContain('low ? t("inventory.stock.low") : t("inventory.stock.inStock")');
  });

  it("inventory cost/value composition stays inline (currency symbol + number)", () => {
    expect(read("src/components/erp/InventoryDetailClient.tsx")).toContain("`$${item.unitCost}`");
  });

  it("raw category is rendered directly (persisted free-text, em-dash fallback)", () => {
    expect(read("src/components/erp/InventoryListClient.tsx")).toContain('{item.category ?? "—"}');
  });

  it("persisted runtime content is still rendered as raw data", () => {
    const list = read("src/components/erp/InventoryListClient.tsx");
    expect(list).toContain("{item.sku}");
    expect(list).toContain("{item.name}");
    const detail = read("src/components/erp/InventoryDetailClient.tsx");
    expect(detail).toContain("{item.sku}");
    expect(detail).toContain("{item.name}");
    expect(detail).toContain("{item.location}");
    const apr = read("src/components/erp/ApprovalListClient.tsx");
    expect(apr).toContain("{apr.title}");
    expect(apr).toContain("{apr.description}");
  });

  it("date formatting is retained (toLocaleDateString, unchanged behavior)", () => {
    expect(read("src/components/erp/InventoryDetailClient.tsx")).toContain(
      "new Date(m.createdAt).toLocaleDateString()",
    );
    expect(read("src/components/erp/ApprovalListClient.tsx")).toContain(
      "new Date(apr.createdAt).toLocaleDateString()",
    );
  });

  it("inventory files introduce no HTTP mutation surface", () => {
    for (const rel of INVENTORY_FILES) {
      const src = read(rel);
      expect(src, `${rel} fetch`).not.toMatch(/\bfetch\s*\(/);
      expect(src, `${rel} axios`).not.toMatch(/\baxios\b/);
      expect(src, `${rel} useMutation`).not.toMatch(/\buseMutation\b/);
    }
  });

  it("data-access calls and searchParams filter pass-through are unchanged", () => {
    expect(read("src/app/[locale]/erp/inventory/page.tsx")).toContain("getInventory(category)");
    expect(read("src/app/[locale]/erp/inventory/page.tsx")).toContain("const { category } = await searchParams;");
    expect(read(DELEGATING_PAGE)).toContain("getInventoryById(id)");
    expect(read("src/app/[locale]/erp/approvals/page.tsx")).toContain("getApprovals(status)");
    expect(read("src/app/[locale]/erp/approvals/page.tsx")).toContain("const { status } = await searchParams;");
  });

  it("noIndexMetadata static module labels remain (shared helper untouched)", () => {
    expect(read("src/app/[locale]/erp/inventory/page.tsx")).toContain('noIndexMetadata("Inventory")');
    expect(read(DELEGATING_PAGE)).toContain('noIndexMetadata("Inventory Item")');
    expect(read("src/app/[locale]/erp/approvals/page.tsx")).toContain('noIndexMetadata("Approvals")');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
describe("locale configuration and prior work unchanged", () => {
  it("ACTIVE_LOCALES is still exactly fa + en; de supported but inactive", () => {
    expect([...ACTIVE_LOCALES]).toEqual(["fa", "en"]);
    expect(isSupportedLocale("de")).toBe(true);
    expect(isActiveLocale("de")).toBe(false);
  });

  it("German stays out of routing and the active locale switcher", () => {
    expect([...routing.locales]).not.toContain("de");
    const codes = activeLocaleOptions().map((o) => o.code);
    expect(codes).toEqual(["fa", "en"]);
    expect(activeLocaleOptions().map((o) => o.nativeName)).not.toContain("Deutsch");
  });

  it("prior namespace leaf counts unchanged (automation 188, asset 209, maintenance 233)", () => {
    expect(flatten((en as Tree).automationOperations).size).toBe(188);
    expect(flatten((en as Tree).assetOperations).size).toBe(209);
    expect(flatten((en as Tree).maintenanceOperations).size).toBe(233);
  });

  it("ERP Core / Projects / Tasks Persian & German translations remain intact", () => {
    const f = flatten(faEO), d = flatten(deEO);
    expect(f.get("nav.items.inventory")).toBe("موجودی");
    expect(f.get("nav.items.approvals")).toBe("تأییدها");
    expect(f.get("projects.pageTitle")).toBe("پروژه‌ها");
    expect(f.get("tasks.columns.IN_PROGRESS")).toBe("در حال انجام");
    expect(d.get("nav.items.inventory")).toBe("Bestand");
    expect(d.get("nav.items.approvals")).toBe("Genehmigungen");
    expect(d.get("projects.pageTitle")).toBe("Projekte");
    expect(d.get("tasks.pageTitle")).toBe("Aufgabenboard");
  });

  it("ERP Teams / Resources / Work Orders Persian & German translations remain intact", () => {
    const f = flatten(faEO), d = flatten(deEO);
    expect(f.get("teams.pageTitle")).toBe("تیم‌ها");
    expect(f.get("resources.types.HUMAN")).toBe("نیروی انسانی");
    expect(f.get("workOrders.status.WAITING_APPROVAL")).toBe("در انتظار تأیید");
    expect(d.get("resources.pageTitle")).toBe("Ressourcen");
    expect(d.get("workOrders.pageTitle")).toBe("Arbeitsaufträge");
    expect(d.get("workOrders.status.IN_PROGRESS")).toBe("In Bearbeitung");
  });

  it("Automation / Asset / CMMS / Industrial Brain / Admin / Journal translations remain intact", () => {
    expect(flatten((fa as Tree).automationOperations).get("nav.items.workflows")).toBe("گردش‌کارها");
    expect(flatten((de as Tree).automationOperations).get("executionDetail.title")).toBe("Ausführung");
    expect(flatten((de as Tree).assetOperations).get("nav.items.registry")).toBe("Anlagenregister");
    expect(flatten((de as Tree).maintenanceOperations).get("plans.heading")).toBe("Instandhaltungspläne");
    expect(flatten((de as Tree).industrialBrain).get("status.modules.neuralReasoningMap")).toBe("Neuronale Reasoning-Map");
    expect(flatten((de as Tree).adminGovernance).get("compliance.title")).toBe("Compliance-Dashboard");
    const faJournal = [...flatten((fa as Tree).journal).values()];
    expect(faJournal.some((v) => PERSIAN.test(String(v)))).toBe(true);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
describe("this test file is hygienic (no skipped/focused/swallowed assertions)", () => {
  // Needles are assembled at runtime so this file never literally contains the
  // forbidden tokens it forbids (avoids self-matching false positives).
  it("contains no skip / only / swallowed-catch constructs", () => {
    const self = read("src/i18n/__tests__/enterprise-inventory-approvals-extraction.test.ts");
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
