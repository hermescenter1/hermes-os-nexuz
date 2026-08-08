import { describe, it, expect } from "vitest";
import { createHash, randomBytes } from "node:crypto";
import {
  encrypt,
  decrypt,
  parse,
  readHeader,
  transportSha256,
  parseKeyMaterial,
  generateKeyHex,
  EnvelopeError,
  MAGIC,
  TAG_BYTES,
  KEY_BYTES,
  NONCE_BYTES,
} from "../dr/backup-envelope.mjs";
import { canonicalize, canonicalSha256 } from "../dr/canonical-json.mjs";

/**
 * PHASE 98 — encrypted-backup envelope contract (pure, deterministic).
 *
 * Proves the authenticated-encryption core that protects every durable DR
 * artifact: AES-256-GCM round trip, and hard rejection of wrong key, corrupted
 * ciphertext, modified tag, tampered header, truncated file and unknown version —
 * each BEFORE any plaintext is released. Also locks the strict key-file loader
 * and the deterministic canonical JSON used for hashing manifests.
 */

const KEY = Buffer.from("a".repeat(64), "hex"); // deterministic 32-byte test key (non-secret)
const KEY2 = Buffer.from("b".repeat(64), "hex");
const KEY_ID = "phase98-test-key-2026";
const CREATED = "2026-08-07T00:00:00.000Z";

function makeArtifact(plaintext: Buffer, key = KEY) {
  return encrypt({ plaintext, key, keyId: KEY_ID, artifactType: "postgres", createdAt: CREATED });
}

describe("BACKUP_ENCRYPTION — AES-256-GCM authenticated round trip", () => {
  it("encrypts then decrypts back to the exact plaintext", () => {
    const plaintext = randomBytes(4096);
    const art = makeArtifact(plaintext);
    const { plaintext: out, header } = decrypt({ buffer: art, key: KEY });
    expect(out.equals(plaintext)).toBe(true);
    expect(header.cipher).toBe("aes-256-gcm");
    expect(header.artifactType).toBe("postgres");
    expect(header.keyId).toBe(KEY_ID);
    expect(header.formatVersion).toBe(1);
  });

  it("handles empty and 1-byte plaintext", () => {
    for (const pt of [Buffer.alloc(0), Buffer.from([0x42])]) {
      const art = makeArtifact(pt);
      expect(decrypt({ buffer: art, key: KEY }).plaintext.equals(pt)).toBe(true);
    }
  });

  it("starts with the HBK1 magic and carries a 16-byte tag", () => {
    const art = makeArtifact(Buffer.from("hello"));
    expect(art.subarray(0, MAGIC.length).equals(MAGIC)).toBe(true);
    expect(TAG_BYTES).toBe(16);
  });

  it("uses a fresh random nonce per encryption (distinct ciphertext for same input)", () => {
    const pt = Buffer.from("same-input");
    const a = makeArtifact(pt);
    const b = makeArtifact(pt);
    expect(a.equals(b)).toBe(false); // different nonce → different bytes
    expect(decrypt({ buffer: a, key: KEY }).plaintext.equals(pt)).toBe(true);
    expect(decrypt({ buffer: b, key: KEY }).plaintext.equals(pt)).toBe(true);
  });

  it("authenticates the plaintext digest in the header", () => {
    const pt = randomBytes(256);
    const header = readHeader(makeArtifact(pt));
    expect(header.plaintextSha256).toBe(createHash("sha256").update(pt).digest("hex"));
    expect(header.plaintextSize).toBe(pt.length);
  });
});

