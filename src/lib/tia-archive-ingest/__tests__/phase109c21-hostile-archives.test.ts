/**
 * PHASE 109-C2.1 — the hostile corpus, end to end through the real reader.
 *
 * Every archive here is synthesised in memory. The reader under test is the
 * same function the sidecar child calls, with the same strict yauzl options, so
 * a rule that passes here is the rule that runs in production.
 *
 * The central assertion of the whole file is repeated on every fixture: EXACTLY
 * ONE terminal message, and on any refusal, NOTHING partial. A reader that
 * refused correctly but had already handed back three entry digests would be a
 * failure of this phase, not a success.
 */

import { describe, expect, it } from "vitest";

import { readArchive } from "../archive-reader";
import { INGEST_DIAGNOSTIC_CODES as C } from "../diagnostics";
import { ARCHIVE_FIXTURES, ARCHIVE_FIXTURE_NAMES, buildZip } from "../testing/archive-fixtures";

describe("109-C2.1 · a valid synthetic package is admitted", () => {
  it("returns DONE with one entry, a digest and a matching crc", async () => {
    const result = await readArchive(ARCHIVE_FIXTURES.valid());
    expect(result.kind).toBe("DONE");
    if (result.kind !== "DONE") return;
    expect(result.result.entryCount).toBe(1);
    expect(result.result.entries[0]?.path).toBe("blocks/main.scl");
    expect(result.result.entries[0]?.sha256).toMatch(/^[0-9a-f]{64}$/);
    expect(result.result.observedTotalBytes).toBe(result.result.entries[0]?.observedBytes);
  });

  it("admits a deflated entry as well as a stored one", async () => {
    const result = await readArchive(ARCHIVE_FIXTURES.validDeflated());
    expect(result.kind).toBe("DONE");
  });

  it("produces the same digest for the same content through either method", async () => {
    const stored = await readArchive(ARCHIVE_FIXTURES.valid());
    const deflated = await readArchive(ARCHIVE_FIXTURES.validDeflated());
    if (stored.kind !== "DONE" || deflated.kind !== "DONE") throw new Error("expected DONE");
    expect(stored.result.entries[0]?.sha256).toBe(deflated.result.entries[0]?.sha256);
  });

  it("admits every legitimate file-attribute shape real writers emit", async () => {
    for (const name of ["regularNoUnixBits", "regularPermissionOnly", "regularFullMode"] as const) {
      const result = await readArchive(ARCHIVE_FIXTURES[name]());
      expect(result.kind, name).toBe("DONE");
    }
  });
});

/**
 * Each row is one fixture and the code it must produce. Naming the exact code
 * matters: a test that only asserted "REFUSED" would pass if every archive were
 * rejected for the same wrong reason.
 */
const REFUSALS: readonly (readonly [keyof typeof ARCHIVE_FIXTURES, string])[] = [
  ["wrongMagic", C.CONTAINER_NOT_ZIP],
  ["truncatedCentralDirectory", C.CONTAINER_UNREADABLE],
  ["crcMismatch", C.CRC_MISMATCH],
  ["dataDescriptor", C.DATA_DESCRIPTOR_REJECTED],
  ["encrypted", C.ENCRYPTED_ENTRY_REJECTED],
  ["unsupportedMethod", C.UNSUPPORTED_COMPRESSION_METHOD],
  ["duplicateEntry", "AES-C2-003"],
  ["canonicalDuplicate", "AES-C2-003"],
  ["nonNfcPath", "AES-C2-019"],
  ["traversalPath", "AES-C2-006"],
  ["absolutePath", "AES-C2-004"],
  ["driveQualifiedPath", "AES-C2-005"],
  ["unicodePathShadowing", C.FILENAME_SHADOWED],
  ["unknownExtraField", C.EXTRA_FIELD_NOT_ALLOWED],
  ["duplicateExtraField", C.EXTRA_FIELD_DUPLICATE],
  ["malformedExtraField", C.EXTRA_FIELD_MALFORMED],
  ["unnecessaryZip64", C.ZIP64_FIELD_UNNECESSARY],
  ["directoryEntry", C.DIRECTORY_ENTRY_REJECTED],
  ["symlinkEntry", C.NON_REGULAR_FILE_REJECTED],
  ["deviceEntry", C.NON_REGULAR_FILE_REJECTED],
  ["declaredSizeInconsistent", C.DECLARED_SIZE_INCONSISTENT],
  ["dotSegmentPath", "AES-C2-006"],
  ["backslashPath", C.FILENAME_CHARACTERS_REJECTED],
  ["nestedArchive", C.NESTED_ARCHIVE_REJECTED],
  ["tooManySegments", "AES-C2-009"],
  ["pathTooLong", "AES-C2-008"],
  ["localCentralCrcMismatch", C.LOCAL_CENTRAL_MISMATCH],
];

