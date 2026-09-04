/**
 * PHASE 109-C2.0 — the offline fixture corpus. FOR TESTS ONLY.
 *
 * WHAT THESE ARE NOT
 * ------------------
 * Not Siemens exports. Not anonymised customer data. Not captured from any TIA
 * Portal installation, any controller, or any plant. Every byte below was
 * written by hand in this repository to exercise a contract. The project names,
 * block names and digests are invented, and the digests are DECLARED values that
 * describe nothing — no file with those hashes exists.
 *
 * Saying so once in a comment is not enough, so every fixture carries
 * `FIXTURE_DISCLOSURE` in its provenance: a reader who encounters one of these
 * values downstream, with no idea where it came from, still cannot mistake it
 * for a plant export.
 *
 * WHY THIS LIVES UNDER `testing/` AND NOT IN THE BARREL
 * The module is not re-exported from `src/lib/tia-companion/index.ts`, so a
 * production module cannot pull synthetic engineering data into a real code path
 * by importing the barrel. A contract test scans the repository and asserts that
 * nothing outside tests imports this path — a structural guarantee rather than a
 * runtime `NODE_ENV` check, which would only complain after the fact.
 *
 * THE HOSTILE CORPUS IS THE POINT
 * The positive fixture proves the contract accepts something. The hostile ones
 * prove it refuses the specific things it claims to refuse, each with the exact
 * stable code an audit row would carry. A parser is only as good as the corpus
 * that failed against it.
 */

import { TIA_DIAGNOSTIC_CODES, type TiaDiagnosticCode } from "../diagnostics";

/* ── provenance for everything below ──────────────────────────────────────── */

export const FIXTURE_PRODUCER = "hermes-offline-fixture-producer";

export const FIXTURE_DISCLOSURE =
  "Synthetic offline fixture authored inside the Hermes repository. Not a " +
  "Siemens export, not captured from any TIA Portal installation, controller " +
  "or plant, and not derived from customer data.";

/** A fixed instant, so a canonical digest never depends on when a test ran. */
export const FIXTURE_EPOCH_MS = 1_756_857_600_000;

export function fixtureProvenance(): Record<string, unknown> {
  return {
    origin: "imported",
    producer: FIXTURE_PRODUCER,
    recordedAtEpochMs: FIXTURE_EPOCH_MS,
    recordedBy: FIXTURE_PRODUCER,
    disclosure: FIXTURE_DISCLOSURE,
  };
}

/* ── declared digests ─────────────────────────────────────────────────────── */

/**
 * Invented 64-hex digests.
 *
 * They are well-formed so the schema accepts them and meaningless so nobody can
 * mistake them for evidence: C2.0 reads no bytes, so it verifies no entry digest
 * and asserts nothing about them beyond their shape.
 */
const D1 = "a1".repeat(32);
const D2 = "b2".repeat(32);
const D3 = "c3".repeat(32);
const D4 = "d4".repeat(32);
const D5 = "e5".repeat(32);

/* ── Unicode path forms ───────────────────────────────────────────────────── */

/**
 * "café.scl" in both normalization forms, built from code points.
 *
 * Typed literally these two would be whatever the file's own encoding produced,
 * and the test would be vacuous. Built this way they are provably different
 * strings that render identically.
 */
export const PATH_CAFE_NFC = "blocks/caf" + String.fromCodePoint(0x00e9) + ".scl";
export const PATH_CAFE_NFD = "blocks/cafe" + String.fromCodePoint(0x0301) + ".scl";

/* ── the positive fixture ─────────────────────────────────────────────────── */

/**
 * A well-formed normalized manifest.
 *
 * Entries are deliberately emitted OUT of canonical order, and one path uses
 * backslashes with a redundant separator. A validator that merely echoed its
 * input would pass a weaker test; this one has to normalise and re-sort.
 */
