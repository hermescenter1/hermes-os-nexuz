import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { verificationEmailHtml, verificationEmailText } from "../templates/verification";
import { passwordResetEmailHtml, passwordResetEmailText } from "../templates/password-reset";
import { welcomeEmailHtml, welcomeEmailText } from "../templates/welcome";
import {
  resolveEmailLocale,
  verificationEmailSubject,
  passwordResetEmailSubject,
  welcomeEmailSubject,
} from "../templates/email-locale";

/**
 * PHASE 89B-FINAL — trilingual auth emails.
 *
 * Pure template-layer tests: no provider is constructed and nothing is sent —
 * the templates are deterministic string functions. Covers fa/en/de rendering,
 * the English fallback for unknown/missing locales, URL/token preservation,
 * HTML escaping of user-controlled names, and no token logging in handlers.
 */

const TOKEN_LINK = "https://www.hermesnovin.com/auth/verify-email?token=SECRET-TOKEN-123";
const RESET_LINK = "https://www.hermesnovin.com/auth/reset-password?token=RESET-TOKEN-456";

const VERIF = { name: "Sara", verificationLink: TOKEN_LINK, expiresInHours: 24 };
const RESET = { name: "Sara", resetLink: RESET_LINK, expiresInHours: 2 };

describe("89B-FINAL — locale resolution", () => {
  it("fa/en/de resolve to themselves; unknown or missing → English", () => {
    expect(resolveEmailLocale("fa")).toBe("fa");
    expect(resolveEmailLocale("de")).toBe("de");
    expect(resolveEmailLocale("en")).toBe("en");
    for (const bad of [undefined, null, "", "xx", "fa-IR", "EN", "de-DE"]) {
      expect(resolveEmailLocale(bad)).toBe("en");
    }
  });
});

describe("89B-FINAL — verification email", () => {
  it.each([
    ["fa", "نشانی ایمیل خود را تأیید کنید", 'dir="rtl"'],
    ["en", "Verify your email address", 'dir="ltr"'],
    ["de", "E-Mail-Adresse bestätigen", 'dir="ltr"'],
  ] as const)("%s: localized html with %s and correct direction", (loc, title, dirAttr) => {
    const html = verificationEmailHtml({ ...VERIF, locale: loc });
    expect(html).toContain(title);
    expect(html).toContain(dirAttr);
    expect(html).toContain(`lang="${loc}"`);
    expect(html).toContain(TOKEN_LINK);
  });

  it("subject is localized per locale and English on unknown", () => {
    expect(verificationEmailSubject("fa")).toContain("تأیید");
    expect(verificationEmailSubject("de")).toContain("Bestätigen");
    expect(verificationEmailSubject("en")).toContain("Verify");
    expect(verificationEmailSubject("xx")).toBe(verificationEmailSubject("en"));
    expect(verificationEmailSubject(undefined)).toBe(verificationEmailSubject("en"));
  });

  it("missing locale renders exactly the English variant (legacy callers unchanged)", () => {
    expect(verificationEmailHtml(VERIF)).toBe(verificationEmailHtml({ ...VERIF, locale: "en" }));
    expect(verificationEmailText(VERIF)).toBe(verificationEmailText({ ...VERIF, locale: "en" }));
  });

  it("text variant is localized and preserves link and hours verbatim", () => {
    for (const loc of ["fa", "en", "de"] as const) {
      const text = verificationEmailText({ ...VERIF, locale: loc });
      expect(text).toContain(TOKEN_LINK);
      expect(text).toContain("24");
      expect(text).not.toContain("{link}");
      expect(text).not.toContain("{hours}");
      expect(text).not.toContain("{name}");
    }
    expect(verificationEmailText({ ...VERIF, locale: "de" })).toContain("Hallo Sara");
    expect(verificationEmailText({ ...VERIF, locale: "fa" })).toContain("سلام Sara");
  });

  it("escapes user-controlled names in HTML", () => {
    const html = verificationEmailHtml({
      ...VERIF,
      name: '<img src=x onerror=alert(1)>"&',
      locale: "de",
    });
    expect(html).not.toContain("<img src=x");
    expect(html).toContain("&lt;img src=x onerror=alert(1)&gt;&quot;&amp;");
  });
});

