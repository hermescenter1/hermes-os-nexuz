/**
 * PHASE 102 — public SEO surface for the Media & Video Hub.
 *
 * What this file proves:
 *   (a) NOTHING UNPUBLISHED IS DESCRIBED TO A CRAWLER. Every lifecycle status,
 *       visibility and processing state other than PUBLISHED + PUBLIC + READY —
 *       plus the editorial `noIndex` flag — yields null JSON-LD, `noindex,nofollow`
 *       metadata with no canonical and no hreflang, and no sitemap entry.
 *   (b) THE SITEMAP QUERY IS THE REPOSITORY'S OWN PUBLIC GATE, bounded, and the
 *       assertion inspects the `where`/`take`/`select` the module actually sent — so
 *       a future refactor that fetched broadly and filtered in JavaScript fails here
 *       even if the returned list still looked right.
 *   (c) DURATION SERIALISES TO CORRECT ISO 8601 across hours, minutes, seconds and
 *       every edge case, with "unknown" expressed by OMISSION.
 *   (d) ABSENT OPTIONAL DATA OMITS THE PROPERTY — it is never "" and never a guess.
 *   (e) HREFLANG COVERS EXACTLY THE ACTIVE LOCALES, derived from the central
 *       registry rather than a literal list.
 *
 * No live database is involved: `@/lib/db/prisma` is replaced by a double that
 * records the exact arguments it was called with.
 */

import { describe, it, expect, beforeEach, vi } from "vitest";
import { ACTIVE_LOCALES, DEFAULT_LOCALE } from "@/i18n/locales";
import { BASE_URL } from "@/lib/seo/config";
import {
  MEDIA_LIFECYCLE_STATUSES,
  MEDIA_PROCESSING_STATES,
  MEDIA_VISIBILITIES,
} from "../types";

const h = vi.hoisted(() => {
  const state = {
    available: true,
    rows: [] as Record<string, unknown>[],
    calls: [] as Record<string, unknown>[],
    throwOnQuery: false,
  };
  return { state };
});

vi.mock("@/lib/db/prisma", () => ({
  getPrisma: async () => {
    if (!h.state.available) return null;
    return {
      mediaAsset: {
        findMany: async (args: Record<string, unknown>) => {
          h.state.calls.push(args);
          if (h.state.throwOnQuery) throw new Error("db exploded");
          return h.state.rows;
        },
      },
    };
  },
}));

import {
  MEDIA_PUBLIC_PATH_PREFIX,
  MEDIA_SITEMAP_MAX_ASSETS,
  buildMediaAssetMetadata,
  buildMediaSitemapItems,
  buildMediaVideoObject,
  isMediaIndexable,
  listPublicMediaSitemapItems,
  mediaLibraryPath,
  mediaSitemapEntries,
  mediaWatchPath,
  mediaWatchUrl,
  toIso8601Duration,
  type MediaSeoAsset,
  type MediaSeoContent,
} from "../seo";

/* ── Fixtures ─────────────────────────────────────────────────────────────── */

const PUBLIC_ASSET: MediaSeoAsset = {
  slug: "plc-commissioning-walkthrough",
  organizationSlug: "acme-industrial",
  status: "PUBLISHED",
  visibility: "PUBLIC",
  processingState: "READY",
  noIndex: false,
  canonicalUrl: null,
  durationSeconds: 510,
  publishedAt: new Date("2026-03-04T09:15:00.000Z"),
  contentType: "video/mp4",
  skillLevel: "INTERMEDIATE",
  viewCount: 412,
  organizationName: "Acme Industrial",
};

const CONTENT: MediaSeoContent = {
  locale: "en",
  title: "PLC commissioning walkthrough",
  summary: "A field walkthrough of a commissioning run.",
  description: "Long-form description.",
  seoTitle: "PLC commissioning walkthrough | Hermes",
  seoDescription: "Watch a full PLC commissioning run, step by step.",
  keywords: ["plc", "commissioning"],
};

const WATCH_PATH = `${MEDIA_PUBLIC_PATH_PREFIX}/acme-industrial/plc-commissioning-walkthrough`;

