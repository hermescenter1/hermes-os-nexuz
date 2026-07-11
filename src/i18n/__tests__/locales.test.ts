import { describe, it, expect } from "vitest";
import {
  ACTIVE_LOCALES,
  SUPPORTED_LOCALES,
  DEFAULT_LOCALE,
  LOCALE_DIRECTION,
  LOCALE_LANG_TAG,
  OG_LOCALE,
  LOCALE_NATIVE_NAME,
  LOCALE_ACCESSIBLE_NAME,
  isActiveLocale,
  isSupportedLocale,
  nextActiveLocale,
  activeLocaleOptions,
} from "@/i18n/locales";
import { routing, localeDirection } from "@/i18n/routing";
import { LOCALES as SEO_LOCALES, OG_LOCALE as SEO_OG_LOCALE } from "@/lib/seo/config";

describe("central locale source of truth", () => {
  it("exposes exactly fa + en as ACTIVE_LOCALES", () => {
    expect([...ACTIVE_LOCALES]).toEqual(["fa", "en"]);
  });

  it("models fa + en + de as SUPPORTED_LOCALES", () => {
    expect([...SUPPORTED_LOCALES]).toEqual(["fa", "en", "de"]);
  });

  it("defaults to fa", () => {
    expect(DEFAULT_LOCALE).toBe("fa");
    expect(ACTIVE_LOCALES).toContain(DEFAULT_LOCALE);
  });

  it("has no duplicate active locales", () => {
    expect(new Set(ACTIVE_LOCALES).size).toBe(ACTIVE_LOCALES.length);
  });

  it("has no duplicate supported locales", () => {
    expect(new Set(SUPPORTED_LOCALES).size).toBe(SUPPORTED_LOCALES.length);
  });
});

describe("German: supported but inactive", () => {
  it("is a supported locale", () => {
    expect(isSupportedLocale("de")).toBe(true);
    expect(SUPPORTED_LOCALES).toContain("de");
  });

  it("is NOT an active locale", () => {
    expect(isActiveLocale("de")).toBe(false);
    expect([...ACTIVE_LOCALES]).not.toContain("de");
  });
});

describe("direction mapping", () => {
  it("fa is rtl", () => {
    expect(LOCALE_DIRECTION.fa).toBe("rtl");
  });
  it("en is ltr", () => {
    expect(LOCALE_DIRECTION.en).toBe("ltr");
  });
  it("de is ltr", () => {
    expect(LOCALE_DIRECTION.de).toBe("ltr");
  });
});

describe("language tags", () => {
  it("maps each locale to its BCP-47 tag", () => {
    expect(LOCALE_LANG_TAG.fa).toBe("fa-IR");
    expect(LOCALE_LANG_TAG.en).toBe("en-GB");
    expect(LOCALE_LANG_TAG.de).toBe("de-DE");
  });
});

describe("Open Graph locale mapping", () => {
  it("maps active locales", () => {
    expect(OG_LOCALE.fa).toBe("fa_IR");
    expect(OG_LOCALE.en).toBe("en_GB");
  });
  it("supports de internally even though it is inactive", () => {
    expect(OG_LOCALE.de).toBe("de_DE");
  });
});

describe("routing and SEO locale lists cannot drift", () => {
  it("routing.locales equals ACTIVE_LOCALES", () => {
    expect([...routing.locales]).toEqual([...ACTIVE_LOCALES]);
    expect(routing.defaultLocale).toBe(DEFAULT_LOCALE);
  });

  it("SEO LOCALES is the same source as ACTIVE_LOCALES", () => {
    expect(SEO_LOCALES).toBe(ACTIVE_LOCALES);
    expect([...SEO_LOCALES]).toEqual([...ACTIVE_LOCALES]);
  });

  it("SEO OG_LOCALE is the same source as the central OG_LOCALE", () => {
    expect(SEO_OG_LOCALE).toBe(OG_LOCALE);
  });

  it("routing direction map is the central direction map", () => {
    expect(localeDirection).toBe(LOCALE_DIRECTION);
  });
});

describe("language switcher data (renders active locales only)", () => {
  it("activeLocaleOptions lists exactly fa + en", () => {
    const codes = activeLocaleOptions().map((o) => o.code);
    expect(codes).toEqual(["fa", "en"]);
  });

  it("uses native endonyms فارسی / English and never Deutsch", () => {
    const names = activeLocaleOptions().map((o) => o.nativeName);
    expect(names).toEqual(["فارسی", "English"]);
    expect(names).not.toContain("Deutsch");
  });

  it("carries each option's direction", () => {
    const [fa, en] = activeLocaleOptions();
    expect(fa.dir).toBe("rtl");
    expect(en.dir).toBe("ltr");
  });

  it("nextActiveLocale toggles fa <-> en", () => {
    expect(nextActiveLocale("fa")).toBe("en");
    expect(nextActiveLocale("en")).toBe("fa");
  });

  it("nextActiveLocale never targets an inactive locale", () => {
    expect(isActiveLocale(nextActiveLocale("de"))).toBe(true);
  });

  it("LOCALE_NATIVE_NAME models de even while inactive", () => {
    expect(LOCALE_NATIVE_NAME.de).toBe("Deutsch");
  });
});

describe("accessible names (switcher aria-labels)", () => {
  it("maps every supported locale to a human-readable English name", () => {
    expect(LOCALE_ACCESSIBLE_NAME.fa).toBe("Persian");
    expect(LOCALE_ACCESSIBLE_NAME.en).toBe("English");
    expect(LOCALE_ACCESSIBLE_NAME.de).toBe("German");
  });

  it("never uses a raw locale code as the accessible name", () => {
    for (const loc of SUPPORTED_LOCALES) {
      expect(LOCALE_ACCESSIBLE_NAME[loc]).not.toBe(loc);
      expect(LOCALE_ACCESSIBLE_NAME[loc].length).toBeGreaterThan(2);
    }
  });

  it("activeLocaleOptions carries accessible names for exactly fa/en", () => {
    const names = activeLocaleOptions().map((o) => o.accessibleName);
    expect(names).toEqual(["Persian", "English"]);
    expect(names).not.toContain("German");
  });

  it("switch labels render as 'Switch language to <Name>'", () => {
    const labels = activeLocaleOptions().map(
      (o) => `Switch language to ${o.accessibleName}`
    );
    expect(labels).toEqual([
      "Switch language to Persian",
      "Switch language to English",
    ]);
  });
});
