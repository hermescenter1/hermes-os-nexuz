/**
 * PHASE 102 — adversarial tests for POST /api/media/assets/[id]/upload.
 *
 * The subject is the HTTP boundary of the highest-risk surface in the phase: the
 * one that turns an untrusted byte stream into a file the server will later hand
 * back to browsers. Every test below is either a control that must hold or an
 * attack that must fail closed.
 *
 * The repository layer and the validator are REAL — only the transport-adjacent
 * seams (Prisma, object storage, the limiter, the entitlement resolver, the audit
 * sink and the org guard) are doubled — so the audience gate, the magic-byte
 * table and the filename rules are genuinely exercised.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  ASSET_ID,
  ORG_A,
  ORG_B,
  buildAsset,
  emptyStore,
  emptyMultipartRequest,
  mp4Bytes,
  multipartRequest,
  multipartUrl,
  pngBytes,
  routeParams,
  shellScriptBytes,
  upload,
  type FakeStore,
} from "./harness";

const h = vi.hoisted(() => ({
  store: { assets: [], subtitles: [] } as FakeStore,
  prismaAvailable: true,
  session: null as null | { userId: string; orgId: string; role: string },
  /** How the caller authenticated. The origin gate applies to `jwt` only. */
  authMethod: "jwt" as "jwt" | "apikey",
  actorOrgIds: [] as string[],
  rateLimited: false,
  rateLimitKeys: [] as Array<{ bucket: string; key: string }>,
  entitlementAllowed: true,
  entitlementCalls: [] as Array<Record<string, unknown>>,
  audit: [] as Array<Record<string, unknown>>,
  puts: [] as Array<{ key: string; contentType: string; size: number }>,
  deletes: [] as string[],
  putThrows: false,
  casConflict: false,
}));

