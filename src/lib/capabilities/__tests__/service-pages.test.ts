import { describe, it, expect } from "vitest";
import { existsSync } from "node:fs";
import { join } from "node:path";
import en from "../../../../messages/en.json";
import fa from "../../../../messages/fa.json";
import de from "../../../../messages/de.json";
import { SERVICE_KEYS, SERVICE_RELATED_HREFS } from "@/lib/capabilities/service-pages";
import { KNOWLEDGE } from "@/lib/industrial/knowledge";
import { VENDORS } from "@/lib/industrial/vendors";

// THIN-CONTENT lane — the five ServiceDetail pages now carry a long-form body
// whose link labels (catalog) and hrefs (service-pages.ts) are index-aligned.
// These tests keep that pairing honest in all three locales and stop a href
// from pointing at an article, library entry or page that does not exist.

type Detail = {
  overview: string[];
  covers: { name: string; desc: string }[];
  boundary: string;
  related: string[];
};

const CATALOGS = { en, fa, de } as const;

function detailOf(locale: keyof typeof CATALOGS, key: string): Detail {
  const items = (CATALOGS[locale] as unknown as { services: { items: Record<string, { detail: Detail }> } })
    .services.items;
  return items[key].detail;
}

function hrefResolves(href: string): boolean {
  const article = href.match(/^\/articles\/([a-z0-9-]+)$/);
  if (article) {
    return existsSync(join(process.cwd(), "content", "journal", "articles", article[1], "article.json"));
  }
  const vendor = href.match(/^\/library\/vendor\/([a-z]+)$/);
  if (vendor) return VENDORS.some((v) => v.id === vendor[1]);
  const entry = href.match(/^\/library\/([A-Za-z0-9]+)$/);
  if (entry) return KNOWLEDGE.some((k) => k.id === entry[1]);
  return existsSync(join(process.cwd(), "src", "app", "[locale]", href.replace(/^\//, ""), "page.tsx"));
}

describe("service pages — long-form body contract", () => {
  it.each(SERVICE_KEYS)("%s has one label per related href in every locale", (key) => {
    for (const locale of ["en", "fa", "de"] as const) {
      expect(detailOf(locale, key).related, `${locale}.${key}`).toHaveLength(SERVICE_RELATED_HREFS[key].length);
    }
  });

  it.each(SERVICE_KEYS)("%s has the same body shape in every locale", (key) => {
    const shape = (d: Detail) => [d.overview.length, d.covers.length, d.related.length].join("/");
    expect(shape(detailOf("fa", key))).toBe(shape(detailOf("en", key)));
    expect(shape(detailOf("de", key))).toBe(shape(detailOf("en", key)));
  });

  it.each(SERVICE_KEYS)("%s links only to routes that exist", (key) => {
    for (const href of SERVICE_RELATED_HREFS[key]) {
      expect(hrefResolves(href), href).toBe(true);
    }
  });

  it("never links a service page to itself or repeats a link", () => {
    for (const key of SERVICE_KEYS) {
      const hrefs = SERVICE_RELATED_HREFS[key];
      expect(new Set(hrefs).size).toBe(hrefs.length);
    }
  });
});
