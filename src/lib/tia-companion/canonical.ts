/**
 * PHASE 109-C2.0 — deterministic canonicalisation and integrity primitives.
 *
 * Everything downstream of this file identifies content by a SHA-256 taken over
 * a canonical byte sequence. That only works if canonicalisation is a function
 * of the VALUE and of nothing else — not of key insertion order, not of the
 * host's collation, not of the reader's locale. Three rules enforce that:
 *
 *   1. ORDERING IS BY UNICODE CODE POINT, never `localeCompare`. `localeCompare`
 *      is a locale-sensitive collation: the same two keys can order differently
 *      under `tr-TR` than under `en-US`, which would let the same manifest hash
 *      to two different digests on two machines. Code-point order is total,
 *      stable and locale-independent, and it is the only ordering used here.
 *   2. NON-FINITE NUMBERS ARE REFUSED. `JSON.stringify` silently maps `NaN`,
 *      `Infinity` and `-Infinity` to `null`, which would make three distinct
 *      values share one digest — a collision manufactured by the serialiser.
 *      A value that cannot be represented is an error, not a `null`.
 *   3. NOTHING HERE READS A CLOCK, THE ENVIRONMENT, THE NETWORK OR A FILE.
 *      The functions are pure, so a digest is reproducible by anyone holding
 *      the value.
 *
 * UNICODE NORMALISATION POLICY: NONE IS APPLIED, AND THAT IS A STATED CHOICE.
 * Strings are hashed as the code-point sequences they are. `"café"` written
 * precomposed (U+00E9) and decomposed (U+0065 U+0301) render identically and
 * hash differently — measured, not assumed. Applying NFC here would silently
 * change identity semantics for the whole companion AND diverge from Phase
 * 109-C1, whose `normaliseArtifactPath` applies no normalisation either. That
 * divergence is a product decision, not a refactor, so it is documented and
 * escalated rather than made here. See SECURITY-READBACK for the proposal.
 *
 * SHA-256 is used because these digests are integrity evidence. The Phase 109-C1
 * `contentChecksum` is a 64-bit FNV-style hash explicitly documented as "not a
 * security primitive"; it is deliberately NOT reused here, and a test pins that
 * separation.
 */

/** Thrown when a value cannot be canonicalised without losing identity. */
export class TiaCanonicalError extends Error {
  readonly reason: string;
  constructor(reason: string) {
    super(`[tia-companion] value cannot be canonicalised: ${reason}`);
    this.name = "TiaCanonicalError";
    this.reason = reason;
  }
}

/**
 * Total order over strings by Unicode code point.
 *
 * Deliberately not `a < b`: the `<` operator compares UTF-16 code UNITS, so an
 * astral character (U+1F600, stored as a surrogate pair) sorts before U+FFFD
 * even though its code point is larger. That anomaly is deterministic, so it
 * would not break hashing — but it makes the canonical order disagree with the
 * order a reader would compute from the code points, and an integrity format
 * should not carry a surprise nobody documented.
 */
export function compareCodepoints(a: string, b: string): number {
  const left = Array.from(a);
  const right = Array.from(b);
  const shared = Math.min(left.length, right.length);
  for (let i = 0; i < shared; i += 1) {
    const ca = left[i].codePointAt(0) as number;
    const cb = right[i].codePointAt(0) as number;
    if (ca !== cb) return ca < cb ? -1 : 1;
  }
  if (left.length === right.length) return 0;
  return left.length < right.length ? -1 : 1;
}

/**
 * Keys that must never appear in a canonical value.
 *
 * `__proto__` is not merely distasteful, it is a MANUFACTURED COLLISION. Writing
 * it onto an ordinary object goes through the prototype setter instead of
 * creating an own property, so the key disappears from `Object.keys` and from
 * the serialised bytes. Measured on the pre-correction implementation:
 *
 *     stableStringify(JSON.parse('{"__proto__":{"x":1},"a":1}'))  ===  '{"a":1}'
 *
 * Two different documents, one digest — and `JSON.parse` produces `__proto__`
 * as an own property, so untrusted input can reach it. It is refused rather
 * than sanitised, for the same reason a traversal path is: silently dropping it
 * would erase the evidence that something sent it.
 *
 * `constructor` and `prototype` were measured to round-trip correctly as
 * ordinary own properties and are therefore NOT refused; banning them would be
 * cargo-culting a rule whose actual mechanism does not apply to them.
 */
const REFUSED_KEYS: readonly string[] = ["__proto__"];

function isPlainObject(value: object): boolean {
  const proto = Object.getPrototypeOf(value);
  return proto === Object.prototype || proto === null;
}

