import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

import {
  PHASE104_BASE_SURFACES,
  PHASE104_DNA_SOURCE,
  PHASE104_TOKEN_CONTRACT,
  type Phase104TokenEntry,
} from "../phase104-token-contract";
import {
  BASE_SURFACES,
  HORIZON,
  INDUSTRIAL_STATES,
  NEW_HUES,
  REASONING_LADDER,
} from "../../../../tools/figma/hermes-phase104-visual-system/src/lib/dna-tokens.js";
import { contrast } from "../../../../tools/figma/hermes-phase104-visual-system/src/lib/contrast.js";

/**
 * PHASE 104-A — product token bridge gate.
 *
 * Phase 104 declared eleven new colour values in the design-side machine source.
 * This suite is the thing that makes them *executable product tokens* rather
 * than a document: it proves, mechanically, that
 *
 *   1. the contract covers the live `NEW_HUES` array one-to-one — no value
 *      silently dropped, none silently invented;
 *   2. `globals.css` declares every mapped token with the exact machine value;
 *   3. `tailwind.config.ts` exposes every mapped token as `var(--…)`;
 *   4. the Phase 87B canonical surfaces still hold their source values, so the
 *      contrast maths below is measured against the surfaces that actually ship;
 *   5. every accessibility claim in the contract is COMPUTED, including the
 *      negative ones — a token declared indicator-only must genuinely fail the
 *      4.5:1 text threshold, which is the proof it may not colour a label;
 *   6. the Phase 87 contract is untouched and Phase 104 never leaks into it;
 *   7. no hex literal was hand-copied into the TypeScript contract.
 *
 * The count is derived from `NEW_HUES.length`, never hard-coded, so adding a
 * twelfth hue to the machine source fails here until it is mapped, justified and
 * shipped through the same gate.
 */

const read = (rel: string): string =>
  readFileSync(fileURLToPath(new URL(rel, import.meta.url)), "utf8");

const globals = read("../../../app/globals.css");
const tailwind = read("../../../../tailwind.config.ts");
const tailwindNorm = tailwind.replace(/\s+/g, " ");
const contractSource = read("../phase104-token-contract.ts");
const phase87Contract = read("../token-contract.ts");
const integrationDoc = read(
  "../../../../docs/design/phase-104/02-token-integration.md",
);

/** The declaration line for a CSS custom property, or "" if undeclared. */
const cssVarLine = (cssVar: string): string =>
  globals.split("\n").find((l) => l.includes(`${cssVar}:`)) ?? "";

/** WCAG 2.2 thresholds. */
const AA_NORMAL_TEXT = 4.5; // SC 1.4.3
const UI_NON_TEXT = 3.0; // SC 1.4.11

/** Every canonical opaque surface a Phase 104 colour can land on. */
const SURFACES = Object.entries(BASE_SURFACES) as ReadonlyArray<
  readonly [string, string]
>;

const worstCase = (value: string): number =>
  Math.min(...SURFACES.map(([, surface]) => contrast(value, surface)));

const byRole = (role: Phase104TokenEntry["role"]): Phase104TokenEntry[] =>
  PHASE104_TOKEN_CONTRACT.filter((t) => t.role === role);

