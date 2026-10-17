/**
 * DA-1 — the evaluator, driven against real evidence blocks.
 *
 * The collector MEASURES on the host; this decides on the runner. The cases
 * that matter here are the ones a happy-path test never reaches: a block that
 * never arrived because the host was unreachable, one that was cut off
 * mid-measurement, one whose lines are not key=value, one from a future
 * version of the collector. Each of those must read as "no evidence", because
 * the alternative — treating an unreadable measurement as a pass — is exactly
 * how a release goes out against an unusable restore point.
 *
 * The freshness judgement itself is proven in check-backup-freshness.test.ts;
 * what is proven here is that this evaluator reaches it only with evidence it
 * has fully understood.
 */
import { describe, expect, it } from "vitest";
import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";

const SCRIPT = "scripts/deploy/evaluate-backup-evidence.sh";
const NAME = "hermes_postgres_20261015_185219.hbk";
const BODY = "pretend this is an encrypted artifact";
const SHA = createHash("sha256").update(BODY).digest("hex");

function record(over: Record<string, unknown> = {}, createdAtMs = Date.now() - 3600_000): string {
  return JSON.stringify({
    artifactType: "postgres",
    verified: true,
    partial: false,
    encrypted: true,
    keyId: "key-2026-a",
    transportSha256: SHA,
    createdAtMs,
    file: NAME,
    ...over,
  });
}

/** A complete, well-formed measurement, as the collector would emit it. */
function evidence(over: Record<string, string | undefined> = {}, meta: string | null = record()): string {
  const mtime = Math.floor((Date.now() - 3600_000) / 1000);
  const fields: Record<string, string | undefined> = {
    evidence_version: "1",
    backup_dir: "/backups/postgres",
    candidate_count: "3",
    artifact_present: "1",
    artifact_name: NAME,
    artifact_mtime: String(mtime),
    artifact_owner: "0:0",
    artifact_mode: "600",
    partial_present: "0",
    meta_present: meta === null ? "0" : "1",
    ...(meta === null ? {} : { meta_b64: Buffer.from(meta, "utf8").toString("base64") }),
    artifact_sha256: SHA,
    ...over,
  };
  const body = Object.entries(fields)
    .filter(([, v]) => v !== undefined)
    .map(([k, v]) => `${k}=${v}`)
    .join("\n");
  return `EVIDENCE_BEGIN\n${body}\nEVIDENCE_END\n`;
}

function judge(input: string, env: Record<string, string> = {}) {
  const r = spawnSync("bash", [SCRIPT], {
    encoding: "utf8",
    input,
    env: { ...process.env, RELEASE_BACKUP_EVIDENCE_REQUIRED: "true", ...env },
  });
  const fields: Record<string, string> = {};
  for (const line of (r.stdout ?? "").split("\n")) {
    const m = /^EVIDENCE ([a-z0-9_]+)=(.*)$/.exec(line.trim());
    if (m) fields[m[1]] = m[2];
  }
  return { status: r.status, fields, stdout: r.stdout ?? "", stderr: r.stderr ?? "" };
}

describe("a complete, consistent measurement passes", () => {
  it("accepts it and reports what it measured", () => {
    const r = judge(evidence());
    expect(r.fields.result).toBe("PASS");
    expect(r.status).toBe(0);
    expect(r.fields.artifact).toBe(NAME);
    expect(r.fields.owner).toBe("0:0");
    expect(r.fields.mode).toBe("600");
    // It reached the one freshness judgement rather than deciding itself.
    expect(r.stdout).toContain("FRESHNESS result=FRESH");
  });
});

describe("evidence that did not arrive intact is never a pass", () => {
  it("refuses an empty stream — the host was unreachable or sudo was denied", () => {
    const r = judge("");
    expect(r.fields.result).toBe("NO_EVIDENCE");
    expect(r.status).toBe(1);
  });

  it("refuses output with no begin marker", () => {
    expect(judge("artifact_present=1\nEVIDENCE_END\n").fields.result).toBe("NO_EVIDENCE");
  });

  it("refuses a block cut off before its end marker", () => {
    // The collector dies without EVIDENCE_END precisely so this is possible
    // to detect: a killed process must not look like a clean measurement.
    const truncated = evidence().split("EVIDENCE_END")[0];
    expect(judge(truncated).fields.result).toBe("TRUNCATED_EVIDENCE");
  });

  it("refuses a block containing a line that is not key=value", () => {
    const corrupted = evidence().replace("artifact_owner=0:0", "artifact_owner 0:0");
    const r = judge(corrupted);
    expect(r.fields.result).toBe("MALFORMED_EVIDENCE");
    // It names the offending prefix, so a malformed block is diagnosable
    // without re-running the collector against production.
    expect(r.stderr).toContain("artifact_owner 0:0");
  });

  it("refuses an evidence version it does not understand", () => {
    expect(judge(evidence({ evidence_version: "2" })).fields.result).toBe("UNKNOWN_EVIDENCE_VERSION");
  });

  it("refuses a record that did not survive transport", () => {
    // base64 refuses the input, so the record never materialises: that is a
    // transport fault, not an absent record, and it is named as one.
    expect(judge(evidence({ meta_b64: "!!!not base64!!!" })).fields.result).toBe("MALFORMED_EVIDENCE");
  });
});

