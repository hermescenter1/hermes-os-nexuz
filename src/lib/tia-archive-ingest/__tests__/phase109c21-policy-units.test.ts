/**
 * PHASE 109-C2.1 — unit coverage for the policy modules.
 *
 * These are the rules that the corpus exercises end to end. Testing them
 * directly as well is not duplication: the corpus proves the rule fires on a
 * real archive, and these prove the rule's BOUNDARY — the value one below and
 * one above the limit — which a fixture cannot express without becoming a
 * second fixture per limit.
 */

import { describe, expect, it } from "vitest";

import { TIA_PACKAGE_LIMITS } from "@/lib/tia-companion";

import { classifyContainer, leadingHex } from "../container-classifier";
import {
  ALL_INGEST_DIAGNOSTIC_CODES,
  collidingCodes,
  INGEST_DIAGNOSTIC_CODES as C,
  ingestMessageKeyOf,
  isIngestDiagnosticCode,
} from "../diagnostics";
import { classifyEntry, fileTypeIsAdmissible, type CentralEntry } from "../entry-policy";
import {
  ALLOWED_EXTRA_FIELD_IDS,
  extraFieldProblems,
  filenameShadowProblem,
  formatExtraFieldId,
  zip64IsRequired,
} from "../extra-field-policy";
import { headerMismatches, type CentralHeaderView, type LocalHeaderView } from "../header-reconciler";
import { INGEST_LIMITS, INGRESS_LIMITS, REQUIRED_CHILD_OOM_SCORE_ADJ } from "../limits";
import { checkRuntime, crc32SelfTestPasses, parseNodeVersion, versionAtLeast } from "../runtime-assert";

/* ── diagnostics ───────────────────────────────────────────────────────── */

describe("109-C2.1 · diagnostic codes are a contract", () => {
  it("shares no code with the C2.0 space", () => {
    expect(collidingCodes()).toEqual([]);
  });

  it("has no duplicate of its own", () => {
    expect(new Set(ALL_INGEST_DIAGNOSTIC_CODES).size).toBe(ALL_INGEST_DIAGNOSTIC_CODES.length);
  });

  it("continues the AES-C2- numbering from 023 with no gap", () => {
    const numbers = ALL_INGEST_DIAGNOSTIC_CODES.map((code) => Number(code.slice("AES-C2-".length)));
    expect(Math.min(...numbers)).toBe(23);
    const sorted = [...numbers].sort((a, b) => a - b);
    for (let i = 1; i < sorted.length; i++) {
      expect(sorted[i], `gap before ${sorted[i]}`).toBe((sorted[i - 1] as number) + 1);
    }
  });

  it("every code is well formed and recognised, and nothing else is", () => {
    for (const code of ALL_INGEST_DIAGNOSTIC_CODES) {
      expect(code).toMatch(/^AES-C2-\d{3}$/);
      expect(isIngestDiagnosticCode(code)).toBe(true);
      expect(ingestMessageKeyOf(code)).toBe(`tiaIngest.diagnostics.${code}`);
    }
    for (const notACode of ["AES-C2-001", "AES-C2-999", "", "nonsense", null, 23]) {
      expect(isIngestDiagnosticCode(notACode)).toBe(false);
    }
  });
});

/* ── container classification ──────────────────────────────────────────── */

describe("109-C2.1 · containers are classified by content", () => {
  it("accepts a local-file-header signature", () => {
    expect(classifyContainer(new Uint8Array([0x50, 0x4b, 0x03, 0x04, 0x00]))).toEqual({
      ok: true,
      kind: "zip",
    });
  });

  it("refuses a TAR that was named .zip", () => {
    const tar = new Uint8Array([0x6d, 0x61, 0x6e, 0x69, 0x00]);
    const verdict = classifyContainer(tar);
    expect(verdict.ok).toBe(false);
    if (verdict.ok) return;
    expect(verdict.code).toBe(C.CONTAINER_NOT_ZIP);
    expect(verdict.detail).toContain("6d616e69");
  });

  it("refuses an empty archive and a spanned archive with distinguishable codes", () => {
    const empty = classifyContainer(new Uint8Array([0x50, 0x4b, 0x05, 0x06]));
    const spanned = classifyContainer(new Uint8Array([0x50, 0x4b, 0x07, 0x08]));
    expect(empty.ok).toBe(false);
    expect(spanned.ok).toBe(false);
    if (!empty.ok) expect(empty.code).toBe(C.CONTAINER_UNREADABLE);
    if (!spanned.ok) expect(spanned.code).toBe(C.CONTAINER_NOT_ZIP);
  });

  it("refuses anything shorter than a signature", () => {
    for (const length of [0, 1, 2, 3]) {
      const verdict = classifyContainer(new Uint8Array(length));
      expect(verdict.ok, `length ${length}`).toBe(false);
    }
  });

  it("renders leading bytes as lowercase hex", () => {
    expect(leadingHex(new Uint8Array([0x00, 0x0f, 0xff, 0xab]))).toBe("000fffab");
  });
});

