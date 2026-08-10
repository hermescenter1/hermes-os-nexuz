/**
 * PHASE 99.7 — `documents_data` adoption must be safe by construction.
 *
 * The adoption copies real customer documents on a live host, so the tests are
 * written around the ways it could destroy or lose data rather than around the
 * happy path: overwriting an existing file, adopting into the wrong (populated)
 * volume, following a symlink out of the tree, escaping via a crafted filename,
 * deleting the legacy source, or reporting success for a copy that did not
 * actually reproduce the bytes.
 */

import { describe, it, expect, afterEach } from "vitest";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync, readFileSync, existsSync, symlinkSync, readdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import {
  AdoptionError,
  DESTINATION_CLASSIFICATIONS,
  executeDocumentAdoption,
  planDocumentAdoption,
  surveyDirectory,
} from "../dr/documents-adoption.mjs";

const roots: string[] = [];

function scratch() {
  const root = mkdtempSync(join(tmpdir(), "p997-docs-"));
  roots.push(root);
  const source = join(root, "legacy");
  const dest = join(root, "volume");
  mkdirSync(source, { recursive: true });
  mkdirSync(dest, { recursive: true });
  return { root, source, dest };
}

function put(dir: string, rel: string, content: string) {
  const abs = join(dir, rel);
  mkdirSync(join(abs, ".."), { recursive: true });
  writeFileSync(abs, content);
  return abs;
}

/** Every regular file under a directory, as POSIX-relative paths. */
function listFiles(dir: string, prefix = ""): string[] {
  const out: string[] = [];
  for (const name of readdirSync(dir, { withFileTypes: true })) {
    const rel = prefix ? `${prefix}/${name.name}` : name.name;
    if (name.isDirectory()) out.push(...listFiles(join(dir, name.name), rel));
    else out.push(rel);
  }
  return out.sort();
}

afterEach(() => {
  roots.splice(0).forEach((r) => rmSync(r, { recursive: true, force: true }));
});

describe("PHASE997_DOCUMENTS_ADOPTION_SURVEY", () => {
  it("produces a deterministic count + bytes + manifest hash", () => {
    const { source } = scratch();
    put(source, "a.pdf", "alpha");
    put(source, "nested/b.txt", "bravo!");

    const s = surveyDirectory(source);
    expect(s.fileCount).toBe(2);
    expect(s.totalBytes).toBe("alpha".length + "bravo!".length);
    expect(s.entries.map((e) => e.path)).toEqual(["a.pdf", "nested/b.txt"]);
    // Re-surveying identical content yields an identical manifest hash.
    expect(surveyDirectory(source).manifestSha256).toBe(s.manifestSha256);
  });

  it("reports a missing directory instead of throwing", () => {
    const { root } = scratch();
    const s = surveyDirectory(join(root, "does-not-exist"));
    expect(s.exists).toBe(false);
    expect(s.fileCount).toBe(0);
  });

  it("refuses a symlink inside the tree rather than following it", () => {
    const { root, source } = scratch();
    const outside = put(root, "outside-secret.txt", "must never be adopted");
    let symlinkSupported = true;
    try {
      symlinkSync(outside, join(source, "link.txt"));
    } catch {
      symlinkSupported = false; // unprivileged Windows cannot create symlinks
    }
    if (!symlinkSupported) return;

    expect(() => surveyDirectory(source)).toThrowError(AdoptionError);
    try {
      surveyDirectory(source);
    } catch (err) {
      expect((err as AdoptionError).code).toBe("UNSAFE_SYMLINK");
    }
  });
});

