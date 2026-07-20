// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from "vitest";
import { readFileSync, readdirSync, existsSync, statSync } from "node:fs";
import { resolve, join } from "node:path";
import { createTranslator } from "next-intl";
import { mount } from "@/components/ds/__tests__/_render";
import en from "../../../../messages/en.json";
import fa from "../../../../messages/fa.json";
import de from "../../../../messages/de.json";
import { ACTIVE_LOCALES, DEFAULT_LOCALE, LOCALE_DIRECTION } from "@/i18n/locales";

/**
 * PHASE 89A.1 — localized unmatched-route completion.
 *
 * Covers: the [...unmatched] catch-all calls notFound() without rendering UI,
 * logging, or reading route segments; route-inventory preservation (the
 * catch-all is the ONLY catch-all and shadows nothing); and the not-found
 * boundary's explicit, allowlist-validated lang/dir semantics per locale.
 */

type Cat = typeof en;
const CATALOGS: Record<"fa" | "en" | "de", Cat> = { fa: fa as Cat, en: en as Cat, de: de as Cat };

const APP_DIR = resolve(process.cwd(), "src/app");
const LOCALE_DIR = join(APP_DIR, "[locale]");
const CATCH_ALL_DIR = join(LOCALE_DIR, "[...unmatched]");
const CATCH_ALL_PAGE = join(CATCH_ALL_DIR, "page.tsx");

// --- next/navigation seam: notFound must throw, like the real one ---
const NOT_FOUND_SENTINEL = new Error("NEXT_NOT_FOUND_SENTINEL");
const notFoundSpy = vi.hoisted(() => ({ calls: 0 }));
vi.mock("next/navigation", () => ({
  notFound: () => {
    notFoundSpy.calls += 1;
    throw NOT_FOUND_SENTINEL;
  },
}));

// --- getLocale/getTranslations seam for the server not-found component ---
const h = vi.hoisted(() => ({ locale: "en" as string }));
vi.mock("next-intl/server", () => ({
  getLocale: async () => h.locale,
  getTranslations: async ({ locale, namespace }: { locale: string; namespace: string }) =>
    createTranslator({
      locale,
      messages: CATALOGS[locale as "fa" | "en" | "de"] as never,
      namespace: namespace as never,
    }),
}));

afterEach(() => vi.restoreAllMocks());

describe("89A.1 — catch-all page behavior", () => {
  it("calls notFound() exactly once and throws — renders no UI at all", async () => {
    const { default: UnmatchedRoute } = await import("../[...unmatched]/page");
    const before = notFoundSpy.calls;
    let produced: unknown = "not-called";
    expect(() => {
      produced = UnmatchedRoute();
    }).toThrow(NOT_FOUND_SENTINEL);
    expect(notFoundSpy.calls - before, "notFound called exactly once").toBe(1);
    expect(produced, "no JSX may be produced before notFound throws").toBe("not-called");
  });

  it("logs nothing on any console channel while rendering", async () => {
    const spies = (["log", "error", "warn", "info", "debug"] as const).map((m) =>
      vi.spyOn(console, m).mockImplementation(() => {}),
    );
    const { default: UnmatchedRoute } = await import("../[...unmatched]/page");
    expect(() => UnmatchedRoute()).toThrow(NOT_FOUND_SENTINEL);
    for (const spy of spies) expect(spy, `console.${spy.getMockName()}`).not.toHaveBeenCalled();
  });

  it("source: declares no params, reads no segments, imports only next/navigation", () => {
    const src = readFileSync(CATCH_ALL_PAGE, "utf8");
    const code = src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/[^\n]*/g, "");

    // no route-segment access, no logging, no browser globals, no client directive
    expect(code).not.toMatch(/\bparams\b|\bsearchParams\b|\bpathname\b|\bheaders\b|\bcookies\b/);
    expect(code).not.toMatch(/console\./);
    expect(code).not.toMatch(/\b(?:window|document|navigator|location)\s*\./);
    expect(code).not.toMatch(/use client/);
    expect(code).not.toMatch(/suppressHydrationWarning/);
    expect(code).not.toMatch(/redirect\(/);

    // exactly one import, and it is notFound from next/navigation
    const imports = [...code.matchAll(/^import\s.+$/gm)].map((m) => m[0]);
    expect(imports).toEqual([`import { notFound } from "next/navigation";`]);
    expect(code).toMatch(/notFound\(\);/);
  });
});

