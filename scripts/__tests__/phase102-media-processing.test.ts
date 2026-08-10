import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { execFileSync } from "node:child_process";
import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";

import { canTransitionProcessing } from "@/lib/media/lifecycle";
import {
  MEDIA_MAGIC_SNIFF_BYTES,
  resolveMediaType,
  validateMediaSize,
  verifyMediaMagicBytes,
} from "@/lib/media/validation";
import {
  buildMediaStorageKey,
  isMediaStorageKey,
  putMediaObject,
  readMediaByteRange,
  statMediaObject,
} from "@/lib/media/storage";

import {
  DEFAULT_LIMIT,
  MAX_LIMIT,
  USAGE,
  loadMediaModules,
  parseArgs,
  runMediaProcessing,
  verifyStoredBytes,
} from "../media/phase102-media-processing.mjs";

/**
 * PHASE 102 — media processing operator CLI.
 *
 * The `media` seam is injected with the REAL modules — the real closed transition
 * table, the real magic-byte validator, the real storage range reader against a
 * throwaway temp directory. Only the DATABASE is faked, and it is faked as a
 * compare-and-swap that can be told to lose the race, because that race is the
 * property under test: there is no leader election in this repository, so two
 * copies of this CLI must both behave correctly when one of them is stale.
 *
 * Covered here: dry-run writes nothing, a stale-state CAS is a skip and not an
 * error, a magic-byte mismatch quarantines instead of promoting, and the bound is
 * respected even by a store that ignores it.
 */

const CLI = path.join(process.cwd(), "scripts", "media", "phase102-media-processing.mjs");

const ORG_ID = "org1234567890abcdef";
const OTHER_ORG_ID = "org0987654321fedcba";

const ENV_KEYS = ["HERMES_DOCUMENT_STORAGE_PROVIDER", "HERMES_LOCAL_DOCUMENT_STORAGE_DIR"] as const;
let savedEnv: Record<string, string | undefined>;
let tempDir: string;

/** The real injected seam — nothing about validation or transitions is stubbed. */
const media = {
  canTransitionProcessing,
  MEDIA_MAGIC_SNIFF_BYTES,
  resolveMediaType,
  validateMediaSize,
  verifyMediaMagicBytes,
  isMediaStorageKey,
  statMediaObject,
  readMediaByteRange,
};

/** A structurally valid ISO-BMFF header (`ftyp`/`isom`) padded to `size` bytes. */
function realMp4Bytes(size = 128): Buffer {
  const buffer = Buffer.alloc(size);
  buffer.writeUInt32BE(0x20, 0);
  buffer.write("ftypisom", 4, "latin1");
  return buffer;
}

/** Bytes that are emphatically not a video, regardless of what the row declares. */
function shellScriptBytes(size = 128): Buffer {
  const buffer = Buffer.alloc(size, 0x41);
  buffer.write("#!/bin/sh\nrm -rf /\n", 0, "latin1");
  return buffer;
}

async function storeObject(assetId: string, body: Buffer, extension = "mp4"): Promise<string> {
  const key = buildMediaStorageKey({ organizationId: ORG_ID, assetId, extension });
  await putMediaObject({ key, body, contentType: "video/mp4" });
  return key;
}

interface FakeRow {
  id: string;
  organizationId: string;
  processingState: string;
  storageKey: string | null;
  contentType: string | null;
  byteSize: number | null;
  createdAt: Date;
  updatedAt: Date;
}

interface TransitionCall {
  id: string;
  organizationId: string;
  from: string;
  to: string;
  failureCode: string | null;
}

/**
 * An in-memory stand-in for the Prisma store. `affectedQueue` lets a test make a
 * compare-and-swap lose, which is what a concurrent replica looks like from here.
 */
