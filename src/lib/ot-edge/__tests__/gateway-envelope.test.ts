import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  computeSignature,
  envSecretProvider,
  canonicalSignedBytes,
  verifyEnvelopeSignature,
  APPROVED_SIGNING_KEY_REFS,
  MIN_SIGNING_SECRET_LENGTH,
  type SecretProvider,
} from "../envelope-signature";
import {
  GatewayEnvelopeSchema,
  checkGatewayEnvelope,
  verifyGatewayEnvelope,
  constantTimeEquals,
  payloadChecksum,
  nonceExpiry,
  ENVELOPE_LIMITS,
  ENVELOPE_VERSION,
  REJECTION_STATUS,
  type GatewayEnvelope,
  type GatewayRecord,
} from "../gateway-envelope";

/** Fixed clock — validation must be a pure function of its inputs. */
const NOW = new Date("2026-07-21T12:00:00.000Z");
const CHECKSUM = "a".repeat(64);

const ENVELOPE: GatewayEnvelope = {
  envelopeVersion: ENVELOPE_VERSION,
  organizationId: "org-1",
  gatewayId: "GW-SERIAL-001",
  timestamp: NOW.toISOString(),
  nonce: "n".repeat(32),
  idempotencyKey: "idem-1",
  payloadType: "PROJECT_METADATA",
  payloadChecksum: CHECKSUM,
  signingKeyRef: "secretref://gateways/gw-1",
  signatureAlgorithm: "HMAC-SHA256",
  signature: "placeholder-signature-value",
};

/** Deterministic test secret — never a production key. */
const TEST_SECRET = "test-only-hmac-secret-value-0123456789abcdef";
const TEST_SECRETS: SecretProvider = {
  resolve: (ref) => (ref === ENVELOPE.signingKeyRef ? TEST_SECRET : null),
};

/** The signature a correctly-configured gateway would present. */
const VALID_SIGNATURE = computeSignature(ENVELOPE, TEST_SECRET);

const GATEWAY: GatewayRecord = {
  gatewayId: "GW-SERIAL-001",
  organizationId: "org-1",
  disabled: false,
  lifecycle: "ACTIVE",
  capabilities: ["PROJECT_METADATA_IMPORT", "TAG_METADATA_IMPORT"],
  signingKeyRef: "secretref://gateways/gw-1",
  simulatorMode: false,
};

const check = (
  patch: Partial<Parameters<typeof checkGatewayEnvelope>[0]> = {},
) =>
  checkGatewayEnvelope({
    envelope: ENVELOPE,
    gateway: GATEWAY,
    actualPayloadChecksum: CHECKSUM,
    payloadByteLength: 1024,
    nonceAlreadySeen: false,
    now: NOW,
    simulatorAllowed: false,
    ...patch,
  });

describe("94 — a well-formed envelope from a healthy gateway is accepted", () => {
  it("accepts the happy path", () => {
    const r = check();
    expect(r.ok, JSON.stringify(r)).toBe(true);
  });

  it("validation is pure — same inputs, same verdict", () => {
    expect(JSON.stringify(check())).toBe(JSON.stringify(check()));
  });
});

describe("94 — envelope schema is strict", () => {
  it("rejects an unknown key", () => {
    expect(GatewayEnvelopeSchema.safeParse({ ...ENVELOPE, payload: "x" }).success).toBe(false);
  });

  it("rejects a wrong envelope version", () => {
    expect(GatewayEnvelopeSchema.safeParse({ ...ENVELOPE, envelopeVersion: "2.0" }).success).toBe(false);
  });

  it("requires a sha256-hex checksum", () => {
    for (const bad of ["", "xyz", "A".repeat(64), "a".repeat(63)]) {
      expect(GatewayEnvelopeSchema.safeParse({ ...ENVELOPE, payloadChecksum: bad }).success).toBe(false);
    }
  });

  it("requires a nonce long enough to resist collision", () => {
    const short = "n".repeat(ENVELOPE_LIMITS.minNonceLength - 1);
    expect(GatewayEnvelopeSchema.safeParse({ ...ENVELOPE, nonce: short }).success).toBe(false);
    const long = "n".repeat(ENVELOPE_LIMITS.maxNonceLength + 1);
    expect(GatewayEnvelopeSchema.safeParse({ ...ENVELOPE, nonce: long }).success).toBe(false);
  });

  it("carries a signing key REFERENCE, never key material", () => {
    const src = readFileSync(resolve(process.cwd(), "src/lib/ot-edge/gateway-envelope.ts"), "utf8");
    for (const forbidden of ["signingKey:", "privateKey", "secretValue", "hmacKey"]) {
      expect(src, `must not model ${forbidden}`).not.toMatch(new RegExp(`${forbidden}\\s*:`));
    }
    expect(Object.keys(ENVELOPE)).toContain("signingKeyRef");
  });
});