/* ── file type ─────────────────────────────────────────────────────────── */

describe("109-C2.1 · the Unix file-type rule admits real writers", () => {
  const mode = (value: number): number => (value << 16) >>> 0;

  it("admits no-type-bits and regular, and only those", () => {
    expect(fileTypeIsAdmissible(0)).toBe(true); // .NET and Node writers
    expect(fileTypeIsAdmissible(mode(0o600))).toBe(true); // permission-only
    expect(fileTypeIsAdmissible(mode(0o100666))).toBe(true); // full regular mode
    expect(fileTypeIsAdmissible(mode(0o120777))).toBe(false); // symlink
    expect(fileTypeIsAdmissible(mode(0o040755))).toBe(false); // directory
    expect(fileTypeIsAdmissible(mode(0o020666))).toBe(false); // character device
    expect(fileTypeIsAdmissible(mode(0o010666))).toBe(false); // FIFO
    expect(fileTypeIsAdmissible(mode(0o140666))).toBe(false); // socket
  });

  it("the naive S_IFMT===S_IFREG rule would have rejected legitimate writers", () => {
    // Recorded so nobody "simplifies" the rule back. Measured against five real
    // writers: this form rejected four of them.
    const naive = (attrs: number): boolean => ((attrs >>> 16) & 0o170000) === 0o100000;
    expect(naive(0)).toBe(false);
    expect(naive(mode(0o600))).toBe(false);
    expect(fileTypeIsAdmissible(0)).toBe(true);
    expect(fileTypeIsAdmissible(mode(0o600))).toBe(true);
  });
});

/* ── extra fields ──────────────────────────────────────────────────────── */

function entry(overrides: Partial<CentralEntry> = {}): CentralEntry {
  return {
    decodedName: "blocks/main.scl",
    rawName: "blocks/main.scl",
    generalPurposeBitFlag: 0,
    compressionMethod: 0,
    crc32: 1,
    compressedSize: 10,
    uncompressedSize: 10,
    versionMadeBy: 0x0014,
    externalFileAttributes: 0,
    localHeaderOffset: 0,
    extraFields: [],
    extraFieldRawLength: 0,
    ...overrides,
  };
}

describe("109-C2.1 · extra fields are a closed allowlist", () => {
  it("allows exactly ZIP64 and Unicode path", () => {
    expect([...ALLOWED_EXTRA_FIELD_IDS].sort((a, b) => a - b)).toEqual([0x0001, 0x7075]);
  });

  it("refuses timestamp fields as a deliberate profile restriction", () => {
    for (const id of [0x5455, 0x000a]) {
      const problems = extraFieldProblems([{ id, data: new Uint8Array(5) }], {
        compressedSize: 1,
        uncompressedSize: 1,
        localHeaderOffset: 0,
        extraFieldRawLength: 9,
      });
      expect(problems[0]?.code, formatExtraFieldId(id)).toBe(C.EXTRA_FIELD_NOT_ALLOWED);
    }
  });

  it("refuses a duplicate id even when the id is allowed", () => {
    const field = { id: 0x7075, data: new Uint8Array(10) };
    const problems = extraFieldProblems([field, field], {
      compressedSize: 1,
      uncompressedSize: 1,
      localHeaderOffset: 0,
      extraFieldRawLength: 28,
    });
    expect(problems.some((p) => p.code === C.EXTRA_FIELD_DUPLICATE)).toBe(true);
  });

  it("refuses a ZIP64 field when no sentinel requires one, and allows it when one does", () => {
    expect(zip64IsRequired({ compressedSize: 1, uncompressedSize: 1, localHeaderOffset: 0 })).toBe(false);
    expect(
      zip64IsRequired({ compressedSize: 0xffffffff, uncompressedSize: 1, localHeaderOffset: 0 }),
    ).toBe(true);
  });

  it("refuses a field whose declared length overruns its region", () => {
    const problems = extraFieldProblems([{ id: 0x0001, data: new Uint8Array(0x7fff) }], {
      compressedSize: 0xffffffff,
      uncompressedSize: 1,
      localHeaderOffset: 0,
      extraFieldRawLength: 8,
    });
    expect(problems.some((p) => p.code === C.EXTRA_FIELD_MALFORMED)).toBe(true);
  });

  it("treats any difference between decoded and raw name as shadowing", () => {
    expect(filenameShadowProblem("a", "a")).toBeNull();
    expect(filenameShadowProblem("blocks/b.scl", "blocks/a.scl")?.code).toBe(C.FILENAME_SHADOWED);
    expect(filenameShadowProblem("blocks/b.scl", "blocks\\b.scl")?.code).toBe(C.FILENAME_SHADOWED);
  });
});