describe("89B-FINAL — password-reset email", () => {
  it.each([
    ["fa", "بازنشانی گذرواژه", 'dir="rtl"'],
    ["en", "Reset your password", 'dir="ltr"'],
    ["de", "Passwort zurücksetzen", 'dir="ltr"'],
  ] as const)("%s: localized html, link preserved", (loc, title, dirAttr) => {
    const html = passwordResetEmailHtml({ ...RESET, locale: loc });
    expect(html).toContain(title);
    expect(html).toContain(dirAttr);
    expect(html).toContain(RESET_LINK);
  });

  it("subject localized; unknown → English; legacy call = English output", () => {
    expect(passwordResetEmailSubject("fa")).toContain("بازنشانی");
    expect(passwordResetEmailSubject("de")).toContain("zurück");
    expect(passwordResetEmailSubject("zz")).toBe(passwordResetEmailSubject("en"));
    expect(passwordResetEmailHtml(RESET)).toBe(passwordResetEmailHtml({ ...RESET, locale: "en" }));
  });

  it("text variant localized with link/hours intact", () => {
    for (const loc of ["fa", "en", "de"] as const) {
      const text = passwordResetEmailText({ ...RESET, locale: loc });
      expect(text).toContain(RESET_LINK);
      expect(text).toContain("2");
      expect(text).not.toMatch(/\{(link|hours|name)\}/);
    }
  });
});

describe("89B-FINAL — welcome email", () => {
  it.each([["fa"], ["en"], ["de"]] as const)("%s renders localized subject and body", (loc) => {
    const html = welcomeEmailHtml({ name: "Sara", locale: loc });
    expect(html).toContain(`lang="${loc}"`);
    expect(welcomeEmailSubject(loc).length).toBeGreaterThan(0);
    expect(html).not.toMatch(/\{name\}/);
  });

  it("German welcome carries German copy, Persian is RTL", () => {
    expect(welcomeEmailHtml({ name: "S", locale: "de" })).toContain("Willkommen bei Hermes OS");
    expect(welcomeEmailHtml({ name: "S", locale: "fa" })).toContain('dir="rtl"');
    expect(welcomeEmailHtml({ name: "S" })).toBe(welcomeEmailHtml({ name: "S", locale: "en" }));
  });
});

describe("89B-FINAL — delivery-layer hygiene (source-level)", () => {
  const handlers = readFileSync(resolve(process.cwd(), "src/lib/events/auth/handlers.ts"), "utf8");

  it("handlers thread event.locale into subject and both template variants", () => {
    expect(handlers).toContain("verificationEmailSubject(event.locale)");
    expect(handlers).toContain("passwordResetEmailSubject(event.locale)");
    expect(handlers).toContain("welcomeEmailSubject(event.locale)");
    expect((handlers.match(/locale:\s+event\.locale/g) ?? []).length).toBeGreaterThanOrEqual(4);
  });

  it("handlers never log tokens, links or email bodies", () => {
    const logCalls = [...handlers.matchAll(/logger\.\w+\(([^)]*)\)/g)].map((m) => m[1]);
    expect(logCalls.length).toBeGreaterThan(0);
    for (const call of logCalls) {
      expect(call).not.toMatch(/token|Link|html|text:|resetLink|verificationLink/i);
    }
  });

  it("live API routes read the NEXT_LOCALE cookie with a strict allowlist", () => {
    for (const route of ["src/app/api/auth/forgot-password/route.ts", "src/app/api/auth/verify-email/route.ts"]) {
      const src = readFileSync(resolve(process.cwd(), route), "utf8");
      expect(src).toContain("NEXT_LOCALE=(fa|en|de)");
    }
  });
});