describe("PHASE997_DOCUMENTS_ADOPTION_PLAN", () => {
  it("is READY for a populated source and an empty destination", () => {
    const { source, dest } = scratch();
    put(source, "doc.pdf", "content");
    const plan = planDocumentAdoption({ sourceDir: source, destDir: dest, destinationClassification: "EXPECTED_EMPTY" });
    expect(plan.ok).toBe(true);
    expect(plan.outcome).toBe("READY");
    expect(plan.blockers).toEqual([]);
  });

  it("fails closed when the source does not exist", () => {
    const { root, dest } = scratch();
    const plan = planDocumentAdoption({ sourceDir: join(root, "missing"), destDir: dest });
    expect(plan.ok).toBe(false);
    expect(plan.blockers).toContain("SOURCE_MISSING");
  });

  it("fails closed when the destination does not exist", () => {
    const { root, source } = scratch();
    put(source, "doc.pdf", "content");
    const plan = planDocumentAdoption({ sourceDir: source, destDir: join(root, "missing") });
    expect(plan.ok).toBe(false);
    expect(plan.blockers).toContain("DESTINATION_MISSING");
  });

  it("fails closed on a non-empty destination with no explicit classification", () => {
    const { source, dest } = scratch();
    put(source, "doc.pdf", "content");
    put(dest, "pre-existing.pdf", "already here");
    const plan = planDocumentAdoption({ sourceDir: source, destDir: dest });
    expect(plan.ok).toBe(false);
    expect(plan.blockers).toContain("DESTINATION_NOT_EMPTY_AND_UNCLASSIFIED");
  });

  it("refuses a false EXPECTED_EMPTY assertion about a populated destination", () => {
    const { source, dest } = scratch();
    put(source, "doc.pdf", "content");
    put(dest, "pre-existing.pdf", "already here");
    const plan = planDocumentAdoption({ sourceDir: source, destDir: dest, destinationClassification: "EXPECTED_EMPTY" });
    expect(plan.ok).toBe(false);
    expect(plan.blockers).toContain("EXPECTED_EMPTY_ASSERTION_FALSE");
  });

  it("allows an explicitly owner-classified non-empty destination", () => {
    const { source, dest } = scratch();
    put(source, "doc.pdf", "content");
    put(dest, "unrelated.pdf", "already here");
    const plan = planDocumentAdoption({ sourceDir: source, destDir: dest, destinationClassification: "OWNER_CLASSIFIED_SAFE_NON_EMPTY" });
    expect(plan.ok).toBe(true);
  });

  it("still refuses a collision even under the owner classification", () => {
    const { source, dest } = scratch();
    put(source, "doc.pdf", "new content");
    put(dest, "doc.pdf", "EXISTING CONTENT");
    const plan = planDocumentAdoption({ sourceDir: source, destDir: dest, destinationClassification: "OWNER_CLASSIFIED_SAFE_NON_EMPTY" });
    expect(plan.ok).toBe(false);
    expect(plan.blockers).toContain("DESTINATION_PATH_COLLISION");
    expect(plan.collisions).toEqual(["doc.pdf"]);
  });

  it("rejects an unrecognised destination classification", () => {
    const { source, dest } = scratch();
    put(source, "doc.pdf", "content");
    const plan = planDocumentAdoption({ sourceDir: source, destDir: dest, destinationClassification: "TOTALLY_FINE_TRUST_ME" });
    expect(plan.ok).toBe(false);
    expect(plan.blockers).toContain("UNKNOWN_DESTINATION_CLASSIFICATION");
    expect(DESTINATION_CLASSIFICATIONS).not.toContain("TOTALLY_FINE_TRUST_ME");
  });

  it("reports ZERO_DOCUMENTS for an empty legacy source instead of silently passing", () => {
    const { source, dest } = scratch();
    const plan = planDocumentAdoption({ sourceDir: source, destDir: dest, destinationClassification: "EXPECTED_EMPTY" });
    expect(plan.ok).toBe(true);
    expect(plan.outcome).toBe("ZERO_DOCUMENTS");
    expect(plan.source.fileCount).toBe(0);
  });
});

