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
const WORKFLOW_ABS = resolve(process.cwd(), WORKFLOW);

/**
 * FINDING-109B0-002 — this contract is about the workflow's CONTENT, and a line
 * ending is not content.
 *
 * The committed blob is LF-only. With `core.autocrlf=true` a Windows checkout
 * materialises the identical file with CRLF, and a multi-line literal such as
 * "permissions:\n  contents: read" then does not appear — a red test over a
 * provably correct artifact.
 *
 * So the source is canonicalised for EOL and for EOL alone: every `\r\n`
 * becomes `\n`, and nothing else changes. Indentation, trailing whitespace,
 * ordering, keys, values and every semantic byte survive untouched, which is
 * what keeps this gate able to catch real drift. A lone `\r` is NOT a line
 * ending this repository accepts and is rejected explicitly rather than being
 * folded in silently, and a UTF-8 BOM is rejected the same way.
 */
/** One admissibility problem with the raw bytes of a workflow file. */
export interface WorkflowTextProblem {
  readonly kind: "bom" | "lone-cr";
  readonly index: number;
  readonly line: number;
  readonly detail: string;
}

/** 1-based line number of a character offset, counting LF and lone CR alike. */
function lineOf(source: string, index: number): number {
  let line = 1;
  for (let i = 0; i < index && i < source.length; i += 1) {
    if (source[i] === "\n") line += 1;
    else if (source[i] === "\r" && source[i + 1] !== "\n") line += 1;
  }
  return line;
}

/**
 * Encoding and line-ending admissibility, decided on the RAW text before any
 * canonicalisation.
 *
 * This exists because the canonicalisation is deliberately narrow: it rewrites
 * CRLF to LF and nothing else. Narrow is right — a permissive normaliser would
 * quietly accept files that differ — but on its own it neither rejects a BOM nor
 * rejects a lone CR; it simply leaves them in place, where they would surface
 * later as some unrelated substring assertion failing in a confusing way.
 *
 * Rejected:
 *   - U+FEFF anywhere, which is what a UTF-8 BOM decodes to. A BOM at the start
 *     of a YAML file is not whitespace: the first key becomes "\uFEFFname". One
 *     in the middle is a zero-width no-break space that no editor will show.
 *   - any CR not followed by LF. Classic-Mac endings and half-converted files
 *     both produce these, and YAML would read the whole file as one line.
 *
 * Accepted: pure LF, and well-formed CRLF.
 */
export function workflowTextProblems(source: string): WorkflowTextProblem[] {
  const problems: WorkflowTextProblem[] = [];

  let from = 0;
  for (;;) {
    const at = source.indexOf("\uFEFF", from);
    if (at === -1) break;
    problems.push({
      kind: "bom",
      index: at,
      line: lineOf(source, at),
      detail:
        at === 0
          ? "UTF-8 BOM (U+FEFF) at the start of the file"
          : `U+FEFF at index ${at}`,
    });
    from = at + 1;
  }

  for (const match of source.matchAll(/\r(?!\n)/g)) {
    const at = match.index ?? 0;
    problems.push({
      kind: "lone-cr",
      index: at,
      line: lineOf(source, at),
      detail: `lone CR (not part of CRLF) at index ${at}`,
    });
  }

  return problems.sort((a, b) => a.index - b.index);
}

/** Thrown when the raw text is inadmissible; never thrown for CRLF or LF. */
export class WorkflowTextError extends Error {
  readonly problems: readonly WorkflowTextProblem[];
  constructor(problems: readonly WorkflowTextProblem[]) {
    super(
      `workflow text is not admissible: ` +
        problems.map((p) => `${p.kind} on line ${p.line} — ${p.detail}`).join("; "),
    );
    this.name = "WorkflowTextError";
    this.problems = problems;
  }
}

/**
 * CRLF -> LF, and nothing else, AFTER the text has been judged admissible.
 *
 * The validation is inside this function rather than beside it so that no call
 * site can canonicalise without it. Nothing here rewrites the file on disk: the
 * repository keeps whatever endings the checkout gave it.
 */
export function canonicaliseEol(source: string): string {
  const problems = workflowTextProblems(source);
  if (problems.length > 0) throw new WorkflowTextError(problems);
  return source.replace(/\r\n/g, "\n");
}

