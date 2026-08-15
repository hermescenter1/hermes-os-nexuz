// @vitest-environment jsdom
import type { ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NextIntlClientProvider, createTranslator } from "next-intl";
import { mount } from "@/components/ds/__tests__/_render";
import { MediaPlayer } from "@/components/media";
import {
  PROTECTED_PATHS,
  isProtectedPath,
  isPublicAnonymousPath,
} from "@/lib/auth/rbac";
import {
  ORG_A,
  ORG_B,
  asset,
  createMediaPrismaDouble,
  translation,
  type Double,
} from "@/app/api/media/public/__tests__/media-prisma-double";
import en from "../../../../../messages/en.json";

/**
 * PHASE 102 — the PUBLIC Video Hub pages.
 *
 * The REAL `src/lib/media/db.ts` runs against an in-memory Prisma double (the same
 * one the anonymous API suite uses), so the assertions below are about the `where`
 * clause the repository actually issued — not about a stub that was told what to
 * return. A page that started re-implementing the published-only gate, or that
 * stopped passing the default audience, fails here.
 *
 * What this file proves:
 *   A. `/videos` and `/videos/[slug]` are PUBLIC in every locale, and no protected
 *      matcher captures them;
 *   B. the watch page answers `notFound()` for every asset that is not
 *      PUBLISHED + PUBLIC + READY in the addressed organization, and for a missing
 *      or unknown organization selector — all with the same, indistinguishable
 *      outcome;
 *   C. the watch page renders the player for an asset that IS published, with a
 *      same-origin Range URL and no invented poster, captions or progress;
 *   D. the library page renders the empty state — not an error, not a fabricated
 *      row — when the organization has nothing published;
 *   E. every media query these pages issued carried the full visibility gate.
 */

// ── Messages ─────────────────────────────────────────────────────────────────
//
// The SHIPPED catalog, unmodified. `messages/en.json` is the very file
// `src/i18n/request.ts` imports at runtime, so a key these pages read and the
// catalog does not carry fails here rather than in production.
//
// There used to be a merge with a hand-written `mediaHub` fixture at
// `src/components/media/__tests__/_messages.ts`. That fixture was a second
// source of truth: it could satisfy a page test with copy and key paths nobody
// ships. It has been deleted, and nothing may reintroduce a parallel catalog.
const MESSAGES = en as unknown as Record<string, unknown>;

// ── Seams ────────────────────────────────────────────────────────────────────

const NOT_FOUND = "NEXT_NOT_FOUND_SENTINEL";

const nav = vi.hoisted(() => ({ pathname: "/en/videos", query: "" }));

vi.mock("next/navigation", () => ({
  notFound: () => {
    throw new Error(NOT_FOUND);
  },
  useRouter: () => ({ push: () => {}, replace: () => {}, refresh: () => {} }),
  usePathname: () => nav.pathname,
  useSearchParams: () => new URLSearchParams(nav.query),
}));

vi.mock("next/link", () => ({
  default: ({ href, children, ...rest }: { href: string; children?: ReactNode } & Record<string, unknown>) => (
    <a href={href} {...rest}>
      {children}
    </a>
  ),
}));

vi.mock("next-intl/server", () => ({
  setRequestLocale: () => {},
  getLocale: async () => "en",
  getTranslations: async ({ locale, namespace }: { locale?: string; namespace?: string } = {}) =>
    createTranslator({
      locale: locale ?? "en",
      messages: MESSAGES as never,
      namespace: (namespace ?? "mediaHub") as never,
    }),
}));

let db: Double;
vi.mock("@/lib/db/prisma", () => ({ getPrisma: async () => db.client }));

