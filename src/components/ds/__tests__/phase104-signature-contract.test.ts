import { readFileSync, readdirSync } from "node:fs";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import postcss from "postcss";
import { describe, expect, it } from "vitest";

import { PHASE104_TOKEN_CONTRACT } from "../phase104-token-contract";
import {
  GLASS_VARIABLE_CONTRACT,
  HORIZON_POLICY,
  SHIPPED_GLASS_TIERS,
  SIGNATURE_CONTRACT,
  SIGNATURE_GEOMETRY,
  type SignatureKey,
} from "../phase104-signature-contract";
import {
  BEACON,
  COMMAND,
  GLASS,
  RAIL,
  TRIAD,
} from "../../../../tools/figma/hermes-phase104-visual-system/src/lib/dna-tokens.js";

/**
 * PHASE 104-C — signature gate.
 *
 * Colour contracts cannot see the parts of a design language that actually rot:
 * the rail's resting width, the fact that Beacon appears at most once per view,
 * that Horizon may not sit behind a telemetry table, that only the hero glass
 * tier blurs. This suite asserts those.
 *
 * The Glass tokenisation is the delicate part. Moving five tiers of hard-coded
 * rgba() into variables is only legitimate if it changes nothing, so the tiers
 * are pinned to the literals they shipped with and the CSS is required to
 * reference the variables rather than restate them. The suite also asserts that
 * the machine source's Glass SPECIFICATION still differs from what ships — not
 * because divergence is good, but because silently collapsing the two in either
 * direction would be a visual change disguised as a refactor.
 */

const read = (rel: string): string =>
  readFileSync(fileURLToPath(new URL(rel, import.meta.url)), "utf8");

const globalsCss = read("../../../app/globals.css");

/** Active (non-comment) declarations of a custom property, via the PostCSS AST. */
function activeDeclarations(css: string, prop: string): string[] {
  const values: string[] = [];
  postcss.parse(css).walkDecls(prop, (decl) => {
    values.push(decl.value.trim());
  });
  return values;
}

/** The body of a CSS rule, by exact selector, from the AST. */
function ruleBody(css: string, selector: string): string | undefined {
  let found: string | undefined;
  postcss.parse(css).walkRules((rule) => {
    if (found === undefined && rule.selector.replace(/\s+/g, " ") === selector) {
      found = rule.nodes.map((n) => n.toString()).join(";");
    }
  });
  return found;
}

const signature = (key: SignatureKey) =>
  SIGNATURE_CONTRACT.find((s) => s.key === key)!;

// ───────────────────────────────────────────────────────────────────────────
describe("Phase 104 signatures — all eight are declared and grounded in CSS", () => {
  it("declares exactly the eight required signatures, with no duplicates", () => {
    const keys = SIGNATURE_CONTRACT.map((s) => s.key);
    expect(keys.slice().sort()).toEqual(
      [
        "beacon",
        "command",
        "deep-navy",
        "edge",
        "glass",
        "horizon",
        "rail",
        "triad",
      ].sort(),
    );
    expect(new Set(keys).size).toBe(keys.length);
  });

  it("every signature carries a written usage AND restriction", () => {
    for (const s of SIGNATURE_CONTRACT) {
      expect(s.usage.length, `${s.key}.usage`).toBeGreaterThan(20);
      expect(s.restriction.length, `${s.key}.restriction`).toBeGreaterThan(20);
      expect(s.cssVars.length, `${s.key}.cssVars`).toBeGreaterThan(0);
    }
  });

  it("no CSS variable is claimed by two signatures", () => {
    const all = SIGNATURE_CONTRACT.flatMap((s) => s.cssVars);
    expect(new Set(all).size).toBe(all.length);
  });

  it.each(
    SIGNATURE_CONTRACT.flatMap((s) => s.cssVars.map((v) => [s.key, v] as const)),
  )("%s: %s is declared exactly once in globals.css", (_key, cssVar) => {
    const declared = activeDeclarations(globalsCss, cssVar);
    expect(declared, `active declarations of ${cssVar}`).toHaveLength(1);
    expect(declared[0].length).toBeGreaterThan(0);
  });
});

