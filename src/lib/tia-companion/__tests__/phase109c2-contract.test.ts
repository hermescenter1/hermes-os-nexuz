/**
 * PHASE 109-C2.0 — the closed contracts.
 *
 * These tests exist to make the safety claims checkable rather than readable:
 * that the unions are closed, that no capability can reach a controller, that a
 * declared extension can never grant admission, and that the path rules agree
 * exactly with the ones Phase 109-C1 already enforces.
 */

import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import {
  AutomationStudioPathError,
  normaliseArtifactPath,
  PROJECT_LIMITS,
} from "@/lib/automation-studio";

import {
  admitPackageKind,
  ADMITTED_PACKAGE_KINDS,
  ARCHIVE_INGEST_DECISION,
  classifyDeclaredContainer,
  classifyEntryPath,
  forbiddenCapabilityViolations,
  FORBIDDEN_CAPABILITY_KEYS,
  isSafeBoundedText,
  isTiaPackageKind,
  unsafeTextReason,
  KNOWN_OPAQUE_CONTAINER_EXTENSIONS,
  negotiateAdapter,
  TIA_ENTRY_KINDS,
  TIA_PACKAGE_KINDS,
  TIA_PACKAGE_LIMITS,
  TIA_SAFETY_CONTRACT,
  type TiaAdapterCapabilities,
} from "../contract";
import {
  ALL_TIA_DIAGNOSTIC_CODES,
  diagnostic,
  ENGINEERING_IMPORT_FAILURES,
  importFailureFor,
  isTiaDiagnosticCode,
  messageKeyOf,
  severityOf,
  TIA_DIAGNOSTIC_CODES,
  TIA_DIAGNOSTIC_SEVERITIES,
} from "../diagnostics";
import { OFFLINE_ADAPTER_CAPABILITIES, OFFLINE_FIXTURE_ADAPTER } from "../offline-adapter";
import { ENTRY_KIND_TUPLE, PACKAGE_KIND_TUPLE } from "../package-manifest";

const REPO_ROOT = join(__dirname, "..", "..", "..", "..");

describe("109-C2.0 · the permanent safety contract", () => {
  it("states every controller-facing fact as false", () => {
    expect(TIA_SAFETY_CONTRACT.DIRECT_PLC_DOWNLOAD).toBe(false);
    expect(TIA_SAFETY_CONTRACT.REAL_PLC_CONTACT).toBe(false);
    expect(TIA_SAFETY_CONTRACT.AUTOMATIC_CODE_APPLICATION).toBe(false);
    expect(TIA_SAFETY_CONTRACT.AUTOMATIC_ENGINEERING_APPROVAL).toBe(false);
    expect(TIA_SAFETY_CONTRACT.AUTOMATIC_OT_ACTION).toBe(false);
    expect(TIA_SAFETY_CONTRACT.PRODUCTION_CONTACT).toBe(false);
    expect(TIA_SAFETY_CONTRACT.LIVE_CONNECTION_MODE).toBe("READ_ONLY");
    expect(TIA_SAFETY_CONTRACT.SIS_AND_SAFETY_PLC_SCOPE).toBe("REVIEW_ONLY");
    expect(TIA_SAFETY_CONTRACT.ENGINEER_APPROVAL_REQUIRED).toBe(true);
  });

  it("is frozen, so a caller cannot rewrite the contract at runtime", () => {
    expect(Object.isFrozen(TIA_SAFETY_CONTRACT)).toBe(true);
  });
});

