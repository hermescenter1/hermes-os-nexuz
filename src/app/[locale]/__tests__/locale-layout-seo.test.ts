import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * The locale layout is inherited by every public document. Keeping this small
 * source-level guard beside the route prevents a deprecated `meta keywords`
 * tag from returning through the shared metadata path.
 */
const ROOT = join(__dirname, "..", "..", "..", "..");
const read = (rel: string) => readFileSync(join(ROOT, rel), "utf8");

describe("locale layout SEO metadata", () => {
  it("does not emit deprecated meta keywords from the shared locale layout", () => {
    const source = read("src/app/[locale]/layout.tsx");
    expect(source).not.toContain('t.raw("keywords")');
    expect(source).not.toMatch(/\bkeywords\s*:/);
  });
});
