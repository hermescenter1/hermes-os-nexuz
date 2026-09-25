import { describe, it, expect } from "vitest";
import {
  canonicalSha256,
  compareByCodePoint,
  digestsEqual,
  isSha256Hex,
  ReasoningCanonicalError,
  sanitizeForCanonical,
  sha256Hex,
  stableStringify,
} from "../canonical-json";

describe("stableStringify — key insertion order invariance", () => {
  it("produces the same string regardless of object key insertion order", () => {
    const a = { alpha: 1, beta: { x: true, y: false }, gamma: [1, 2, 3] };
    const b = { gamma: [1, 2, 3], beta: { y: false, x: true }, alpha: 1 };
    expect(stableStringify(a)).toBe(stableStringify(b));
    expect(canonicalSha256(a)).toBe(canonicalSha256(b));
  });

  it("orders keys recursively", () => {
    expect(stableStringify({ b: 1, a: 2 })).toBe('{"a":2,"b":1}');
    expect(stableStringify({ z: { d: 1, c: 2 } })).toBe('{"z":{"c":2,"d":1}}');
  });
});

describe("stableStringify — array order sensitivity", () => {
  it("preserves and is sensitive to array order", () => {
    expect(canonicalSha256([1, 2, 3])).not.toBe(canonicalSha256([3, 2, 1]));
    expect(stableStringify([1, 2])).toBe("[1,2]");
  });
});

describe("stableStringify — Unicode stability by code point", () => {
  it("orders keys by Unicode code point (astral > BMP)", () => {
    // "￿" (BMP) has a smaller code point than "\u{10000}" (astral).
    expect(compareByCodePoint("￿", "\u{10000}")).toBeLessThan(0);
    const s = stableStringify({ "\u{10000}": 1, "￿": 2 });
    expect(s.indexOf("￿")).toBeLessThan(s.indexOf("\u{10000}"));
  });

  it("hashes unicode content stably", () => {
    expect(canonicalSha256({ msg: "دمای بلبرینگ بالاست" })).toBe(
      canonicalSha256({ msg: "دمای بلبرینگ بالاست" }),
    );
  });
});

describe("stableStringify — finite number handling", () => {
  it("normalizes -0 to 0 and formats numbers locale-independently", () => {
    expect(stableStringify(-0)).toBe("0");
    expect(stableStringify(1.0)).toBe("1");
    expect(stableStringify(1000000)).toBe("1000000");
    expect(stableStringify({ n: 3.14 })).toBe('{"n":3.14}');
  });
});

describe("stableStringify — forbidden values are rejected, not coerced", () => {
  const cases: Array<[string, unknown]> = [
    ["undefined", undefined],
    ["NaN", NaN],
    ["+Infinity", Number.POSITIVE_INFINITY],
    ["-Infinity", Number.NEGATIVE_INFINITY],
    ["BigInt", BigInt(10)],
    ["function", () => 1],
    ["symbol", Symbol("x")],
    ["Date", new Date()],
    ["Map", new Map()],
    ["Set", new Set()],
    ["RegExp", /x/],
  ];
  for (const [name, value] of cases) {
    it(`rejects ${name}`, () => {
      expect(() => stableStringify(value)).toThrow(ReasoningCanonicalError);
    });
  }

  it("rejects a cyclic object", () => {
    const obj: Record<string, unknown> = { a: 1 };
    obj.self = obj;
    expect(() => stableStringify(obj)).toThrow(ReasoningCanonicalError);
  });

  it("rejects a sparse array hole", () => {
    const arr = [1];
    arr[3] = 4; // holes at 1,2
    expect(() => stableStringify(arr)).toThrow(ReasoningCanonicalError);
  });

  it("rejects an undefined object property (must be omitted, not undefined)", () => {
    expect(() => stableStringify({ a: undefined })).toThrow(ReasoningCanonicalError);
  });
});

describe("digest sensitivity", () => {
  it("a one-field change alters the digest", () => {
    const base = { a: 1, b: 2, c: [1, 2, 3] };
    const changed = { a: 1, b: 2, c: [1, 2, 4] };
    expect(canonicalSha256(base)).not.toBe(canonicalSha256(changed));
  });

  it("a one-character string change alters the digest", () => {
    expect(canonicalSha256({ s: "abc" })).not.toBe(canonicalSha256({ s: "abd" }));
  });
});

describe("sha256 helpers", () => {
  it("sha256Hex is lowercase 64-hex and stable", () => {
    const h = sha256Hex("hello");
    expect(h).toMatch(/^[0-9a-f]{64}$/);
    expect(h).toBe("2cf24dba5fb0a30e26e83b2ac5b9e29e1b161e5c1fa7425e73043362938b9824");
  });

  it("isSha256Hex is case-sensitive and strict", () => {
    expect(isSha256Hex("a".repeat(64))).toBe(true);
    expect(isSha256Hex("A".repeat(64))).toBe(false);
    expect(isSha256Hex("a".repeat(63))).toBe(false);
    expect(isSha256Hex(123)).toBe(false);
  });

  it("digestsEqual only for two well-formed identical digests", () => {
    expect(digestsEqual("a".repeat(64), "a".repeat(64))).toBe(true);
    expect(digestsEqual("a".repeat(64), "b".repeat(64))).toBe(false);
    expect(digestsEqual("bad", "bad")).toBe(false);
  });
});

describe("sanitizeForCanonical", () => {
  it("drops undefined properties so the result canonicalizes", () => {
    const cleaned = sanitizeForCanonical({ a: 1, b: undefined, c: { d: undefined, e: 2 } });
    expect(cleaned).toEqual({ a: 1, c: { e: 2 } });
    expect(() => stableStringify(cleaned)).not.toThrow();
  });

  it("throws for a value with no JSON representation", () => {
    expect(() => sanitizeForCanonical(undefined)).toThrow(ReasoningCanonicalError);
  });
});