describe("109-C2.0 · the archive-ingest decision is recorded and negative", () => {
  it("records the four decision values verbatim", () => {
    expect(ARCHIVE_INGEST_DECISION).toEqual({
      ARCHIVE_PARSER_DECISION: "DEFERRED",
      IN_HOUSE_ZIP_PARSER: "NOT_APPROVED",
      PROPRIETARY_TIA_ARCHIVE: "UNSUPPORTED",
      C2_1_ARCHIVE_INGEST: "HOLD",
    });
    expect(Object.isFrozen(ARCHIVE_INGEST_DECISION)).toBe(true);
  });

  it("every value is a refusal or a hold — none grants anything", () => {
    for (const value of Object.values(ARCHIVE_INGEST_DECISION)) {
      expect(["DEFERRED", "NOT_APPROVED", "UNSUPPORTED", "HOLD"], value).toContain(value);
      expect(["APPROVED", "SUPPORTED", "ENABLED", "GO"], value).not.toContain(value);
    }
  });

  it("no decompression bound survives in the public contract", () => {
    // C2.0 CORRECTION 3: publishing a decompression limit reads as permission
    // to decompress. The kept bounds are the ones actually applied to a JSON
    // manifest, and this asserts the set exactly rather than a subset.
    expect(Object.keys(TIA_PACKAGE_LIMITS).sort()).toEqual(
      [
        "maxDeclaredEntryBytes",
        "maxDisclosureLength",
        "maxEntries",
        "maxEntryPathLength",
        "maxEntryPathSegments",
        "maxProducerLength",
        "maxRecordedByLength",
        "maxUntrustedTextLength",
      ].sort(),
    );
    for (const withdrawn of [
      "maxUncompressedBytes",
      "maxCompressionRatio",
      "maxPackageBytes",
      "maxNestingDepth",
    ]) {
      expect(TIA_PACKAGE_LIMITS, withdrawn).not.toHaveProperty(withdrawn);
    }
  });
});

describe("109-C2.0 · package kinds are a closed union", () => {
  it("rejects every value outside the union, including near-misses", () => {
    for (const value of [
      "tia-archive",
      "normalized_manifest",
      "NORMALIZED-MANIFEST",
      "",
      null,
      undefined,
      42,
      {},
    ]) {
      expect(isTiaPackageKind(value), String(value)).toBe(false);
    }
    for (const value of TIA_PACKAGE_KINDS) {
      expect(isTiaPackageKind(value), value).toBe(true);
    }
  });

  it("admits exactly one kind, and it is not an archive", () => {
    expect([...ADMITTED_PACKAGE_KINDS]).toEqual(["normalized-manifest"]);
    const admitted = admitPackageKind("normalized-manifest");
    expect(admitted.admitted).toBe(true);
  });

  it("refuses an opaque archive with its own code rather than a vague one", () => {
    const verdict = admitPackageKind("opaque-archive");
    expect(verdict).toEqual({
      admitted: false,
      code: TIA_DIAGNOSTIC_CODES.OPAQUE_ARCHIVE_NOT_PARSED,
    });
  });

  it("fails closed on anything it does not recognise", () => {
    for (const value of ["unrecognized", "zap17", null, undefined, 7]) {
      const verdict = admitPackageKind(value);
      expect(verdict.admitted, String(value)).toBe(false);
    }
  });
});

describe("109-C2.0 · no extension-only trust", () => {
  it("a declared extension can never produce the admitted kind", () => {
    // Exhaustive over the extensions the function can distinguish, plus the one
    // an attacker would most want to work.
    const probes = [
      ...KNOWN_OPAQUE_CONTAINER_EXTENSIONS,
      ".json",
      ".JSON",
      ".txt",
      "",
      "normalized-manifest",
      ".ZAP17",
    ];
    for (const probe of probes) {
      const kind = classifyDeclaredContainer(probe);
      expect(kind, probe).not.toBe("normalized-manifest");
      expect(["opaque-archive", "unrecognized"]).toContain(kind);
    }
  });

  it("recognises a proprietary container so it can be refused precisely", () => {
    expect(classifyDeclaredContainer(".zap17")).toBe("opaque-archive");
    expect(classifyDeclaredContainer(".ap16")).toBe("opaque-archive");
    // Case folding is ASCII-only, so a Turkish-locale host answers identically.
    expect(classifyDeclaredContainer(".ZAP17")).toBe("opaque-archive");
  });

  it("a plausible-looking extension grants nothing", () => {
    expect(classifyDeclaredContainer(".json")).toBe("unrecognized");
  });

  it("survives a non-string without throwing", () => {
    expect(classifyDeclaredContainer(undefined as unknown as string)).toBe("unrecognized");
  });
});