describe("PHASE997_DOCUMENTS_ADOPTION_EXECUTE", () => {
  it("copies every file, proves integrity and preserves the source", () => {
    const { source, dest } = scratch();
    put(source, "a.pdf", "alpha");
    put(source, "nested/deep/b.bin", "bravo-bytes");
    put(source, "unicode-نام.txt", "persian filename");

    const plan = planDocumentAdoption({ sourceDir: source, destDir: dest, destinationClassification: "EXPECTED_EMPTY" });
    const record = executeDocumentAdoption(plan, { sourceDir: source, destDir: dest });

    expect(record.ok).toBe(true);
    expect(record.outcome).toBe("ADOPTED");
    expect(record.copiedFileCount).toBe(3);
    expect(record.copiedTotalBytes).toBe(record.plannedTotalBytes);
    expect(record.integrityVerified).toBe(true);
    expect(record.adoptedManifestSha256).toBe(record.sourceManifestSha256);

    // Destination content really matches.
    expect(readFileSync(join(dest, "nested", "deep", "b.bin"), "utf8")).toBe("bravo-bytes");
    expect(listFiles(dest)).toEqual(listFiles(source));

    // The legacy source is retained so the rollback image stays complete.
    expect(record.sourceRetained).toBe(true);
    expect(existsSync(join(source, "a.pdf"))).toBe(true);
    expect(listFiles(source).length).toBe(3);
  });

  it("is a no-op that still reports honestly for a zero-document source", () => {
    const { source, dest } = scratch();
    const plan = planDocumentAdoption({ sourceDir: source, destDir: dest, destinationClassification: "EXPECTED_EMPTY" });
    const record = executeDocumentAdoption(plan, { sourceDir: source, destDir: dest });
    expect(record.ok).toBe(true);
    expect(record.outcome).toBe("ZERO_DOCUMENTS");
    expect(record.copiedFileCount).toBe(0);
    expect(listFiles(dest)).toEqual([]);
  });

  it("refuses to run a plan that was not approved", () => {
    const { source, dest } = scratch();
    put(source, "doc.pdf", "content");
    put(dest, "doc.pdf", "EXISTING");
    const plan = planDocumentAdoption({ sourceDir: source, destDir: dest });
    const record = executeDocumentAdoption(plan, { sourceDir: source, destDir: dest });
    expect(record.ok).toBe(false);
    expect(record.outcome).toBe("BLOCKED");
    expect(record.copiedFileCount).toBe(0);
    // The pre-existing destination file is untouched.
    expect(readFileSync(join(dest, "doc.pdf"), "utf8")).toBe("EXISTING");
  });

  it("never overwrites a file that appears between planning and execution", () => {
    const { source, dest } = scratch();
    put(source, "doc.pdf", "new content");
    const plan = planDocumentAdoption({ sourceDir: source, destDir: dest, destinationClassification: "EXPECTED_EMPTY" });
    // Simulate a concurrent writer landing the same path after the plan was made.
    put(dest, "doc.pdf", "CONCURRENTLY WRITTEN");

    expect(() => executeDocumentAdoption(plan, { sourceDir: source, destDir: dest })).toThrowError(AdoptionError);
    expect(readFileSync(join(dest, "doc.pdf"), "utf8")).toBe("CONCURRENTLY WRITTEN");
  });

  it("a crafted traversal filename cannot escape the destination", () => {
    const { root, source, dest } = scratch();
    put(source, "ok.pdf", "fine");
    const plan = planDocumentAdoption({ sourceDir: source, destDir: dest, destinationClassification: "EXPECTED_EMPTY" });
    // Tamper with the approved plan the way a malicious manifest would.
    plan.source.entries.push({ path: "../escaped.pdf", size: 4, sha256: "0".repeat(64) });

    expect(() => executeDocumentAdoption(plan, { sourceDir: source, destDir: dest })).toThrow();
    expect(existsSync(join(root, "escaped.pdf"))).toBe(false);
  });

  it("reports an integrity failure when the copied bytes do not match the plan", () => {
    const { source, dest } = scratch();
    put(source, "doc.pdf", "original");
    const plan = planDocumentAdoption({ sourceDir: source, destDir: dest, destinationClassification: "EXPECTED_EMPTY" });
    // The planned digest no longer describes the file on disk.
    writeFileSync(join(source, "doc.pdf"), "SWAPPED UNDERNEATH");

    expect(() => executeDocumentAdoption(plan, { sourceDir: source, destDir: dest })).toThrowError(AdoptionError);
    try {
      executeDocumentAdoption(plan, { sourceDir: source, destDir: dest });
    } catch (err) {
      expect((err as AdoptionError).code).toMatch(/COPY_INTEGRITY_MISMATCH|OVERWRITE_REFUSED/);
    }
  });
});