const rawSource = readFileSync(WORKFLOW_ABS, "utf8");

// The real file, judged explicitly. On a Windows checkout this text is CRLF and
// on Linux it is LF; both are admissible, and neither is rewritten.
if (workflowTextProblems(rawSource).length > 0) {
  throw new WorkflowTextError(workflowTextProblems(rawSource));
}

const yaml = canonicaliseEol(rawSource);

/**
 * The repository-convention contract, as a pure predicate over a source string
 * so that the SAME rules can be pointed at a deliberately mutated copy. An
 * assertion that only ever sees the correct input proves nothing about what it
 * would reject.
 */
export function conventionViolations(source: string): string[] {
  const v: string[] = [];
  if (!source.includes("permissions:\n  contents: read")) {
    v.push("missing least-privilege `permissions: contents: read`");
  }
  if (!source.includes("cancel-in-progress: true")) v.push("missing cancel-in-progress");
  if (!source.includes("workflow_dispatch:")) v.push("missing workflow_dispatch trigger");
  for (const m of source.matchAll(/uses:\s+(\S+)/g)) {
    if (!/@[0-9a-f]{40}$/.test(m[1])) v.push(`action ${m[1]} is not SHA-pinned`);
  }
  return v;
}

/** Gate commands that must appear on an executed `run:` line, not merely be mentioned. */
export const REQUIRED_GATE_COMMANDS = [
  "scripts/audit-contrast.mjs",
  "phase104-token-contract.test.ts",
  "phase104-signature-contract.test.ts",
  "phase104-route-coverage.test.ts",
  "phase104-route-inventory.mjs --check",
  "phase104-workflow-contract.test.ts",
  "npm test",
] as const;

