/**
 * Hermes OS — Phase 98 encrypted-backup envelope (`.hbk`).
 *
 * Authenticated encryption at rest for every durable disaster-recovery artifact
 * (PostgreSQL dumps and uploads archives). Uses a standard authenticated cipher —
 * AES-256-GCM via Node's crypto — wrapped in a small, versioned, self-describing
 * envelope. NO custom cryptography beyond framing a standard AEAD.
 *
 * Envelope byte layout (`.hbk`):
 *
 *   ┌────────────┬──────────────┬──────────────┬────────────┬──────────┐
 *   │ MAGIC (4)  │ headerLen(4) │ header (N)   │ ciphertext │ tag (16) │
 *   │ "HBK1"     │ uint32 BE    │ canon JSON   │ (variable) │ GCM tag  │
 *   └────────────┴──────────────┴──────────────┴────────────┴──────────┘
 *
 * The AEAD Additional Authenticated Data (AAD) is exactly the framing prefix
 * `MAGIC || headerLen || header`, so the entire header — formatVersion, cipher,
 * keyId, nonce, plaintext digest/size, artifactType — is cryptographically bound
 * to the ciphertext. Any tampering with the header, a wrong key, corrupted
 * ciphertext, a modified tag or a truncated file all fail the GCM tag check
 * BEFORE any plaintext is released. Header metadata is authenticated; it is never
 * treated as trusted plaintext until the tag verifies.
 *
 * Key handling (see loadKeyFile): the operator supplies a key FILE, never a raw
 * CLI value or an env value. The key is 256 bits of high-entropy material. The
 * key, key material and plaintext are NEVER logged. The real Production key is
 * NOT provisioned by this repository; CI/rehearsals use disposable random keys.
 */