// ───────────────────────────────────────────────────────────────────────────
describe("Phase 104 contract — provenance and shape", () => {
  it("records the Phase 104 Figma file, machine source and integration base", () => {
    expect(PHASE104_DNA_SOURCE.figmaFile).toBe("QcJcRaBv1NMrgb4pMshEVB");
    expect(PHASE104_DNA_SOURCE.machineSource).toBe(
      "tools/figma/hermes-phase104-visual-system/src/lib/dna-tokens.js",
    );
    expect(PHASE104_DNA_SOURCE.integrationBase).toMatch(/^[0-9a-f]{40}$/);
    expect(PHASE104_DNA_SOURCE.specification).toBe(
      "docs/design/phase-104/01-hermes-design-dna.md",
    );
  });

  it("re-exports the machine source's canonical surfaces without restating them", () => {
    expect(PHASE104_BASE_SURFACES).toBe(BASE_SURFACES);
  });

  it("has no duplicate key, DNA path, CSS variable or Tailwind key", () => {
    const keys = PHASE104_TOKEN_CONTRACT.map((t) => t.key);
    const paths = PHASE104_TOKEN_CONTRACT.map((t) => t.dnaPath);
    const cssVars = PHASE104_TOKEN_CONTRACT.map((t) => t.cssVar);
    const tw = PHASE104_TOKEN_CONTRACT.map((t) => t.tailwind);
    expect(new Set(keys).size).toBe(keys.length);
    expect(new Set(paths).size).toBe(paths.length);
    expect(new Set(cssVars).size).toBe(cssVars.length);
    expect(new Set(tw).size).toBe(tw.length);
  });

  it("every entry carries a written usage AND a written restriction", () => {
    for (const t of PHASE104_TOKEN_CONTRACT) {
      expect(t.usage.length, `${t.key}.usage`).toBeGreaterThan(20);
      expect(t.restriction.length, `${t.key}.restriction`).toBeGreaterThan(20);
    }
  });
});

// ───────────────────────────────────────────────────────────────────────────
describe("Phase 104 contract — one-to-one coverage of the live NEW_HUES array", () => {
  it("maps exactly as many tokens as there are new hues (count derived, not pinned)", () => {
    expect(NEW_HUES.length).toBeGreaterThan(0);
    expect(PHASE104_TOKEN_CONTRACT.length).toBe(NEW_HUES.length);
  });

  it.each(NEW_HUES.map((h) => [h.value, h.name] as const))(
    "%s (%s) is mapped by exactly one contract entry",
    (value) => {
      const matches = PHASE104_TOKEN_CONTRACT.filter(
        (t) => t.value.toLowerCase() === value.toLowerCase(),
      );
      expect(matches.map((m) => m.key)).toHaveLength(1);
    },
  );

  it("no contract value falls outside NEW_HUES (the resolver fails closed)", () => {
    const declared = new Set(NEW_HUES.map((h) => h.value.toLowerCase()));
    const stray = PHASE104_TOKEN_CONTRACT.filter(
      (t) => !declared.has(t.value.toLowerCase()),
    ).map((t) => `${t.key}=${t.value}`);
    expect(stray).toEqual([]);
  });

  it("every new hue carries a written justification in the machine source", () => {
    for (const h of NEW_HUES) {
      expect(h.why.length, `NEW_HUES[${h.name}].why`).toBeGreaterThan(40);
    }
  });
});