// ── Seed ─────────────────────────────────────────────────────────────────────
//
// ORG_A publishes one asset and hides five that must never be reachable.
// ORG_B publishes nothing at all — it is the empty-library fixture.
function seed(): Double {
  return createMediaPrismaDouble({
    organization: [{ ...ORG_A }, { ...ORG_B }],
    mediaAsset: [
      asset("a-public", ORG_A.id, "plc-basics", {
        categoryId: "cat-1",
        instructorId: "ins-1",
        // A REAL poster key in the server-minted shape. The loader keys the URL
        // off this column, so without it the poster assertions below would pass
        // for the wrong reason.
        posterStorageKey: `media/${ORG_A.id}/a-public/11111111-2222-4333-8444-555555555555.png`,
      }),
      asset("a-draft", ORG_A.id, "secret-draft", {
        status: "DRAFT",
        visibility: "PRIVATE",
        processingState: "PENDING_UPLOAD",
        publishedAt: null,
      }),
      asset("a-submitted", ORG_A.id, "awaiting-review", { status: "SUBMITTED" }),
      asset("a-internal", ORG_A.id, "internal-only", { visibility: "ORGANIZATION" }),
      asset("a-validating", ORG_A.id, "still-validating", { processingState: "VALIDATING" }),
      asset("a-quarantined", ORG_A.id, "quarantined-bytes", { processingState: "QUARANTINED" }),
      asset("b-draft", ORG_B.id, "other-tenant-draft", { status: "DRAFT", publishedAt: null }),
    ],
    mediaAssetTranslation: [
      translation("a-public", ORG_A.id, "en", "PLC Basics"),
      translation("a-draft", ORG_A.id, "en", "Unreleased Draft"),
      translation("a-internal", ORG_A.id, "en", "Internal Only"),
    ],
    mediaSubtitleTrack: [
      {
        id: "trk-en",
        organizationId: ORG_A.id,
        mediaAssetId: "a-public",
        locale: "en",
        label: "English",
        storageKey: `media/${ORG_A.id}/a-public/22222222-2222-4333-8444-555555555555.vtt`,
        format: "vtt",
        byteSize: 128,
        isDefault: true,
      },
      {
        id: "trk-fa",
        organizationId: ORG_A.id,
        mediaAssetId: "a-public",
        locale: "fa",
        label: "فارسی",
        storageKey: `media/${ORG_A.id}/a-public/33333333-2222-4333-8444-555555555555.vtt`,
        format: "vtt",
        byteSize: 96,
        isDefault: false,
      },
      // Another tenant's track on an id-shaped collision. The loader is
      // organization-scoped, so this must never appear.
      {
        id: "trk-b",
        organizationId: ORG_B.id,
        mediaAssetId: "a-public",
        locale: "en",
        label: "Leaked",
        storageKey: `media/${ORG_B.id}/a-public/44444444-2222-4333-8444-555555555555.vtt`,
        format: "vtt",
        byteSize: 64,
        isDefault: true,
      },
    ],
    mediaChapter: [
      {
        id: "ch-1",
        organizationId: ORG_A.id,
        mediaAssetId: "a-public",
        locale: "en",
        orderIndex: 0,
        startSeconds: 0,
        endSeconds: 120,
        title: "Introduction",
      },
    ],
    mediaCategory: [
      {
        id: "cat-1",
        organizationId: ORG_A.id,
        slug: "automation",
        nameFa: "اتوماسیون",
        nameEn: "Automation",
        nameDe: "Automatisierung",
        orderIndex: 0,
        isActive: true,
      },
    ],
    mediaInstructor: [
      {
        id: "ins-1",
        organizationId: ORG_A.id,
        slug: "h-forozandeh",
        displayName: "H. Forozandeh",
        headline: "Control systems",
      },
    ],
  });
}

beforeEach(() => {
  db = seed();
  nav.pathname = "/en/videos";
  nav.query = "";
});

afterEach(() => {
  vi.clearAllMocks();
});

// ── Helpers ──────────────────────────────────────────────────────────────────

const params = <T extends Record<string, string>>(value: T) => Promise.resolve(value);
const search = (value: Record<string, string>) =>
  Promise.resolve(value as Record<string, string | string[] | undefined>);

interface Visited {
  type: unknown;
  props: Record<string, unknown>;
}