// ───────────────────────────────────────────────────────────────────────────
describe("Hermes Glass — EVERY glass variable is owned and matched exactly", () => {
  /** Active `--glass-*` custom properties, from the parsed CSS. */
  const activeGlassVars = (css: string): string[] => {
    const found: string[] = [];
    postcss.parse(css).walkDecls((decl) => {
      if (decl.prop.startsWith("--glass-")) found.push(decl.prop);
    });
    return found;
  };

  const owned = Object.keys(GLASS_VARIABLE_CONTRACT);

  it("the contract owns EVERY active --glass-* variable, and no others", () => {
    // Set equality, so this single assertion catches all three failure shapes:
    // a variable added to CSS but not owned, an owned variable deleted from CSS,
    // and a rename (which is both at once).
    const active = activeGlassVars(globalsCss);
    expect(new Set(active)).toEqual(new Set(owned));
    // The subset bug that shipped: 26 active, 9 owned. Guard the shape too.
    expect(owned.length).toBe(active.length);
    expect(owned.length).toBeGreaterThanOrEqual(26);
  });

  it.each(owned.map((v) => [v, GLASS_VARIABLE_CONTRACT[v]] as const))(
    "%s is declared exactly once with the exact runtime value %s",
    (cssVar, value) => {
      // Exactly-once rejects a duplicate/override; the value comparison is on
      // the parsed declaration, so a value sitting in a comment cannot satisfy it.
      expect(activeDeclarations(globalsCss, cssVar)).toEqual([value]);
    },
  );

  it("every --glass-* variable referenced by a .ds-glass-* rule is owned", () => {
    const referenced = new Set<string>();
    postcss.parse(globalsCss).walkRules((rule) => {
      if (!/\.ds-glass/.test(rule.selector)) return;
      rule.walkDecls((decl) => {
        for (const m of decl.value.matchAll(/var\((--glass-[a-z0-9-]+)\)/g)) {
          referenced.add(m[1]);
        }
      });
    });
    expect(referenced.size).toBeGreaterThan(0);
    const unowned = [...referenced].filter((v) => !owned.includes(v));
    expect(unowned).toEqual([]);
  });

  it.each(
    SHIPPED_GLASS_TIERS.map(
      (t) =>
        [t.tier, t.fillVar, GLASS_VARIABLE_CONTRACT[t.fillVar]] as const,
    ),
  )("%s tier: %s still holds the shipped fill", (_tier, cssVar, value) => {
    expect(activeDeclarations(globalsCss, cssVar)).toEqual([value]);
  });

  it.each(
    SHIPPED_GLASS_TIERS.map(
      (t) =>
        [t.tier, t.borderVar, GLASS_VARIABLE_CONTRACT[t.borderVar]] as const,
    ),
  )("%s tier: %s still holds the shipped border", (_tier, cssVar, value) => {
    expect(activeDeclarations(globalsCss, cssVar)).toEqual([value]);
  });

  it("the shipped rules reference the variables instead of restating rgba()", () => {
    for (const [selector, vars] of [
      [
        ".ds-glass-card, .ds-glass-interactive",
        ["--glass-card-sheen-from", "--glass-card-fill-from", "--glass-card-border", "--glass-card-inner", "--glass-card-drop"],
      ],
      [
        ".ds-glass-soft",
        ["--glass-soft-sheen-from", "--glass-soft-fill", "--glass-soft-border", "--glass-soft-inner"],
      ],
      [
        ".ds-glass-elevated",
        ["--glass-elevated-sheen-from", "--glass-elevated-fill-from", "--glass-elevated-border", "--glass-elevated-inner", "--glass-elevated-drop"],
      ],
      [
        ".ds-glass-hero",
        ["--glass-hero-sheen-from", "--glass-hero-fill-from", "--glass-hero-border", "--glass-hero-inner", "--glass-hero-drop", "--glass-hero-backdrop"],
      ],
    ] as const) {
      const body = ruleBody(globalsCss, selector);
      expect(body, `rule ${selector} not found`).toBeTruthy();
      for (const v of vars) {
        expect(body, `${selector} should read var(${v})`).toContain(`var(${v})`);
      }
    }
  });

  it("only the hero tier blurs — the app tiers sample nothing on a solid shell", () => {
    for (const t of SHIPPED_GLASS_TIERS) {
      const selector = t.tier === "card" ? ".ds-glass-card, .ds-glass-interactive" : `.ds-glass-${t.tier}`;
      const body = ruleBody(globalsCss, selector) ?? "";
      expect(/backdrop-filter/.test(body), `${t.tier} backdrop-filter`).toBe(
        t.blurs,
      );
    }
  });

  it("the machine source now AGREES with what ships (divergence closed by owner decision)", () => {
    // The owner ruled the restrained operational rendering canonical, so the
    // spec was updated to follow the product rather than the other way round.
    // These assertions are the thing that keeps them together from now on.
    for (const tier of SHIPPED_GLASS_TIERS) {
      const spec = GLASS.tiers.find((t) => t.tier === tier.tier);
      expect(spec, `machine source has no ${tier.tier} tier`).toBeTruthy();
      expect(spec!.fill, `${tier.tier} fill`).toBe(
        GLASS_VARIABLE_CONTRACT[tier.fillVar],
      );
      expect(spec!.border, `${tier.tier} border`).toBe(
        GLASS_VARIABLE_CONTRACT[tier.borderVar],
      );
      // Blur is reserved for hero and overlay contexts, never operational cards.
      expect(spec!.blur > 0, `${tier.tier} blur`).toBe(tier.blurs);
    }
  });

  it("the interactive tier shares the card surface recipe but not its lift", () => {
    const card = GLASS.tiers.find((t) => t.tier === "card")!;
    const interactive = GLASS.tiers.find((t) => t.tier === "interactive")!;
    expect(interactive.fill).toBe(card.fill);
    expect(interactive.border).toBe(card.border);
    // …and stays a distinct interaction: a deeper lift than the card tier.
    expect(Math.abs(interactive.lift)).toBeGreaterThan(Math.abs(card.lift));
  });
});