export function validManifestInput(): Record<string, unknown> {
  return {
    schemaVersion: "1.0",
    packageKind: "normalized-manifest",
    declaredContainerExtension: ".json",
    declaredTiaVersion: "V17",
    project: { name: "Line 12  Bottling", revision: 3 },
    sourceBytesSha256: D5,
    entries: [
      { path: "symbols/global.tags", kind: "symbol-table", declaredByteSize: 4_096, declaredSha256: D2 },
      { path: "blocks\\\\FC_Motor.scl", kind: "source-block", declaredByteSize: 8_192, declaredSha256: D1 },
      { path: "meta/project.info", kind: "project-metadata", declaredByteSize: 512, declaredSha256: D3 },
      { path: "hmi/Overview.screen", kind: "hmi-screen", declaredByteSize: 16_384, declaredSha256: D4 },
    ],
  };
}

/** The canonical order the validator must produce from `validManifestInput`. */
export const EXPECTED_CANONICAL_ENTRY_ORDER: readonly string[] = Object.freeze([
  "blocks/FC_Motor.scl",
  "hmi/Overview.screen",
  "meta/project.info",
  "symbols/global.tags",
]);

/** The same manifest with its entries listed in a different order. */
export function validManifestInputReordered(): Record<string, unknown> {
  const base = validManifestInput();
  const entries = base.entries as unknown[];
  base.entries = [entries[3], entries[1], entries[2], entries[0]];
  return base;
}

/* ── compile results ──────────────────────────────────────────────────────── */

export function validCompileResultInput(snapshotContentSha256: string): Record<string, unknown> {
  return {
    compileEvidence: "DECLARED",
    snapshotContentSha256,
    declaredAtEpochMs: FIXTURE_EPOCH_MS,
    declaredBy: "offline fixture",
    toolDeclaration: "synthetic-compile-log",
    entries: [
      {
        structuralCode: "SCL-UNDECLARED-SYMBOL",
        severityToken: "ERROR",
        entryPath: "blocks/FC_Motor.scl",
        line: 42,
        untrustedText: "Undeclared identifier 'Motor_101_RunFb'",
      },
      {
        structuralCode: "SCL-UNUSED-TEMP",
        severityToken: "WARNING",
        entryPath: "blocks/FC_Motor.scl",
        line: 17,
        untrustedText: "Temporary variable is never read",
      },
    ],
  };
}

/**
 * The same structural finding described in three languages.
 *
 * Used to prove that severity comes from `severityToken` alone: if any decision
 * ever started reading the text, these three would stop agreeing.
 */
export function localisedCompileResultInputs(
  snapshotContentSha256: string,
): readonly Record<string, unknown>[] {
  const texts = [
    "Error: undeclared identifier",
    "Fehler: nicht deklarierter Bezeichner",
    "خطا: شناسه اعلام‌نشده",
  ];
  return texts.map((untrustedText) => ({
    compileEvidence: "DECLARED",
    snapshotContentSha256,
    declaredAtEpochMs: FIXTURE_EPOCH_MS,
    declaredBy: "offline fixture",
    toolDeclaration: "synthetic-compile-log",
    entries: [
      {
        structuralCode: "SCL-UNDECLARED-SYMBOL",
        severityToken: "ERROR",
        entryPath: "blocks/FC_Motor.scl",
        line: 42,
        untrustedText,
      },
    ],
  }));
}

/* ── the hostile corpus ───────────────────────────────────────────────────── */

export interface HostileFixture {
  /** Stable identifier, used in test names so a failure names the case. */
  readonly id: string;
  /** What the contract must answer with. */
  readonly expectedCode: TiaDiagnosticCode;
  /** One sentence on what is hostile about it. */
  readonly hostility: string;
  readonly build: () => unknown;
}

const C = TIA_DIAGNOSTIC_CODES;

/** Replace the entry list of the positive fixture. */
function withEntries(entries: unknown[]): Record<string, unknown> {
  const base = validManifestInput();
  base.entries = entries;
  return base;
}

function entry(path: unknown): Record<string, unknown> {
  return { path, kind: "source-block", declaredByteSize: 16, declaredSha256: D1 };
}