vi.mock("@/lib/db/prisma", () => ({
  getPrisma: async () => {
    if (!h.prismaAvailable) return null;
    const { createFakePrisma } = await import("./harness");
    const client = createFakePrisma(h.store);
    if (h.casConflict) {
      // Simulate another replica winning the race in the window between the
      // route's read and its compare-and-swap write.
      const original = client.mediaAsset.updateMany;
      client.mediaAsset.updateMany = async (args: Record<string, unknown>) => {
        const data = args.data as Record<string, unknown>;
        if (typeof data?.storageKey === "string") {
          for (const row of h.store.assets) row.processingState = "UPLOADED";
        }
        return original(args);
      };
    }
    return client;
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
  retryAfter: () => 42,
}));

vi.mock("@/lib/billing-governance/runtime/require-entitlement", async () => {
  const { NextResponse } = await import("next/server");
  return {
    enforceEntitlement: async (args: Record<string, unknown>) => {
      h.entitlementCalls.push(args);
      if (h.entitlementAllowed) return { ok: true, decision: { allowed: true } };
      return {
        ok: false,
        decision: { allowed: false },
        response: NextResponse.json({ error: "ENTITLEMENT_REQUIRED" }, { status: 402 }),
      };
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
      if (h.putThrows) throw new actual.MediaStorageError("invalid_storage_key", "refused");
      // Delegate to the REAL key validator so a route that minted a bad key fails
      // here exactly as it would in production.
      actual.assertMediaStorageKey(args.key);
      h.puts.push({ key: args.key, contentType: args.contentType, size: args.body.byteLength });
      return { key: args.key, sizeBytes: args.body.byteLength };
    },
    deleteMediaObject: async (key: string) => {
      h.deletes.push(key);
    },
  };
});

const URL_UPLOAD = multipartUrl(ASSET_ID, "upload");

async function route() {
  return import("../../assets/[id]/upload/route");
}

function videoForm(file: File, extra: Record<string, string> = {}): FormData {
  const form = new FormData();
  form.set("file", file);
  for (const [k, v] of Object.entries(extra)) form.set(k, v);
  return form;
}

beforeEach(() => {
  h.store = emptyStore();
  h.store.assets.push(buildAsset());
  h.prismaAvailable = true;
  h.authMethod = "jwt";
  h.session = { userId: "user-1", orgId: ORG_A, role: "ENGINEER" };
  h.actorOrgIds = [];
  h.rateLimited = false;
  h.rateLimitKeys = [];
  h.entitlementAllowed = true;
  h.entitlementCalls = [];
  h.audit = [];
  h.puts = [];
  h.deletes = [];
  h.putThrows = false;
  h.casConflict = false;
  vi.resetModules();
});

afterEach(() => {
  vi.clearAllMocks();
});

// ── The control path ─────────────────────────────────────────────────────────

describe("upload — accepted video", () => {
  it("stores the bytes under a SERVER-GENERATED key and advances PENDING_UPLOAD → UPLOADED", async () => {
    const { POST } = await route();
    const form = videoForm(upload("Commissioning.mp4", "video/mp4", mp4Bytes(64)));
    const res = await POST(multipartRequest(URL_UPLOAD, form), routeParams(ASSET_ID));

    expect(res.status).toBe(201);
    const payload = await res.json();
    expect(payload.ok).toBe(true);
    expect(payload.data.processingState).toBe("UPLOADED");
    expect(payload.data.contentType).toBe("video/mp4");
    expect(payload.data.byteSize).toBe(96);

    // The key is minted server-side and never disclosed.
    expect(h.puts).toHaveLength(1);
    expect(h.puts[0].key).toMatch(
      new RegExp(
        `^media/${ORG_A}/${ASSET_ID}/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\\.mp4$`,
      ),
    );
    expect(JSON.stringify(payload)).not.toContain("media/");

    const row = h.store.assets[0];
    expect(row.processingState).toBe("UPLOADED");
    expect(row.storageKey).toBe(h.puts[0].key);
    expect(row.contentType).toBe("video/mp4");
    expect(row.byteSize).toBe(96);
    expect(typeof row.checksumSha256).toBe("string");
    expect(res.headers.get("Cache-Control")).toBe("no-store");
  });

  it("derives the storage key from the ASSET, never from a client-supplied key field", async () => {
    const { POST } = await route();
    const form = videoForm(upload("clip.mp4", "video/mp4", mp4Bytes()), {
      storageKey: "media/../../../../etc/passwd",
      key: "media/other-org/other-asset/aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee.mp4",
      organizationId: ORG_B,
      path: "/etc/shadow",
    });
    const res = await POST(multipartRequest(URL_UPLOAD, form), routeParams(ASSET_ID));

    expect(res.status).toBe(201);
    expect(h.puts[0].key.startsWith(`media/${ORG_A}/${ASSET_ID}/`)).toBe(true);
    expect(h.puts[0].key).not.toContain("passwd");
    expect(h.puts[0].key).not.toContain(ORG_B);
    // The tenant written to the row is the one the ASSET belongs to.
    expect(h.store.assets[0].organizationId).toBe(ORG_A);
  });

  it("normalises an accepted alias extension to the canonical one", async () => {
    const { POST } = await route();
    const form = videoForm(upload("clip.m4v", "video/x-m4v", mp4Bytes()));
    const res = await POST(multipartRequest(URL_UPLOAD, form), routeParams(ASSET_ID));
    expect(res.status).toBe(201);
    expect(h.puts[0].key.endsWith(".mp4")).toBe(true);
    expect(h.puts[0].contentType).toBe("video/mp4");
  });
});

// ── Content-type spoofing ────────────────────────────────────────────────────

describe("upload — MIME spoofing", () => {
  it("refuses a shell script declared as video/mp4 and never writes a byte", async () => {
    const { POST } = await route();
    const form = videoForm(upload("payload.mp4", "video/mp4", shellScriptBytes()));
    const res = await POST(multipartRequest(URL_UPLOAD, form), routeParams(ASSET_ID));

    expect(res.status).toBe(422);
    expect((await res.json()).error).toBe("magic_bytes_mismatch");
    expect(h.puts).toHaveLength(0);
  });

  it("parks the refusal on the row as FAILED with the exact reason, deleting nothing", async () => {
    const { POST } = await route();
    const form = videoForm(upload("payload.mp4", "video/mp4", shellScriptBytes()));
    await POST(multipartRequest(URL_UPLOAD, form), routeParams(ASSET_ID));

    const row = h.store.assets[0];
    expect(row.processingState).toBe("FAILED");
    expect(row.processingFailureCode).toBe("magic_bytes_mismatch");
    expect(row.storageKey).toBeNull();
    expect(h.deletes).toHaveLength(0);
    expect(h.audit.some((e) => e.action === "media.upload.rejected")).toBe(true);
  });

  it("refuses a declared type that disagrees with the filename extension", async () => {
    const { POST } = await route();
    const form = videoForm(upload("clip.webm", "video/mp4", mp4Bytes()));
    const res = await POST(multipartRequest(URL_UPLOAD, form), routeParams(ASSET_ID));
    expect(res.status).toBe(422);
    expect((await res.json()).error).toBe("mime_extension_mismatch");
    expect(h.puts).toHaveLength(0);
  });

  it("refuses application/octet-stream outright", async () => {
    const { POST } = await route();
    const form = videoForm(upload("clip.mp4", "application/octet-stream", mp4Bytes()));
    const res = await POST(multipartRequest(URL_UPLOAD, form), routeParams(ASSET_ID));
    expect(res.status).toBe(422);
    expect((await res.json()).error).toBe("unsupported_media_type");
  });

  it("refuses a valid non-video file on the video surface", async () => {
    const { POST } = await route();
    const form = videoForm(upload("poster.png", "image/png", pngBytes()));
    const res = await POST(multipartRequest(URL_UPLOAD, form), routeParams(ASSET_ID));
    expect(res.status).toBe(415);
    expect(h.puts).toHaveLength(0);
  });
});

// ── Size ─────────────────────────────────────────────────────────────────────

describe("upload — size ceiling", () => {
  it("rejects an oversized declared Content-Length before parsing the body", async () => {
    const { POST } = await route();
    const res = await POST(
      emptyMultipartRequest(URL_UPLOAD, { "content-length": String(80 * 1024 * 1024) }),
      routeParams(ASSET_ID),
    );
    expect(res.status).toBe(413);
    expect((await res.json()).error).toBe("file_too_large");
    // Refused before the tenant lookup, so no authorization work was done either.
    expect(h.actorOrgIds).toHaveLength(0);
  });

  it("rejects a file whose real size exceeds the 50 MB ceiling", async () => {
    const { POST } = await route();
    const oversized = Buffer.concat([mp4Bytes(), Buffer.alloc(50 * 1024 * 1024)]);
    const form = videoForm(upload("huge.mp4", "video/mp4", oversized));
    const res = await POST(multipartRequest(URL_UPLOAD, form), routeParams(ASSET_ID));
    expect(res.status).toBe(413);
    expect(h.puts).toHaveLength(0);
  });

  it("rejects an empty file", async () => {
    const { POST } = await route();
    const form = videoForm(upload("empty.mp4", "video/mp4", Buffer.alloc(0)));
    const res = await POST(multipartRequest(URL_UPLOAD, form), routeParams(ASSET_ID));
    expect(res.status).toBe(400);
    expect((await res.json()).error).toBe("file_empty");
  });
});

// ── Filenames ────────────────────────────────────────────────────────────────

describe("upload — hostile filenames", () => {
  const hostile: Array<[string, string]> = [
    ["path traversal", "../../../../etc/passwd.mp4"],
    ["windows traversal", "..\\..\\windows\\system32\\clip.mp4"],
    ["absolute path", "/var/www/html/shell.mp4"],
    ["parent segment", "video..mp4"],
  ];

  for (const [label, name] of hostile) {
    it(`refuses ${label} rather than silently rewriting it`, async () => {
      const { POST } = await route();
      const form = videoForm(upload(name, "video/mp4", mp4Bytes()));
      const res = await POST(multipartRequest(URL_UPLOAD, form), routeParams(ASSET_ID));
      expect(res.status).toBe(400);
      expect((await res.json()).error).toBe("filename_invalid");
      expect(h.puts).toHaveLength(0);
    });
  }

  it("refuses a RIGHT-TO-LEFT OVERRIDE extension disguise", async () => {
    const { POST } = await route();
    // "clip<U+202E>4pm.exe" renders as "clipexe.mp4" in a file listing.
    const disguised = `clip${String.fromCharCode(0x202e)}4pm.mp4`;
    const form = videoForm(upload(disguised, "video/mp4", mp4Bytes()));
    const res = await POST(multipartRequest(URL_UPLOAD, form), routeParams(ASSET_ID));
    expect(res.status).toBe(400);
    expect((await res.json()).error).toBe("filename_invalid");
    expect(h.puts).toHaveLength(0);
  });

  it("refuses a NUL byte in the filename", async () => {
    const { POST } = await route();
    const name = `clip${String.fromCharCode(0)}.mp4`;
    const form = videoForm(upload(name, "video/mp4", mp4Bytes()));
    const res = await POST(multipartRequest(URL_UPLOAD, form), routeParams(ASSET_ID));
    expect(res.status).toBe(400);
    expect(h.puts).toHaveLength(0);
  });

  it("never reflects the hostile filename back to the caller", async () => {
    const { POST } = await route();
    const form = videoForm(upload("../../etc/passwd.mp4", "video/mp4", mp4Bytes()));
    const res = await POST(multipartRequest(URL_UPLOAD, form), routeParams(ASSET_ID));
    expect(JSON.stringify(await res.json())).not.toContain("passwd");
  });
});

// ── Authorization ────────────────────────────────────────────────────────────

describe("upload — authorization", () => {
  it("answers 401 to an anonymous caller", async () => {
    h.session = null;
    const { POST } = await route();
    const form = videoForm(upload("clip.mp4", "video/mp4", mp4Bytes()));
    const res = await POST(multipartRequest(URL_UPLOAD, form), routeParams(ASSET_ID));
    expect(res.status).toBe(401);
    expect(h.puts).toHaveLength(0);
  });

  it("answers 404 — never 403 — to a member of a DIFFERENT organization", async () => {
    h.session = { userId: "attacker", orgId: ORG_B, role: "OWNER" };
    const { POST } = await route();
    const form = videoForm(upload("clip.mp4", "video/mp4", mp4Bytes()));
    const res = await POST(multipartRequest(URL_UPLOAD, form), routeParams(ASSET_ID));

    expect(res.status).toBe(404);
    // Membership was checked against the OWNING organization, not one supplied.
    expect(h.actorOrgIds).toEqual([ORG_A]);
    expect(h.puts).toHaveLength(0);
  });

  it("answers 404 for an asset id that does not exist", async () => {
    const { POST } = await route();
    const form = videoForm(upload("clip.mp4", "video/mp4", mp4Bytes()));
    const res = await POST(multipartRequest(URL_UPLOAD, form), routeParams("assetdoesnotexist00001"));
    expect(res.status).toBe(404);
    expect(h.actorOrgIds).toHaveLength(0);
  });

  it("answers 403 to an org member whose role lacks manage_media", async () => {
    h.session = { userId: "viewer-1", orgId: ORG_A, role: "VIEWER" };
    const { POST } = await route();
    const form = videoForm(upload("clip.mp4", "video/mp4", mp4Bytes()));
    const res = await POST(multipartRequest(URL_UPLOAD, form), routeParams(ASSET_ID));
    expect(res.status).toBe(403);
    expect(h.puts).toHaveLength(0);
  });

  it("answers 403 to BILLING_ADMIN, who may read the library but never author it", async () => {
    h.session = { userId: "billing-1", orgId: ORG_A, role: "BILLING_ADMIN" };
    const { POST } = await route();
    const form = videoForm(upload("clip.mp4", "video/mp4", mp4Bytes()));
    const res = await POST(multipartRequest(URL_UPLOAD, form), routeParams(ASSET_ID));
    expect(res.status).toBe(403);
  });
});

// ── Rate limiting ────────────────────────────────────────────────────────────

describe("upload — rate limiting", () => {
  it("keys the limiter on X-Real-IP and IGNORES a forged forwarded-for header", async () => {
    const { POST } = await route();
    const first = videoForm(upload("a.mp4", "video/mp4", mp4Bytes()));
    await POST(
      multipartRequest(URL_UPLOAD, first, { realIp: "10.0.0.9", forwardedFor: "1.1.1.1" }),
      routeParams(ASSET_ID),
    );
    h.store.assets[0].processingState = "PENDING_UPLOAD";
    const second = videoForm(upload("b.mp4", "video/mp4", mp4Bytes()));
    await POST(
      multipartRequest(URL_UPLOAD, second, { realIp: "10.0.0.9", forwardedFor: "2.2.2.2" }),
      routeParams(ASSET_ID),
    );

    // Rotating the forwarded chain must not rotate the bucket.
    expect(h.rateLimitKeys.map((r) => r.key)).toEqual([
      "media-upload:10.0.0.9",
      "media-upload:10.0.0.9",
    ]);
  });

  it("answers 429 with Retry-After once the bucket is exhausted", async () => {
    h.rateLimited = true;
    const { POST } = await route();
    const form = videoForm(upload("clip.mp4", "video/mp4", mp4Bytes()));
    const res = await POST(multipartRequest(URL_UPLOAD, form), routeParams(ASSET_ID));
    expect(res.status).toBe(429);
    expect(res.headers.get("Retry-After")).toBe("42");
    expect(h.puts).toHaveLength(0);
  });

  it("never derives a rate-limit key from a client-controlled forwarding header", async () => {
    const { readFileSync } = await import("node:fs");
    const source = readFileSync("src/app/api/media/assets/[id]/upload/route.ts", "utf8");
    const live = source.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");
    expect(live.toLowerCase()).not.toContain("x-forwarded-for");
    expect(live.toLowerCase()).not.toContain("cf-connecting-ip");
    expect(live).toContain("resolveClientIp");
  });
});

// ── Entitlement ──────────────────────────────────────────────────────────────

describe("upload — commercial entitlement", () => {
  it("returns the entitlement denial response verbatim and writes nothing", async () => {
    h.entitlementAllowed = false;
    const { POST } = await route();
    const form = videoForm(upload("clip.mp4", "video/mp4", mp4Bytes()));
    const res = await POST(multipartRequest(URL_UPLOAD, form), routeParams(ASSET_ID));
    expect(res.status).toBe(402);
    expect(h.puts).toHaveLength(0);
  });

  it("is checked AFTER the RBAC decision, with a server-derived organisation", async () => {
    h.session = { userId: "viewer-1", orgId: ORG_A, role: "VIEWER" };
    const { POST } = await route();
    const form = videoForm(upload("clip.mp4", "video/mp4", mp4Bytes()));
    await POST(multipartRequest(URL_UPLOAD, form), routeParams(ASSET_ID));
    expect(h.entitlementCalls).toHaveLength(0);

    h.session = { userId: "eng-1", orgId: ORG_A, role: "ENGINEER" };
    vi.resetModules();
    const again = await route();
    await again.POST(
      multipartRequest(URL_UPLOAD, videoForm(upload("clip.mp4", "video/mp4", mp4Bytes()))),
      routeParams(ASSET_ID),
    );
    expect(h.entitlementCalls[0]).toMatchObject({
      organisationId: ORG_A,
      entitlementKey: "video_hub",
      userId: "eng-1",
    });
  });
});

// ── Lifecycle ────────────────────────────────────────────────────────────────

describe("upload — processing state", () => {
  it("refuses an asset that already holds bytes", async () => {
    h.store.assets[0].processingState = "READY";
    const { POST } = await route();
    const form = videoForm(upload("clip.mp4", "video/mp4", mp4Bytes()));
    const res = await POST(multipartRequest(URL_UPLOAD, form), routeParams(ASSET_ID));
    expect(res.status).toBe(409);
    expect(h.puts).toHaveLength(0);
  });

  it("refuses a QUARANTINED asset — the terminal state never accepts replacement bytes", async () => {
    h.store.assets[0].processingState = "QUARANTINED";
    const { POST } = await route();
    const form = videoForm(upload("clip.mp4", "video/mp4", mp4Bytes()));
    const res = await POST(multipartRequest(URL_UPLOAD, form), routeParams(ASSET_ID));
    expect(res.status).toBe(409);
    expect(h.puts).toHaveLength(0);
  });

  it("cleans up the orphan when the compare-and-swap loses the race", async () => {
    h.casConflict = true;
    const { POST } = await route();
    const form = videoForm(upload("clip.mp4", "video/mp4", mp4Bytes()));
    const res = await POST(multipartRequest(URL_UPLOAD, form), routeParams(ASSET_ID));

    expect(res.status).toBe(409);
    expect((await res.json()).error).toBe("processing_state_conflict");
    // The bytes were written, then found to be unreferenced, then removed.
    expect(h.puts).toHaveLength(1);
    expect(h.deletes).toEqual([h.puts[0].key]);
    expect(h.store.assets[0].storageKey).toBeNull();
  });
});

// ── Transport shape ──────────────────────────────────────────────────────────

describe("upload — request shape", () => {
  it("refuses a non-multipart content type", async () => {
    const { POST } = await route();
    const req = new Request(URL_UPLOAD, {
      method: "POST",
      body: JSON.stringify({ file: "x" }),
      headers: { "content-type": "application/json" },
    });
    const { NextRequest } = await import("next/server");
    const res = await POST(new NextRequest(req), routeParams(ASSET_ID));
    expect(res.status).toBe(415);
  });

  it("refuses a multipart body with no `file` part", async () => {
    const { POST } = await route();
    const form = new FormData();
    form.set("notTheFile", "hello");
    const res = await POST(multipartRequest(URL_UPLOAD, form), routeParams(ASSET_ID));
    expect(res.status).toBe(400);
    expect((await res.json()).error).toBe("file_field_required");
  });

  it("refuses a `file` part that is a plain string rather than a File", async () => {
    const { POST } = await route();
    const form = new FormData();
    form.set("file", "media/../../etc/passwd");
    const res = await POST(multipartRequest(URL_UPLOAD, form), routeParams(ASSET_ID));
    expect(res.status).toBe(400);
    expect(h.puts).toHaveLength(0);
  });

  it("answers 404 to a syntactically impossible asset id without touching the database", async () => {
    const { POST } = await route();
    const form = videoForm(upload("clip.mp4", "video/mp4", mp4Bytes()));
    const res = await POST(multipartRequest(URL_UPLOAD, form), routeParams("../../../etc/passwd"));
    expect(res.status).toBe(404);
    expect(h.actorOrgIds).toHaveLength(0);
  });

  it("reports storage unavailability without leaking the cause", async () => {
    h.putThrows = true;
    const { POST } = await route();
    const form = videoForm(upload("clip.mp4", "video/mp4", mp4Bytes()));
    const res = await POST(multipartRequest(URL_UPLOAD, form), routeParams(ASSET_ID));
    expect(res.status).toBe(503);
    const payload = JSON.stringify(await res.json());
    expect(payload).toBe(JSON.stringify({ ok: false, error: "storage_unavailable" }));
    expect(payload).not.toContain("MediaStorageError");
  });
});