describe("109-C2.0 · controller capabilities cannot be declared", () => {
  it("every forbidden capability is literally false on the shipped adapter", () => {
    for (const key of FORBIDDEN_CAPABILITY_KEYS) {
      expect(OFFLINE_ADAPTER_CAPABILITIES[key], key).toBe(false);
    }
    expect(forbiddenCapabilityViolations(OFFLINE_ADAPTER_CAPABILITIES)).toEqual([]);
  });

  it("declaring one does not type-check", () => {
    const forged: TiaAdapterCapabilities = {
      ...OFFLINE_ADAPTER_CAPABILITIES,
      // @ts-expect-error `canDownloadToController` has the literal type `false`,
      // so this assignment cannot compile. If the type were ever widened to
      // `boolean`, this directive would become unused and the build would fail —
      // which is the point: the type-level guarantee is itself under test.
      canDownloadToController: true,
    };
    // The runtime guard is the survivor once the type is erased — which is what
    // happens the moment a capability set arrives as parsed JSON.
    expect(forbiddenCapabilityViolations(forged)).toEqual(["canDownloadToController"]);
  });

  it("treats an omitted flag as a violation, not as falsy-and-therefore-fine", () => {
    const record: Record<string, unknown> = { ...OFFLINE_ADAPTER_CAPABILITIES };
    delete record.canWriteTags;
    expect(forbiddenCapabilityViolations(record)).toEqual(["canWriteTags"]);
  });

  it("treats a non-boolean as a violation", () => {
    expect(
      forbiddenCapabilityViolations({ ...OFFLINE_ADAPTER_CAPABILITIES, canExecuteCompile: "false" }),
    ).toEqual(["canExecuteCompile"]);
    expect(forbiddenCapabilityViolations(null)).toEqual([...FORBIDDEN_CAPABILITY_KEYS]);
  });
});

describe("109-C2.0 · adapter negotiation fails closed", () => {
  const request = { schemaVersion: "1.0", packageKind: "normalized-manifest" };

  it("accepts the shipped adapter for a supported request", () => {
    expect(negotiateAdapter(OFFLINE_FIXTURE_ADAPTER, request)).toEqual({ ok: true });
  });

  it("refuses an unsupported schema version", () => {
    expect(negotiateAdapter(OFFLINE_FIXTURE_ADAPTER, { ...request, schemaVersion: "2.0" })).toEqual({
      ok: false,
      code: TIA_DIAGNOSTIC_CODES.SCHEMA_VERSION_UNSUPPORTED,
    });
  });

  it("refuses an archive before it looks at anything else", () => {
    expect(
      negotiateAdapter(OFFLINE_FIXTURE_ADAPTER, { ...request, packageKind: "opaque-archive" }),
    ).toEqual({ ok: false, code: TIA_DIAGNOSTIC_CODES.OPAQUE_ARCHIVE_NOT_PARSED });
  });

  it("refuses an adapter that declares a forbidden capability, whatever it asks for", () => {
    const rogue = {
      ...OFFLINE_FIXTURE_ADAPTER,
      capabilities: {
        ...OFFLINE_ADAPTER_CAPABILITIES,
        canInvokeOpenness: true,
      } as unknown as TiaAdapterCapabilities,
    };
    expect(negotiateAdapter(rogue, request)).toEqual({
      ok: false,
      code: TIA_DIAGNOSTIC_CODES.FORBIDDEN_CONTROLLER_CAPABILITY,
    });
  });

  it("the shipped adapter admits no archive kind at all", () => {
    expect([...OFFLINE_FIXTURE_ADAPTER.admittedPackageKinds]).toEqual(["normalized-manifest"]);
  });
});