describe("the measurement itself must be well formed", () => {
  it.each([
    ["a non-canonical artifact name", { artifact_name: "../../etc/passwd" }, "BAD_ARTIFACT_NAME"],
    ["a name with a shell metacharacter", { artifact_name: "a;rm -rf /.hbk" }, "BAD_ARTIFACT_NAME"],
    ["a non-numeric mtime", { artifact_mtime: "yesterday" }, "BAD_MTIME"],
    ["a truncated hash", { artifact_sha256: "abc" }, "BAD_HASH"],
    ["an uppercase hash", { artifact_sha256: "A".repeat(64) }, "BAD_HASH"],
  ])("refuses %s", (_label, over, expected) => {
    expect(judge(evidence(over as Record<string, string>)).fields.result).toBe(expected);
  });

  it("refuses when no artifact was found at all", () => {
    expect(judge(evidence({ artifact_present: "0" })).fields.result).toBe("NO_ARTIFACT");
  });

  it("refuses when a .partial sibling was measured", () => {
    expect(judge(evidence({ partial_present: "1" })).fields.result).toBe("PARTIAL_SIBLING");
  });

  it("refuses when no record was found beside the artifact", () => {
    expect(judge(evidence({}, null)).fields.result).toBe("NO_META");
  });
});

describe("the record must describe THIS artifact", () => {
  it.each([
    ["it names another file", { file: "something_else.hbk" }, "META_MISMATCH"],
    ["it is not verified", { verified: false }, "NOT_VERIFIED"],
    ["it is marked partial", { partial: true }, "PARTIAL"],
    ["it is not encrypted", { encrypted: false }, "NOT_ENCRYPTED"],
  ])("refuses when %s", (_label, over, expected) => {
    expect(judge(evidence({}, record(over))).fields.result).toBe(expected);
  });

  it("refuses when the record carries no transport hash", () => {
    expect(judge(evidence({}, record({ transportSha256: "" }))).fields.result).toBe("META_INCOMPLETE");
  });

  it("refuses when the measured hash and the recorded one differ", () => {
    const r = judge(evidence({ artifact_sha256: "f".repeat(64) }));
    expect(r.fields.result).toBe("HASH_MISMATCH");
    expect(r.stderr).toContain("backup integrity check failed");
  });
});

describe("time is still judged by the one helper", () => {
  it("refuses a stale artifact", () => {
    const old = Math.floor(Date.now() / 1000) - 40 * 3600;
    const r = judge(evidence({ artifact_mtime: String(old) }, record({}, old * 1000)));
    expect(r.fields.result).toBe("NOT_FRESH");
    expect(r.stdout).toContain("FRESHNESS result=STALE");
  });

  it("refuses a future-dated artifact", () => {
    const soon = Math.floor(Date.now() / 1000) + 3600;
    const r = judge(evidence({ artifact_mtime: String(soon) }, record({}, soon * 1000)));
    expect(r.fields.result).toBe("NOT_FRESH");
    expect(r.stdout).toContain("FRESHNESS result=FUTURE_DATED");
  });

  it("refuses when the record's time and the file's disagree", () => {
    const mtime = Math.floor(Date.now() / 1000) - 10 * 3600;
    const r = judge(evidence({ artifact_mtime: String(mtime) }, record({}, Date.now() - 3600_000)));
    expect(r.fields.result).toBe("NOT_FRESH");
    expect(r.stdout).toContain("FRESHNESS result=TIME_INCONSISTENT");
  });
});

describe("cutover evidence belongs to migration-bearing releases only", () => {
  it("does not ask for adoption evidence by default", () => {
    expect(judge(evidence()).fields.result).toBe("PASS");
  });

  it("requires it when the release carries a migration", () => {
    expect(judge(evidence({ adoption_present: "0" }), { REQUIRE_ADOPTION: "true" }).fields.result).toBe("NO_ADOPTION");
  });

  it("accepts it when it proves integrity", () => {
    const adoption = Buffer.from(JSON.stringify({ integrityVerified: true, tables: 3 }), "utf8").toString("base64");
    const r = judge(evidence({ adoption_present: "1", adoption_b64: adoption }), { REQUIRE_ADOPTION: "true" });
    expect(r.fields.result).toBe("PASS");
    expect(r.fields.adoption).toBe("verified");
  });

  it("refuses it when it does not", () => {
    const adoption = Buffer.from(JSON.stringify({ integrityVerified: false }), "utf8").toString("base64");
    const r = judge(evidence({ adoption_present: "1", adoption_b64: adoption }), { REQUIRE_ADOPTION: "true" });
    expect(r.fields.result).toBe("ADOPTION_NOT_VERIFIED");
  });
});

describe("the requirement cannot be switched off here either", () => {
  it.each([["absent", undefined], ["false", "false"], ["empty", ""], ["miscased", "TRUE"], ["other", "yes"]])(
    "refuses when the flag is %s",
    (_label, value) => {
      const env = value === undefined ? { RELEASE_BACKUP_EVIDENCE_REQUIRED: "" } : { RELEASE_BACKUP_EVIDENCE_REQUIRED: value };
      const r = judge(evidence(), env);
      expect(r.fields.result).toBe("EVIDENCE_NOT_REQUIRED");
      expect(r.status).toBe(1);
    },
  );
});

describe("the evaluator needs no privilege and writes nothing", () => {
  it("never calls sudo and never writes a file", () => {
    const LF = String.fromCharCode(10);
    const code = readFileSync(SCRIPT, "utf8")
      .split(LF)
      .filter(l => !l.trimStart().startsWith("#"))
      .join(LF);
    // An INVOCATION, not the word: one refusal message explains that sudo
    // may have been denied on the host, which is the opposite of using it.
    expect(code).not.toMatch(/(^|[;&|(]\s*|\s)sudo\s/);
    expect(code).not.toMatch(/(^|[;&|(]\s*|\s)ssh\s/);
    for (const verb of ["cp ", "mv ", "tee ", "rm ", "mkdir ", "touch ", "mktemp"]) {
      expect(code, verb).not.toContain(verb);
    }
  });
});