describe("94 — tenancy and lifecycle rejections", () => {
  it("an unknown gateway and a foreign-tenant gateway are indistinguishable (no existence leak)", () => {
    const unknown = check({ gateway: null });
    const foreign = check({ gateway: { ...GATEWAY, organizationId: "org-OTHER" } });
    expect(unknown.ok).toBe(false);
    expect(foreign.ok).toBe(false);
    if (!unknown.ok && !foreign.ok) {
      expect(REJECTION_STATUS[unknown.rejection]).toBe(404);
      expect(REJECTION_STATUS[foreign.rejection]).toBe(404);
    }
  });

  it("rejects a disabled or revoked gateway", () => {
    for (const g of [
      { ...GATEWAY, disabled: true },
      { ...GATEWAY, lifecycle: "DISABLED" },
      { ...GATEWAY, lifecycle: "REVOKED" },
    ]) {
      const r = check({ gateway: g });
      expect(r.ok).toBe(false);
      if (!r.ok) expect(r.rejection).toBe("GATEWAY_DISABLED");
    }
  });

  it("blocks a simulator gateway unless simulation is explicitly permitted", () => {
    const sim = { ...GATEWAY, simulatorMode: true };
    expect(check({ gateway: sim, simulatorAllowed: false }).ok).toBe(false);
    expect(check({ gateway: sim, simulatorAllowed: true }).ok).toBe(true);
  });

  it("refuses a payload type the gateway has not declared a capability for", () => {
    const r = check({
      envelope: { ...ENVELOPE, payloadType: "ALARM_METADATA" },
      gateway: { ...GATEWAY, capabilities: ["PROJECT_METADATA_IMPORT"] },
    });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.rejection).toBe("CAPABILITY_MISSING");
  });

  it("refuses a mismatched or absent signing-key reference", () => {
    for (const g of [{ ...GATEWAY, signingKeyRef: "secretref://other" }, { ...GATEWAY, signingKeyRef: null }]) {
      const r = check({ gateway: g });
      expect(r.ok).toBe(false);
      if (!r.ok) expect(r.rejection).toBe("SIGNATURE_REF_MISMATCH");
    }
  });
});