describe("109-C2.0 · entry paths agree with Phase 109-C1", () => {
  const valid = [
    "blocks/FC_Motor.scl",
    "blocks\\FC_Motor.scl",
    "blocks//FC_Motor.scl",
    "a/b/c/d/e.txt",
    "single",
  ];

  const hostile: readonly [string, string][] = [
    ["/etc/passwd", TIA_DIAGNOSTIC_CODES.ABSOLUTE_PATH_REJECTED],
    ["C:\\Windows\\hosts", TIA_DIAGNOSTIC_CODES.DRIVE_QUALIFIED_PATH_REJECTED],
    ["blocks/../../etc/shadow", TIA_DIAGNOSTIC_CODES.PATH_TRAVERSAL_REJECTED],
    ["blocks/./x.scl", TIA_DIAGNOSTIC_CODES.PATH_TRAVERSAL_REJECTED],
    ["a\u0000b", TIA_DIAGNOSTIC_CODES.NUL_BYTE_IN_PATH],
    [`x/${"a".repeat(600)}`, TIA_DIAGNOSTIC_CODES.PATH_LENGTH_EXCEEDED],
    [
      `${Array.from({ length: 30 }, (_, i) => `d${i}`).join("/")}/leaf`,
      TIA_DIAGNOSTIC_CODES.PATH_DEPTH_EXCEEDED,
    ],
  ];

  it("produces the same canonical form C1 produces, for every valid path", () => {
    for (const path of valid) {
      const verdict = classifyEntryPath(path);
      expect(verdict.ok, path).toBe(true);
      if (!verdict.ok) continue;
      expect(verdict.canonical, path).toBe(normaliseArtifactPath(path));
    }
  });

  it("refuses everything C1 refuses, and says which rule with a stable code", () => {
    for (const [path, code] of hostile) {
      const verdict = classifyEntryPath(path);
      expect(verdict.ok, path).toBe(false);
      if (verdict.ok) continue;
      expect(verdict.code, path).toBe(code);
      // The cross-check: C1's normaliser must also refuse it. If one accepted
      // what the other rejected, the two modules would disagree about what a
      // project contains and neither would be wrong on its own terms.
      expect(() => normaliseArtifactPath(path), path).toThrow(AutomationStudioPathError);
    }
  });

  it("pins the shared bounds to C1's, so the two cannot drift apart", () => {
    expect(TIA_PACKAGE_LIMITS.maxEntryPathLength).toBe(PROJECT_LIMITS.maxPathLength);
    expect(TIA_PACKAGE_LIMITS.maxEntryPathSegments).toBe(PROJECT_LIMITS.maxPathSegments);
  });

  it("refuses a non-string and an empty path", () => {
    for (const value of [null, undefined, 5, "", {}]) {
      expect(classifyEntryPath(value).ok, String(value)).toBe(false);
    }
  });
});

