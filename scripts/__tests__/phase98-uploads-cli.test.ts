import { describe, it, expect, beforeAll } from "vitest";
import { execFileSync } from "node:child_process";
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync, readdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { packRoots, unpackRoots, assertSafeLabel, ArchiveError } from "../dr/uploads-archive.mjs";

/**
 * PHASE 98 — encrypted multi-root uploads backup/restore CLIs + archive round trip.
 * Covers both durable surfaces (public-uploads + data-documents), unicode names,
 * zero-byte files, nested paths, digest verification and path routing.
 */

const BACKUP_CLI = join(process.cwd(), "scripts", "dr", "backup-uploads.mjs");
const RESTORE_CLI = join(process.cwd(), "scripts", "dr", "restore-uploads.mjs");

function run(cli: string, args: string[]) {
  return execFileSync("node", [cli, ...args], { encoding: "utf8" });
}

let dir: string;
let keyFile: string;

beforeAll(() => {
  dir = mkdtempSync(join(tmpdir(), "hermes-upcli-"));
  keyFile = join(dir, "key.hex");
  writeFileSync(keyFile, "a".repeat(64) + "\n");
});

function seedRoots() {
  const pub = mkdtempSync(join(tmpdir(), "hermes-pub-"));
  const docs = mkdtempSync(join(tmpdir(), "hermes-docs-"));
  mkdirSync(join(pub, "authors"), { recursive: true });
  writeFileSync(join(pub, "authors", "avatar.png"), Buffer.from([0x89, 0x50, 1, 2, 3]));
  writeFileSync(join(pub, "zero.bin"), Buffer.alloc(0));
  mkdirSync(join(docs, "documents", "d1"), { recursive: true });
  writeFileSync(join(docs, "documents", "d1", "original.pdf"), Buffer.from("%PDF\x00\x01bin"));
  mkdirSync(join(docs, "exports", "پرونده"), { recursive: true });
  writeFileSync(join(docs, "exports", "پرونده", "package.json"), Buffer.from('{"سلام":"دنیا"}', "utf8"));
  return { pub, docs };
}

describe("UPLOADS ARCHIVE — multi-root", () => {
  it("labels routes and round-trips every file across roots", () => {
    const { pub, docs } = seedRoots();
    const outPub = mkdtempSync(join(tmpdir(), "hermes-opub-"));
    const outDocs = mkdtempSync(join(tmpdir(), "hermes-odocs-"));
    try {
      const { archive, manifest } = packRoots([
        { label: "public-uploads", dir: pub },
        { label: "data-documents", dir: docs },
      ]);
      expect(manifest.fileCount).toBe(4);
      const res = unpackRoots(archive, { "public-uploads": outPub, "data-documents": outDocs });
      expect(res.fileCount).toBe(4);
      expect(res.byLabel["public-uploads"]).toBe(2);
      expect(res.byLabel["data-documents"]).toBe(2);
      expect(readFileSync(join(outDocs, "documents", "d1", "original.pdf")).equals(readFileSync(join(docs, "documents", "d1", "original.pdf")))).toBe(true);
    } finally {
      [pub, docs, outPub, outDocs].forEach((d) => rmSync(d, { recursive: true, force: true }));
    }
  });

  it("rejects unsafe labels and an unknown destination label", () => {
    expect(() => assertSafeLabel("../x")).toThrowError(ArchiveError);
    const { archive } = packRoots([{ label: "public-uploads", dir: seedRoots().pub }]);
    expect(() => unpackRoots(archive, { "data-documents": tmpdir() })).toThrow(/no destination for root label/);
  });
});

describe("UPLOADS CLI — encrypted backup + restore rehearsal", () => {
  it("backs up both roots, restores into EMPTY targets, verifies digests", () => {
    const { pub, docs } = seedRoots();
    const out = join(dir, "uploads.hbk");
    const rPub = mkdtempSync(join(tmpdir(), "hermes-rpub-"));
    const rDocs = mkdtempSync(join(tmpdir(), "hermes-rdocs-"));
    try {
      const bOut = run(BACKUP_CLI, [
        "--roots", `public-uploads:${pub},data-documents:${docs}`,
        "--out", out,
        "--key-file", keyFile,
        "--key-id", "up-key",
        "--created", "2026-08-07T00:00:00.000Z",
      ]);
      expect(bOut).toMatch(/phase98_uploads_backup=PASS/);
      expect(bOut).toMatch(/FILE_COUNT=4/);

      const rOut = run(RESTORE_CLI, [
        "--in", out,
        "--dest", `public-uploads:${rPub},data-documents:${rDocs}`,
        "--key-file", keyFile,
        "--empty-check",
      ]);
      expect(rOut).toMatch(/phase98_uploads_restore=PASS/);
      expect(rOut).toMatch(/FILE_COUNT=4/);
      expect(readdirSync(join(rPub, "authors"))).toContain("avatar.png");
    } finally {
      [pub, docs, rPub, rDocs].forEach((d) => rmSync(d, { recursive: true, force: true }));
    }
  });

  it("UPLOAD_WRONG_KEY_REJECTION + UPLOAD_CORRUPTION_REJECTION", () => {
    const { pub, docs } = seedRoots();
    const out = join(dir, "uploads2.hbk");
    const badKey = join(dir, "bad.hex");
    writeFileSync(badKey, "b".repeat(64));
    const rPub = mkdtempSync(join(tmpdir(), "hermes-rpub2-"));
    const rDocs = mkdtempSync(join(tmpdir(), "hermes-rdocs2-"));
    try {
      run(BACKUP_CLI, ["--roots", `public-uploads:${pub},data-documents:${docs}`, "--out", out, "--key-file", keyFile, "--key-id", "k"]);
      // wrong key
      expect(() => run(RESTORE_CLI, ["--in", out, "--dest", `public-uploads:${rPub},data-documents:${rDocs}`, "--key-file", badKey, "--empty-check"])).toThrow();
      // corruption
      const buf = readFileSync(out);
      buf[Math.floor(buf.length / 2)] ^= 0xff;
      writeFileSync(out, buf);
      expect(() => run(RESTORE_CLI, ["--in", out, "--dest", `public-uploads:${rPub},data-documents:${rDocs}`, "--key-file", keyFile])).toThrow();
    } finally {
      [pub, docs, rPub, rDocs].forEach((d) => rmSync(d, { recursive: true, force: true }));
    }
  });
});
