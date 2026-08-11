/**
 * PHASE 102 / RELEASE BLOCKER 4 — a stored key must belong to the tenant and
 * asset the request authorized.
 *
 * THE DEFECT
 * All three byte routes read a key off a row and served it after a SHAPE check
 * only. `isMediaStorageKey` proves a key is well-formed; it never says WHOSE it
 * is. The tenant binding therefore rested entirely on the assumption that a
 * row's key names that row's own organization and asset — and nothing in the
 * database enforces that. A key naming another tenant can reach a row through a
 * legacy import, a restore, a mis-scoped backfill, or any writer that predates
 * or bypasses `buildMediaStorageKey`. The read would then succeed with every
 * RBAC check passing, because the ROW was legitimately reachable: organization A
 * asking for its own asset, served organization B's bytes.
 *
 * WHY THE EXISTING SUITES COULD NOT CATCH IT
 * Every fixture built its keys with the matching organization and asset, so the
 * assumption was true in every test that had ever run. These fixtures poison the
 * row deliberately.
 *
 * WHAT IS REAL HERE
 * The repository layer, the audience gate, the byte-serving chain and the key
 * algebra all execute unmocked. Only Prisma and the object store are doubled.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  ASSET_ID,
  ORG_A,
  ORG_B,
  buildPublicReadyAsset,
  emptyStore,
  getRequest,
  multipartUrl,
  routeParams,
  type FakeStore,
} from "./harness";

const h = vi.hoisted(() => ({
  store: { assets: [], subtitles: [] } as FakeStore,
  /** Keys the routes actually asked the storage layer to open. */
  opened: [] as string[],
}));

vi.mock("@/lib/db/prisma", () => ({
  getPrisma: async () => {
    const { createFakePrisma } = await import("./harness");
    return createFakePrisma(h.store);
  },
}));

vi.mock("@/lib/org/context", () => ({
  // A member of ORG_A with a real role. Tenancy is decided by the repository
  // query and by the key binding — never by this double.
  requireOrgActor: async (_req: unknown, orgId: string) =>
    orgId === ORG_A
      ? { ctx: { userId: "user-1", orgId, memberId: "member-1", role: "ENGINEER", status: "ACTIVE" } }
      : { error: "Not a member", status: 403 },
}));

vi.mock("@/lib/media/storage", async (importOriginal) => {
  const actual: typeof import("@/lib/media/storage") =
    await importOriginal<typeof import("@/lib/media/storage")>();
  return {
    ...actual,
    // Records the attempt and answers as though the object exists. A route that
    // skipped the tenancy check would therefore SUCCEED here — the double is
    // deliberately permissive so the only thing that can refuse is the route.
    openMediaObject: async (key: string) => {
      h.opened.push(key);
      return null;
    },
    openMediaByteRange: async (key: string) => {
      h.opened.push(key);
      return null;
    },
    statMediaObject: async (key: string) => {
      h.opened.push(key);
      return null;
    },
  };
});

const TRACK_ID = "track00000000000000001";
const UUID = "11111111-2222-4333-8444-555555555555";

/** A well-formed key that names `org`/`asset`. Poisoning = passing the wrong pair. */
function keyFor(org: string, asset: string, extension: string): string {
  return `media/${org}/${asset}/${UUID}.${extension}`;
}

function subtitleUrl(assetId: string, trackId: string): string {
  return `http://hermes.test/api/media/assets/${assetId}/subtitles/${trackId}`;
}

beforeEach(() => {
  h.store = emptyStore();
  h.opened = [];
  vi.resetModules();
});

afterEach(() => {
  vi.clearAllMocks();
});

/* ═════════════════════════ stream and poster ════════════════════════════════ */

interface ByteSurface {
  readonly name: string;
  readonly column: "storageKey" | "posterStorageKey";
  readonly extension: string;
  readonly call: (assetId: string) => Promise<Response>;
}