/** Depth-first walk of a returned React element tree (no rendering). */
function walk(node: unknown, visit: (el: Visited) => void): void {
  if (Array.isArray(node)) {
    for (const child of node) walk(child, visit);
    return;
  }
  if (node === null || typeof node !== "object") return;
  const el = node as { type?: unknown; props?: Record<string, unknown> };
  if (!("props" in el)) return;
  const props = el.props ?? {};
  visit({ type: el.type, props });
  walk(props.children, visit);
}

function findElement(tree: unknown, type: unknown): Visited | null {
  let found: Visited | null = null;
  walk(tree, (el) => {
    if (found === null && el.type === type) found = el;
  });
  return found;
}

function withIntl(ui: ReactNode, locale: "en" | "fa" = "en"): ReactNode {
  return (
    <NextIntlClientProvider locale={locale} messages={MESSAGES as never} timeZone="UTC">
      <div dir={locale === "fa" ? "rtl" : "ltr"}>{ui}</div>
    </NextIntlClientProvider>
  );
}

/**
 * DISCOVERY-2A — the organization is a PATH SEGMENT, not `?org=`.
 *
 * The assertions below are unchanged in intent: every one of them still proves
 * that an unresolvable request is answered by the SAME `notFound()` as an
 * unpublished asset, so these pages remain useless as a tenant oracle. Only
 * where the selector is read has moved.
 */
async function renderWatch(slug: string, org: string, sp: Record<string, string> = {}) {
  const { default: WatchPage } = await import("../[org]/[slug]/page");
  void sp;
  return WatchPage({ params: params({ locale: "en", org, slug }) });
}

async function renderLibrary(
  org: string,
  sp: Record<string, string> = {},
  locale = "en",
) {
  const { default: LibraryPage } = await import("../[org]/page");
  return LibraryPage({ params: params({ locale, org }), searchParams: search(sp) });
}

/** The bare `/videos` root, which carries no organization and lists nothing. */
async function renderHubRoot(locale = "en") {
  const { default: HubRoot } = await import("../page");
  return HubRoot({ params: params({ locale }) });
}

// ── F. The canonical path, asserted at RUNTIME ───────────────────────────────

/**
 * DISCOVERY-2A pre-PR hardening (F1).
 *
 * The canonical contract used to be guarded only by reading `data.ts` as TEXT
 * and checking it mentioned `mediaWatchPath` and did not contain one specific
 * literal. Independent mutation testing defeated that: rewriting
 *
 *     const canonicalPath = mediaWatchPath(params.scope.orgSlug, asset.slug);
 *   → const canonicalPath = `/videos/${asset.slug}`;
 *
 * kept the word `mediaWatchPath` in the file (it is still imported) and did not
 * match the forbidden literal, so the entire suite stayed green while the exact
 * P0 this phase exists to fix was reintroduced — a canonical URL that 404s.
 *
 * These assertions therefore compare the VALUE the loader and the page actually
 * produce, against a locally spelled-out expectation. The expected string is
 * written literally rather than derived from `mediaWatchPath`, because a test
 * that rebuilds the value with the production helper cannot detect the
 * production helper being bypassed.
 */