/* ── entry policy boundaries ───────────────────────────────────────────── */

describe("109-C2.1 · entry limits are enforced at their boundary", () => {
  it("admits a declared size exactly at the limit and refuses one byte more", () => {
    const atLimit = classifyEntry(
      entry({ uncompressedSize: INGEST_LIMITS.maxDeclaredEntryBytes }),
      new Set(),
    );
    expect(atLimit.ok).toBe(true);

    const overLimit = classifyEntry(
      entry({ uncompressedSize: INGEST_LIMITS.maxDeclaredEntryBytes + 1 }),
      new Set(),
    );
    expect(overLimit.ok).toBe(false);
    if (overLimit.ok) return;
    expect(overLimit.problems.some((p) => p.code === C.DECLARED_ENTRY_TOO_LARGE)).toBe(true);
  });

  it("refuses a second entry with the same canonical path", () => {
    const seen = new Set<string>();
    expect(classifyEntry(entry(), seen).ok).toBe(true);
    const second = classifyEntry(entry(), seen);
    expect(second.ok).toBe(false);
  });

  it("collects every problem on a maximally hostile entry rather than the first", () => {
    const verdict = classifyEntry(
      entry({
        generalPurposeBitFlag: 0x0009,
        compressionMethod: 99,
        externalFileAttributes: (0o120777 << 16) >>> 0,
      }),
      new Set(),
    );
    expect(verdict.ok).toBe(false);
    if (verdict.ok) return;
    const codes = verdict.problems.map((p) => p.code);
    expect(codes).toContain(C.ENCRYPTED_ENTRY_REJECTED);
    expect(codes).toContain(C.DATA_DESCRIPTOR_REJECTED);
    expect(codes).toContain(C.UNSUPPORTED_COMPRESSION_METHOD);
    expect(codes).toContain(C.NON_REGULAR_FILE_REJECTED);
  });
});

/* ── header reconciliation ─────────────────────────────────────────────── */

describe("109-C2.1 · local and central headers must agree", () => {
  const base = {
    generalPurposeBitFlag: 0,
    compressionMethod: 8,
    crc32: 0x1234,
    compressedSize: 10,
    uncompressedSize: 20,
    fileNameBytes: new Uint8Array([0x61, 0x2e, 0x74]),
    extraFieldIds: [] as number[],
  };

  it("reports nothing when they agree", () => {
    expect(headerMismatches({ ...base } as LocalHeaderView, { ...base } as CentralHeaderView)).toEqual([]);
  });

  it("reports every field that differs, by name", () => {
    const local: LocalHeaderView = {
      ...base,
      crc32: 0x9999,
      compressedSize: 11,
      uncompressedSize: 21,
      compressionMethod: 0,
      generalPurposeBitFlag: 2,
      fileNameBytes: new Uint8Array([0x62]),
      extraFieldIds: [0x0001],
    };
    const fields = headerMismatches(local, base as CentralHeaderView).map((m) => m.field);
    expect(fields.sort()).toEqual(
      [
        "compressedSize",
        "compressionMethod",
        "crc32",
        "extraFieldIds",
        "fileName",
        "generalPurposeBitFlag",
        "uncompressedSize",
      ].sort(),
    );
  });

  it("compares the name as bytes, not as a decoded string", () => {
    const local: LocalHeaderView = { ...base, fileNameBytes: new Uint8Array([0x61, 0x2e]) };
    expect(headerMismatches(local, base as CentralHeaderView).map((m) => m.field)).toContain("fileName");
  });

  it("treats differing extra-field CONTENT as acceptable and differing IDS as not", () => {
    const sameIds: LocalHeaderView = { ...base, extraFieldIds: [0x0001] };
    const central: CentralHeaderView = { ...base, extraFieldIds: [0x0001] };
    expect(headerMismatches(sameIds, central)).toEqual([]);
    const otherIds: LocalHeaderView = { ...base, extraFieldIds: [0x7075] };
    expect(headerMismatches(otherIds, central).map((m) => m.field)).toEqual(["extraFieldIds"]);
  });
});

