import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import postcss from "postcss";
import { describe, expect, it } from "vitest";

import tailwindConfig from "../../../../tailwind.config";
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
import {
  contrast,
  r2,
} from "../../../../tools/figma/hermes-phase104-visual-system/src/lib/contrast.js";

/**
 * PHASE 104-A — product token bridge gate.
 *
 * Phase 104 declared eleven new colour values in the design-side machine source.
 * This suite is what makes them *executable product tokens* rather than a
 * document: it proves, mechanically, that
 *
 *   1. the contract covers the live `NEW_HUES` array one-to-one — no value
 *      silently dropped, none silently invented;
 *   2. `globals.css` declares every mapped token EXACTLY ONCE, actively, with
 *      the exact machine value;
 *   3. `tailwind.config.ts` maps every mapped token to `var(--…)` AT RUNTIME;
 *   4. the Phase 87B canonical surfaces still hold their source values, so the
 *      contrast maths below is measured against the surfaces that actually ship;
 *   5. every accessibility claim is COMPUTED, including the negative ones;
 *   6. the Phase 87 contract is untouched and Phase 104 never leaks into it;
 *   7. no hex literal was hand-copied into the TypeScript contract.
 *
 * TWO HARDENING DECISIONS, both from external review of a8811234:
 *
 * A. PARITY IS CHECKED AGAINST WHAT THE TOOLCHAIN ACTUALLY SEES, NOT SOURCE TEXT.
 *    An earlier revision asserted CSS parity with a substring match on the raw
 *    file and Tailwind parity with `toContain()` on the config's source text.
 *    Both are maskable: a stale-but-correct value sitting in a COMMENT satisfies
 *    a substring match while the active declaration is wrong, and a duplicate
 *    later declaration silently overrides an earlier correct one. So `globals.css`
 *    is now parsed with PostCSS — comments are Comment nodes and are skipped by
 *    the AST walk for free — and exactly ONE active declaration is required per
 *    variable. `tailwind.config.ts` is imported as an object and
 *    `theme.extend.colors[key]` is compared directly. The adversarial block below
 *    proves each masking route fails, and proves the old text-matching approach
 *    would have passed on the very same input.
 *
 * B. THE NEGATIVE CONTRAST CLAIM IS QUANTIFIED CORRECTLY.
 *    The earlier revision asserted `min(ratios) < 4.5` while the prose claimed
 *    the token was below 4.5:1 on EVERY canonical surface. `min < 4.5` only
 *    proves failure on at least one surface, and for two of the three tokens the
 *    stronger prose claim is simply false: `state-offline` measures 4.78 and
 *    4.60 on the two darkest surfaces and `state-maintenance` measures 4.7 and
 *    4.53 there. Only `state-critical` is below 4.5 on all five. The accurate
 *    rule — and the one now asserted and documented — is:
 *
 *      Indicator-only tokens are not universally text-safe across all canonical
 *      surfaces; failure on any supported surface prohibits their use as a
 *      general text token.
 *
 *    Horizon is different: there the "below 3:1 on EVERY surface" claim really is
 *    true, so it is asserted per surface (max, not min) rather than being taken
 *    on trust. No DNA colour value was changed to make any of this pass.
 */

const read = (rel: string): string =>
  readFileSync(fileURLToPath(new URL(rel, import.meta.url)), "utf8");

const globalsCss = read("../../../app/globals.css");
const contractSource = read("../phase104-token-contract.ts");
const tailwindSource = read("../../../../tailwind.config.ts");
const phase87Contract = read("../token-contract.ts");
const integrationDoc = read(
  "../../../../docs/design/phase-104/02-token-integration.md",
);

/** The accurate rule that replaced the earlier over-strong claim. */
const INDICATOR_RULE =
  "Indicator-only tokens are not universally text-safe across all canonical " +
  "surfaces; failure on any supported surface prohibits their use as a general " +
  "text token.";

/**
 * Collapse whitespace, line-leading comment/quote markers and markdown emphasis,
 * so the rule matches whether it is wrapped inside a JSDoc block, a CSS comment,
 * a Tailwind config comment or a markdown blockquote.
 */
