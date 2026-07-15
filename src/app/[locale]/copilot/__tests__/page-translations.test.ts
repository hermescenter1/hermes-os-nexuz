/**
 * Phase 86C4B2B1D-SECURITY-6A — Public Copilot translation-leaf guard.
 *
 * Production regression: fresh /fa/copilot and /en/copilot requests threw the
 * next-intl v4 runtime error `INSUFFICIENT_PATH`. Root cause: CopilotClient
 * called `t("confidence")` for a heading, but `copilot.confidence` is an
 * OBJECT ({HIGH, MEDIUM, LOW}) — next-intl v4 throws when a translation call
 * resolves to a namespace object instead of a string leaf. The fix adds the
 * string leaf `copilot.confidenceTitle` and points the two heading calls at
 * it, leaving the `confidence` object intact.
 *
 * This suite locks the contract WITHOUT rendering the client component: it
 * resolves every translation path the Copilot page + CopilotClient read on a
 * fresh (result-less) render exactly as next-intl does — throwing
 * INSUFFICIENT_PATH when a path lands on an object — and proves each is a
 * string leaf in both active locales, that generateMetadata's paths resolve,
 * and that the SECURITY-6 API boundary is untouched. Offline, no rendering,
 * no network.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import fs from "node:fs";
import path from "node:path";
import en from "../../../../../messages/en.json";
import fa from "../../../../../messages/fa.json";
import { mockNoUser, unmockAuth } from "@/test/mock-auth";

const CATALOGS = { en, fa } as const;
type Locale = keyof typeof CATALOGS;
const LOCALES: Locale[] = ["fa", "en"];

/**
 * Resolve a dotted message path the way next-intl v4 does: a path that lands
 * on an object (namespace) is an error (`INSUFFICIENT_PATH`), a missing path
 * is `MISSING_MESSAGE`, and only a string is a valid leaf.
 */
function resolveLeaf(root: unknown, dottedPath: string): string {
  const segments = dottedPath.split(".");
  let node: unknown = root;
  for (const seg of segments) {
    if (node === null || typeof node !== "object") {
      throw new Error(`MISSING_MESSAGE: ${dottedPath}`);
    }
    node = (node as Record<string, unknown>)[seg];
  }
  if (node === undefined) throw new Error(`MISSING_MESSAGE: ${dottedPath}`);
  if (typeof node === "object") throw new Error(`INSUFFICIENT_PATH: ${dottedPath}`);
  return String(node);
}

// Every `copilot.*` leaf the page + CopilotClient read on a fresh render
// (result === null, brainData === null) — i.e. before any analysis.
const COPILOT_FRESH_LEAVES = [
  "copilot.eyebrow",
  "copilot.title",
  "copilot.lede",
  "copilot.placeholder",
  "copilot.analyze",
  "copilot.analyzing",
  "copilot.emptyHint",
  "copilot.unknownNote",
  "copilot.approvalNote",
  "copilot.confidenceTitle",
  "copilot.safetyTitle",
  "copilot.safetyReadOnly",
  "copilot.safetyDeterministic",
  "copilot.safetyNoLLM",
] as const;

describe("public Copilot — translation leaves resolve without INSUFFICIENT_PATH", () => {
  for (const locale of LOCALES) {
    it(`/${locale}/copilot: every fresh-render copilot leaf is a non-empty string`, () => {
      for (const leafPath of COPILOT_FRESH_LEAVES) {
        const value = resolveLeaf(CATALOGS[locale], leafPath);
        expect(value.length, `${locale} ${leafPath}`).toBeGreaterThan(0);
      }
    });
  }

  it("the former bug reproduces: t(\"confidence\") on the namespace object throws INSUFFICIENT_PATH", () => {
    for (const locale of LOCALES) {
      expect(() => resolveLeaf(CATALOGS[locale], "copilot.confidence")).toThrow(
        /INSUFFICIENT_PATH/,
      );
    }
  });

  it("the confidence object is preserved (its HIGH/MEDIUM/LOW leaves still resolve)", () => {
    for (const locale of LOCALES) {
      for (const tier of ["HIGH", "MEDIUM", "LOW"]) {
        expect(resolveLeaf(CATALOGS[locale], `copilot.confidence.${tier}`).length).toBeGreaterThan(0);
      }
    }
  });
});

describe("public Copilot — source no longer calls t(\"confidence\") as a leaf", () => {
  const source = fs.readFileSync(
    path.join(process.cwd(), "src", "components", "copilot", "CopilotClient.tsx"),
    "utf8",
  );

  it("CopilotClient uses t(\"confidenceTitle\") and not the bare object path", () => {
    expect(source).toContain('t("confidenceTitle")');
    expect(source).not.toContain('t("confidence")');
  });
});

describe("public Copilot — generateMetadata paths resolve for both locales", () => {
  for (const locale of LOCALES) {
    it(`/${locale}/copilot: meta.pages.copilot title/description/keywords are strings`, () => {
      for (const field of ["title", "description", "keywords"]) {
        const value = resolveLeaf(CATALOGS[locale], `meta.pages.copilot.${field}`);
        expect(value.length, `${locale} meta.pages.copilot.${field}`).toBeGreaterThan(0);
      }
    });
  }
});

// ── SECURITY-6 regression: the boundary this phase must not disturb ──────────

describe("SECURITY-6 boundary remains intact after the copilot fix", () => {
  const ENV_KEYS = ["HERMES_STORAGE_MODE", "DATABASE_URL"] as const;
  let saved: Record<string, string | undefined>;

  beforeEach(() => {
    saved = {};
    for (const k of ENV_KEYS) {
      saved[k] = process.env[k];
      delete process.env[k];
    }
    vi.resetModules();
  });

  afterEach(() => {
    for (const k of ENV_KEYS) {
      if (saved[k] === undefined) delete process.env[k];
      else process.env[k] = saved[k];
    }
    unmockAuth();
  });

  it("GET /api/copilot/demo stays 200 for anonymous callers", async () => {
    mockNoUser();
    const { GET } = await import("../../../api/copilot/demo/route");
    const res = await GET(new Request("http://localhost/api/copilot/demo?n=5"));
    expect(res.status).toBe(200);
    expect(await res.json()).toHaveProperty("stats");
  });

  it("GET /api/brain stays 401 for anonymous callers", async () => {
    mockNoUser();
    const { GET } = await import("../../../api/brain/route");
    const res = await GET(new Request("http://localhost/api/brain?n=5"));
    expect(res.status).toBe(401);
  });

  it("POST /api/brain stays 401 for anonymous callers", async () => {
    mockNoUser();
    const { POST } = await import("../../../api/brain/route");
    const res = await POST(
      new Request("http://localhost/api/brain", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ question: "ABB ACS580 fault 2310", locale: "en" }),
      }),
    );
    expect(res.status).toBe(401);
  });
});
