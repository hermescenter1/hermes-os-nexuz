import { describe, it, expect } from "vitest";
import { buildMetadata } from "@/lib/seo/metadata";
import { ACTIVE_LOCALES } from "@/i18n/locales";

describe("buildMetadata — hreflang uses active locales only", () => {
  const meta = buildMetadata({
    locale: "fa",
    path: "/platform",
    title: "T",
    description: "D",
  });

  const languages = (meta.alternates?.languages ?? {}) as Record<string, string>;

  it("emits one alternate per active locale plus x-default", () => {
    expect(Object.keys(languages).sort()).toEqual(
      [...ACTIVE_LOCALES, "x-default"].sort()
    );
  });

  it("emits a /de hreflang alternate (87L.6 activation)", () => {
    expect(languages.de).toMatch(/\/de\/platform$/);
  });

  it("OG locale is the current locale, alternates are the other active locales", () => {
    const og = meta.openGraph as { locale?: string; alternateLocale?: string[] };
    expect(og.locale).toBe("fa_IR");
    expect(og.alternateLocale).toEqual(["en_GB", "de_DE"]);
  });

  it("x-default points at the default locale", () => {
    expect(languages["x-default"]).toMatch(/\/fa\/platform$/);
  });
});