// ───────────────────────────────────────────────────────────────────────────
describe("Phase 104 contract — values are derived structurally, never copied", () => {
  it("the TypeScript contract contains no hand-copied hex literal", () => {
    const literals = contractSource.match(/#[0-9A-Fa-f]{6}\b/g) ?? [];
    expect(literals).toEqual([]);
  });

  it("each mapped value still resolves from its declared DNA path", () => {
    const resolve = (dnaPath: string): string | undefined => {
      let m = dnaPath.match(/^INDUSTRIAL_STATES\[(\w+)\]\.(fill|text)$/);
      if (m) {
        const e = INDUSTRIAL_STATES.find((s) => s.key === m![1]);
        return m[2] === "fill" ? e?.fill : e?.text;
      }
      m = dnaPath.match(/^REASONING_LADDER\[(\w+)\]\.text$/);
      if (m) return REASONING_LADDER.find((r) => r.key === m![1])?.text;
      m = dnaPath.match(/^HORIZON\.stops\[(\w+)\]\.value$/);
      if (m) return HORIZON.stops.find((s) => s.role === m![1])?.value;
      return undefined;
    };
    for (const t of PHASE104_TOKEN_CONTRACT) {
      expect(resolve(t.dnaPath), `${t.key} ← ${t.dnaPath}`).toBe(t.value);
    }
  });
});

// ───────────────────────────────────────────────────────────────────────────
describe("Phase 104 contract — globals.css declares every token with the machine value", () => {
  it.each(
    PHASE104_TOKEN_CONTRACT.map((t) => [t.cssVar, t.value, t.key] as const),
  )("%s = %s  (%s)", (cssVar, value) => {
    expect(globals).toContain(`${cssVar}:`);
    expect(cssVarLine(cssVar).toLowerCase()).toContain(value.toLowerCase());
  });
});

describe("Phase 104 contract — Tailwind exposes every token as var(--…)", () => {
  it.each(
    PHASE104_TOKEN_CONTRACT.map((t) => [t.tailwind, t.cssVar] as const),
  )("maps %s → var(%s)", (tailwindKey, cssVar) => {
    expect(tailwindNorm).toContain(`"${tailwindKey}": "var(${cssVar})"`);
  });
});

describe("Phase 104 contract — the canonical surfaces it measures against still ship", () => {
  const SURFACE_CSS_VARS: Readonly<Record<string, string>> = {
    backgroundDeep: "--color-background-deep",
    backgroundBase: "--color-background-base",
    surfacePrimary: "--color-surface-primary",
    surfaceElevated: "--color-surface-elevated",
    surfaceInteractive: "--color-surface-interactive",
  };

  it("covers every canonical surface the machine source declares", () => {
    expect(Object.keys(SURFACE_CSS_VARS).sort()).toEqual(
      Object.keys(BASE_SURFACES).sort(),
    );
  });

  it.each(SURFACES)("%s retains its source value in globals.css", (key, value) => {
    const cssVar = SURFACE_CSS_VARS[key];
    expect(cssVar, `no CSS var mapped for BASE_SURFACES.${key}`).toBeTruthy();
    expect(cssVarLine(cssVar).toLowerCase()).toContain(value.toLowerCase());
  });
});

// ───────────────────────────────────────────────────────────────────────────
describe("Phase 104 contract — computed WCAG verdicts (positive claims)", () => {
  const textTokens = PHASE104_TOKEN_CONTRACT.filter((t) => t.textLegible);
  const indicatorTokens = PHASE104_TOKEN_CONTRACT.filter((t) => t.indicatorSafe);

  it("there is at least one readable token and one indicator token", () => {
    expect(textTokens.length).toBeGreaterThan(0);
    expect(indicatorTokens.length).toBeGreaterThan(0);
  });

  it.each(
    textTokens.flatMap((t) =>
      SURFACES.map(([s, surface]) => [t.key, t.value, s, surface] as const),
    ),
  )(
    "%s (%s) is >= 4.5:1 on %s",
    (_key, value, _surfaceKey, surface) => {
      expect(contrast(value, surface)).toBeGreaterThanOrEqual(AA_NORMAL_TEXT);
    },
  );

  it.each(
    indicatorTokens.flatMap((t) =>
      SURFACES.map(([s, surface]) => [t.key, t.value, s, surface] as const),
    ),
  )(
    "%s (%s) is >= 3:1 on %s",
    (_key, value, _surfaceKey, surface) => {
      expect(contrast(value, surface)).toBeGreaterThanOrEqual(UI_NON_TEXT);
    },
  );

  it("every `text` role token is also indicator-safe (safe for its own glyph)", () => {
    for (const t of byRole("text")) {
      expect(t.textLegible, t.key).toBe(true);
      expect(t.indicatorSafe, t.key).toBe(true);
    }
  });
});

describe("Phase 104 contract — EXPECTED-FAIL: indicator-only tokens are not text", () => {
  const indicatorOnly = PHASE104_TOKEN_CONTRACT.filter(
    (t) => t.role === "indicator" && !t.textLegible,
  );

  it("the indicator-only set is non-empty (otherwise this guard proves nothing)", () => {
    expect(indicatorOnly.map((t) => t.key)).not.toEqual([]);
  });

  it.each(indicatorOnly.map((t) => [t.key, t.value] as const))(
    "%s (%s) deliberately measures BELOW 4.5:1 — it must never colour a label",
    (_key, value) => {
      expect(worstCase(value)).toBeLessThan(AA_NORMAL_TEXT);
      // …but it is still a legitimate non-text indicator.
      expect(worstCase(value)).toBeGreaterThanOrEqual(UI_NON_TEXT);
    },
  );

  it("each indicator-only token names its readable partner in the restriction", () => {
    for (const t of indicatorOnly) {
      const partner = PHASE104_TOKEN_CONTRACT.find(
        (p) => p.role === "text" && p.dnaPath === t.dnaPath.replace(/\.fill$/, ".text"),
      );
      const named =
        (partner !== undefined && t.restriction.includes(partner.cssVar)) ||
        /--color-text-metadata/.test(t.restriction);
      expect(named, `${t.key} must point at the token that may carry its type`).toBe(
        true,
      );
    }
  });
});

describe("Phase 104 contract — Horizon is atmosphere and may never be a foreground", () => {
  const horizon = byRole("atmosphere");

  it("both Horizon ember stops are classified as atmosphere", () => {
    expect(horizon.map((t) => t.key).sort()).toEqual([
      "horizon-ember-core",
      "horizon-ember-fade",
    ]);
  });

  it.each(horizon.map((t) => [t.key, t.value, t.restriction] as const))(
    "%s (%s) is prohibited as a foreground and proven unusable as one",
    (_key, value, restriction) => {
      expect(restriction).toContain("PROHIBITED");
      // Below even the non-text threshold on EVERY surface: there is no legal
      // foreground use, so the prohibition is not merely stylistic.
      expect(worstCase(value)).toBeLessThan(UI_NON_TEXT);
    },
  );

  it("no Horizon token is declared text-legible or indicator-safe", () => {
    for (const t of horizon) {
      expect(t.textLegible, t.key).toBe(false);
      expect(t.indicatorSafe, t.key).toBe(false);
    }
  });
});

// ───────────────────────────────────────────────────────────────────────────
describe("Phase 104 contract — the Phase 87 contract stays out of it", () => {
  it("no Phase 104 CSS variable leaks into the Phase 87 token contract", () => {
    const leaked = PHASE104_TOKEN_CONTRACT.filter((t) =>
      phase87Contract.includes(t.cssVar),
    ).map((t) => t.cssVar);
    expect(leaked).toEqual([]);
  });

  it("the Phase 87 contract still points at its own Figma node, not Phase 104's", () => {
    expect(phase87Contract).toContain('node: "12:4"');
    expect(phase87Contract).not.toContain(PHASE104_DNA_SOURCE.figmaFile);
  });
});

// ───────────────────────────────────────────────────────────────────────────
describe("Phase 104 contract — the integration document records every mapping", () => {
  it.each(
    PHASE104_TOKEN_CONTRACT.map(
      (t) => [t.key, t.dnaPath, t.cssVar, t.tailwind, t.value] as const,
    ),
  )("documents %s", (_key, dnaPath, cssVar, tailwindKey, value) => {
    expect(integrationDoc).toContain(dnaPath);
    expect(integrationDoc).toContain(cssVar);
    expect(integrationDoc).toContain(`\`${tailwindKey}\``);
    expect(integrationDoc.toLowerCase()).toContain(value.toLowerCase());
  });

  it("records the machine source and the integration base commit", () => {
    expect(integrationDoc).toContain(PHASE104_DNA_SOURCE.machineSource);
    expect(integrationDoc).toContain(PHASE104_DNA_SOURCE.integrationBase);
  });
});