describe("94 — freshness, replay and integrity", () => {
  it("rejects a timestamp older than the skew window", () => {
    const old = new Date(NOW.getTime() - ENVELOPE_LIMITS.maxClockSkewMs - 1000).toISOString();
    const r = check({ envelope: { ...ENVELOPE, timestamp: old } });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.rejection).toBe("STALE_TIMESTAMP");
  });

  it("rejects a FUTURE timestamp too — skew is bounded in both directions", () => {
    // A one-sided check would let an attacker mint a long-lived envelope.
    const future = new Date(NOW.getTime() + ENVELOPE_LIMITS.maxClockSkewMs + 1000).toISOString();
    const r = check({ envelope: { ...ENVELOPE, timestamp: future } });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.rejection).toBe("STALE_TIMESTAMP");
  });

  it("accepts a timestamp inside the window", () => {
    const edge = new Date(NOW.getTime() - ENVELOPE_LIMITS.maxClockSkewMs + 1000).toISOString();
    expect(check({ envelope: { ...ENVELOPE, timestamp: edge } }).ok).toBe(true);
  });

  it("rejects a replayed nonce", () => {
    const r = check({ nonceAlreadySeen: true });
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.rejection).toBe("REPLAYED_NONCE");
      expect(REJECTION_STATUS[r.rejection]).toBe(409);
    }
  });

  it("rejects a checksum mismatch", () => {
    const r = check({ actualPayloadChecksum: "b".repeat(64) });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.rejection).toBe("CHECKSUM_MISMATCH");
  });

  it("rejects an oversized payload before comparing checksums", () => {
    const r = check({
      payloadByteLength: ENVELOPE_LIMITS.maxPayloadBytes + 1,
      actualPayloadChecksum: "b".repeat(64),
    });
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.rejection).toBe("PAYLOAD_TOO_LARGE");
      expect(REJECTION_STATUS[r.rejection]).toBe(413);
    }
  });

  it("checks lifecycle before integrity, so a disabled gateway is not a hashing oracle", () => {
    const r = check({ gateway: { ...GATEWAY, disabled: true }, actualPayloadChecksum: "b".repeat(64) });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.rejection).toBe("GATEWAY_DISABLED");
  });

  it("nonce retention extends past the skew window so a replay cannot outlive memory", () => {
    expect(ENVELOPE_LIMITS.nonceRetentionMs).toBeGreaterThan(2 * ENVELOPE_LIMITS.maxClockSkewMs);
    expect(nonceExpiry(NOW).getTime()).toBe(NOW.getTime() + ENVELOPE_LIMITS.nonceRetentionMs);
  });
});

describe("94 — comparison and hashing helpers", () => {
  it("constantTimeEquals matches only identical strings", () => {
    expect(constantTimeEquals("abc", "abc")).toBe(true);
    expect(constantTimeEquals("abc", "abd")).toBe(false);
    expect(constantTimeEquals("abc", "ab")).toBe(false);
    expect(constantTimeEquals("", "")).toBe(true);
  });

  it("payloadChecksum is sha256 hex and stable", async () => {
    const a = await payloadChecksum("hello");
    expect(a).toMatch(/^[a-f0-9]{64}$/);
    expect(await payloadChecksum("hello")).toBe(a);
    expect(await payloadChecksum("hell0")).not.toBe(a);
  });
});

describe("94 — the envelope cannot carry a control action", () => {
  it("payload types are metadata and read-only telemetry only", () => {
    const r = GatewayEnvelopeSchema.safeParse({ ...ENVELOPE, payloadType: "WRITE_TAG" });
    expect(r.success).toBe(false);
  });

  it("the module opens no connection and reads no ambient clock", () => {
    const code = readFileSync(resolve(process.cwd(), "src/lib/ot-edge/gateway-envelope.ts"), "utf8")
      .replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*/g, "");
    for (const forbidden of ["fetch(", "net.", "dgram", "WebSocket", "child_process", "Date.now()"]) {
      expect(code, `must not use ${forbidden}`).not.toContain(forbidden);
    }
  });
});

describe("94B — a reference is not a signature: HMAC proof of possession", () => {
  const verify = (
    patch: Partial<Parameters<typeof verifyGatewayEnvelope>[0]> = {},
  ) =>
    verifyGatewayEnvelope({
      envelope: ENVELOPE,
      gateway: GATEWAY,
      actualPayloadChecksum: CHECKSUM,
      payloadByteLength: 1024,
      nonceAlreadySeen: false,
      now: NOW,
      simulatorAllowed: false,
      signature: VALID_SIGNATURE,
      secrets: TEST_SECRETS,
      ...patch,
    });

  it("accepts an envelope carrying a correct signature", async () => {
    const r = await verify();
    expect(r.ok, JSON.stringify(r)).toBe(true);
  });

  it("rejects a forged signature even when every other gate passes", async () => {
    // This is the Phase 94A hole: knowing signingKeyRef used to be enough.
    const r = await verify({ signature: computeSignature(ENVELOPE, "attacker-guessed-secret-000000") });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.rejection).toBe("SIGNATURE_INVALID");
  });

  it("rejects a signature valid for a DIFFERENT envelope (no field swapping)", async () => {
    const other = { ...ENVELOPE, payloadChecksum: "b".repeat(64) };
    const r = await verify({ signature: computeSignature(other, TEST_SECRET) });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.rejection).toBe("SIGNATURE_INVALID");
  });

  it("an unknown key reference is indistinguishable from a bad signature", async () => {
    const emptyProvider: SecretProvider = { resolve: () => null };
    const unknown = await verify({ secrets: emptyProvider });
    const bad = await verify({ signature: "A".repeat(43) });
    expect(unknown.ok).toBe(false);
    expect(bad.ok).toBe(false);
    if (!unknown.ok && !bad.ok) expect(unknown.rejection).toBe(bad.rejection);
  });

  it("structural gates still run BEFORE any signature work", async () => {
    // A disabled gateway must not become a signing oracle.
    const r = await verify({ gateway: { ...GATEWAY, disabled: true }, signature: "wrong" });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.rejection).toBe("GATEWAY_DISABLED");
  });

  it("a replayed nonce is rejected before the signature is checked", async () => {
    const r = await verify({ nonceAlreadySeen: true });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.rejection).toBe("REPLAYED_NONCE");
  });
});

