/**
 * PHASE 109-C2.1 — the static safety gate for the ingest module.
 *
 * C2.0's gate asserts that `tia-companion` imports exactly one Node built-in
 * and bans sockets, subprocesses and the filesystem. This module cannot live
 * under those rules — it exists to open a socket and spawn a parser — so it has
 * its own gate with its own scope, and the C2.0 gate is left untouched.
 *
 * The rule that replaces "no subprocess anywhere" is narrower and stricter in
 * the place that matters: EXACTLY TWO FILES may spawn or touch `/proc`, they
 * are the two sidecar entry points, and nothing else in the repository may
 * import them.
 */

import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative, sep } from "node:path";

import { describe, expect, it } from "vitest";

const MODULE_ROOT = join(__dirname, "..");
const REPO_ROOT = join(MODULE_ROOT, "..", "..", "..");
const COMPANION_ROOT = join(MODULE_ROOT, "..", "tia-companion");

function sourcesUnder(root: string): { path: string; code: string }[] {
  const out: { path: string; code: string }[] = [];
  const walk = (dir: string): void => {
    for (const name of readdirSync(dir)) {
      if (name === "__tests__") continue;
      const full = join(dir, name);
      if (statSync(full).isDirectory()) {
        walk(full);
        continue;
      }
      if (!/\.tsx?$/.test(name)) continue;
      out.push({
        path: relative(REPO_ROOT, full).split(sep).join("/"),
        code: stripComments(readFileSync(full, "utf8")),
      });
    }
  };
  walk(root);
  return out;
}

function stripComments(source: string): string {
  return source.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/[^\n]*/g, "$1");
}

const SOURCES = sourcesUnder(MODULE_ROOT);
const SIDECAR = SOURCES.filter((s) => s.path.includes("/sidecar/"));
const NON_SIDECAR = SOURCES.filter((s) => !s.path.includes("/sidecar/"));

function scan(sources: readonly { path: string; code: string }[], patterns: readonly RegExp[]): string[] {
  const offenders: string[] = [];
  for (const { path, code } of sources) {
    for (const pattern of patterns) {
      if (pattern.test(code)) offenders.push(`${path}: ${pattern}`);
    }
  }
  return offenders;
}

