/**
 * PHASE 109-C2.0 — the static safety gate.
 *
 * WHAT IT BANS AND WHY IT IS SCOPED THE WAY IT IS
 * ----------------------------------------------
 * The failure this phase must not drift into is a slow one: a helper here, an
 * import there, and eighteen months later something in this directory can start
 * a process on an engineering workstation. So the gate bans EXECUTION and I/O
 * constructs by syntax — an import of `node:child_process`, a call to `spawn(`,
 * a reference to `ActiveXObject` — and it does so over the module's own code
 * with comments removed.
 *
 * It deliberately does NOT ban the word "Openness". The adapter interface is
 * named for the boundary it will eventually sit behind, and both the interface
 * and its documentation must be free to say so. A gate that forbade the word
 * would force the code to describe itself dishonestly in order to stay green,
 * which is a worse outcome than the one it was guarding against.
 *
 * COMMENTS ARE STRIPPED FIRST. That is what makes the previous paragraph
 * possible: this very file names every banned construct, and the module it
 * scans is free to explain in prose why it does not use them.
 */

import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative, sep } from "node:path";

import { describe, expect, it } from "vitest";

const MODULE_ROOT = join(__dirname, "..");
const REPO_ROOT = join(MODULE_ROOT, "..", "..", "..");

/** Every C2 source file, tests excluded — a test may legitimately name a ban. */
function moduleSources(): string[] {
  const out: string[] = [];
  const walk = (dir: string) => {
    for (const name of readdirSync(dir)) {
      if (name === "__tests__") continue;
      const full = join(dir, name);
      if (statSync(full).isDirectory()) walk(full);
      else if (/\.(ts|tsx)$/.test(name)) out.push(full);
    }
  };
  walk(MODULE_ROOT);
  return out;
}

function stripComments(source: string): string {
  return source.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/[^\n]*/g, "$1");
}

function shortPath(file: string): string {
  return relative(REPO_ROOT, file).split(sep).join("/");
}

const SOURCES = moduleSources().map((file) => ({
  path: shortPath(file),
  code: stripComments(readFileSync(file, "utf8")),
}));

/**
 * Product sources, with the fixture corpus removed.
 *
 * The execution, network and persistence bans apply to the fixtures too — a
 * fixture has no more business spawning a process than a product module does.
 * But the capability assertion cannot: the hostile fixtures exist precisely to
 * contain forged capability declarations, so scanning them for the forgery they
 * are built to carry would turn the corpus into its own violation.
 */
const PRODUCT_SOURCES = SOURCES.filter(
  (source) => !source.path.includes("tia-companion/testing/"),
);

function scan(patterns: readonly RegExp[]): string[] {
  const offenders: string[] = [];
  for (const { path, code } of SOURCES) {
    for (const pattern of patterns) {
      if (pattern.test(code)) offenders.push(`${path}: ${pattern}`);
    }
  }
  return offenders;
}