describe("F — the canonical video path is produced at runtime, not merely mentioned", () => {
  const ORG = ORG_A.slug;      // "hermes-a"
  const SLUG = "plc-basics";   // the one PUBLISHED + PUBLIC + READY fixture
  const EXPECTED_PATH = `/videos/${ORG}/${SLUG}`;

  it("loadVideoWatch returns the tenant-scoped canonical path exactly", async () => {
    const { loadVideoWatch, resolveVideoHubScope } = await import("../data");
    const scope = await resolveVideoHubScope(ORG);
    expect(scope, "the fixture organization must resolve").not.toBeNull();

    const view = await loadVideoWatch({ scope: scope!, slug: SLUG, routeLocale: "en" });
    expect(view, "the published fixture must load").not.toBeNull();

    // The whole point: an exact value, not a substring and not a source-text probe.
    expect(view!.canonicalPath).toBe(EXPECTED_PATH);
  });

  it("the canonical path is NOT the slug-only or query-string shape", async () => {
    const { loadVideoWatch, resolveVideoHubScope } = await import("../data");
    const scope = await resolveVideoHubScope(ORG);
    const view = await loadVideoWatch({ scope: scope!, slug: SLUG, routeLocale: "en" });

    // The two shapes that 404 in production. Both were live before DISCOVERY-2A.
    expect(view!.canonicalPath).not.toBe(`/videos/${SLUG}`);
    expect(view!.canonicalPath).not.toBe(`/videos/${SLUG}?org=${ORG}`);
    // A canonical URL may never depend on a query string or a fragment.
    expect(view!.canonicalPath).not.toContain("?");
    expect(view!.canonicalPath).not.toContain("#");
    // Four segments: "videos", the organization, the asset — and nothing else.
    expect(view!.canonicalPath.split("/").filter(Boolean)).toEqual(["videos", ORG, SLUG]);
  });

  it("the library href is the tenant-scoped path, not ?org=", async () => {
    const { loadVideoWatch, resolveVideoHubScope } = await import("../data");
    const scope = await resolveVideoHubScope(ORG);
    const view = await loadVideoWatch({ scope: scope!, slug: SLUG, routeLocale: "en" });

    expect(view!.libraryHref).toBe(`/en/videos/${ORG}`);
    expect(view!.libraryHref).not.toContain("?");
  });

  it("every related-video href carries the organization segment", async () => {
    const { loadVideoLibrary, resolveVideoHubScope } = await import("../data");
    const scope = await resolveVideoHubScope(ORG);
    const library = await loadVideoLibrary({ scope: scope!, routeLocale: "en", page: 1 });

    expect(library, "the library must load").not.toBeNull();
    expect(library!.items.length).toBeGreaterThan(0);
    for (const item of library!.items) {
      expect(item.href).toBe(`/en/videos/${ORG}/${item.slug}`);
      expect(item.href).not.toContain("?");
    }
  });

  it("generateMetadata emits the tenant-scoped canonical URL exactly", async () => {
    const { generateMetadata } = await import("../[org]/[slug]/page");
    const { BASE_URL } = await import("@/lib/seo/config");

    const meta = await generateMetadata({
      params: params({ locale: "en", org: ORG, slug: SLUG }),
    });

    expect(meta.alternates?.canonical).toBe(`${BASE_URL}/en${EXPECTED_PATH}`);
    // The OpenGraph URL is built from the same canonical and must not diverge.
    expect((meta.openGraph as { url?: string } | undefined)?.url).toBe(
      `${BASE_URL}/en${EXPECTED_PATH}`,
    );
  });

  it("generateMetadata never emits the slug-only or query-string canonical", async () => {
    const { generateMetadata } = await import("../[org]/[slug]/page");
    const { BASE_URL } = await import("@/lib/seo/config");

    const meta = await generateMetadata({
      params: params({ locale: "en", org: ORG, slug: SLUG }),
    });

    expect(meta.alternates?.canonical).not.toBe(`${BASE_URL}/en/videos/${SLUG}`);
    expect(meta.alternates?.canonical).not.toBe(`${BASE_URL}/en/videos/${SLUG}?org=${ORG}`);

    // Nothing anywhere in the emitted metadata may carry the broken shapes.
    const serialised = JSON.stringify(meta);
    expect(serialised).not.toContain(`/en/videos/${SLUG}"`);
    expect(serialised).not.toContain("?org=");
  });

  it("stays tenant-scoped in every rendering locale", async () => {
    const { generateMetadata } = await import("../[org]/[slug]/page");
    const { BASE_URL } = await import("@/lib/seo/config");

    // This fixture has ONE editorial locale (primaryLocale "en", a single `en`
    // translation), so under the DISCOVERY-2A hreflang contract every locale
    // prefix canonicalises onto that one representation — the same rule that
    // sends /de engineering cases to /en. What must hold in ALL of them is the
    // shape: the organization segment is never dropped.
    for (const locale of ["fa", "en", "de"] as const) {
      const meta = await generateMetadata({
        params: params({ locale, org: ORG, slug: SLUG }),
      });
      expect(meta.alternates?.canonical, `under /${locale}`).toBe(
        `${BASE_URL}/en${EXPECTED_PATH}`,
      );
      expect(String(meta.alternates?.canonical), `under /${locale}`).toContain(`/videos/${ORG}/`);
    }
  });

  it("a single-locale asset declares no fabricated alternates", async () => {
    // Guards the hreflang half of the same metadata call: this asset exists in
    // one language, so it must carry no `languages` map at all.
    const { generateMetadata } = await import("../[org]/[slug]/page");
    const meta = await generateMetadata({
      params: params({ locale: "fa", org: ORG, slug: SLUG }),
    });
    expect(meta.alternates?.languages).toBeUndefined();
  });
});

