// @vitest-environment node
import { describe, it, expect, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import GlobalError from "../../global-error";

/**
 * PHASE 89A AMENDMENT — global-error server-render safety.
 *
 * This file deliberately runs in the `node` environment (the repository default)
 * rather than jsdom: there is genuinely NO `window` and NO `document` here, so a
 * component that touched a browser global during its initial render would throw
 * a ReferenceError instead of silently succeeding against a jsdom stub. That is
 * the point of the file — it is the SSR half of the hydration-determinism proof
 * whose client half lives in localized-boundaries.test.tsx.
 */

const SENSITIVE = Object.assign(
  new Error("SENSITIVE_DB_CONNECTION_STRING at /srv/app/pool.ts:42"),
  { digest: "abc123secret", cause: new Error("INNER_CAUSE_SECRET") },
);

describe("89A — global-error renders on the server with no browser globals", () => {
  it("the test environment really has no window and no document", () => {
    expect(typeof window, "window must not exist in this environment").toBe("undefined");
    expect(typeof document, "document must not exist in this environment").toBe("undefined");
  });

  it("server-renders without throwing when no browser global exists", () => {
    const reset = vi.fn();
    expect(() => renderToStaticMarkup(<GlobalError error={SENSITIVE} reset={reset} />)).not.toThrow();
    // rendering must never trigger reset — that would be an infinite error loop
    expect(reset).not.toHaveBeenCalled();
  });

  it("server markup is the deterministic English fallback (lang=en, dir=ltr)", () => {
    const html = renderToStaticMarkup(<GlobalError error={SENSITIVE} reset={vi.fn()} />);
    expect(html).toContain('lang="en"');
    expect(html).toContain('dir="ltr"');
    expect(html).toContain("Something went wrong");
    expect(html).toContain("A critical error occurred. Please try again.");
    expect(html).toContain("Try again");
    expect(html).toContain('href="/en"');
    expect((html.match(/<h1/g) ?? []).length, "exactly one h1").toBe(1);
    // never the other locales on the server pass
    expect(html).not.toContain("Etwas ist schiefgelaufen");
    expect(html).not.toContain("مشکلی پیش آمد");
    expect(html).not.toContain('dir="rtl"');
  });

  it("server markup is byte-stable across repeated renders", () => {
    const a = renderToStaticMarkup(<GlobalError error={SENSITIVE} reset={vi.fn()} />);
    const b = renderToStaticMarkup(<GlobalError error={new Error("different")} reset={vi.fn()} />);
    expect(a, "markup must not depend on the error instance").toBe(b);
  });

  it("server markup discloses no error message, stack, cause or digest", () => {
    const html = renderToStaticMarkup(<GlobalError error={SENSITIVE} reset={vi.fn()} />);
    expect(html).not.toContain("SENSITIVE_DB_CONNECTION_STRING");
    expect(html).not.toContain("pool.ts:42");
    expect(html).not.toContain("abc123secret");
    expect(html).not.toContain("INNER_CAUSE_SECRET");
    expect(html).not.toMatch(/digest|node_modules|\.tsx|at\s+Object\./);
  });
});