describe("109-C2.1 · every hostile fixture is refused with its own code", () => {
  for (const [fixture, code] of REFUSALS) {
    it(`${fixture} → ${code}`, async () => {
      const result = await readArchive(ARCHIVE_FIXTURES[fixture]());
      expect(result.kind, `${fixture} must be refused`).toBe("REFUSED");
      if (result.kind !== "REFUSED") return;
      expect(result.code, fixture).toBe(code);
    });
  }

  it("a backslash path never becomes a forward-slash path", async () => {
    // yauzl rewrites a backslash separator to a forward slash unless
    // strictFileNames is set. This refusal is what proves the option is in
    // force: without it the entry would be silently ACCEPTED under a name its
    // own header does not contain.
    const result = await readArchive(ARCHIVE_FIXTURES.backslashPath());
    expect(result.kind).toBe("REFUSED");
    if (result.kind !== "REFUSED") return;
    expect(result.code).toBe(C.FILENAME_CHARACTERS_REJECTED);
  });

  it("refusals reported by the reader library are still specific codes", async () => {
    // A generic "unreadable" for all of these would hide which rule fired.
    const seen = new Map<string, string>();
    for (const fixture of ["traversalPath", "absolutePath", "driveQualifiedPath"] as const) {
      const result = await readArchive(ARCHIVE_FIXTURES[fixture]());
      if (result.kind === "REFUSED") seen.set(fixture, result.code);
    }
    expect(seen.get("traversalPath")).toBe("AES-C2-006");
    expect(seen.get("absolutePath")).toBe("AES-C2-004");
    expect(seen.get("driveQualifiedPath")).toBe("AES-C2-005");
    expect(new Set(seen.values()).size).toBe(3);
  });
});

describe("109-C2.1 · atomicity — a refusal carries nothing", () => {
  it("no refusal exposes an entry list, a digest or a byte count", async () => {
    for (const [fixture] of REFUSALS) {
      const result = await readArchive(ARCHIVE_FIXTURES[fixture]());
      if (result.kind !== "REFUSED") continue;
      expect(result, fixture).not.toHaveProperty("result");
      expect(Object.keys(result).sort(), fixture).toEqual(["code", "detail", "kind"]);
    }
  });

  it("a refusal in a later entry discards the earlier entries too", async () => {
    // First entry is perfectly valid; the second is a symlink. Nothing about
    // the first may survive, because the package as a whole is inadmissible.
    const payload = Buffer.from("x", "utf8");
    const zip = buildZip([
      { name: Buffer.from("blocks/good.scl", "utf8"), data: payload },
      {
        name: Buffer.from("blocks/bad.scl", "utf8"),
        data: payload,
        externalFileAttributes: (0o120777 << 16) >>> 0,
      },
    ]);
    const result = await readArchive(zip);
    expect(result.kind).toBe("REFUSED");
    expect(result).not.toHaveProperty("result");
  });

  it("every fixture yields exactly one terminal message object", async () => {
    for (const name of ARCHIVE_FIXTURE_NAMES) {
      const result = await readArchive(ARCHIVE_FIXTURES[name]());
      expect(["DONE", "REFUSED"], name).toContain(result.kind);
    }
  });
});

describe("109-C2.1 · no content bytes cross the boundary", () => {
  it("a DONE carries paths, sizes and digests and nothing resembling content", async () => {
    const result = await readArchive(ARCHIVE_FIXTURES.valid());
    if (result.kind !== "DONE") throw new Error("expected DONE");
    const serialised = JSON.stringify(result);
    expect(serialised).not.toContain("ORGANIZATION_BLOCK");
    expect(serialised).not.toContain("synthetic Hermes fixture");
    for (const entry of result.result.entries) {
      expect(Object.keys(entry).sort()).toEqual(["crc32", "observedBytes", "path", "sha256"]);
    }
  });
});