// ── A. Route classification ──────────────────────────────────────────────────

describe("A — /videos is registered as a PUBLIC, anonymous-readable route", () => {
  const LOCALES = ["fa", "en", "de"] as const;

  it.each(LOCALES)("/%s/videos and its watch pages are never middleware-protected", (loc) => {
    for (const path of [
      `/${loc}/videos`,
      `/${loc}/videos/`,
      // DISCOVERY-2A — the canonical shapes now carry the organization segment.
      `/${loc}/videos/acme`,
      `/${loc}/videos/acme/`,
      `/${loc}/videos/acme/plc-basics`,
      `/${loc}/videos/acme/plc-basics/`,
    ]) {
      expect(isProtectedPath(path), `${path} must stay public`).toBe(false);
    }
  });

  it.each(LOCALES)("/%s/videos is explicitly registered, not merely omitted", (loc) => {
    expect(isPublicAnonymousPath(`/${loc}/videos`)).toBe(true);
    expect(isPublicAnonymousPath(`/${loc}/videos/acme`)).toBe(true);
    expect(isPublicAnonymousPath(`/${loc}/videos/acme/plc-basics`)).toBe(true);
  });

  it("no individual protected matcher captures the Video Hub", () => {
    for (const pattern of PROTECTED_PATHS) {
      expect(pattern.test("/fa/videos"), String(pattern)).toBe(false);
      expect(pattern.test("/en/videos/acme"), String(pattern)).toBe(false);
      expect(pattern.test("/en/videos/acme/plc-basics"), String(pattern)).toBe(false);
      expect(pattern.test("/de/videos"), String(pattern)).toBe(false);
    }
  });

  it("the registration is segment-safe and does not leak onto neighbours", () => {
    // A hypothetical protected sibling must not inherit the public declaration.
    expect(isPublicAnonymousPath("/en/videos-admin")).toBe(false);
    expect(isPublicAnonymousPath("/videos")).toBe(false); // locale-less: next-intl redirects first
  });

  it("no protection was weakened elsewhere — /dashboard and /admin stay protected", () => {
    for (const loc of LOCALES) {
      expect(isProtectedPath(`/${loc}/dashboard`)).toBe(true);
      expect(isProtectedPath(`/${loc}/admin`)).toBe(true);
      expect(isPublicAnonymousPath(`/${loc}/dashboard`)).toBe(false);
    }
  });
});

// ── B. The watch page refuses everything that is not published ───────────────

