/**
 * PHASE 109-C1 — invariants the Studio asserts about itself.
 *
 * These are the tests that would fail if someone quietly added a network call,
 * unlocked a live mode, removed the route's protection, hard-coded a string, or
 * made the symbol search rescan the project on every keystroke. Each one is
 * checked against the SOURCE or against measured behaviour, not against a
 * comment claiming it is true.
 */

import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import { isProtectedPath, isAuthorizedForPath, PROTECTED_ROUTE_PREFIXES } from "@/lib/auth/rbac";
import {
  buildSymbolIndex,
  DIAGNOSTIC_CODES,
  querySymbols,
  resolveWorkspaceSource,
  validateProject,
  type AutomationProject,
  type SymbolDefinition,
  type SymbolReference,
} from "..";

const REPO_ROOT = join(__dirname, "..", "..", "..", "..");
const STUDIO_LIB = join(REPO_ROOT, "src", "lib", "automation-studio");
const STUDIO_UI = join(REPO_ROOT, "src", "components", "automation-studio");
const STUDIO_ROUTE = join(REPO_ROOT, "src", "app", "[locale]", "engineering", "studio");

function sourceFiles(dir: string): string[] {
  const out: string[] = [];
  for (const name of readdirSync(dir)) {
    const full = join(dir, name);
    if (statSync(full).isDirectory()) {
      if (name === "__tests__") continue;
      out.push(...sourceFiles(full));
    } else if (/\.(ts|tsx)$/.test(name)) {
      out.push(full);
    }
  }
  return out;
}

const ALL_STUDIO_SOURCES = [
  ...sourceFiles(STUDIO_LIB),
  ...sourceFiles(STUDIO_UI),
  ...sourceFiles(STUDIO_ROUTE),
];

function read(file: string): string {
  return readFileSync(file, "utf8");
}

/** Source with block and line comments removed, so prose cannot trip a scan. */
function stripComments(source: string): string {
  return source.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/[^\n]*/g, "$1");
}

describe("109-C1 · the route is protected by the EXISTING mechanism", () => {
  it("/engineering/studio is a protected path in every active locale", () => {
    for (const locale of ["en", "de", "fa"]) {
      expect(isProtectedPath(`/${locale}/engineering/studio`), locale).toBe(true);
    }
  });

  it("matches the LOCALE-PREFIXED form, which is what middleware sees", () => {
    // next-intl rewrites to a locale-prefixed path before authorization runs,
    // so the bare form is never the one evaluated. Asserting it is protected
    // would assert something the product does not do.
    expect(isProtectedPath("/engineering/studio")).toBe(false);
    expect(isProtectedPath("/en/engineering/studio")).toBe(true);
  });

  it("inherits the engineering role gate rather than inventing one", () => {
    // Signature is (role, pathname) — passing them the other way round silently
    // "passes" for every role, which is exactly what a weak gate test looks like.
    const path = "/en/engineering/studio";
    expect(isAuthorizedForPath(null as never, path)).toBe(false);
    expect(isAuthorizedForPath("viewer" as never, path)).toBe(false);
    expect(isAuthorizedForPath("candidate" as never, path)).toBe(false);
    for (const role of ["engineer", "admin", "superadmin"] as const) {
      expect(isAuthorizedForPath(role as never, path), role).toBe(true);
    }
  });

  it("is covered by the declared engineering prefix", () => {
    expect(PROTECTED_ROUTE_PREFIXES).toContain("engineering");
  });

  it("the page adds no guard, session or role of its own", () => {
    const page = read(join(STUDIO_ROUTE, "page.tsx"));
    const code = stripComments(page);
    for (const forbidden of ["getServerSession", "cookies(", "jwt", "requireOrgActor", "role ="]) {
      expect(code, forbidden).not.toContain(forbidden);
    }
  });
});

