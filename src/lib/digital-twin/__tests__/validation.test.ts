/**
 * Digital Twin Slice 1 — input validation and bounded request parsing.
 *
 * Pure unit tests: no database, no network. They pin the request contract the
 * routes rely on (what is accepted, what is stripped, what is refused and with
 * which status).
 */
import { describe, expect, it } from "vitest";
import {
  TWIN_LIMITS,
  createLayoutBody,
  createNodeBody,
  createRelationBody,
  createTagBody,
  idSchema,
  jsonProblem,
  metadataSchema,
  patchNodeBody,
  patchTagBody,
} from "../schemas";
import { parseJsonBody } from "../request";

const valid = { siteId: "site-1", displayName: "Pump P-101", nodeType: "ASSET" };

describe("identifiers", () => {
  it.each(["site-1", "ckx9a0z1e0000", "A_b-9", "x".repeat(64)])("accepts %s", (v) => {
    expect(idSchema.safeParse(v).success).toBe(true);
  });

  it.each([
    "",
    " ",
    "a b",
    "../etc/passwd",
    "a/b",
    "a;drop table",
    "x".repeat(65),
    "id\n",
    "id\u0000",
    "ідентифікатор",
  ])("rejects %j", (v) => {
    expect(idSchema.safeParse(v).success).toBe(false);
  });

  it("rejects non-strings and null", () => {
    expect(idSchema.safeParse(null).success).toBe(false);
    expect(idSchema.safeParse(123).success).toBe(false);
    expect(idSchema.safeParse(undefined).success).toBe(false);
    expect(idSchema.safeParse({ $ne: "x" }).success).toBe(false);
  });
});

describe("createNodeBody", () => {
  it("accepts a minimal valid body", () => {
    expect(createNodeBody.safeParse(valid).success).toBe(true);
  });

  it("rejects an unknown node type", () => {
    expect(createNodeBody.safeParse({ ...valid, nodeType: "ROBOT" }).success).toBe(false);
    expect(createNodeBody.safeParse({ ...valid, nodeType: "asset" }).success).toBe(false);
    expect(createNodeBody.safeParse({ ...valid, nodeType: "" }).success).toBe(false);
  });

  it("requires siteId, displayName and nodeType", () => {
    for (const k of ["siteId", "displayName", "nodeType"] as const) {
      const body: Record<string, unknown> = { ...valid };
      delete body[k];
      expect(createNodeBody.safeParse(body).success, `missing ${k}`).toBe(false);
    }
    expect(createNodeBody.safeParse({}).success).toBe(false);
  });

  it("refuses blank, over-long and control-character names", () => {
    expect(createNodeBody.safeParse({ ...valid, displayName: "   " }).success).toBe(false);
    expect(createNodeBody.safeParse({ ...valid, displayName: "x".repeat(201) }).success).toBe(false);
    expect(createNodeBody.safeParse({ ...valid, displayName: "a\u0000b" }).success).toBe(false);
    expect(createNodeBody.safeParse({ ...valid, displayName: "a\nb" }).success).toBe(false);
    expect(createNodeBody.safeParse({ ...valid, displayName: "x".repeat(200) }).success).toBe(true);
  });

  it("trims the display name", () => {
    const r = createNodeBody.safeParse({ ...valid, displayName: "  Pump  " });
    expect(r.success && r.data.displayName).toBe("Pump");
  });

  it("accepts null for the optional references", () => {
    const r = createNodeBody.safeParse({ ...valid, assetId: null, parentNodeId: null });
    expect(r.success).toBe(true);
  });

  it("rejects a malformed asset or parent identifier", () => {
    expect(createNodeBody.safeParse({ ...valid, assetId: "a b" }).success).toBe(false);
    expect(createNodeBody.safeParse({ ...valid, parentNodeId: { id: "x" } }).success).toBe(false);
  });

  it("DROPS unexpected fields instead of passing them on (mass assignment)", () => {
    const r = createNodeBody.safeParse({
      ...valid,
      organizationId: "org-EVIL",
      id: "forced-id",
      createdAt: "2000-01-01",
      isAdmin: true,
    });
    expect(r.success).toBe(true);
    if (r.success) {
      expect(r.data).not.toHaveProperty("organizationId");
      expect(r.data).not.toHaveProperty("id");
      expect(r.data).not.toHaveProperty("createdAt");
      expect(r.data).not.toHaveProperty("isAdmin");
    }
  });
});

