// @vitest-environment jsdom
import { readFileSync, readdirSync } from "node:fs";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import postcss from "postcss";
import { afterEach, describe, expect, it, vi } from "vitest";

import { mount } from "./_render";
import { GLASS_VARIABLE_CONTRACT, SIGNATURE_CONTRACT } from "../phase104-signature-contract";
import { PHASE104_TOKEN_CONTRACT } from "../phase104-token-contract";
import {
  HORIZON,
  HORIZON_FORBIDDEN_SURFACES,
  HORIZON_PERMITTED_SURFACES,
} from "../../../../tools/figma/hermes-phase104-visual-system/src/lib/dna-tokens.js";

/**
 * PHASE 104-D2 — Workspace & Authentication visual pilot gate.
 *
 * 104-D adopted the shared shell but changed no route CONTENT. This increment
 * is the first that does, so the questions are different again: does the
 * canonical Login actually render Horizon, does the atmosphere stay off every
 * other surface, and is the Dashboard Triad a real three-intent composition
 * built from existing content rather than three decorative cards?
 *
 * Runtime structures first. The Triad is rendered into jsdom and inspected as
 * DOM; the CSS is read through the PostCSS AST; the intent union comes from the
 * imported component, not from a string search. A `toContain()` over source
 * would be satisfied by a comment, and the Horizon band percentage in
 * particular has to be recomputed rather than read from prose.
 */

vi.mock("next-intl", () => ({
  useTranslations: () => Object.assign((key: string) => key, { rich: (k: string) => k }),
  useLocale: () => "en",
}));
vi.mock("@/i18n/navigation", () => ({
  Link: ({ children, href }: { children?: unknown; href: string }) => (
    <a href={href}>{children as never}</a>
  ),
  usePathname: () => "/dashboard",
  useRouter: () => ({ push: vi.fn() }),
}));

const { TriadGroup, TRIAD_INTENTS } = await import(
  "@/components/dashboard-experience/TriadGroup"
);

afterEach(() => {
  document.body.innerHTML = "";
});

const read = (rel: string): string =>
  readFileSync(fileURLToPath(new URL(rel, import.meta.url)), "utf8");
const repo = (rel: string): string => readFileSync(resolve(process.cwd(), rel), "utf8");

/** Every extension that can carry shipped source in this repository. */
const SOURCE_EXTENSIONS = ["tsx", "ts", "jsx", "js", "mjs", "cjs"] as const;
const SOURCE_RE = new RegExp(`\\.(${SOURCE_EXTENSIONS.join("|")})$`);
const TEST_RE = new RegExp(`\\.test\\.(${SOURCE_EXTENSIONS.join("|")})$`);

/** Shipped source under src/, excluding tests and generated directories. */
const SRC_FILES: string[] = (function walk(dir: string, acc: string[] = []): string[] {
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    if (e.isDirectory()) {
      if (["node_modules", ".next", "__tests__", "dist", "build"].includes(e.name)) continue;
      walk(join(dir, e.name), acc);
    } else if (SOURCE_RE.test(e.name) && !TEST_RE.test(e.name)) {
      acc.push(join(dir, e.name).slice(process.cwd().length + 1).split("\\").join("/"));
    }
  }
  return acc;
})(resolve(process.cwd(), "src"));