export const HOSTILE_MANIFEST_FIXTURES: readonly HostileFixture[] = Object.freeze([
  {
    id: "invalid-schema-version",
    expectedCode: C.SCHEMA_VERSION_UNSUPPORTED,
    hostility: "declares a version this build has never validated against",
    build: () => ({ ...validManifestInput(), schemaVersion: "9.9" }),
  },
  {
    id: "absent-schema-version",
    expectedCode: C.SCHEMA_VERSION_UNSUPPORTED,
    hostility: "omits the version, so nothing states which rules apply",
    build: () => {
      const base = validManifestInput();
      delete base.schemaVersion;
      return base;
    },
  },
  {
    id: "unknown-package-kind",
    expectedCode: C.UNSUPPORTED_PACKAGE_KIND,
    hostility: "claims a package kind outside the closed union",
    build: () => ({ ...validManifestInput(), packageKind: "tia-project-archive-v17" }),
  },
  {
    id: "unrecognized-package-kind",
    expectedCode: C.UNSUPPORTED_PACKAGE_KIND,
    hostility: "declares the union's own catch-all member, which is not admitted",
    build: () => ({ ...validManifestInput(), packageKind: "unrecognized" }),
  },
  {
    id: "proprietary-archive-marked-unsupported",
    expectedCode: C.OPAQUE_ARCHIVE_NOT_PARSED,
    hostility: "a proprietary TIA archive; the companion refuses to open it at all",
    build: () => ({
      ...validManifestInput(),
      packageKind: "opaque-archive",
      declaredContainerExtension: ".zap17",
    }),
  },
  {
    id: "duplicate-canonical-path",
    expectedCode: C.DUPLICATE_CANONICAL_PATH,
    hostility: "two entries that normalise to one path — a shadowing attempt",
    build: () =>
      withEntries([entry("blocks/FC_Motor.scl"), entry("blocks\\\\FC_Motor.scl")]),
  },
  {
    id: "absolute-path",
    expectedCode: C.ABSOLUTE_PATH_REJECTED,
    hostility: "escapes the package root by starting at the filesystem root",
    build: () => withEntries([entry("/etc/passwd")]),
  },
  {
    id: "drive-qualified-path",
    expectedCode: C.DRIVE_QUALIFIED_PATH_REJECTED,
    hostility: "names a Windows volume, which no package-relative path may do",
    build: () => withEntries([entry("C:\\\\Windows\\\\System32\\\\drivers\\\\etc\\\\hosts")]),
  },
  {
    id: "path-traversal",
    expectedCode: C.PATH_TRAVERSAL_REJECTED,
    hostility: "climbs out of the package with parent segments",
    build: () => withEntries([entry("blocks/../../../../etc/shadow")]),
  },
  {
    id: "nul-byte-in-path",
    expectedCode: C.NUL_BYTE_IN_PATH,
    hostility: "truncates the path in any consumer that hands it to a C API",
    build: () => withEntries([entry("blocks/FC_Motor.scl\u0000.txt")]),
  },
  {
    id: "path-length-exceeded",
    expectedCode: C.PATH_LENGTH_EXCEEDED,
    hostility: "a path far past the policy bound, aimed at a downstream buffer",
    build: () => withEntries([entry(`blocks/${"a".repeat(600)}.scl`)]),
  },
  {
    id: "path-depth-exceeded",
    expectedCode: C.PATH_DEPTH_EXCEEDED,
    hostility: "nests deeper than the bound while staying short enough to pass length",
    build: () =>
      withEntries([
        entry(`${Array.from({ length: 30 }, (_, i) => `d${i}`).join("/")}/leaf.scl`),
      ]),
  },
  {
    id: "path-not-nfc",
    expectedCode: C.PATH_NOT_NFC,
    hostility:
      "a decomposed path that renders identically to a precomposed one, so both " +
      "would be admitted as separate entries and one could shadow the other",
    build: () => withEntries([entry(PATH_CAFE_NFD)]),
  },
  {
    id: "path-nfc-and-nfd-together",
    expectedCode: C.PATH_NOT_NFC,
    hostility: "both forms in one manifest — the shadowing attempt made explicit",
    build: () => withEntries([entry(PATH_CAFE_NFC), entry(PATH_CAFE_NFD)]),
  },
  {
    id: "unknown-key-smuggled",
    expectedCode: C.MALFORMED_MANIFEST,
    hostility: "carries an extra field a stripping schema would silently drop",
    build: () => ({ ...validManifestInput(), allowControllerDownload: true }),
  },
  {
    id: "unknown-key-in-entry",
    expectedCode: C.MALFORMED_MANIFEST,
    hostility: "smuggles a field into an entry rather than the envelope",
    build: () =>
      withEntries([{ ...entry("blocks/FC_Motor.scl"), executeOnImport: "cmd" }]),
  },
  {
    id: "malformed-entry-digest",
    expectedCode: C.MALFORMED_MANIFEST,
    hostility: "an upper-case digest, which would give one identity two spellings",
    build: () =>
      withEntries([{ ...entry("blocks/FC_Motor.scl"), declaredSha256: D1.toUpperCase() }]),
  },
]);