/** Every asset shape that must NEVER be described to a crawler. */
const NON_PUBLIC_ASSETS: ReadonlyArray<readonly [string, MediaSeoAsset]> = [
  ...MEDIA_LIFECYCLE_STATUSES.filter((s) => s !== "PUBLISHED").map(
    (status) => [`status=${status}`, { ...PUBLIC_ASSET, status }] as const,
  ),
  ...MEDIA_VISIBILITIES.filter((v) => v !== "PUBLIC").map(
    (visibility) => [`visibility=${visibility}`, { ...PUBLIC_ASSET, visibility }] as const,
  ),
  ...MEDIA_PROCESSING_STATES.filter((p) => p !== "READY").map(
    (processingState) =>
      [`processingState=${processingState}`, { ...PUBLIC_ASSET, processingState }] as const,
  ),
  ["editorial noIndex", { ...PUBLIC_ASSET, noIndex: true }] as const,
];

beforeEach(() => {
  h.state.available = true;
  h.state.rows = [];
  h.state.calls = [];
  h.state.throwOnQuery = false;
});

/* ── (a) Draft / private must never leak ──────────────────────────────────── */

describe("102-SEO (a) — only PUBLISHED + PUBLIC + READY is describable", () => {
  it("the fixture itself is indexable (so the negatives below mean something)", () => {
    expect(isMediaIndexable(PUBLIC_ASSET)).toBe(true);
    expect(buildMediaVideoObject({ asset: PUBLIC_ASSET, content: CONTENT })).not.toBeNull();
  });

  it.each(NON_PUBLIC_ASSETS)("%s is not indexable", (_label, asset) => {
    expect(isMediaIndexable(asset)).toBe(false);
  });

  it.each(NON_PUBLIC_ASSETS)("%s emits NO JSON-LD at all", (_label, asset) => {
    expect(buildMediaVideoObject({ asset, content: CONTENT })).toBeNull();
  });

  it.each(NON_PUBLIC_ASSETS)(
    "%s emits noindex,nofollow metadata with no canonical and no hreflang",
    (_label, asset) => {
      const meta = buildMediaAssetMetadata({ asset, content: CONTENT, locale: "en" });
      expect(meta.robots).toEqual({ index: false, follow: false });
      expect(meta.alternates).toBeUndefined();
      expect(meta.openGraph).toBeUndefined();
      expect(JSON.stringify(meta)).not.toContain(WATCH_PATH);
    },
  );

  it("a DRAFT / PRIVATE / UNLISTED asset produces no sitemap entry, because the DATABASE excludes it", async () => {
    // The gate is a query predicate, not a post-filter — so the proof is the
    // `where` clause the module actually sent, plus the fact that a database
    // honouring it returns nothing.
    h.state.rows = [];
    expect(await listPublicMediaSitemapItems()).toEqual([]);
    const where = h.state.calls[0]?.where as Record<string, unknown>;
    for (const [, asset] of NON_PUBLIC_ASSETS) {
      // Every non-public fixture contradicts at least one clause of that predicate.
      const contradicts =
        (where.status !== undefined && asset.status !== where.status) ||
        (where.visibility !== undefined && asset.visibility !== where.visibility) ||
        (where.processingState !== undefined && asset.processingState !== where.processingState) ||
        (where.noIndex !== undefined && Boolean(asset.noIndex) !== where.noIndex);
      expect(contradicts).toBe(true);
    }
  });
});

/* ── (b) The sitemap query: gate, bounds, projection ──────────────────────── */