describe("B — the watch page calls notFound() for anything not PUBLISHED + PUBLIC + READY", () => {
  const REFUSED: ReadonlyArray<readonly [string, string]> = [
    ["a draft", "secret-draft"],
    ["an asset awaiting review", "awaiting-review"],
    ["an organization-visibility asset", "internal-only"],
    ["an asset still validating", "still-validating"],
    ["quarantined bytes", "quarantined-bytes"],
    ["another tenant's asset", "other-tenant-draft"],
    ["an unknown slug", "no-such-video"],
  ];

  it.each(REFUSED)("%s → notFound()", async (_label, slug) => {
    await expect(renderWatch(slug, ORG_A.slug)).rejects.toThrow(NOT_FOUND);
  });

  it("a malformed organization segment → notFound(), not a cross-tenant search", async () => {
    await expect(renderWatch("plc-basics", "Not An Org!")).rejects.toThrow(NOT_FOUND);
    await expect(renderWatch("plc-basics", "")).rejects.toThrow(NOT_FOUND);
  });

  it("an unknown organization → the same notFound() as an unpublished asset", async () => {
    await expect(renderWatch("plc-basics", "no-such-org")).rejects.toThrow(NOT_FOUND);
  });

  it("another tenant's organization segment cannot reach this tenant's asset", async () => {
    // ORG_B is a real organization; `plc-basics` belongs to ORG_A. The pair must
    // not resolve, and must fail exactly like an unknown slug.
    await expect(renderWatch("plc-basics", ORG_B.slug)).rejects.toThrow(NOT_FOUND);
  });

  it("a malformed slug is a 404, never a 400 — the answer must not classify the input", async () => {
    await expect(renderWatch("Not A Slug!", ORG_A.slug)).rejects.toThrow(NOT_FOUND);
  });

  it("generateMetadata refuses indexing for a slug that did not resolve", async () => {
    const { generateMetadata } = await import("../[org]/[slug]/page");
    const meta = await generateMetadata({
      params: params({ locale: "en", org: ORG_A.slug, slug: "secret-draft" }),
    });
    expect(meta.robots).toEqual({ index: false, follow: false });
    // No editorial copy from the hidden row leaked into the tab title.
    expect(JSON.stringify(meta)).not.toContain("Unreleased Draft");
  });

  it("generateMetadata refuses indexing for an unresolvable organization too", async () => {
    const { generateMetadata } = await import("../[org]/[slug]/page");
    const meta = await generateMetadata({
      params: params({ locale: "en", org: "no-such-org", slug: "plc-basics" }),
    });
    expect(meta.robots).toEqual({ index: false, follow: false });
  });
});

// ── C. The published asset does render, honestly ─────────────────────────────

describe("C — a published, public, validated asset reaches the player", () => {
  it("mints same-origin URLs for the stream, the poster and every caption track", async () => {
    const tree = await renderWatch("plc-basics", ORG_A.slug);
    const player = findElement(tree, MediaPlayer);
    expect(player, "the watch page must render MediaPlayer").not.toBeNull();

    const media = (player as unknown as Visited).props.media as Record<string, unknown>;
    expect(media.src).toBe("/api/media/assets/a-public/stream");
    expect(media.slug).toBe("plc-basics");
    expect(media.processingState).toBe("READY");

    // POSTER. This used to be pinned at `null` on the grounds that no route
    // served the bytes. `GET …/poster` exists and serves exactly this class of
    // asset — PUBLISHED + PUBLIC + READY — so a constant null was no longer an
    // honest absence, it was a product defect.
    expect(media.posterUrl).toBe("/api/media/assets/a-public/poster");

    // CAPTIONS. Same story, and each track is addressed by its OWN id because
    // that is what `/subtitles/[trackId]` takes. The default track sorts first.
    expect(media.subtitleTracks).toEqual([
      {
        id: "trk-en",
        locale: "en",
        label: "English",
        src: "/api/media/assets/a-public/subtitles/trk-en",
        isDefault: true,
      },
      {
        id: "trk-fa",
        locale: "fa",
        label: "فارسی",
        src: "/api/media/assets/a-public/subtitles/trk-fa",
        isDefault: false,
      },
    ]);

    // Still an honest absence: an anonymous visitor has no progress to resume.
    expect(media.progress).toBeNull();
    // Chapters DO exist and are passed through, resolved for the route locale.
    expect((media.chapters as unknown[]).length).toBe(1);
  });

  it("never mints a URL from another tenant's track row", async () => {
    const tree = await renderWatch("plc-basics", ORG_A.slug);
    const player = findElement(tree, MediaPlayer);
    const media = (player as unknown as Visited).props.media as Record<string, unknown>;

    const tracks = media.subtitleTracks as Array<{ id: string; src: string }>;
    expect(tracks.map((t) => t.id)).not.toContain("trk-b");
    expect(JSON.stringify(tracks)).not.toContain("Leaked");
    expect(JSON.stringify(tracks)).not.toContain(ORG_B.id);
  });

  it("reports posterUrl null for an asset that carries no poster key", async () => {
    // Guards the guard: if `posterSrc` returned a URL unconditionally, the
    // assertion above would pass while the product invented a 404 for every
    // asset without a poster.
    const { loadVideoWatch } = await import("../data");
    const view = await loadVideoWatch({
      scope: { organizationId: ORG_A.id, orgSlug: ORG_A.slug },
      slug: "plc-basics",
      routeLocale: "en",
    });
    expect(view?.playback.posterUrl).toBe("/api/media/assets/a-public/poster");

    // Same loader, an asset whose poster column is empty.
    db.tables.mediaAsset[0].posterStorageKey = null;
    const without = await loadVideoWatch({
      scope: { organizationId: ORG_A.id, orgSlug: ORG_A.slug },
      slug: "plc-basics",
      routeLocale: "en",
    });
    expect(without?.playback.posterUrl).toBeNull();
  });

  it("reports an empty track list for an asset with no caption rows", async () => {
    const { loadVideoWatch } = await import("../data");
    db.tables.mediaSubtitleTrack.length = 0;
    const view = await loadVideoWatch({
      scope: { organizationId: ORG_A.id, orgSlug: ORG_A.slug },
      slug: "plc-basics",
      routeLocale: "en",
    });
    expect(view?.playback.subtitleTracks).toEqual([]);
  });

  it("renders exactly one h1 and leaks no storage key or organization id", async () => {
    const tree = await renderWatch("plc-basics", ORG_A.slug);
    const headings: unknown[] = [];
    walk(tree, (el) => {
      if (el.type === "h1") headings.push(el);
    });
    expect(headings.length).toBe(1);

    const serialised = JSON.stringify(tree, (_k, v) => (typeof v === "function" ? undefined : v));
    expect(serialised).not.toContain("media/org-A");
    expect(serialised).not.toContain(ORG_A.id);
  });
});

