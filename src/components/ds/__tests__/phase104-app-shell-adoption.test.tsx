// @vitest-environment jsdom
import { readFileSync, readdirSync } from "node:fs";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import postcss from "postcss";
import { afterEach, describe, expect, it, vi } from "vitest";

import { click, keyDown, mount } from "./_render";
import {
  GLASS_VARIABLE_CONTRACT,
  SIGNATURE_CONTRACT,
} from "../phase104-signature-contract";
import { PHASE104_TOKEN_CONTRACT } from "../phase104-token-contract";

/**
 * PHASE 104-D — shared app-shell adoption gate.
 *
 * 104-A..104-C proved the Phase 104 language EXISTS and is internally
 * consistent. Nothing consumed it: five of the eight signatures had no product
 * consumer and no route's appearance had changed. This is the first increment
 * that is intentionally visible, so the gate has to answer a different
 * question — not "is the contract coherent?" but "does the shipped shell
 * actually consume it, without losing behaviour or accessibility?"
 *
 * The assertions are deliberately made against RUNTIME STRUCTURES rather than
 * source text wherever that is possible: the rail and the palette are rendered
 * into jsdom and inspected as DOM, the CSS is read through the PostCSS AST, and
 * the variable names the components rely on are checked against the imported
 * signature contract. A `source.toContain()` check would be satisfied by a
 * comment, a duplicate declaration or dead code — which is exactly the class of
 * hole external review found in the Glass contract, and it is not repeated.
 */

// ── next-intl / navigation doubles ──────────────────────────────────────────
// The shell is deeply localised; the gate is about adoption, not translation,
// so the i18n surface is replaced with identity doubles.
vi.mock("next-intl", () => ({
  useTranslations: () => (key: string) => key,
  useLocale: () => "en",
}));
vi.mock("@/i18n/navigation", () => ({
  Link: ({ children, href, ...rest }: { children?: unknown; href: string } & Record<string, unknown>) => {
    const props = rest as Record<string, unknown>;
    return (
      <a href={href} {...props}>
        {children as never}
      </a>
    );
  },
  usePathname: () => "/dashboard/assets",
  useRouter: () => ({ push: vi.fn() }),
}));

const { AppSidebar } = await import("@/components/app-shell/AppSidebar");
const { AppCommandPalette } = await import("@/components/app-shell/AppCommandPalette");

// A failing assertion skips its own `unmount()`, which would leave a mounted
// root and a stray container in `document.body` and make the NEXT test fail for
// a reason that has nothing to do with it. A gate whose failures cascade is
// hard to diagnose and easy to distrust, so the DOM is reset unconditionally.
afterEach(() => {
  document.body.innerHTML = "";
});

const GROUPS = [
  {
    groupKey: "operate",
    items: [
      { href: "/dashboard", labelKey: "dashboard" },
      { href: "/dashboard/assets", labelKey: "assets" },
    ],
  },
] as never;

// ── Sources under inspection ────────────────────────────────────────────────
const read = (rel: string): string =>
  readFileSync(fileURLToPath(new URL(rel, import.meta.url)), "utf8");

const globalsCss = read("../../../app/globals.css");

/** Components this increment declares as in-scope for 104-D. */
const IN_SCOPE_COMPONENTS = [
  "src/components/app-shell/AppSidebar.tsx",
  "src/components/app-shell/AppCommandPalette.tsx",
] as const;

const root = postcss.parse(globalsCss);

/** Every declaration of a rule, by exact selector, from the AST. */
function ruleDecls(selector: string): Array<{ prop: string; value: string }> {
  const out: Array<{ prop: string; value: string }> = [];
  root.walkRules((rule) => {
    if (rule.selector.replace(/\s+/g, " ") !== selector) return;
    // Block body on purpose: `push` returns a number and `walkDecls` treats a
    // truthy return as "stop walking", which would silently hide a duplicate.
    rule.walkDecls((d) => {
      out.push({ prop: d.prop, value: d.value });
    });
  });
  return out;
}