describe("102-SEO (b) — sitemap query is gated, bounded and minimal", () => {
  it("reuses the repository's public gate verbatim and adds the editorial exclusions", async () => {
    await listPublicMediaSitemapItems();
    const args = h.state.calls[0] as Record<string, unknown>;
    expect(args.where).toEqual({
      status: "PUBLISHED",
      visibility: "PUBLIC",
      processingState: "READY",
      noIndex: false,
      canonicalUrl: null,
    });
  });

  it("is bounded: take is clamped to MEDIA_SITEMAP_MAX_ASSETS and never absent", async () => {
    await listPublicMediaSitemapItems();
    expect(h.state.calls[0]?.take).toBe(MEDIA_SITEMAP_MAX_ASSETS);

    h.state.calls = [];
    await listPublicMediaSitemapItems(10_000_000);
    expect(h.state.calls[0]?.take).toBe(MEDIA_SITEMAP_MAX_ASSETS);

    h.state.calls = [];
    await listPublicMediaSitemapItems(5);
    expect(h.state.calls[0]?.take).toBe(5);

    h.state.calls = [];
    await listPublicMediaSitemapItems(0);
    expect(h.state.calls[0]?.take).toBe(1);

    h.state.calls = [];
    await listPublicMediaSitemapItems(Number.NaN);
    expect(h.state.calls[0]?.take).toBe(MEDIA_SITEMAP_MAX_ASSETS);
  });

  it("selects an address, a date and the language facts — no id, no storage key", async () => {
    // DISCOVERY-2A widened this projection by exactly two fields, both of which
    // are language facts the sitemap needs to stop fabricating hreflang. The
    // point of the assertion is unchanged and still enforced below: nothing that
    // identifies internal state may be read here.
    await listPublicMediaSitemapItems();
    expect(h.state.calls[0]?.select).toEqual({
      slug: true,
      publishedAt: true,
      primaryLocale: true,
      translations: { select: { locale: true } },
      organization: { select: { slug: true } },
    });

    const serialised = JSON.stringify(h.state.calls[0]?.select);
    for (const forbidden of ["id", "storageKey", "posterStorageKey", "viewCount", "createdBy"]) {
      expect(serialised, `${forbidden} must never be selected`).not.toContain(`"${forbidden}"`);
    }
  });

  it("orders by publishedAt — never by updatedAt, which the view counter moves", async () => {
    await listPublicMediaSitemapItems();
    expect(h.state.calls[0]?.orderBy).toEqual({ publishedAt: "desc" });
    expect(JSON.stringify(h.state.calls[0])).not.toContain("updatedAt");
  });

  it("degrades to an empty list when the database is unavailable or throws", async () => {
    h.state.available = false;
    expect(await listPublicMediaSitemapItems()).toEqual([]);

    h.state.available = true;
    h.state.throwOnQuery = true;
    expect(await listPublicMediaSitemapItems()).toEqual([]);
  });

  it("drops rows whose slugs could not mint a safe path", () => {
    const items = buildMediaSitemapItems([
      {
        slug: "good-slug",
        publishedAt: "2026-01-01T00:00:00.000Z",
        primaryLocale: "en",
        translations: [{ locale: "en" }],
        organization: { slug: "acme" },
      },
      { slug: "../../etc/passwd", publishedAt: null, organization: { slug: "acme" } },
      { slug: "has space", publishedAt: null, organization: { slug: "acme" } },
      { slug: "ok", publishedAt: null, organization: { slug: "BAD_ORG" } },
      { slug: "ok", publishedAt: null, organization: null },
      { slug: 42, publishedAt: null, organization: { slug: "acme" } },
    ]);
    expect(items).toEqual([
      {
        path: `${MEDIA_PUBLIC_PATH_PREFIX}/acme/good-slug`,
        lastModified: "2026-01-01T00:00:00.000Z",
        contentLocales: ["en"],
      },
    ]);
  });
});

/* ── (c) ISO 8601 duration ────────────────────────────────────────────────── */

