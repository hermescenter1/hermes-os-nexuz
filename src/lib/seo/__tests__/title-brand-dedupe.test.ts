import { describe, it, expect } from "vitest";
import type { Metadata } from "next";
import en from "../../../../messages/en.json";
import fa from "../../../../messages/fa.json";
import de from "../../../../messages/de.json";
import { buildMetadata, documentTitle } from "../metadata";
import { SITE_NAME } from "../config";

/**
 * The locale layout renders child titles through `%s | Hermes OS`. Catalog
 * titles that already name the brand were printed with it twice on the live
 * site ("Privacy Policy — Hermes OS | Hermes OS"). These tests pin the
 * rendered `<title>` text, not just the helper's return shape.
 */

/** What Next renders for a child segment under the locale layout's template. */
function rendered(title: Metadata["title"]): string {
  if (typeof title === "string") return `${title} | ${SITE_NAME}`;
  if (title && typeof title === "object" && "absolute" in title) return String(title.absolute);
  throw new Error(`unexpected title shape: ${JSON.stringify(title)}`);
}

const CATALOGS = { fa, en, de } as const;

type PageMeta = { title?: unknown };

function pageTitles(locale: keyof typeof CATALOGS): Array<[string, string]> {
  const pages = CATALOGS[locale].meta.pages as Record<string, PageMeta>;
  return Object.entries(pages)
    .filter((entry): entry is [string, { title: string }] => typeof entry[1]?.title === "string")
    .map(([key, value]) => [key, value.title]);
}

describe("document title — the brand is printed once", () => {
  it.each([
    ["en", "Privacy Policy — Hermes OS"],
    ["de", "Datenschutzerklärung — Hermes OS"],
    ["fa", "سیاست حریم خصوصی — هرمس او‌اس"],
    ["en", "SCADA Architect — Careers at Hermes OS"],
  ])("%s branded title %s opts out of the template", (_locale, title) => {
    expect(documentTitle(title)).toEqual({ absolute: title });
    expect(rendered(documentTitle(title))).toBe(title);
  });

  it("a title without the brand keeps the template suffix", () => {
    const title = "Industrial Knowledge Library — PLC, SCADA, HMI Reference";
    expect(documentTitle(title)).toBe(title);
    expect(rendered(documentTitle(title))).toBe(`${title} | Hermes OS`);
  });

  it("does not match the brand inside another word", () => {
    expect(documentTitle("Hermeskeil plant visit")).toBe("Hermeskeil plant visit");
  });

  it("buildMetadata applies the rule to the document title but keeps OG/Twitter text unchanged", () => {
    const title = "Privacy Policy — Hermes OS";
    const meta = buildMetadata({ locale: "en", path: "/privacy", title, description: "d" });
    expect(meta.title).toEqual({ absolute: title });
    expect(meta.openGraph?.title).toBe(title);
    expect(meta.twitter?.title).toBe(title);
  });

  it.each(["fa", "en", "de"] as const)("%s: no catalog page title renders the brand twice", (locale) => {
    const titles = pageTitles(locale);
    expect(titles.length).toBeGreaterThan(20);
    for (const [key, title] of titles) {
      const out = rendered(buildMetadata({ locale, path: "/x", title, description: "d" }).title);
      expect(out, key).not.toMatch(/Hermes OS.*\|\s*Hermes OS$/);
      expect(out, key).not.toMatch(/هرمس.*\|\s*Hermes OS$/);
      // Exactly one brand mention survives: either the catalog's own or the suffix.
      expect(/\bHermes\b|هرمس/i.test(out), key).toBe(true);
    }
  });
});
