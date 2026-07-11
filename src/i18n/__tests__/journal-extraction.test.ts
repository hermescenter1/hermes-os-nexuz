/**
 * Phase 86C2-PRE — Journal message-catalog extraction.
 *
 * The Journal & publishing UI was migrated from inline fa/en ternaries to real
 * next-intl namespaces (journal, journalWriter, journalEditorial). These tests
 * lock in: three-way structural/placeholder parity, no empty Journal messages,
 * no remaining user-facing fa/en string ternaries in the Journal surface,
 * German staying inactive, and unchanged Journal RBAC.
 */
import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import en from "../../../messages/en.json";
import fa from "../../../messages/fa.json";
import de from "../../../messages/de.json";
import { ACTIVE_LOCALES, SUPPORTED_LOCALES, isActiveLocale } from "@/i18n/locales";
import { isProtectedPath, isAuthorizedForPath } from "@/lib/auth/rbac";

type Tree = Record<string, unknown>;
const JOURNAL_NAMESPACES = ["journal", "journalWriter", "journalEditorial"] as const;

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
// Extract ICU *argument names* (ignoring plural-branch structure, which
// legitimately differs by locale — e.g. fa has no "one" plural category).
function placeholders(value: unknown): string {
  const args = new Set<string>();
  for (const m of String(value).matchAll(/\{\s*([a-zA-Z_][a-zA-Z0-9_]*)/g)) args.add(m[1]);
  return [...args].sort().join("|");
}

const enPaths = leafPaths(en);
const faPaths = leafPaths(fa);
const dePaths = leafPaths(de);

describe("Journal namespaces exist and are three-way parity-complete", () => {
  it("adds journal, journalWriter, journalEditorial to all three catalogs", () => {
    for (const ns of JOURNAL_NAMESPACES) {
      expect(ns in en, `${ns} in en`).toBe(true);
      expect(ns in fa, `${ns} in fa`).toBe(true);
      expect(ns in de, `${ns} in de`).toBe(true);
    }
  });

  it("has identical key paths across en/fa/de (whole catalog)", () => {
    expect([...faPaths.keys()].sort()).toEqual([...enPaths.keys()].sort());
    expect([...dePaths.keys()].sort()).toEqual([...enPaths.keys()].sort());
  });

  it("preserves array/object shapes across locales for Journal namespaces", () => {
    for (const [path, shape] of enPaths) {
      if (!JOURNAL_NAMESPACES.some((ns) => path.startsWith(ns + ".") || path === ns)) continue;
      expect(faPaths.get(path), `fa shape ${path}`).toBe(shape);
      expect(dePaths.get(path), `de shape ${path}`).toBe(shape);
    }
  });
});

describe("Journal messages: quality", () => {
  const enFlat = flatten(en);
  const faFlat = flatten(fa);
  const deFlat = flatten(de);
  const journalKeys = [...enFlat.keys()].filter((k) =>
    JOURNAL_NAMESPACES.some((ns) => k.startsWith(ns + "."))
  );

  it("has no missing Journal keys in fa or de", () => {
    for (const k of journalKeys) {
      expect(faFlat.has(k), `fa missing ${k}`).toBe(true);
      expect(deFlat.has(k), `de missing ${k}`).toBe(true);
    }
  });

  it("has no empty Journal messages in any locale", () => {
    for (const k of journalKeys) {
      expect(enFlat.get(k), `en empty ${k}`).not.toBe("");
      expect(faFlat.get(k), `fa empty ${k}`).not.toBe("");
      expect(deFlat.get(k), `de empty ${k}`).not.toBe("");
    }
  });

  it("has matching ICU placeholder sets en↔fa and en↔de for Journal keys", () => {
    const enFaMismatch = journalKeys.filter((k) => placeholders(enFlat.get(k)) !== placeholders(faFlat.get(k)));
    const enDeMismatch = journalKeys.filter((k) => placeholders(enFlat.get(k)) !== placeholders(deFlat.get(k)));
    expect(enFaMismatch).toEqual([]);
    expect(enDeMismatch).toEqual([]);
  });

  it("de Journal values are temporary English copies (not yet translated)", () => {
    // Every de Journal value equals its en value verbatim in this phase.
    const translated = journalKeys.filter((k) => JSON.stringify(deFlat.get(k)) !== JSON.stringify(enFlat.get(k)));
    expect(translated).toEqual([]);
  });
});

// ── No remaining user-facing fa/en string ternaries in the Journal surface ────

const JOURNAL_DIRS = [
  join(process.cwd(), "src", "components", "articles"),
  join(process.cwd(), "src", "app", "[locale]", "articles"),
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

// A locale ternary where BOTH branches are string literals is only allowed when
// at least one branch is a CSS class / RTL-positioning token / locale-or-enum
// code / date-locale — i.e. NOT user-facing copy — OR it is the deliberately
// preserved article-writer language-selector label (explicit boundary).
const NON_UI = /rotate-180|font-body|fa-IR|en-US|flex-row-reverse|text-right|\bps-|\bpe-|\bstart-|\bend-|^(?:fa|en|FA|EN)$/;
const PROTECTED = new Set(['زبان مقاله|Language', 'Language|زبان مقاله']);
const TERNARY = /(?:isFa|locale\s*===\s*"fa")\s*\?\s*"([^"]*)"\s*:\s*"([^"]*)"/g;

describe("no user-facing fa/en string ternaries remain in the Journal surface", () => {
  const files = JOURNAL_DIRS.flatMap(walk);

  it("scans the whole Journal surface (30+ files)", () => {
    expect(files.length).toBeGreaterThanOrEqual(29);
  });

  it("flags only justified non-UI (CSS/locale/date) or the protected language label", () => {
    const violations: string[] = [];
    for (const file of files) {
      const src = readFileSync(file, "utf8");
      for (const m of src.matchAll(TERNARY)) {
        const [, a, b] = m;
        const ok = NON_UI.test(a) || NON_UI.test(b) || PROTECTED.has(`${a}|${b}`);
        if (!ok) violations.push(`${file.split("articles").pop()}: "${a}" : "${b}"`);
      }
    }
    expect(violations).toEqual([]);
  });

  it("keeps the article-writer language-selector label inline (protected boundary)", () => {
    const writer = readFileSync(
      join(process.cwd(), "src", "components", "articles", "ArticleWriterClient.tsx"),
      "utf8"
    );
    expect(writer).toContain('isFa ? "زبان مقاله" : "Language"');
  });
});

// ── German inactive + Journal RBAC unchanged ──────────────────────────────────

describe("German remains inactive after extraction", () => {
  it("ACTIVE_LOCALES is still exactly fa + en", () => {
    expect([...ACTIVE_LOCALES]).toEqual(["fa", "en"]);
  });
  it("de is supported but not active", () => {
    expect([...SUPPORTED_LOCALES]).toContain("de");
    expect(isActiveLocale("de")).toBe(false);
  });
});

describe("Journal RBAC behaviour is unchanged", () => {
  it("public article routes stay public", () => {
    expect(isProtectedPath("/fa/articles")).toBe(false);
    expect(isProtectedPath("/en/articles/discover")).toBe(false);
    expect(isProtectedPath("/fa/articles/editors-picks")).toBe(false);
  });
  it("authenticated + editorial routes stay protected", () => {
    expect(isProtectedPath("/fa/articles/write")).toBe(true);
    expect(isProtectedPath("/en/articles/drafts")).toBe(true);
    expect(isProtectedPath("/fa/articles/moderation")).toBe(true);
    expect(isProtectedPath("/en/articles/review-queue")).toBe(true);
  });
  it("editorial routes require admin", () => {
    expect(isAuthorizedForPath("engineer", "/fa/articles/moderation")).toBe(false);
    expect(isAuthorizedForPath("admin", "/fa/articles/moderation")).toBe(true);
  });
});