const SURFACES: readonly ByteSurface[] = [
  {
    name: "GET …/stream",
    column: "storageKey",
    extension: "mp4",
    call: async (assetId) => {
      const { GET } = await import("../../assets/[id]/stream/route");
      return GET(getRequest(multipartUrl(assetId, "stream")) as never, routeParams(assetId) as never);
    },
  },
  {
    name: "GET …/poster",
    column: "posterStorageKey",
    extension: "png",
    call: async (assetId) => {
      const { GET } = await import("../../assets/[id]/poster/route");
      return GET(getRequest(multipartUrl(assetId, "poster")) as never, routeParams(assetId) as never);
    },
  },
];

for (const surface of SURFACES) {
  describe(`${surface.name} — the stored key must belong to the authorized scope`, () => {
    /** The poisoned shapes, each a well-formed key pointing somewhere it should not. */
    const POISONED: ReadonlyArray<readonly [string, string]> = [
      ["another organization", keyFor(ORG_B, ASSET_ID, "EXT")],
      ["another asset in the same organization", keyFor(ORG_A, "assetsomeoneelse0001", "EXT")],
      ["both another organization and another asset", keyFor(ORG_B, "assetsomeoneelse0001", "EXT")],
    ];

    for (const [label, template] of POISONED) {
      it(`refuses a key naming ${label}, without opening anything`, async () => {
        const asset = buildPublicReadyAsset({
          [surface.column]: template.replace("EXT", surface.extension),
          // The poster surface needs the video key present and legitimate so the
          // refusal can only come from the poster key under test.
          ...(surface.column === "posterStorageKey"
            ? { storageKey: keyFor(ORG_A, ASSET_ID, "mp4") }
            : {}),
        });
        h.store.assets.push(asset);

        const res = await surface.call(ASSET_ID);

        expect(res.status).toBe(404);
        // Nothing was opened: the refusal happened above the storage layer.
        expect(h.opened).toEqual([]);
      });
    }

    it("refuses a traversal key, as before", async () => {
      h.store.assets.push(
        buildPublicReadyAsset({
          [surface.column]: `media/${ORG_A}/../../../etc/passwd`,
          ...(surface.column === "posterStorageKey"
            ? { storageKey: keyFor(ORG_A, ASSET_ID, "mp4") }
            : {}),
        }),
      );

      const res = await surface.call(ASSET_ID);
      expect(res.status).toBe(404);
      expect(h.opened).toEqual([]);
    });

    it("refuses a key whose organization segment is a PREFIX of the real one", async () => {
      // A `startsWith`-style comparison would accept this. Segment equality does not.
      h.store.assets.push(
        buildPublicReadyAsset({
          [surface.column]: keyFor(ORG_A.slice(0, -1), ASSET_ID, surface.extension),
          ...(surface.column === "posterStorageKey"
            ? { storageKey: keyFor(ORG_A, ASSET_ID, "mp4") }
            : {}),
        }),
      );

      const res = await surface.call(ASSET_ID);
      expect(res.status).toBe(404);
      expect(h.opened).toEqual([]);
    });

    it("DOES reach storage for a correctly bound key — the gate is not always closed", async () => {
      h.store.assets.push(
        buildPublicReadyAsset({
          [surface.column]: keyFor(ORG_A, ASSET_ID, surface.extension),
          ...(surface.column === "posterStorageKey"
            ? { storageKey: keyFor(ORG_A, ASSET_ID, "mp4") }
            : {}),
        }),
      );

      await surface.call(ASSET_ID);

      // The object double answers `null`, so the response is a refusal either
      // way; what this proves is that the route got PAST the tenancy check.
      expect(h.opened.length).toBeGreaterThan(0);
      expect(h.opened[0]).toContain(`/${ORG_A}/${ASSET_ID}/`);
    });
  });
}

/* ═══════════════════════════ subtitles/[trackId] ════════════════════════════ */

