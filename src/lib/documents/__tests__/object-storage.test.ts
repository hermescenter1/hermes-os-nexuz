import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { promises as fs } from "fs";
import os from "os";
import path from "path";
import { getDocumentObjectStorage } from "../object-storage";

const ENV_KEYS = ["HERMES_DOCUMENT_STORAGE_PROVIDER", "HERMES_LOCAL_DOCUMENT_STORAGE_DIR"] as const;
let saved: Record<string, string | undefined>;
let tempDir: string;

beforeEach(async () => {
  saved = {};
  for (const k of ENV_KEYS) {
    saved[k] = process.env[k];
    delete process.env[k];
  }
  // A unique temp directory per test — never touches the project's own
  // (git-ignored) .data/documents directory, so test runs leave nothing
  // behind anywhere near the repo.
  tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "hermes-doc-storage-"));
  process.env.HERMES_LOCAL_DOCUMENT_STORAGE_DIR = tempDir;
});

afterEach(async () => {
  for (const k of ENV_KEYS) {
    if (saved[k] === undefined) delete process.env[k];
    else process.env[k] = saved[k];
  }
  await fs.rm(tempDir, { recursive: true, force: true });
});

describe("getDocumentObjectStorage — local provider (real, no SDK)", () => {
  it("put() then get() round-trips the exact bytes", async () => {
    const store = getDocumentObjectStorage();
    expect(store.provider).toBe("local");

    const result = await store.put({ key: "docs/a.txt", body: "hello world" });
    expect(result.key).toBe("docs/a.txt");
    expect(result.sizeBytes).toBe(Buffer.byteLength("hello world"));

    const read = await store.get("docs/a.txt");
    expect(read?.toString("utf8")).toBe("hello world");
  });

  it("get() resolves to null for a key that was never written", async () => {
    const store = getDocumentObjectStorage();
    const read = await store.get("docs/does-not-exist.txt");
    expect(read).toBeNull();
  });

  it("exists() reflects put()/delete() accurately", async () => {
    const store = getDocumentObjectStorage();
    expect(await store.exists("docs/b.txt")).toBe(false);
    await store.put({ key: "docs/b.txt", body: "x" });
    expect(await store.exists("docs/b.txt")).toBe(true);
    await store.delete("docs/b.txt");
    expect(await store.exists("docs/b.txt")).toBe(false);
  });

  it("delete() is idempotent — deleting a missing key never throws", async () => {
    const store = getDocumentObjectStorage();
    await expect(store.delete("docs/never-existed.txt")).resolves.toBeUndefined();
  });

  it("creates nested directories on demand", async () => {
    const store = getDocumentObjectStorage();
    await store.put({ key: "documents/abc123/original.pdf", body: "%PDF-fake" });
    expect(await store.exists("documents/abc123/original.pdf")).toBe(true);
  });

  it("sanitizes path-traversal attempts rather than escaping the storage root", async () => {
    const store = getDocumentObjectStorage();
    await store.put({ key: "../../etc/passwd", body: "should not escape" });
    // the traversal segments are stripped, so this lands INSIDE tempDir,
    // never above it
    const escaped = path.join(tempDir, "..", "..", "etc", "passwd");
    const escapedExists = await fs
      .access(escaped)
      .then(() => true)
      .catch(() => false);
    expect(escapedExists).toBe(false);
    expect(await store.exists("etc/passwd")).toBe(true);
  });

  it("accepts Buffer bodies as well as strings", async () => {
    const store = getDocumentObjectStorage();
    const buf = Buffer.from([1, 2, 3, 4]);
    await store.put({ key: "docs/binary.bin", body: buf });
    const read = await store.get("docs/binary.bin");
    expect(read).toEqual(buf);
  });
});

describe("getDocumentObjectStorage — minio/s3 (architecture only, no SDK)", () => {
  it("constructing the store never throws", () => {
    process.env.HERMES_DOCUMENT_STORAGE_PROVIDER = "minio";
    expect(() => getDocumentObjectStorage()).not.toThrow();
    const store = getDocumentObjectStorage();
    expect(store.provider).toBe("minio");
  });

  it("put() throws a clear, descriptive error only when actually invoked", async () => {
    process.env.HERMES_DOCUMENT_STORAGE_PROVIDER = "minio";
    const store = getDocumentObjectStorage();
    await expect(store.put({ key: "x", body: "x" })).rejects.toThrow(/not yet implemented/i);
  });

  it("every method throws for s3 too", async () => {
    process.env.HERMES_DOCUMENT_STORAGE_PROVIDER = "s3";
    const store = getDocumentObjectStorage();
    await expect(store.get("x")).rejects.toThrow(/not yet implemented/i);
    await expect(store.delete("x")).rejects.toThrow(/not yet implemented/i);
    await expect(store.exists("x")).rejects.toThrow(/not yet implemented/i);
  });

  it("never silently falls back to local", () => {
    process.env.HERMES_DOCUMENT_STORAGE_PROVIDER = "s3";
    const store = getDocumentObjectStorage();
    expect(store.provider).toBe("s3");
  });
});
