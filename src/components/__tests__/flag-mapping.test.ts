import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

// FlagIcons is a .tsx module; the node/oxc test runtime cannot import JSX
// without a render harness. The locale→flag mapping is instead a typed
// `Record<SupportedLocale, FlagComponent>`, so tsc guarantees completeness at
// compile time. This test asserts the mapping's structure at the source level
// (JSX-free) to lock the German flag wiring in place.
const flagIconsPath = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../FlagIcons.tsx"
);
const source = readFileSync(flagIconsPath, "utf8");

describe("FlagIcons — German flag mapping exists", () => {
  it("defines a GermanFlag component", () => {
    expect(source).toMatch(/export function GermanFlag\b/);
  });

  it("exposes a LOCALE_FLAG registry typed by SupportedLocale", () => {
    expect(source).toMatch(/LOCALE_FLAG\s*:\s*Record<SupportedLocale,\s*FlagComponent>/);
  });

  it("maps de → GermanFlag, fa → IranFlag, en → UKFlag", () => {
    expect(source).toMatch(/\bde:\s*GermanFlag\b/);
    expect(source).toMatch(/\bfa:\s*IranFlag\b/);
    expect(source).toMatch(/\ben:\s*UKFlag\b/);
  });
});