function makeStore(rows: FakeRow[], affectedQueue: number[] = []) {
  const listCalls: Array<Record<string, unknown>> = [];
  const transitionCalls: TransitionCall[] = [];
  const queue = [...affectedQueue];
  return {
    listCalls,
    transitionCalls,
    /** Honours `limit` the way Prisma's `take` does. */
    async listCandidates(args: { states: string[]; limit: number; organizationId: string | null }) {
      listCalls.push(args);
      return rows
        .filter((r) => args.states.includes(r.processingState))
        .filter((r) => !args.organizationId || r.organizationId === args.organizationId)
        .slice(0, args.limit);
    },
    async transition(args: TransitionCall) {
      transitionCalls.push({
        id: args.id,
        organizationId: args.organizationId,
        from: args.from,
        to: args.to,
        failureCode: args.failureCode,
      });
      return { affected: queue.length > 0 ? (queue.shift() as number) : 1 };
    },
  };
}

/** A deliberately broken store that ignores `take`, to prove the run still bounds. */
function makeUnboundedStore(rows: FakeRow[]) {
  const inner = makeStore(rows);
  return {
    ...inner,
    async listCandidates(args: { states: string[]; limit: number; organizationId: string | null }) {
      inner.listCalls.push(args);
      return rows.filter((r) => args.states.includes(r.processingState));
    },
  };
}

function row(overrides: Partial<FakeRow> & { id: string }): FakeRow {
  const now = new Date("2026-08-09T00:00:00.000Z");
  return {
    organizationId: ORG_ID,
    processingState: "UPLOADED",
    storageKey: null,
    contentType: "video/mp4",
    byteSize: null,
    createdAt: now,
    updatedAt: now,
    ...overrides,
  };
}

beforeEach(async () => {
  savedEnv = Object.fromEntries(ENV_KEYS.map((k) => [k, process.env[k]]));
  tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "hermes-p102-cli-"));
  process.env.HERMES_DOCUMENT_STORAGE_PROVIDER = "local";
  process.env.HERMES_LOCAL_DOCUMENT_STORAGE_DIR = tempDir;
});

