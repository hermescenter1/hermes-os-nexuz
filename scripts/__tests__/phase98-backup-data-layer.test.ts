import { describe, it, expect } from "vitest";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync, readFileSync, readdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { selectPrunable, selectRestoreArtifact } from "../dr/backup-retention.mjs";
import { pack, unpack, parseArchive, assertSafeRelPath, buildManifest, ArchiveError } from "../dr/uploads-archive.mjs";
import { encrypt, decrypt, EnvelopeError } from "../dr/backup-envelope.mjs";

/**
 * PHASE 98 — backup data layer: retention safety + deterministic safe uploads
 * archive + uploads envelope round trip / failure injection.
 */

const DAY = 24 * 60 * 60 * 1000;
const NOW = Date.parse("2026-08-07T00:00:00.000Z");
const KEY = Buffer.from("c".repeat(64), "hex");
const KEY2 = Buffer.from("d".repeat(64), "hex");

function art(name: string, ageDays: number, verified: boolean, partial = false, encrypted = true) {
  return { name, createdAtMs: NOW - ageDays * DAY, verified, partial, encrypted };
}

describe("RETENTION — never destroys a recovery point", () => {
  const opts = { retentionDays: 30, minVerifiedCopies: 3, nowMs: NOW };

  it("LAST_VERIFIED_BACKUP_DELETED=0: newest verified is always kept, even if old", () => {
    const only = [art("v_old.hbk", 400, true)];
    const { prune, keep } = selectPrunable(only, opts);
    expect(prune).toHaveLength(0);
    expect(keep.map((a) => a.name)).toContain("v_old.hbk");
  });

  it("keeps at least minVerifiedCopies verified even when all are old", () => {
    const all = [art("a.hbk", 100, true), art("b.hbk", 200, true), art("c.hbk", 300, true), art("d.hbk", 400, true)];
    const { prune, verifiedRetained } = selectPrunable(all, opts);
    expect(verifiedRetained).toBeGreaterThanOrEqual(3);
    // only the 4th (superseded + old) may be pruned
    expect(prune.map((p) => p.name)).toEqual(["d.hbk"]);
  });

  it("does NOT prune superseded-but-recent verified copies", () => {
    const all = [art("a.hbk", 1, true), art("b.hbk", 2, true), art("c.hbk", 3, true), art("d.hbk", 4, true)];
    const { prune } = selectPrunable(all, opts);
    expect(prune).toHaveLength(0); // 4th is superseded but younger than 30d
  });

  it("UNVERIFIED_BACKUP_PRUNED_AS_VERIFIED=0: unverified copies never count as verified", () => {
    const all = [art("v1.hbk", 1, true), art("v2.hbk", 2, true), art("bad.hbk", 3, false)];
    const { keep, verifiedRetained } = selectPrunable(all, { ...opts, minVerifiedCopies: 3 });
    // Only 2 verified exist; the unverified one must not be counted to satisfy min.
    expect(verifiedRetained).toBe(2);
    // Recent unverified is not age-eligible → kept but still not a recovery point.
    expect(keep.find((a) => a.name === "bad.hbk")).toBeTruthy();
  });

  it("FAILED_BACKUP_PRUNES_GOOD_COPY=0: an old failed dump is pruned without touching verified", () => {
    const all = [art("good.hbk", 1, true), art("failed.hbk", 90, false)];
    const { prune, verifiedRetained } = selectPrunable(all, opts);
    expect(prune.map((p) => p.name)).toEqual(["failed.hbk"]);
    expect(verifiedRetained).toBe(1);
  });

  it("prunes stale .partial artifacts but never selects them for restore", () => {
    const all = [art("good.hbk", 1, true), art("x.hbk.partial", 90, false, true)];
    const { prune } = selectPrunable(all, opts);
    expect(prune.map((p) => p.name)).toContain("x.hbk.partial");
  });
});

describe("RESTORE SELECTION — newest verified only", () => {
  it("PARTIAL_BACKUP_SELECTED_FOR_RESTORE=0 and unverified excluded", () => {
    const all = [
      art("newest.partial", 0, false, true),
      art("unverified.hbk", 0, false),
      art("verified_old.hbk", 5, true),
      art("verified_new.hbk", 2, true),
    ];
    const chosen = selectRestoreArtifact(all);
    expect(chosen?.name).toBe("verified_new.hbk");
  });

  it("returns null when there is no valid recovery point (caller fails closed)", () => {
    expect(selectRestoreArtifact([art("only.partial", 0, false, true)])).toBeNull();
    expect(selectRestoreArtifact([art("only.unverified.hbk", 0, false)])).toBeNull();
  });
});