describe("Hermes Glass parity resists comments, duplicates and drift (adversarial)", () => {
  const sample = "--glass-card-fill-to";
  const value = GLASS_VARIABLE_CONTRACT[sample];

  /** The same check the real gate applies, run against synthetic CSS. */
  const parity = (css: string, cssVar: string, expected: string): boolean => {
    const decls = activeDeclarations(css, cssVar);
    return decls.length === 1 && decls[0] === expected;
  };

  it("a WRONG value fails — this is the exact hole review found", () => {
    // External review set --glass-card-fill-to to magenta and all 93 assertions
    // passed, because the variable was not owned. It is owned now.
    expect(Object.keys(GLASS_VARIABLE_CONTRACT)).toContain(sample);
    const magenta = `:root { ${sample}: rgba(255, 0, 255, 0.90); }`;
    expect(parity(magenta, sample, value)).toBe(false);
    // …and the real sheet still passes.
    expect(parity(globalsCss, sample, value)).toBe(true);
  });

  it("a correct value inside a comment cannot mask a wrong active declaration", () => {
    const masked = `:root {\n  /* ${sample}: ${value}; */\n  ${sample}: rgba(0, 0, 0, 1);\n}`;
    // The retired substring approach would have accepted this outright…
    expect(masked).toContain(`${sample}: ${value}`);
    // …the AST sees only the active declaration, and it is wrong.
    expect(parity(masked, sample, value)).toBe(false);
    expect(activeDeclarations(masked, sample)).toEqual(["rgba(0, 0, 0, 1)"]);
  });

  it("a duplicate/overriding declaration fails the exactly-once requirement", () => {
    const duplicated = `:root { ${sample}: ${value}; }\n:root { ${sample}: rgba(0, 0, 0, 1); }`;
    // A substring match still passes here — the correct value IS present.
    expect(duplicated).toContain(`${sample}: ${value}`);
    expect(activeDeclarations(duplicated, sample)).toHaveLength(2);
    expect(parity(duplicated, sample, value)).toBe(false);
  });

  it("an unowned Glass variable added to the sheet fails set equality", () => {
    const owned = new Set(Object.keys(GLASS_VARIABLE_CONTRACT));
    const withStray = `${globalsCss}\n:root { --glass-rogue-tint: rgba(255, 0, 255, 1); }`;
    const active = new Set<string>();
    postcss.parse(withStray).walkDecls((d) => {
      if (d.prop.startsWith("--glass-")) active.add(d.prop);
    });
    expect(active).not.toEqual(owned);
    expect(active.has("--glass-rogue-tint")).toBe(true);
  });

  it("the lift ladder and interactive scale are derived from the DNA, not retyped", () => {
    expect(SIGNATURE_GEOMETRY.glass.liftLadder).toBe(GLASS.liftLadder);
    expect(SIGNATURE_GEOMETRY.glass.interactiveScale).toBe(
      GLASS.interactiveScale,
    );
    expect(GLASS.liftLadder).toEqual([
      "soft",
      "card",
      "elevated",
      "interactive",
      "hero",
    ]);
  });

  it("the shipped hover ladder matches the DNA ordering, and only interactive scales", () => {
    // Scoped to the 87L.2 card-interaction section on purpose. globals.css also
    // contains a legacy `scale(1.05)` pulse keyframe and a `scale(1.000)` entry
    // animation that predate Phase 104 and belong to other utilities; a
    // file-wide scale assertion would be asserting something that was never
    // true rather than the invariant this signature owns.
    const section = globalsCss.slice(
      globalsCss.indexOf("PHASE 87L.2"),
      globalsCss.indexOf("Focus foundation"),
    );
    expect(section.length).toBeGreaterThan(0);

    const lift = (sel: string): number => {
      const i = section.indexOf(sel);
      expect(i, `${sel} not found in the 87L.2 section`).toBeGreaterThan(-1);
      return Number(
        section.slice(i).match(/translate3d\(0, -([\d.]+)px, 0\)/)![1],
      );
    };
    const ladder = GLASS.liftLadder.map((t) => lift(`.ds-glass-${t}:hover`));
    for (let i = 1; i < ladder.length; i += 1) {
      expect(
        ladder[i],
        `${GLASS.liftLadder[i]} must lift more than ${GLASS.liftLadder[i - 1]}`,
      ).toBeGreaterThan(ladder[i - 1]);
    }
    const scales = section.match(/scale\((1\.\d+)\)/g) ?? [];
    expect(scales.length).toBeGreaterThan(0);
    expect(new Set(scales)).toEqual(
      new Set([`scale(${GLASS.interactiveScale})`]),
    );
  });
});