describe("109-C2.0 R2 · entry paths must already be Unicode NFC", () => {
  const nfc = `blocks/caf${String.fromCodePoint(0x00e9)}.scl`;
  const nfd = `blocks/cafe${String.fromCodePoint(0x0301)}.scl`;

  it("the two forms are genuinely different strings that render the same", () => {
    // If this ever became false the rest of this block would be vacuous.
    expect(nfc).not.toBe(nfd);
    expect(nfc.normalize("NFC")).toBe(nfd.normalize("NFC"));
    expect(nfc.length).toBe(nfd.length - 1);
  });

  it("admits the precomposed form", () => {
    const verdict = classifyEntryPath(nfc);
    expect(verdict.ok).toBe(true);
    if (!verdict.ok) return;
    expect(verdict.canonical).toBe(`blocks/caf${String.fromCodePoint(0x00e9)}.scl`);
  });

  it("REFUSES the decomposed form rather than normalising it", () => {
    // Refusal, not rewriting: normalising silently would mean the path recorded
    // is not the path submitted, and the digest would cover a string nobody wrote.
    const verdict = classifyEntryPath(nfd);
    expect(verdict.ok).toBe(false);
    if (verdict.ok) return;
    expect(verdict.code).toBe(TIA_DIAGNOSTIC_CODES.PATH_NOT_NFC);
  });

  it("two visually identical paths cannot both be admitted", () => {
    // The shadowing property stated directly: whatever else happens, at most one
    // of the pair gets in.
    const admitted = [nfc, nfd].filter((p) => classifyEntryPath(p).ok);
    expect(admitted).toEqual([nfc]);
    expect(admitted.length).toBe(1);
  });

  it("does not use NFKC, which would fold distinct engineering identifiers", () => {
    // U+FF21 FULLWIDTH LATIN CAPITAL A is NFC-stable but NFKC-folds to "A".
    // Under NFKC "ＡB" and "AB" would become one identity; they are two.
    const fullwidth = `blocks/${String.fromCodePoint(0xff21)}B.scl`;
    expect(fullwidth.normalize("NFC")).toBe(fullwidth);
    expect(fullwidth.normalize("NFKC")).not.toBe(fullwidth);
    const verdict = classifyEntryPath(fullwidth);
    expect(verdict.ok).toBe(true);
    if (!verdict.ok) return;
    expect(verdict.canonical).not.toBe("blocks/AB.scl");
  });

  it("still does not treat U+FF0F as a separator", () => {
    // FULLWIDTH SOLIDUS is an ordinary character. Treating it as a separator
    // would silently rewrite a legitimate filename. Confusability between it and
    // "/" is a PRESENTATION problem for a future UI, not an identity rewrite.
    const verdict = classifyEntryPath(`blocks${String.fromCodePoint(0xff0f)}x.scl`);
    expect(verdict.ok).toBe(true);
    if (!verdict.ok) return;
    expect(verdict.canonical).toBe(`blocks${String.fromCodePoint(0xff0f)}x.scl`);
    expect(verdict.canonical.split("/").length).toBe(1);
  });

  it("keeps separator unification and every traversal check", () => {
    expect(classifyEntryPath("blocks\\x.scl")).toEqual({ ok: true, canonical: "blocks/x.scl" });
    expect(classifyEntryPath("blocks//x.scl")).toEqual({ ok: true, canonical: "blocks/x.scl" });
    expect(classifyEntryPath("../x").ok).toBe(false);
    expect(classifyEntryPath("/x").ok).toBe(false);
    expect(classifyEntryPath("C:/x").ok).toBe(false);
  });
});

describe("109-C2.0 R2 · bounded text refuses control and bidi characters", () => {
  it("accepts ordinary English, German and Persian, ZWNJ included", () => {
    // ZWNJ (U+200C) is ORDINARY PERSIAN ORTHOGRAPHY and this repository requires
    // its correct use. Refusing it would reject correctly written Persian.
    const zwnj = String.fromCodePoint(0x200c);
    for (const text of [
      "Undeclared identifier 'Motor_101_RunFb'",
      "Fehler: nicht deklarierter Bezeichner",
      `خطا: شناسه اعلام${zwnj}نشده`,
      "tab\tand\nnewline\r",
    ]) {
      expect(unsafeTextReason(text), text).toBeNull();
      expect(isSafeBoundedText(text), text).toBe(true);
    }
  });

  it("refuses C0 controls other than TAB, LF and CR, and refuses DEL", () => {
    for (const cp of [0x00, 0x01, 0x07, 0x0b, 0x0c, 0x1b, 0x1f, 0x7f]) {
      const text = `a${String.fromCodePoint(cp)}b`;
      expect(unsafeTextReason(text), `U+${cp.toString(16)}`).not.toBeNull();
    }
    for (const cp of [0x09, 0x0a, 0x0d]) {
      expect(unsafeTextReason(`a${String.fromCodePoint(cp)}b`), `U+${cp.toString(16)}`).toBeNull();
    }
  });

  it("refuses every bidi embedding, override and isolate control", () => {
    for (let cp = 0x202a; cp <= 0x202e; cp += 1) {
      expect(unsafeTextReason(`a${String.fromCodePoint(cp)}b`), `U+${cp.toString(16)}`).not.toBeNull();
    }
    for (let cp = 0x2066; cp <= 0x2069; cp += 1) {
      expect(unsafeTextReason(`a${String.fromCodePoint(cp)}b`), `U+${cp.toString(16)}`).not.toBeNull();
    }
  });

  it("refuses LRM and RLM but not ZWNJ or ZWJ", () => {
    // The distinction that matters: U+200E/U+200F steer bidi resolution and carry
    // no orthographic meaning; U+200C/U+200D are letters' business in Persian.
    expect(unsafeTextReason(`a${String.fromCodePoint(0x200e)}b`)).not.toBeNull();
    expect(unsafeTextReason(`a${String.fromCodePoint(0x200f)}b`)).not.toBeNull();
    expect(unsafeTextReason(`a${String.fromCodePoint(0x200c)}b`)).toBeNull();
    expect(unsafeTextReason(`a${String.fromCodePoint(0x200d)}b`)).toBeNull();
  });

  it("names the offending code point and its index, so a finding is actionable", () => {
    const reason = unsafeTextReason(`ab${String.fromCodePoint(0x202e)}cd`);
    expect(reason).toContain("U+202E");
    expect(reason).toContain("@2");
  });

  it("refuses C1 controls, which are invisible in every renderer", () => {
    expect(unsafeTextReason(`a${String.fromCodePoint(0x85)}b`)).not.toBeNull();
  });

  it("is false for a non-string rather than throwing", () => {
    expect(isSafeBoundedText(undefined)).toBe(false);
    expect(isSafeBoundedText(42)).toBe(false);
  });
});

