/**
 * DISCOVERY-2D P1K
 *
 * Regression contract for the public Library discovery bridge.
 *
 * The interactive LibraryClient obtains its cards after hydration. That UX
 * remains unchanged. This test requires the server-rendered Library page to
 * expose crawlable hrefs for the same static authorities already admitted to
 * the public sitemap:
 *
 *   KNOWLEDGE
 *   CASES + CASE_CONTENT_LOCALES
 *   VENDORS
 *
 * No independent content registry is allowed here.
 */

import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

import { KNOWLEDGE } from "@/lib/industrial/knowledge";
import {
  CASES,
  CASE_CONTENT_LOCALES,
} from "@/lib/industrial/cases";
import { VENDORS } from "@/lib/industrial/vendors";

vi.mock("@/i18n/navigation", () => ({
  Link: ({
    href,
    children,
    ...props
  }: React.AnchorHTMLAttributes<HTMLAnchorElement> & {
    href: string;
    children?: React.ReactNode;
  }) => (
    <a href={href} {...props}>
      {children}
    </a>
  ),
}));

vi.mock("next-intl/server", () => ({
  setRequestLocale: vi.fn(),
  getTranslations: async () =>
    ((key: string) => key),
}));

vi.mock("@/components/public-site", () => ({
  PublicPageShell: ({ children }: { children: React.ReactNode }) => (
    <div data-testid="public-page-shell">{children}</div>
  ),
}));

vi.mock("@/components/PageIntro", () => ({
  PageIntro: () => <div data-testid="page-intro" />,
}));

vi.mock("@/components/library/LibraryClient", () => ({
  LibraryClient: () => <div data-testid="library-client" />,
}));

import LibraryPage from "../page";

function hrefs(html: string): string[] {
  return Array.from(
    html.matchAll(/href="([^"]+)"/g),
    (match) => match[1],
  );
}

async function render(locale: string): Promise<string[]> {
  const element = await LibraryPage({
    params: Promise.resolve({ locale }),
  });

  return hrefs(renderToStaticMarkup(element));
}

describe("DISCOVERY-2D P1K — server-rendered Library discovery", () => {
  it.each(["en", "fa", "de"])(
    "%s renders every knowledge authority href",
    async (locale) => {
      const links = await render(locale);

      for (const item of KNOWLEDGE) {
        expect(links).toContain(`/library/${item.id}`);
      }
    },
  );

  it.each(["en", "fa", "de"])(
    "%s renders every vendor authority href",
    async (locale) => {
      const links = await render(locale);

      for (const vendor of VENDORS) {
        expect(links).toContain(`/library/vendor/${vendor.id}`);
      }
    },
  );

  it.each(["en", "fa"])(
    "%s renders every truthful case-detail href",
    async (locale) => {
      expect(CASE_CONTENT_LOCALES).toContain(locale);

      const links = await render(locale);

      for (const item of CASES) {
        expect(links).toContain(`/library/cases/${item.id}`);
      }
    },
  );

  it("does not invent German case-detail discovery", async () => {
    expect(CASE_CONTENT_LOCALES).not.toContain("de");

    const links = await render("de");

    for (const item of CASES) {
      expect(links).not.toContain(`/library/cases/${item.id}`);
    }
  });

  it("authority arithmetic remains exactly 139 sitemap detail targets", () => {
    const knowledgeTargets = KNOWLEDGE.length * 3;
    const caseTargets = CASES.length * CASE_CONTENT_LOCALES.length;
    const vendorTargets = VENDORS.length * 3;

    expect(
      knowledgeTargets + caseTargets + vendorTargets,
    ).toBe(139);
  });
});