describe("109-C2.1 · the gate can see the module and is not vacuous", () => {
  it("scans the module's sources and no test file", () => {
    expect(SOURCES.length).toBeGreaterThanOrEqual(10);
    for (const { path } of SOURCES) {
      expect(path).toContain("src/lib/tia-archive-ingest/");
      expect(path).not.toContain("__tests__");
    }
  });

  it("would catch a planted violation", () => {
    const planted = stripComments('const x = 1; // spawn("cmd")\nrequire("child_process");');
    expect(/require\(\s*["'`]child_process/.test(planted)).toBe(true);
    expect(/\bspawn\s*\(/.test(planted)).toBe(false);
  });
});

describe("109-C2.1 · privilege is confined to the two sidecar entry points", () => {
  it("exactly two sidecar files exist, and they are the expected ones", () => {
    expect(SIDECAR.map((s) => s.path).sort()).toEqual([
      "src/lib/tia-archive-ingest/sidecar/child-entry.ts",
      "src/lib/tia-archive-ingest/sidecar/supervisor-entry.ts",
    ]);
  });

  it("nothing outside the sidecar spawns a process", () => {
    expect(
      scan(NON_SIDECAR, [
        /from\s*["'`]node:child_process["'`]/,
        /require\(\s*["'`](?:node:)?child_process["'`]/,
        /\bspawn\s*\(/,
        /\bspawnSync\s*\(/,
        /\bexecSync\s*\(/,
        /\bexecFile\s*\(/,
        /\bfork\s*\(/,
        /from\s*["'`]node:worker_threads["'`]/,
      ]),
    ).toEqual([]);
  });

  it("only the child entry writes to /proc, and only the value it is allowed to write", () => {
    const writers = SOURCES.filter((s) => /writeFileSync\s*\(/.test(s.code)).map((s) => s.path);
    expect(writers).toEqual(["src/lib/tia-archive-ingest/sidecar/child-entry.ts"]);
    const child = SOURCES.find((s) => s.path.endsWith("sidecar/child-entry.ts"));
    expect(child?.code).toContain("/proc/self/oom_score_adj");
    // It raises its own score; it must never try to lower anything else's.
    expect(child?.code).not.toMatch(/\/proc\/\d/);
  });

  it("the supervisor never changes its own oom_score_adj", () => {
    const supervisor = SOURCES.find((s) => s.path.endsWith("sidecar/supervisor-entry.ts"));
    expect(supervisor?.code).toBeDefined();
    expect(supervisor?.code).toMatch(/readFileSync\([^)]*oom_score_adj/);
    expect(supervisor?.code).not.toMatch(/writeFileSync\([^)]*oom_score_adj/);
  });

  it("no module in the repository imports a sidecar entry point", () => {
    const offenders: string[] = [];
    const walk = (dir: string): void => {
      for (const name of readdirSync(dir)) {
        if (name === "node_modules" || name === ".next") continue;
        const full = join(dir, name);
        if (statSync(full).isDirectory()) {
          walk(full);
          continue;
        }
        if (!/\.tsx?$/.test(name)) continue;
        const rel = relative(REPO_ROOT, full).split(sep).join("/");
        // The sidecar may refer to itself, and a test may legitimately NAME the
        // path it is asserting about — this very file does, in its expectations.
        if (rel.includes("tia-archive-ingest/sidecar/") || rel.includes("__tests__")) continue;
        const code = stripComments(readFileSync(full, "utf8"));
        if (/tia-archive-ingest\/sidecar/.test(code) || /["'`]\.\.?\/sidecar\//.test(code)) {
          offenders.push(rel);
        }
      }
    };
    walk(join(REPO_ROOT, "src"));
    expect(offenders).toEqual([]);
  });

  it("the public barrel exports neither the sidecar nor the fixtures", () => {
    const barrel = readFileSync(join(MODULE_ROOT, "index.ts"), "utf8");
    expect(barrel).not.toContain("./sidecar");
    expect(barrel).not.toContain("./testing");
  });
});

describe("109-C2.1 · no industrial reach, no ambient configuration", () => {
  it("names no controller, endpoint or engineering automation surface", () => {
    expect(
      scan(SOURCES, [
        /Siemens\.Engineering/,
        /\bActiveXObject\b/,
        /\bwinax\b/,
        /opc\.tcp:/,
        /mqtt:\/\//,
        /\bpowershell\b/i,
        /\bcmd\.exe\b/i,
        /\.exe\b/,
      ]),
    ).toEqual([]);
  });

  it("evaluates no code at runtime", () => {
    expect(scan(SOURCES, [/\beval\s*\(/, /new\s+Function\s*\(/, /\bvm\.runIn/])).toEqual([]);
  });

  it("reaches no network other than the local socket", () => {
    expect(
      scan(SOURCES, [
        /\bfetch\s*\(/,
        /XMLHttpRequest/,
        /new\s+WebSocket/,
        /\baxios\b/,
        /from\s*["'`]node:(?:https|net|dgram|tls)["'`]/,
      ]),
    ).toEqual([]);
  });

  it("reads no environment, cookie or header — nothing can select a different mode", () => {
    // The supervisor passes NODE_ENV to its child, which is a write, not a read
    // of ambient configuration; no module may branch on the environment.
    expect(scan(SOURCES, [/process\.env\.[A-Z]/, /\bcookies\s*\(/, /NEXT_PUBLIC_/])).toEqual([]);
  });

  it("touches no database client", () => {
    expect(scan(SOURCES, [/@prisma\/client/, /PrismaClient/, /from\s*["'`]@\/lib\/db["'`]/])).toEqual([]);
  });
});

describe("109-C2.1 · the C2.0 companion module is untouched", () => {
  it("still imports exactly one Node built-in, and it is the hash", () => {
    // Restating C2.0's own invariant here so that adding ingestion cannot
    // quietly relax it: if a future change moves a socket or a subprocess into
    // the companion, this fails as well as C2.0's own gate.
    const builtins = new Set<string>();
    for (const { code } of sourcesUnder(COMPANION_ROOT)) {
      for (const match of code.matchAll(/["'`]node:([a-z_]+)["'`]/g)) builtins.add(match[1] as string);
    }
    expect([...builtins].sort()).toEqual(["crypto"]);
  });

  it("contains no file belonging to this phase", () => {
    const companionFiles = sourcesUnder(COMPANION_ROOT).map((s) => s.path);
    expect(companionFiles.some((p) => p.includes("ingest"))).toBe(false);
    expect(companionFiles.some((p) => p.includes("sidecar"))).toBe(false);
  });
});

describe("109-C2.1 · the deployed IPC authority is minimal", () => {
  const compose = readFileSync(join(REPO_ROOT, "docker-compose.prod.yml"), "utf8");

  it("the init service gives /ipc owner-write and group-traverse only", () => {
    // 0710, not 0770. With group write, a compromised web process could unlink
    // the parser's socket and bind its own in place of it — measured: with 0770
    // the web identity can create, unlink and rename in /ipc; with 0710 every
    // one of those is EACCES while connect still succeeds.
    expect(compose).toContain("chmod 0710 /ipc");
    expect(compose).not.toContain("chmod 0770 /ipc");
    expect(compose).not.toMatch(/chmod\s+07[67]7\s+\/ipc/);
  });

  it("the web service mounts the ipc volume read-only", () => {
    // Defence in depth, and independent of the mode: with a writable mount the
    // 0710 directory still denies (EACCES); with a read-only mount it denies
    // even if the mode were ever loosened (EROFS). Connecting needs neither.
    expect(compose).toContain("parser_ipc:/ipc:ro");
  });

  it("the socket itself is never widened", () => {
    const supervisor = readFileSync(join(MODULE_ROOT, "sidecar", "supervisor-entry.ts"), "utf8");
    expect(supervisor).toContain("0o660");
    expect(supervisor).not.toContain("0o666");
    expect(supervisor).not.toContain("0o777");
  });
});

describe("109-C2.1 · the fixture corpus stays out of production paths", () => {
  it("no production module imports the archive fixtures", () => {
    const offenders: string[] = [];
    const walk = (dir: string): void => {
      for (const name of readdirSync(dir)) {
        if (name === "node_modules" || name === ".next") continue;
        const full = join(dir, name);
        if (statSync(full).isDirectory()) {
          walk(full);
          continue;
        }
        if (!/\.tsx?$/.test(name)) continue;
        const rel = relative(REPO_ROOT, full).split(sep).join("/");
        if (rel.includes("__tests__") || rel.includes("tia-archive-ingest/testing/")) continue;
        const code = stripComments(readFileSync(full, "utf8"));
        if (/tia-archive-ingest\/testing/.test(code) || /["'`]\.\.?\/testing\/archive-fixtures["'`]/.test(code)) {
          offenders.push(rel);
        }
      }
    };
    walk(join(REPO_ROOT, "src"));
    expect(offenders).toEqual([]);
  });
});
