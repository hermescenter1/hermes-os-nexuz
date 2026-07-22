import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  sanitizeAuditMetadata,
  AUDIT_ALLOWED_KEYS,
  AUDIT_FORBIDDEN_KEYS,
  fromRepo,
  OT_AUDIT,
} from "../core";

/**
 * PHASE 94B3.3 — source-level regressions for the orchestration layer.
 *
 * These catch the mistakes an integration test cannot: a NEW service added
 * later that imports the global Prisma client, reserves a nonce before
 * verifying a signature, or passes a raw manifest into an audit call.
 */

const read = (p: string) => readFileSync(resolve(process.cwd(), p), "utf8");
const strip = (src: string) => src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*/g, "");

const SERVICES = [
  "src/lib/ot-edge/services/import-service.ts",
  "src/lib/ot-edge/services/analysis-service.ts",
  "src/lib/ot-edge/services/finding-service.ts",
  "src/lib/ot-edge/services/gateway-service.ts",
] as const;

describe("94B3.3 — services depend on interfaces, never a Prisma singleton", () => {
  it.each(SERVICES)("%s constructs no client and imports no Prisma", (path) => {
    const code = strip(read(path));
    expect(code).not.toMatch(/new PrismaClient/);
    expect(code).not.toMatch(/getPrisma\s*\(/);
    expect(code).not.toMatch(/from ["']@prisma\/client["']/);
    expect(code).not.toMatch(/\$transaction\s*\(/);
  });

  it.each(SERVICES)("%s never reads a tenant or actor id from caller data", (path) => {
    const code = strip(read(path));
    // The manifest/envelope must never be the source of identity.
    expect(code).not.toMatch(/manifest\.organizationId/);
    expect(code).not.toMatch(/manifest\.actorId/);
    expect(code).not.toMatch(/req\.organizationId/);
    expect(code).not.toMatch(/req\.actorId/);
    expect(code).not.toMatch(/req\.allowedSiteIds/);
    // Identity always comes from the trusted context.
    if (/organizationId/.test(code)) expect(code).toMatch(/ctx\.organizationId/);
  });

  it.each(SERVICES)("%s emits no device, control or actuation vocabulary", (path) => {
    const code = strip(read(path));
    for (const forbidden of [/writeTag/i, /writeValue/i, /actuate/i, /setpoint/i, /acknowledgeAlarm/i, /plcWrite/i, /startEquipment/i]) {
      expect(code, `${forbidden} must not appear`).not.toMatch(forbidden);
    }
  });
});

describe("94B3.3 — the nonce is reserved only AFTER the signature verifies", () => {
  const code = strip(read("src/lib/ot-edge/services/gateway-service.ts"));

  it("the reserve call appears after the verification call", () => {
    const verifyAt = code.indexOf("verifyEnvelopeSignature");
    const reserveAt = code.indexOf("nonces.reserve");
    expect(verifyAt, "signature verification must exist").toBeGreaterThan(-1);
    expect(reserveAt, "nonce reservation must exist").toBeGreaterThan(-1);
    // Reserving first would let an unauthenticated caller burn nonces and
    // pre-consume one a real gateway is about to use.
    expect(reserveAt, "nonce reserved before signature verification").toBeGreaterThan(verifyAt);
  });

  it("the secret is dereferenced from the gateway record, not the envelope", () => {
    // The envelope may ASSERT a reference; only the server's copy selects one.
    expect(code).toMatch(/gw\.signingKeyRef/);
    expect(code).not.toMatch(/secrets\.resolve\(\s*env\.signingKeyRef/);
  });

  it("only one reserve site exists, so no path bypasses the ordering", () => {
    expect((code.match(/nonces\.reserve/g) ?? []).length).toBe(1);
  });
});

describe("94B3.3 — audit calls carry no raw manifest or envelope", () => {
  it.each(SERVICES)("%s passes no manifest/envelope object into audit metadata", (path) => {
    const code = strip(read(path));
    const calls = [...code.matchAll(/audit\.record\(\{[\s\S]{0,700}?\}\)/g)];
    for (const c of calls) {
      const text = c[0];
      // NOTE: `payloadType` is a closed enum value and is explicitly allowed —
      // the forbidden thing is the payload ITSELF, so match precisely.
      for (const forbidden of [
        "manifest", "env,", "envelope:", "payload:", "payloadBytes", "rawEnvelope",
        "req.manifest", "signature", "nonce:", "checksum",
      ]) {
        expect(text, `${forbidden} appeared in an audit call in ${path}`).not.toContain(forbidden);
      }
    }
  });

  it("every allowed audit key is a scalar-safe identifier or count", () => {
    for (const k of AUDIT_ALLOWED_KEYS) {
      expect(AUDIT_FORBIDDEN_KEYS as readonly string[]).not.toContain(k);
    }
  });

  it("the sanitizer drops every forbidden key, even nested", () => {
    const hostile: Record<string, unknown> = {
      organizationId: "org-1",
      findingCount: 3,
      // everything below must be stripped
      manifest: { tags: [{ name: "SECRET_TAG" }] },
      signature: "FORGEDSIG",
      signingKeyRef: "env:OT_GATEWAY_HMAC_PRIMARY",
      nonce: "n".repeat(32),
      idempotencyKey: "idem-1",
      checksum: "c".repeat(64),
      description: "private evidence",
      message: "alarm text",
      stack: "at secret.ts:1",
      error: new Error("boom"),
    };
    const clean = sanitizeAuditMetadata(hostile);
    expect(clean).toEqual({ organizationId: "org-1", findingCount: 3 });

    const raw = JSON.stringify(clean);
    for (const leak of ["SECRET_TAG", "FORGEDSIG", "OT_GATEWAY_HMAC", "idem-1", "private evidence", "alarm text", "boom"]) {
      expect(raw, `${leak} survived sanitisation`).not.toContain(leak);
    }
  });

  it("a nested object under an ALLOWED key is still dropped", () => {
    // A manifest smuggled under a permitted name must not survive.
    const clean = sanitizeAuditMetadata({ organizationId: { $ne: null }, siteId: ["a"] });
    expect(clean).toEqual({});
  });

  it("every declared action follows the platform naming convention", () => {
    for (const action of Object.values(OT_AUDIT)) {
      expect(action).toMatch(/^(OT_GATEWAY|ENGINEERING)_[A-Z_]+$/);
    }
  });
});

describe("94B3.3 — service errors expose no driver detail", () => {
  it("a repository failure widens without carrying its payload", () => {
    const mapped = fromRepo({ ok: false, code: "CONFLICT", hint: "already exists" });
    expect(mapped.code).toBe("CONFLICT");
    expect(JSON.stringify(mapped)).not.toMatch(/P2002|constraint|EngineeringImport|postgres/i);
  });

  it.each(SERVICES)("%s never returns a repository record verbatim", (path) => {
    const code = strip(read(path));
    // The hazard is handing back a repo record (which carries every column).
    // `svcOk(x.value)` would do exactly that. A service that returns a locally
    // declared safe acknowledgement instead has nothing to map, and that is
    // fine — what matters is that no repository row escapes.
    expect(code, "a repository record was returned unmapped").not.toMatch(/svcOk\(\s*\w+\.value\s*\)/);

    // Anything that DOES surface a persisted entity must go through a mapper.
    if (/(record|items|value)\s*:\s*\w+\.value/.test(code)) {
      expect(code).toMatch(/to[A-Z]\w+Dto\(/);
    }
  });

  it.each(SERVICES)("%s never stringifies a caught error into a result", (path) => {
    const code = strip(read(path));
    expect(code).not.toMatch(/err\.message/);
    expect(code).not.toMatch(/String\(err\)/);
    expect(code).not.toMatch(/hint:\s*err/);
  });
});

describe("94B3.3 — failure injection cannot be reached from request data", () => {
  const code = strip(read("src/lib/ot-edge/services/import-service.ts"));

  it("the checkpoint hook is a constructor dependency, not request input", () => {
    // If it were read from `req`, a caller could steer a failure.
    expect(code).toMatch(/onCheckpoint\?:\s*\(cp: ImportCheckpoint\) => void/);
    expect(code).not.toMatch(/req\.onCheckpoint/);
    expect(code).not.toMatch(/req\.checkpoint/);
    expect(code).not.toMatch(/manifest\.checkpoint/);
  });

  it("the failure category is an enum member, never the exception text", () => {
    expect(code).toMatch(/IMPORT_FAILURE\.INTERNAL_ERROR/);
    expect(code).not.toMatch(/markFailed\([^)]*err/);
  });
});