// ── D. The library page's empty state ────────────────────────────────────────

describe("D — the library page renders the empty state when there are no results", () => {
  it("an organization with nothing published gets LIBRARY_EMPTY, not an error", async () => {
    const tree = await renderLibrary(ORG_B.slug);
    const { container, unmount } = await mount(withIntl(tree));
    try {
      const t = createTranslator({
        locale: "en",
        messages: MESSAGES as never,
        namespace: "mediaHub" as never,
      }) as unknown as (key: string) => string;

      expect(container.textContent).toContain(t("empty.LIBRARY_EMPTY.title"));
      // Not an error, and not a fabricated row.
      expect(container.textContent).not.toContain(t("failure.STORAGE_UNAVAILABLE.title"));
      expect(container.querySelectorAll("li").length).toBe(0);
      // Exactly one page heading.
      expect(container.querySelectorAll("h1").length).toBe(1);
      // The count is reported honestly rather than omitted.
      expect(container.textContent).toContain("0");
    } finally {
      await unmount();
    }
  });

  it("an unknown organization is answered identically to an empty one — no tenant oracle", async () => {
    // DISCOVERY-2A — this is the oracle property, and it is now stated against
    // the pair that actually matters: a segment naming an organization that does
    // NOT exist must render byte-identically to one naming a real organization
    // with nothing published. If the two ever diverged, `/videos/{guess}` would
    // become a tenant-existence probe.
    const unknownOrg = await renderLibrary("no-such-org");
    const emptyRealOrg = await renderLibrary(ORG_B.slug);
    const a = await mount(withIntl(unknownOrg));
    const b = await mount(withIntl(emptyRealOrg));
    try {
      expect(a.container.textContent).toBe(b.container.textContent);
    } finally {
      await a.unmount();
      await b.unmount();
    }
  });

  it("a malformed organization segment is answered identically too", async () => {
    const malformed = await renderLibrary("Not An Org!");
    const emptyRealOrg = await renderLibrary(ORG_B.slug);
    const a = await mount(withIntl(malformed));
    const b = await mount(withIntl(emptyRealOrg));
    try {
      // Never a 404 and never an error: a malformed selector reveals nothing
      // that an empty library does not already reveal.
      expect(a.container.textContent).toBe(b.container.textContent);
    } finally {
      await a.unmount();
      await b.unmount();
    }
  });

  it("the bare /videos root lists nothing and is explicitly not indexed", async () => {
    const { generateMetadata } = await import("../page");
    const meta = await generateMetadata({ params: params({ locale: "en" }) });
    expect(meta.robots).toEqual({ index: false, follow: true });

    const tree = await renderHubRoot();
    const { container, unmount } = await mount(withIntl(tree));
    try {
      // No organization is named here, so this route cannot become a tenant
      // directory by accident.
      expect(container.querySelectorAll("li").length).toBe(0);
      expect(container.textContent).not.toContain(ORG_A.slug);
      expect(container.textContent).not.toContain(ORG_B.slug);
    } finally {
      await unmount();
    }
  });

  it("a filter that matches nothing says NO_MATCHES, not LIBRARY_EMPTY", async () => {
    const tree = await renderLibrary(ORG_A.slug, { category: "no-such-category" });
    const { container, unmount } = await mount(withIntl(tree));
    try {
      const t = createTranslator({
        locale: "en",
        messages: MESSAGES as never,
        namespace: "mediaHub" as never,
      }) as unknown as (key: string) => string;
      expect(container.textContent).toContain(t("empty.NO_MATCHES.title"));
      expect(container.textContent).not.toContain(t("empty.LIBRARY_EMPTY.title"));
    } finally {
      await unmount();
    }
  });

  it("a populated library lists only the published asset — the five hidden ones never appear", async () => {
    const tree = await renderLibrary(ORG_A.slug);
    const { container, unmount } = await mount(withIntl(tree));
    try {
      expect(container.textContent).toContain("PLC Basics");
      for (const hidden of ["Unreleased Draft", "Internal Only", "secret-draft", "quarantined-bytes"]) {
        expect(container.textContent, `${hidden} must never be rendered`).not.toContain(hidden);
      }
    } finally {
      await unmount();
    }
  });
});