describe("109-C2.0 · the diagnostic catalogue is a contract", () => {
  it("every code follows AES-C2-NNN and is unique", () => {
    for (const code of ALL_TIA_DIAGNOSTIC_CODES) {
      expect(code).toMatch(/^AES-C2-\d{3}$/);
    }
    expect(new Set(ALL_TIA_DIAGNOSTIC_CODES).size).toBe(ALL_TIA_DIAGNOSTIC_CODES.length);
    // 001-014 and 016-022: the R1 set, plus three R2 codes and one R3 code,
    // minus the retired 015.
    expect(ALL_TIA_DIAGNOSTIC_CODES.length).toBe(21);
  });

  it("the R2 codes exist and carry distinct meanings", () => {
    expect(TIA_DIAGNOSTIC_CODES.PATH_NOT_NFC).toBe("AES-C2-019");
    expect(TIA_DIAGNOSTIC_CODES.COMPILE_RESULT_MALFORMED).toBe("AES-C2-020");
    expect(TIA_DIAGNOSTIC_CODES.UNSAFE_TEXT_CONTROL_CHARACTERS).toBe("AES-C2-021");
    // MALFORMED and UNBOUND must stay separate: one is a producer bug, the other
    // is a replay, and they call for different responses.
    expect(TIA_DIAGNOSTIC_CODES.COMPILE_RESULT_MALFORMED).not.toBe(
      TIA_DIAGNOSTIC_CODES.COMPILE_RESULT_UNBOUND,
    );
    expect(TIA_DIAGNOSTIC_CODES.COMPILE_RESULT_UNBOUND).toBe("AES-C2-012");
    expect(TIA_DIAGNOSTIC_CODES.COMPILE_EVIDENCE_NOT_DECLARED).toBe("AES-C2-017");
  });

  it("AES-C2-015 stays retired — a withdrawn code is never reused", () => {
    // It was ARCHIVE_LIMIT_EXCEEDED, withdrawn with the archive bounds under
    // CORRECTION 3. The gap in the numbering is deliberate: reusing 015 for
    // something else would silently change what an existing audit row means.
    expect(ALL_TIA_DIAGNOSTIC_CODES as readonly string[]).not.toContain("AES-C2-015");
    expect(isTiaDiagnosticCode("AES-C2-015")).toBe(false);
    // The neighbours are present, so this is a real gap rather than a truncated list.
    expect(ALL_TIA_DIAGNOSTIC_CODES as readonly string[]).toContain("AES-C2-014");
    expect(ALL_TIA_DIAGNOSTIC_CODES as readonly string[]).toContain("AES-C2-016");
  });

  it("names no archive-limit vocabulary anywhere in the catalogue", () => {
    for (const key of Object.keys(TIA_DIAGNOSTIC_CODES)) {
      expect(key).not.toMatch(/ARCHIVE_LIMIT|COMPRESSION|UNCOMPRESSED/);
    }
  });

  it("does not collide with the Phase 109-C1 code space", () => {
    for (const code of ALL_TIA_DIAGNOSTIC_CODES) {
      expect(code).not.toMatch(/^AES-C1-/);
    }
  });

  it("severity and message key are total over the catalogue and keys are unique", () => {
    const keys = new Set<string>();
    for (const code of ALL_TIA_DIAGNOSTIC_CODES) {
      expect(TIA_DIAGNOSTIC_SEVERITIES, code).toContain(severityOf(code));
      const key = messageKeyOf(code);
      expect(key, code).toMatch(/^[a-z][A-Za-z0-9]*$/);
      keys.add(key);
    }
    expect(keys.size).toBe(ALL_TIA_DIAGNOSTIC_CODES.length);
  });

  it("a diagnostic carries a key and params, never display text", () => {
    const finding = diagnostic(TIA_DIAGNOSTIC_CODES.PATH_TRAVERSAL_REJECTED, { path: "a/../b" });
    expect(Object.keys(finding).sort()).toEqual([
      "code",
      "entryPath",
      "messageKey",
      "params",
      "severity",
      "snapshotContentSha256",
    ]);
    // No field may hold a rendered sentence: the same finding has to render in
    // English, German and Persian, and the engine cannot know which.
    for (const field of ["message", "text", "title", "description", "detail"]) {
      expect(finding, field).not.toHaveProperty(field);
    }
    expect(Object.isFrozen(finding)).toBe(true);
  });

  it("is guarded against an unknown code", () => {
    expect(isTiaDiagnosticCode("AES-C2-999")).toBe(false);
    expect(isTiaDiagnosticCode("AES-C1-001")).toBe(false);
    expect(isTiaDiagnosticCode(undefined)).toBe(false);
  });
});