// ───────────────────────────────────────────────────────────────────────────
describe("Hermes Horizon — the surface policy is machine-readable", () => {
  it("permitted and forbidden surfaces are disjoint and both non-empty", () => {
    expect(HORIZON_POLICY.permitted.length).toBeGreaterThan(0);
    expect(HORIZON_POLICY.forbidden.length).toBeGreaterThan(0);
    const overlap = HORIZON_POLICY.permitted.filter((s) =>
      (HORIZON_POLICY.forbidden as readonly string[]).includes(s),
    );
    expect(overlap).toEqual([]);
  });

  it("the dense engineering surfaces are all on the forbidden list", () => {
    for (const surface of [
      "command-center",
      "industrial-brain",
      "live-operations",
      "asset-detail",
      "alarm-center",
      "reports",
    ]) {
      expect(HORIZON_POLICY.forbidden, surface).toContain(surface);
    }
  });

  it("the vignette is mandatory and the ember band is capped", () => {
    expect(HORIZON_POLICY.vignetteRequired).toBe(true);
    expect(HORIZON_POLICY.emberBandMaxHeightRatio).toBeGreaterThan(0);
    expect(HORIZON_POLICY.emberBandMaxHeightRatio).toBeLessThanOrEqual(0.22);
  });

  it("Horizon's own tokens are the atmosphere-only ones from the token contract", () => {
    const atmosphere = PHASE104_TOKEN_CONTRACT.filter(
      (t) => t.role === "atmosphere",
    ).map((t) => t.cssVar);
    expect(signature("horizon").cssVars.slice().sort()).toEqual(
      atmosphere.slice().sort(),
    );
  });
});

