import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * PHASE 105 — JSON-LD serialisation safety.
 *
 * Structured data legitimately carries author- and operator-supplied strings
 * (article headlines, vendor names, course titles). Embedding them in a
 * `<script>` element with a bare `JSON.stringify` lets a value containing
 * `</script>` terminate the element early and inject the remainder as markup.
 *
 * `JsonLd` is a React Server Component and this repository has no
 * testing-library, so the escaping contract is verified two ways: the source is
 * asserted to route through the escaper rather than the raw stringifier, and
 * the escaper's own algorithm is exercised directly against hostile input.
 */

const SOURCE = readFileSync(
  join(process.cwd(), "src/components/seo/JsonLd.tsx"),
  "utf8",
);

/** The escaper, mirroring src/components/seo/JsonLd.tsx. */
const BACKSLASH = String.fromCharCode(92);
const LINE_SEPARATOR = String.fromCharCode(0x2028);
const PARAGRAPH_SEPARATOR = String.fromCharCode(0x2029);

function serializeSchema(schema: Record<string, unknown>): string {
  return JSON.stringify(schema)
    .replace(/</g, BACKSLASH + "u003c")
    .replace(new RegExp(LINE_SEPARATOR, "g"), BACKSLASH + "u2028")
    .replace(new RegExp(PARAGRAPH_SEPARATOR, "g"), BACKSLASH + "u2029");
}

describe("JsonLd component wiring", () => {
  it("renders through the escaper, never a bare JSON.stringify", () => {
    expect(SOURCE).toContain("__html: serializeSchema(schema)");
    expect(SOURCE).not.toContain("__html: JSON.stringify(schema)");
  });

  it("builds the escape characters via String.fromCharCode", () => {
    // Written as literal escape sequences these have already silently degraded
    // through this toolchain once (U+2028 collapsed to a plain space, which
    // would have replaced every space in the payload).
    expect(SOURCE).toContain("String.fromCharCode(0x2028)");
    expect(SOURCE).toContain("String.fromCharCode(0x2029)");
    expect(SOURCE).toContain("String.fromCharCode(92)");
  });
});

describe("escaping defeats script-context breakout", () => {
  it("a headline containing </script> cannot close the element", () => {
    const out = serializeSchema({
      "@type": "TechArticle",
      headline: 'PLC </script><img src=x onerror="alert(1)">',
    });
    expect(out).not.toContain("</script>");
    expect(out).not.toContain("<");
    expect(out).toContain(BACKSLASH + "u003c");
  });

  it("JavaScript line terminators are escaped", () => {
    const out = serializeSchema({ note: `a${LINE_SEPARATOR}b${PARAGRAPH_SEPARATOR}c` });
    expect(out).not.toContain(LINE_SEPARATOR);
    expect(out).not.toContain(PARAGRAPH_SEPARATOR);
  });

  it("escaping is lossless — values round-trip exactly", () => {
    const payload = {
      headline: 'PLC </script> & "quoted" \\ backslash',
      note: `a${LINE_SEPARATOR}b`,
      spaced: "spaces are preserved verbatim",
      nested: { deep: "</SCRIPT >" },
    };
    expect(JSON.parse(serializeSchema(payload))).toEqual(payload);
  });

  it("ordinary spaces are untouched", () => {
    // Regression guard for the degraded-escape bug: a broken implementation
    // replaced U+0020 instead of U+2028.
    const out = serializeSchema({ spaced: "a b c" });
    expect(JSON.parse(out).spaced).toBe("a b c");
    expect(out).not.toContain(BACKSLASH + "u2028");
  });
});
