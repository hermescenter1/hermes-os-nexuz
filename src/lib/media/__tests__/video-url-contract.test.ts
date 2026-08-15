import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { mediaLibraryPath, mediaWatchPath, mediaWatchUrl, mediaSitemapEntries } from "@/lib/media/seo";
import { BASE_URL } from "@/lib/seo/config";
import nextConfig from "../../../../next.config";

/**
 * DISCOVERY-2A — CASE E + CASE 8: the public media URL contract.
 *
 * BEFORE THIS PHASE THERE WERE THREE CONTRADICTORY CONTRACTS
 * ----------------------------------------------------------
 *   sitemap        `/{locale}/videos/{org}/{slug}`  — no route existed → 404
 *   canonical tag  `/{locale}/videos/{slug}`        — needed ?org= → 404
 *   internal links `/{locale}/videos/{slug}?org=`   — the only one that worked
 *
 * Every media URL the sitemap advertised returned 404, and the canonical tag on
 * the watch page pointed at a URL that also returned 404. These tests pin the
 * single surviving contract against the FILESYSTEM, so a future route rename
 * cannot silently re-open the gap: a string test alone would have passed
 * happily throughout the broken period.
 */

const APP_DIR = path.resolve(__dirname, "../../../app/[locale]/videos");

function routeExists(...segments: string[]): boolean {
  return fs.existsSync(path.join(APP_DIR, ...segments, "page.tsx"));
}

describe("E1 — the route tree implements the minted contract", () => {
  it("the watch route is /{locale}/videos/[org]/[slug]", () => {
    expect(routeExists("[org]", "[slug]")).toBe(true);
  });

  it("the organization library route is /{locale}/videos/[org]", () => {
    expect(routeExists("[org]")).toBe(true);
  });

  it("the bare hub root still resolves — nothing that answered 200 now 404s", () => {
    expect(routeExists()).toBe(true);
  });

  it("the old single-segment watch route is gone", () => {
    // `videos/[slug]` and `videos/[org]` cannot coexist (Next.js forbids two
    // different slug names at one position), so its survival would mean the
    // move never happened.
    expect(fs.existsSync(path.join(APP_DIR, "[slug]"))).toBe(false);
  });
});

describe("E2 — one minting function, one shape", () => {
  it("mediaWatchPath produces exactly the route the filesystem implements", () => {
    expect(mediaWatchPath("acme", "plc-basics")).toBe("/videos/acme/plc-basics");
  });

  it("mediaLibraryPath produces the one-segment organization route", () => {
    expect(mediaLibraryPath("acme")).toBe("/videos/acme");
  });

  it("mediaWatchUrl is the locale-prefixed absolute form of the same path", () => {
    expect(mediaWatchUrl("en", "acme", "plc-basics")).toBe(
      `${BASE_URL}/en/videos/acme/plc-basics`,
    );
  });

  it("no minted public media path can carry a query string or a fragment", () => {
    // `isSubmittablePath()` in @/lib/seo/indexnow-lifecycle rejects any path
    // containing `?`, and a canonical URL must not depend on one.
    for (const p of [mediaWatchPath("acme", "plc-basics"), mediaLibraryPath("acme")]) {
      expect(p).not.toBeNull();
      expect(p!).not.toContain("?");
      expect(p!).not.toContain("#");
    }
  });

  it("an unmintable slug yields null rather than a forged URL", () => {
    expect(mediaWatchPath("acme", "Not A Slug!")).toBeNull();
    expect(mediaWatchPath("Not An Org!", "plc-basics")).toBeNull();
    expect(mediaLibraryPath("")).toBeNull();
  });
});

describe("E3 — the sitemap emits the same shape as the route", () => {
  it("every sitemap URL for an asset is /{locale}/videos/{org}/{slug}", () => {
    const entries = mediaSitemapEntries([
      { path: mediaWatchPath("acme", "plc-basics")!, lastModified: null, contentLocales: ["en"] },
    ]);
    expect(entries).toHaveLength(1);
    expect(entries[0].url).toBe(`${BASE_URL}/en/videos/acme/plc-basics`);

    const suffix = entries[0].url.slice(BASE_URL.length);
    // locale + "videos" + org + slug === four segments, and no query string.
    expect(suffix.split("/").filter(Boolean)).toHaveLength(4);
    expect(suffix).not.toContain("?");
  });

  it("the sitemap path and the watch page's canonicalPath are the same string", async () => {
    // `loadVideoWatch` sets `canonicalPath` from `mediaWatchPath`, so proving the
    // source is shared is stronger than comparing two literals.
    const src = fs.readFileSync(
      path.resolve(__dirname, "../../../app/[locale]/videos/data.ts"),
      "utf8",
    );
    expect(src).toContain("mediaWatchPath");
    expect(src).toContain("canonicalPath,");
    // The old hand-built shapes must be gone.
    expect(src).not.toContain("canonicalPath: `/videos/${asset.slug}`");
    expect(src).not.toContain("?${VIDEO_HUB_ORG_PARAM}=");
  });
});

describe("E4 / CASE 8 — legacy ?org= URLs redirect to the canonical path", () => {
  type Redirect = {
    source: string;
    destination: string;
    permanent?: boolean;
    has?: { type: string; key: string; value?: string }[];
  };

  async function redirects(): Promise<Redirect[]> {
    const fn = (nextConfig as { redirects?: () => Promise<Redirect[]> }).redirects;
    expect(typeof fn).toBe("function");
    return (await fn!()) as Redirect[];
  }

  it("the legacy watch URL 308s to /{locale}/videos/{org}/{slug}", async () => {
    const rule = (await redirects()).find(
      (r) => r.source === "/:locale(fa|en|de)/videos/:slug",
    );
    expect(rule, "legacy watch redirect must exist").toBeDefined();
    expect(rule!.destination).toBe("/:locale/videos/:org/:slug");
    expect(rule!.permanent).toBe(true);
    // The org value must be captured by NAME, or `:org` in the destination is
    // an unresolved literal.
    expect(rule!.has?.[0]).toMatchObject({ type: "query", key: "org" });
    expect(rule!.has?.[0].value).toContain("?<org>");
  });

  it("the legacy library URL 308s to /{locale}/videos/{org}", async () => {
    const rule = (await redirects()).find((r) => r.source === "/:locale(fa|en|de)/videos");
    expect(rule, "legacy library redirect must exist").toBeDefined();
    expect(rule!.destination).toBe("/:locale/videos/:org");
    expect(rule!.permanent).toBe(true);
    expect(rule!.has?.[0]).toMatchObject({ type: "query", key: "org" });
  });

  it("no redirect can loop — every destination has more segments than its source", async () => {
    const segs = (p: string) => p.split("?")[0].split("/").filter(Boolean).length;
    for (const rule of await redirects()) {
      if (!rule.source.includes("/videos")) continue;
      expect(
        segs(rule.destination),
        `${rule.source} → ${rule.destination} must not re-match its own source`,
      ).toBeGreaterThan(segs(rule.source));
    }
  });

  it("each redirect destination is a route the filesystem implements", async () => {
    for (const rule of await redirects()) {
      if (!rule.source.includes("/videos")) continue;
      const tail = rule.destination.replace("/:locale/videos", "");
      // "/:org" → [org]/page.tsx ; "/:org/:slug" → [org]/[slug]/page.tsx
      const segments = tail.split("/").filter(Boolean).map((s) => `[${s.slice(1)}]`);
      expect(routeExists(...segments), `${rule.destination} must resolve`).toBe(true);
    }
  });
});