// ───────────────────────────────────────────────────────────────────────────
describe("Rail, Command, Triad and Beacon — geometry derived from the DNA", () => {
  it("rail geometry matches the machine source and meets the target-size floor", () => {
    expect(SIGNATURE_GEOMETRY.rail.width).toBe(RAIL.widthRail);
    expect(SIGNATURE_GEOMETRY.rail.widthExpanded).toBe(RAIL.widthExpanded);
    expect(SIGNATURE_GEOMETRY.rail.itemSize).toBeGreaterThanOrEqual(
      SIGNATURE_GEOMETRY.minTargetPx,
    );
  });

  it("the rail CSS carries the derived widths", () => {
    expect(activeDeclarations(globalsCss, "--rail-width")).toEqual([
      `${RAIL.widthRail}px`,
    ]);
    expect(activeDeclarations(globalsCss, "--rail-width-expanded")).toEqual([
      `${RAIL.widthExpanded}px`,
    ]);
    expect(activeDeclarations(globalsCss, "--rail-item-size")).toEqual([
      `${RAIL.itemSize}px`,
    ]);
  });

  it("command geometry matches the machine source across all three widths", () => {
    expect(activeDeclarations(globalsCss, "--command-width")).toEqual([
      `${COMMAND.widthDesktop}px`,
    ]);
    expect(activeDeclarations(globalsCss, "--command-width-tablet")).toEqual([
      `${COMMAND.widthTablet}px`,
    ]);
    expect(activeDeclarations(globalsCss, "--command-width-mobile")).toEqual([
      `${COMMAND.widthMobile}px`,
    ]);
    expect(activeDeclarations(globalsCss, "--command-height")).toEqual([
      `${COMMAND.height}px`,
    ]);
  });

  it("the command palette declares its five groups in the DNA order", () => {
    expect(SIGNATURE_GEOMETRY.command.paletteGroups).toEqual([
      "Navigate",
      "Actions",
      "Entities",
      "Evidence",
      "Help",
    ]);
  });

  it("the Triad is exactly three intents — operate, understand, act", () => {
    expect(SIGNATURE_GEOMETRY.triad.count).toBe(3);
    expect(SIGNATURE_GEOMETRY.triad.intents).toEqual([
      "operate",
      "understand",
      "act",
    ]);
    expect(TRIAD.intents).toHaveLength(TRIAD.count);
    expect(activeDeclarations(globalsCss, "--triad-card-width")).toEqual([
      `${TRIAD.cardWidthDesktop}px`,
    ]);
  });

  it("Beacon is capped at one primary per view and never white-on-cyan", () => {
    expect(SIGNATURE_GEOMETRY.beacon.maxPrimaryPerView).toBe(1);
    expect(BEACON.maxPrimaryPerView).toBe(1);
    // --beacon-on aliases the on-brand foreground, which is Obsidian, not white.
    expect(activeDeclarations(globalsCss, "--beacon-on")).toEqual([
      "var(--color-brand-on-brand)",
    ]);
  });

  it("Edge illumination fades to fully transparent — a highlight, not a glow", () => {
    expect(activeDeclarations(globalsCss, "--edge-illumination-to")).toEqual([
      "rgba(139, 244, 248, 0.00)",
    ]);
    expect(activeDeclarations(globalsCss, "--edge-illumination-span")).toEqual([
      "40%",
    ]);
  });

  it("the Phase 104 signature layer reinstates no glow, bloom or scanline", () => {
    // HONEST SCOPE. `.glow-signal`, `.glow-ice`, `.glow-danger`, `.text-glow`
    // and `.landing-scanlines` are STILL DEFINED in globals.css and four of them
    // still have consumers, even though the Phase 104 DNA notes describe them as
    // retired by the 87A brand system. That contradiction is real and is
    // recorded as an owner decision in the Phase 104 docs — deleting shipped
    // utilities that pages still reference is not a token increment's call.
    //
    // What Phase 104 CAN be held to is that its own signature layer does not
    // reintroduce the effect under a new name. That is what is asserted here.
    // Checked on the AST, not the text: the prose above literally contains the
    // word "glow" while forbidding it, and a substring scan cannot tell a
    // prohibition from a violation.
    // Slicing the text would start mid-comment and is not parseable, so the
    // whole sheet is parsed once and nodes are filtered by source line.
    const layerStartLine =
      globalsCss.slice(0, globalsCss.indexOf("PHASE 104-C")).split("\n").length;
    expect(layerStartLine).toBeGreaterThan(1);
    const root = postcss.parse(globalsCss);
    const inLayer = (line: number | undefined): boolean =>
      line !== undefined && line >= layerStartLine;
    const declared: string[] = [];
    root.walkDecls((decl) => {
      if (inLayer(decl.source?.start?.line)) {
        declared.push(`${decl.prop}: ${decl.value}`);
      }
    });
    const selectors: string[] = [];
    root.walkRules((rule) => {
      if (inLayer(rule.source?.start?.line)) selectors.push(rule.selector);
    });
    expect(declared.length).toBeGreaterThan(0);
    for (const banned of ["glow", "bloom", "scanline", "text-shadow"]) {
      const hits = [...declared, ...selectors].filter((s) =>
        s.toLowerCase().includes(banned),
      );
      expect(
        hits,
        `the Phase 104 signature layer must not introduce ${banned}`,
      ).toEqual([]);
    }
    // No Phase 104 variable may carry an outer (non-inset) coloured shadow.
    for (const s of SIGNATURE_CONTRACT) {
      for (const cssVar of s.cssVars) {
        for (const value of activeDeclarations(globalsCss, cssVar)) {
          expect(
            /\b\d+px\s+\d+px\s+\d+px\s+(rgba?\()?(?!0,\s*0,\s*0)/.test(value) &&
              !value.includes("inset") &&
              /rgba?\(\s*(139|22|237)/.test(value),
            `${cssVar} looks like a coloured outer glow: ${value}`,
          ).toBe(false);
        }
      }
    }
  });
});

// ───────────────────────────────────────────────────────────────────────────
describe("Phase 104 hues never appear as raw literals in shipped source", () => {
  const ROOT = resolve(process.cwd(), "src");
  const ALLOWED = new Set([
    join("src", "app", "globals.css"),
    join("src", "components", "ds", "phase104-token-contract.ts"),
    join("src", "components", "ds", "phase104-signature-contract.ts"),
  ]);

  function walk(dir: string, acc: string[] = []): string[] {
    for (const e of readdirSync(dir, { withFileTypes: true })) {
      if (e.isDirectory()) {
        if (e.name === "node_modules" || e.name === ".next" || e.name === "__tests__") continue;
        walk(join(dir, e.name), acc);
      } else if (/\.(tsx|ts|css)$/.test(e.name) && !/\.test\.(tsx|ts)$/.test(e.name)) {
        acc.push(join(dir, e.name));
      }
    }
    return acc;
  }

  const sourceFiles = walk(ROOT).filter(
    (f) => !ALLOWED.has(f.slice(process.cwd().length + 1)),
  );

  it("the scan actually covers shipped source (otherwise it proves nothing)", () => {
    expect(sourceFiles.length).toBeGreaterThan(100);
  });

  it.each(PHASE104_TOKEN_CONTRACT.map((t) => [t.key, t.value] as const))(
    "%s (%s) is never hard-coded outside the contract and globals.css",
    (_key, value) => {
      const re = new RegExp(value.replace("#", "#"), "i");
      const offenders = sourceFiles
        .filter((f) => re.test(readFileSync(f, "utf8")))
        .map((f) => f.slice(process.cwd().length + 1));
      expect(offenders).toEqual([]);
    },
  );
});
