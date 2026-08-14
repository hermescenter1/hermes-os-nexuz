// @vitest-environment jsdom
import { readFileSync, readdirSync } from "node:fs";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import postcss from "postcss";
import { afterEach, describe, expect, it, vi } from "vitest";

import { keyDown, mount } from "./_render";
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

  it("the command rules consume ONLY contract variables — no literals", () => {
    for (const selector of [
      ".hermes-command-surface",
      ".hermes-command-field",
      ".hermes-command-list",
    ]) {
      const decls = ruleDecls(selector);
      expect(decls.length, `${selector} is not declared`).toBeGreaterThan(0);
      for (const d of decls) {
        expect(d.value, `${selector} { ${d.prop} } must reference a variable`).toMatch(
          /var\(--/,
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

  /** Shipped source files, excluding tests and the contracts that merely name them. */
  function walk(dir: string, acc: string[] = []): string[] {
    for (const e of readdirSync(dir, { withFileTypes: true })) {
      if (e.isDirectory()) {
        if (e.name === "node_modules" || e.name === ".next" || e.name === "__tests__") continue;
        walk(join(dir, e.name), acc);
      } else if (/\.(tsx|ts)$/.test(e.name) && !/\.test\.(tsx|ts)$/.test(e.name)) {
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