const flatten = (s: string): string =>
  s
    .replace(/^[ \t]*(?:[*>]|\/\/|\/\*)[ \t]?/gm, "")
    .replace(/\*\*/g, "")
    .replace(/\s+/g, " ");

// ── Parity primitives ───────────────────────────────────────────────────────

/**
 * Every ACTIVE declaration of a custom property, in source order, read from the
 * PostCSS AST. Declarations inside a comment are Comment nodes and never appear
 * here, which is precisely the masking route this replaces.
 */
function activeDeclarations(css: string, prop: string): string[] {
  const values: string[] = [];
  // Block body on purpose: `push` returns a number and `walkDecls` treats a
  // truthy return as "stop walking", which would silently hide a duplicate.
  postcss.parse(css).walkDecls(prop, (decl) => {
    values.push(decl.value.trim());
  });
  return values;
}

/** The runtime Tailwind colour map — the object the toolchain actually consumes. */
const tailwindColors: Readonly<Record<string, unknown>> = (() => {
  const extend = tailwindConfig.theme?.extend as
    | { colors?: Record<string, unknown> }
    | undefined;
  const colors = extend?.colors;
  if (colors === undefined) {
    throw new Error("tailwind.config.ts exposes no theme.extend.colors object");
  }
  return colors;
})();

/** WCAG 2.2 thresholds. */
const AA_NORMAL_TEXT = 4.5; // SC 1.4.3
const UI_NON_TEXT = 3.0; // SC 1.4.11

/** Every canonical opaque surface a Phase 104 colour can land on. */
const SURFACES = Object.entries(BASE_SURFACES) as ReadonlyArray<
  readonly [string, string]
>;

const ratios = (value: string): number[] =>
  SURFACES.map(([, surface]) => contrast(value, surface));

/** Canonical surfaces on which a value falls below the normal-text threshold. */
const subAaSurfaces = (value: string): string[] =>
  SURFACES.filter(([, surface]) => contrast(value, surface) < AA_NORMAL_TEXT).map(
    ([key]) => key,
  );

const byRole = (role: Phase104TokenEntry["role"]): Phase104TokenEntry[] =>
  PHASE104_TOKEN_CONTRACT.filter((t) => t.role === role);

const INDICATOR_ONLY = PHASE104_TOKEN_CONTRACT.filter(
  (t) => t.role === "indicator" && !t.textLegible,
);

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
describe("Phase 104 contract — globals.css declares every token exactly once (PostCSS AST)", () => {
  it.each(
    PHASE104_TOKEN_CONTRACT.map((t) => [t.cssVar, t.value, t.key] as const),
  )("%s = %s  (%s)", (cssVar, value) => {
    const declared = activeDeclarations(globalsCss, cssVar);
    // Exactly one ACTIVE declaration: a second one would override the first, and
    // whichever of the two is wrong would otherwise go unnoticed.
    expect(declared, `active declarations of ${cssVar}`).toHaveLength(1);
    expect(declared[0].toLowerCase()).toBe(value.toLowerCase());
  });
});

describe("Phase 104 contract — Tailwind maps every token at RUNTIME", () => {
  it.each(
    PHASE104_TOKEN_CONTRACT.map((t) => [t.tailwind, t.cssVar] as const),
  )("theme.extend.colors[%s] === var(%s)", (tailwindKey, cssVar) => {
    expect(tailwindColors[tailwindKey]).toBe(`var(${cssVar})`);
  });
});

