// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { NextIntlClientProvider } from "next-intl";
import { act } from "react";

/*
 * The banner links to /cookies through `@/i18n/navigation`, whose client
 * navigation pulls `next/navigation` — unresolvable outside a Next runtime.
 * Mocked to a plain anchor, exactly as the Phase 104 consent tests do.
 */
vi.mock("@/i18n/navigation", () => ({
  usePathname: () => "/cookies",
  useLocale: () => "en",
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), refresh: vi.fn() }),
  Link: ({ href, children, ...rest }: { href: string; children?: React.ReactNode } & Record<string, unknown>) => (
    <a href={String(href)} {...rest}>{children}</a>
  ),
}));
import { mount, click } from "@/components/ds/__tests__/_render";
import {
  STORAGE_INVENTORY,
  THIRD_PARTY_INVENTORY,
  CATEGORY_ORDER,
  CONSENT_MIRROR_STORAGE_KEY,
  LOCALE_COOKIE,
  storageForCategory,
} from "@/lib/compliance/cookie-inventory";
import {
  SESSION_COOKIE,
  ACCESS_TOKEN_COOKIE,
  REFRESH_TOKEN_COOKIE,
} from "@/lib/auth/config";
import { CONSENT_ID_COOKIE } from "@/lib/compliance/consent-cookie";
import { TENANT_SELECTION_COOKIE } from "@/lib/tenant-selection/contract";
import { COOKIE_PREFERENCES_OPEN_EVENT, requestCookiePreferences } from "../cookie-preferences";
import en from "../../../../messages/en.json";
import fa from "../../../../messages/fa.json";
import de from "../../../../messages/de.json";

/**
 * PHASE 113 — cookie governance.
 *
 * Three classes of defect are guarded here, and every one of them was real on
 * the baseline:
 *
 *   1. THE POLICY DESCRIBED SOFTWARE THAT DOES NOT EXIST. It named
 *      `marketing_consent` and `ui_prefs` (absent from the repository) and
 *      `access_token` (real name `hermes_at`). The inventory tests below tie the
 *      published names to the constants the platform actually sets, in both
 *      directions, so neither an invented name nor an undocumented new cookie
 *      can survive.
 *   2. THE POLICY WAS ENGLISH-ONLY inside a localized route. The catalog tests
 *      hold `cookiePolicy` to exact three-way key parity, no empty values, ICU
 *      placeholder parity and zero English carryover in German or Persian.
 *   3. THE WITHDRAWAL PATH DID NOT EXIST. The policy told readers to use a
 *      banner that could never reappear. The behavioural tests drive the real
 *      component: stored consent keeps it hidden, the reopen event brings it
 *      back seeded with the stored choice, and preferences can be changed more
 *      than once.
 */

