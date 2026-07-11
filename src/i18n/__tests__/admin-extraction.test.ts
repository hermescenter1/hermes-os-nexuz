/**
 * Phase 86C3-PRE — Admin Control Center message-catalog extraction.
 *
 * The Admin/Governance surfaces (admin console + control-center registry,
 * leads, customers, vendors, SEO/analytics dashboards, compliance dashboard,
 * privacy center, data-request, cookie consent, academy admin) were migrated
 * from inline fa/en logic and hardcoded English to the adminOperations /
 * adminGovernance namespaces. These tests lock in structural parity, catalog
 * completeness for the navigation registry, the absence of user-facing locale
 * ternaries in the admin scope, and unchanged admin RBAC behaviour.
 */
import { describe, it, expect } from "vitest";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import en from "../../../messages/en.json";
import fa from "../../../messages/fa.json";
import de from "../../../messages/de.json";
import { ACTIVE_LOCALES, SUPPORTED_LOCALES, isActiveLocale } from "@/i18n/locales";
import { isProtectedPath, isAuthorizedForPath } from "@/lib/auth/rbac";
import { CONTROL_CENTER } from "@/lib/navigation/control-center";
import type { Role } from "@/lib/auth/roles";

type Tree = Record<string, unknown>;
const ADMIN_NAMESPACES = ["adminOperations", "adminGovernance"] as const;