// ── E. The gate came from the repository, not from the page ──────────────────

describe("E — the published-only gate is applied in the database query", () => {
  it("every mediaAsset read carried status, visibility and processingState", async () => {
    db.reset();
    await renderLibrary(ORG_A.slug);
    const wheres = db.wheres("mediaAsset");
    expect(wheres.length).toBeGreaterThan(0);
    for (const where of wheres) {
      expect(where.status).toBe("PUBLISHED");
      expect(where.visibility).toBe("PUBLIC");
      expect(where.processingState).toBe("READY");
      expect(where.organizationId).toBe(ORG_A.id);
    }
  });

  it("the watch page's read is gated and tenant-scoped too", async () => {
    db.reset();
    await renderWatch("plc-basics", ORG_A.slug);
    const wheres = db.wheres("mediaAsset");
    expect(wheres.length).toBeGreaterThan(0);
    for (const where of wheres) {
      expect(where.status).toBe("PUBLISHED");
      expect(where.visibility).toBe("PUBLIC");
      expect(where.processingState).toBe("READY");
      expect(where.organizationId).toBe(ORG_A.id);
    }
  });

  it("the pages never construct the editorial opt-out", async () => {
    const { readFileSync } = await import("node:fs");
    const { join } = await import("node:path");
    const root = join(process.cwd(), "src", "app", "[locale]", "videos");
    // DISCOVERY-2A — the watch page moved under the organization segment and a
    // per-organization library page joined it. Every file that can reach the
    // repository is still covered; missing one would let the opt-out back in.
    for (const file of ["data.ts", "page.tsx", "[org]/page.tsx", "[org]/[slug]/page.tsx"]) {
      const source = readFileSync(join(root, file), "utf8");
      expect(source, `${file} must not opt out of the published-only gate`).not.toContain(
        "includeUnpublished",
      );
      expect(source, `${file} must not construct an EDITORIAL audience`).not.toContain(
        'scope: "EDITORIAL"',
      );
    }
  });
});