/* ── hostile compile results ──────────────────────────────────────────────── */

export interface HostileCompileFixture {
  readonly id: string;
  readonly expectedCode: TiaDiagnosticCode;
  readonly hostility: string;
  /** Built against the digest of the snapshot under test. */
  readonly build: (snapshotContentSha256: string) => unknown;
}

export const HOSTILE_COMPILE_FIXTURES: readonly HostileCompileFixture[] = Object.freeze([
  {
    id: "unbound-compile-result",
    expectedCode: C.COMPILE_RESULT_UNBOUND,
    hostility: "a genuine-looking result bound to a different project state",
    build: (digest) => ({
      ...validCompileResultInput(digest),
      snapshotContentSha256: "0".repeat(64),
    }),
  },
  {
    id: "compile-result-missing-binding",
    expectedCode: C.COMPILE_RESULT_MALFORMED,
    hostility: "no binding field at all — structurally invalid, not merely misbound",
    build: (digest) => {
      const base = validCompileResultInput(digest);
      delete base.snapshotContentSha256;
      return base;
    },
  },
  {
    id: "forged-stronger-evidence",
    expectedCode: C.COMPILE_EVIDENCE_NOT_DECLARED,
    hostility: "claims an evidence strength this architecture cannot produce",
    build: (digest) => ({ ...validCompileResultInput(digest), compileEvidence: "VERIFIED" }),
  },
  {
    id: "absent-evidence",
    expectedCode: C.COMPILE_EVIDENCE_NOT_DECLARED,
    hostility: "omits the evidence field, hoping a default fills it in",
    build: (digest) => {
      const base = validCompileResultInput(digest);
      delete base.compileEvidence;
      return base;
    },
  },
  {
    id: "compile-entry-bidi-override",
    expectedCode: C.UNSAFE_TEXT_CONTROL_CHARACTERS,
    hostility:
      "a right-to-left override inside the display text, which reorders the " +
      "surrounding message so it reads as something other than what it says",
    build: (digest) => ({
      ...validCompileResultInput(digest),
      entries: [
        {
          structuralCode: "SCL-UNDECLARED-SYMBOL",
          severityToken: "ERROR",
          entryPath: null,
          line: null,
          untrustedText: "safe" + String.fromCodePoint(0x202e) + "reversed",
        },
      ],
    }),
  },
  {
    id: "compile-entry-c0-control",
    expectedCode: C.UNSAFE_TEXT_CONTROL_CHARACTERS,
    hostility: "a NUL inside display text, which truncates any C consumer downstream",
    build: (digest) => ({
      ...validCompileResultInput(digest),
      entries: [
        {
          structuralCode: "SCL-UNDECLARED-SYMBOL",
          severityToken: "ERROR",
          entryPath: null,
          line: null,
          untrustedText: "before" + String.fromCodePoint(0x00) + "after",
        },
      ],
    }),
  },
  {
    id: "compile-tool-declaration-bidi",
    expectedCode: C.UNSAFE_TEXT_CONTROL_CHARACTERS,
    hostility: "the same trick moved out of the entries and into the envelope",
    build: (digest) => ({
      ...validCompileResultInput(digest),
      toolDeclaration: "tool" + String.fromCodePoint(0x202d) + "spoof",
    }),
  },
  {
    id: "compile-entry-count-exceeded",
    expectedCode: C.COMPILE_RESULT_MALFORMED,
    hostility: "more entries than the schema admits",
    build: (digest) => ({
      ...validCompileResultInput(digest),
      entries: Array.from({ length: 50_001 }, () => ({
        structuralCode: "SCL-X",
        severityToken: "INFO",
        entryPath: null,
        line: null,
        untrustedText: "synthetic",
      })),
    }),
  },
  {
    id: "compile-negative-timestamp",
    expectedCode: C.COMPILE_RESULT_MALFORMED,
    hostility: "an instant before the epoch, which no compile can have happened at",
    build: (digest) => ({ ...validCompileResultInput(digest), declaredAtEpochMs: -1 }),
  },
  {
    id: "compile-structural-code-is-prose",
    expectedCode: C.COMPILE_RESULT_MALFORMED,
    hostility: "a sentence where a structural identifier belongs",
    build: (digest) => ({
      ...validCompileResultInput(digest),
      entries: [
        {
          structuralCode: "the symbol was not declared anywhere",
          severityToken: "ERROR",
          entryPath: null,
          line: null,
          untrustedText: "synthetic",
        },
      ],
    }),
  },
  {
    id: "compile-entry-path-traversal",
    expectedCode: C.PATH_TRAVERSAL_REJECTED,
    hostility: "points a finding outside the package, at a file on the host",
    build: (digest) => ({
      ...validCompileResultInput(digest),
      entries: [
        {
          structuralCode: "SCL-UNDECLARED-SYMBOL",
          severityToken: "ERROR",
          entryPath: "../../../../etc/passwd",
          line: 1,
          untrustedText: "synthetic",
        },
      ],
    }),
  },
  {
    id: "compile-entry-prose-severity",
    expectedCode: C.COMPILE_RESULT_MALFORMED,
    hostility: "supplies a translated severity word where a structural token belongs",
    build: (digest) => ({
      ...validCompileResultInput(digest),
      entries: [
        {
          structuralCode: "SCL-UNDECLARED-SYMBOL",
          severityToken: "Fehler",
          entryPath: null,
          line: null,
          untrustedText: "synthetic",
        },
      ],
    }),
  },
]);