/* ── runtime and limits ────────────────────────────────────────────────── */

describe("109-C2.1 · the runtime gate fails closed", () => {
  it("refuses every version below the baseline and admits the baseline itself", () => {
    expect(checkRuntime("v20.14.99").ok).toBe(false);
    expect(checkRuntime("v20.15.0").ok).toBe(true);
    expect(checkRuntime("v18.20.0").ok).toBe(false);
    expect(checkRuntime("v22.0.0").ok).toBe(true);
    expect(checkRuntime("not-a-version").ok).toBe(false);
  });

  it("names the reason rather than failing silently", () => {
    const verdict = checkRuntime("v20.14.0");
    expect(verdict.ok).toBe(false);
    if (verdict.ok) return;
    expect(verdict.reason).toContain("NODE_BASELINE_TOO_OLD");
    expect(verdict.reason).toContain("v20.15.0");
  });

  it("compares versions component-wise, not lexically", () => {
    expect(versionAtLeast([20, 9, 0], [20, 15, 0])).toBe(false);
    expect(versionAtLeast([20, 100, 0], [20, 15, 0])).toBe(true);
    expect(parseNodeVersion("v20.20.2")).toEqual([20, 20, 2]);
  });

  it("verifies zlib.crc32 against its published vector", () => {
    expect(crc32SelfTestPasses()).toBe(true);
  });
});

describe("109-C2.1 · limits are the agreed values, in the agreed units", () => {
  it("matches the approved decision report exactly", () => {
    expect(INGEST_LIMITS.maxContainerBytes).toBe(32 * 1024 * 1024);
    // maxEntries is asserted separately below: it is the one value that
    // deliberately diverges from the decision report, and it diverges DOWNWARD.
    expect(INGEST_LIMITS.maxEntries).toBe(5_000);
    expect(INGEST_LIMITS.maxDeclaredEntryBytes).toBe(64 * 1024 * 1024);
    expect(INGEST_LIMITS.maxObservedEntryBytes).toBe(64 * 1024 * 1024);
    expect(INGEST_LIMITS.maxObservedTotalBytes).toBe(256 * 1024 * 1024);
    expect(INGEST_LIMITS.maxEntryPathLength).toBe(512);
    expect(INGEST_LIMITS.maxEntryPathSegments).toBe(24);
    expect(INGEST_LIMITS.maxManifestBytes).toBe(2 * 1024 * 1024);
    expect(INGEST_LIMITS.maxUntrustedTextLength).toBe(2_000);
    expect(INGEST_LIMITS.maxProcessingMs).toBe(30_000);
    expect(INGEST_LIMITS.maxNestingDepth).toBe(0);
  });

  it("keeps the first-byte deadline strictly shorter than the total ingress deadline", () => {
    // The whole point of splitting them: a client that never speaks must not be
    // able to hold the single global slot for the full body window.
    expect(INGRESS_LIMITS.firstByteMs).toBeLessThan(INGRESS_LIMITS.totalIngressMs);
    expect(INGRESS_LIMITS.maxConcurrentParses).toBe(1);
    expect(REQUIRED_CHILD_OOM_SCORE_ADJ).toBe(1000);
  });

  it("is frozen, so a caller cannot raise a limit at runtime", () => {
    expect(Object.isFrozen(INGEST_LIMITS)).toBe(true);
    expect(Object.isFrozen(INGRESS_LIMITS)).toBe(true);
  });

  it("admits STRICTLY FEWER archive entries than the manifest bound allows", () => {
    // Not a relaxation. C2.0's TIA_PACKAGE_LIMITS.maxEntries bounds a number
    // written in a JSON manifest and costs nothing to allow. This bounds how
    // large the parser's terminal DONE can grow, and the supervisor must hold
    // that message in memory inside a 128 MiB cgroup while a child is running.
    // A maximal 20 000-entry result is 31.8 MiB of JSON; keeping the supervisor
    // alive is the whole point of the architecture, so the archive admission
    // bound is lower. It may only ever move DOWN without also raising the
    // container memory limit.
    expect(INGEST_LIMITS.maxEntries).toBeLessThan(TIA_PACKAGE_LIMITS.maxEntries);
    expect(TIA_PACKAGE_LIMITS.maxEntries).toBe(20_000);
  });
});
