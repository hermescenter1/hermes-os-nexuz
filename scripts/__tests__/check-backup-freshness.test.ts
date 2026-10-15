/**
 * DA-1 — the freshness judgement, driven against real files.
 *
 * A source-level test can show the workflow contains a check. It cannot show
 * what the check DOES at the boundary, with a future mtime, with a record
 * that names another file, or with a limit of zero. Those are the cases that
 * decide whether a release goes out against an unusable restore point, so
 * they are run here against a real script and real files on disk.
 *
 * The clock is injected, so "29 hours old" is exact rather than approximate.
 */
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { spawnSync } from "node:child_process";
import { mkdtempSync, writeFileSync, rmSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const SCRIPT = "scripts/deploy/check-backup-freshness.sh";
const NOW = 1_800_000_000; // a fixed "now", in seconds
const HOUR = 3600;
const SHA = "e".repeat(64);
const NAME = "hermes_postgres_20261015_031627.hbk";

let dir: string;

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), "da1-"));
});
afterEach(() => {
  rmSync(dir, { recursive: true, force: true });
});

/** A record exactly as `scripts/backup-postgres.sh` writes it. */
function record(over: Record<string, unknown> = {}, createdEpoch = NOW - HOUR): string {
  const body = {
    artifactType: "postgres",
    verified: true,
    partial: false,
    encrypted: true,
    keyId: "key-2026-a",
    transportSha256: SHA,
    createdAtMs: createdEpoch * 1000,
    file: NAME,
    ...over,
  };
  const path = join(dir, "meta.json");
  writeFileSync(path, JSON.stringify(body));
  return path;
}

function judge(args: {
  artifact?: string;
  mtime?: number | string;
  sha?: string;
  meta?: string;
  maxAge?: number | string;
  now?: number;
}) {
  const r = spawnSync(
    "bash",
    [
      SCRIPT,
      args.artifact ?? NAME,
      String(args.mtime ?? NOW - HOUR),
      args.sha ?? SHA,
      args.meta ?? record(),
      String(args.maxAge ?? 30),
      String(args.now ?? NOW),
    ],
    { encoding: "utf8", input: "" },
  );
  const fields: Record<string, string> = {};
  for (const line of (r.stdout ?? "").split("\n")) {
    const m = /^FRESHNESS ([a-z_]+)=(.*)$/.exec(line.trim());
    if (m) fields[m[1]] = m[2];
  }
  return { status: r.status, fields, stderr: r.stderr ?? "" };
}

describe("DA-1 — a fresh, consistent artifact is accepted", () => {
  it("accepts one taken an hour ago", () => {
    const r = judge({});
    expect(r.fields.result).toBe("FRESH");
    expect(r.status).toBe(0);
    expect(r.fields.age_hours).toBe("1");
  });

  it("accepts one just inside the limit", () => {
    const created = NOW - (30 * HOUR - 60);
    const r = judge({ mtime: created, meta: record({}, created) });
    expect(r.fields.result).toBe("FRESH");
    expect(r.fields.age_hours).toBe("29");
  });

  it("refuses one exactly AT the limit, not only past it", () => {
    // A boundary that is inclusive on the wrong side is how 30h becomes 31h.
    const created = NOW - 30 * HOUR;
    const r = judge({ mtime: created, meta: record({}, created) });
    expect(r.fields.result).toBe("STALE");
    expect(r.status).toBe(1);
  });

  it("refuses one a little past the limit", () => {
    const created = NOW - 31 * HOUR;
    const r = judge({ mtime: created, meta: record({}, created) });
    expect(r.fields.result).toBe("STALE");
    expect(r.stderr).toContain("scripts/backup-postgres.sh");
  });

  it("refuses the 89-hour artifact that started this finding", () => {
    const created = NOW - Math.round(89.8 * HOUR);
    const r = judge({ mtime: created, meta: record({}, created) });
    expect(r.fields.result).toBe("STALE");
    expect(r.fields.age_hours).toBe("89");
  });
});

describe("DA-1 — time is read from two sources and the stricter one wins", () => {
  it("refuses when the RECORD is old even though the file was touched", () => {
    // `touch` on a stale artifact must not make it fresh.
    const created = NOW - 40 * HOUR;
    const r = judge({ mtime: NOW - HOUR, meta: record({}, created) });
    // The two disagree by 39h, which is itself the refusal: they do not
    // describe the same backup.
    expect(r.fields.result).toBe("TIME_INCONSISTENT");
  });

  it("refuses when the record and the file disagree beyond tolerance", () => {
    const r = judge({ mtime: NOW - 5 * HOUR, meta: record({}, NOW - HOUR) });
    expect(r.fields.result).toBe("TIME_INCONSISTENT");
    expect(Number(r.fields.drift_seconds)).toBeGreaterThan(3600);
  });

  it("allows the small gap between sealing the artifact and writing the record", () => {
    const r = judge({ mtime: NOW - HOUR - 30, meta: record({}, NOW - HOUR) });
    expect(r.fields.result).toBe("FRESH");
    expect(r.fields.drift_seconds).toBe("30");
  });

  it("refuses a future mtime", () => {
    expect(judge({ mtime: NOW + HOUR }).fields.result).toBe("FUTURE_DATED");
  });

  it("refuses a future createdAtMs", () => {
    const r = judge({ mtime: NOW - HOUR, meta: record({}, NOW + HOUR) });
    expect(["FUTURE_DATED", "TIME_INCONSISTENT"]).toContain(r.fields.result);
  });
});

