import type { ReactNode } from "react";
import { describe, it, expect, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { createTranslator } from "next-intl";
import en from "../../../../../messages/en.json";
import fa from "../../../../../messages/fa.json";
import de from "../../../../../messages/de.json";
import { ACTIVE_LOCALES } from "@/i18n/locales";

/**
 * SPRINT 1C-A - the Academy public header is localized and carries no internal
 * milestone.
 *
 * THE DEFECT THIS PINS SHUT
 * -------------------------
 * `academy/layout.tsx` rendered three hard-coded English literals into every
 * locale. Measured against production on 2026-09-28, `/fa/academy` served:
 *
 *     <p class="eyebrow-label">HERMES OS - TRAINING ACADEMY - PHASE 60</p>
 *     <h1>Hermes Training Academy</h1>
 *     Enterprise learning - Industrial certification - ...
 *
 * The only `<h1>` on a Persian public page was English, the lede was English on
 * /fa and /de, and the internal milestone "PHASE 60" was published to the open
 * web on three indexed URLs.
 *
 * WHAT THIS FILE PROVES
 * ---------------------
 * The REAL layout is rendered for every active locale against the SHIPPED
 * catalogs - the same files `src/i18n/request.ts` loads at runtime - so a key
 * the component reads and the catalog does not carry fails here.
 */

const MESSAGES: Record<string, Record<string, unknown>> = {
  en: en as unknown as Record<string, unknown>,
  fa: fa as unknown as Record<string, unknown>,
  de: de as unknown as Record<string, unknown>,
};

vi.mock("next-intl/server", () => ({
  setRequestLocale: () => {},
  getTranslations: async ({ locale, namespace }: { locale?: string; namespace?: string } = {}) =>
    createTranslator({
      locale: locale ?? "en",
      messages: MESSAGES[locale ?? "en"] as never,
      namespace: (namespace ?? "academy") as never,
    }),
}));

// Chrome and auth are out of scope; the header block is what this asserts.
vi.mock("@/components/public-site", () => ({
  PublicPageShell: ({ children }: { children?: ReactNode }) => <div>{children}</div>,
}));
vi.mock("@/components/academy/AcademySubNav", () => ({
  AcademySubNav: () => <nav data-testid="subnav" />,
}));
vi.mock("@/lib/auth/session", () => ({ getCurrentUser: async () => null }));

type LayoutFn = (a: {
  children: ReactNode;
  params: Promise<{ locale: string }>;
}) => Promise<React.ReactElement>;

async function renderLayout(locale: string): Promise<string> {
  const mod = await import("../layout");
  const Layout = mod.default as unknown as LayoutFn;
  const el = await Layout({ children: <main data-testid="page" />, params: Promise.resolve({ locale }) });
  return renderToStaticMarkup(el);
}

/** The header leaves, as the catalogs ship them. */
function header(locale: string): { eyebrow: string; title: string; lede: string } {
  const ns = (MESSAGES[locale] as { academy?: { header?: Record<string, string> } }).academy;
  if (!ns?.header) throw new Error(`messages/${locale}.json has no academy.header`);
  return ns.header as { eyebrow: string; title: string; lede: string };
}

const LEAVES = ["eyebrow", "title", "lede"] as const;

describe("11 - the Academy header renders localized copy for fa, en and de", () => {
  it.each([...ACTIVE_LOCALES])("%s renders its own eyebrow, h1 and lede", async (locale) => {
    const markup = await renderLayout(locale);
    const h = header(locale);
    expect(markup).toContain(h.eyebrow);
    expect(markup).toContain(h.title);
    expect(markup).toContain(h.lede);
  });

  it.each([...ACTIVE_LOCALES])("%s puts the localized title in the only h1", async (locale) => {
    const markup = await renderLayout(locale);
    const h1s = [...markup.matchAll(/<h1[^>]*>([\s\S]*?)<\/h1>/g)].map((m) => m[1]);
    expect(h1s).toHaveLength(1);
    expect(h1s[0]).toBe(header(locale).title);
  });

  it("the Persian page no longer renders the English heading", async () => {
    const markup = await renderLayout("fa");
    expect(markup).not.toContain("Hermes Training Academy");
    expect(markup).not.toContain("Enterprise learning");
    // ...and does render Persian script.
    expect(markup).toMatch(/[؀-ۿ]/);
  });

  it("the German page renders German, not the English lede", async () => {
    const markup = await renderLayout("de");
    expect(markup).not.toContain("Enterprise learning");
    expect(markup).toContain("Unternehmensweites Lernen");
  });

  it("no locale renders a raw message key or a missing-message marker", async () => {
    for (const locale of ACTIVE_LOCALES) {
      const markup = await renderLayout(locale);
      expect(markup, locale).not.toContain("academy.header");
      expect(markup, locale).not.toContain("MISSING_MESSAGE");
    }
  });
});

describe("12 - the internal milestone is gone from public output", () => {
  it.each([...ACTIVE_LOCALES])("%s publishes no PHASE number", async (locale) => {
    const markup = await renderLayout(locale);
    expect(markup).not.toContain("PHASE 60");
    expect(markup).not.toMatch(/PHASE\s*\d+/i);
  });

  it("no shipped catalog carries a phase number in the academy namespace", () => {
    for (const locale of ACTIVE_LOCALES) {
      for (const leaf of LEAVES) {
        expect(header(locale)[leaf], `${locale}.${leaf}`).not.toMatch(/PHASE\s*\d+/i);
      }
    }
  });
});

describe("13 - locale parity, ICU parity and translation governance hold", () => {
  it("every active locale carries exactly the same academy leaves", () => {
    const shape = (locale: string) => Object.keys(header(locale)).sort();
    const reference = shape("en");
    expect(reference).toEqual([...LEAVES].sort());
    for (const locale of ACTIVE_LOCALES) {
      expect(shape(locale), locale).toEqual(reference);
    }
  });

  it("no leaf is empty, and none is an untranslated English placeholder", () => {
    for (const locale of ACTIVE_LOCALES) {
      for (const leaf of LEAVES) {
        const value = header(locale)[leaf];
        expect(value.trim().length, `${locale}.${leaf}`).toBeGreaterThan(0);
        if (locale !== "en") {
          // Zero English carryover: this is the invariant `de-catalog.test.ts`
          // enforces catalog-wide for every namespace in TRANSLATED_NS, which
          // now includes `academy`.
          expect(value, `${locale}.${leaf}`).not.toBe(header("en")[leaf]);
        }
      }
    }
  });

  it("ICU argument sets are identical across locales", () => {
    const args = (v: string) =>
      [...v.matchAll(/\{\s*([a-zA-Z0-9_]+)/g)].map((m) => m[1]).sort().join("|");
    for (const leaf of LEAVES) {
      const reference = args(header("en")[leaf]);
      for (const locale of ACTIVE_LOCALES) {
        expect(args(header(locale)[leaf]), `${locale}.${leaf}`).toBe(reference);
      }
    }
  });

  it("the Persian copy uses Persian letter forms, not their Arabic look-alikes", () => {
    // Repository rule: Persian `ی` (U+06CC) and `ک` (U+06A9), never the Arabic
    // `ي` (U+064A) or `ك` (U+0643).
    for (const leaf of LEAVES) {
      const value = header("fa")[leaf];
      expect(value, `fa.${leaf} must not use Arabic yeh`).not.toMatch(/ي/);
      expect(value, `fa.${leaf} must not use Arabic kaf`).not.toMatch(/ك/);
    }
  });

  it("the namespace is registered with the German translation gate", async () => {
    // `academy` is a NEW top-level namespace. `de-catalog.test.ts` holds every
    // namespace outside BATCH_86C1 to a zero-English-carryover ceiling via
    // TRANSLATED_NS; a namespace added to the catalogs but not to that list
    // would silently escape the gate.
    const { readFileSync } = await import("node:fs");
    const { join } = await import("node:path");
    const gate = readFileSync(
      join(__dirname, "..", "..", "..", "..", "i18n", "__tests__", "de-catalog.test.ts"),
      "utf8",
    );
    expect(gate).toMatch(/^\s*"academy",\s*$/m);
  });
});