function leafPaths(node: unknown, prefix = ""): Map<string, string> {
  const out = new Map<string, string>();
  if (node !== null && typeof node === "object") {
    const tag = Array.isArray(node) ? "array" : "object";
    if (prefix) out.set(prefix + "//shape", tag);
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
function placeholders(value: unknown): string {
  const args = new Set<string>();
  for (const m of String(value).matchAll(/\{\s*([a-zA-Z_][a-zA-Z0-9_]*)/g)) args.add(m[1]);
  return [...args].sort().join("|");
}
function bracesBalanced(value: unknown): boolean {
  let depth = 0;
  for (const ch of String(value)) {
    if (ch === "{") depth++;
    if (ch === "}") depth--;
    if (depth < 0) return false;
  }
  return depth === 0;
}

const enPaths = leafPaths(en);
const faPaths = leafPaths(fa);
const dePaths = leafPaths(de);
const enFlat = flatten(en);
const faFlat = flatten(fa);
const deFlat = flatten(de);
const adminKeys = [...enFlat.keys()].filter((k) =>
  ADMIN_NAMESPACES.some((ns) => k.startsWith(ns + "."))
);

describe("admin namespaces — structural parity", () => {
  it("adds adminOperations and adminGovernance to all three catalogs", () => {
    for (const ns of ADMIN_NAMESPACES) {
      expect(ns in en, `${ns} in en`).toBe(true);
      expect(ns in fa, `${ns} in fa`).toBe(true);
      expect(ns in de, `${ns} in de`).toBe(true);
    }
  });

  it("has identical key paths and shapes across en/fa/de (whole catalog)", () => {
    expect([...faPaths.keys()].sort()).toEqual([...enPaths.keys()].sort());
    expect([...dePaths.keys()].sort()).toEqual([...enPaths.keys()].sort());
    for (const [path, shape] of enPaths) {
      expect(faPaths.get(path), `fa shape ${path}`).toBe(shape);
      expect(dePaths.get(path), `de shape ${path}`).toBe(shape);
    }
  });

  it("covers the expected admin key count", () => {
    expect(adminKeys.length).toBe(259);
  });
});

describe("admin namespaces — value quality", () => {
  it("has no empty admin messages in any locale", () => {
    for (const k of adminKeys) {
      expect(enFlat.get(k), `en empty ${k}`).not.toBe("");
      expect(faFlat.get(k), `fa empty ${k}`).not.toBe("");
      expect(deFlat.get(k), `de empty ${k}`).not.toBe("");
    }
  });

  it("has matching ICU placeholder argument sets en↔fa and en↔de", () => {
    const faMismatch = adminKeys.filter((k) => placeholders(enFlat.get(k)) !== placeholders(faFlat.get(k)));
    const deMismatch = adminKeys.filter((k) => placeholders(enFlat.get(k)) !== placeholders(deFlat.get(k)));
    expect(faMismatch).toEqual([]);
    expect(deMismatch).toEqual([]);
  });

  it("has no malformed ICU strings (unbalanced braces)", () => {
    const bad = adminKeys.filter((k) => !bracesBalanced(deFlat.get(k)) || !bracesBalanced(faFlat.get(k)));
    expect(bad).toEqual([]);
  });

  it("de admin values are temporary English copies (not yet translated)", () => {
    const diverged = adminKeys.filter((k) => JSON.stringify(deFlat.get(k)) !== JSON.stringify(enFlat.get(k)));
    expect(diverged).toEqual([]);
  });

  it("fa carries the moved Persian for control-center and leads (real prior fa/en surfaces)", () => {
    // These surfaces had genuine Persian before extraction — it must survive.
    expect(faFlat.get("adminOperations.controlCenter.groups.administration")).toBe("مدیریت پلتفرم");
    expect(faFlat.get("adminOperations.controlCenter.items.adminConsole")).toBe("کنسول مدیریت");
    expect(faFlat.get("adminOperations.leads.title")).toBe("درخواست‌های دمو و دسترسی");
    expect(faFlat.get("adminOperations.leads.useCase")).toBe("توضیح کاربرد");
  });

  it("fa keeps English verbatim for previously English-only admin surfaces (behavior preserved)", () => {
    // These surfaces were hardcoded English for BOTH locales before extraction;
    // fa keeps the English text verbatim so fa users see exactly what they saw.
    expect(faFlat.get("adminOperations.customers.title")).toBe(enFlat.get("adminOperations.customers.title"));
    expect(faFlat.get("adminGovernance.compliance.title")).toBe(enFlat.get("adminGovernance.compliance.title"));
    expect(faFlat.get("adminGovernance.cookieConsent.title")).toBe(enFlat.get("adminGovernance.cookieConsent.title"));
    expect(faFlat.get("adminGovernance.academyAdmin.courseManagement")).toBe(enFlat.get("adminGovernance.academyAdmin.courseManagement"));
  });
});

// ── Control-center registry ↔ catalog completeness ───────────────────────────

describe("control-center registry labels resolve from the catalog", () => {
  const groups = (en as Tree & { adminOperations: { controlCenter: { groups: Record<string, string>; items: Record<string, string> } } })
    .adminOperations.controlCenter;

  it("every registry group key has a catalog label in en/fa/de", () => {
    for (const g of CONTROL_CENTER) {
      expect(enFlat.get(`adminOperations.controlCenter.groups.${g.key}`), `en group ${g.key}`).toBeTruthy();
      expect(faFlat.get(`adminOperations.controlCenter.groups.${g.key}`), `fa group ${g.key}`).toBeTruthy();
      expect(deFlat.get(`adminOperations.controlCenter.groups.${g.key}`), `de group ${g.key}`).toBeTruthy();
    }
  });

  it("every registry item key has a catalog label in en/fa/de", () => {
    for (const g of CONTROL_CENTER) {
      for (const item of g.items) {
        expect(enFlat.get(`adminOperations.controlCenter.items.${item.key}`), `en item ${item.key}`).toBeTruthy();
        expect(faFlat.get(`adminOperations.controlCenter.items.${item.key}`), `fa item ${item.key}`).toBeTruthy();
        expect(deFlat.get(`adminOperations.controlCenter.items.${item.key}`), `de item ${item.key}`).toBeTruthy();
      }
    }
  });

  it("has no orphan catalog labels without a registry entry", () => {
    const registryItemKeys = new Set(CONTROL_CENTER.flatMap((g) => g.items.map((i) => i.key)));
    for (const key of Object.keys(groups.items)) {
      expect(registryItemKeys.has(key), `catalog item ${key} has no registry entry`).toBe(true);
    }
    const registryGroupKeys = new Set(CONTROL_CENTER.map((g) => g.key));
    for (const key of Object.keys(groups.groups)) {
      expect(registryGroupKeys.has(key), `catalog group ${key} has no registry entry`).toBe(true);
    }
  });
});

// ── No remaining user-facing fa/en ternaries in the admin scope ───────────────

const ADMIN_DIRS = [
  join(process.cwd(), "src", "app", "[locale]", "admin"),
  join(process.cwd(), "src", "app", "[locale]", "compliance"),
  join(process.cwd(), "src", "app", "[locale]", "privacy-center"),
  join(process.cwd(), "src", "app", "[locale]", "academy", "admin"),
  join(process.cwd(), "src", "components", "admin"),
  join(process.cwd(), "src", "components", "compliance"),
];
const ADMIN_FILES = [
  join(process.cwd(), "src", "components", "academy", "AcademyAdminClient.tsx"),
  join(process.cwd(), "src", "lib", "navigation", "control-center.ts"),
];

function walk(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) out.push(...walk(full));
    else if (entry.name.endsWith(".tsx") || entry.name.endsWith(".ts")) out.push(full);
  }
  return out;
}

describe("no user-facing fa/en locale conditionals remain in the admin scope", () => {
  const files = [...ADMIN_DIRS.flatMap(walk), ...ADMIN_FILES];

  it("scans the full admin/governance surface", () => {
    expect(files.length).toBeGreaterThanOrEqual(25);
  });

  it("finds zero isFa/locale string ternaries and zero labelEn/labelFa pairs (empty allowlist)", () => {
    // Legitimate non-ternary locale uses remain (Intl.NumberFormat(locale),
    // Intl.DateTimeFormat(locale)) — those are formatting, not display text.
    const TERNARY = /(?:isFa|locale\s*===\s*"fa")\s*\?\s*"/;
    const LABEL_PAIR = /labelEn|labelFa/;
    const violations: string[] = [];
    for (const file of files) {
      const src = readFileSync(file, "utf8");
      if (TERNARY.test(src)) violations.push(`${file}: locale string ternary`);
      if (LABEL_PAIR.test(src)) violations.push(`${file}: labelEn/labelFa pair`);
    }
    expect(violations).toEqual([]);
  });
});

// ── Discipline: no focused/skipped tests in the admin i18n suites ─────────────

describe("test hygiene", () => {
  it("contains no test.only/test.skip/describe.only/describe.skip in admin i18n tests", () => {
    const testFiles = [
      join(process.cwd(), "src", "i18n", "__tests__", "admin-extraction.test.ts"),
      join(process.cwd(), "src", "lib", "navigation", "__tests__", "control-center.test.ts"),
    ];
    for (const f of testFiles) {
      const src = readFileSync(f, "utf8");
      expect(/\b(?:it|test|describe)\.(?:only|skip)\(/.test(src), `${f} has only/skip`).toBe(false);
    }
  });
});

// ── German inactive + admin RBAC unchanged ────────────────────────────────────

describe("German remains inactive after extraction", () => {
  it("ACTIVE_LOCALES is still exactly fa + en; de supported but inactive", () => {
    expect([...ACTIVE_LOCALES]).toEqual(["fa", "en"]);
    expect([...SUPPORTED_LOCALES]).toContain("de");
    expect(isActiveLocale("de")).toBe(false);
  });
});

describe("admin RBAC behaviour is unchanged", () => {
  const NON_ADMIN: Role[] = ["engineer", "customer", "vendor", "viewer", "candidate"];

  it("admin routes remain protected in both locales", () => {
    for (const href of ["/admin", "/admin/leads", "/admin/customers", "/admin/vendors", "/compliance", "/academy/admin", "/privacy-center"]) {
      expect(isProtectedPath(`/en${href}`), `en${href}`).toBe(true);
      expect(isProtectedPath(`/fa${href}`), `fa${href}`).toBe(true);
    }
  });

  it("admin/superadmin remain authorized; non-admin roles remain denied", () => {
    for (const href of ["/admin", "/admin/leads", "/compliance", "/academy/admin"]) {
      expect(isAuthorizedForPath("admin", `/en${href}`)).toBe(true);
      expect(isAuthorizedForPath("superadmin", `/en${href}`)).toBe(true);
      for (const role of NON_ADMIN) {
        expect(isAuthorizedForPath(role, `/en${href}`), `${role} ${href}`).toBe(false);
      }
    }
  });

  it("privacy-center stays open to any authenticated role", () => {
    for (const role of ["admin", "engineer", "customer", "vendor", "viewer", "candidate"] as Role[]) {
      expect(isAuthorizedForPath(role, "/en/privacy-center")).toBe(true);
    }
  });
});