/** The `run:` surface of a workflow: single-line commands plus `run: |` bodies. */
export function runSurface(source: string): string {
  return [...source.matchAll(/^\s*run:\s*(.+)$/gm)]
    .map((m) => m[1])
    .concat(source.split("\n").filter((l) => /^\s{8,}\S/.test(l) && !/^\s*-\s+"/.test(l)))
    .join("\n");
}

export function missingGateCommands(source: string): string[] {
  const surface = runSurface(source);
  return REQUIRED_GATE_COMMANDS.filter((cmd) => !surface.includes(cmd));
}

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
    expect(conventionViolations(yaml)).toEqual([]);
  });

  it("runs every Phase 104 gate as an actual step", () => {
    // Deliberately matched against `run:` lines only. A plain `toContain` over
    // the whole file would be satisfied by the path-filter entry of the very
    // same filename — a gate that passes because the file is *mentioned* rather
    // than executed. That is the identical failure mode review found in the
    // Glass contract, and it is not repeated here.
    expect(missingGateCommands(yaml)).toEqual([]);
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

/* ── FINDING-109B0-002 · the contract is EOL-canonical, and nothing more ───── */

describe("Phase 104 workflow — line endings are canonicalised, content is not", () => {
  it("1. an LF source satisfies the conventions contract", () => {
    expect(conventionViolations(canonicaliseEol(rawSource.replace(/\r\n/g, "\n")))).toEqual([]);
  });

  it("2. the CRLF-equivalent of the same source satisfies it identically", () => {
    const crlf = rawSource.replace(/\r\n/g, "\n").replace(/\n/g, "\r\n");
    expect(crlf).toContain("\r\n");
    expect(conventionViolations(canonicaliseEol(crlf))).toEqual([]);
    // The two canonical forms are the SAME string, not merely both passing.
    expect(canonicaliseEol(crlf)).toBe(canonicaliseEol(rawSource.replace(/\r\n/g, "\n")));
  });

  it("3. a lone CR is rejected rather than silently folded in", () => {
    const loneCr = "permissions:\r  contents: read\ncancel-in-progress: true\nworkflow_dispatch:\n";
    // Canonicalisation must NOT repair it: only \r\n is a line ending here.
    expect(() => canonicaliseEol(loneCr)).toThrow(WorkflowTextError);
    expect(workflowTextProblems(loneCr).map((p) => p.kind)).toContain("lone-cr");
    // And the real file must contain none.
    expect(/\r(?!\n)/.test(rawSource), "the checked-out workflow contains a lone CR").toBe(false);
  });

  it("9. a UTF-8 BOM is rejected rather than tolerated", () => {
    expect(rawSource.charCodeAt(0), "the workflow starts with a BOM").not.toBe(0xfeff);
    const withBom = "\uFEFF" + rawSource.replace(/\r\n/g, "\n");
    expect(withBom.charCodeAt(0)).toBe(0xfeff);
    // A BOM is content, so canonicalisation leaves it in place for the guard
    // below to see; it is not quietly stripped.
    expect(() => canonicaliseEol(withBom)).toThrow(WorkflowTextError);
    expect(workflowTextProblems(withBom).map((p) => p.kind)).toContain("bom");
  });

  it("canonicalisation removes CR before LF and touches nothing else", () => {
    const crlfCount = (rawSource.match(/\r\n/g) ?? []).length;
    expect(yaml.length).toBe(rawSource.length - crlfCount);
    expect(yaml).not.toContain("\r");
    // Every line, including its trailing whitespace, is byte-identical.
    expect(yaml.split("\n")).toEqual(rawSource.split(/\r?\n/));
  });

  it("8. trailing whitespace is preserved, not normalised away", () => {
    const withTrailing = "a: 1   \nb: 2\n";
    expect(canonicaliseEol(withTrailing.replace(/\n/g, "\r\n"))).toBe(withTrailing);
    expect(canonicaliseEol(withTrailing)).toBe(withTrailing);
    expect(canonicaliseEol("a: 1   \r\n")).toContain("1   ");
  });

  it("indentation is preserved exactly", () => {
    const indented = "jobs:\n  a:\n    runs-on: x\n";
    expect(canonicaliseEol(indented.replace(/\n/g, "\r\n"))).toBe(indented);
  });
});

describe("Phase 104 workflow — the EOL fix did not blunt the gate", () => {
  it("CONTROL 1 — a BOM at the start of the file is rejected", () => {
    const lf = canonicaliseEol(rawSource);
    const problems = workflowTextProblems(`\uFEFF${lf}`);
    expect(problems).toHaveLength(1);
    expect(problems[0]).toMatchObject({ kind: "bom", index: 0, line: 1 });
    expect(() => canonicaliseEol(`\uFEFF${lf}`)).toThrow(WorkflowTextError);
  });

  it("CONTROL 2 — a BOM far from any asserted convention is still rejected", () => {
    const lf = canonicaliseEol(rawSource);
    // Deliberately placed in the LAST line, which no convention assertion reads,
    // so only the encoding check can catch it.
    const cut = lf.lastIndexOf("\n");
    const polluted = `${lf.slice(0, cut)}\uFEFF${lf.slice(cut)}`;
    expect(conventionViolations(polluted), "the convention rules do not see it").toEqual([]);
    expect(missingGateCommands(polluted), "the gate-command rules do not see it").toEqual([]);
    const problems = workflowTextProblems(polluted);
    expect(problems).toHaveLength(1);
    expect(problems[0].kind).toBe("bom");
    expect(problems[0].index).toBeGreaterThan(0);
    expect(() => canonicaliseEol(polluted)).toThrow(WorkflowTextError);
  });

  it("CONTROL 3 — a lone CR inside a convention line is rejected", () => {
    const lf = canonicaliseEol(rawSource);
    const anchor = "permissions:\n  contents: read";
    expect(lf).toContain(anchor);
    const polluted = lf.replace(anchor, "permissions:\r  contents: read");
    const problems = workflowTextProblems(polluted);
    expect(problems).toHaveLength(1);
    expect(problems[0].kind).toBe("lone-cr");
    expect(() => canonicaliseEol(polluted)).toThrow(WorkflowTextError);
  });

  it("CONTROL 4 — a lone CR far from any asserted convention is still rejected", () => {
    const lf = canonicaliseEol(rawSource);
    // On a trailing COMMENT line, so no convention or gate-command rule reads
    // it, and followed by a normal character so it is a lone CR rather than the
    // first half of a CRLF.
    const polluted = `${lf}# trailing\rmarker\n`;
    expect(conventionViolations(polluted), "the convention rules do not see it").toEqual([]);
    expect(missingGateCommands(polluted), "the gate-command rules do not see it").toEqual([]);
    const problems = workflowTextProblems(polluted);
    expect(problems).toHaveLength(1);
    expect(problems[0].kind).toBe("lone-cr");
    expect(() => canonicaliseEol(polluted)).toThrow(WorkflowTextError);
  });

  it("CONTROL 5 — a fully CRLF file canonicalises to the LF blob exactly", () => {
    const lf = canonicaliseEol(rawSource);
    const crlf = lf.replace(/\n/g, "\r\n");
    expect(crlf).not.toBe(lf);
    expect((crlf.match(/\r\n/g) ?? []).length).toBe((lf.match(/\n/g) ?? []).length);
    expect(workflowTextProblems(crlf), "well-formed CRLF is admissible").toEqual([]);
    expect(canonicaliseEol(crlf)).toBe(lf);
  });

  it("CONTROL 6 — a pristine LF file is returned byte-for-byte unchanged", () => {
    const lf = canonicaliseEol(rawSource);
    expect(workflowTextProblems(lf)).toEqual([]);
    expect(canonicaliseEol(lf)).toBe(lf);
    // Byte identity, not merely string equality after some normalisation.
    expect(Buffer.from(canonicaliseEol(lf), "utf8").equals(Buffer.from(lf, "utf8"))).toBe(true);
  });


  it("4. changing one semantic character fails the conventions contract", () => {
    const mutated = yaml.replace("permissions:\n  contents: read", "permissions:\n  contents: write");
    expect(mutated).not.toBe(yaml);
    expect(conventionViolations(mutated)).not.toEqual([]);
  });

  it("5. removing a gate step fails the step contract", () => {
    const mutated = yaml.replace("scripts/audit-contrast.mjs", "scripts/audit-contrast-DISABLED.mjs");
    expect(mutated).not.toBe(yaml);
    expect(missingGateCommands(mutated)).toContain("scripts/audit-contrast.mjs");
  });

  it("6. removing the workflow_dispatch trigger fails", () => {
    const mutated = yaml.replace("workflow_dispatch:", "workflow_dispatchX:");
    expect(conventionViolations(mutated)).toContain("missing workflow_dispatch trigger");
  });

  it("6. removing cancel-in-progress fails", () => {
    const mutated = yaml.replace("cancel-in-progress: true", "cancel-in-progress: false");
    expect(conventionViolations(mutated)).toContain("missing cancel-in-progress");
  });

  it("7. unpinning an action fails", () => {
    const m = yaml.match(/uses:\s+(\S+)@[0-9a-f]{40}/);
    expect(m, "no SHA-pinned action found to mutate").not.toBeNull();
    const mutated = yaml.replace(/@[0-9a-f]{40}/, "@v4");
    expect(conventionViolations(mutated).some((v) => v.includes("not SHA-pinned"))).toBe(true);
  });

  it("10. negative control — an over-permissive normaliser would hide a lone CR", () => {
    // If canonicalisation collapsed ALL whitespace (or repaired lone CRs), a
    // corrupt file would pass. Prove the difference between the two.
    const overPermissive = (s: string) => s.replace(/\r\n?/g, "\n");
    const corrupt = "permissions:\r  contents: read\ncancel-in-progress: true\nworkflow_dispatch:\n";
    // A normaliser that repairs lone CRs makes a corrupt file look conformant.
    expect(conventionViolations(overPermissive(corrupt))).toEqual([]);
    // Ours refuses to canonicalise it at all, and says why.
    expect(workflowTextProblems(corrupt).map((p) => p.kind)).toEqual(["lone-cr"]);
    expect(() => canonicaliseEol(corrupt)).toThrow(WorkflowTextError);
  });

  it("10. negative control — a whitespace-collapsing normaliser would hide indentation drift", () => {
    const collapse = (s: string) => s.replace(/\s+/g, " ");
    const wrongIndent = "permissions:\n        contents: read\ncancel-in-progress: true\nworkflow_dispatch:\n";
    expect(conventionViolations(collapse(wrongIndent).replace(/permissions: contents: read/, "permissions:\n  contents: read"))).toEqual([]);
    expect(conventionViolations(canonicaliseEol(wrongIndent))).not.toEqual([]);
  });
});
