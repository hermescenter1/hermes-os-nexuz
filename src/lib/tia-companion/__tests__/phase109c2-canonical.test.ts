/**
 * PHASE 109-C2.0 — canonicalisation and integrity.
 *
 * Everything the companion calls an identity is a SHA-256 over canonical bytes,
 * so these tests are about one question: can two callers holding the same VALUE
 * ever disagree about its digest? Each case closes one way that could happen.
 */

import { describe, expect, it } from "vitest";

import { contentChecksum } from "@/lib/automation-studio";
import {
  canonicalSha256,
  compareCodepoints,
  digestsEqual,
  isSha256Hex,
  sha256Hex,
  stableStringify,
  TiaCanonicalError,
} from "../canonical";

describe("109-C2.0 · canonical bytes are a function of the value alone", () => {
  it("key insertion order does not change the bytes", () => {
    const a = { beta: 1, alpha: { z: true, a: [3, 1, 2] } };
    const b = { alpha: { a: [3, 1, 2], z: true }, beta: 1 };
    expect(stableStringify(a)).toBe(stableStringify(b));
  });

  it("array order DOES change the bytes — order is content", () => {
    // Sorting arrays here would silently equate two different projects whose
    // entry lists genuinely differ. Collections whose order is incidental are
    // sorted by the caller that knows which key defines their identity.
    expect(stableStringify([1, 2])).not.toBe(stableStringify([2, 1]));
  });

  it("an absent key and an explicit undefined canonicalise identically", () => {
    expect(stableStringify({ a: 1 })).toBe(stableStringify({ a: 1, b: undefined }));
  });

  it("refuses a non-finite number rather than serialising it to null", () => {
    // JSON.stringify maps NaN, Infinity and -Infinity all to `null`, which would
    // give three distinct values one digest — a collision made by the serialiser.
    for (const value of [Number.NaN, Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY]) {
      expect(() => stableStringify({ v: value })).toThrow(TiaCanonicalError);
    }
    // The control: the same shape with a finite number is accepted.
    expect(() => stableStringify({ v: 1 })).not.toThrow();
  });

  it("refuses values with no canonical JSON form", () => {
    // `BigInt(1)` rather than a `1n` literal: the project targets ES2017.
    expect(() => stableStringify({ v: BigInt(1) })).toThrow(TiaCanonicalError);
    expect(() => stableStringify({ v: Symbol("x") })).toThrow(TiaCanonicalError);
    expect(() => stableStringify({ v: () => undefined })).toThrow(TiaCanonicalError);
    expect(() => stableStringify(undefined)).toThrow(TiaCanonicalError);
  });

  it("refuses `__proto__`, which the pre-correction code silently dropped", () => {
    // MEASURED DEFECT, now closed. `JSON.parse` produces `__proto__` as an OWN
    // property, and writing it onto an ordinary object goes through the
    // prototype setter, so the key vanished from the serialised bytes:
    //
    //   stableStringify(JSON.parse('{"__proto__":{"x":1},"a":1}')) === '{"a":1}'
    //
    // Two different documents, one digest — a collision manufactured by the
    // serialiser, reachable from untrusted input.
    const hostile = JSON.parse('{"__proto__":{"x":1},"a":1}');
    expect(Object.keys(hostile)).toContain("__proto__");
    expect(() => stableStringify(hostile)).toThrow(TiaCanonicalError);
    // The control: the document it used to collide with is still accepted.
    expect(stableStringify({ a: 1 })).toBe('{"a":1}');
  });

  it("keeps `constructor` and `prototype`, which round-trip correctly", () => {
    // Not refused: measured to survive as ordinary own properties. Banning them
    // would be copying a rule whose mechanism does not apply to them.
    expect(stableStringify(JSON.parse('{"constructor":1,"a":1}'))).toBe(
      '{"a":1,"constructor":1}',
    );
    expect(stableStringify(JSON.parse('{"prototype":1,"a":1}'))).toBe('{"a":1,"prototype":1}');
  });

  it("refuses a sparse array, which would serialise a hole as null", () => {
    const sparse = [1, 2, 3];
    delete sparse[1];
    expect(() => stableStringify(sparse)).toThrow(TiaCanonicalError);
    // The control: the dense array it would have collided with is accepted.
    expect(stableStringify([1, null, 3])).toBe("[1,null,3]");
  });

  it("refuses an exotic object, which would serialise as {}", () => {
    // Date, Map and Set were all measured to canonicalise to `{}` — three
    // distinct values sharing one digest, because Object.keys sees no internal
    // state. A canonical form that cannot represent a value must say so.
    for (const value of [new Date(0), new Map([["a", 1]]), new Set([1])]) {
      expect(() => stableStringify({ v: value }), String(value)).toThrow(TiaCanonicalError);
    }
    class Instance {
      a = 1;
    }
    expect(() => stableStringify(new Instance())).toThrow(TiaCanonicalError);
    // A null-prototype bag is plain data and stays accepted.
    expect(stableStringify(Object.assign(Object.create(null), { a: 1 }))).toBe('{"a":1}');
  });

  it("normalises -0 to 0 as a stated rule", () => {
    // `-0 === 0`, so collapsing them is correct. Doing it explicitly means the
    // collapse is a decision rather than an artifact of JSON.stringify.
    expect(stableStringify({ v: -0 })).toBe('{"v":0}');
    expect(stableStringify({ v: -0 })).toBe(stableStringify({ v: 0 }));
  });

  it("refuses a value nested past the depth bound", () => {
    let deep: unknown = 1;
    for (let i = 0; i < 80; i += 1) deep = { deep };
    expect(() => stableStringify(deep)).toThrow(TiaCanonicalError);
  });
});