describe("94B — canonical signed bytes are unambiguous", () => {
  it("are stable across repeated computation", () => {
    expect(canonicalSignedBytes(ENVELOPE).toString()).toBe(canonicalSignedBytes(ENVELOPE).toString());
    expect(computeSignature(ENVELOPE, TEST_SECRET)).toBe(computeSignature(ENVELOPE, TEST_SECRET));
  });

  it("do not depend on JSON key order", () => {
    // Rebuilt with keys in a different literal order — same bytes.
    const reordered = {
      signature: ENVELOPE.signature,
      signatureAlgorithm: ENVELOPE.signatureAlgorithm,
      signingKeyRef: ENVELOPE.signingKeyRef,
      payloadChecksum: ENVELOPE.payloadChecksum,
      payloadType: ENVELOPE.payloadType,
      idempotencyKey: ENVELOPE.idempotencyKey,
      nonce: ENVELOPE.nonce,
      timestamp: ENVELOPE.timestamp,
      gatewayId: ENVELOPE.gatewayId,
      organizationId: ENVELOPE.organizationId,
      envelopeVersion: ENVELOPE.envelopeVersion,
    };
    expect(canonicalSignedBytes(reordered).toString()).toBe(canonicalSignedBytes(ENVELOPE).toString());
  });

  it("length-prefixing prevents field-boundary confusion", () => {
    // Without length prefixes, ("a|b","c") and ("a","b|c") would serialise
    // identically and one signature would authenticate both envelopes.
    const left = canonicalSignedBytes({ ...ENVELOPE, gatewayId: "a|b", nonce: "c".repeat(16) });
    const right = canonicalSignedBytes({ ...ENVELOPE, gatewayId: "a", nonce: "b|" + "c".repeat(14) });
    expect(left.toString()).not.toBe(right.toString());
  });

  it("changing any signed field changes the signature", () => {
    const base = computeSignature(ENVELOPE, TEST_SECRET);
    const mutations = [
      { organizationId: "org-2" }, { gatewayId: "GW-2" }, { nonce: "z".repeat(32) },
      { idempotencyKey: "idem-2" }, { payloadType: "TAG_METADATA" as const },
      { payloadChecksum: "c".repeat(64) }, { timestamp: new Date(NOW.getTime() + 1000).toISOString() },
    ];
    for (const m of mutations) {
      expect(computeSignature({ ...ENVELOPE, ...m }, TEST_SECRET), JSON.stringify(m)).not.toBe(base);
    }
  });
});