import { createCipheriv, createDecipheriv, createHash, randomBytes, timingSafeEqual } from "node:crypto";
import { statSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { canonicalBytes } from "./canonical-json.mjs";

export const MAGIC = Buffer.from("HBK1", "ascii"); // 4 bytes
export const FORMAT_VERSION = 1;
export const CIPHER = "aes-256-gcm";
export const KEY_BYTES = 32; // 256-bit
export const NONCE_BYTES = 12; // 96-bit GCM nonce
export const TAG_BYTES = 16; // 128-bit GCM tag
const HEADER_LEN_BYTES = 4;
const PREFIX_MIN = MAGIC.length + HEADER_LEN_BYTES;
const MAX_HEADER_BYTES = 64 * 1024; // hard bound: a header is small metadata, never megabytes

/** Stable error with a machine-classifiable code for the failure-injection matrix. */
export class EnvelopeError extends Error {
  /** @param {string} code @param {string} message */
  constructor(code, message) {
    super(message);
    this.name = "EnvelopeError";
    this.code = code;
  }
}

// ── Key loading ───────────────────────────────────────────────────────────────

/**
 * Load and strictly validate a 256-bit key from a file. Accepts, in order:
 *   1. exactly 32 raw bytes;
 *   2. 64 lowercase-hex characters (± trailing whitespace);
 *   3. base64 that decodes to exactly 32 bytes.
 * Rejects an all-zero key. On POSIX, refuses a key file readable by group/other
 * (mode & 0o077 must be 0). On Windows the mode check is skipped (not meaningful).
 *
 * @param {string} keyFilePath
 * @returns {Promise<Buffer>} the 32-byte key
 */
export async function loadKeyFile(keyFilePath) {
  if (!keyFilePath || typeof keyFilePath !== "string") {
    throw new EnvelopeError("BAD_KEY_FILE", "key file path is required");
  }
  let st;
  try {
    st = statSync(keyFilePath);
  } catch {
    throw new EnvelopeError("BAD_KEY_FILE", "key file not found");
  }
  if (!st.isFile()) throw new EnvelopeError("BAD_KEY_FILE", "key path is not a regular file");
  if (process.platform !== "win32" && (st.mode & 0o077) !== 0) {
    throw new EnvelopeError("KEY_FILE_PERMISSIONS", "key file must be owner-readable only (chmod 600)");
  }
  const raw = await readFile(keyFilePath);
  return parseKeyMaterial(raw);
}

/** @param {Buffer} raw @returns {Buffer} */
export function parseKeyMaterial(raw) {
  let key;
  if (raw.length === KEY_BYTES) {
    key = Buffer.from(raw);
  } else {
    const text = raw.toString("utf8").trim();
    if (/^[0-9a-f]{64}$/.test(text)) {
      key = Buffer.from(text, "hex");
    } else {
      const b64 = Buffer.from(text, "base64");
      if (b64.length === KEY_BYTES) {
        key = b64;
      } else {
        throw new EnvelopeError("BAD_KEY_FILE", "key material must be 32 raw bytes, 64 hex chars, or 32-byte base64");
      }
    }
  }
  if (key.length !== KEY_BYTES) {
    throw new EnvelopeError("BAD_KEY_FILE", "decoded key is not 256-bit");
  }
  if (key.every((b) => b === 0)) {
    throw new EnvelopeError("BAD_KEY_FILE", "key material is all-zero (not a real key)");
  }
  return key;
}

/** Generate a fresh random 256-bit key as 64-char lowercase hex (for disposable CI keys). */
export function generateKeyHex() {
  return randomBytes(KEY_BYTES).toString("hex");
}

// ── Header framing (shared by the in-memory encrypt() and the streaming CLI) ────

/**
 * Build the authenticated framing prefix (MAGIC || headerLen || header). Both the
 * in-memory `encrypt()` and the streaming CLI use this so their `.hbk` bytes are
 * byte-identical for the same inputs.
 *
 * @param {object} o
 * @param {string} o.keyId
 * @param {"postgres"|"uploads"} o.artifactType
 * @param {string} [o.createdAt]
 * @param {Record<string,unknown>} [o.extra]
 * @param {Buffer} o.nonce
 * @param {string} o.plaintextSha256
 * @param {number} o.plaintextSize
 * @returns {{ header: object, headerBytes: Buffer, aad: Buffer }}
 */
export function buildEnvelopeFraming({ keyId, artifactType, createdAt, extra, nonce, plaintextSha256, plaintextSize }) {
  const header = {
    formatVersion: FORMAT_VERSION,
    magic: "HBK1",
    cipher: CIPHER,
    artifactType,
    keyId,
    nonce: nonce.toString("base64"),
    plaintextSha256,
    plaintextSize,
    createdAt: createdAt ?? null,
    ...(extra && typeof extra === "object" ? { extra } : {}),
  };
  const headerBytes = canonicalBytes(header);
  if (headerBytes.length > MAX_HEADER_BYTES) throw new EnvelopeError("BAD_INPUT", "header too large");
  const headerLen = Buffer.alloc(HEADER_LEN_BYTES);
  headerLen.writeUInt32BE(headerBytes.length, 0);
  const aad = Buffer.concat([MAGIC, headerLen, headerBytes]);
  return { header, headerBytes, aad };
}

export { HEADER_LEN_BYTES, MAX_HEADER_BYTES };

// ── Encrypt ─────────────────────────────────────────────────────────────────

/**
 * Encrypt a plaintext buffer into a `.hbk` envelope buffer.
 *
 * @param {object} opts
 * @param {Buffer} opts.plaintext
 * @param {Buffer} opts.key                 32-byte key
 * @param {string} opts.keyId               non-secret key identifier
 * @param {"postgres"|"uploads"} opts.artifactType
 * @param {string} [opts.createdAt]         ISO timestamp (caller-supplied for determinism)
 * @param {Record<string,unknown>} [opts.extra]  additional authenticated metadata
 * @param {Buffer} [opts.nonce]             12-byte nonce (test-only override; random otherwise)
 * @returns {Buffer} the encrypted `.hbk` artifact
 */
export function encrypt({ plaintext, key, keyId, artifactType, createdAt, extra, nonce }) {
  assertKey(key);
  if (!Buffer.isBuffer(plaintext)) throw new EnvelopeError("BAD_INPUT", "plaintext must be a Buffer");
  if (!keyId || typeof keyId !== "string") throw new EnvelopeError("BAD_INPUT", "keyId is required (non-secret)");
  if (artifactType !== "postgres" && artifactType !== "uploads") {
    throw new EnvelopeError("BAD_INPUT", "artifactType must be 'postgres' or 'uploads'");
  }
  const iv = nonce ?? randomBytes(NONCE_BYTES);
  if (iv.length !== NONCE_BYTES) throw new EnvelopeError("BAD_INPUT", "nonce must be 12 bytes");

  const plaintextSha256 = createHash("sha256").update(plaintext).digest("hex");
  const { aad } = buildEnvelopeFraming({
    keyId,
    artifactType,
    createdAt,
    extra,
    nonce: iv,
    plaintextSha256,
    plaintextSize: plaintext.length,
  });

  const cipher = createCipheriv(CIPHER, key, iv);
  cipher.setAAD(aad);
  const ciphertext = Buffer.concat([cipher.update(plaintext), cipher.final()]);
  const tag = cipher.getAuthTag();

  return Buffer.concat([aad, ciphertext, tag]);
}

// ── Parse (framing only — does NOT authenticate) ──────────────────────────────

/**
 * Parse the framing of a `.hbk` buffer WITHOUT decrypting. Validates magic,
 * bounds and the header JSON. Never releases plaintext. Throws EnvelopeError with
 * a classifiable code on any structural problem.
 *
 * @param {Buffer} buf
 * @returns {{ header: any, headerBytes: Buffer, aad: Buffer, ciphertext: Buffer, tag: Buffer, nonce: Buffer }}
 */
export function parse(buf) {
  if (!Buffer.isBuffer(buf)) throw new EnvelopeError("BAD_INPUT", "artifact must be a Buffer");
  if (buf.length < PREFIX_MIN + TAG_BYTES) throw new EnvelopeError("TRUNCATED", "artifact shorter than minimum envelope");
  if (!buf.subarray(0, MAGIC.length).equals(MAGIC)) {
    throw new EnvelopeError("UNKNOWN_MAGIC", "not a Hermes .hbk artifact (bad magic)");
  }
  const headerLen = buf.readUInt32BE(MAGIC.length);
  if (headerLen === 0 || headerLen > MAX_HEADER_BYTES) throw new EnvelopeError("BAD_HEADER", "invalid header length");
  const headerStart = PREFIX_MIN;
  const headerEnd = headerStart + headerLen;
  // Need header + at least a tag after it.
  if (buf.length < headerEnd + TAG_BYTES) throw new EnvelopeError("TRUNCATED", "artifact truncated within header/tag");
  const headerBytes = buf.subarray(headerStart, headerEnd);
  let header;
  try {
    header = JSON.parse(headerBytes.toString("utf8"));
  } catch {
    throw new EnvelopeError("BAD_HEADER", "header is not valid JSON");
  }
  if (header?.formatVersion !== FORMAT_VERSION) {
    throw new EnvelopeError("UNSUPPORTED_VERSION", `unsupported formatVersion: ${header?.formatVersion}`);
  }
  if (header?.cipher !== CIPHER) throw new EnvelopeError("UNSUPPORTED_CIPHER", `unsupported cipher: ${header?.cipher}`);
  let nonce;
  try {
    nonce = Buffer.from(String(header.nonce), "base64");
  } catch {
    nonce = Buffer.alloc(0);
  }
  if (nonce.length !== NONCE_BYTES) throw new EnvelopeError("BAD_HEADER", "header nonce is not 12 bytes");

  const tag = buf.subarray(buf.length - TAG_BYTES);
  const ciphertext = buf.subarray(headerEnd, buf.length - TAG_BYTES);
  const aad = buf.subarray(0, headerEnd);
  return { header, headerBytes, aad, ciphertext, tag, nonce };
}

// ── Decrypt (authenticated) ───────────────────────────────────────────────────

/**
 * Authenticate and decrypt a `.hbk` buffer. The GCM tag is verified during
 * `final()`, so a wrong key, corrupted ciphertext, modified tag, tampered header
 * or truncated file throws DECRYPTION_FAILED (or a structural code from parse)
 * and NO plaintext is returned. After decryption, the authenticated plaintext
 * digest and size are re-checked as defence in depth.
 *
 * @param {object} opts
 * @param {Buffer} opts.buffer
 * @param {Buffer} opts.key
 * @param {"postgres"|"uploads"} [opts.expectArtifactType]  optional: enforce artifact type
 * @returns {{ plaintext: Buffer, header: any }}
 */
export function decrypt({ buffer, key, expectArtifactType }) {
  assertKey(key);
  const { header, aad, ciphertext, tag, nonce } = parse(buffer);
  if (expectArtifactType && header.artifactType !== expectArtifactType) {
    throw new EnvelopeError("ARTIFACT_TYPE_MISMATCH", `expected ${expectArtifactType}, got ${header.artifactType}`);
  }
  const decipher = createDecipheriv(CIPHER, key, nonce);
  decipher.setAAD(aad);
  decipher.setAuthTag(tag);
  let plaintext;
  try {
    plaintext = Buffer.concat([decipher.update(ciphertext), decipher.final()]);
  } catch {
    // Wrong key / corrupted ciphertext / modified tag / tampered header all land here.
    throw new EnvelopeError("DECRYPTION_FAILED", "authentication failed — wrong key or corrupted artifact");
  }
  // Defence in depth: verify the authenticated plaintext digest/size.
  if (typeof header.plaintextSize === "number" && plaintext.length !== header.plaintextSize) {
    throw new EnvelopeError("CHECKSUM_MISMATCH", "decrypted size does not match authenticated header");
  }
  if (typeof header.plaintextSha256 === "string") {
    const got = createHash("sha256").update(plaintext).digest();
    const want = Buffer.from(header.plaintextSha256, "hex");
    if (want.length !== got.length || !timingSafeEqual(got, want)) {
      throw new EnvelopeError("CHECKSUM_MISMATCH", "decrypted digest does not match authenticated header");
    }
  }
  return { plaintext, header };
}

/** SHA-256 (hex) over the final encrypted artifact — the safe transport checksum. */
export function transportSha256(buf) {
  return createHash("sha256").update(buf).digest("hex");
}

/** Read a `.hbk` header without decrypting (for inventory/verification records). */
export function readHeader(buf) {
  return parse(buf).header;
}

function assertKey(key) {
  if (!Buffer.isBuffer(key) || key.length !== KEY_BYTES) {
    throw new EnvelopeError("BAD_KEY", "key must be a 32-byte Buffer");
  }
}
