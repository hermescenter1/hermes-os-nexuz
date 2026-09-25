/**
 * PHASE 112 — Hermes canonical JSON profile + SHA-256 (server-only).
 *
 * A STANDALONE, deterministic canonicalizer for the immutable reasoning-run
 * ledger. It is intentionally independent of `src/lib/tia-companion/canonical.ts`
 * so the Phase 112 integrity contract can evolve and be versioned on its own; the
 * duplication and a future consolidation path are recorded in the Phase 112
 * validation report. This module is server-only — it uses `node:crypto`.
 *
 * This is a DOCUMENTED HERMES CANONICAL PROFILE, not certified RFC 8785. The
 * profile (see docs/industrial/phase112-replay-and-integrity-model.md):
 *   - recursive lexicographic object-key ordering by Unicode CODE POINT;
 *   - array order preserved;
 *   - strings/booleans/null and FINITE numbers only;
 *   - reject undefined, NaN, ±Infinity, BigInt, functions, symbols, sparse array
 *     holes, cyclic objects and any non-plain object (Date/Map/Set/RegExp/class
 *     instances) — nothing is coerced silently;
 *   - no locale-dependent formatting;
 *   - UTF-8 SHA-256 lowercase hex.
 */
import { createHash } from "node:crypto";

/** Version of the canonical profile. Bump only on an intentional format change. */
export const CANONICAL_PROFILE_VERSION = "hermes-canonical-json/1.0.0";

/** Thrown for any value the canonical profile refuses to represent. */
export class ReasoningCanonicalError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ReasoningCanonicalError";
  }
}

/** Compare two strings by Unicode code point (stable across astral characters). */
export function compareByCodePoint(a: string, b: string): number {
  const ca = Array.from(a);
  const cb = Array.from(b);
  const len = Math.min(ca.length, cb.length);
  for (let i = 0; i < len; i += 1) {
    const pa = ca[i].codePointAt(0)!;
    const pb = cb[i].codePointAt(0)!;
    if (pa !== pb) return pa < pb ? -1 : 1;
  }
  return ca.length - cb.length;
}

function isPlainObject(value: object): boolean {
  const proto = Object.getPrototypeOf(value);
  return proto === Object.prototype || proto === null;
}

function serialize(value: unknown, ancestors: object[], path: string): string {
  // Primitives and the value-less cases first.
  if (value === null) return "null";

  const t = typeof value;
  if (t === "undefined") {
    throw new ReasoningCanonicalError(`undefined is not representable at ${path}`);
  }
  if (t === "function" || t === "symbol") {
    throw new ReasoningCanonicalError(`${t} is not representable at ${path}`);
  }
  if (t === "bigint") {
    throw new ReasoningCanonicalError(`BigInt is not representable at ${path}`);
  }
  if (t === "boolean") return value ? "true" : "false";
  if (t === "number") {
    if (!Number.isFinite(value as number)) {
      throw new ReasoningCanonicalError(`non-finite number is not representable at ${path}`);
    }
    // JSON.stringify gives a locale-independent, canonical numeric string; -0 → "0".
    return JSON.stringify(value);
  }
  if (t === "string") {
    return JSON.stringify(value);
  }

  // Objects and arrays.
  const obj = value as object;
  if (ancestors.includes(obj)) {
    throw new ReasoningCanonicalError(`cyclic reference is not representable at ${path}`);
  }
  const nextAncestors = [...ancestors, obj];

  if (Array.isArray(value)) {
    const parts: string[] = [];
    for (let i = 0; i < value.length; i += 1) {
      if (!(i in value)) {
        throw new ReasoningCanonicalError(`sparse array hole is not representable at ${path}[${i}]`);
      }
      const element = value[i];
      if (typeof element === "undefined") {
        throw new ReasoningCanonicalError(`undefined array element is not representable at ${path}[${i}]`);
      }
      parts.push(serialize(element, nextAncestors, `${path}[${i}]`));
    }
    return `[${parts.join(",")}]`;
  }

  if (!isPlainObject(obj)) {
    throw new ReasoningCanonicalError(
      `only plain objects are representable; got a non-plain object at ${path}`,
    );
  }

  const keys = Object.keys(obj).sort(compareByCodePoint);
  const parts: string[] = [];
  for (const key of keys) {
    const child = (obj as Record<string, unknown>)[key];
    if (typeof child === "undefined") {
      throw new ReasoningCanonicalError(`undefined property is not representable at ${path}.${key}`);
    }
    parts.push(`${JSON.stringify(key)}:${serialize(child, nextAncestors, `${path}.${key}`)}`);
  }
  return `{${parts.join(",")}}`;
}

/**
 * Canonical string form of a representable value. Two semantically equal values
 * with different object insertion order produce the SAME string; any meaningful
 * change produces a different string. Throws `ReasoningCanonicalError` for any
 * value the profile refuses.
 */
export function stableStringify(value: unknown): string {
  return serialize(value, [], "$");
}

/** UTF-8 SHA-256 of an already-canonical string, lowercase hex. */
export function sha256Hex(input: string): string {
  return createHash("sha256").update(input, "utf8").digest("hex");
}

/** Canonical SHA-256 (lowercase hex) over the canonical bytes of a value. */
export function canonicalSha256(value: unknown): string {
  return sha256Hex(stableStringify(value));
}

/**
 * Deterministically clean a value into canonicalizable JSON: drops `undefined`
 * object properties and applies the standard JSON projection. Applied by the
 * services to engine-produced snapshots BEFORE hashing, in BOTH create and
 * replay, so an optional field the engine leaves `undefined` never causes a
 * canonicalization throw or a false replay mismatch. Throws when the value has
 * no JSON representation at all (e.g. a bare `undefined`).
 */
export function sanitizeForCanonical(value: unknown): unknown {
  const json = JSON.stringify(value);
  if (json === undefined) {
    throw new ReasoningCanonicalError("value has no JSON representation");
  }
  return JSON.parse(json);
}

const SHA256_HEX = /^[0-9a-f]{64}$/;

/** Whether a value is a well-formed lowercase SHA-256 digest. Case matters. */
export function isSha256Hex(value: unknown): value is string {
  return typeof value === "string" && SHA256_HEX.test(value);
}

/**
 * Compare two digests. NOT constant-time by design: these are integrity digests
 * over non-secret engineering metadata, not MACs, and a mismatch produces a
 * finding rather than an access decision. Both operands must be exactly 64
 * lowercase hex characters; anything else compares false.
 */
export function digestsEqual(a: unknown, b: unknown): boolean {
  return isSha256Hex(a) && isSha256Hex(b) && a === b;
}
