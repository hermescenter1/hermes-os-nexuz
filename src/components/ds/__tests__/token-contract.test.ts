import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { FIGMA_SOURCE, TOKEN_CONTRACT } from "../token-contract";

/**
 * PHASE 87 closure — data-driven Design Token Contract guard.
 *
 * Reads the single versionable contract (`token-contract.ts`, sourced from the
 * live Figma frame 12:4) and asserts, for EVERY entry, that:
 *   1. globals.css defines the CSS custom property with the exact value, and
 *   2. tailwind.config.ts exposes it as `var(--…)`.
 *
 * This closes the coverage gap left by `foundation.test.ts` (which hard-codes a
 * 21-token subset) and catches name/value drift between Figma, the CSS layer
 * and the Tailwind layer. Any of the three moving without the others fails CI.
 */

const read = (rel: string): string =>
  readFileSync(fileURLToPath(new URL(rel, import.meta.url)), "utf8");

const globals = read("../../../app/globals.css");
const tailwind = read("../../../../tailwind.config.ts");
const tailwindNorm = tailwind.replace(/\s+/g, " ");

const cssVarLine = (cssVar: string): string =>
  globals.split("\n").find((l) => l.includes(`${cssVar}:`)) ?? "";

describe("design token contract — Figma source of truth", () => {
  it("records the live Figma source node (traceability)", () => {
    expect(FIGMA_SOURCE.file).toBe("Hermes OS – Design System");
    expect(FIGMA_SOURCE.node).toBe("12:4");
  });

  it("has no duplicate Figma names, CSS vars or Tailwind keys", () => {
    const figma = TOKEN_CONTRACT.map((t) => t.figma);
    const css = TOKEN_CONTRACT.map((t) => t.cssVar);
    const tw = TOKEN_CONTRACT.map((t) => t.tailwind).filter((k): k is string => k !== null);
    expect(new Set(figma).size).toBe(figma.length);
    expect(new Set(css).size).toBe(css.length);
    expect(new Set(tw).size).toBe(tw.length);
  });

  it("covers the full semantic-color set (superset of foundation.test.ts)", () => {
    // Guards against silently shrinking the contract below the shipped surface.
    expect(TOKEN_CONTRACT.length).toBeGreaterThanOrEqual(28);
  });
});

describe("token contract — globals.css defines every token with the Figma value", () => {
  it.each(TOKEN_CONTRACT.map((t) => [t.cssVar, t.value, t.figma] as const))(
    "%s = %s  (Figma %s)",
    (cssVar, value, _figma) => {
      expect(globals).toContain(`${cssVar}:`);
      expect(cssVarLine(cssVar).toLowerCase()).toContain(value.toLowerCase());
    },
  );
});

describe("token contract — Tailwind exposes every token as var(--…)", () => {
  it.each(
    TOKEN_CONTRACT.filter((t) => t.tailwind !== null).map(
      (t) => [t.tailwind as string, t.cssVar] as const,
    ),
  )("maps %s → var(%s)", (tailwindKey, cssVar) => {
    expect(tailwindNorm).toContain(`"${tailwindKey}": "var(${cssVar})"`);
  });
});