describe("GET …/subtitles/[trackId] — the track's own key must belong to the scope", () => {
  function seed(trackKey: string): void {
    h.store.assets.push(buildPublicReadyAsset({ storageKey: keyFor(ORG_A, ASSET_ID, "mp4") }));
    h.store.subtitles.push({
      id: TRACK_ID,
      organizationId: ORG_A,
      mediaAssetId: ASSET_ID,
      locale: "en",
      label: "English",
      storageKey: trackKey,
      format: "vtt",
      isDefault: true,
    });
  }

  async function callSubtitle(): Promise<Response> {
    const { GET } = await import("../../assets/[id]/subtitles/[trackId]/route");
    return GET(getRequest(subtitleUrl(ASSET_ID, TRACK_ID)) as never, {
      params: Promise.resolve({ id: ASSET_ID, trackId: TRACK_ID }),
    } as never);
  }

  it("refuses a track row whose key names another organization", async () => {
    // The ROW is correctly scoped — organizationId and mediaAssetId both match,
    // so the tenant-pinned lookup finds it. Only the KEY is poisoned, which is
    // exactly the case a row-level predicate cannot catch.
    seed(keyFor(ORG_B, ASSET_ID, "vtt"));

    const res = await callSubtitle();

    expect(res.status).toBe(404);
    expect(h.opened).toEqual([]);
  });

  it("refuses a track row whose key names another asset", async () => {
    seed(keyFor(ORG_A, "assetsomeoneelse0001", "vtt"));

    const res = await callSubtitle();

    expect(res.status).toBe(404);
    expect(h.opened).toEqual([]);
  });

  it("DOES reach storage for a correctly bound track key", async () => {
    seed(keyFor(ORG_A, ASSET_ID, "vtt"));

    await callSubtitle();

    expect(h.opened.length).toBeGreaterThan(0);
    expect(h.opened[0]).toBe(keyFor(ORG_A, ASSET_ID, "vtt"));
  });
});

/* ══════════════════════════ the algebra itself ══════════════════════════════ */

describe("isStorageKeyBoundTo", () => {
  it("accepts only an exact match on BOTH segments", async () => {
    const { isStorageKeyBoundTo } = await import("@/lib/media/storage-key");
    const scope = { organizationId: ORG_A, assetId: ASSET_ID };

    expect(isStorageKeyBoundTo(keyFor(ORG_A, ASSET_ID, "mp4"), scope)).toBe(true);
    expect(isStorageKeyBoundTo(keyFor(ORG_B, ASSET_ID, "mp4"), scope)).toBe(false);
    expect(isStorageKeyBoundTo(keyFor(ORG_A, "other", "mp4"), scope)).toBe(false);
  });

  it("fails closed on anything that is not a well-formed key", async () => {
    const { isStorageKeyBoundTo } = await import("@/lib/media/storage-key");
    const scope = { organizationId: ORG_A, assetId: ASSET_ID };

    for (const bad of [
      null,
      undefined,
      "",
      42,
      {},
      `media/${ORG_A}/${ASSET_ID}/../../etc/passwd`,
      `media/${ORG_A}/${ASSET_ID}/${UUID}.exe`,
      `media/${ORG_A}/${ASSET_ID}/not-a-uuid.mp4`,
      `/media/${ORG_A}/${ASSET_ID}/${UUID}.mp4`,
      `media/${ORG_A}/${ASSET_ID}/${UUID}.mp4/`,
    ]) {
      expect(isStorageKeyBoundTo(bad, scope), String(bad)).toBe(false);
    }
  });

  it("is not fooled by a prefix or suffix of a real segment", async () => {
    const { isStorageKeyBoundTo } = await import("@/lib/media/storage-key");
    const scope = { organizationId: ORG_A, assetId: ASSET_ID };

    expect(isStorageKeyBoundTo(keyFor(ORG_A.slice(0, -1), ASSET_ID, "mp4"), scope)).toBe(false);
    expect(isStorageKeyBoundTo(keyFor(`${ORG_A}x`, ASSET_ID, "mp4"), scope)).toBe(false);
    expect(isStorageKeyBoundTo(keyFor(ORG_A, `${ASSET_ID}x`, "mp4"), scope)).toBe(false);
  });

  it("parses back exactly what buildMediaStorageKey minted", async () => {
    const { buildMediaStorageKey } = await import("@/lib/media/storage");
    const { parseMediaStorageKey } = await import("@/lib/media/storage-key");

    const minted = buildMediaStorageKey({
      organizationId: ORG_A,
      assetId: ASSET_ID,
      extension: "mp4",
    });

    expect(parseMediaStorageKey(minted)).toEqual({ organizationId: ORG_A, assetId: ASSET_ID });
  });
});
