// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from "vitest";
import { NextIntlClientProvider, createTranslator } from "next-intl";
import { mount, click } from "@/components/ds/__tests__/_render";
import en from "../../../../messages/en.json";
import fa from "../../../../messages/fa.json";
import de from "../../../../messages/de.json";

/**
 * PHASE 89A — localized runtime boundaries (not-found / error).
 *
 * Covers: localized rendering in fa/en/de, single-h1 heading, accessible
 * action names, reset/retry behavior, information-disclosure (no error details),
 * and errors-namespace parity.
 *
 * global-error is covered by its own two files — global-error-ssr.test.tsx
 * (node environment) and global-error-hydration.test.tsx (jsdom) — because it
 * owns <html>/<body> and must be hydrated as a whole document.
 */

type Cat = typeof en;
const CATALOGS: Record<"fa" | "en" | "de", Cat> = { fa: fa as Cat, en: en as Cat, de: de as Cat };

// --- getLocale/getTranslations seam for the server not-found component ---
const h = vi.hoisted(() => ({ locale: "en" as "fa" | "en" | "de" }));
vi.mock("next-intl/server", () => ({
  getLocale: async () => h.locale,
  getTranslations: async ({ locale, namespace }: { locale: string; namespace: string }) =>
    createTranslator({ locale, messages: CATALOGS[locale as "fa" | "en" | "de"] as never, namespace: namespace as never }),
}));

afterEach(() => vi.restoreAllMocks());

function withIntl(locale: "fa" | "en" | "de", ui: React.ReactNode) {
  return (
    <NextIntlClientProvider locale={locale} messages={CATALOGS[locale] as never} timeZone="UTC">
      <div dir={locale === "fa" ? "rtl" : "ltr"}>{ui}</div>
    </NextIntlClientProvider>
  );
}

describe("89A — errors namespace parity", () => {
  const paths = (o: unknown, p = ""): string[] =>
    o !== null && typeof o === "object"
      ? Object.entries(o as Record<string, unknown>).flatMap(([k, v]) => paths(v, p ? `${p}.${k}` : k))
      : [p];

  it("errors exists in all three catalogs with identical key paths", () => {
    const ke = paths((en as Cat).errors).sort();
    expect(ke.length).toBeGreaterThan(0);
    expect(paths((fa as Cat).errors).sort()).toEqual(ke);
    expect(paths((de as Cat).errors).sort()).toEqual(ke);
  });

  it("no errors leaf is empty and German is genuinely translated (de !== en)", () => {
    const get = (o: unknown, p: string) => p.split(".").reduce((x: unknown, k) => (x as Record<string, unknown>)[k], o);
    for (const p of paths((en as Cat).errors)) {
      expect(String(get((de as Cat).errors, p)).trim()).not.toBe("");
      expect(get((de as Cat).errors, p)).not.toBe(get((en as Cat).errors, p));
    }
  });
});

describe("89A — localized not-found renders per locale", () => {
  it.each(["fa", "en", "de"] as const)("%s: localized title/body/home, exactly one h1, no internals", async (loc) => {
    h.locale = loc;
    const { default: NotFound } = await import("../not-found");
    const jsx = await NotFound();
    const { container, unmount } = await mount(withIntl(loc, jsx));
    const t = createTranslator({ locale: loc, messages: CATALOGS[loc] as never, namespace: "errors" as never }) as unknown as (k: string) => string;

    expect(container.querySelectorAll("h1").length, "exactly one h1").toBe(1);
    expect(container.querySelector("h1")!.textContent).toContain(t("notFound.title"));
    expect(container.textContent).toContain(t("notFound.body"));
    // home action points at the locale root and is keyboard-reachable (real <a href>)
    const home = Array.from(container.querySelectorAll("a")).find((a) => a.textContent?.includes(t("notFound.home")));
    expect(home, "localized home link present").toBeTruthy();
    expect(home!.getAttribute("href")).toBe(`/${loc}`);
    // no route internals / stack leaked
    expect(container.textContent).not.toMatch(/at\s+\/|stack|Error:|\.tsx|node_modules/);
    await unmount();
  });

  it("German shows the German wording, never the English fallback", async () => {
    h.locale = "de";
    const { default: NotFound } = await import("../not-found");
    const { container, unmount } = await mount(withIntl("de", await NotFound()));
    expect(container.textContent).toContain("Seite nicht gefunden");
    expect(container.textContent).not.toContain("Page not found");
    await unmount();
  });
});

describe("89A — localized error boundary", () => {
  const boom = Object.assign(new Error("SENSITIVE_DB_CONNECTION_STRING at pool.ts:42"), { digest: "abc123secret" });

  it.each(["fa", "en", "de"] as const)("%s: localized content, retry calls reset, home present", async (loc) => {
    const reset = vi.fn();
    const { default: ErrorBoundary } = await import("../error");
    const { container, unmount } = await mount(withIntl(loc, <ErrorBoundary error={boom} reset={reset} />));
    const t = createTranslator({ locale: loc, messages: CATALOGS[loc] as never, namespace: "errors" as never }) as unknown as (k: string) => string;

    expect(container.querySelectorAll("h1").length).toBe(1);
    expect(container.querySelector("h1")!.textContent).toContain(t("error.title"));
    expect(container.textContent).toContain(t("error.body"));

    const retry = Array.from(container.querySelectorAll("button")).find((b) => b.textContent?.includes(t("error.retry")));
    expect(retry, "retry button present").toBeTruthy();
    await click(retry!);
    expect(reset).toHaveBeenCalledTimes(1);

    const home = Array.from(container.querySelectorAll("a")).find((a) => a.getAttribute("href") === `/${loc}`);
    expect(home, "home link present").toBeTruthy();
    await unmount();
  });

  it("NEVER renders error.message, stack, cause or digest (information disclosure)", async () => {
    const { default: ErrorBoundary } = await import("../error");
    const { container, unmount } = await mount(withIntl("en", <ErrorBoundary error={boom} reset={vi.fn()} />));
    expect(container.textContent).not.toContain("SENSITIVE_DB_CONNECTION_STRING");
    expect(container.textContent).not.toContain("pool.ts:42");
    expect(container.textContent).not.toContain("abc123secret");
    await unmount();
  });
});