describe("94B — the secret provider never leaks material", () => {
  it("rejects a reference that is not an allow-shaped env pointer", () => {
    for (const bad of ["secretref://x", "env:PATH", "env:AUTH_SECRET", "env:../x", ""]) {
      expect(envSecretProvider.resolve(bad)).toBeNull();
    }
  });

  it("has no hard-coded fallback secret in production code", () => {
    const src = readFileSync(resolve(process.cwd(), "src/lib/ot-edge/envelope-signature.ts"), "utf8");
    // AUTH_SECRET elsewhere has a dev fallback; a signing key must not.
    expect(src).not.toMatch(/\|\|\s*"[A-Za-z0-9\-]{16,}"/);
    expect(src).not.toMatch(/hermes-dev-insecure/);
  });

  it("resolves only from a fixed server-side allow-list, never a caller-shaped name", () => {
    // A pattern-based rule ("any OT_GATEWAY_HMAC_*") would still let the input
    // string choose WHICH variable is read. The reachable set is fixed here.
    const env = process.env as Record<string, string | undefined>;
    const prev = env.OT_GATEWAY_HMAC_PRIMARY;
    const prevRogue = env.OT_GATEWAY_HMAC_ROGUE;

    env.OT_GATEWAY_HMAC_ROGUE = "y".repeat(64);
    expect(
      envSecretProvider.resolve("env:OT_GATEWAY_HMAC_ROGUE"),
      "a variable outside the allow-list is unreachable even if it exists",
    ).toBeNull();

    env.OT_GATEWAY_HMAC_PRIMARY = "x".repeat(MIN_SIGNING_SECRET_LENGTH);
    expect(envSecretProvider.resolve("env:OT_GATEWAY_HMAC_PRIMARY")).toBe(
      "x".repeat(MIN_SIGNING_SECRET_LENGTH),
    );

    env.OT_GATEWAY_HMAC_PRIMARY = "short";
    expect(envSecretProvider.resolve("env:OT_GATEWAY_HMAC_PRIMARY"), "low-entropy secret is treated as unset").toBeNull();

    env.OT_GATEWAY_HMAC_PRIMARY = prev;
    env.OT_GATEWAY_HMAC_ROGUE = prevRogue;
  });

  it("a prototype-chain reference cannot resolve", () => {
    for (const bad of ["constructor", "__proto__", "toString", "hasOwnProperty"]) {
      expect(envSecretProvider.resolve(bad)).toBeNull();
    }
  });

  it("the approved reference list is explicit and frozen", () => {
    expect(APPROVED_SIGNING_KEY_REFS.length).toBeGreaterThan(0);
    for (const ref of APPROVED_SIGNING_KEY_REFS) expect(ref.startsWith("env:")).toBe(true);
    expect(Object.isFrozen(APPROVED_SIGNING_KEY_REFS)).toBe(true);
  });

  it("the secret is dereferenced from the GATEWAY record, not the envelope", async () => {
    // The envelope asserts a reference; only the server's registered copy may
    // select a secret. Here the envelope claims a ref the gateway does not have.
    const forged = { ...ENVELOPE, signingKeyRef: "env:OT_GATEWAY_HMAC_PRIMARY" };
    const r = await verifyGatewayEnvelope({
      envelope: forged,
      gateway: GATEWAY, // registered ref is secretref://gateways/gw-1
      actualPayloadChecksum: CHECKSUM,
      payloadByteLength: 10,
      nonceAlreadySeen: false,
      now: NOW,
      simulatorAllowed: false,
      signature: computeSignature(forged, TEST_SECRET),
      secrets: TEST_SECRETS,
    });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.rejection).toBe("SIGNATURE_REF_MISMATCH");
  });

  it("verifyEnvelopeSignature refuses when no approved reference is supplied", async () => {
    const verdict = await verifyEnvelopeSignature(
      ENVELOPE,
      computeSignature(ENVELOPE, TEST_SECRET),
      TEST_SECRETS,
      "", // no server-approved reference
    );
    expect(verdict).toBe("INVALID_SIGNATURE");
  });

  it("no signature or secret appears in any rejection value", async () => {
    const r = await verifyGatewayEnvelope({
      envelope: ENVELOPE, gateway: GATEWAY, actualPayloadChecksum: CHECKSUM,
      payloadByteLength: 10, nonceAlreadySeen: false, now: NOW, simulatorAllowed: false,
      signature: VALID_SIGNATURE, secrets: { resolve: () => null },
    });
    const serialized = JSON.stringify(r);
    expect(serialized).not.toContain(TEST_SECRET);
    expect(serialized).not.toContain(VALID_SIGNATURE);
  });
});
