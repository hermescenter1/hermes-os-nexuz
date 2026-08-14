import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * PHASE 104 — assurance-workflow path-filter contract.
 *
 * A path-filtered workflow is only as good as its filter. The Phase 104 gate
 * guards a design language that increments 104-D through 104-I will express in
 * shared components, route layouts and locale catalogues — none of which the
 * original filter covered. A filter narrow enough to miss that work lets the
 * very changes this workflow exists to guard bypass it entirely, and it does so
 * SILENTLY: the workflow does not fail, it simply never runs.
 *
 * So this suite asserts the filter from the outside, using representative real
 * files: files that MUST trigger the workflow, and files that must NOT (or the
 * gate becomes noise on every unrelated backend PR and gets ignored).
 */

const WORKFLOW = ".github/workflows/phase104-design-assurance.yml";
const yaml = readFileSync(resolve(process.cwd(), WORKFLOW), "utf8");

/** The `paths:` block of the pull_request trigger, as a list of patterns. */
function pullRequestPaths(source: string): string[] {
  const start = source.indexOf("    paths:");
  expect(start, "no paths: block in the workflow").toBeGreaterThan(-1);
  const rest = source.slice(start);
  const patterns: string[] = [];
  for (const line of rest.split("\n").slice(1)) {
    const m = line.match(/^\s{6}-\s+"(.+)"\s*$/);
    if (m) {
      patterns.push(m[1]);
      continue;
    }
    // Comments and blank lines are part of the block; anything else ends it.
    if (/^\s*#/.test(line) || line.trim() === "") continue;
    break;
  }
  return patterns;
}

/**
 * GitHub Actions path-filter glob → RegExp.
 * `**` matches any characters including `/`; `*` matches any character except `/`.
 */
function globToRegExp(glob: string): RegExp {
  // A plain ASCII sentinel, not a control character: an earlier revision used a
  // literal NUL here, which worked but made git treat this file as BINARY —
  // no reviewable diff on a test that exists to be reviewed.
  const DOUBLE = "__GLOBSTAR__";
  const escaped = glob
    .replace(/\*\*/g, DOUBLE)
    .replace(/[.+^${}()|[\]\\]/g, "\\$&")
    .replace(/\?/g, "[^/]")
    .replace(/\*/g, "[^/]*")
    .split(DOUBLE)
    .join(".*");
  return new RegExp(`^${escaped}$`);
}

const PATTERNS = pullRequestPaths(yaml);
const matchers = PATTERNS.map(globToRegExp);
const isCovered = (file: string): boolean => matchers.some((re) => re.test(file));

/** Files a Phase 104 increment will realistically touch. All must trigger. */
const MUST_TRIGGER: ReadonlyArray<readonly [string, string]> = [
  ["tools/figma/hermes-phase104-visual-system/src/lib/dna-tokens.js", "Figma executor / machine source"],
  ["docs/design/phase-104/03-route-coverage.md", "Phase 104 design documentation"],
  ["src/components/ds/phase104-signature-contract.ts", "Phase 104 contract"],
  ["src/components/ds/__tests__/phase104-token-contract.test.ts", "Phase 104 contract test"],
  ["scripts/design/phase104-route-inventory.mjs", "route inventory tool"],
  ["scripts/__tests__/phase104-route-coverage.test.ts", "route coverage gate"],
  ["scripts/__tests__/phase104-workflow-contract.test.ts", "this workflow contract"],
  ["src/app/globals.css", "global CSS"],
  ["tailwind.config.ts", "Tailwind config"],
  // 104-D..I forward coverage — the whole reason the filter was widened.
  ["src/components/app-shell/AppShell.tsx", "shared shell component (104-D)"],
  ["src/components/hermes/CommandRibbon.tsx", "command surface (104-D)"],
  ["src/components/dashboard-experience/DashboardSection.tsx", "dashboard experience (104-D)"],
  ["src/components/operations/AlertCommandClient.tsx", "Alarm Center client (104-E)"],
  ["src/app/[locale]/dashboard/page.tsx", "route page"],
  ["src/app/[locale]/layout.tsx", "route layout"],
  ["src/app/[locale]/dashboard/operations/alerts/page.tsx", "Alarm Center route"],
  ["src/app/[locale]/error.tsx", "error surface"],
  ["src/app/[locale]/not-found.tsx", "not-found surface"],
  ["src/app/[locale]/x/template.tsx", "template surface"],
  ["src/app/[locale]/x/loading.tsx", "loading surface"],
  ["messages/fa.json", "locale catalogue (real location: repo root)"],
  ["messages/de.json", "locale catalogue"],
  ["src/i18n/locales.ts", "locale/direction configuration"],
  [".gitattributes", "determinism pin"],
  [".github/workflows/phase104-design-assurance.yml", "the workflow itself"],
];

/** Files that must NOT trigger, or the gate becomes noise and gets ignored. */
const MUST_NOT_TRIGGER: ReadonlyArray<readonly [string, string]> = [
  ["prisma/schema.prisma", "database schema"],
  ["prisma/migrations/20240101_init/migration.sql", "migration"],
  ["src/lib/auth/session.ts", "authentication"],
  ["src/app/api/operations/alerts/route.ts", "API route handler"],
  ["src/lib/billing-governance/runtime/refund-service.ts", "billing"],
  ["docs/security/phase99-findings.json", "unrelated documentation"],
  ["ops/openbao/policy/app.hcl", "operational secrets policy"],
  ["deploy/docker-compose.prod.yml", "deployment"],
  ["README.md", "repository readme"],
];

describe("Phase 104 workflow — the path filter is parseable and non-trivial", () => {
  it("declares a pull_request paths filter with a real pattern list", () => {
    expect(PATTERNS.length).toBeGreaterThanOrEqual(20);
    expect(new Set(PATTERNS).size, "duplicate pattern").toBe(PATTERNS.length);
  });

  it("keeps the repository's workflow conventions", () => {
    expect(yaml).toContain("permissions:\n  contents: read");
    expect(yaml).toContain("cancel-in-progress: true");
    expect(yaml).toContain("workflow_dispatch:");
    // SHA-pinned actions, per repository policy.
    for (const m of yaml.matchAll(/uses:\s+(\S+)/g)) {
      expect(m[1], `action ${m[1]} is not SHA-pinned`).toMatch(/@[0-9a-f]{40}$/);
    }
  });

  it("runs every Phase 104 gate as an actual step", () => {
    // Deliberately matched against `run:` lines only. A plain `toContain` over
    // the whole file would be satisfied by the path-filter entry of the very
    // same filename — a gate that passes because the file is *mentioned* rather
    // than executed. That is the identical failure mode review found in the
    // Glass contract, and it is not repeated here.
    const runLines = [...yaml.matchAll(/^\s*run:\s*(.+)$/gm)]
      .map((m) => m[1])
      .concat(
        // Multi-line `run: |` blocks: keep their body lines too.
        yaml
          .split("\n")
          .filter((l) => /^\s{8,}\S/.test(l) && !/^\s*-\s+"/.test(l)),
      )
      .join("\n");

    for (const cmd of [
      "scripts/audit-contrast.mjs",
      "phase104-token-contract.test.ts",
      "phase104-signature-contract.test.ts",
      "phase104-route-coverage.test.ts",
      "phase104-route-inventory.mjs --check",
      "phase104-workflow-contract.test.ts",
    ]) {
      expect(runLines, `workflow does not RUN ${cmd}`).toContain(cmd);
    }
    // The dependency-free job must still run the executor package suite.
    expect(runLines).toContain("npm test");
  });
});

describe("Phase 104 workflow — forward coverage for 104-D..I", () => {
  it.each(MUST_TRIGGER.map(([f, why]) => [why, f] as const))(
    "%s → %s triggers the workflow",
    (_why, file) => {
      expect(isCovered(file)).toBe(true);
    },
  );
});

describe("Phase 104 workflow — stays focused enough to avoid CI noise", () => {
  it.each(MUST_NOT_TRIGGER.map(([f, why]) => [why, f] as const))(
    "%s → %s does NOT trigger the workflow",
    (_why, file) => {
      expect(isCovered(file)).toBe(false);
    },
  );
});

describe("Phase 104 workflow — every route extension deriveRoutes() accepts is covered", () => {
  /**
   * The route inventory walks `src/app` for `page.(tsx|ts|jsx|js)`. If the
   * workflow filter listed only `.tsx`, a future `page.ts` would be inventoried
   * as a real route while bypassing the coverage gate — and it would do so
   * silently, because a filter that does not match does not fail, it simply
   * never runs. Every file in the tree is `.tsx` today, so this guards a LATENT
   * gap rather than a live one.
   *
   * The extension list is read from `phase104-route-inventory.mjs` itself, so
   * adding an extension there without widening the filter fails here.
   */
  const inventorySource = readFileSync(
    resolve(process.cwd(), "scripts/design/phase104-route-inventory.mjs"),
    "utf8",
  );

  const ROUTE_EXTENSIONS = (() => {
    const m = inventorySource.match(/\^page\\\.\(([a-z|]+)\)\$/);
    expect(m, "could not read the accepted extensions from deriveRoutes()").toBeTruthy();
    return m![1].split("|");
  })();

  it("reads more than one extension from the inventory (otherwise this proves nothing)", () => {
    expect(ROUTE_EXTENSIONS.length).toBeGreaterThan(1);
    expect(ROUTE_EXTENSIONS).toContain("tsx");
    expect(ROUTE_EXTENSIONS).toContain("ts");
    expect(ROUTE_EXTENSIONS).toContain("jsx");
    expect(ROUTE_EXTENSIONS).toContain("js");
  });

  it.each(ROUTE_EXTENSIONS.map((ext) => [ext] as const))(
    "a page.%s route triggers the workflow",
    (ext) => {
      expect(isCovered(`src/app/[locale]/some/route/page.${ext}`)).toBe(true);
    },
  );

  it.each(
    ["layout", "template", "loading", "error", "not-found"].flatMap((kind) =>
      ROUTE_EXTENSIONS.map((ext) => [kind, ext] as const),
    ),
  )("a %s.%s file triggers the workflow", (kind, ext) => {
    expect(isCovered(`src/app/[locale]/some/route/${kind}.${ext}`)).toBe(true);
  });

  it("dropping one required extension from the filter would be caught", () => {
    const weakened = PATTERNS.filter((p) => p !== "src/app/**/page.ts").map(
      globToRegExp,
    );
    expect(
      weakened.some((re) => re.test("src/app/[locale]/x/page.ts")),
      "removing src/app/**/page.ts must leave a .ts route uncovered",
    ).toBe(false);
  });
});

describe("Phase 104 workflow — the matcher itself is trustworthy", () => {
  it("`**` crosses directory separators and `*` does not", () => {
    expect(globToRegExp("src/**/page.tsx").test("src/app/a/b/page.tsx")).toBe(true);
    expect(globToRegExp("src/*/page.tsx").test("src/app/a/page.tsx")).toBe(false);
    expect(globToRegExp("src/*/page.tsx").test("src/app/page.tsx")).toBe(true);
  });

  it("a bracketed route segment is matched literally, not as a character class", () => {
    // Next.js paths are full of `[locale]`; treating that as a regex class
    // would make the filter silently wrong for every localised route.
    expect(globToRegExp("src/app/**/page.tsx").test("src/app/[locale]/x/page.tsx")).toBe(true);
    expect(globToRegExp("messages/**").test("messages/fa.json")).toBe(true);
  });

  it("removing a required pattern would be caught (the matcher is not vacuous)", () => {
    const weakened = PATTERNS.filter((p) => p !== "messages/**").map(globToRegExp);
    expect(weakened.some((re) => re.test("messages/fa.json"))).toBe(false);
  });
});