// ───────────────────────────────────────────────────────────────────────────
describe("Phase 104 parity checks resist comments and overrides (adversarial)", () => {
  const [sample] = PHASE104_TOKEN_CONTRACT;

  it("a correct value inside a CSS comment cannot mask a wrong active declaration", () => {
    const masked = `:root {\n  /* ${sample.cssVar}: ${sample.value}; */\n  ${sample.cssVar}: #000000;\n}`;
    // The retired substring approach would have accepted this outright…
    expect(masked).toContain(`${sample.cssVar}: ${sample.value}`);
    // …the AST sees only the active declaration, and it is wrong.
    const declared = activeDeclarations(masked, sample.cssVar);
    expect(declared).toEqual(["#000000"]);
    expect(declared[0].toLowerCase()).not.toBe(sample.value.toLowerCase());
  });

  it("a duplicate/overriding declaration fails the exactly-once requirement", () => {
    const duplicated = `:root {\n  ${sample.cssVar}: ${sample.value};\n}\n:root {\n  ${sample.cssVar}: #000000;\n}`;
    // A substring match still passes here — the correct value IS present.
    expect(duplicated).toContain(`${sample.cssVar}: ${sample.value}`);
    // The AST reports both, so the override cannot hide behind the good one.
    expect(activeDeclarations(duplicated, sample.cssVar)).toHaveLength(2);
  });

  it("a correct Tailwind mapping in a comment cannot mask a wrong runtime mapping", () => {
    const source = `{\n  /* "${sample.tailwind}": "var(${sample.cssVar})", */\n  "${sample.tailwind}": "var(--wrong)",\n}`;
    const runtime: Record<string, unknown> = {
      [sample.tailwind]: "var(--wrong)",
    };
    // The retired source-text assertion would have passed on this file…
    expect(source.replace(/\s+/g, " ")).toContain(
      `"${sample.tailwind}": "var(${sample.cssVar})"`,
    );
    // …while the object the toolchain actually consumes is wrong.
    expect(runtime[sample.tailwind]).not.toBe(`var(${sample.cssVar})`);
  });

  it("an effective wrong Tailwind mapping fails the runtime requirement", () => {
    const runtime: Record<string, unknown> = {
      [sample.tailwind]: "var(--color-brand-primary)",
    };
    expect(runtime[sample.tailwind]).not.toBe(`var(${sample.cssVar})`);
    // …and a missing key is equally a failure, not an accidental pass.
    expect(runtime["definitely-not-a-token"]).toBeUndefined();
  });

  it("the real config is an object, not text — no Phase 104 key is comment-only", () => {
    for (const t of PHASE104_TOKEN_CONTRACT) {
      expect(
        Object.prototype.hasOwnProperty.call(tailwindColors, t.tailwind),
        `theme.extend.colors is missing ${t.tailwind}`,
      ).toBe(true);
    }
    // The source file is read only to prove the runtime object is not a subset
    // of some larger commented block; it is never the authority.
    expect(tailwindSource).toContain("PHASE 104");
  });
});

// ───────────────────────────────────────────────────────────────────────────
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

  it.each(SURFACES)(
    "%s retains its source value as the single active declaration",
    (key, value) => {
      const cssVar = SURFACE_CSS_VARS[key];
      expect(cssVar, `no CSS var mapped for BASE_SURFACES.${key}`).toBeTruthy();
      const declared = activeDeclarations(globalsCss, cssVar);
      expect(declared, `active declarations of ${cssVar}`).toHaveLength(1);
      expect(declared[0].toLowerCase()).toBe(value.toLowerCase());
    },
  );
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
  )("%s (%s) is >= 4.5:1 on %s", (_key, value, _surfaceKey, surface) => {
    expect(contrast(value, surface)).toBeGreaterThanOrEqual(AA_NORMAL_TEXT);
  });

  it.each(
    indicatorTokens.flatMap((t) =>
      SURFACES.map(([s, surface]) => [t.key, t.value, s, surface] as const),
    ),
  )("%s (%s) is >= 3:1 on %s", (_key, value, _surfaceKey, surface) => {
    expect(contrast(value, surface)).toBeGreaterThanOrEqual(UI_NON_TEXT);
  });

  it("every `text` role token is also indicator-safe (safe for its own glyph)", () => {
    for (const t of byRole("text")) {
      expect(t.textLegible, t.key).toBe(true);
      expect(t.indicatorSafe, t.key).toBe(true);
    }
  });
});