describe("109-C1 · the no-network invariant", () => {
  it("no studio source performs a network call", () => {
    const offenders: string[] = [];
    for (const file of ALL_STUDIO_SOURCES) {
      const code = stripComments(read(file));
      for (const pattern of [
        /\bfetch\s*\(/,
        /XMLHttpRequest/,
        /navigator\.sendBeacon/,
        /new\s+WebSocket/,
        /new\s+EventSource/,
        /axios/,
        /useQuery\s*\(/,
        /useMutation\s*\(/,
      ]) {
        if (pattern.test(code)) offenders.push(`${file}: ${pattern}`);
      }
    }
    expect(offenders).toEqual([]);
  });

  it("no studio source persists anything", () => {
    const offenders: string[] = [];
    for (const file of ALL_STUDIO_SOURCES) {
      const code = stripComments(read(file));
      for (const pattern of [/localStorage/, /sessionStorage/, /indexedDB/, /document\.cookie/]) {
        if (pattern.test(code)) offenders.push(`${file}: ${pattern}`);
      }
    }
    expect(offenders).toEqual([]);
  });

  it("no studio source evaluates code or injects HTML", () => {
    const offenders: string[] = [];
    for (const file of ALL_STUDIO_SOURCES) {
      const code = stripComments(read(file));
      for (const pattern of [/dangerouslySetInnerHTML/, /\beval\s*\(/, /new\s+Function\s*\(/, /innerHTML\s*=/]) {
        if (pattern.test(code)) offenders.push(`${file}: ${pattern}`);
      }
    }
    expect(offenders).toEqual([]);
  });

  it("no studio source references an industrial or telemetry endpoint", () => {
    const offenders: string[] = [];
    for (const file of ALL_STUDIO_SOURCES) {
      const code = stripComments(read(file));
      for (const pattern of [/\/api\/telemetry/, /\/api\/industrial/, /\/api\//]) {
        if (pattern.test(code)) offenders.push(`${file}: ${pattern}`);
      }
    }
    expect(offenders).toEqual([]);
  });
});

describe("109-C1 · forbidden live modes", () => {
  it("the resolved source is SIMULATED with no live connection", () => {
    const source = resolveWorkspaceSource();
    expect(source.classification).toBe("SIMULATED");
    expect(source.liveConnection).toBeNull();
  });

  it("the descriptor is frozen — the client cannot mutate it into a live one", () => {
    const source = resolveWorkspaceSource();
    expect(Object.isFrozen(source)).toBe(true);
    expect(() => {
      (source as unknown as { classification: string }).classification = "LIVE";
    }).toThrow();
  });

  it("resolveWorkspaceSource takes no argument that could select a mode", () => {
    expect(resolveWorkspaceSource.length).toBe(0);
  });

  it("no studio source can construct a live origin value", () => {
    const offenders: string[] = [];
    for (const file of ALL_STUDIO_SOURCES) {
      if (file.endsWith("contract.ts")) continue; // where the union is DECLARED
      const code = stripComments(read(file));
      if (/"live-controlled"|'live-controlled'/.test(code) && !file.endsWith("validation.ts")) {
        offenders.push(file);
      }
    }
    expect(offenders).toEqual([]);
  });
});

describe("109-C1 · no hard-coded visible strings in the UI", () => {
  it("every user-facing component resolves its text from the catalogue", () => {
    /*
     * The rule is structural, not a list of filenames.
     *
     * It used to skip `editor-adapter.ts` by name, and adding `focus-target.ts`
     * beside it would have started the kind of exception list that eventually
     * excuses a real offender. What actually matters is whether a file RENDERS:
     * a module with no JSX shows the user nothing, so it has nothing to
     * translate. The companion assertion below closes the loop by requiring
     * that non-rendering files really do contain no JSX.
     */
    const rendersJsx = (code: string) => /<[A-Za-z][^>]*>|<\/[A-Za-z]/.test(code);
    const offenders: string[] = [];
    for (const file of sourceFiles(STUDIO_UI)) {
      const code = read(file);
      if (!rendersJsx(code)) continue;
      if (!code.includes("useTranslations")) offenders.push(`${file}: renders JSX without useTranslations`);
    }
    expect(offenders).toEqual([]);
  });

  it("a module that skips the rule genuinely renders nothing", () => {
    // Without this, "contains no JSX" would be a loophole rather than a reason.
    const rendersJsx = (code: string) => /<[A-Za-z][^>]*>|<\/[A-Za-z]/.test(code);
    const skipped = sourceFiles(STUDIO_UI).filter((f) => !rendersJsx(read(f)));
    expect(skipped.length).toBeGreaterThan(0);
    for (const file of skipped) {
      expect(file.endsWith(".ts"), `${file} is .tsx but renders nothing`).toBe(true);
      expect(read(file)).not.toContain("useTranslations");
    }
  });

  it("no JSX text node is a bare English sentence", () => {
    const offenders: string[] = [];
    // A run of letters and spaces between tags, i.e. `>Some words<`, is text a
    // translator never saw.
    // Trailing punctuation counts: a label ending in a colon is hard-coded
    // text just as much as one without.
    const bare = />[ \t]*[A-Za-z][A-Za-z ]{4,}[ \t]*[.:;!?]?[ \t]*</g;
    for (const file of sourceFiles(STUDIO_UI)) {
      const code = stripComments(read(file));
      for (const match of code.matchAll(bare)) {
        const text = match[0].slice(1, -1).trim();
        if (text.length === 0) continue;
        offenders.push(`${file}: "${text}"`);
      }
    }
    expect(offenders).toEqual([]);
  });
});

describe("109-C1 · search and validation performance", () => {
  /** A synthetic project large enough that an accidental quadratic shows up. */
  function syntheticProject(symbolCount: number, referencesPer: number): AutomationProject {
    const symbols: SymbolDefinition[] = [];
    const references: SymbolReference[] = [];
    for (let i = 0; i < symbolCount; i += 1) {
      const name = `Sym_${String(i).padStart(6, "0")}_Value`;
      symbols.push({
        id: `sym-${i}`,
        name,
        dataType: "Bool",
        scope: "global",
        declaredIn: "blk-synthetic",
        declaredAtLine: i + 1,
        engineeringUnit: null,
        writable: true,
        comment: "",
      });
      for (let r = 0; r < referencesPer; r += 1) {
        references.push({
          symbolName: name,
          artifactId: "blk-synthetic",
          line: i + 1,
          access: "read",
          context: `use of ${name}`,
        });
      }
    }
    return {
      id: "synthetic",
      name: "Synthetic",
      site: "bench",
      target: { id: "t", name: "t", family: "generic-iec-61131", descriptor: "bench" },
      artifacts: [],
      blocks: [],
      symbols,
      references,
      provenance: {
        origin: "simulated",
        producer: "bench",
        recordedAtEpochMs: 0,
        recordedBy: "bench",
        disclosure: "bench",
      },
    };
  }

  it("indexes 50,000 symbols and answers searches well inside the budget", () => {
    const project = syntheticProject(50_000, 1);
    const index = buildSymbolIndex(project);
    expect(index.symbolCount).toBe(50_000);

    // 20 searches; the p95 of those is the reported figure.
    const timings: number[] = [];
    for (let i = 0; i < 20; i += 1) {
      const started = performance.now();
      const results = querySymbols(index, { text: `_${String(i * 137).padStart(6, "0")}_` });
      timings.push(performance.now() - started);
      expect(results.length).toBeLessThanOrEqual(1);
    }
    timings.sort((a, b) => a - b);
    const p95 = timings[Math.floor(timings.length * 0.95) - 1] ?? timings[timings.length - 1];

    // Hardware-dependent, so the budget is generous; what it really catches is
    // an accidental O(n²), which would be seconds rather than milliseconds.
    expect(p95, `p95 was ${p95.toFixed(1)}ms`).toBeLessThan(200);
  });

  it("validates 10,000 references within a documented budget", () => {
    const project = syntheticProject(2_000, 5);
    expect(project.references.length).toBe(10_000);
    const started = performance.now();
    const run = validateProject(project, 0);
    const elapsed = performance.now() - started;
    expect(run.checkedReferences).toBe(10_000);
    expect(elapsed, `validation took ${elapsed.toFixed(1)}ms`).toBeLessThan(2_000);
  });

  it("a search never rebuilds the index", () => {
    // Structural, not timing. A PARTIAL rebuild fits inside any timing budget
    // loose enough not to flake — which is exactly how a rebuild-per-keystroke
    // regression would slip past a stopwatch. So the query path is required not
    // to construct an index, or to re-derive the search keys, at all.
    const source = readFileSync(join(STUDIO_LIB, "symbols.ts"), "utf8");
    const start = source.indexOf("export function querySymbols");
    expect(start).toBeGreaterThan(-1);
    const body = source.slice(start, source.indexOf("\n}", start));
    expect(body, "querySymbols builds an index").not.toMatch(/build[A-Za-z]*Index/);
    expect(body, "querySymbols re-derives the search keys").not.toMatch(/\.map\s*\(/);
  });

  it("a search costs far less than a rebuild", () => {
    const project = syntheticProject(20_000, 1);

    // The budget is DERIVED from this machine rather than guessed: measure what
    // a rebuild actually costs here, then require a search to be a fraction of it.
    const buildStart = performance.now();
    const index = buildSymbolIndex(project);
    const buildCost = performance.now() - buildStart;

    const searchStart = performance.now();
    for (let i = 0; i < 20; i += 1) querySymbols(index, { text: "Sym_010000" });
    const perSearch = (performance.now() - searchStart) / 20;

    expect(
      perSearch,
      `search ${perSearch.toFixed(2)}ms vs build ${buildCost.toFixed(2)}ms`,
    ).toBeLessThan(buildCost / 3);
  });
});

describe("109-C1 · diagnostic codes are a stable contract", () => {
  it("every code follows the AES-C1-NNN shape and is unique", () => {
    const codes = Object.values(DIAGNOSTIC_CODES);
    for (const code of codes) expect(code).toMatch(/^AES-C1-\d{3}$/);
    expect(new Set(codes).size).toBe(codes.length);
  });

  it("the UI does not hard-code any finding code", () => {
    const offenders: string[] = [];
    for (const file of sourceFiles(STUDIO_UI)) {
      if (/AES-C1-\d{3}/.test(stripComments(read(file)))) offenders.push(file);
    }
    expect(offenders).toEqual([]);
  });
});


describe("109-C1 · the adapter identity has exactly one source", () => {
  it("appears as a literal only in the adapter module that owns it", () => {
    // The Round 1.1 defect was a SECOND declaration of the same identity, in the
    // component that displays it, which had drifted to a different value. A DOM
    // test comparing the two is the primary guard; this one closes the door
    // structurally, so a re-introduced duplicate fails at the source rather than
    // waiting for someone to notice the rendered string.
    const owner = join(STUDIO_UI, "editor-adapter.ts");
    const offenders: string[] = [];
    for (const file of ALL_STUDIO_SOURCES) {
      if (file === owner) continue;
      if (/["'`]hermes-plain-source-[a-z]+["'`]/.test(stripComments(read(file)))) {
        offenders.push(file.slice(REPO_ROOT.length + 1));
      }
    }
    expect(offenders, "the adapter identity is declared outside its module").toEqual([]);
  });

  it("is declared once inside that module", () => {
    const code = stripComments(read(join(STUDIO_UI, "editor-adapter.ts")));
    const hits = code.match(/["'`]hermes-plain-source-[a-z]+["'`]/g) ?? [];
    expect(hits.length).toBe(1);
  });

  it("is consumed by reference wherever it is shown", () => {
    const workspace = stripComments(read(join(STUDIO_UI, "StudioWorkspace.tsx")));
    expect(workspace).toContain("FALLBACK_EDITOR_ADAPTER.id");
  });
});


describe("109-C1 R1.4 · the responsive focus targets have one source", () => {
  it("names both responsive symbol-search targets in one place", () => {
    /*
     * Both search inputs exist in the DOM at every width and CSS picks one, so
     * a command that names a single id is wrong at half the viewports. Round
     * 1.3 hard-coded the desktop id and silently focused a display:none input
     * at 320 and 390. The ids are declared once, in focus-target.ts, and the
     * workspace consumes that constant.
     */
    const helper = read(join(STUDIO_UI, "focus-target.ts"));
    expect(helper).toContain("studio-symbol-search");
    expect(helper).toContain("studio-symbol-search-mobile");

    const workspace = stripComments(read(join(STUDIO_UI, "StudioWorkspace.tsx")));
    expect(workspace).toContain("SYMBOL_SEARCH_TARGETS");
    // The command must not re-name either id inline.
    const searchCommand = workspace.slice(
      workspace.indexOf('id: "search-symbols"'),
      workspace.indexOf('id: "show-diagnostics"'),
    );
    expect(searchCommand.length).toBeGreaterThan(0);
    expect(searchCommand).not.toContain('"studio-symbol-search"');
    expect(searchCommand).not.toContain('"studio-symbol-search-mobile"');
  });

  it("focuses through the visibility-aware helper, never getElementById().focus()", () => {
    const workspace = stripComments(read(join(STUDIO_UI, "StudioWorkspace.tsx")));
    expect(workspace).toContain("focusFirstVisible");
    // The naive form is what shipped in Round 1.3 and what must not return.
    expect(workspace).not.toMatch(/document\.getElementById\([^)]*\)\??\.focus\(\)/);
  });

  it("renders each responsive search input exactly once", () => {
    // Two elements with the same id would make "which one is focused"
    // unanswerable, and document.getElementById would pick arbitrarily.
    const workspace = read(join(STUDIO_UI, "StudioWorkspace.tsx"));
    for (const id of ["studio-symbol-search", "studio-symbol-search-mobile"]) {
      const declarations = workspace.match(new RegExp(`id="${id}"`, "g")) ?? [];
      expect(declarations.length, id).toBe(1);
    }
  });
});

describe("109-C1 · the companion view carries no editor", () => {
  /*
   * The authenticated browser matrix found the full editor's textarea in the
   * DOM at 320 and 390. It was display:none, which is hidden, not absent — and
   * a companion view that still contains an editor is not read-only. The
   * branches are now MOUNTED by the measured viewport, so the phone view has
   * no editor to hide.
   */
  it("mounts each responsive branch through the measured viewport, not CSS alone", () => {
    const workspace = stripComments(read(join(STUDIO_UI, "StudioWorkspace.tsx")));
    expect(workspace).toContain("useViewportMode()");
    expect(workspace).toMatch(/rendersCompanion\(viewport\)\s*&&/);
    expect(workspace).toMatch(/rendersWorkspace\(viewport\)\s*&&/);
  });

  it("renders the source editor inside the workspace branch only", () => {
    const workspace = stripComments(read(join(STUDIO_UI, "StudioWorkspace.tsx")));
    const companionStart = workspace.indexOf('data-studio-surface="companion"');
    const workspaceStart = workspace.indexOf('data-studio-surface="workspace"');
    expect(companionStart).toBeGreaterThan(0);
    expect(workspaceStart).toBeGreaterThan(companionStart);
    const companionBranch = workspace.slice(companionStart, workspaceStart);
    expect(companionBranch).not.toContain("<SourceView");
    expect(companionBranch).not.toContain("<textarea");
    // And the editor is not rendered anywhere else either.
    expect(workspace.match(/<SourceView\b/g)?.length).toBe(1);
  });

  it("decides the branch at the same breakpoint the classes use", () => {
    // If the media query and the Tailwind classes ever disagreed, the
    // "unmeasured" render (both branches, CSS deciding) and the measured
    // render (one branch) would show different things at the same width.
    const viewportMode = read(join(STUDIO_UI, "viewport-mode.ts"));
    expect(viewportMode).toContain("WORKSPACE_MIN_WIDTH_PX = 1024");
    const workspace = read(join(STUDIO_UI, "StudioWorkspace.tsx"));
    expect(workspace).toContain('data-studio-surface="companion" className="min-h-0 flex-1 lg:hidden"');
    expect(workspace).toContain('data-studio-surface="workspace" className="hidden min-h-0 flex-1 lg:flex');
  });
});