describe("109-C2.0 · ordering is by code point, never by locale", () => {
  it("orders by code point, including across the astral plane", () => {
    // U+1F600 (128512) sorts AFTER U+FFFD (65533) by code point. The `<`
    // operator would answer the opposite, because it compares UTF-16 code units
    // and the emoji begins with a surrogate at U+D83D (55357).
    const emoji = String.fromCodePoint(0x1f600);
    const replacement = String.fromCharCode(0xfffd);
    expect(compareCodepoints(emoji, replacement)).toBe(1);
    expect(emoji < replacement).toBe(true);
  });

  it("is a total order: antisymmetric, and equal only for equal strings", () => {
    const sample = ["a", "A", "_", "ä", "z", String.fromCodePoint(0x1f600), "", "aa"];
    for (const x of sample) {
      expect(compareCodepoints(x, x)).toBe(0);
      for (const y of sample) {
        // Summed rather than negated: `-0` and `0` are distinct under
        // Object.is, so asserting `a === -b` fails for the equal case for a
        // reason that has nothing to do with ordering.
        expect(compareCodepoints(x, y) + compareCodepoints(y, x), `${x}|${y}`).toBe(0);
      }
    }
  });

  it("does not use localeCompare, which would make the digest locale-dependent", () => {
    // Under a Turkish collation "i" and "I" relate differently than under en-US.
    // If canonicalisation used localeCompare, the same object could hash two ways
    // on two machines. Code-point order has no such freedom.
    const keys = { I: 1, i: 2, "ı": 3 };
    const once = stableStringify(keys);
    const again = stableStringify({ "ı": 3, i: 2, I: 1 });
    expect(once).toBe(again);
    expect(once).toBe(JSON.stringify({ I: 1, i: 2, "ı": 3 }));
  });
});

describe("109-C2.0 · SHA-256 is the integrity primitive", () => {
  it("produces the known digest for a known input", () => {
    // The canonical NIST test vector. A home-grown hash could not produce it,
    // so this also proves the function is really SHA-256.
    return expect(sha256Hex("abc")).resolves.toBe(
      "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad",
    );
  });

  it("is stable across calls and sensitive to a one-character change", async () => {
    const a = await canonicalSha256({ name: "Line 12" });
    const b = await canonicalSha256({ name: "Line 12" });
    const c = await canonicalSha256({ name: "Line 13" });
    expect(a).toBe(b);
    expect(a).not.toBe(c);
    expect(isSha256Hex(a)).toBe(true);
  });

  it("does NOT reuse the Phase 109-C1 checksum, which is not a security primitive", async () => {
    // C1's `contentChecksum` is a 64-bit FNV-style hash explicitly documented as
    // unsuitable for integrity. Reusing it here would give tamper evidence the
    // strength of a hash designed for cache keys.
    const input = "blocks/FC_Motor.scl";
    const c1 = contentChecksum(input);
    const c2 = await sha256Hex(input);
    expect(c1.length).toBe(16);
    expect(c2.length).toBe(64);
    expect(c2).not.toContain(c1);
  });

  it("treats digest case as significant — one identity, one spelling", () => {
    const lower = "a1".repeat(32);
    expect(isSha256Hex(lower)).toBe(true);
    expect(isSha256Hex(lower.toUpperCase())).toBe(false);
    expect(digestsEqual(lower, lower.toUpperCase())).toBe(false);
    expect(digestsEqual(lower, lower)).toBe(true);
  });

  it("refuses to call two malformed values equal", () => {
    expect(digestsEqual("", "")).toBe(false);
    expect(digestsEqual(null, null)).toBe(false);
    expect(digestsEqual(undefined, undefined)).toBe(false);
  });

  it("answers false for unequal lengths without indexing past either operand", () => {
    // The length rule is enforced by the shape guard, not by the comparison, so
    // a 63- or 65-character value never reaches the `===` at all.
    expect(digestsEqual("a1".repeat(32), "a1".repeat(31))).toBe(false);
    expect(digestsEqual("a1".repeat(32), `${"a1".repeat(32)}f`)).toBe(false);
    expect(isSha256Hex("a".repeat(63))).toBe(false);
    expect(isSha256Hex("a".repeat(65))).toBe(false);
  });
});

describe("109-C2.0 · Unicode normalisation is a STATED policy, not an accident", () => {
  it("does not normalise: NFC and NFD hash differently", () => {
    // Recorded rather than fixed. Applying NFC would change identity semantics
    // for the whole companion and diverge from Phase 109-C1, which normalises
    // nothing either — a product decision, not a refactor. The consequence is
    // real and is escalated in SECURITY-READBACK: two visually identical paths
    // are two identities, so duplicate detection does not see them as one.
    // Built from code points rather than typed literally, so the file's own
    // encoding cannot quietly make the two identical and the test vacuous.
    const precomposed = "caf" + String.fromCodePoint(0x00e9);
    const decomposed = "cafe" + String.fromCodePoint(0x0301);
    expect(precomposed).not.toBe(decomposed);
    expect(precomposed.normalize("NFC")).toBe(decomposed.normalize("NFC"));
    expect(stableStringify({ p: precomposed })).not.toBe(stableStringify({ p: decomposed }));
  });
});