describe("UPLOADS ARCHIVE — path safety", () => {
  it("rejects absolute, traversal, drive/UNC and NUL paths", () => {
    for (const bad of ["/etc/passwd", "../escape", "a/../../b", "C:\\x", "\\\\host\\share", "a/\0/b"]) {
      expect(() => assertSafeRelPath(bad)).toThrowError(ArchiveError);
    }
  });
  it("accepts normal nested relative paths", () => {
    expect(assertSafeRelPath("authors/abc.png")).toBe("authors/abc.png");
    expect(assertSafeRelPath("documents/id/original.pdf")).toBe("documents/id/original.pdf");
  });
});

describe("UPLOADS ARCHIVE — deterministic pack + integrity round trip", () => {
  function seed(root: string) {
    mkdirSync(join(root, "authors"), { recursive: true });
    mkdirSync(join(root, "documents", "d1"), { recursive: true });
    mkdirSync(join(root, "exports", "نمونه"), { recursive: true }); // unicode dir name
    writeFileSync(join(root, "authors", "avatar.png"), Buffer.from([0x89, 0x50, 0x4e, 0x47, 1, 2, 3]));
    writeFileSync(join(root, "documents", "d1", "original.pdf"), Buffer.from("%PDF-1.7 binary\x00\x01"));
    writeFileSync(join(root, "exports", "نمونه", "پرونده.txt"), Buffer.from("سلام دنیا", "utf8")); // unicode name+content
    writeFileSync(join(root, "zero.bin"), Buffer.alloc(0)); // zero-byte file
  }

  it("MANIFEST_HASH is deterministic and round-trips every file digest", () => {
    const src = mkdtempSync(join(tmpdir(), "hermes-up-src-"));
    const dst = mkdtempSync(join(tmpdir(), "hermes-up-dst-"));
    try {
      seed(src);
      const { archive, manifest } = pack(src);
      const again = pack(src);
      expect(again.archive.equals(archive)).toBe(true); // deterministic bytes
      expect(manifest.fileCount).toBe(4);

      const res = unpack(archive, dst);
      expect(res.fileCount).toBe(4);
      expect(res.manifestSha256).toBe(manifest.manifestSha256);

      // Every restored file is byte-identical.
      for (const e of manifest.entries) {
        const orig = readFileSync(join(src, e.path.split("/").join(require("node:path").sep)));
        const restored = readFileSync(join(dst, e.path.split("/").join(require("node:path").sep)));
        expect(restored.equals(orig)).toBe(true);
      }
    } finally {
      rmSync(src, { recursive: true, force: true });
      rmSync(dst, { recursive: true, force: true });
    }
  });

  it("UPLOAD_CORRUPTION_REJECTION: a flipped blob byte fails the digest check", () => {
    const src = mkdtempSync(join(tmpdir(), "hermes-up-src2-"));
    const dst = mkdtempSync(join(tmpdir(), "hermes-up-dst2-"));
    try {
      seed(src);
      const { archive } = pack(src);
      const { blobStart } = parseArchive(archive);
      archive[blobStart] = archive[blobStart] ^ 0xff; // corrupt first blob byte
      expect(() => unpack(archive, dst)).toThrowError(/digest mismatch|DIGEST_MISMATCH/);
    } finally {
      rmSync(src, { recursive: true, force: true });
      rmSync(dst, { recursive: true, force: true });
    }
  });
});

describe("UPLOADS ENVELOPE — encrypted round trip + failure injection", () => {
  it("UPLOAD_BACKUP_ENCRYPTED + UPLOAD_WRONG_KEY_REJECTION", () => {
    const src = mkdtempSync(join(tmpdir(), "hermes-up-enc-"));
    const dst = mkdtempSync(join(tmpdir(), "hermes-up-dec-"));
    try {
      mkdirSync(join(src, "authors"), { recursive: true });
      writeFileSync(join(src, "authors", "a.png"), Buffer.from("imgbytes"));
      const { archive, manifest } = pack(src);
      const sealed = encrypt({
        plaintext: archive,
        key: KEY,
        keyId: "up-key",
        artifactType: "uploads",
        createdAt: "2026-08-07T00:00:00.000Z",
        extra: { fileCount: manifest.fileCount, manifestSha256: manifest.manifestSha256 },
      });
      // Wrong key rejected.
      expect(() => decrypt({ buffer: sealed, key: KEY2, expectArtifactType: "uploads" })).toThrowError(EnvelopeError);
      // Right key restores the exact archive → unpack succeeds.
      const { plaintext } = decrypt({ buffer: sealed, key: KEY, expectArtifactType: "uploads" });
      expect(plaintext.equals(archive)).toBe(true);
      const res = unpack(plaintext, dst);
      expect(res.fileCount).toBe(1);
      expect(readdirSync(join(dst, "authors"))).toEqual(["a.png"]);
    } finally {
      rmSync(src, { recursive: true, force: true });
      rmSync(dst, { recursive: true, force: true });
    }
  });
});
