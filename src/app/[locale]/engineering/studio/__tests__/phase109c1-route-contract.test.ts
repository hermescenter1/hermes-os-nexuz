/**
 * PHASE 109-C1 Round 1.1 — the route's metadata and generation contract.
 *
 * Two Round 1 defects are pinned here so neither can come back quietly:
 * a hard-coded English page title, and a `force-dynamic` declaration the
 * production build did not honour while the report repeated it as fact.
 */

import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it, vi } from "vitest";

import en from "../../../../../../messages/en.json";
import de from "../../../../../../messages/de.json";
import fa from "../../../../../../messages/fa.json";

const PAGE = join(__dirname, "..", "page.tsx");
const SOURCE = readFileSync(PAGE, "utf8");

/**
 * Code with comments removed.
 *
 * The page's own documentation quotes the declaration it no longer makes, so a
 * scan over the raw text would flag the explanation as the defect it describes.
 */
const CODE = SOURCE.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/[^\n]*/g, "$1");

vi.mock("next-intl/server", async () => {
  const actual = await vi.importActual<typeof import("next-intl")>("next-intl");
  const catalogues = { en, de, fa } as const;
  return {
    setRequestLocale: () => undefined,
    getTranslations: async ({ locale, namespace }: { locale: keyof typeof catalogues; namespace: string }) =>
      actual.createTranslator({
        locale,
        messages: catalogues[locale],
        namespace: namespace as never,
      }),
  };
});

describe("109-C1 · route metadata is localised", () => {
  it.each(["en", "de", "fa"] as const)("%s title comes from the catalogue", async (locale) => {
    const { generateMetadata } = await import("../page");
    const meta = await generateMetadata({ params: Promise.resolve({ locale }) });
    const expected = { en, de, fa }[locale].automationStudio.metaTitle;
    expect(meta.title).toBe(`${expected} · Hermes OS`);
  });

  it("the three titles differ — a shared English string would not", async () => {
    const { generateMetadata } = await import("../page");
    const titles = await Promise.all(
      (["en", "de", "fa"] as const).map(async (locale) =>
        (await generateMetadata({ params: Promise.resolve({ locale }) })).title,
      ),
    );
    expect(new Set(titles).size).toBe(3);
  });

  it("keeps the route out of any index", async () => {
    const { generateMetadata } = await import("../page");
    const meta = await generateMetadata({ params: Promise.resolve({ locale: "en" }) });
    expect(meta.robots).toEqual({ index: false, follow: false });
  });

  it("declares no hard-coded metadata beside generateMetadata", () => {
    // A `export const metadata = { title: "..." }` would silently win over the
    // localised function for some fields, and would be English-only.
    expect(CODE).not.toMatch(/export\s+const\s+metadata\s*=/);
    expect(SOURCE).toContain("export async function generateMetadata");
    expect(SOURCE).not.toContain('title: "Automation Engineering Studio · Hermes OS"');
  });
});

describe("109-C1 · route generation contract", () => {
  it("declares no route-segment override the build does not honour", () => {
    // Round 1 exported `dynamic = "force-dynamic"` and the build still emitted
    // ● (prerendered), so the declaration asserted something untrue. The page
    // is a pure function of committed constants, so static generation is the
    // honest contract; if that ever stops being true, this test is the place
    // the change has to be argued.
    expect(CODE).not.toMatch(/export\s+const\s+dynamic\s*=/);
    expect(CODE).not.toMatch(/export\s+const\s+revalidate\s*=/);
    expect(CODE).not.toMatch(/export\s+const\s+fetchCache\s*=/);
  });

  it("reads nothing request-specific, which is what makes prerendering safe", () => {
    for (const forbidden of ["cookies(", "headers(", "searchParams", "draftMode("]) {
      expect(CODE, forbidden).not.toContain(forbidden);
    }
  });

  it("documents where authorization actually happens", () => {
    // The security property is that middleware runs on every request even for a
    // prerendered response. A future reader must not have to rediscover that.
    expect(SOURCE).toContain("middleware");
    expect(SOURCE).toContain("PROTECTED_PATHS");
  });

  it("resolves its data on the server from the local adapter", () => {
    expect(SOURCE).toContain("resolveWorkspaceSource()");
    expect(CODE).not.toContain("use client");
  });
});