describe("BACKUP_ENCRYPTION — failure injection (must reject before releasing plaintext)", () => {
  const plaintext = randomBytes(2048);

  it("WRONG_KEY_REJECTION: a different key fails authentication", () => {
    const art = makeArtifact(plaintext);
    expect(() => decrypt({ buffer: art, key: KEY2 })).toThrowError(EnvelopeError);
    try {
      decrypt({ buffer: art, key: KEY2 });
    } catch (e: any) {
      expect(e.code).toBe("DECRYPTION_FAILED");
    }
  });

  it("CORRUPTION_REJECTION: a flipped ciphertext byte fails authentication", () => {
    const art = makeArtifact(plaintext);
    const mid = Math.floor(art.length / 2);
    art[mid] = art[mid] ^ 0xff;
    try {
      decrypt({ buffer: art, key: KEY });
      throw new Error("should not reach");
    } catch (e: any) {
      expect(e.code).toBe("DECRYPTION_FAILED");
    }
  });

  it("MODIFIED_TAG_REJECTION: tampering with the GCM tag fails", () => {
    const art = makeArtifact(plaintext);
    art[art.length - 1] = art[art.length - 1] ^ 0xff;
    try {
      decrypt({ buffer: art, key: KEY });
      throw new Error("should not reach");
    } catch (e: any) {
      expect(e.code).toBe("DECRYPTION_FAILED");
    }
  });

  it("TAMPERED_HEADER_REJECTION: editing an authenticated header byte fails", () => {
    const art = makeArtifact(plaintext);
    // Header starts after MAGIC(4)+len(4); flip a byte inside the JSON header.
    const headerByte = 8 + 5;
    art[headerByte] = art[headerByte] ^ 0x01;
    // Either the JSON no longer parses (BAD_HEADER) or the AAD no longer matches
    // (DECRYPTION_FAILED). Both are hard rejections.
    try {
      decrypt({ buffer: art, key: KEY });
      throw new Error("should not reach");
    } catch (e: any) {
      expect(["DECRYPTION_FAILED", "BAD_HEADER", "UNSUPPORTED_VERSION", "UNSUPPORTED_CIPHER", "BAD_INPUT"]).toContain(
        e.code,
      );
    }
  });

  it("TRUNCATION_REJECTION: a truncated ciphertext is rejected", () => {
    const art = makeArtifact(plaintext);
    const truncated = art.subarray(0, art.length - 32);
    try {
      decrypt({ buffer: truncated, key: KEY });
      throw new Error("should not reach");
    } catch (e: any) {
      expect(["DECRYPTION_FAILED", "TRUNCATED"]).toContain(e.code);
    }
  });

  it("UNKNOWN_MAGIC_REJECTION: a non-.hbk buffer is rejected", () => {
    const junk = Buffer.concat([Buffer.from("XXXX"), randomBytes(100)]);
    try {
      parse(junk);
      throw new Error("should not reach");
    } catch (e: any) {
      expect(e.code).toBe("UNKNOWN_MAGIC");
    }
  });

  it("UNSUPPORTED_VERSION_REJECTION: an unknown formatVersion is rejected", () => {
    const art = makeArtifact(plaintext);
    // Rewrite the header to formatVersion 999 (breaks AAD, but version is checked in parse first).
    const parsed = parse(art);
    const tampered = { ...parsed.header, formatVersion: 999 };
    const headerBytes = Buffer.from(JSON.stringify(tampered), "utf8");
    const len = Buffer.alloc(4);
    len.writeUInt32BE(headerBytes.length, 0);
    const rebuilt = Buffer.concat([MAGIC, len, headerBytes, parsed.ciphertext, parsed.tag]);
    try {
      decrypt({ buffer: rebuilt, key: KEY });
      throw new Error("should not reach");
    } catch (e: any) {
      expect(e.code).toBe("UNSUPPORTED_VERSION");
    }
  });

  it("ARTIFACT_TYPE enforcement rejects a mismatched expected type", () => {
    const art = encrypt({ plaintext, key: KEY, keyId: KEY_ID, artifactType: "postgres", createdAt: CREATED });
    try {
      decrypt({ buffer: art, key: KEY, expectArtifactType: "uploads" });
      throw new Error("should not reach");
    } catch (e: any) {
      expect(e.code).toBe("ARTIFACT_TYPE_MISMATCH");
    }
  });
});

describe("BACKUP_ENCRYPTION — key material loader", () => {
  it("accepts 64-hex, 32 raw bytes, and 32-byte base64", () => {
    const raw = randomBytes(KEY_BYTES);
    expect(parseKeyMaterial(raw).equals(raw)).toBe(true);
    expect(parseKeyMaterial(Buffer.from(raw.toString("hex"))).equals(raw)).toBe(true);
    expect(parseKeyMaterial(Buffer.from(raw.toString("base64"))).equals(raw)).toBe(true);
  });

  it("generateKeyHex yields 64 hex chars decoding to 32 bytes", () => {
    const hex = generateKeyHex();
    expect(hex).toMatch(/^[0-9a-f]{64}$/);
    expect(parseKeyMaterial(Buffer.from(hex)).length).toBe(KEY_BYTES);
  });

  it("rejects an all-zero key and wrong-length material", () => {
    expect(() => parseKeyMaterial(Buffer.alloc(KEY_BYTES))).toThrow(/all-zero/);
    expect(() => parseKeyMaterial(Buffer.from("deadbeef"))).toThrow(EnvelopeError);
  });
});

describe("BACKUP_ENCRYPTION — transport checksum determinism", () => {
  it("transportSha256 is stable for identical bytes", () => {
    const art = makeArtifact(Buffer.from("determinism"));
    expect(transportSha256(art)).toBe(transportSha256(Buffer.from(art)));
    expect(transportSha256(art)).toBe(createHash("sha256").update(art).digest("hex"));
  });
});

describe("MANIFEST_CANONICALIZATION — deterministic JSON", () => {
  it("sorts object keys recursively regardless of insertion order", () => {
    const a = { b: 1, a: { z: 2, y: 3 }, c: [3, 2, 1] };
    const b = { c: [3, 2, 1], a: { y: 3, z: 2 }, b: 1 };
    expect(canonicalize(a)).toBe(canonicalize(b));
    expect(canonicalSha256(a)).toBe(canonicalSha256(b));
  });

  it("preserves array order (order is semantic in manifests)", () => {
    expect(canonicalize([1, 2, 3])).not.toBe(canonicalize([3, 2, 1]));
  });

  it("omits undefined members and rejects non-finite numbers", () => {
    expect(canonicalize({ a: undefined, b: 1 })).toBe('{"b":1}');
    expect(() => canonicalize({ a: Infinity })).toThrow();
    expect(() => canonicalize({ a: NaN })).toThrow();
  });
});
