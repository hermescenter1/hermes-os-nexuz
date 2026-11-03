import { describe, it, expect, vi } from "vitest";
import type { ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

import en from "../../../../../messages/en.json";
import de from "../../../../../messages/de.json";
import fa from "../../../../../messages/fa.json";

/**
 * /privacy, /terms and /gdpr were hard-coded English, so /fa and /de served
 * English legal text (live audit target T05, 2026-11-03), and the privacy
 * contact named privacy@hermes-os.io, a domain the company does not use.
 * These render the real pages per locale through the real catalogs.
 */

const catalogs = { en, de, fa } as const;
type Loc = keyof typeof catalogs;

vi.mock("next-intl/server", async () => {
  const actual = await vi.importActual<typeof import("next-intl")>("next-intl");
  return {
    setRequestLocale: () => undefined,
    getTranslations: async ({ locale, namespace }: { locale: Loc; namespace: string }) =>
      actual.createTranslator({ locale, messages: catalogs[locale], namespace: namespace as never }),
  };
});

// LegalPageShell reads `useTranslations`; the locale under test is set per case.
let current: Loc = "en";
vi.mock("next-intl", async () => {
  const actual = await vi.importActual<typeof import("next-intl")>("next-intl");
  return {
    ...actual,
    useTranslations: (namespace: string) =>
      actual.createTranslator({ locale: current, messages: catalogs[current], namespace: namespace as never }),
  };
});
vi.mock("@/components/public-site", () => ({
  PublicPageShell: ({ children }: { children: ReactNode }) => <main>{children}</main>,
}));
vi.mock("@/i18n/navigation", () => ({
  Link: ({ href, children, className }: { href: string; children: ReactNode; className?: string }) => (
    <a href={href} className={className}>{children}</a>
  ),
}));

const PAGES = {
  privacy: () => import("@/app/[locale]/privacy/page"),
  terms: () => import("@/app/[locale]/terms/page"),
  gdpr: () => import("@/app/[locale]/gdpr/page"),
} as const;

async function render(page: keyof typeof PAGES, locale: Loc): Promise<string> {
  current = locale;
  const { default: Page } = await PAGES[page]();
  return renderToStaticMarkup(await Page({ params: Promise.resolve({ locale }) }));
}

const text = (html: string) => html.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ");

/** English headings that only the old hard-coded pages produced. */
const ENGLISH_MARKERS = [
  "Privacy Policy", "Data We Collect", "Terms of Service", "Acceptance of Terms",
  "Your GDPR Rights", "Right of Access", "Version", "Effective",
];

describe.each(["fa", "de"] as const)("/%s legal pages", (locale) => {
  it.each(["privacy", "terms", "gdpr"] as const)("%s renders no English legal copy", async (page) => {
    const body = text(await render(page, locale));
    for (const marker of ENGLISH_MARKERS) expect(body, marker).not.toContain(marker);
  });
});

describe("/en legal pages keep their English text", () => {
  it("privacy, terms and gdpr render their English headings", async () => {
    expect(text(await render("privacy", "en"))).toContain("Data We Collect");
    expect(text(await render("terms", "en"))).toContain("Acceptance of Terms");
    expect(text(await render("gdpr", "en"))).toContain("Right of Access");
  });
});

describe("privacy contact", () => {
  it.each(["en", "fa", "de"] as const)("/%s names the canonical address", async (locale) => {
    const html = await render("privacy", locale);
    expect(html).toContain("info@hermesnovin.com");
    expect(html).not.toContain("hermes-os.io");
  });

  it("no production source names the unused hermes-os.io domain", () => {
    const hits: string[] = [];
    const walk = (dir: string) => {
      for (const name of readdirSync(dir)) {
        const p = join(dir, name);
        if (statSync(p).isDirectory()) {
          if (name !== "__tests__" && name !== "node_modules") walk(p);
        } else if (/\.(tsx?|json)$/.test(name) && readFileSync(p, "utf8").includes("hermes-os.io")) {
          hits.push(p);
        }
      }
    };
    walk(join(process.cwd(), "src"));
    walk(join(process.cwd(), "messages"));
    expect(hits).toEqual([]);
  });
});

describe("links keep their targets", () => {
  it("privacy still points candidates at the candidate notice and rights at the data-request center", async () => {
    const html = await render("privacy", "fa");
    expect(html).toContain('href="/careers/privacy"');
    expect(html).toContain('href="/data-request"');
  });
});