/* ── hostile capability declarations ──────────────────────────────────────── */

/**
 * Capability objects that declare something the type system forbids.
 *
 * Built as plain records and typed `unknown` on purpose: the point is to
 * simulate a capability set that arrived as parsed JSON, where the literal
 * `false` types have been erased and only the runtime guard is left standing.
 */
export const HOSTILE_CAPABILITY_FIXTURES: readonly {
  readonly id: string;
  readonly hostility: string;
  readonly build: () => unknown;
}[] = Object.freeze([
  {
    id: "declares-controller-download",
    hostility: "the single capability this whole phase exists to make impossible",
    build: () => ({ ...permittedCapabilityRecord(), canDownloadToController: true }),
  },
  {
    id: "declares-tag-write",
    hostility: "a write path to live process data",
    build: () => ({ ...permittedCapabilityRecord(), canWriteTags: true }),
  },
  {
    id: "declares-openness-invocation",
    hostility: "would require a Siemens installation and an out-of-process call",
    build: () => ({ ...permittedCapabilityRecord(), canInvokeOpenness: true }),
  },
  {
    id: "declares-external-process-launch",
    hostility: "arbitrary execution on the host, dressed as a capability flag",
    build: () => ({ ...permittedCapabilityRecord(), canLaunchExternalProcess: true }),
  },
  {
    id: "omits-forbidden-capability",
    hostility: "leaves the flag out so `undefined` reads as falsy without being false",
    build: () => {
      const record = permittedCapabilityRecord();
      delete record.canConnectToController;
      return record;
    },
  },
  {
    id: "forbidden-capability-as-truthy-string",
    hostility: 'sets the flag to the string "false", which is truthy',
    build: () => ({ ...permittedCapabilityRecord(), canExecuteCompile: "false" }),
  },
]);