afterEach(async () => {
  for (const key of ENV_KEYS) {
    const value = savedEnv[key];
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
  await fs.rm(tempDir, { recursive: true, force: true });
});

// ── Dry run ──────────────────────────────────────────────────────────────────

describe("PHASE 102 CLI — dry run is the default and writes nothing", () => {
  it("plans the full UPLOADED → VALIDATING → READY pipeline without a single write", async () => {
    const bytes = realMp4Bytes();
    const key = await storeObject("assetdryrun0000001", bytes);
    const store = makeStore([
      row({ id: "assetdryrun0000001", storageKey: key, byteSize: bytes.length }),
    ]);

    const report = await runMediaProcessing({ store, media });

    expect(report.mode).toBe("dry-run");
    expect(store.transitionCalls).toHaveLength(0);
    expect(report.examined).toBe(1);
    expect(report.counts.promoted).toBe(1);
    expect(report.assets[0].final).toBe("READY");
    expect(report.assets[0].steps.map((s: { outcome: string }) => s.outcome)).toEqual([
      "WOULD_APPLY",
      "WOULD_APPLY",
    ]);
    expect(report.result).toBe("OK");
  });

  it("dry-runs a quarantine verdict too — still no write", async () => {
    const bytes = shellScriptBytes();
    const key = await storeObject("assetdryrun0000002", bytes);
    const store = makeStore([
      row({ id: "assetdryrun0000002", storageKey: key, byteSize: bytes.length }),
    ]);

    const report = await runMediaProcessing({ store, media });

    expect(store.transitionCalls).toHaveLength(0);
    expect(report.assets[0].final).toBe("QUARANTINED");
    expect(report.counts.quarantined).toBe(1);
    expect(report.counts.promoted).toBe(0);
  });

  it("only --apply produces writes, and every write carries the tenant", async () => {
    const bytes = realMp4Bytes();
    const key = await storeObject("assetapply00000001", bytes);
    const store = makeStore([
      row({ id: "assetapply00000001", storageKey: key, byteSize: bytes.length }),
    ]);

    const report = await runMediaProcessing({ store, media, apply: true });

    expect(report.mode).toBe("apply");
    expect(store.transitionCalls).toEqual([
      {
        id: "assetapply00000001",
        organizationId: ORG_ID,
        from: "UPLOADED",
        to: "VALIDATING",
        failureCode: null,
      },
      {
        id: "assetapply00000001",
        organizationId: ORG_ID,
        from: "VALIDATING",
        to: "READY",
        failureCode: null,
      },
    ]);
    expect(report.counts.promoted).toBe(1);
  });
});

// ── Compare-and-swap ─────────────────────────────────────────────────────────

describe("PHASE 102 CLI — compare-and-swap skip on a stale state", () => {
  it("treats affected !== 1 as a skip, not an error, and stops that asset's pipeline", async () => {
    const bytes = realMp4Bytes();
    const key = await storeObject("assetstale00000001", bytes);
    // The claim loses: another replica moved UPLOADED → VALIDATING first.
    const store = makeStore(
      [row({ id: "assetstale00000001", storageKey: key, byteSize: bytes.length })],
      [0],
    );

    const report = await runMediaProcessing({ store, media, apply: true });

    expect(store.transitionCalls).toHaveLength(1);
    expect(store.transitionCalls[0].to).toBe("VALIDATING");
    expect(report.assets[0].outcome).toBe("SKIPPED_STALE_STATE");
    expect(report.assets[0].final).toBe("UPLOADED");
    expect(report.counts.skippedStaleState).toBe(1);
    expect(report.counts.promoted).toBe(0);
    // A lost race is an expected outcome of running on several replicas.
    expect(report.result).toBe("OK");
    expect(report.errors).toEqual([]);
  });

  it("a quarantine landing between the claim and the verdict wins the race", async () => {
    const bytes = realMp4Bytes();
    const key = await storeObject("assetstale00000002", bytes);
    // Claim succeeds (1), the READY compare-and-swap then finds the row moved (0).
    const store = makeStore(
      [row({ id: "assetstale00000002", storageKey: key, byteSize: bytes.length })],
      [1, 0],
    );

    const report = await runMediaProcessing({ store, media, apply: true });

    expect(store.transitionCalls.map((c) => c.to)).toEqual(["VALIDATING", "READY"]);
    expect(report.assets[0].outcome).toBe("SKIPPED_STALE_STATE");
    expect(report.counts.promoted).toBe(0);
    expect(report.result).toBe("OK");
  });

  it("never attempts a transition the closed processing table does not declare", async () => {
    // PENDING_UPLOAD → VALIDATING is not an edge; the CLI must not invent it.
    expect(canTransitionProcessing("PENDING_UPLOAD", "VALIDATING")).toBe(false);
    expect(canTransitionProcessing("QUARANTINED", "READY")).toBe(false);

    const fresh = new Date("2026-08-09T00:00:00.000Z");
    const store = makeStore([
      row({ id: "assetpending000001", processingState: "PENDING_UPLOAD", updatedAt: fresh }),
    ]);

    const report = await runMediaProcessing({
      store,
      media,
      apply: true,
      now: new Date("2026-08-09T01:00:00.000Z"),
    });

    expect(store.transitionCalls).toHaveLength(0);
    expect(report.assets[0].outcome).toBe("SKIPPED_NOT_STALE");

    // Past the abandonment window the only edge taken is the declared reap.
    const staleStore = makeStore([
      row({ id: "assetpending000002", processingState: "PENDING_UPLOAD", updatedAt: fresh }),
    ]);
    const reaped = await runMediaProcessing({
      store: staleStore,
      media,
      apply: true,
      now: new Date("2026-08-11T00:00:00.000Z"),
    });
    expect(staleStore.transitionCalls).toEqual([
      {
        id: "assetpending000002",
        organizationId: ORG_ID,
        from: "PENDING_UPLOAD",
        to: "FAILED",
        failureCode: "UPLOAD_ABANDONED",
      },
    ]);
    expect(reaped.counts.reaped).toBe(1);
  });
});

// ── Quarantine ───────────────────────────────────────────────────────────────

describe("PHASE 102 CLI — quarantine on a magic-byte mismatch", () => {
  it("bytes that contradict the declared type are QUARANTINED, never READY", async () => {
    const bytes = shellScriptBytes();
    const key = await storeObject("assetquarant000001", bytes);
    const store = makeStore([
      row({ id: "assetquarant000001", storageKey: key, byteSize: bytes.length }),
    ]);

    const report = await runMediaProcessing({ store, media, apply: true });

    expect(store.transitionCalls.map((c) => c.to)).toEqual(["VALIDATING", "QUARANTINED"]);
    expect(store.transitionCalls.map((c) => c.to)).not.toContain("READY");
    expect(store.transitionCalls[1].failureCode).toBe("MAGIC_BYTES_MISMATCH");
    expect(report.assets[0].final).toBe("QUARANTINED");
    expect(report.counts.quarantined).toBe(1);
    expect(report.counts.promoted).toBe(0);
    // A quarantined asset is a normal, reportable outcome — not a run failure.
    expect(report.result).toBe("OK");
  });

  it("a stored size that contradicts the row is a quarantine, not a promotion", async () => {
    const bytes = realMp4Bytes(128);
    const key = await storeObject("assetquarant000002", bytes);
    const store = makeStore([
      row({ id: "assetquarant000002", storageKey: key, byteSize: 999 }),
    ]);

    const report = await runMediaProcessing({ store, media, apply: true });

    expect(report.assets[0].final).toBe("QUARANTINED");
    expect(store.transitionCalls[1].failureCode).toBe("BYTE_SIZE_MISMATCH");
  });

  it("an absent object FAILS (retryable) rather than quarantining", async () => {
    const key = buildMediaStorageKey({
      organizationId: ORG_ID,
      assetId: "assetmissing000001",
      extension: "mp4",
    });
    const store = makeStore([row({ id: "assetmissing000001", storageKey: key })]);

    const report = await runMediaProcessing({ store, media, apply: true });

    expect(report.assets[0].final).toBe("FAILED");
    expect(store.transitionCalls[1].failureCode).toBe("OBJECT_MISSING");
    expect(report.counts.failed).toBe(1);
  });

  it("verifyStoredBytes refuses a row with no usable storage key or content type", async () => {
    await expect(
      verifyStoredBytes({ storageKey: null, contentType: "video/mp4" }, media),
    ).resolves.toEqual({ to: "FAILED", failureCode: "STORAGE_KEY_INVALID" });

    await expect(
      verifyStoredBytes({ storageKey: "../../etc/passwd", contentType: "video/mp4" }, media),
    ).resolves.toEqual({ to: "FAILED", failureCode: "STORAGE_KEY_INVALID" });

    const key = await storeObject("assetnotype0000001", realMp4Bytes());
    await expect(verifyStoredBytes({ storageKey: key, contentType: null }, media)).resolves.toEqual(
      { to: "FAILED", failureCode: "CONTENT_TYPE_MISSING" },
    );
  });
});

// ── Bounds ───────────────────────────────────────────────────────────────────

describe("PHASE 102 CLI — the bound is respected", () => {
  it("passes the limit to the store and never examines more than it", async () => {
    const rows = Array.from({ length: 10 }, (_, i) =>
      row({ id: `assetbound00000${String(i).padStart(3, "0")}` }),
    );
    const store = makeStore(rows);

    const report = await runMediaProcessing({ store, media, limit: 3 });

    expect(store.listCalls[0].limit).toBe(3);
    expect(report.limit).toBe(3);
    expect(report.examined).toBe(3);
    expect(report.assets).toHaveLength(3);
  });

  it("still bounds the run when the store ignores the limit", async () => {
    const rows = Array.from({ length: 25 }, (_, i) =>
      row({ id: `assetunbound0000${String(i).padStart(2, "0")}` }),
    );
    const store = makeUnboundedStore(rows);

    const report = await runMediaProcessing({ store, media, limit: 4 });

    expect(report.examined).toBe(4);
    expect(report.assets).toHaveLength(4);
  });

  it("clamps an absurd limit to the hard cap and defaults when absent", async () => {
    const store = makeStore([]);
    await runMediaProcessing({ store, media, limit: 100000 });
    expect(store.listCalls[0].limit).toBe(MAX_LIMIT);

    const other = makeStore([]);
    await runMediaProcessing({ store: other, media });
    expect(other.listCalls[0].limit).toBe(DEFAULT_LIMIT);
    expect(parseArgs([]).limit).toBe(DEFAULT_LIMIT);
    expect(parseArgs(["--limit", "9999"]).limit).toBe(MAX_LIMIT);
    expect(parseArgs(["--limit", "0"]).limit).toBe(1);
  });

  it("scopes the query to one organization when asked, and never widens it", async () => {
    const rows = [
      row({ id: "assetscoped000001", organizationId: ORG_ID }),
      row({ id: "assetscoped000002", organizationId: OTHER_ORG_ID }),
    ];
    const store = makeStore(rows);

    const report = await runMediaProcessing({ store, media, organizationId: ORG_ID });

    expect(store.listCalls[0].organizationId).toBe(ORG_ID);
    expect(report.assets.map((a: { id: string }) => a.id)).toEqual(["assetscoped000001"]);
  });
});

// ── Argument surface + process contract ──────────────────────────────────────

describe("PHASE 102 CLI — argument surface and process contract", () => {
  it("defaults to a dry run and refuses an unknown flag rather than ignoring it", () => {
    expect(parseArgs([]).apply).toBe(false);
    expect(parseArgs(["--apply"]).apply).toBe(true);
    expect(() => parseArgs(["--aply"])).toThrow(/UNKNOWN_ARGUMENT/);
    expect(() => parseArgs(["--limit"])).toThrow(/MISSING_VALUE_FOR_LIMIT/);
    expect(() => parseArgs(["--limit", "abc"])).toThrow(/NON_NUMERIC_LIMIT/);
  });

  it("documents that it is dry-run by default and never runs against production", () => {
    expect(USAGE).toMatch(/DRY RUN BY DEFAULT/);
    expect(USAGE).toMatch(/does not run it against production/);
    expect(USAGE).toMatch(/Never unbounded/);
  });

  it("--help exits 0 without touching the database", () => {
    const out = execFileSync(process.execPath, [CLI, "--help"], {
      encoding: "utf8",
      env: { ...process.env, DATABASE_URL: "" },
    });
    expect(out).toMatch(/DRY RUN BY DEFAULT/);
  });

  it("exits 2 when DATABASE_URL is absent, and leaks nothing", () => {
    let status: number | null = null;
    let stderr = "";
    try {
      execFileSync(process.execPath, [CLI], {
        encoding: "utf8",
        env: { ...process.env, DATABASE_URL: "" },
        stdio: ["ignore", "pipe", "pipe"],
      });
    } catch (error) {
      const e = error as { status?: number; stderr?: string };
      status = e.status ?? null;
      stderr = e.stderr ?? "";
    }
    expect(status).toBe(2);
    expect(stderr).toMatch(/DATABASE_URL not set/);
    expect(stderr).not.toMatch(/postgres(ql)?:\/\//);
  });

  it("loads the REAL media modules at runtime instead of copying them", async () => {
    const loaded = await loadMediaModules();
    expect(typeof loaded.canTransitionProcessing).toBe("function");
    expect(typeof loaded.verifyMediaMagicBytes).toBe("function");
    expect(typeof loaded.readMediaByteRange).toBe("function");
    expect(loaded.MEDIA_MAGIC_SNIFF_BYTES).toBe(MEDIA_MAGIC_SNIFF_BYTES);
    // Same table, not a re-declaration that could drift.
    expect(loaded.canTransitionProcessing("VALIDATING", "READY")).toBe(true);
    expect(loaded.canTransitionProcessing("QUARANTINED", "READY")).toBe(false);
  });
});