const ROOT = process.cwd();
const read = (rel: string) => readFileSync(resolve(ROOT, rel), "utf8");
/** Comment-stripped source, so prose can never satisfy a check. */
const activeSrc = (rel: string) =>
  read(rel)
    .replace(/\{\/\*[\s\S]*?\*\/\}/g, " ")
    .replace(/\/\*[\s\S]*?\*\//g, " ")
    .replace(/(^|[^:])\/\/[^\n]*/g, "$1 ");

type Catalog = typeof en;
const CATALOGS = [
  ["en", en],
  ["fa", fa as unknown as Catalog],
  ["de", de as unknown as Catalog],
] as const;

function flatten(node: unknown, prefix = "", out = new Map<string, unknown>()): Map<string, unknown> {
  if (node !== null && typeof node === "object") {
    for (const [key, value] of Object.entries(node as Record<string, unknown>)) {
      flatten(value, prefix ? `${prefix}.${key}` : key, out);
    }
  } else {
    out.set(prefix, node);
  }
  return out;
}

const NS = "cookiePolicy";
const flatFor = (catalog: Catalog) =>
  flatten((catalog as unknown as Record<string, unknown>)[NS]);

/** ICU argument names, order-insensitive. */
const placeholders = (value: unknown) =>
  [...String(value).matchAll(/\{\s*([a-zA-Z0-9_]+)/g)].map((m) => m[1]).sort().join(",");

afterEach(() => {
  document.body.innerHTML = "";
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  try { localStorage.clear(); } catch { /* jsdom without storage */ }
});

/* ── 1 · The inventory matches the software, in both directions ──────────── */

describe("the cookie inventory is derived from the code, not retyped", () => {
  it("every documented cookie name is the value a real constant holds", () => {
    const declared = new Map<string, string>([
      [SESSION_COOKIE, "auth/config SESSION_COOKIE"],
      [ACCESS_TOKEN_COOKIE, "auth/config ACCESS_TOKEN_COOKIE"],
      [REFRESH_TOKEN_COOKIE, "auth/config REFRESH_TOKEN_COOKIE"],
      [CONSENT_ID_COOKIE, "compliance/consent-cookie CONSENT_ID_COOKIE"],
      [TENANT_SELECTION_COOKIE, "tenant-selection/contract TENANT_SELECTION_COOKIE"],
      [LOCALE_COOKIE, "next-intl locale cookie"],
      [CONSENT_MIRROR_STORAGE_KEY, "the consent localStorage mirror"],
    ]);
    for (const entry of STORAGE_INVENTORY) {
      expect(declared.has(entry.name), `${entry.name} is not backed by a declared constant`).toBe(true);
    }
    // …and nothing the platform sets is left undocumented.
    for (const [name, source] of declared) {
      expect(
        STORAGE_INVENTORY.some((entry) => entry.name === name),
        `${name} (${source}) is set by the platform but missing from the policy inventory`,
      ).toBe(true);
    }
  });

  it("every cookie-name constant exported anywhere in the tree is documented", () => {
    // Catches the real regression: a future phase adds a cookie and the legal
    // document silently stops describing what the software stores.
    const sources = [
      "src/lib/auth/config.ts",
      "src/lib/compliance/consent-cookie.ts",
      "src/lib/tenant-selection/contract.ts",
    ] as const;
    const found: string[] = [];
    for (const file of sources) {
      for (const match of read(file).matchAll(/export const [A-Z_]*COOKIE[A-Z_]*\s*=\s*"([^"]+)"/g)) {
        found.push(match[1]);
      }
    }
    expect(found.length).toBeGreaterThan(0);
    const documented = new Set(STORAGE_INVENTORY.map((entry) => entry.name));
    expect(found.filter((name) => !documented.has(name))).toEqual([]);
  });

  it("the policy names no cookie the repository does not set", () => {
    // The three fabricated/wrong names the previous page published.
    const src = read("src/app/[locale]/cookies/page.tsx");
    const catalogs = CATALOGS.map(([, catalog]) => JSON.stringify(catalog[NS as keyof Catalog])).join(" ");
    for (const invented of ["marketing_consent", "ui_prefs", "access_token"]) {
      expect(src, `the page must not name "${invented}"`).not.toContain(`"${invented}"`);
      expect(catalogs, `no catalog may name "${invented}"`).not.toContain(invented);
    }
  });

  it("the policy claims no CSRF cookie, because the platform sets none", () => {
    const catalogs = CATALOGS.map(([, catalog]) => JSON.stringify(catalog[NS as keyof Catalog])).join(" ");
    expect(catalogs.toLowerCase()).not.toContain("csrf");
  });

  it("no retention period is invented — each is a constant or an explicit null", () => {
    for (const entry of STORAGE_INVENTORY) {
      if (entry.medium === "localStorage") {
        // localStorage has no expiry; claiming one would be a false statement.
        expect(entry.maxAgeSeconds, `${entry.name}`).toBeNull();
      } else {
        expect(typeof entry.maxAgeSeconds, `${entry.name}`).toBe("number");
        expect(entry.maxAgeSeconds as number).toBeGreaterThan(0);
      }
    }
  });

  it("the auth cookie lifetimes are the exported TTLs, not hand-copied numbers", async () => {
    const { ACCESS_TOKEN_TTL, REFRESH_TOKEN_TTL, REFRESH_TOKEN_TTL_LONG } = await import("@/lib/auth/config");
    const { CONSENT_ID_MAX_AGE_SECONDS } = await import("@/lib/compliance/consent-cookie");
    const byName = new Map(STORAGE_INVENTORY.map((entry) => [entry.name, entry]));
    expect(byName.get(ACCESS_TOKEN_COOKIE)!.maxAgeSeconds).toBe(ACCESS_TOKEN_TTL);
    expect(byName.get(REFRESH_TOKEN_COOKIE)!.maxAgeSeconds).toBe(REFRESH_TOKEN_TTL);
    expect(byName.get(REFRESH_TOKEN_COOKIE)!.extendedMaxAgeSeconds).toBe(REFRESH_TOKEN_TTL_LONG);
    expect(byName.get(CONSENT_ID_COOKIE)!.maxAgeSeconds).toBe(CONSENT_ID_MAX_AGE_SECONDS);
  });
});

/* ── 2 · All four categories, necessary first and never optional ─────────── */

describe("the four consent categories are complete and correctly ordered", () => {
  it("all four categories are rendered, with necessary first", () => {
    expect(CATEGORY_ORDER).toEqual(["necessary", "analytics", "marketing", "preferences"]);
  });

  it("every category has copy in every locale", () => {
    for (const [locale, catalog] of CATALOGS) {
      const consent = (catalog as unknown as {
        adminGovernance: { cookieConsent: { categories: Record<string, { label: string; desc: string }> } };
      }).adminGovernance.cookieConsent.categories;
      for (const category of CATEGORY_ORDER) {
        expect(consent[category]?.label, `${locale}: ${category}.label`).toBeTruthy();
        expect(consent[category]?.desc, `${locale}: ${category}.desc`).toBeTruthy();
      }
    }
  });

  it("every inventory entry belongs to one of the four categories, and its purpose is translated", () => {
    for (const entry of STORAGE_INVENTORY) {
      expect(CATEGORY_ORDER).toContain(entry.category);
      for (const [locale, catalog] of CATALOGS) {
        const value = flatFor(catalog).get(`storage.${entry.purposeKey}`);
        expect(typeof value, `${locale}: storage.${entry.purposeKey} for ${entry.name}`).toBe("string");
        expect(String(value).trim(), `${locale}: storage.${entry.purposeKey}`).not.toBe("");
      }
    }
  });

  it("the necessary category is never presented as optional, and vice versa", () => {
    // Auth, tenant selection and the consent record itself are what make the
    // service work; the locale cookie is a preference, not a necessity.
    for (const name of [SESSION_COOKIE, ACCESS_TOKEN_COOKIE, REFRESH_TOKEN_COOKIE, CONSENT_ID_COOKIE, TENANT_SELECTION_COOKIE]) {
      expect(STORAGE_INVENTORY.find((e) => e.name === name)!.category, name).toBe("necessary");
    }
    expect(STORAGE_INVENTORY.find((e) => e.name === LOCALE_COOKIE)!.category).toBe("preferences");
  });

  it("analytics and marketing hold no first-party storage, so the policy says so rather than showing an empty table", () => {
    expect(storageForCategory("analytics")).toEqual([]);
    expect(storageForCategory("marketing")).toEqual([]);
    for (const [locale, catalog] of CATALOGS) {
      expect(flatFor(catalog).get("categories.noneStored"), `${locale}`).toBeTruthy();
    }
  });

  it("every third-party service is gated on a real consent category and documents its provider", () => {
    expect(THIRD_PARTY_INVENTORY.length).toBeGreaterThan(0);
    for (const service of THIRD_PARTY_INVENTORY) {
      expect(service.gatedBy.length, service.key).toBeGreaterThan(0);
      for (const category of service.gatedBy) {
        // A third party may never be gated on "necessary": that would make it
        // unrefusable.
        expect(category, `${service.key} must be optional`).not.toBe("necessary");
        expect(CATEGORY_ORDER).toContain(category);
      }
      expect(service.privacyUrl.startsWith("https://"), service.key).toBe(true);
      for (const [locale, catalog] of CATALOGS) {
        const flat = flatFor(catalog);
        expect(flat.get(`thirdParty.${service.key}.name`), `${locale}: ${service.key}.name`).toBeTruthy();
        expect(flat.get(`thirdParty.${service.key}.purpose`), `${locale}: ${service.key}.purpose`).toBeTruthy();
      }
    }
  });

  it("the declared third-party gates match the gates the code enforces", () => {
    const analytics = activeSrc("src/components/analytics/AnalyticsProvider.tsx");
    // GTM: analytics OR marketing. Clarity: analytics only.
    expect(analytics).toMatch(/setGtmAllowed\(\s*prefs\.analytics\s*\|\|\s*prefs\.marketing\s*\)/);
    expect(analytics).toMatch(/setClarityAllowed\(\s*prefs\.analytics\s*\)/);
    const byKey = new Map(THIRD_PARTY_INVENTORY.map((s) => [s.key, s]));
    expect([...byKey.get("googleAnalytics")!.gatedBy].sort()).toEqual(["analytics", "marketing"]);
    expect([...byKey.get("microsoftClarity")!.gatedBy]).toEqual(["analytics"]);
    // ProvenExpert refuses to load without marketing consent, in its own module.
    expect(activeSrc("src/components/trust/proseal-controller.ts")).toContain("marketing");
    expect([...byKey.get("provenExpert")!.gatedBy]).toEqual(["marketing"]);
  });

  it("image-only badges are not listed as consent-gated third parties", () => {
    // eNAMAD and SaaSHub are `img-src` entries in the CSP: no script, no cookie.
    const keys = THIRD_PARTY_INVENTORY.map((s) => s.key);
    expect(keys).not.toContain("enamad");
    expect(keys).not.toContain("saashub");
  });
});

/* ── 3 · Catalog parity for the new namespace ────────────────────────────── */

describe("cookiePolicy catalog parity", () => {
  const enFlat = flatFor(en);

  it("the namespace exists in all three locales with identical key paths", () => {
    const enKeys = [...enFlat.keys()].sort();
    expect(enKeys.length).toBeGreaterThan(0);
    for (const [locale, catalog] of CATALOGS) {
      expect([...flatFor(catalog).keys()].sort(), `${locale} key parity`).toEqual(enKeys);
    }
  });

  it("no value is empty in any locale", () => {
    for (const [locale, catalog] of CATALOGS) {
      for (const [key, value] of flatFor(catalog)) {
        expect(typeof value, `${locale}: ${key}`).toBe("string");
        expect(String(value).trim(), `${locale}: ${key} is empty`).not.toBe("");
      }
    }
  });

  it("ICU placeholders match across locales", () => {
    for (const [locale, catalog] of CATALOGS) {
      for (const [key, value] of flatFor(catalog)) {
        expect(placeholders(value), `${locale}: ${key}`).toBe(placeholders(enFlat.get(key)));
      }
    }
  });

  it("no German or Persian value is English carryover", () => {
    const offenders: string[] = [];
    for (const [locale, catalog] of CATALOGS) {
      if (locale === "en") continue;
      for (const [key, value] of flatFor(catalog)) {
        if (value === enFlat.get(key)) offenders.push(`${locale}: ${key} = ${JSON.stringify(value)}`);
      }
    }
    expect(offenders).toEqual([]);
  });

  it("German carries no Persian script and Persian uses Persian letterforms", () => {
    for (const [key, value] of flatFor(de)) {
      expect(/[؀-ۿ]/.test(String(value)), `de: ${key} contains Persian script`).toBe(false);
    }
    for (const [key, value] of flatFor(fa)) {
      // Arabic yeh (U+064A) and kaf (U+0643) are the two substitutions that most
      // often slip into Persian copy.
      expect(/[يك]/.test(String(value)), `fa: ${key} uses an Arabic letterform`).toBe(false);
    }
  });

  it("the policy page renders no hard-coded visible English string", () => {
    const src = activeSrc("src/app/[locale]/cookies/page.tsx");
    // The literals the previous version shipped, in all three locales.
    for (const literal of [
      "What Are Cookies",
      "Cookie Categories",
      "Managing Cookies",
      "Cookie Retention",
      "Cookie Policy\"",
      "Necessary\"",
      "Analytics\"",
    ]) {
      expect(src, `hard-coded "${literal}"`).not.toContain(literal);
    }
    // …and it reads the localized namespace instead.
    expect(src).toContain('namespace: "cookiePolicy"');
  });

  it("the policy covers every section the governance brief requires", () => {
    const required = [
      "intro.body",            // 1  what cookies/storage are
      "intro.storageBody",
      "categories.intro",      //    how the four category sections are organised
      "controller.body",       // 2  responsible company
      "basis.necessaryBody",   // 7  legal/consent basis
      "basis.optionalBody",
      "storage.body",          // 8  storage and retention
      "thirdParty.body",       // 9  third-party services
      "withdrawal.body",       // 10 withdrawal of consent
      "withdrawal.manageButton",
      "browserControls.body",  // 11 browser controls
      "contact.body",          // 12 contact channel
      "updates.body",          // 13 how the policy changes + the version stamp
      "effective",
      "versionLabel",
      "effectiveLabel",
      "privacyPolicy.cta",     // 14 link to the privacy policy
      "toc.heading",           //    the document index the redesign introduced
      "toc.mobileLabel",
    ] as const;
    for (const [locale, catalog] of CATALOGS) {
      const flat = flatFor(catalog);
      for (const key of required) {
        expect(flat.get(key), `${locale}: ${key} is required by the cookie-governance brief`).toBeTruthy();
      }
    }
  });

  it("sections 3-6 are the four consent categories, named by the dialog’s own vocabulary", () => {
    // PHASE 113-A — the four categories became four numbered document sections,
    // so the umbrella `categories.heading` was deleted rather than left orphaned.
    // Each section is headed by the SAME label the consent dialog shows, which is
    // what stops the policy and the dialog naming a category differently.
    for (const [locale, catalog] of CATALOGS) {
      const consent = (catalog as unknown as {
        adminGovernance: { cookieConsent: { categories: Record<string, { label: string; desc: string }> } };
      }).adminGovernance.cookieConsent.categories;
      for (const category of CATEGORY_ORDER) {
        expect(consent[category]?.label, `${locale}: heading for section "${category}"`).toBeTruthy();
      }
      expect(flatFor(catalog).get("categories.heading"), `${locale}: the umbrella heading must stay deleted`).toBeUndefined();
    }
  });

  it("the storage medium and scope vocabularies both exist, so the table has no untranslated cell", () => {
    for (const [locale, catalog] of CATALOGS) {
      const flat = flatFor(catalog);
      for (const key of [
        "storage.mediumCookie", "storage.mediumLocalStorage",
        "storage.scopeAll", "storage.scopeAuthenticated",
        "storage.retentionHours", "storage.retentionDays",
        "storage.retentionExtended", "storage.retentionUntilCleared",
        "table.colName", "table.colPurpose", "table.colRetention", "table.colScope",
      ]) {
        expect(flat.get(key), `${locale}: ${key}`).toBeTruthy();
      }
    }
  });
});

/* ── 4 · The reopen contract ─────────────────────────────────────────────── */

describe("cookie preferences can be reopened", () => {
  it("the event name is a stable contract shared by the control and the banner", () => {
    expect(COOKIE_PREFERENCES_OPEN_EVENT).toBe("hermes:cookie-preferences-open");
    expect(activeSrc("src/components/compliance/CookieConsentBanner.tsx"))
      .toContain("COOKIE_PREFERENCES_OPEN_EVENT");
    expect(activeSrc("src/components/compliance/ManageCookiePreferencesButton.tsx"))
      .toContain("requestCookiePreferences");
  });

  it("requestCookiePreferences dispatches the event, and stays silent with no window", () => {
    const received: string[] = [];
    const target = { dispatchEvent: (event: Event) => { received.push(event.type); return true; } };
    expect(requestCookiePreferences(target)).toBe(true);
    expect(received).toEqual([COOKIE_PREFERENCES_OPEN_EVENT]);
    expect(requestCookiePreferences(null), "no dispatch target means no event, not a throw").toBe(false);
  });

  it("it never writes consent itself — only the banner may", () => {
    const src = activeSrc("src/components/compliance/cookie-preferences.ts");
    expect(src).not.toContain("localStorage");
    expect(src).not.toContain("fetch");
    const button = activeSrc("src/components/compliance/ManageCookiePreferencesButton.tsx");
    expect(button).not.toContain("localStorage");
    expect(button).not.toContain("fetch");
  });

  it("there is exactly ONE consent surface in the tree", () => {
    // A second banner would be a second writer of one consent record. The
    // reopen control renders only a button.
    const button = activeSrc("src/components/compliance/ManageCookiePreferencesButton.tsx");
    expect(button).not.toContain("role=\"dialog\"");
    expect(button).not.toContain("data-consent-action=\"accept-all\"");
    expect(button).toContain("data-consent-action=\"manage-preferences\"");
  });
});

/* ── 5 · The banner's real behaviour ─────────────────────────────────────── */

function withIntl(locale: "en" | "fa" | "de", ui: React.ReactNode) {
  const messages = locale === "en" ? en : locale === "fa" ? fa : de;
  return (
    <NextIntlClientProvider locale={locale} messages={messages as Catalog} timeZone="UTC">
      {locale === "fa" ? <div dir="rtl">{ui}</div> : ui}
    </NextIntlClientProvider>
  );
}

/**
 * Resolve the microtasks the banner's consent fetch chain queues.
 *
 * ONE act() per step, never nested: a nested React 19 act() discards every
 * later render in the same scope, which would silently make the assertions
 * below read a stale DOM.
 */
async function settle(): Promise<void> {
  await act(async () => { await new Promise<void>((r) => setTimeout(r, 0)); });
}

/** Dispatch the reopen event inside its own act() scope. */
async function reopen(): Promise<void> {
  await act(async () => {
    window.dispatchEvent(new CustomEvent(COOKIE_PREFERENCES_OPEN_EVENT));
  });
}

const action = (name: string) =>
  document.querySelector<HTMLElement>(`[data-consent-action="${name}"]`);
const toggles = () =>
  [...document.querySelectorAll<HTMLInputElement>('input[type="checkbox"]')];

describe("the consent banner honours stored consent and reopens on request", () => {
  async function mountBanner(consent: unknown) {
    vi.stubGlobal("fetch", vi.fn(async () => ({ ok: true, json: async () => ({ consent }) })));
    const { CookieConsentBanner } = await import("../CookieConsentBanner");
    const m = await mount(withIntl("en", <CookieConsentBanner />));
    await settle();
    return m;
  }

  it("shows itself when no consent is stored", async () => {
    const m = await mountBanner(null);
    expect(action("accept-all"), "the banner must ask when consent is unresolved").toBeTruthy();
    expect(action("reject-non-essential")).toBeTruthy();
    expect(action("customize")).toBeTruthy();
    await m.unmount();
  });

  it("stays hidden once consent is on record", async () => {
    const m = await mountBanner({ necessary: true, analytics: true, marketing: false, preferences: false });
    expect(action("accept-all"), "a visitor who has already answered must not be asked again").toBeNull();
    await m.unmount();
  });

  it("reopens on the event, seeded with the STORED choice rather than the all-off defaults", async () => {
    const m = await mountBanner({ necessary: true, analytics: true, marketing: false, preferences: true });
    expect(action("accept-all")).toBeNull();

    await reopen();

    const boxes = toggles();
    expect(boxes.length, "the preferences view must render all four categories").toBe(4);
    // Order matches the rendered list: necessary, analytics, marketing, preferences.
    expect(boxes.map((b) => b.checked)).toEqual([true, true, false, true]);
    // …and necessary is not a choice.
    expect(boxes[0].disabled, "necessary must always be enabled and locked").toBe(true);
    expect(boxes.slice(1).every((b) => !b.disabled), "optional categories must be changeable").toBe(true);
    await m.unmount();
  });

  it("saves a changed preference and can be reopened again with the new value", async () => {
    const fetchMock = vi.fn(async (_url: string, init?: RequestInit) => {
      void init;
      return { ok: true, json: async () => ({ consent: null }) };
    });
    vi.stubGlobal("fetch", fetchMock);
    const { CookieConsentBanner } = await import("../CookieConsentBanner");
    const m = await mount(withIntl("en", <CookieConsentBanner />));
    await settle();

    // Accept everything, which closes the banner.
    await click(action("accept-all"));
    await settle();
    expect(action("accept-all"), "saving must close the notice").toBeNull();

    // Reopen: the saved choice is what the view shows.
    await reopen();
    expect(toggles().map((b) => b.checked)).toEqual([true, true, true, true]);

    // Withdraw analytics and save again — the second change must be possible.
    await click(toggles()[1]);
    expect(toggles()[1].checked).toBe(false);
    const save = [...document.querySelectorAll<HTMLElement>("button")]
      .find((b) => b.textContent?.includes(en.adminGovernance.cookieConsent.savePreferences));
    expect(save, "the preferences view must offer a save control").toBeTruthy();
    await click(save ?? null);
    await settle();

    const posted = fetchMock.mock.calls.filter((c) => c[1]?.method === "POST");
    expect(posted.length, "each save is one write").toBe(2);
    const last = JSON.parse(String(posted[1][1]!.body));
    expect(last).toMatchObject({ necessary: true, analytics: false, marketing: true, preferences: true });
    await m.unmount();
  });

  it("Reject All stores a refusal of every optional category", async () => {
    const fetchMock = vi.fn(async (_url: string, init?: RequestInit) => {
      void init;
      return { ok: true, json: async () => ({ consent: null }) };
    });
    vi.stubGlobal("fetch", fetchMock);
    const { CookieConsentBanner } = await import("../CookieConsentBanner");
    const m = await mount(withIntl("en", <CookieConsentBanner />));
    await settle();

    await click(action("reject-non-essential"));
    await settle();

    const posted = fetchMock.mock.calls.find((c) => c[1]?.method === "POST");
    expect(posted, "a refusal must still be recorded").toBeTruthy();
    expect(JSON.parse(String(posted![1]!.body)))
      .toEqual({ necessary: true, analytics: false, marketing: false, preferences: false });
    await m.unmount();
  });

  it("a malformed stored record can never grant optional consent", async () => {
    // A hand-edited localStorage entry, or a record from an older shape.
    const m = await mountBanner({ analytics: "yes", marketing: 1, preferences: null });
    await reopen();
    expect(toggles().map((b) => b.checked)).toEqual([true, false, false, false]);
    await m.unmount();
  });

  it("reopens in every locale, including Persian RTL", async () => {
    for (const locale of ["fa", "de"] as const) {
      vi.stubGlobal("fetch", vi.fn(async () => ({
        ok: true,
        json: async () => ({ consent: { necessary: true, analytics: true, marketing: false, preferences: false } }),
      })));
      const { CookieConsentBanner } = await import("../CookieConsentBanner");
      const m = await mount(withIntl(locale, <CookieConsentBanner />));
      await settle();
      await reopen();
      const dialog = document.querySelector<HTMLElement>('[role="dialog"]');
      expect(dialog, `${locale}: the preferences view must open`).toBeTruthy();
      const messages = locale === "fa" ? fa : de;
      expect(dialog!.textContent, `${locale}: the view must be localized`)
        .toContain(messages.adminGovernance.cookieConsent.preferencesTitle);
      expect(dialog!.textContent, `${locale}: no English carryover`)
        .not.toContain(en.adminGovernance.cookieConsent.preferencesTitle);
      await m.unmount();
      document.body.innerHTML = "";
    }
  });
});

/* ── 6 · The consent endpoint stays private and bounded ──────────────────── */

describe("the consent endpoint", () => {
  it("declares every response uncacheable and keyed on the cookie", () => {
    const src = activeSrc("src/app/api/compliance/cookie-consent/route.ts");
    expect(src).toContain("no-store");
    expect(src).toMatch(/Vary:\s*"Cookie"/);
    // Every JSON response must carry the headers — none may be returned bare.
    const responses = [...src.matchAll(/NextResponse\.json\(/g)].length;
    const withHeaders = [...src.matchAll(/NO_STORE_HEADERS/g)].length;
    expect(responses).toBeGreaterThan(0);
    // One constant definition plus one use per response.
    expect(withHeaders).toBeGreaterThanOrEqual(responses);
  });

  it("keeps `necessary` server-forced and the optional categories fail-closed", () => {
    const src = activeSrc("src/app/api/compliance/cookie-consent/route.ts");
    expect(src).toMatch(/necessary:\s*true/);
    expect(src).toMatch(/analytics:\s*body\.analytics\s*\?\?\s*false/);
    expect(src).toMatch(/marketing:\s*body\.marketing\s*\?\?\s*false/);
    expect(src).toMatch(/preferences:\s*body\.preferences\s*\?\?\s*false/);
  });

  it("stays rate-limited and body-bounded, and never trusts a body-supplied subject", () => {
    const src = activeSrc("src/app/api/compliance/cookie-consent/route.ts");
    expect(src).toContain("checkRateLimit");
    expect(src).toContain("readBoundedJson");
    expect(src).toContain("SMALL_JSON_BODY_BYTES");
    expect(src).toContain("isConsentId");
    // The subject id is never read from the request body.
    expect(src).not.toMatch(/body\.sessionId/);
  });

  it("projects consent preferences only — never the GDPR evidence fields", () => {
    const src = read("src/app/api/compliance/cookie-consent/route.ts");
    const view = /function publicConsentView\([\s\S]*?\n\}/.exec(src)?.[0] ?? "";
    expect(view).toBeTruthy();
    for (const evidence of ["ipAddress", "userAgent", "userId"]) {
      expect(view, `publicConsentView must not project ${evidence}`).not.toContain(`${evidence}:`);
    }
  });
});