/** Strip comments so a mention in prose can never register as a consumer. */
const stripComments = (src: string): string =>
  src.replace(/\/\*[\s\S]*?\*\//g, " ").replace(/(^|[^:])\/\/[^\n]*/g, "$1 ");

/**
 * Does this source actually put the Horizon layer into the DOM?
 *
 * An earlier revision matched only the exact double-quoted
 * `className="hermes-horizon"` in `.ts`/`.tsx`. A `.jsx` file, a single-quoted
 * string, a template literal or a `cn(...)` argument would all have slipped
 * past it, so exclusivity was weaker than it looked. This covers every shape a
 * class realistically reaches the DOM through, plus the signature attribute.
 */
function detectsHorizon(src: string): boolean {
  const active = stripComments(src);
  if (/data-hermes-signature\s*=\s*[{"']\s*["']?horizon/.test(active)) return true;
  // A quoted string, a template literal, or a cn() argument containing the class.
  return /["'`][^"'`\n]*\bhermes-horizon\b/.test(active);
}

const horizonConsumers = (): string[] =>
  SRC_FILES.filter((f) => detectsHorizon(repo(f))).sort();

const globalsCss = read("../../../app/globals.css");
const root = postcss.parse(globalsCss);

const LOGIN_ROUTE = "src/app/[locale]/auth/login/page.tsx";
const AUTH_SHELL = "src/components/auth-experience/AuthExperienceShell.tsx";
const DASHBOARD_SURFACE = "src/components/dashboard/DashboardCommandSurface.tsx";
const TRIAD_GROUP = "src/components/dashboard-experience/TriadGroup.tsx";
const DASHBOARD_ROUTE = "src/app/[locale]/dashboard/page.tsx";

/** Changed product components this increment owns. */
const CHANGED_SCOPE = [LOGIN_ROUTE, AUTH_SHELL, DASHBOARD_SURFACE, TRIAD_GROUP] as const;

/** Other auth routes that share the shell and must NOT opt into Horizon. */
const OTHER_AUTH_ROUTES = [
  "src/app/[locale]/auth/register/page.tsx",
  "src/app/[locale]/auth/forgot-password/page.tsx",
  "src/app/[locale]/auth/reset-password/page.tsx",
  "src/app/[locale]/auth/accept-invite/page.tsx",
  "src/app/[locale]/auth/verify-email/page.tsx",
] as const;

function ruleDecls(selector: string): Array<{ prop: string; value: string }> {
  const out: Array<{ prop: string; value: string }> = [];
  root.walkRules((rule) => {
    if (rule.selector.replace(/\s+/g, " ") !== selector) return;
    rule.walkDecls((d) => {
      out.push({ prop: d.prop, value: d.value });
    });
  });
  return out;
}
const varsUsedBy = (sel: string): string[] =>
  ruleDecls(sel).flatMap((d) => [...d.value.matchAll(/var\((--[a-z0-9-]+)/g)].map((m) => m[1]));

const CONTRACT_VARS = new Set(SIGNATURE_CONTRACT.flatMap((s) => s.cssVars));

/** JSX source with comments stripped — a comment must never satisfy a gate. */
function activeSource(rel: string): string {
  return repo(rel)
    .replace(/\/\*[\s\S]*?\*\//g, " ")
    .replace(/(^|[^:])\/\/[^\n]*/g, "$1 ");
}

// ───────────────────────────────────────────────────────────────────────────
describe("104-D2 Login — Horizon is opted into explicitly and only here", () => {
  it("the canonical Login requests Horizon mode", () => {
    expect(activeSource(LOGIN_ROUTE)).toMatch(/visualMode\s*=\s*"horizon"/);
  });

  it("the shared auth shell DEFAULTS to the non-Horizon mode", () => {
    const src = activeSource(AUTH_SHELL);
    expect(src, "visualMode has no safe default").toMatch(
      /visualMode\s*=\s*"standard"/,
    );
    // The union must exist, so an arbitrary string cannot enable atmosphere.
    expect(src).toMatch(/visualMode\?\s*:\s*"standard"\s*\|\s*"horizon"/);
  });

  it.each(OTHER_AUTH_ROUTES)("%s does NOT request Horizon", (rel) => {
    expect(activeSource(rel)).not.toMatch(/visualMode\s*=\s*"horizon"/);
  });

  it("the /login compatibility route stays a redirect with no visual surface", () => {
    const src = activeSource("src/app/[locale]/login/page.tsx");
    expect(src).toMatch(/\bredirect\(/);
    expect(src).not.toMatch(/AuthExperienceShell/);
    expect(src).not.toMatch(/visualMode/);
  });

  it("Horizon renders only when the mode asks for it", () => {
    const src = activeSource(AUTH_SHELL);
    // The layer is conditional on the resolved boolean, never unconditional.
    expect(src).toMatch(/horizon\s*\?\s*\(/);
    expect(src).toMatch(/className="hermes-horizon"/);
  });
});

describe("104-D2 Login — the Horizon layer obeys its own policy", () => {
  it("is declared and consumes the atmosphere-only tokens, not raw colours", () => {
    const decls = ruleDecls(".hermes-horizon");
    expect(decls.length, ".hermes-horizon is not declared").toBeGreaterThan(0);
    const used = varsUsedBy(".hermes-horizon");
    expect(used).toContain("--color-horizon-ember-fade");
    expect(used).toContain("--color-horizon-ember-core");
    for (const d of decls) {
      expect(d.value, `${d.prop} hard-codes a colour`).not.toMatch(
        /#[0-9a-f]{3,8}\b|rgba?\(|hsla?\(/i,
      );
    }
  });

  it("keeps the warm ember band within the machine-source cap", () => {
    // Recomputed from the gradient's first ember stop against
    // HORIZON.emberBandMaxHeightRatio — never read from prose.
    const bg = ruleDecls(".hermes-horizon").find((d) => d.prop === "background");
    expect(bg, "no background layer").toBeTruthy();
    const linear = bg!.value.match(/linear-gradient\((?:[^()]|\([^()]*\))*\)/)?.[0];
    expect(linear, "no linear ember gradient").toBeTruthy();
    // The warm band begins where the gradient STOPS being transparent, not at
    // the ember stop itself: everything after the last transparent stop is
    // already warming. Measuring from the ember stop would understate the band
    // and would not notice a widened transition.
    const transparentStops = [...linear!.matchAll(/transparent\s+(\d+(?:\.\d+)?)%/g)].map(
      (m) => Number(m[1]),
    );
    expect(transparentStops.length, "no transparent stop to measure from").toBeGreaterThan(0);
    const bandStart = Math.max(...transparentStops);
    // …and an ember stop must actually exist inside that band.
    const emberStart = linear!.match(
      /var\(--color-horizon-ember-fade\)\s+(\d+(?:\.\d+)?)%/,
    );
    expect(emberStart, "the ember band has no explicit ember stop").toBeTruthy();
    expect(Number(emberStart![1])).toBeGreaterThan(bandStart);
    const bandRatio = (100 - bandStart) / 100;
    expect(bandRatio).toBeLessThanOrEqual(HORIZON.emberBandMaxHeightRatio);
    expect(bandRatio).toBeGreaterThan(0);
  });

  it("carries the mandatory vignette", () => {
    expect(HORIZON.vignetteRequired).toBe(true);
    const bg = ruleDecls(".hermes-horizon").find((d) => d.prop === "background");
    expect(bg!.value, "no vignette layer").toMatch(/radial-gradient\(/);
  });

  it("is atmosphere only — inert, behind content, hidden from assistive tech", () => {
    const decls = ruleDecls(".hermes-horizon");
    const prop = (p: string) => decls.filter((d) => d.prop === p).map((d) => d.value);
    expect(prop("position")).toEqual(["absolute"]);
    expect(prop("pointer-events")).toEqual(["none"]);
    const shell = activeSource(AUTH_SHELL);
    // `[\s\S]` rather than the `s` flag: the repo targets ES2017.
    expect(shell).toMatch(/aria-hidden="true"[\s\S]*?className="hermes-horizon"/);
  });

  it("EVERY Horizon foreground zone is protected by a Glass tier", () => {
    // The signature contract says no text or control sits directly on Horizon —
    // content sits on a Glass tier composited over it. An earlier revision put
    // only <main> on Glass and left the capability aside, the brand link, the
    // footer and the trust line directly over the atmosphere. Finding one
    // `ds-glass-elevated` string in the file did not prove the rule held, so
    // each zone is now identified and checked individually.
    const shell = activeSource(AUTH_SHELL);
    const REQUIRED_ZONES = ["aside", "brand", "form", "footer", "trust"] as const;

    for (const zone of REQUIRED_ZONES) {
      const marker = `data-horizon-zone={horizon ? "${zone}" : undefined}`;
      expect(shell, `zone "${zone}" is not declared`).toContain(marker);

      // The zone's element must carry a contract-owned Glass tier in the
      // horizon branch. The window is bounded by the NEXT zone marker — a
      // fixed-width slice bled into the following zone and let a missing tier
      // pass because its neighbour had one.
      const at = shell.indexOf(marker);
      const rest = shell.slice(at + marker.length);
      const nextZone = rest.indexOf("data-horizon-zone");
      const element = rest.slice(0, nextZone === -1 ? 700 : Math.min(nextZone, 700));
      expect(
        /ds-glass-(soft|card|interactive|elevated|hero)/.test(element),
        `zone "${zone}" has no Glass tier over the atmosphere`,
      ).toBe(true);
    }
    // No zone may be left unaccounted for: the marker count must match.
    const declared = [...shell.matchAll(/data-horizon-zone=\{horizon \? "(\w+)"/g)].map(
      (m) => m[1],
    );
    expect(declared.slice().sort()).toEqual(REQUIRED_ZONES.slice().sort());
  });

  it("the Glass tiers used by those zones are all contract-owned", () => {
    const shell = activeSource(AUTH_SHELL);
    const tiers = new Set(
      [...shell.matchAll(/ds-glass-(soft|card|interactive|elevated|hero)/g)].map((m) => m[1]),
    );
    expect(tiers.size).toBeGreaterThan(0);
    const owned = Object.keys(GLASS_VARIABLE_CONTRACT);
    for (const tier of tiers) {
      expect(
        owned.some((v) => v.startsWith(`--glass-${tier}-`)),
        `.ds-glass-${tier} is not backed by the Glass contract`,
      ).toBe(true);
    }
  });

  it("standard mode keeps its original, non-Glass rendering", () => {
    const shell = activeSource(AUTH_SHELL);
    // Every zone's Glass is inside a `horizon ?` / `horizon &&` branch, so the
    // five other auth routes are untouched by this increment.
    for (const marker of ['horizon ? "ds-glass-elevated"', 'horizon && "ds-glass-soft']) {
      expect(shell).toContain(marker.slice(0, 12));
    }
    expect(shell).toMatch(/horizon\s*\?\s*"ds-glass-soft"\s*:\s*"border-e/);
    expect(shell).toMatch(/:\s*"border border-border-default bg-surface-elevated shadow-e3"/);
  });

  it("the login content sits on a CONTRACT-OWNED Glass tier", () => {
    const shell = activeSource(AUTH_SHELL);
    expect(shell).toMatch(/ds-glass-elevated/);
    // …and that tier's variables really are owned by the Glass contract.
    for (const v of [
      "--glass-elevated-fill-from",
      "--glass-elevated-border",
      "--glass-elevated-inner",
    ]) {
      expect(Object.keys(GLASS_VARIABLE_CONTRACT), `${v} unowned`).toContain(v);
    }
  });
});

describe("104-D2 — Horizon never reaches the Dashboard", () => {
  it("no dashboard surface requests the Horizon layer", () => {
    for (const rel of [DASHBOARD_ROUTE, DASHBOARD_SURFACE, TRIAD_GROUP]) {
      const src = activeSource(rel);
      expect(src, `${rel} references Horizon`).not.toMatch(/hermes-horizon/);
      expect(src, `${rel} requests horizon mode`).not.toMatch(/visualMode/);
      expect(src, `${rel} uses a horizon token`).not.toMatch(/--color-horizon-/);
    }
  });

  it("Login is a PERMITTED Horizon surface and the dense ones stay forbidden", () => {
    // Horizon is machine-forbidden behind dense engineering data. This pilot
    // must not have relaxed that list to make a surface eligible, and the
    // surface it did light up must be one the machine source already permits.
    expect(HORIZON_PERMITTED_SURFACES).toContain("login");
    for (const dense of [
      "command-center",
      "industrial-brain",
      "live-operations",
      "reports",
      "alarm-center",
    ]) {
      expect(HORIZON_FORBIDDEN_SURFACES, `${dense} left the forbidden list`).toContain(
        dense,
      );
      expect(HORIZON_PERMITTED_SURFACES, `${dense} became permitted`).not.toContain(
        dense,
      );
    }
  });

  it("only ONE product component may render the Horizon layer", () => {
    // A second call site would be a second atmosphere surface, which is the
    // failure mode the permitted/forbidden lists exist to prevent.
    //
    // The scan covers every shipped source extension and every realistic way a
    // class reaches the DOM. An earlier revision matched only the exact
    // double-quoted `className="hermes-horizon"` in `.ts`/`.tsx`, so a `.jsx`
    // file, a single-quoted string, a template literal or a `cn(...)` call
    // would all have slipped past it. Comments are stripped first, so a
    // mention in prose can never register as a consumer.
    expect(horizonConsumers()).toEqual([AUTH_SHELL]);
  });

  it("the Horizon scanner sees every way the class can reach the DOM", () => {
    // Proves the detector itself, on synthetic sources — no files are written.
    for (const shape of [
      'className="hermes-horizon"',
      "className='hermes-horizon'",
      "className={`hermes-horizon ${x}`}",
      'className={cn("hermes-horizon", x)}',
      "className={cn('hermes-horizon')}",
      '<div data-hermes-signature="horizon" />',
    ]) {
      expect(detectsHorizon(shape), `missed: ${shape}`).toBe(true);
    }
    // …and does not fire on prose or on an unrelated class.
    expect(detectsHorizon("// the hermes-horizon layer is login-only")).toBe(false);
    expect(detectsHorizon("/* className=\"hermes-horizon\" */")).toBe(false);
    expect(detectsHorizon('className="hermes-triad-group"')).toBe(false);
  });

  it("the scanner covers every shipped source extension", () => {
    for (const ext of SOURCE_EXTENSIONS) {
      expect(SOURCE_RE.test(`Surface.${ext}`), `.${ext} not scanned`).toBe(true);
      expect(TEST_RE.test(`Surface.test.${ext}`), `.test.${ext} not excluded`).toBe(true);
    }
    expect(SOURCE_EXTENSIONS).toEqual(["tsx", "ts", "jsx", "js", "mjs", "cjs"]);
  });
});

// ───────────────────────────────────────────────────────────────────────────
describe("104-D2 Dashboard — the Triad is real, and exactly three", () => {
  it("the intent union has exactly three members, in decision order", () => {
    expect(TRIAD_INTENTS).toEqual(["operate", "understand", "act"]);
    expect(TRIAD_INTENTS).toHaveLength(3);
  });

  it("renders each intent as a labelled region with a non-colour channel", async () => {
    const { container, unmount } = await mount(
      <div className="hermes-triad" data-hermes-signature="triad">
        {TRIAD_INTENTS.map((intent) => (
          <TriadGroup key={intent} intent={intent} title={`title-${intent}`}>
            <p>content-{intent}</p>
          </TriadGroup>
        ))}
      </div>,
    );
    const groups = container.querySelectorAll('[data-hermes-signature="triad-group"]');
    expect(groups).toHaveLength(3);
    expect(
      Array.from(groups).map((g) => g.getAttribute("data-triad-intent")),
    ).toEqual(["operate", "understand", "act"]);
    for (const g of Array.from(groups)) {
      // Each intent is a real landmark with a heading, not a bare div.
      expect(g.tagName).toBe("SECTION");
      const labelledBy = g.getAttribute("aria-labelledby");
      expect(labelledBy).toBeTruthy();
      expect(container.querySelector(`#${labelledBy}`)?.tagName).toBe("H2");
    }
    await unmount();
  });

  it("the Beacon is at most one group and always carries a textual partner", async () => {
    const { container, unmount } = await mount(
      <div className="hermes-triad">
        <TriadGroup intent="operate" title="t-operate" beacon note="needs-attention">
          <p>a</p>
        </TriadGroup>
        <TriadGroup intent="understand" title="t-understand">
          <p>b</p>
        </TriadGroup>
        <TriadGroup intent="act" title="t-act">
          <p>c</p>
        </TriadGroup>
      </div>,
    );
    const beacons = container.querySelectorAll('[data-beacon="true"]');
    expect(beacons).toHaveLength(1);
    // Colour is never the only channel: the beaconed group must render words.
    expect(beacons[0].textContent).toContain("needs-attention");
    await unmount();
  });

  it("the Dashboard composition renders exactly the three intents, no fourth", () => {
    const src = activeSource(DASHBOARD_SURFACE);
    const intents = [...src.matchAll(/intent="(\w+)"/g)].map((m) => m[1]);
    expect(intents).toEqual(["operate", "understand", "act"]);
    expect(src).toMatch(/className="hermes-triad"/);
  });

  it("each intent is wired to content that already existed on the Dashboard", () => {
    const src = activeSource(DASHBOARD_SURFACE);
    // operate → the attention panel; understand → risk/evidence; act → safe
    // actions. If a group were decorative, its real child would be missing.
    const group = (intent: string): string => {
      const i = src.indexOf(`intent="${intent}"`);
      expect(i, `intent ${intent} not found`).toBeGreaterThan(-1);
      const next = src.slice(i + 1).search(/intent="\w+"/);
      return src.slice(i, next === -1 ? undefined : i + 1 + next);
    };
    expect(group("operate")).toMatch(/<AttentionPanel\b/);
    expect(group("understand")).toMatch(/<RiskEvidence\b/);
    expect(group("act")).toMatch(/<SafeActionGrid\b/);
  });

  it("no acknowledge or other invented capability was added", () => {
    for (const rel of CHANGED_SCOPE) {
      const src = activeSource(rel);
      expect(src, `${rel} introduces an acknowledge control`).not.toMatch(
        /\backnowledg/i,
      );
      expect(src, `${rel} adds a mutation`).not.toMatch(/\b(fetch|useMutation)\s*\(/);
    }
  });
});

describe("104-D2 Dashboard — the Triad CSS consumes the contract", () => {
  it("the grid and group rules reference only owned variables", () => {
    const used = [...varsUsedBy(".hermes-triad"), ...varsUsedBy(".hermes-triad-group")];
    expect(used.length).toBeGreaterThan(0);
    expect(used).toContain("--triad-gap");
    expect(used).toContain("--triad-radius");
    const unknown = used.filter((v) => !CONTRACT_VARS.has(v));
    expect(unknown, "Triad CSS references unowned variables").toEqual([]);
  });

  it("the Triad group carries no glow, blur or shadow recipe", () => {
    for (const sel of [".hermes-triad", ".hermes-triad-group", '.hermes-triad-group[data-beacon="true"]']) {
      for (const d of ruleDecls(sel)) {
        expect(`${d.prop}: ${d.value}`.toLowerCase()).not.toMatch(
          /box-shadow|filter|text-shadow|glow|blur/,
        );
        expect(d.value).not.toMatch(/#[0-9a-f]{3,8}\b|rgba?\(/i);
      }
    }
  });

  it("nested Triad content follows the GROUP's width, not the viewport", () => {
    // The failure this pins: the outer Triad goes three-up at a 768px viewport,
    // so each group is ~192px inside — but a nested `sm:grid-cols-2` still saw
    // the 768px viewport and split that into ~90px tracks. At desktop,
    // `xl:grid-cols-4` produced ~80px action tracks inside one third of the
    // container. The group is now a query container and the nested grids opt
    // into a container-driven layout.
    expect(ruleDecls(".hermes-triad-group").map((d) => `${d.prop}: ${d.value}`)).toContain(
      "container-type: inline-size",
    );

    const cq = ruleDecls(".hermes-cq-grid").map((d) => `${d.prop}: ${d.value}`);
    expect(cq, ".hermes-cq-grid is not declared").toContain("display: grid");
    // Single column by default — that is what a ~185px group must render.
    expect(cq).toContain("grid-template-columns: 1fr");

    // Two columns only once the CONTAINER is wide enough, and never four.
    let twoUp: string | null = null;
    let fourUp = false;
    root.walkAtRules("container", (at) => {
      at.walkRules((rule) => {
        if (rule.selector.trim() !== ".hermes-cq-grid") return;
        rule.walkDecls((d) => {
          if (/repeat\(2,/.test(d.value)) twoUp = at.params;
          if (/repeat\([34],/.test(d.value)) fourUp = true;
        });
      });
    });
    expect(twoUp, "no container query promotes the grid to two columns").toBeTruthy();
    expect(fourUp, "the container variant must never reach three or four columns").toBe(false);

    // The threshold must sit between the two acceptance widths: single column
    // at ~185px, two usable columns at ~350px.
    const rem = Number(String(twoUp).match(/(\d+(?:\.\d+)?)rem/)?.[1]);
    expect(Number.isFinite(rem), `unparseable container query: ${twoUp}`).toBe(true);
    const px = rem * 16;
    expect(px).toBeGreaterThan(185);
    expect(px).toBeLessThanOrEqual(350);
  });

  it("the Triad opts its nested grids in explicitly — no descendant override", () => {
    const surface = activeSource(DASHBOARD_SURFACE);
    expect(surface).toMatch(/<RiskEvidence[\s\S]*?layout="container"/);
    expect(surface).toMatch(/<SafeActionGrid[^>]*layout="container"/);

    // The primitives must DEFAULT to the viewport layout, or the six other
    // command surfaces that consume them would change silently.
    const grid = activeSource("src/components/dashboard-experience/SafeActionGrid.tsx");
    expect(grid).toMatch(/layout\s*=\s*"viewport"/);
    expect(grid).toMatch(/xl:grid-cols-4/); // still available to non-Triad consumers
    const risk = activeSource("src/components/dashboard-experience/RiskEvidence.tsx");
    expect(risk).toMatch(/layout\s*\?\?\s*"viewport"/);

    // And the container branch must not carry viewport breakpoints at all.
    for (const src of [grid, risk]) {
      const cq = src.match(/hermes-cq-grid[^"]*/)?.[0] ?? "";
      expect(cq).not.toMatch(/\b(sm|md|lg|xl|2xl):/);
    }
  });

  it("stacks on one column below the breakpoint and to three above it", () => {
    expect(ruleDecls(".hermes-triad").map((d) => `${d.prop}: ${d.value}`)).toContain(
      "grid-template-columns: 1fr",
    );
    let threeUp = false;
    root.walkAtRules("media", (at) => {
      at.walkRules((rule) => {
        if (rule.selector.trim() !== ".hermes-triad") return;
        rule.walkDecls((d) => {
          if (/repeat\(3,/.test(d.value)) threeUp = true;
        });
      });
    });
    expect(threeUp, "the Triad never becomes three columns").toBe(true);
  });
});

// ───────────────────────────────────────────────────────────────────────────
describe("104-D2 — scope hygiene in the changed product components", () => {
  it.each(CHANGED_SCOPE)("%s copies no Phase 104 colour literal", (rel) => {
    const src = repo(rel);
    const copied = PHASE104_TOKEN_CONTRACT.map((t) => t.value)
      .concat(Object.values(GLASS_VARIABLE_CONTRACT))
      .filter((v) => new RegExp(v.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i").test(src));
    expect(copied).toEqual([]);
  });

  it.each(CHANGED_SCOPE)("%s introduces no legacy glow or scanline utility", (rel) => {
    const src = repo(rel);
    for (const legacy of [
      "glow-signal-strong",
      "glow-signal",
      "glow-ice",
      "glow-danger",
      "text-glow-ice",
      "text-glow",
      "landing-scanlines",
    ]) {
      expect(new RegExp(`\\b${legacy}\\b`).test(src), `${rel} uses ${legacy}`).toBe(false);
    }
    expect(src, `${rel} adds a raw shadow recipe`).not.toMatch(/shadow-\[|boxShadow\s*:/);
  });
});

describe("104-D2 — route inventory records exactly the two pilot routes", () => {
  it("Login and Workspace Home are MIGRATED_DIRECTLY and nothing else is", async () => {
    const inv = await import(
      "../../../../scripts/design/phase104-route-inventory.mjs"
    );
    const built = inv.buildInventory();
    const migrated = built.routes
      .filter((r: { status: string | null }) => r.status === "MIGRATED_DIRECTLY")
      .map((r: { route: string }) => r.route)
      .sort();
    expect(migrated).toEqual(["/auth/login", "/dashboard"]);
    expect(built.unclassified).toEqual([]);
  });

  it("the /login redirect is not counted as a migrated visual route", async () => {
    const inv = await import(
      "../../../../scripts/design/phase104-route-inventory.mjs"
    );
    expect(inv.classify("/login")?.status).toBe("COVERED_BY_SHARED_TEMPLATE");
    // …and the dashboard subtree did not inherit the pilot's status.
    expect(inv.classify("/dashboard/assets")?.status).toBe("COVERED_BY_SHARED_LAYOUT");
  });

  it("both pilot rules are EXACT — no child inherits MIGRATED_DIRECTLY", async () => {
    const inv = await import(
      "../../../../scripts/design/phase104-route-inventory.mjs"
    );
    expect(inv.classify("/auth/login")?.status).toBe("MIGRATED_DIRECTLY");
    expect(inv.classify("/dashboard")?.status).toBe("MIGRATED_DIRECTLY");

    // A hypothetical child must fall through to the general auth template rule
    // rather than inheriting a redesign it never received.
    const child = inv.classify("/auth/login/example");
    expect(child?.status).not.toBe("MIGRATED_DIRECTLY");
    expect(child?.status).toBe("COVERED_BY_SHARED_TEMPLATE");
    expect(child?.family).toBe("authentication");
    expect(inv.classify("/dashboard/anything")?.status).toBe("COVERED_BY_SHARED_LAYOUT");

    // The rules themselves must declare `exact`, not merely happen to work.
    for (const prefix of ["/auth/login", "/dashboard"]) {
      const rule = inv.ROUTE_RULES.find(
        (r: { prefix: string; status: string; exact?: boolean }) =>
          r.prefix === prefix && r.status === "MIGRATED_DIRECTLY",
      );
      expect(rule, `${prefix} has no MIGRATED_DIRECTLY rule`).toBeTruthy();
      expect(rule?.exact, `${prefix} is not an exact rule`).toBe(true);
    }
  });

  it("the totals stay derived and nothing is unclassified", async () => {
    const inv = await import(
      "../../../../scripts/design/phase104-route-inventory.mjs"
    );
    const built = inv.buildInventory();
    expect(built.total).toBe(inv.deriveRoutes().length);
    expect(built.covered).toBe(built.total);
    expect(built.unclassified).toEqual([]);
    expect(built.byStatus.MIGRATED_DIRECTLY).toBe(2);
  });
});