// ───────────────────────────────────────────────────────────────────────────
describe("Phase 104 contract — indicator-only tokens are not universally text-safe", () => {
  it("the indicator-only set is non-empty (otherwise this guard proves nothing)", () => {
    expect(INDICATOR_ONLY.map((t) => t.key)).not.toEqual([]);
  });

  it.each(INDICATOR_ONLY.map((t) => [t.key, t.value] as const))(
    "%s (%s) falls below 4.5:1 on AT LEAST ONE canonical surface",
    (_key, value) => {
      const failing = subAaSurfaces(value);
      // The claim is existential, not universal: two of these three tokens DO
      // clear 4.5:1 on the darkest surfaces. Failure anywhere is what disqualifies
      // them as a general text token, and that is exactly what is asserted.
      expect(failing.length).toBeGreaterThanOrEqual(1);
      expect(Math.min(...ratios(value))).toBeLessThan(AA_NORMAL_TEXT);
    },
  );

  it.each(INDICATOR_ONLY.map((t) => [t.key, t.value] as const))(
    "%s (%s) is still a legitimate non-text indicator on EVERY surface",
    (_key, value) => {
      expect(Math.min(...ratios(value))).toBeGreaterThanOrEqual(UI_NON_TEXT);
    },
  );

  it("records which surfaces each indicator-only token is text-unsafe on", () => {
    // Pins the evidence so a future DNA change that silently makes one of these
    // universally text-safe (or universally unsafe) has to be acknowledged here.
    const observed = Object.fromEntries(
      INDICATOR_ONLY.map((t) => [t.key, subAaSurfaces(t.value).length]),
    );
    expect(observed).toEqual({
      "state-critical": 5,
      "state-maintenance": 3,
      "state-offline": 3,
    });
  });

  it("each indicator-only token names its readable partner in the restriction", () => {
    for (const t of INDICATOR_ONLY) {
      const partner = PHASE104_TOKEN_CONTRACT.find(
        (p) =>
          p.role === "text" &&
          p.dnaPath === t.dnaPath.replace(/\.fill$/, ".text"),
      );
      const named =
        (partner !== undefined && t.restriction.includes(partner.cssVar)) ||
        /--color-text-metadata/.test(t.restriction);
      expect(
        named,
        `${t.key} must point at the token that may carry its type`,
      ).toBe(true);
    }
  });
});

describe("Phase 104 contract — Horizon is below 3:1 on EVERY canonical surface", () => {
  const horizon = byRole("atmosphere");

  it("both Horizon ember stops are classified as atmosphere", () => {
    expect(horizon.map((t) => t.key).sort()).toEqual([
      "horizon-ember-core",
      "horizon-ember-fade",
    ]);
  });

  it.each(
    horizon.flatMap((t) =>
      SURFACES.map(([s, surface]) => [t.key, t.value, s, surface] as const),
    ),
  )(
    "%s (%s) is below 3:1 on %s — no legal foreground use",
    (_key, value, _surfaceKey, surface) => {
      expect(contrast(value, surface)).toBeLessThan(UI_NON_TEXT);
    },
  );

  it.each(horizon.map((t) => [t.key, t.value] as const))(
    "%s (%s) is universally sub-3:1 — asserted on the MAXIMUM, not the minimum",
    (_key, value) => {
      // Unlike the indicator-only tokens above, this claim really is universal,
      // so it is asserted against the best case rather than the worst.
      expect(Math.max(...ratios(value))).toBeLessThan(UI_NON_TEXT);
    },
  );

  it("both Horizon tokens are declared prohibited as a foreground", () => {
    for (const t of horizon) {
      expect(t.restriction, t.key).toContain("PROHIBITED");
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

  it("states the indicator rule accurately, in the product source as well", () => {
    for (const [label, text] of [
      ["integration document", integrationDoc],
      ["globals.css", globalsCss],
      ["tailwind.config.ts", tailwindSource],
      ["the contract", contractSource],
    ] as const) {
      expect(flatten(text), label).toContain(flatten(INDICATOR_RULE));
    }
  });

  it.each(
    INDICATOR_ONLY.map((t) => [t.key, t.cssVar, t.value] as const),
  )(
    "documents the real measured range and sub-AA surface count for %s",
    (_key, cssVar, value) => {
      const all = ratios(value);
      const line = integrationDoc
        .split("\n")
        .find((l) => l.includes(cssVar) && /of 5/.test(l));
      expect(line, `no measurement row for ${cssVar}`).toBeTruthy();
      expect(line).toContain(String(r2(Math.min(...all))));
      expect(line).toContain(String(r2(Math.max(...all))));
      expect(line).toContain(`${subAaSurfaces(value).length} of 5`);
    },
  );
});