/** Every `var(--x)` name referenced by a rule. */
function varsUsedBy(selector: string): string[] {
  return ruleDecls(selector).flatMap((d) =>
    [...d.value.matchAll(/var\((--[a-z0-9-]+)/g)].map((m) => m[1]),
  );
}

/** Every CSS variable the Phase 104 signature contract owns. */
const CONTRACT_VARS = new Set(SIGNATURE_CONTRACT.flatMap((s) => s.cssVars));

// ───────────────────────────────────────────────────────────────────────────
describe("104-D — the shared Rail consumes the Rail signature", () => {
  it("renders the rail with the adoption class and an expanded-state hook", async () => {
    const { container, unmount } = await mount(
      <AppSidebar groups={GROUPS} organizationName={null} siteName={null} />,
    );
    const rail = container.querySelector<HTMLElement>('[data-hermes-signature="rail"]');
    expect(rail, "no element declares itself the Hermes Rail").toBeTruthy();
    expect(rail!.classList.contains("hermes-rail")).toBe(true);
    // The drawer width is selected by state, not by a literal class swap.
    expect(rail!.getAttribute("data-expanded")).toBe("true");
    expect(rail!.tagName).toBe("ASIDE");
    await unmount();
  });

  it("the .hermes-rail rule consumes ONLY contract variables — no literals", () => {
    const decls = ruleDecls(".hermes-rail");
    expect(decls.length, ".hermes-rail is not declared").toBeGreaterThan(0);
    const used = varsUsedBy(".hermes-rail");
    expect(used).toContain("--rail-width");
    expect(used).toContain("--rail-surface");
    expect(used).toContain("--rail-edge");
    // Every value must be a var() reference: no px, no hex, no rgba.
    for (const d of decls) {
      expect(d.value, `.hermes-rail { ${d.prop} } must reference a variable`).toMatch(/var\(--/);
      expect(d.value, `.hermes-rail { ${d.prop} } must not hard-code a colour`).not.toMatch(
        /#[0-9a-f]{3,8}\b|rgba?\(/i,
      );
    }
  });

  it("the expanded width comes from --rail-width-expanded", () => {
    expect(varsUsedBy('.hermes-rail[data-expanded="true"]')).toContain(
      "--rail-width-expanded",
    );
  });

  it("every variable the rail rules reference exists in the signature contract", () => {
    const used = [
      ...varsUsedBy(".hermes-rail"),
      ...varsUsedBy('.hermes-rail[data-expanded="true"]'),
      ...varsUsedBy(".hermes-rail-items"),
      ...varsUsedBy(".hermes-rail-beacon"),
    ];
    expect(used.length).toBeGreaterThan(0);
    const unknown = used.filter((v) => !CONTRACT_VARS.has(v));
    expect(unknown, "rail CSS references variables the contract does not own").toEqual([]);
  });
});

describe("104-D — the shared Command surface consumes the Command signature", () => {
  it("renders the palette with the adoption classes and keeps dialog semantics", async () => {
    const { container, unmount } = await mount(<AppCommandPalette groups={GROUPS} />);
    // Opened with the REAL Ctrl+K shortcut, inside act(). An earlier revision
    // dispatched the custom event with a bare setTimeout, which let the state
    // update escape act() and made the portal's presence non-deterministic in a
    // full-suite run. Driving the actual shortcut is both deterministic and a
    // behaviour-preservation check in its own right.
    await keyDown(document.body, "k", { ctrlKey: true });
    const dialog = document.querySelector<HTMLElement>('[data-hermes-signature="command"]');
    expect(dialog, "no element declares itself the Hermes Command surface").toBeTruthy();
    expect(dialog!.classList.contains("hermes-command-surface")).toBe(true);
    // Behaviour preservation — dialog semantics survive the visual adoption.
    expect(dialog!.getAttribute("role")).toBe("dialog");
    expect(dialog!.getAttribute("aria-modal")).toBe("true");

    const field = document.querySelector<HTMLElement>(".hermes-command-field");
    expect(field, "the command field does not consume the signature").toBeTruthy();
    expect(field!.getAttribute("role")).toBe("combobox");

    const list = document.querySelector<HTMLElement>(".hermes-command-list");
    expect(list, "the command list does not consume the signature").toBeTruthy();
    expect(list!.getAttribute("role")).toBe("listbox");

    container.remove();
    await unmount();
  });

  it("the command rules hard-code no dimension, colour or shadow", () => {
    // Asserted on VALUES, not on form. Layout keywords (`display: flex`,
    // `overflow: hidden`, `min-block-size: 0`) carry no design decision and
    // must be allowed; what may never appear is a raw px/rem length, a colour
    // or a shadow recipe, because those are the things the contract owns.
    for (const selector of [
      ".hermes-command-surface",
      ".hermes-command-field",
      ".hermes-command-list",
    ]) {
      const decls = ruleDecls(selector);
      expect(decls.length, `${selector} is not declared`).toBeGreaterThan(0);
      for (const d of decls) {
        expect(d.value, `${selector} { ${d.prop} } hard-codes a length`).not.toMatch(
          /\b\d*\.?\d+(px|rem|em)\b/,
        );
        expect(d.value, `${selector} { ${d.prop} } hard-codes a colour`).not.toMatch(
          /#[0-9a-f]{3,8}\b|rgba?\(|hsla?\(/i,
        );
        expect(`${d.prop}`, `${selector} must not define a shadow`).not.toMatch(
          /shadow/i,
        );
      }
    }
    expect(varsUsedBy(".hermes-command-surface")).toContain("--command-width");
    expect(varsUsedBy(".hermes-command-surface")).toContain("--command-radius");
    expect(varsUsedBy(".hermes-command-field")).toContain("--command-height-mobile");
    expect(varsUsedBy(".hermes-command-list")).toContain("--command-palette-max-height");
  });

  it("the desktop command height is applied at a breakpoint, not hard-coded", () => {
    let found = false;
    root.walkAtRules("media", (at) => {
      at.walkRules((rule) => {
        if (rule.selector.trim() !== ".hermes-command-field") return;
        rule.walkDecls((d) => {
          if (/var\(--command-height\)/.test(d.value)) found = true;
        });
      });
    });
    expect(found, "--command-height is never applied at a desktop breakpoint").toBe(true);
  });

  it("the surface is contained on the VERTICAL axis, not only the horizontal one", () => {
    const surface = ruleDecls(".hermes-command-surface");
    const prop = (p: string) => surface.filter((d) => d.prop === p).map((d) => d.value);

    // A column flex container is what makes the field fixed and the list the
    // part that gives way.
    expect(prop("display")).toEqual(["flex"]);
    expect(prop("flex-direction")).toEqual(["column"]);
    expect(prop("overflow")).toEqual(["hidden"]);

    // The cap must subtract the top offset AND a bottom gutter from the
    // viewport, or the surface can still run off a 568px-tall phone.
    const caps = prop("max-block-size");
    expect(caps.length, "the surface declares no height cap").toBeGreaterThan(0);
    for (const c of caps) {
      expect(c).toMatch(/calc\(/);
      expect(c).toMatch(/var\(--space-page\)/);
      expect(c).toMatch(/var\(--space-card\)/);
      expect(c, "the cap must subtract, not add").toMatch(/-\s*var\(/);
    }
    // A plain `vh` fallback must precede the dynamic unit, so a browser without
    // `dvh` still gets a real cap instead of none.
    expect(caps.some((c) => /\b100vh\b/.test(c)), "no 100vh fallback").toBe(true);
    expect(caps.some((c) => /\b100dvh\b/.test(c)), "no 100dvh cap").toBe(true);
    expect(caps.findIndex((c) => /100vh/.test(c))).toBeLessThan(
      caps.findIndex((c) => /100dvh/.test(c)),
    );

    // The top offset moved out of the component so it is part of the budget.
    expect(prop("margin-block-start")).toEqual(["var(--space-page)"]);
  });

  it("the result list can actually shrink and scrolls independently", () => {
    const list = ruleDecls(".hermes-command-list");
    const prop = (p: string) => list.filter((d) => d.prop === p).map((d) => d.value);
    // Without `min-block-size: 0` a flex child refuses to compress below its
    // content and the height cap above would do nothing at all.
    expect(prop("min-block-size")).toEqual(["0"]);
    expect(prop("flex")).toEqual(["1 1 auto"]);
    expect(prop("overflow-y")).toEqual(["auto"]);
    expect(prop("max-block-size")).toEqual(["var(--command-palette-max-height)"]);
  });

  it("the component no longer carries the offset or an intrinsic height", () => {
    const src = readFileSync(
      resolve(process.cwd(), "src/components/app-shell/AppCommandPalette.tsx"),
      "utf8",
    );
    const className = src.match(/className="(hermes-command-surface[^"]*)"/)?.[1] ?? "";
    expect(className, "the surface className was not found").toContain(
      "hermes-command-surface",
    );
    expect(className, "`mt-24` would double the top offset").not.toMatch(/\bmt-\d/);
    expect(className, "`h-fit` would defeat the height cap").not.toMatch(/\bh-fit\b/);
  });

  it("every variable the command rules reference exists in the signature contract", () => {
    const used = [
      ...varsUsedBy(".hermes-command-surface"),
      ...varsUsedBy(".hermes-command-field"),
      ...varsUsedBy(".hermes-command-list"),
    ];
    const unknown = used.filter(
      (v) => !CONTRACT_VARS.has(v) && !v.startsWith("--space-"),
    );
    expect(unknown, "command CSS references variables the contract does not own").toEqual([]);
  });
});

describe("104-D — Beacon stays a semantic locator, not a glow", () => {
  it("marks the active route and nothing else in the shell", async () => {
    const { container, unmount } = await mount(
      <AppSidebar groups={GROUPS} organizationName={null} siteName={null} />,
    );
    const beacons = container.querySelectorAll('[data-hermes-signature="beacon"]');
    // At most one primary Beacon per view — the contract's own rule.
    expect(beacons.length).toBeLessThanOrEqual(1);
    expect(beacons.length).toBe(1);
    const beacon = beacons[0] as HTMLElement;
    expect(beacon.classList.contains("hermes-rail-beacon")).toBe(true);
    // Decorative by role: it must never be announced.
    expect(beacon.getAttribute("aria-hidden")).toBe("true");
    // It must sit inside the element that is already marked as the current page.
    expect(beacon.closest('[aria-current="page"]')).toBeTruthy();
    await unmount();
  });

  it("survives collapse: the active item keeps exactly one structural Beacon", async () => {
    // The regression this pins: the Beacon used to be gated on `!collapsed`,
    // which left the collapsed rail distinguishing the active item by border,
    // fill and text COLOUR alone — the glyph tile is always `font-semibold`, so
    // the link-level weight change was invisible.
    const { container, unmount } = await mount(
      <AppSidebar groups={GROUPS} organizationName={null} siteName={null} />,
    );
    const toggle = container.querySelector<HTMLElement>("[aria-expanded]")!;
    await click(toggle);

    const rail = container.querySelector<HTMLElement>('[data-hermes-signature="rail"]')!;
    expect(rail.getAttribute("data-collapsed")).toBe("true");
    expect(rail.getAttribute("data-expanded")).toBe("false");
    // The preference is persisted exactly as before the visual adoption.
    expect(window.localStorage.getItem("hermes.appshell.sidebar.collapsed")).toBe("1");

    const current = container.querySelector<HTMLElement>('[aria-current="page"]');
    expect(current, "collapse lost the current-page marker").toBeTruthy();
    const beacons = current!.querySelectorAll('[data-hermes-signature="beacon"]');
    expect(beacons.length, "collapsed active item has no structural locator").toBe(1);
    expect((beacons[0] as HTMLElement).getAttribute("aria-hidden")).toBe("true");
    expect((beacons[0] as HTMLElement).classList.contains("hermes-rail-beacon")).toBe(true);

    // Still at most one Beacon in the whole view, collapsed or not.
    expect(container.querySelectorAll('[data-hermes-signature="beacon"]').length).toBe(1);

    // …and inactive items never receive one.
    for (const a of Array.from(container.querySelectorAll("a"))) {
      if (a.getAttribute("aria-current") === "page") continue;
      expect(a.querySelector('[data-hermes-signature="beacon"]')).toBeNull();
    }
    await unmount();
    window.localStorage.clear();
  });

  it("the Beacon rule carries no glow, bloom, spread shadow or filter", () => {
    const decls = ruleDecls(".hermes-rail-beacon");
    expect(decls.length).toBeGreaterThan(0);
    for (const d of decls) {
      expect(`${d.prop}: ${d.value}`.toLowerCase()).not.toMatch(
        /box-shadow|filter|text-shadow|glow|bloom/,
      );
      expect(d.value).toMatch(/var\(--/);
    }
    expect(varsUsedBy(".hermes-rail-beacon")).toContain("--beacon-core");
  });
});

describe("104-D — active navigation is never colour-only", () => {
  it("the active item carries aria-current plus a structural channel", async () => {
    const { container, unmount } = await mount(
      <AppSidebar groups={GROUPS} organizationName={null} siteName={null} />,
    );
    const current = container.querySelector<HTMLElement>('[aria-current="page"]');
    expect(current, "no navigation item is marked as the current page").toBeTruthy();
    // aria-current is the assistive channel; the Beacon bar and the weight/fill
    // are the visual structural channels. Colour alone would be a failure.
    expect(current!.querySelector('[data-hermes-signature="beacon"]')).toBeTruthy();
    expect(current!.className).toMatch(/font-semibold/);

    const inactive = Array.from(container.querySelectorAll("a")).filter(
      (a) => a.getAttribute("aria-current") !== "page" && a.getAttribute("href")?.startsWith("/dashboard"),
    );
    expect(inactive.length).toBeGreaterThan(0);
    for (const a of inactive) {
      expect(a.querySelector('[data-hermes-signature="beacon"]')).toBeNull();
    }
    await unmount();
  });
});

describe("104-D — behaviour and navigation are preserved", () => {
  it("route destinations and role-filtered groups still render unchanged", async () => {
    const { container, unmount } = await mount(
      <AppSidebar groups={GROUPS} organizationName={null} siteName={null} />,
    );
    const hrefs = Array.from(container.querySelectorAll("nav a")).map((a) =>
      a.getAttribute("href"),
    );
    expect(hrefs).toEqual(["/dashboard", "/dashboard/assets"]);
    // The rail is still a labelled navigation landmark.
    expect(container.querySelector("nav")?.getAttribute("aria-label")).toBeTruthy();
    await unmount();
  });

  it("the collapse control keeps its accessible name and expanded state", async () => {
    const { container, unmount } = await mount(
      <AppSidebar groups={GROUPS} organizationName={null} siteName={null} />,
    );
    const toggle = container.querySelector<HTMLElement>("[aria-expanded]");
    expect(toggle, "the collapse control lost its aria-expanded state").toBeTruthy();
    expect(toggle!.getAttribute("aria-label")).toBeTruthy();
    await unmount();
  });
});

// ───────────────────────────────────────────────────────────────────────────
describe("104-D — no Phase 104 literal is copied into the shell", () => {
  const repoRoot = resolve(process.cwd());

  it.each(IN_SCOPE_COMPONENTS)("%s copies no Phase 104 colour literal", (rel) => {
    const src = readFileSync(join(repoRoot, rel), "utf8");
    const literals = PHASE104_TOKEN_CONTRACT.map((t) => t.value)
      .concat(Object.values(GLASS_VARIABLE_CONTRACT))
      .filter((v) => new RegExp(v.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i").test(src));
    expect(literals).toEqual([]);
  });

  it.each(IN_SCOPE_COMPONENTS)("%s introduces no raw glow or spread shadow recipe", (rel) => {
    const src = readFileSync(join(repoRoot, rel), "utf8");
    // A replacement glow would arrive as an arbitrary Tailwind shadow/drop-shadow
    // value or a raw box-shadow style — both are refused.
    expect(src).not.toMatch(/shadow-\[/);
    expect(src).not.toMatch(/drop-shadow-\[/);
    expect(src).not.toMatch(/boxShadow\s*:/);
    expect(src).not.toMatch(/textShadow\s*:/);
  });
});

// ───────────────────────────────────────────────────────────────────────────
describe("104-D — legacy glow utilities do not spread", () => {
  const LEGACY = [
    "glow-signal-strong",
    "glow-signal",
    "glow-ice",
    "glow-danger",
    "text-glow-ice",
    "text-glow",
    "landing-scanlines",
  ] as const;

  /**
   * Every extension that can carry shipped source in this repository. An
   * earlier revision scanned only `.ts`/`.tsx`, so a legacy glow arriving in a
   * `.jsx` or `.js` file would have been invisible to the gate — the same class
   * of latent hole as a route filter that lists one extension out of four.
   * Nothing under `src/` uses these today; the coverage is deliberate.
   */
  const SOURCE_EXTENSIONS = ["tsx", "ts", "jsx", "js", "mjs", "cjs"] as const;
  const SOURCE_RE = new RegExp(`\\.(${SOURCE_EXTENSIONS.join("|")})$`);
  const TEST_RE = new RegExp(`\\.test\\.(${SOURCE_EXTENSIONS.join("|")})$`);

  /** Shipped source files, excluding tests and the contracts that merely name them. */
  function walk(dir: string, acc: string[] = []): string[] {
    for (const e of readdirSync(dir, { withFileTypes: true })) {
      if (e.isDirectory()) {
        if (e.name === "node_modules" || e.name === ".next" || e.name === "__tests__") continue;
        walk(join(dir, e.name), acc);
      } else if (SOURCE_RE.test(e.name) && !TEST_RE.test(e.name)) {
        acc.push(join(dir, e.name));
      }
    }
    return acc;
  }

  const EXCLUDED = new Set([
    join("src", "components", "ds", "phase104-signature-contract.ts"),
  ]);
  const sourceFiles = walk(resolve(process.cwd(), "src")).filter(
    (f) => !EXCLUDED.has(f.slice(process.cwd().length + 1)),
  );

  const consumers = (): string[] => {
    const hits = new Set<string>();
    for (const f of sourceFiles) {
      const src = readFileSync(f, "utf8");
      if (LEGACY.some((c) => new RegExp(`\\b${c}\\b`).test(src))) {
        hits.add(f.slice(process.cwd().length + 1).split("\\").join("/"));
      }
    }
    return [...hits].sort();
  };

  it("the scan actually covers shipped source", () => {
    expect(sourceFiles.length).toBeGreaterThan(100);
  });

  it("the scanner accepts every shipped source extension, not just TypeScript", () => {
    for (const ext of SOURCE_EXTENSIONS) {
      expect(SOURCE_RE.test(`Widget.${ext}`), `.${ext} is not scanned`).toBe(true);
      expect(TEST_RE.test(`Widget.test.${ext}`), `.test.${ext} is not excluded`).toBe(true);
    }
    // …and it does not sweep in things that are not source.
    for (const notSource of ["styles.css", "data.json", "README.md", "logo.svg"]) {
      expect(SOURCE_RE.test(notSource), `${notSource} should not be scanned`).toBe(false);
    }
  });

  it("a legacy consumer arriving in a JSX or JS file would be detected", () => {
    // The detection predicate, applied to synthetic sources rather than by
    // writing files into the repository. Proves the regex — not just the
    // extension filter — fires on the shapes a .jsx/.js consumer would take.
    const detects = (src: string): boolean =>
      LEGACY.some((c) => new RegExp(`\\b${c}\\b`).test(src));

    expect(detects('export const A = () => <div className="glow-signal" />;')).toBe(true);
    expect(detects("const cls = 'landing-scanlines';")).toBe(true);
    expect(detects('classNames({ "text-glow-ice": on })')).toBe(true);
    // A word that merely contains a utility name must not trip it.
    expect(detects('const x = "afterglow-signalling";')).toBe(false);
    expect(detects('<div className="hermes-rail-beacon" />')).toBe(false);
  });

  it("no 104-D in-scope component consumes a legacy glow or scanline utility", () => {
    const offenders = consumers().filter((f) =>
      (IN_SCOPE_COMPONENTS as readonly string[]).includes(f),
    );
    expect(offenders).toEqual([]);
  });

  it("the global legacy consumer set has not grown", () => {
    // Pinned to the files that legitimately still consume the legacy utilities.
    // Both are OUTSIDE the 104-D shared-shell scope: a generic UI card used by
    // many routes, and the public marketing hero. Migrating either would change
    // route content, which this increment is not allowed to touch. The pin
    // means a NEW consumer anywhere fails, and it must shrink, never grow.
    expect(consumers()).toEqual([
      "src/components/landing/HeroSection.tsx",
      "src/components/ui/GlassCard.tsx",
    ]);
  });
});

// ───────────────────────────────────────────────────────────────────────────
describe("104-D — the earlier phases stay intact", () => {
  it("Phase 87 isolation holds", () => {
    const phase87 = read("../token-contract.ts");
    expect(phase87).toContain('node: "12:4"');
    for (const t of PHASE104_TOKEN_CONTRACT) {
      expect(phase87).not.toContain(t.cssVar);
    }
  });

  it("no Phase 104 signature variable was redeclared by the adoption layer", () => {
    // The adoption layer may only CONSUME variables. A redeclaration would fork
    // the contract silently, so every owned variable must still be declared
    // exactly once across the whole sheet.
    for (const cssVar of CONTRACT_VARS) {
      const declared: string[] = [];
      root.walkDecls(cssVar, (d) => {
        declared.push(d.value.trim());
      });
      expect(declared, `${cssVar} is not declared exactly once`).toHaveLength(1);
    }
  });
});