describe("89A.1 — route inventory preservation", () => {
  /** All directories under `root` whose name marks a catch-all segment. */
  function findCatchAlls(root: string): string[] {
    const out: string[] = [];
    for (const entry of readdirSync(root)) {
      const p = join(root, entry);
      if (!statSync(p).isDirectory() || entry === "node_modules") continue;
      if (entry.startsWith("[...") || entry.startsWith("[[...")) out.push(p);
      out.push(...findCatchAlls(p));
    }
    return out;
  }

  it("[...unmatched] is the ONLY catch-all in the whole app tree", () => {
    const catchAlls = findCatchAlls(APP_DIR);
    expect(catchAlls).toEqual([CATCH_ALL_DIR]);
    // page only — no layout/route/loading that could alter boundary resolution
    expect(readdirSync(CATCH_ALL_DIR)).toEqual(["page.tsx"]);
  });

  it("no single dynamic segment sits directly under [locale] (nothing to shadow)", () => {
    const dynamicSiblings = readdirSync(LOCALE_DIR).filter(
      (d) => d.startsWith("[") && d !== "[...unmatched]",
    );
    expect(dynamicSiblings, "a dynamic sibling would change precedence").toEqual([]);
  });

  it("existing valid routes are still present", () => {
    for (const route of [
      "page.tsx",
      "not-found.tsx",
      "error.tsx",
      "layout.tsx",
      "login/page.tsx",
      "dashboard/page.tsx",
      "library/page.tsx",
      "library/cases/[id]/page.tsx",
      "library/vendor/[vendor]/page.tsx",
      "vendors/[vendorId]/page.tsx",
      "articles/[slug]/page.tsx",
      "careers/[jobId]/page.tsx",
    ]) {
      expect(existsSync(join(LOCALE_DIR, route)), `missing: [locale]/${route}`).toBe(true);
    }
  });
});

describe("89A.1 — not-found explicit lang/dir semantics", () => {
  const cases = [
    ["fa", "fa", "rtl"],
    ["en", "en", "ltr"],
    ["de", "de", "ltr"],
  ] as const;

  it.each(cases)("%s: root container carries lang=%s dir=%s, one h1", async (loc, lang, dir) => {
    h.locale = loc;
    const { default: NotFound } = await import("../not-found");
    const { container, unmount } = await mount(await NotFound());

    const rootEl = container.querySelector("[lang]");
    expect(rootEl, "outermost content container declares lang").toBeTruthy();
    expect(rootEl!.getAttribute("lang")).toBe(lang);
    expect(rootEl!.getAttribute("dir")).toBe(dir);
    expect(container.querySelectorAll("h1").length, "exactly one h1").toBe(1);

    const t = createTranslator({
      locale: loc,
      messages: CATALOGS[loc] as never,
      namespace: "errors" as never,
    }) as unknown as (k: string) => string;
    expect(container.querySelector("h1")!.textContent).toContain(t("notFound.title"));
    expect(container.textContent).toContain(t("notFound.body"));
    const home = Array.from(container.querySelectorAll("a")).find(
      (a) => a.getAttribute("href") === `/${loc}`,
    );
    expect(home, "localized home action present").toBeTruthy();
    await unmount();
  });

  it("unknown locale fails safely to DEFAULT_LOCALE with its direction", async () => {
    h.locale = "xx";
    const { default: NotFound } = await import("../not-found");
    const { container, unmount } = await mount(await NotFound());

    const rootEl = container.querySelector("[lang]");
    expect(rootEl!.getAttribute("lang")).toBe(DEFAULT_LOCALE);
    expect(rootEl!.getAttribute("dir")).toBe(LOCALE_DIRECTION[DEFAULT_LOCALE]);
    // and the copy is the default locale's, not English fallback text
    expect(container.textContent).toContain(
      (CATALOGS[DEFAULT_LOCALE].errors as { notFound: { title: string } }).notFound.title,
    );
    await unmount();
  });

  it("no raw unmatched pathname can appear: rendered text is catalog-only", async () => {
    h.locale = "en";
    const { default: NotFound } = await import("../not-found");
    const { container, unmount } = await mount(await NotFound());
    // nothing that looks like a path or route segment is rendered
    expect(container.textContent).not.toMatch(/phase89a|\/[a-z]+\/[a-z-]+\/|\[\.\.\./);
    await unmount();
  });

  it("source: no browser globals, no client effect, no suppressHydrationWarning", () => {
    const src = readFileSync(join(LOCALE_DIR, "not-found.tsx"), "utf8");
    const code = src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/[^\n]*/g, "");
    expect(code).not.toMatch(/\b(?:window|document|navigator|localStorage)\s*\./);
    expect(code).not.toMatch(/suppressHydrationWarning/);
    expect(code).not.toMatch(/use client|useEffect|useLayoutEffect/);
    expect(code).not.toMatch(/console\./);
    // locale policy comes from the central source, not re-declared literals
    expect(code).toMatch(/isActiveLocale/);
    expect(code).toMatch(/LOCALE_DIRECTION/);
    expect(code).toMatch(/DEFAULT_LOCALE/);
  });
});

describe("89A.1 — catalog parity stays exact", () => {
  const paths = (o: unknown, p = ""): string[] =>
    o !== null && typeof o === "object"
      ? Object.entries(o as Record<string, unknown>).flatMap(([k, v]) => paths(v, p ? `${p}.${k}` : k))
      : [p];

  it("errors namespace key paths remain identical across fa/en/de", () => {
    const ke = paths((en as Cat).errors).sort();
    expect(ke.length).toBeGreaterThan(0);
    expect(paths((fa as Cat).errors).sort()).toEqual(ke);
    expect(paths((de as Cat).errors).sort()).toEqual(ke);
  });

  it("every ACTIVE locale has a direction mapping", () => {
    for (const loc of ACTIVE_LOCALES) {
      expect(LOCALE_DIRECTION[loc]).toMatch(/^(rtl|ltr)$/);
    }
  });
});