/** A record shaped like a capability set, with every forbidden flag correct. */
function permittedCapabilityRecord(): Record<string, unknown> {
  return {
    canConnectToController: false,
    canDownloadToController: false,
    canUploadFromController: false,
    canWriteTags: false,
    canExecuteCompile: false,
    canInvokeOpenness: false,
    canLaunchExternalProcess: false,
    canValidateManifestOffline: true,
    canNormalizeOfflineFixture: true,
    canHashSnapshot: true,
    canDeclareSemanticContracts: true,
    canIngestDeclaredCompileResult: true,
  };
}

/* ── hostile provenance ───────────────────────────────────────────────────── */

export const HOSTILE_PROVENANCE_FIXTURES: readonly {
  readonly id: string;
  readonly expectedCode: TiaDiagnosticCode;
  readonly hostility: string;
  readonly build: () => unknown;
}[] = Object.freeze([
  {
    id: "origin-live-readonly",
    expectedCode: C.FORBIDDEN_ORIGIN,
    hostility: "claims a connection to real equipment, in read-only clothing",
    build: () => ({ ...fixtureProvenance(), origin: "live-readonly" }),
  },
  {
    id: "origin-live-controlled",
    expectedCode: C.FORBIDDEN_ORIGIN,
    hostility: "claims a controlling connection to real equipment",
    build: () => ({ ...fixtureProvenance(), origin: "live-controlled" }),
  },
  {
    id: "origin-outside-union",
    expectedCode: C.FORBIDDEN_ORIGIN,
    hostility: "a value no member of the union — what untrusted input looks like",
    build: () => ({ ...fixtureProvenance(), origin: "production-plc" }),
  },
  {
    id: "provenance-bidi-in-disclosure",
    expectedCode: C.UNSAFE_TEXT_CONTROL_CHARACTERS,
    hostility:
      "a right-to-left override in the one field whose whole job is to say what " +
      "the data is NOT — reordering it inverts the disclaimer",
    build: () => ({
      ...fixtureProvenance(),
      disclosure: "Not a Siemens export" + String.fromCodePoint(0x202e) + " reversed",
    }),
  },
  {
    id: "provenance-control-in-producer",
    expectedCode: C.UNSAFE_TEXT_CONTROL_CHARACTERS,
    hostility: "a C0 control smuggled into an identity field that lands in audit rows",
    build: () => ({
      ...fixtureProvenance(),
      producer: "adapter" + String.fromCodePoint(0x07) + "bell",
    }),
  },
  {
    id: "provenance-rlm-in-recorded-by",
    expectedCode: C.UNSAFE_TEXT_CONTROL_CHARACTERS,
    hostility:
      "a RIGHT-TO-LEFT MARK, which unlike ZWNJ is not orthography — it only " +
      "steers bidi resolution",
    build: () => ({
      ...fixtureProvenance(),
      recordedBy: "engineer" + String.fromCodePoint(0x200f) + "name",
    }),
  },
  {
    id: "provenance-producer-too-long",
    expectedCode: C.PROVENANCE_MISSING,
    hostility: "an unbounded identity field",
    build: () => ({ ...fixtureProvenance(), producer: "p".repeat(192) }),
  },
  {
    id: "provenance-absent",
    expectedCode: C.PROVENANCE_MISSING,
    hostility: "no provenance at all, so nothing states where the data came from",
    build: () => null,
  },
  {
    id: "provenance-without-disclosure",
    expectedCode: C.PROVENANCE_MISSING,
    hostility: "drops the one field that says what the data is not",
    build: () => {
      const record = fixtureProvenance();
      delete record.disclosure;
      return record;
    },
  },
]);