describe("102-SEO (c) — duration serialises to correct ISO 8601", () => {
  it.each([
    [510, "PT8M30S"],
    [30, "PT30S"],
    [60, "PT1M"],
    [90, "PT1M30S"],
    [600, "PT10M"],
    [3600, "PT1H"],
    [3661, "PT1H1M1S"],
    [3720, "PT1H2M"],
    [3601, "PT1H1S"],
    [7383, "PT2H3M3S"],
    [86399, "PT23H59M59S"],
    [86400, "PT24H"],
    [1, "PT1S"],
  ])("%i seconds → %s", (seconds, expected) => {
    expect(toIso8601Duration(seconds)).toBe(expected);
  });

  it("zero is OMITTED, not PT0S — there is no duration probe, so 0 is not a claim", () => {
    expect(toIso8601Duration(0)).toBeNull();
  });

  it.each([
    ["null", null],
    ["undefined", undefined],
    ["negative", -30],
    ["fractional", 12.5],
    ["NaN", Number.NaN],
    ["Infinity", Number.POSITIVE_INFINITY],
    ["-Infinity", Number.NEGATIVE_INFINITY],
  ])("%s yields null", (_label, value) => {
    expect(toIso8601Duration(value as number | null | undefined)).toBeNull();
  });

  it("never emits a component whose value is zero (PT1H, not PT1H0M0S)", () => {
    // A leading zero can only occur at the start of a component, i.e. right after
    // `T` or after the previous component's unit letter. `PT10M` is therefore fine.
    const ZERO_COMPONENT = /(?:^|[A-Z])0[HMS]/;
    for (let s = 1; s <= 90_000; s += 7) {
      const out = toIso8601Duration(s) as string;
      expect(out).not.toMatch(ZERO_COMPONENT);
      expect(out).toMatch(/^PT(?:\d+H)?(?:\d+M)?(?:\d+S)?$/);
      expect(out.length).toBeGreaterThan(2);
    }
    expect(toIso8601Duration(600)).toBe("PT10M");
  });

  it("the VideoObject carries the serialised form, and omits it when unknown", () => {
    const withDuration = buildMediaVideoObject({ asset: PUBLIC_ASSET, content: CONTENT })!;
    expect(withDuration.duration).toBe("PT8M30S");

    for (const value of [null, 0, undefined]) {
      const schema = buildMediaVideoObject({
        asset: { ...PUBLIC_ASSET, durationSeconds: value },
        content: CONTENT,
      })!;
      expect(schema).not.toHaveProperty("duration");
    }
  });
});

/* ── (d) Absent data is OMITTED, never "" and never guessed ───────────────── */