describe("DA-1 — the record must be present, complete and about THIS artifact", () => {
  it("refuses a missing record", () => {
    expect(judge({ meta: join(dir, "absent.json") }).fields.result).toBe("NO_META");
  });

  it("refuses a record naming a different artifact", () => {
    const r = judge({ meta: record({ file: "some_other_backup.hbk" }) });
    expect(r.fields.result).toBe("META_MISMATCH");
  });

  it.each([
    ["verified", { verified: false }, "NOT_VERIFIED"],
    ["partial", { partial: true }, "PARTIAL"],
    ["encrypted", { encrypted: false }, "NOT_ENCRYPTED"],
  ])("refuses when %s is wrong", (_label, over, expected) => {
    expect(judge({ meta: record(over) }).fields.result).toBe(expected);
  });

  it("refuses a record with no transport hash", () => {
    expect(judge({ meta: record({ transportSha256: "" }) }).fields.result).toBe("META_INCOMPLETE");
  });

  it("refuses a record with no createdAtMs", () => {
    const path = join(dir, "meta.json");
    writeFileSync(
      path,
      JSON.stringify({ verified: true, partial: false, encrypted: true, transportSha256: SHA, file: NAME }),
    );
    expect(judge({ meta: path }).fields.result).toBe("META_INCOMPLETE");
  });

  it("refuses a hash that does not match the record", () => {
    expect(judge({ sha: "f".repeat(64) }).fields.result).toBe("HASH_MISMATCH");
  });

  it("refuses when no hash was computed at all", () => {
    expect(judge({ sha: "" }).fields.result).toBe("NO_HASH");
  });
});

describe("DA-1 — the limit cannot be turned off", () => {
  it.each([
    ["zero", 0],
    ["negative", -1],
    ["above the ceiling", 73],
    ["a month", 720],
    ["not a number", "soon"],
  ])("refuses a limit that is %s", (_label, value) => {
    const r = judge({ maxAge: value as number });
    expect(r.fields.result).toBe("BAD_LIMIT");
    expect(r.status).toBe(1);
  });

  it("falls back to the STRICT default when no limit is given", () => {
    // An empty positional argument is indistinguishable from an absent one in
    // shell, so it takes the default. That is safe precisely because the
    // default is the strict value: an omitted limit tightens to 30h, it does
    // not open up. Defaulting to anything permissive would be the bypass.
    const r = judge({ maxAge: "" });
    expect(r.fields.max_age_hours).toBe("30");
    expect(r.fields.result).toBe("FRESH");
  });

  it("checks the limit BEFORE anything else, so a bad limit cannot pass on a good artifact", () => {
    const r = judge({ maxAge: 0 });
    expect(r.fields.result).toBe("BAD_LIMIT");
    // Nothing about the artifact was emitted: the refusal happened first.
    expect(r.fields.artifact).toBeUndefined();
  });

  it("accepts the ends of the permitted range", () => {
    // At a 1-hour limit an artifact exactly one hour old is already AT the
    // boundary, and the boundary refuses — so this uses a younger one. The
    // boundary itself is covered by "refuses one exactly AT the limit".
    const fresh = NOW - 60;
    expect(judge({ maxAge: 1, mtime: fresh, meta: record({}, fresh) }).fields.result).toBe("FRESH");
    expect(judge({ maxAge: 72 }).fields.result).toBe("FRESH");
  });
});

describe("DA-1 — several artifacts, none of them usable", () => {
  it("judges the one it is given, and refuses it, rather than finding a passing sibling", () => {
    // The caller picks the newest; this script judges THAT one. A directory
    // full of older, perfectly valid backups must not rescue it — the newest
    // being broken is the finding, not a detail to route around.
    const stale = NOW - 50 * HOUR;
    const r = judge({ mtime: stale, meta: record({}, stale) });
    expect(r.fields.result).toBe("STALE");
  });

  it("refuses an artifact whose record belongs to the sibling next to it", () => {
    const r = judge({ artifact: "hermes_postgres_20261010_112029.hbk" });
    expect(r.fields.result).toBe("META_MISMATCH");
  });
});

describe("DA-1 — the record can arrive on stdin, which is how the deploy passes it", () => {
  /** The same judgement, with `-` for the record and the JSON piped in. */
  function judgeStdin(json: string, mtime = NOW - HOUR) {
    const r = spawnSync("bash", [SCRIPT, NAME, String(mtime), SHA, "-", "30", String(NOW)], {
      encoding: "utf8",
      input: json,
    });
    const fields: Record<string, string> = {};
    for (const line of (r.stdout ?? "").split("\n")) {
      const m = /^FRESHNESS ([a-z_]+)=(.*)$/.exec(line.trim());
      if (m) fields[m[1]] = m[2];
    }
    return { status: r.status, fields };
  }

  // The pre-migration gate may not create, copy or delete anything under the
  // backup directory — phase997-backup-evidence-sudo asserts that statically.
  // So the workflow pipes the record it has already read, rather than writing
  // a temp copy and removing it afterwards.
  it("accepts a fresh record piped in", () => {
    const r = judgeStdin(readFileSync(record(), "utf8"));
    expect(r.fields.result).toBe("FRESH");
    expect(r.status).toBe(0);
  });

  it("reaches the same verdict as the file form", () => {
    const created = NOW - 31 * HOUR;
    const json = readFileSync(record({}, created), "utf8");
    expect(judgeStdin(json, created).fields.result).toBe("STALE");
  });

  it("refuses an empty record rather than reading absence as consent", () => {
    expect(judgeStdin("").fields.result).toBe("NO_META");
  });
});

describe("DA-1 — the script says what its evidence is worth", () => {
  it("states that neither timestamp is a cryptographic proof of creation time", async () => {
    const { readFileSync } = await import("node:fs");
    const src = readFileSync(SCRIPT, "utf8");
    expect(src).toContain("NEITHER is a");
    expect(src).toContain("cryptographic proof");
    expect(src).toContain("claims by a trusted producer");
  });
});
