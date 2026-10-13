/**
 * scripts/executive/provision-report-worker-token.sh — EXECUTED against a
 * throwaway env file in a temporary directory. No real env file is read or
 * written anywhere in this suite.
 *
 * What matters: the token is strong and well-formed, it never reaches stdout or
 * stderr, an existing token is never replaced, the rest of the file is kept
 * byte for byte, and the metering token is never reused.
 */
import { describe, expect, it } from "vitest";
import { mkdtempSync, readFileSync, rmSync, statSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";

const REPO = process.cwd();
const SCRIPT = join(REPO, "scripts/executive/provision-report-worker-token.sh");
const hasBash = spawnSync("bash", ["-c", "true"]).status === 0;

function run(envFile: string) {
  const r = spawnSync("bash", [SCRIPT, envFile], { encoding: "utf8" });
  return { code: r.status, out: (r.stdout ?? "") + (r.stderr ?? "") };
}

function scratch(content: string | null) {
  const dir = mkdtempSync(join(tmpdir(), "exec-token-"));
  const file = join(dir, ".env.production");
  if (content !== null) writeFileSync(file, content);
  return { dir, file, done: () => rmSync(dir, { recursive: true, force: true }) };
}

const tokenIn = (text: string) => /^EXECUTIVE_REPORT_WORKER_TOKEN=([0-9a-f]+)$/m.exec(text)?.[1] ?? null;

describe.skipIf(!hasBash)("provision-report-worker-token.sh", () => {
  it("appends one 64-hex token, keeps every other line, and never prints the value", () => {
    const original = "NODE_ENV=production\nMETERING_WORKER_TOKEN=abc123\n";
    const s = scratch(original);
    try {
      const r = run(s.file);
      expect(r.code).toBe(0);
      const after = readFileSync(s.file, "utf8");
      const token = tokenIn(after);
      expect(token).toMatch(/^[0-9a-f]{64}$/);
      expect(after.startsWith(original)).toBe(true);
      expect(after.match(/^EXECUTIVE_REPORT_WORKER_TOKEN=/gm)).toHaveLength(1);
      expect(r.out).not.toContain(token!);
      expect(r.out).toContain("the value is not shown");
      // Never the metering token.
      expect(token).not.toBe("abc123");
    } finally {
      s.done();
    }
  });

  it("is idempotent: a well-formed token is left exactly as it is, and exits 0", () => {
    const live = "a".repeat(64);
    const original = `EXECUTIVE_REPORT_WORKER_TOKEN=${live}\nOTHER=1\n`;
    const s = scratch(original);
    try {
      const first = run(s.file);
      const second = run(s.file);
      expect(first.code).toBe(0);
      expect(second.code).toBe(0);
      expect(readFileSync(s.file, "utf8")).toBe(original);
      expect(first.out).toContain("left unchanged");
      expect(first.out + second.out).not.toContain(live);
    } finally {
      s.done();
    }
  });

  it("a second run after creating the token changes nothing", () => {
    const s = scratch("A=1\n");
    try {
      expect(run(s.file).code).toBe(0);
      const once = readFileSync(s.file, "utf8");
      expect(run(s.file).code).toBe(0);
      expect(readFileSync(s.file, "utf8")).toBe(once);
    } finally {
      s.done();
    }
  });

  it("refuses a malformed or duplicated token, leaving the file byte-identical", () => {
    for (const original of [
      "EXECUTIVE_REPORT_WORKER_TOKEN=short-secret\n",
      "EXECUTIVE_REPORT_WORKER_TOKEN=\n",
      `EXECUTIVE_REPORT_WORKER_TOKEN=${"b".repeat(64)}\nEXECUTIVE_REPORT_WORKER_TOKEN=${"c".repeat(64)}\n`,
    ]) {
      const s = scratch(original);
      try {
        const r = run(s.file);
        expect(r.code, original).toBe(3);
        expect(readFileSync(s.file, "utf8")).toBe(original);
        expect(r.out).not.toContain("short-secret");
      } finally {
        s.done();
      }
    }
  });

  it("does not fuse the new line onto a last line without a newline", () => {
    const s = scratch("LAST=value");
    try {
      expect(run(s.file).code).toBe(0);
      const after = readFileSync(s.file, "utf8");
      expect(after.split("\n")[0]).toBe("LAST=value");
      expect(tokenIn(after)).toMatch(/^[0-9a-f]{64}$/);
    } finally {
      s.done();
    }
  });

  it("gives two runs on two files two different tokens", () => {
    const a = scratch("");
    const b = scratch("");
    try {
      run(a.file);
      run(b.file);
      expect(tokenIn(readFileSync(a.file, "utf8"))).not.toBe(tokenIn(readFileSync(b.file, "utf8")));
    } finally {
      a.done();
      b.done();
    }
  });

  it("refuses a missing file without creating one", () => {
    const s = scratch(null);
    try {
      expect(run(s.file).code).toBe(4);
      expect(() => statSync(s.file)).toThrow();
    } finally {
      s.done();
    }
  });

  it.skipIf(process.platform === "win32")("keeps the file's mode, and refuses a symlink", () => {
    const s = scratch("A=1\n");
    try {
      spawnSync("chmod", ["600", s.file]);
      expect(run(s.file).code).toBe(0);
      expect(statSync(s.file).mode & 0o777).toBe(0o600);
      const link = join(s.dir, "link.env");
      symlinkSync(s.file, link);
      expect(run(link).code).toBe(4);
    } finally {
      s.done();
    }
  });
});

describe("the script's text", () => {
  const src = readFileSync(SCRIPT, "utf8");

  it("never echoes the generated value and never reads another token", () => {
    expect(src).not.toMatch(/echo[^\n]*\$token/);
    expect(src).not.toMatch(/METERING_WORKER_TOKEN|METRICS_TOKEN/);
    expect(src).toMatch(/unset token/);
  });

  it("uses LF line endings, or bash would fail on the server", () => {
    expect(src.includes("\r")).toBe(false);
  });
});