describe("102-SEO (d) — a property the platform cannot back is omitted", () => {
  const BARE_ASSET: MediaSeoAsset = {
    slug: "bare",
    organizationSlug: "acme",
    status: "PUBLISHED",
    visibility: "PUBLIC",
    processingState: "READY",
  };
  const BARE_CONTENT: MediaSeoContent = { locale: "en", title: "Bare asset" };

  it("emits only the five unconditional properties when nothing else is known", () => {
    const schema = buildMediaVideoObject({ asset: BARE_ASSET, content: BARE_CONTENT })!;
    expect(Object.keys(schema).sort()).toEqual(
      ["@context", "@type", "inLanguage", "name", "url"].sort(),
    );
  });

  it("no value anywhere in the emitted JSON-LD is an empty string", () => {
    const schema = buildMediaVideoObject({
      asset: { ...BARE_ASSET, contentType: "", skillLevel: "", organizationName: "   " },
      content: {
        ...BARE_CONTENT,
        summary: "",
        description: "   ",
        seoDescription: "",
        keywords: ["", "  "],
      },
      urls: { contentUrl: "", thumbnailUrl: "   " },
    })!;
    // Deep scan: no leaf anywhere in the graph is "" or whitespace-only.
    const walk = (node: unknown, path: string): void => {
      if (typeof node === "string") {
        expect(`${path}:${node.trim()}`).not.toBe(`${path}:`);
        return;
      }
      if (Array.isArray(node)) {
        node.forEach((child, i) => walk(child, `${path}[${i}]`));
        return;
      }
      if (node && typeof node === "object") {
        for (const [k, v] of Object.entries(node)) walk(v, `${path}.${k}`);
      }
    };
    walk(schema, "$");
    expect(schema).not.toHaveProperty("description");
    expect(schema).not.toHaveProperty("keywords");
    expect(schema).not.toHaveProperty("thumbnailUrl");
    expect(schema).not.toHaveProperty("contentUrl");
    expect(schema).not.toHaveProperty("encodingFormat");
    expect(schema).not.toHaveProperty("educationalLevel");
    expect(schema).not.toHaveProperty("publisher");
  });

  it("uploadDate is omitted when publishedAt is absent or unparsable", () => {
    for (const publishedAt of [null, undefined, "not-a-date"]) {
      const schema = buildMediaVideoObject({
        asset: { ...PUBLIC_ASSET, publishedAt },
        content: CONTENT,
      })!;
      expect(schema).not.toHaveProperty("uploadDate");
    }
    expect(
      buildMediaVideoObject({ asset: PUBLIC_ASSET, content: CONTENT })!.uploadDate,
    ).toBe("2026-03-04T09:15:00.000Z");
  });

  it("contentUrl and thumbnailUrl are emitted only for same-origin absolute URLs", () => {
    const good = buildMediaVideoObject({
      asset: PUBLIC_ASSET,
      content: CONTENT,
      urls: {
        contentUrl: `${BASE_URL}/api/media/assets/abc/stream`,
        thumbnailUrl: `${BASE_URL}/api/media/assets/abc/poster`,
      },
    })!;
    expect(good.contentUrl).toBe(`${BASE_URL}/api/media/assets/abc/stream`);
    expect(good.thumbnailUrl).toBe(`${BASE_URL}/api/media/assets/abc/poster`);
    expect(good.encodingFormat).toBe("video/mp4");

    for (const hostile of [
      "https://evil.example.com/video.mp4",
      "http://hermesnovin.com/video.mp4",
      "/api/media/assets/abc/stream",
      "javascript:alert(1)",
      "data:video/mp4;base64,AAAA",
      null,
    ]) {
      const schema = buildMediaVideoObject({
        asset: PUBLIC_ASSET,
        content: CONTENT,
        urls: { contentUrl: hostile, thumbnailUrl: hostile },
      })!;
      expect(schema).not.toHaveProperty("contentUrl");
      expect(schema).not.toHaveProperty("thumbnailUrl");
      expect(schema).not.toHaveProperty("encodingFormat");
    }
  });

  it("encodingFormat never appears without a contentUrl to describe", () => {
    const schema = buildMediaVideoObject({
      asset: PUBLIC_ASSET,
      content: CONTENT,
      urls: { contentUrl: null },
    })!;
    expect(schema).not.toHaveProperty("encodingFormat");
  });

  it("never claims a capability this platform does not have", () => {
    const schema = buildMediaVideoObject({
      asset: PUBLIC_ASSET,
      content: CONTENT,
      urls: {
        contentUrl: `${BASE_URL}/api/media/assets/abc/stream`,
        thumbnailUrl: `${BASE_URL}/api/media/assets/abc/poster`,
      },
    })!;
    // No embed surface (CSP frame-src is untouched), no transcoder, no probe,
    // and updatedAt is not an editorial modification date.
    for (const forbidden of [
      "embedUrl",
      "hasPart",
      "dateModified",
      "width",
      "height",
      "bitrate",
      "videoQuality",
      "encodesCreativeWork",
      "expires",
      "regionsAllowed",
    ]) {
      expect(schema).not.toHaveProperty(forbidden);
    }
  });

  it("publisher names the OWNING organization, never the platform operator", () => {
    const schema = buildMediaVideoObject({ asset: PUBLIC_ASSET, content: CONTENT })!;
    expect(schema.publisher).toEqual({
      "@type": "Organization",
      name: "Acme Industrial",
      url: `${BASE_URL}/en${MEDIA_PUBLIC_PATH_PREFIX}/acme-industrial`,
    });
    expect(JSON.stringify(schema)).not.toContain("Hermes Novin");
  });

  it("interactionStatistic appears only for a real, positive view count", () => {
    expect(
      buildMediaVideoObject({ asset: PUBLIC_ASSET, content: CONTENT })!.interactionStatistic,
    ).toEqual({
      "@type": "InteractionCounter",
      interactionType: "https://schema.org/WatchAction",
      userInteractionCount: 412,
    });
    for (const viewCount of [0, -1, null, undefined, 1.5]) {
      const schema = buildMediaVideoObject({
        asset: { ...PUBLIC_ASSET, viewCount: viewCount as number | null },
        content: CONTENT,
      })!;
      expect(schema).not.toHaveProperty("interactionStatistic");
    }
  });

  it("keywords are deduplicated, trimmed and joined; educationalLevel is stored verbatim", () => {
    const schema = buildMediaVideoObject({
      asset: PUBLIC_ASSET,
      content: { ...CONTENT, keywords: [" plc ", "plc", "scada", ""] },
    })!;
    expect(schema.keywords).toBe("plc, scada");
    expect(schema.educationalLevel).toBe("INTERMEDIATE");
  });

  it("an unrecognised skill level is dropped rather than published", () => {
    const schema = buildMediaVideoObject({
      asset: { ...PUBLIC_ASSET, skillLevel: "GURU" },
      content: CONTENT,
    })!;
    expect(schema).not.toHaveProperty("educationalLevel");
  });

  it("description prefers seoDescription, then summary, then description", () => {
    const pick = (content: Partial<MediaSeoContent>) =>
      buildMediaVideoObject({
        asset: PUBLIC_ASSET,
        content: { ...CONTENT, ...content },
      })!.description;
    expect(pick({})).toBe(CONTENT.seoDescription);
    expect(pick({ seoDescription: null })).toBe(CONTENT.summary);
    expect(pick({ seoDescription: null, summary: null })).toBe(CONTENT.description);
    expect(
      buildMediaVideoObject({
        asset: PUBLIC_ASSET,
        content: { ...CONTENT, seoDescription: null, summary: null, description: null },
      })!,
    ).not.toHaveProperty("description");
  });

  it("returns null rather than a nameless VideoObject", () => {
    expect(
      buildMediaVideoObject({
        asset: PUBLIC_ASSET,
        content: { locale: "en", title: "   ", seoTitle: null },
      }),
    ).toBeNull();
  });

  it("returns null when the slugs cannot mint a canonical URL", () => {
    expect(
      buildMediaVideoObject({
        asset: { ...PUBLIC_ASSET, slug: "Not A Slug" },
        content: CONTENT,
      }),
    ).toBeNull();
  });
});