describe("109-C2.0 · alignment with the Phase 94B failure vocabulary", () => {
  it("mirrors the EngineeringImportFailure enum exactly", () => {
    // Read from the schema FILE rather than a generated client: C2.0 must
    // type-check and run with no Prisma client generated and no database.
    const schema = readFileSync(join(REPO_ROOT, "prisma", "schema.prisma"), "utf8");
    const block = /enum\s+EngineeringImportFailure\s*\{([^}]*)\}/.exec(schema);
    expect(block, "EngineeringImportFailure enum not found in schema.prisma").not.toBeNull();
    const members = (block as RegExpExecArray)[1]
      .split("\n")
      .map((line) => line.trim())
      .filter((line) => line.length > 0 && !line.startsWith("//"));
    expect([...members].sort()).toEqual([...ENGINEERING_IMPORT_FAILURES].sort());
  });

  it("maps every code to an existing member — no new failure vocabulary", () => {
    const known = new Set<string>(ENGINEERING_IMPORT_FAILURES);
    for (const code of ALL_TIA_DIAGNOSTIC_CODES) {
      expect(known, code).toContain(importFailureFor(code));
    }
  });

  it("routes both archive refusals to UNSUPPORTED_FORMAT", () => {
    expect(importFailureFor(TIA_DIAGNOSTIC_CODES.OPAQUE_ARCHIVE_NOT_PARSED)).toBe(
      "UNSUPPORTED_FORMAT",
    );
    expect(importFailureFor(TIA_DIAGNOSTIC_CODES.UNSUPPORTED_PACKAGE_KIND)).toBe(
      "UNSUPPORTED_FORMAT",
    );
  });
});

describe("109-C2.0 · the schema tuples match the exported unions", () => {
  it("entry kinds agree as sets", () => {
    expect([...ENTRY_KIND_TUPLE].sort()).toEqual([...TIA_ENTRY_KINDS].sort());
  });

  it("package kinds agree as sets", () => {
    expect([...PACKAGE_KIND_TUPLE].sort()).toEqual([...TIA_PACKAGE_KINDS].sort());
  });
});
