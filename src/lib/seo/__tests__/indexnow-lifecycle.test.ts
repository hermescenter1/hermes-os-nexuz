import { describe, expect, it, vi, afterEach } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { submitIndexNow, articlePaths, isSubmittablePath } from "../indexnow-lifecycle";

/**
 * PHASE 87L.6 FINAL AMENDMENT — IndexNow publication lifecycle. The notifier
 * must be inert in tests, submit only canonical same-host PUBLIC URLs, never
 * fabricate a German URL for content that has no German version, and never
 * let a submission failure surface to the publication path.
 */

const read = (rel: string) => readFileSync(join(process.cwd(), rel), "utf8");

afterEach(() => {
  vi.unstubAllGlobals();
  delete process.env.INDEXNOW_KEY;
  delete process.env.INDEXNOW_ENABLED;
});

describe("path safety", () => {
  it("accepts only public article/author paths under an active locale", () => {
    expect(isSubmittablePath("/fa/articles/pump-bearing-case")).toBe(true);
    expect(isSubmittablePath("/en/articles/x")).toBe(true);
    // the REAL author route (verified page file): /{locale}/articles/author/{handle}
    expect(isSubmittablePath("/de/articles/author/hamid")).toBe(true);
    expect(isSubmittablePath("/de/authors/hamid")).toBe(false); // no such route
  });

  it("rejects private, API, foreign, query and fragment paths", () => {
    for (const bad of [
      "/fa/dashboard/copilot", "/api/articles", "/fa/crm", "/en/erp/projects",
      "/fa/admin/leads", "/en/auth/login", "/fa/articles/x?draft=1",
      "/fa/articles/x#s", "https://evil.example/fa/articles/x", "fa/articles/x",
      "/fa/library/plc", "/fa/candidate/register",
    ]) {
      expect(isSubmittablePath(bad), bad).toBe(false);
    }
  });
});

describe("articlePaths — language-true canonical only", () => {
  it("submits the article under its OWN language", () => {
    expect(articlePaths("bearing-case", "FA")).toEqual(["/fa/articles/bearing-case"]);
    expect(articlePaths("bearing-case", "EN")).toEqual(["/en/articles/bearing-case"]);
  });

  it("never fabricates a German URL — ArtLanguage has no DE today", () => {
    // if a future migration adds DE articles this starts working automatically
    // (de is an active locale), but no existing EN/FA article maps to /de/
    for (const lang of ["FA", "EN"]) {
      expect(articlePaths("s", lang).some((p) => p.startsWith("/de/"))).toBe(false);
    }
    expect(read("src/lib/articles/types.ts")).toContain('ArtLanguage = "EN" | "FA"');
  });

  it("drops unknown languages and unsafe slugs instead of guessing", () => {
    expect(articlePaths("s", "RU")).toEqual([]);
    expect(articlePaths("", "FA")).toEqual([]);
    expect(articlePaths("a b?x", "FA")).toEqual([]);
  });
});

describe("submitIndexNow — inert in tests, bounded, dedup, non-throwing", () => {
  it("is hard-disabled under NODE_ENV=test even with a key configured", async () => {
    process.env.INDEXNOW_KEY = "k-123";
    const spy = vi.fn();
    vi.stubGlobal("fetch", spy);
    expect(await submitIndexNow(["/fa/articles/x"])).toBe(0);
    expect(spy).not.toHaveBeenCalled();
  });

  it("source contract: dedup, MAX_BATCH bound, 5s abort, catch-all, no key in logs", () => {
    const src = read("src/lib/seo/indexnow-lifecycle.ts");
    expect(src).toContain("new Set(");
    expect(src).toContain(".slice(0, MAX_BATCH)");
    expect(src).toContain("AbortController");
    expect(src).toContain('process.env.NODE_ENV === "test"');
    expect(src).toContain('INDEXNOW_ENABLED !== "true"');
    // the only log line carries counts and status, never the key or body
    expect(src).not.toMatch(/console\.\w+\([^)]*key/i);
    expect(src).toContain("keyLocation: `${BASE_URL}/indexnow-key.txt`");
  });

  it("the publish hook fires AFTER the transaction and is fire-and-forget", () => {
    const route = read("src/app/api/articles/review/[id]/approve/route.ts");
    const txEnd = route.indexOf("return NextResponse.json({ error: \"Internal error during approval.\"");
    const hook = route.indexOf("notifyArticleLifecycle(slug,");
    expect(hook).toBeGreaterThan(txEnd); // after the failure return → after commit
    expect(route).not.toMatch(/await\s+notifyArticleLifecycle/);
  });

  it("no unpublish/delete endpoint exists for published articles — NOT IMPLEMENTED by product contract", () => {
    // the [id] route is read-only; removal flows would hook the same helper
    const idRoute = read("src/app/api/articles/[id]/route.ts");
    expect(idRoute).not.toMatch(/export async function (DELETE|PATCH|PUT)/);
  });
});