/* ── (e) hreflang, canonical and locale ───────────────────────────────────── */

describe("102-SEO (e) — hreflang covers exactly the locales the asset EXISTS in", () => {
  /**
   * DISCOVERY-2A — CONTRACT CHANGE, recorded deliberately.
   *
   * This block previously asserted "one alternate per ACTIVE_LOCALES entry plus
   * x-default, and nothing else", and that the set was identical whichever
   * locale rendered the page. That pinned a FALSE claim: hreflang says an
   * alternate representation exists in that language, and `MediaAssetTranslation`
   * is per-locale, so an asset with one English translation has exactly one
   * representation. The old assertions have been replaced, not relaxed — the new
   * ones are strictly more specific about what may be published.
   */
  it("an asset with no declared content locales keeps the full active set", () => {
    // Backward-compatible default: a caller that cannot tell gets the historical
    // behaviour rather than silently losing its alternates.
    const meta = buildMediaAssetMetadata({ asset: PUBLIC_ASSET, content: CONTENT, locale: "en" });
    const languages = meta.alternates?.languages as Record<string, string>;
    expect(Object.keys(languages).sort()).toEqual(
      [...ACTIVE_LOCALES, "x-default"].sort(),
    );
    for (const locale of ACTIVE_LOCALES) {
      expect(languages[locale]).toBe(`${BASE_URL}/${locale}${WATCH_PATH}`);
    }
    expect(languages["x-default"]).toBe(`${BASE_URL}/${DEFAULT_LOCALE}${WATCH_PATH}`);
  });

  it("an English-only asset advertises NO Persian or German alternate", () => {
    for (const locale of ACTIVE_LOCALES) {
      const meta = buildMediaAssetMetadata({
        asset: PUBLIC_ASSET,
        content: CONTENT,
        locale,
        contentLocales: ["en"],
      });
      // One representation → no languages map at all, and every locale prefix
      // canonicalises onto it.
      expect(meta.alternates?.languages).toBeUndefined();
      expect(meta.alternates?.canonical).toBe(`${BASE_URL}/en${WATCH_PATH}`);
      expect(JSON.stringify(meta)).not.toContain(`/fa${WATCH_PATH}`);
      expect(JSON.stringify(meta)).not.toContain(`/de${WATCH_PATH}`);
    }
  });

  it("a fa+en asset advertises exactly those two, with x-default on the primary", () => {
    const meta = buildMediaAssetMetadata({
      asset: PUBLIC_ASSET,
      content: CONTENT,
      locale: "fa",
      contentLocales: ["en", "fa"],
    });
    const languages = meta.alternates?.languages as Record<string, string>;
    expect(Object.keys(languages).sort()).toEqual(["en", "fa", "x-default"]);
    expect(languages["x-default"]).toBe(`${BASE_URL}/en${WATCH_PATH}`);
    expect(languages.de).toBeUndefined();
  });

  it("with no declared locales the alternate set is identical whichever locale renders", () => {
    const sets = ACTIVE_LOCALES.map(
      (locale) =>
        buildMediaAssetMetadata({ asset: PUBLIC_ASSET, content: CONTENT, locale })
          .alternates?.languages,
    );
    for (const set of sets) expect(set).toEqual(sets[0]);
  });

  it("canonical follows the rendering locale", () => {
    for (const locale of ACTIVE_LOCALES) {
      const meta = buildMediaAssetMetadata({ asset: PUBLIC_ASSET, content: CONTENT, locale });
      expect(meta.alternates?.canonical).toBe(`${BASE_URL}/${locale}${WATCH_PATH}`);
    }
  });

  it("an unknown locale falls back to DEFAULT_LOCALE rather than minting /xx/", () => {
    for (const bad of ["xx", "", "EN", "de-DE", "constructor", "../en"]) {
      const meta = buildMediaAssetMetadata({ asset: PUBLIC_ASSET, content: CONTENT, locale: bad });
      expect(meta.alternates?.canonical).toBe(`${BASE_URL}/${DEFAULT_LOCALE}${WATCH_PATH}`);
      expect(mediaWatchUrl(bad, "acme", "x")).toBe(
        `${BASE_URL}/${DEFAULT_LOCALE}${MEDIA_PUBLIC_PATH_PREFIX}/acme/x`,
      );
    }
  });

  it("inLanguage uses the site-wide locale→BCP-47 table", () => {
    const tags = ACTIVE_LOCALES.map(
      (locale) =>
        buildMediaVideoObject({ asset: PUBLIC_ASSET, content: { ...CONTENT, locale } })!
          .inLanguage,
    );
    expect(tags).toEqual(["fa-IR", "en-US", "de-DE"]);
  });

  it("a trilingual asset's sitemap entries carry the full alternate map", () => {
    const entries = mediaSitemapEntries([
      {
        path: WATCH_PATH,
        lastModified: "2026-03-04T09:15:00.000Z",
        contentLocales: [...ACTIVE_LOCALES],
      },
    ]);
    expect(entries).toHaveLength(ACTIVE_LOCALES.length);
    for (const entry of entries) {
      const languages = entry.alternates?.languages as Record<string, string>;
      expect(Object.keys(languages).sort()).toEqual([...ACTIVE_LOCALES].sort());
      expect(entry.lastModified).toBe("2026-03-04T09:15:00.000Z");
    }
    expect(entries.map((e) => e.url)).toEqual(
      ACTIVE_LOCALES.map((l) => `${BASE_URL}/${l}${WATCH_PATH}`),
    );
  });

  it("an English-only asset gets ONE sitemap URL and no alternates", () => {
    // DISCOVERY-2A — was three URLs with a three-way alternate map, claiming two
    // translations that do not exist.
    const entries = mediaSitemapEntries([
      { path: WATCH_PATH, lastModified: null, contentLocales: ["en"] },
    ]);
    expect(entries).toHaveLength(1);
    expect(entries[0].url).toBe(`${BASE_URL}/en${WATCH_PATH}`);
    expect(entries[0].alternates).toBeUndefined();
  });

  it("an asset whose language cannot be established is not advertised at all", () => {
    expect(mediaSitemapEntries([{ path: WATCH_PATH, lastModified: null, contentLocales: [] }]))
      .toEqual([]);
    expect(
      mediaSitemapEntries([{ path: WATCH_PATH, lastModified: null, contentLocales: ["pt"] }]),
    ).toEqual([]);
  });

  it("buildMediaSitemapItems derives the locales from the row, never from ACTIVE_LOCALES", () => {
    const [item] = buildMediaSitemapItems([
      {
        slug: "plc-commissioning",
        publishedAt: null,
        primaryLocale: "en",
        translations: [{ locale: "en" }, { locale: "fa" }],
        organization: { slug: "acme" },
      },
    ]);
    // primaryLocale leads, so it becomes the canonical / x-default target.
    expect(item.contentLocales).toEqual(["en", "fa"]);

    const [single] = buildMediaSitemapItems([
      {
        slug: "plc-commissioning",
        publishedAt: null,
        primaryLocale: "en",
        translations: [],
        organization: { slug: "acme" },
      },
    ]);
    expect(single.contentLocales).toEqual(["en"]);
  });

  it("a sitemap entry omits lastModified entirely when publication date is unknown", () => {
    const [entry] = mediaSitemapEntries([
      { path: WATCH_PATH, lastModified: null, contentLocales: ["en"] },
    ]);
    expect(entry).not.toHaveProperty("lastModified");
  });
});