describe("patchNodeBody", () => {
  it("accepts an empty patch (a no-op) and strips siteId / organizationId", () => {
    const r = patchNodeBody.safeParse({ siteId: "other-site", organizationId: "org-EVIL", id: "x" });
    expect(r.success).toBe(true);
    if (r.success) expect(Object.keys(r.data)).toEqual([]);
  });

  it("validates nodeType when present", () => {
    expect(patchNodeBody.safeParse({ nodeType: "ROBOT" }).success).toBe(false);
    expect(patchNodeBody.safeParse({ nodeType: "CELL" }).success).toBe(true);
  });

  it("allows detaching the asset and the parent with null", () => {
    const r = patchNodeBody.safeParse({ assetId: null, parentNodeId: null });
    expect(r.success).toBe(true);
    if (r.success) {
      expect(r.data.assetId).toBeNull();
      expect(r.data.parentNodeId).toBeNull();
    }
  });
});

describe("metadata bounds", () => {
  it("accepts an ordinary object", () => {
    expect(metadataSchema.safeParse({ vendor: "ACME", ratings: { kw: 15 }, tags: ["a", "b"] }).success).toBe(true);
    expect(metadataSchema.safeParse({}).success).toBe(true);
  });

  it("rejects non-objects", () => {
    expect(metadataSchema.safeParse([]).success).toBe(false);
    expect(metadataSchema.safeParse(null).success).toBe(false);
    expect(metadataSchema.safeParse("x").success).toBe(false);
    expect(metadataSchema.safeParse(12).success).toBe(false);
  });

  it("rejects metadata larger than the ceiling", () => {
    const big = { blob: "x".repeat(TWIN_LIMITS.METADATA_BYTES) };
    expect(metadataSchema.safeParse(big).success).toBe(false);
    const justUnder = { blob: "x".repeat(TWIN_LIMITS.METADATA_BYTES - 64) };
    expect(metadataSchema.safeParse(justUnder).success).toBe(true);
  });

  it("measures BYTES, not characters", () => {
    // 4-byte code points: 5000 of them is 20000 bytes serialised, well past 16 KiB.
    const emoji = { blob: "😀".repeat(5000) };
    expect(metadataSchema.safeParse(emoji).success).toBe(false);
  });

  it("rejects excessive nesting", () => {
    let deep: Record<string, unknown> = { leaf: 1 };
    for (let i = 0; i < TWIN_LIMITS.JSON_MAX_DEPTH + 2; i++) deep = { n: deep };
    expect(metadataSchema.safeParse(deep).success).toBe(false);
  });

  it("rejects prototype-pollution keys at any depth", () => {
    const polluted = JSON.parse('{"a":{"__proto__":{"admin":true}}}') as Record<string, unknown>;
    expect(metadataSchema.safeParse(polluted).success).toBe(false);
    const ctor = JSON.parse('{"constructor":{"x":1}}') as Record<string, unknown>;
    expect(metadataSchema.safeParse(ctor).success).toBe(false);
  });

  it("jsonProblem reports the reason without echoing the value", () => {
    const p = jsonProblem({ secret: "s3cr3t".repeat(5000) }, { maxBytes: 100, maxDepth: 8 });
    expect(p).toMatch(/must not exceed/);
    expect(p).not.toContain("s3cr3t");
  });
});

