import { describe, expect, it, vi } from "vitest";
import { CATALOGS, MEDIA_LOCALES, MEDIA_NAMESPACE } from "./_catalog";

/**
 * PHASE 102 / RELEASE BLOCKER 1 — the media tests read what the application
 * reads, in all three languages.
 *
 * WHY THIS IS NOT OBVIOUS
 * `_catalog.tsx` imports `../../../../messages/{fa,en,de}.json` directly, and
 * every media test resolves its copy through those imports. That is only sound
 * while the RUNTIME resolves the same files. `src/i18n/request.ts` builds its
 * path dynamically — `await import(\`../../messages/${locale}.json\`)` — so
 * nothing in the type system or the module graph connects the two. Point that
 * template at `messages/catalog/${locale}.json`, or let the locale validation
 * fall through to a different default, and every media test would go on passing
 * against files the browser never loads. That is the same class of bug as the
 * hand-written fixture this suite deleted, one level further down.
 *
 * So the real `getRequestConfig` handler is invoked here — the actual module
 * default export, with `next-intl/server` stubbed to hand the handler back
 * rather than register it — and its `messages` is compared against `CATALOGS`
 * for FA, EN and DE. One locale would not do: the loader takes the locale as a
 * parameter, and proving `de` says nothing about what `fa` resolves to.
 */

type Handler = (context: { requestLocale: Promise<string | undefined> }) => Promise<{
  locale: string;
  messages: Record<string, unknown>;
}>;

async function loadRequestConfig(): Promise<Handler> {
  vi.doMock("next-intl/server", () => ({
    // `getRequestConfig` is an identity wrapper in next-intl; stubbing it as one
    // hands back the very function `request.ts` passed in, with no framework
    // request context required.
    getRequestConfig: (handler: unknown) => handler,
  }));
  // Not named `module`: Next's no-assign-module-variable rule rejects that
  // identifier outright, and it would shadow the CommonJS global besides.
  const requestModule = await import("@/i18n/request");
  return requestModule.default as unknown as Handler;
}

describe("the runtime message loader and the test catalogs are the same files", () => {
  it.each(MEDIA_LOCALES)("%s resolves to exactly the catalog the tests read", async (locale) => {
    const handler = await loadRequestConfig();
    const config = await handler({ requestLocale: Promise.resolve(locale) });

    expect(config.locale).toBe(locale);
    // Deep equality over the WHOLE catalog, not just `mediaHub`: a loader that
    // dropped or merged namespaces would still satisfy a narrower check.
    expect(config.messages).toEqual(CATALOGS[locale]);
    expect(Object.keys(config.messages)).toEqual(Object.keys(CATALOGS[locale]));
    expect(config.messages[MEDIA_NAMESPACE]).toBeTypeOf("object");
  });

  it("distinguishes the locales rather than returning one catalog for all three", async () => {
    // Guards against the degenerate pass: if `request.ts` ignored its argument,
    // every assertion above would still hold for whichever locale happened to
    // match, and the other two would fail — but only if the catalogs differ.
    const handler = await loadRequestConfig();
    const rendered = await Promise.all(
      MEDIA_LOCALES.map(async (locale) => {
        const config = await handler({ requestLocale: Promise.resolve(locale) });
        return JSON.stringify(config.messages[MEDIA_NAMESPACE]);
      }),
    );
    expect(new Set(rendered).size).toBe(MEDIA_LOCALES.length);
  });

  it("falls back to the default locale instead of loading an attacker-supplied path", async () => {
    // The dynamic import interpolates the locale into a filesystem path, so the
    // validation in front of it is load-bearing, not cosmetic.
    const handler = await loadRequestConfig();
    const config = await handler({ requestLocale: Promise.resolve("../../etc/passwd") });
    expect(MEDIA_LOCALES).toContain(config.locale as (typeof MEDIA_LOCALES)[number]);
    expect(config.messages).toEqual(CATALOGS[config.locale as (typeof MEDIA_LOCALES)[number]]);
  });
});