function canonicalValue(value: unknown, depth: number): unknown {
  if (depth > 64) throw new TiaCanonicalError("value nests deeper than 64 levels");

  if (value === null) return null;

  switch (typeof value) {
    case "string":
    case "boolean":
      return value;
    case "number":
      if (!Number.isFinite(value)) {
        throw new TiaCanonicalError(
          "a non-finite number would serialise to null and collide with other values",
        );
      }
      // `-0` is normalised to `0` EXPLICITLY rather than being left to
      // JSON.stringify, which does the same thing silently. The two are equal
      // under `===`, so collapsing them is correct; doing it here means the
      // collapse is a stated rule instead of an artifact of the serialiser.
      return Object.is(value, -0) ? 0 : value;
    case "bigint":
      throw new TiaCanonicalError("bigint has no canonical JSON representation");
    case "function":
      throw new TiaCanonicalError("a function carries no content");
    case "symbol":
      throw new TiaCanonicalError("a symbol carries no content");
    case "undefined":
      throw new TiaCanonicalError("undefined is not a representable value");
    default:
      break;
  }

  if (Array.isArray(value)) {
    // A HOLE is refused. `[1,,3]` serialises to `[1,null,3]`, so a sparse array
    // and an array with an explicit null share a digest. Nothing legitimate
    // produces a hole — JSON has no such thing — so this can only be a mistake
    // or an attempt, and either deserves to be seen.
    for (let i = 0; i < value.length; i += 1) {
      if (!(i in value)) {
        throw new TiaCanonicalError(`array index ${i} is a hole, which would serialise as null`);
      }
    }
    // Array ORDER is content: it is preserved, never sorted. Collections whose
    // order is incidental are sorted by their identity key by the caller that
    // knows which key that is.
    return value.map((entry) => canonicalValue(entry, depth + 1));
  }

  // An exotic object is refused. `Date`, `Map` and `Set` were all measured to
  // canonicalise to `{}` — three distinct values sharing one digest, because
  // `Object.keys` sees none of their internal state. A canonical form that
  // cannot represent a value must say so rather than emit an empty object.
  if (!isPlainObject(value as object)) {
    const name = (value as object).constructor?.name ?? "object";
    throw new TiaCanonicalError(
      `${name} has no canonical JSON representation and would serialise as {}`,
    );
  }

  const source = value as Record<string, unknown>;
  const keys = Object.keys(source).sort(compareCodepoints);
  // Null-prototype accumulator: belt and braces behind the refusal above, so a
  // refused key could not silently vanish even if the check were bypassed.
  const out: Record<string, unknown> = Object.create(null) as Record<string, unknown>;
  for (const key of keys) {
    if (REFUSED_KEYS.includes(key)) {
      throw new TiaCanonicalError(`the key "${key}" cannot appear in a canonical value`);
    }
    const entry = source[key];
    // An absent key and a key set to `undefined` must canonicalise identically;
    // otherwise `{a:1}` and `{a:1,b:undefined}` would produce different bytes
    // while denoting the same content.
    if (entry === undefined) continue;
    out[key] = canonicalValue(entry, depth + 1);
  }
  return out;
}

/** Canonical JSON text: keys in code-point order, `undefined` members dropped. */
export function stableStringify(value: unknown): string {
  return JSON.stringify(canonicalValue(value, 0)) as string;
}

/**
 * SHA-256 of a UTF-8 string, as lowercase hex.
 *
 * `node:crypto` is imported dynamically for the same reason the Phase 94
 * envelope does it: this module sits in `src/lib` and must stay importable from
 * a module graph that a bundler may walk, without pulling a Node built-in into
 * a browser bundle.
 */
export async function sha256Hex(input: string): Promise<string> {
  const { createHash } = await import("node:crypto");
  return createHash("sha256").update(input, "utf8").digest("hex");
}

/** SHA-256 over the canonical form of any representable value. */
export async function canonicalSha256(value: unknown): Promise<string> {
  return sha256Hex(stableStringify(value));
}

const SHA256_HEX = /^[0-9a-f]{64}$/;

/**
 * Whether a value is a well-formed lowercase SHA-256 digest.
 *
 * Case matters: accepting both cases would mean one digest has two spellings,
 * and two spellings of one identity is how a duplicate check stops working.
 */
export function isSha256Hex(value: unknown): value is string {
  return typeof value === "string" && SHA256_HEX.test(value);
}

/**
 * Compare two digests.
 *
 * NOT CONSTANT-TIME, deliberately and on the record.
 *
 * These are integrity digests over non-secret engineering metadata, not MACs
 * and not authentication tags. Nothing here is a secret an attacker could
 * recover by timing a comparison: both operands are values the caller already
 * holds, and a mismatch produces a finding rather than an access decision. A
 * `timingSafeEqual` would buy nothing and would suggest a threat model this
 * function does not have.
 *
 * If a later slice ever compares a MAC, a signature or a capability token, this
 * is the WRONG function and a constant-time one belongs beside it — the rule is
 * recorded here so that decision is made deliberately rather than by reuse.
 *
 * Length behaviour: both operands must be exactly 64 lowercase hex characters.
 * Anything shorter, longer, upper-case or non-string fails the guard and the
 * result is `false` — two malformed values are never reported as equal.
 */
export function digestsEqual(a: unknown, b: unknown): boolean {
  return isSha256Hex(a) && isSha256Hex(b) && a === b;
}