describe("relation, layout and tag bodies", () => {
  it("createRelationBody rejects unknown relation types and empty ids", () => {
    const ok = { sourceNodeId: "a", targetNodeId: "b", relationType: "FEEDS" };
    expect(createRelationBody.safeParse(ok).success).toBe(true);
    expect(createRelationBody.safeParse({ ...ok, relationType: "OWNS" }).success).toBe(false);
    expect(createRelationBody.safeParse({ ...ok, sourceNodeId: "" }).success).toBe(false);
    expect(createRelationBody.safeParse({ ...ok, targetNodeId: undefined }).success).toBe(false);
  });

  it("createLayoutBody bounds the layout payload", () => {
    const ok = { siteId: "s1", name: "Floor 1" };
    expect(createLayoutBody.safeParse(ok).success).toBe(true);
    expect(createLayoutBody.safeParse({ ...ok, name: "" }).success).toBe(false);
    const tooBig = { ...ok, layoutData: { blob: "x".repeat(TWIN_LIMITS.LAYOUT_DATA_BYTES) } };
    expect(createLayoutBody.safeParse(tooBig).success).toBe(false);
  });

  it("createTagBody validates the tag path and data type", () => {
    const ok = { assetId: "a1", tagName: "Motor current", tagPath: "pump.motor.current" };
    expect(createTagBody.safeParse(ok).success).toBe(true);
    expect(createTagBody.safeParse({ ...ok, tagPath: "1bad" }).success).toBe(false);
    expect(createTagBody.safeParse({ ...ok, tagPath: "has space" }).success).toBe(false);
    expect(createTagBody.safeParse({ ...ok, tagPath: "../x" }).success).toBe(false);
    expect(createTagBody.safeParse({ ...ok, dataType: "blob" }).success).toBe(false);
    expect(createTagBody.safeParse({ ...ok, dataType: "int" }).success).toBe(true);
    expect(createTagBody.safeParse({ ...ok, unit: "x".repeat(33) }).success).toBe(false);
  });

  it("patchTagBody cannot change the owning asset or the path", () => {
    const r = patchTagBody.safeParse({ tagName: "New", assetId: "other", tagPath: "x.y", organizationId: "o" });
    expect(r.success).toBe(true);
    if (r.success) {
      expect(r.data).not.toHaveProperty("assetId");
      expect(r.data).not.toHaveProperty("tagPath");
      expect(r.data).not.toHaveProperty("organizationId");
    }
  });
});

describe("parseJsonBody — bounded reading", () => {
  const mk = (body: BodyInit | null, headers: Record<string, string> = {}) =>
    new Request("http://localhost/api/digital-twin/nodes", { method: "POST", body, headers });

  it("parses a valid body", async () => {
    const r = await parseJsonBody(mk(JSON.stringify(valid)), createNodeBody, 4096);
    expect(r.ok).toBe(true);
  });

  it("answers an oversize DECLARED length with 413 before reading", async () => {
    const r = await parseJsonBody(mk(JSON.stringify(valid), { "content-length": "999999" }), createNodeBody, 4096);
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.response.status).toBe(413);
      expect((await r.response.json()).code).toBe("PAYLOAD_TOO_LARGE");
    }
  });

  it("answers an oversize body with NO declared length with 413 too", async () => {
    const huge = JSON.stringify({ ...valid, metadata: { blob: "x".repeat(10_000) } });
    const r = await parseJsonBody(mk(huge), createNodeBody, 4096);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.response.status).toBe(413);
  });

  it("reports malformed JSON as INVALID_JSON (not as a missing field)", async () => {
    const r = await parseJsonBody(mk("{not json"), createNodeBody, 4096);
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.response.status).toBe(400);
      expect((await r.response.json()).code).toBe("INVALID_JSON");
    }
  });

  it("treats an empty body as {} and fails validation with 400", async () => {
    const r = await parseJsonBody(mk(null), createNodeBody, 4096);
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.response.status).toBe(400);
      expect((await r.response.json()).code).toBe("VALIDATION_FAILED");
    }
  });

  it("validation errors carry paths and messages, never the submitted values", async () => {
    const r = await parseJsonBody(
      mk(JSON.stringify({ ...valid, nodeType: "TOPSECRET-VALUE", displayName: "" })),
      createNodeBody,
      4096,
    );
    expect(r.ok).toBe(false);
    if (!r.ok) {
      const text = JSON.stringify(await r.response.json());
      expect(text).toContain("nodeType");
      expect(text).not.toContain("TOPSECRET-VALUE");
    }
  });

  it("handles null / array / scalar top-level JSON without throwing", async () => {
    for (const body of ["null", "[]", "42", '"str"']) {
      const r = await parseJsonBody(mk(body), createNodeBody, 4096);
      expect(r.ok, body).toBe(false);
      if (!r.ok) expect(r.response.status).toBe(400);
    }
  });
});