describe("109-C2.0 · the gate can see the module", () => {
  it("scans every source file and no test file", () => {
    expect(SOURCES.length).toBeGreaterThanOrEqual(8);
    for (const { path } of SOURCES) {
      expect(path).toContain("src/lib/tia-companion/");
      expect(path).not.toContain("__tests__");
    }
  });

  it("would catch a planted violation — the gate is not vacuous", () => {
    // Proves the scanner actually matches, rather than passing because every
    // pattern silently fails to compile against real source.
    const planted = stripComments('const x = 1; // spawn("cmd")\nrequire("child_process");');
    expect(/require\(\s*["'`]child_process/.test(planted)).toBe(true);
    // …and that comment stripping is what lets documentation name the ban.
    expect(/spawn\s*\(/.test(planted)).toBe(false);
  });
});

describe("109-C2.0 · no external process execution", () => {
  it("imports no process-spawning module", () => {
    expect(
      scan([
        /from\s*["'`]node:child_process["'`]/,
        /from\s*["'`]child_process["'`]/,
        /require\(\s*["'`](?:node:)?child_process["'`]/,
        /import\(\s*["'`](?:node:)?child_process["'`]/,
        /from\s*["'`]node:worker_threads["'`]/,
        /from\s*["'`]winax["'`]/,
        /from\s*["'`]node:vm["'`]/,
      ]),
    ).toEqual([]);
  });

  it("calls no process-spawning function", () => {
    expect(
      scan([
        /\bspawn\s*\(/,
        /\bspawnSync\s*\(/,
        /\bexec\s*\(/,
        /\bexecSync\s*\(/,
        /\bexecFile\s*\(/,
        /\bexecFileSync\s*\(/,
        /\bfork\s*\(/,
        /\bActiveXObject\b/,
        /\bwinax\b/,
        /Siemens\.Engineering/,
        /\bpowershell\b/i,
        /\bcmd\.exe\b/i,
        /\.exe\b/,
      ]),
    ).toEqual([]);
  });

  it("evaluates no code at runtime", () => {
    expect(
      scan([/\beval\s*\(/, /new\s+Function\s*\(/, /\bvm\.runIn/, /dangerouslySetInnerHTML/]),
    ).toEqual([]);
  });
});

describe("109-C2.0 · no network surface", () => {
  it("performs no request of any kind", () => {
    expect(
      scan([
        /\bfetch\s*\(/,
        /XMLHttpRequest/,
        /navigator\.sendBeacon/,
        /new\s+WebSocket/,
        /new\s+EventSource/,
        /\baxios\b/,
        /useQuery\s*\(/,
        /useMutation\s*\(/,
        /from\s*["'`]node:(?:http|https|net|dgram|tls)["'`]/,
      ]),
    ).toEqual([]);
  });

  it("names no API route or industrial endpoint", () => {
    expect(scan([/\/api\//, /\/api\/telemetry/, /\/api\/industrial/, /opc\.tcp:/, /mqtt:\/\//])).toEqual(
      [],
    );
  });
});

describe("109-C2.0 · no persistence and no ambient configuration", () => {
  it("writes nothing to a filesystem or a browser store", () => {
    expect(
      scan([
        /from\s*["'`]node:fs["'`]/,
        /from\s*["'`]fs["'`]/,
        /require\(\s*["'`](?:node:)?fs["'`]/,
        /\bwriteFileSync?\s*\(/,
        /\blocalStorage\b/,
        /\bsessionStorage\b/,
        /\bindexedDB\b/,
        /document\.cookie/,
      ]),
    ).toEqual([]);
  });

  it("touches no database client", () => {
    expect(
      scan([/@prisma\/client/, /\bprisma\./, /from\s*["'`]@\/lib\/db["'`]/, /PrismaClient/]),
    ).toEqual([]);
  });

  it("reads no environment, cookie or header — nothing can select a different mode", () => {
    expect(scan([/process\.env/, /\bcookies\s*\(/, /\bheaders\s*\(/, /NEXT_PUBLIC_/])).toEqual([]);
  });

  it("imports exactly one Node built-in, and it is the hash", () => {
    const builtins = new Set<string>();
    for (const { code } of SOURCES) {
      for (const match of code.matchAll(/["'`]node:([a-z_]+)["'`]/g)) builtins.add(match[1]);
    }
    expect([...builtins].sort()).toEqual(["crypto"]);
  });
});

describe("109-C2.0 · the boundary may be NAMED without being reachable", () => {
  it("the adapter interface is allowed to say what it is for", () => {
    // The opposite of the bans above, asserted so a future contributor does not
    // "fix" the gate by deleting the honest name.
    const adapter = SOURCES.find((s) => s.path.endsWith("offline-adapter.ts"));
    expect(adapter).toBeDefined();
    expect((adapter as { code: string }).code).toContain("canInvokeOpenness: false");
  });

  it("every forbidden capability appears in product code only as a literal false", () => {
    const joined = PRODUCT_SOURCES.map((s) => s.code).join("\n");
    for (const key of [
      "canConnectToController",
      "canDownloadToController",
      "canUploadFromController",
      "canWriteTags",
      "canExecuteCompile",
      "canInvokeOpenness",
      "canLaunchExternalProcess",
    ]) {
      expect(joined, key).toContain(`${key}: false`);
      expect(joined, key).not.toContain(`${key}: true`);
    }
  });
});

describe("109-C2.0 · the fixtures stay out of production code paths", () => {
  it("no module outside tests imports the fixture corpus", () => {
    const offenders: string[] = [];
    const walk = (dir: string) => {
      for (const name of readdirSync(dir)) {
        if (name === "node_modules" || name === ".next") continue;
        const full = join(dir, name);
        if (statSync(full).isDirectory()) {
          walk(full);
          continue;
        }
        if (!/\.(ts|tsx)$/.test(name)) continue;
        const rel = shortPath(full);
        // A test may import fixtures; that is what they are for. The fixture
        // module itself is obviously allowed to be itself.
        if (rel.includes("__tests__") || rel.includes("tia-companion/testing/")) continue;
        const code = stripComments(readFileSync(full, "utf8"));
        if (/tia-companion\/testing/.test(code) || /["'`]\.\.?\/testing\/fixtures["'`]/.test(code)) {
          offenders.push(rel);
        }
      }
    };
    walk(join(REPO_ROOT, "src"));
    expect(offenders).toEqual([]);
  });

  it("the public barrel does not re-export them", () => {
    const barrel = readFileSync(join(MODULE_ROOT, "index.ts"), "utf8");
    expect(barrel).not.toContain("./testing");
  });
});