/* ── Editorial canonical override + path minting ──────────────────────────── */

describe("102-SEO — editorial canonical override and URL minting", () => {
  it("a same-origin editor canonical replaces the canonical but not the hreflang set", () => {
    const declared = `${BASE_URL}/en/library/plc-commissioning`;
    const meta = buildMediaAssetMetadata({
      asset: { ...PUBLIC_ASSET, canonicalUrl: declared },
      content: CONTENT,
      locale: "en",
    });
    expect(meta.alternates?.canonical).toBe(declared);
    expect(Object.keys(meta.alternates?.languages as Record<string, string>).sort()).toEqual(
      [...ACTIVE_LOCALES, "x-default"].sort(),
    );
  });

  it("an off-origin editor canonical is ignored", () => {
    const meta = buildMediaAssetMetadata({
      asset: { ...PUBLIC_ASSET, canonicalUrl: "https://evil.example.com/steal" },
      content: CONTENT,
      locale: "en",
    });
    expect(meta.alternates?.canonical).toBe(`${BASE_URL}/en${WATCH_PATH}`);
    expect(JSON.stringify(meta)).not.toContain("evil.example.com");
  });

  it("an asset that declares its own canonical is excluded from the sitemap query", async () => {
    await listPublicMediaSitemapItems();
    expect((h.state.calls[0]?.where as Record<string, unknown>).canonicalUrl).toBeNull();
  });

  it("path minting refuses anything that is not a safe slug", () => {
    expect(mediaWatchPath("acme", "good-slug")).toBe(`${MEDIA_PUBLIC_PATH_PREFIX}/acme/good-slug`);
    expect(mediaLibraryPath("acme")).toBe(`${MEDIA_PUBLIC_PATH_PREFIX}/acme`);
    for (const bad of ["", "UPPER", "with space", "a/b", "a?b=1", "a#b", "-leading", "trailing-", "a--b", "..", "%2e%2e"]) {
      expect(mediaWatchPath("acme", bad)).toBeNull();
      expect(mediaWatchPath(bad, "good-slug")).toBeNull();
      expect(mediaLibraryPath(bad)).toBeNull();
    }
    expect(mediaWatchPath("acme", "x".repeat(161))).toBeNull();
  });

  it("metadata for an unmintable slug is noindex, not a broken canonical", () => {
    const meta = buildMediaAssetMetadata({
      asset: { ...PUBLIC_ASSET, slug: "Bad Slug" },
      content: CONTENT,
      locale: "en",
    });
    expect(meta.robots).toEqual({ index: false, follow: false });
    expect(meta.alternates).toBeUndefined();
  });

  it("metadata omits description rather than shipping an empty one", () => {
    const meta = buildMediaAssetMetadata({
      asset: PUBLIC_ASSET,
      content: { locale: "en", title: "Bare", seoDescription: null, summary: null, description: null },
      locale: "en",
    });
    expect(meta).not.toHaveProperty("description");
    expect(meta.openGraph).not.toHaveProperty("description");
    expect(meta.twitter).not.toHaveProperty("description");
    expect(meta.robots).toMatchObject({ index: true, follow: true });
  });

  it("an off-origin ogImage is rejected in favour of the site default", () => {
    const meta = buildMediaAssetMetadata({
      asset: PUBLIC_ASSET,
      content: CONTENT,
      locale: "en",
      ogImage: "https://evil.example.com/tracker.gif",
    });
    expect(JSON.stringify(meta)).not.toContain("evil.example.com");
  });
});
