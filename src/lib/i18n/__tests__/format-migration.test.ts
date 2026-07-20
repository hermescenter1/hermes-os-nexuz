import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { resolve, join } from "node:path";

/**
 * PHASE 89B-FINAL — formatter-migration regression sweep.
 *
 * Locks the migration in place at the source level: no implicit toLocale*
 * call, no binary fa/en formatting ternary, and no hardcoded Intl locale tag
 * may reappear in user-visible production code. Representative migrated
 * consumers (article, dashboard, academy) are asserted individually.
 * Behavioral coverage of the shared formatter itself lives in format.test.ts.
 */

const SRC = resolve(process.cwd(), "src");

function walk(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    if (entry === "node_modules" || entry === "__tests__") continue;
    const p = join(dir, entry);
    if (statSync(p).isDirectory()) walk(p, out);
    else if (/\.(ts|tsx)$/.test(entry) && !/\.test\./.test(entry)) out.push(p);
  }
  return out;
}

describe("89B-FINAL — repository-wide formatter hygiene", () => {
  const files = walk(SRC);

  it("no implicit or explicit toLocale* call remains in production code", () => {
    const offenders = files.filter((f) =>
      /\.toLocale(Date|Time)?String\(/.test(readFileSync(f, "utf8")),
    );
    expect(offenders).toEqual([]);
  });

  it("no binary fa/en Intl constructor tag remains outside the canonical modules", () => {
    const allowed = new Set([
      join(SRC, "lib", "i18n", "format.ts"),        // canonical mapping
      join(SRC, "lib", "billing", "currency.ts"),   // currency-driven domain policy
      join(SRC, "lib", "seo", "schemas.ts"),        // JSON-LD (Phase 89B.1)
    ]);
    const offenders = files.filter((f) => {
      if (allowed.has(f)) return false;
      const code = readFileSync(f, "utf8");
      return /Intl\.(NumberFormat|DateTimeFormat)\(\s*(isFa|["'](fa-IR|en-US|en-GB|en)["'])/.test(code);
    });
    expect(offenders).toEqual([]);
  });

  it("percent semantics stay fractional at the formatter boundary", async () => {
    const { formatPercent } = await import("../format");
    expect(formatPercent(0.5, "de")).toMatch(/^50\s?%$/);
  });
});

describe("89B-FINAL — representative migrated consumers", () => {
  const read = (rel: string) => readFileSync(resolve(process.cwd(), rel), "utf8");

  it("article surface (ArticleDetailClient) uses the shared formatter, no binary logic", () => {
    const src = read("src/components/articles/ArticleDetailClient.tsx");
    expect(src).toContain('from "@/lib/i18n/format"');
    expect(src).toContain("formatDate(");
    expect(src).not.toMatch(/isFa \? "fa-IR" : "en-US"/);
    expect(src).not.toContain("toLocaleDateString");
  });

  it("dashboard surface (multi-site) threads useLocale into formatDateTime", () => {
    const src = read("src/app/[locale]/dashboard/multi-site/page.tsx");
    expect(src).toContain("useLocale");
    expect(src).toMatch(/formatDateTime\([^)]+,\s*locale\)/);
  });

  it("academy surface (MyCertificatesClient) dropped the hardcoded en-GB tag", () => {
    const src = read("src/components/academy/MyCertificatesClient.tsx");
    expect(src).not.toContain('"en-GB"');
    expect(src).toMatch(/formatDate\([^)]+locale/);
  });

  it("operations time-only stamps preserve time semantics via explicit options", () => {
    const src = read("src/components/operations/WarRoomClient.tsx");
    expect(src).toMatch(/formatDate\([^)]+\{ timeStyle: "medium" \}\)/);
  });

  it("ATS interview times now genuinely match their UTC label", () => {
    const src = read("src/components/ats/InterviewPlannerClient.tsx");
    // formatter defaults to UTC — the rendered time next to the "UTC" suffix
    // is now actually UTC instead of the host timezone.
    expect(src).toMatch(/formatDate\(interview\.scheduledAt, locale, \{ hour: "2-digit", minute: "2-digit" \}\)\} UTC/);
  });
});

describe("89B-FINAL — migrated server-card behavior (knowledge)", () => {
  it("CaseCard renders a German-formatted date under a German request locale", async () => {
    const { vi } = await import("vitest");
    vi.doMock("next-intl/server", () => ({ getLocale: async () => "de" }));
    const { CaseCard } = await import("@/components/knowledge/CaseCard");
    const el = await CaseCard({
      engineeringCase: {
        id: "c1",
        title: "Pump failure",
        status: "RESOLVED",
        severity: "HIGH",
        updatedAt: "2026-12-31T10:00:00.000Z",
      } as never,
    });
    const flat = JSON.stringify(el);
    expect(flat).toContain("31.12.2026");
    expect(flat).not.toContain("12/31/2026");
    vi.doUnmock("next-intl/server");
  });
});
