// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from "vitest";
import { act } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { hydrateRoot, type Root } from "react-dom/client";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { click } from "@/components/ds/__tests__/_render";

/**
 * PHASE 89A AMENDMENT — global-error hydration determinism (client half).
 *
 * DELIBERATELY A SEPARATE FILE. These tests hydrate the whole `document`, which
 * is the only React root arrangement in which event delegation reaches the
 * <body> that global-error owns. React marks a document as "already listening"
 * the first time ANY root is created under it, and `document.open()` wipes the
 * DOM without clearing that marker — so if a `mount()`-based test ran earlier in
 * the same file, `hydrateRoot(document, …)` would silently attach no listeners
 * and retry clicks would appear dead. Vitest gives every test FILE a fresh jsdom
 * document, so isolating this suite keeps the click assertions honest.
 *
 * The SSR half lives in global-error-ssr.test.tsx (node environment, no window
 * at all); the not-found / error-boundary suites live in localized-boundaries.
 */

describe("89A — global-error hydration determinism (amendment)", () => {
  // global-error owns <html>/<body>; React 19 hoists those onto the real
  // document, so post-mount state is asserted from document.documentElement and
  // document.body rather than from the mount container.
  //
  // The contract under test: the server pass and the FIRST client pass are
  // byte-identical English, the URL is consulted only after mount, and no
  // suppressHydrationWarning papers over a mismatch.

  const SENSITIVE = Object.assign(
    new Error("SENSITIVE_DB_CONNECTION_STRING at /srv/app/pool.ts:42"),
    { digest: "abc123secret", cause: new Error("INNER_CAUSE_SECRET") },
  );

  /** window.location spy that COUNTS reads, so "was it touched?" is provable. */
  function trapLocation(pathname: string) {
    let reads = 0;
    const spy = vi.spyOn(window, "location", "get").mockImplementation(() => {
      reads += 1;
      return { pathname } as Location;
    });
    return { reads: () => reads, restore: () => spy.mockRestore() };
  }

  /**
   * Reproduce the real production sequence: server-render the boundary, install
   * that markup as the document, then hydrate it — exactly what Next.js does when
   * the root layout throws. Hydrating `document` (rather than mounting into a
   * detached container) is also what makes React's event delegation reach the
   * hoisted <body>, so retry clicks are genuinely exercised.
   */
  async function hydrateAt(pathname: string, reset: () => void) {
    const { default: GlobalError } = await import("../../global-error");
    const trap = trapLocation(pathname);

    const serverHtml = renderToStaticMarkup(<GlobalError error={SENSITIVE} reset={reset} />);
    const serverPassReads = trap.reads();

    document.open();
    document.write(`<!doctype html>${serverHtml}`);
    document.close();
    const langBeforeHydration = document.documentElement.lang;

    // React reports any hydration mismatch through console.error — capture it.
    const consoleErrors: string[] = [];
    const errSpy = vi.spyOn(console, "error").mockImplementation((...args: unknown[]) => {
      consoleErrors.push(args.map(String).join(" "));
    });

    let root!: Root;
    await act(async () => {
      root = hydrateRoot(document, <GlobalError error={SENSITIVE} reset={reset} />);
    });
    errSpy.mockRestore();

    return {
      serverHtml,
      serverPassReads,
      langBeforeHydration,
      consoleErrors,
      teardown: async () => {
        await act(async () => root.unmount());
        trap.restore();
      },
    };
  }

  beforeEach(() => {
    // Reset the hoisted <html> attributes so no assertion can pass on a
    // previous test's leftovers.
    document.documentElement.removeAttribute("lang");
    document.documentElement.removeAttribute("dir");
  });

  it("initial render reads no browser global and is identical for every URL", async () => {
    const { default: GlobalError } = await import("../../global-error");
    const markups: string[] = [];

    for (const pathname of ["/de/x", "/fa/x", "/en/x", "/xx/x", "/", "/dashboard/cases"]) {
      const trap = trapLocation(pathname);
      const reset = vi.fn();
      markups.push(renderToStaticMarkup(<GlobalError error={SENSITIVE} reset={reset} />));
      expect(trap.reads(), `window.location was read during the initial render for ${pathname}`).toBe(0);
      expect(reset, "reset must not be invoked during render").not.toHaveBeenCalled();
      trap.restore();
    }

    expect(new Set(markups).size, "initial markup must not vary with the URL").toBe(1);
    expect(markups[0]).toContain('lang="en"');
    expect(markups[0]).toContain('dir="ltr"');
    expect(markups[0]).toContain("Something went wrong");
    expect(markups[0]).not.toContain("Etwas ist schiefgelaufen");
    expect(markups[0]).not.toContain("مشکلی پیش آمد");
  });

  it("hydrates the English server markup with no React mismatch", async () => {
    const reset = vi.fn();
    // A Persian URL is in place the whole time — yet the server pass and the
    // hydration pass must still agree on English.
    const h = await hydrateAt("/fa/anything", reset);

    expect(h.serverPassReads, "the server pass must not read window.location").toBe(0);
    expect(h.serverHtml).toContain('lang="en"');
    expect(h.langBeforeHydration, "document starts on the English fallback").toBe("en");
    expect(
      h.consoleErrors.filter((m) => /hydrat|did not match|mismatch/i.test(m)),
      "hydration must produce no mismatch warning",
    ).toEqual([]);
    expect(h.consoleErrors, "hydration must produce no console errors at all").toEqual([]);
    expect(reset, "hydration must not trigger reset").not.toHaveBeenCalled();

    await h.teardown();
  });

  it("German URL switches the emergency UI to German after mount", async () => {
    const h = await hydrateAt("/de/dashboard/cases", vi.fn());

    expect(h.langBeforeHydration, "server pass was English").toBe("en");
    expect(document.documentElement.lang).toBe("de");
    expect(document.documentElement.dir).toBe("ltr");
    expect(document.body.textContent).toContain("Etwas ist schiefgelaufen");
    expect(document.body.textContent).toContain("Erneut versuchen");
    expect(document.body.textContent).not.toContain("Something went wrong");
    expect(document.querySelector('a[href="/de"]'), "home link points at the German root").toBeTruthy();

    await h.teardown();
  });

  it("Persian URL switches lang, dir and content after mount", async () => {
    const h = await hydrateAt("/fa/library/article", vi.fn());

    expect(h.langBeforeHydration).toBe("en");
    expect(document.documentElement.lang).toBe("fa");
    expect(document.documentElement.dir).toBe("rtl");
    expect(document.body.textContent).toContain("مشکلی پیش آمد");
    expect(document.body.textContent).not.toContain("Something went wrong");
    expect(document.querySelector('a[href="/fa"]')).toBeTruthy();

    await h.teardown();
  });

  it.each([
    ["/xx/x", "unsupported segment"],
    ["/", "empty path"],
    ["/dashboard/cases", "unprefixed app path"],
    ["/EN/x", "wrong case"],
    ["/constructor/x", "prototype-chain segment"],
    ["/__proto__/x", "prototype-pollution segment"],
  ])("unknown or malformed locale %s (%s) stays English after mount", async (pathname) => {
    const h = await hydrateAt(pathname, vi.fn());

    expect(document.documentElement.lang).toBe("en");
    expect(document.documentElement.dir).toBe("ltr");
    expect(document.body.textContent).toContain("Something went wrong");
    expect(document.querySelector('a[href="/en"]')).toBeTruthy();
    expect(h.consoleErrors).toEqual([]);

    await h.teardown();
  });

  it("reset is never called during render or hydration, and retry calls it exactly once", async () => {
    const reset = vi.fn();
    const h = await hydrateAt("/en/x", reset);

    expect(reset, "rendering and hydrating must not trigger reset (infinite-loop guard)").not.toHaveBeenCalled();

    const retry = Array.from(document.querySelectorAll("button")).find((b) =>
      b.textContent?.includes("Try again"),
    );
    expect(retry, "retry button present").toBeTruthy();
    await click(retry!);
    expect(reset).toHaveBeenCalledTimes(1);

    await h.teardown();
  });

  it("the hydrated emergency DOM discloses no message, stack, cause or digest", async () => {
    const h = await hydrateAt("/de/x", vi.fn());

    const markup = document.documentElement.outerHTML;
    for (const secret of [
      "SENSITIVE_DB_CONNECTION_STRING",
      "pool.ts:42",
      "abc123secret",
      "INNER_CAUSE_SECRET",
    ]) {
      expect(markup, `"${secret}" must never reach the DOM`).not.toContain(secret);
    }
    expect(markup).not.toMatch(/digest|node_modules|at\s+Object\./);
    expect(h.serverHtml).not.toContain("SENSITIVE_DB_CONNECTION_STRING");

    await h.teardown();
  });

  it("the code uses no suppressHydrationWarning and touches browser globals only inside the effect", () => {
    const raw = readFileSync(resolve(process.cwd(), "src/app/global-error.tsx"), "utf8");
    // Assert about CODE, not prose: the doc comment legitimately explains why
    // suppressHydrationWarning is unnecessary, so comments are stripped first.
    const code = raw.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/[^\n]*/g, "");

    expect(code, "suppressHydrationWarning must not be reintroduced").not.toMatch(
      /suppressHydrationWarning/,
    );

    // Every browser-global access must sit inside the single post-mount effect.
    const start = code.indexOf("useEffect(");
    const end = code.indexOf("}, []);");
    expect(start, "a useEffect must exist").toBeGreaterThan(-1);
    expect(end, "the effect must close with an empty dependency array").toBeGreaterThan(start);

    const hits = [...code.matchAll(/\b(?:window|document|navigator|localStorage|sessionStorage)\s*\./g)];
    expect(hits.length, "exactly one browser-global access, inside the effect").toBe(1);
    for (const hit of hits) {
      const at = hit.index ?? -1;
      expect(at, `"${hit[0]}" must sit after the effect opens`).toBeGreaterThan(start);
      expect(at, `"${hit[0]}" must sit before the effect closes`).toBeLessThan(end);
    }
  });
});
