/**
 * PHASE 109-C2.0 — TIA companion domain contract.
 *
 * WHAT THIS ROUND IS, STATED PLAINLY
 * ----------------------------------
 * C2.0 ships CONTRACTS and OFFLINE FIXTURES. It does not read an archive, does
 * not parse XML, does not touch a database, does not expose a route and does not
 * contact any Siemens tooling. Anything in this module that names a proprietary
 * container names it in order to REFUSE it.
 *
 * NO PROPRIETARY ARCHIVE IS PARSED
 * A TIA project archive (`.apXX`, `.zapXX` and relatives) is a proprietary
 * container. This companion does not open one, and no code path in C2.0 claims
 * to. Such an input is classified `opaque-archive` and fails closed as
 * `UNSUPPORTED_FORMAT`. The one package kind C2.0 admits is a Hermes-normalized
 * offline manifest, which is a JSON document this repository defines.
 *
 * NO EXTENSION-ONLY TRUST
 * A declared file extension is an ASSERTION BY THE UPLOADER. It is recorded as
 * evidence and it is allowed to LOWER the classification of an input, but it can
 * never raise it: `classifyDeclaredContainer` is total and provably cannot
 * return the admitted kind. Admission comes from the manifest's own structure,
 * validated against a strict schema.
 *
 * NO CONTROLLER REACH, AT THE TYPE LEVEL
 * The seven controller/write/execution capabilities are typed `false` — the
 * literal type, not `boolean`. An adapter that tries to declare one of them
 * `true` does not fail a review; it fails to compile.
 */

import { compareCodepoints } from "./canonical";
import { TIA_DIAGNOSTIC_CODES, type TiaDiagnosticCode } from "./diagnostics";

/* ── the permanent safety contract ────────────────────────────────────────── */

/**
 * The facts this phase asserts about itself, in one readable place.
 *
 * Written as literal types so they are checked by the compiler, and re-asserted
 * by a runtime test so a future edit that widens a type is caught either way.
 */
export const TIA_SAFETY_CONTRACT = Object.freeze({
  DIRECT_PLC_DOWNLOAD: false as const,
  REAL_PLC_CONTACT: false as const,
  LIVE_CONNECTION_MODE: "READ_ONLY" as const,
  EXPORT_FIRST: true as const,
  ENGINEER_APPROVAL_REQUIRED: true as const,
  SIMULATION_BEFORE_EXPORT: true as const,
  AUTOMATIC_CODE_APPLICATION: false as const,
  AUTOMATIC_ENGINEERING_APPROVAL: false as const,
  AUTOMATIC_OT_ACTION: false as const,
  PRODUCTION_CONTACT: false as const,
  SIS_AND_SAFETY_PLC_SCOPE: "REVIEW_ONLY" as const,
});

/* ── package kinds ────────────────────────────────────────────────────────── */

/**
 * What an input IS, as far as this companion is concerned. Closed union.
 *
 *   normalized-manifest  a Hermes-defined JSON manifest. The ONLY admitted kind.
 *   opaque-archive       a container this companion deliberately does not open.
 *   unrecognized         anything else, including an absent or unreadable kind.
 */
export type TiaPackageKind = "normalized-manifest" | "opaque-archive" | "unrecognized";

export const TIA_PACKAGE_KINDS: readonly TiaPackageKind[] = [
  "normalized-manifest",
  "opaque-archive",
  "unrecognized",
] as const;

/** The kinds C2.0 admits. Exactly one, and it is not an archive. */
export const ADMITTED_PACKAGE_KINDS: readonly TiaPackageKind[] = [
  "normalized-manifest",
] as const;

export function isTiaPackageKind(value: unknown): value is TiaPackageKind {
  return typeof value === "string" && (TIA_PACKAGE_KINDS as readonly string[]).includes(value);
}

/**
 * Container extensions this companion recognises AS CONTAINERS IT WILL NOT OPEN.
 *
 * The list exists so an opaque archive is refused with the precise code
 * `OPAQUE_ARCHIVE_NOT_PARSED` rather than the vague `unrecognized`; being able
 * to say "this is a TIA archive and we do not parse it" is more useful to an
 * engineer than "unknown input". It is NOT an allowlist and grants nothing.
 */
export const KNOWN_OPAQUE_CONTAINER_EXTENSIONS: readonly string[] = [
  ".ap13", ".ap14", ".ap15", ".ap16", ".ap17", ".ap18", ".ap19", ".ap20",
  ".zap13", ".zap14", ".zap15", ".zap16", ".zap17", ".zap18", ".zap19", ".zap20",
  ".zip", ".7z", ".rar", ".tar", ".gz", ".cab",
] as const;

/**
 * Classify an input from its DECLARED extension alone.
 *
 * Total, and provably incapable of returning `"normalized-manifest"`: an
 * extension is a claim by whoever uploaded the file, and a claim must never be
 * the thing that grants admission. A test asserts the impossibility across the
 * whole extension space this function can see, including `.json`.
 */
export function classifyDeclaredContainer(
  declaredExtension: string,
): Exclude<TiaPackageKind, "normalized-manifest"> {
  if (typeof declaredExtension !== "string") return "unrecognized";
  // ASCII-only lowering: `toLowerCase()` is locale-sensitive for a handful of
  // characters (the Turkish dotted/dotless I among them), and a classification
  // that depends on the host's locale is not a classification.
  const normalised = declaredExtension.replace(/[A-Z]/g, (c) =>
    String.fromCharCode(c.charCodeAt(0) + 32),
  );
  return (KNOWN_OPAQUE_CONTAINER_EXTENSIONS as readonly string[]).includes(normalised)
    ? "opaque-archive"
    : "unrecognized";
}

/** Admission verdict for a package kind. Fail-closed: unknown input is refused. */
export function admitPackageKind(
  kind: unknown,
): { admitted: true; kind: TiaPackageKind } | { admitted: false; code: TiaDiagnosticCode } {
  if (!isTiaPackageKind(kind)) {
    return { admitted: false, code: TIA_DIAGNOSTIC_CODES.UNSUPPORTED_PACKAGE_KIND };
  }
  if (kind === "opaque-archive") {
    return { admitted: false, code: TIA_DIAGNOSTIC_CODES.OPAQUE_ARCHIVE_NOT_PARSED };
  }
  if (!(ADMITTED_PACKAGE_KINDS as readonly string[]).includes(kind)) {
    return { admitted: false, code: TIA_DIAGNOSTIC_CODES.UNSUPPORTED_PACKAGE_KIND };
  }
  return { admitted: true, kind };
}

/* ── entry kinds ──────────────────────────────────────────────────────────── */

/**
 * What a manifest entry describes. Closed union.
 *
 * `opaque` is the honest member: an entry whose content this round does not
 * interpret. Naming it is better than omitting it, because a manifest that
 * contains material we do not understand should say so rather than look empty.
 */
export type TiaEntryKind =
  | "source-block"
  | "symbol-table"
  | "hmi-screen"
  | "project-metadata"
  | "compile-log"
  | "opaque";

export const TIA_ENTRY_KINDS: readonly TiaEntryKind[] = [
  "source-block",
  "symbol-table",
  "hmi-screen",
  "project-metadata",
  "compile-log",
  "opaque",
] as const;

/* ── declared bounds ──────────────────────────────────────────────────────── */

/**
 * Bounds C2.0 ACTUALLY ENFORCES on a canonical manifest.
 *
 * Every value here is applied by `validateManifest` to a field of a JSON
 * document. None of them describes decompression, expansion or container
 * traversal, because this round performs none of those things. An earlier
 * revision published `maxUncompressedBytes` and `maxCompressionRatio` here;
 * they were withdrawn under C2.0 CORRECTION 3, because a published limit on
 * decompression reads as permission to decompress, and no such permission
 * exists. Whatever bounds an archive reader eventually needs will be decided
 * with that reader, against a real fixture, under its own approval.
 *
 * `maxEntryPathLength` and `maxEntryPathSegments` are deliberately identical to
 * the Phase 109-C1 `PROJECT_LIMITS` values. A test pins that equality: if the
 * two modules disagreed, a path could be admitted by one and refused by the
 * other, and the pair would silently stop agreeing on what a project contains.
 */
export const TIA_PACKAGE_LIMITS = Object.freeze({
  /** Entries a manifest may declare. Enforced by the schema's array bound. */
  maxEntries: 20_000,
  /**
   * Upper bound on the `declaredByteSize` INTEGER of one entry.
   *
   * It bounds a number written in a JSON document. It asserts nothing about any
   * file, authorises no reading and no expansion, and is not an archive limit.
   */
  maxDeclaredEntryBytes: 64 * 1024 * 1024,
  /** Matches PROJECT_LIMITS.maxPathLength in Phase 109-C1. */
  maxEntryPathLength: 512,
  /** Matches PROJECT_LIMITS.maxPathSegments in Phase 109-C1. */
  maxEntryPathSegments: 24,
  /** Bound on any untrusted free-text this module carries for display. */
  maxUntrustedTextLength: 2_000,
  /** Bound on the producing adapter or system named in a provenance record. */
  maxProducerLength: 191,
  /** Bound on the responsible engineer named in a provenance record. */
  maxRecordedByLength: 191,
  /** Bound on the provenance disclosure statement. */
  maxDisclosureLength: 500,
});

/* ── bounded-text safety ──────────────────────────────────────────────────── */

/**
 * Characters refused in every bounded text field this module carries.
 *
 * WHY REFUSE RATHER THAN STRIP
 * A compile message containing a right-to-left override is EVIDENCE about the
 * producer. Silently rewriting it destroys that evidence and leaves the reviewer
 * looking at a sanitised string with no indication anything was there — exactly
 * the argument that keeps a traversal path visible in its finding rather than
 * blanked.
 *
 * WHY BIDI CONTROLS ARE NOT MERELY COSMETIC HERE
 * U+202A–U+202E and U+2066–U+2069 reorder the text AROUND them when rendered.
 * A compile message can therefore be made to READ as something other than what
 * it says. This product renders Persian RTL beside English LTR, so such a
 * character does not look out of place in a review surface — which is precisely
 * what makes it usable.
 *
 * WHAT IS DELIBERATELY NOT REFUSED
 *   - U+200C ZERO WIDTH NON-JOINER and U+200D ZERO WIDTH JOINER. These are
 *     ORDINARY PERSIAN ORTHOGRAPHY. Refusing them would reject correctly written
 *     Persian, and this repository requires correct ZWNJ usage.
 *   - TAB, LF and CR, which are legitimate structure in a compile log.
 *   - Every ordinary letter, mark and punctuation in any script.
 *
 * U+200E LEFT-TO-RIGHT MARK and U+200F RIGHT-TO-LEFT MARK ARE refused: unlike
 * ZWNJ they carry no orthographic meaning, they only steer bidi resolution, and
 * no product requirement asks for them in these fields.
 */
export const REFUSED_TEXT_CODEPOINTS = Object.freeze({
  /** C0 controls except TAB (09), LF (0A) and CR (0D). */
  c0: (cp: number) => cp <= 0x1f && cp !== 0x09 && cp !== 0x0a && cp !== 0x0d,
  /** DELETE. */
  del: (cp: number) => cp === 0x7f,
  /** C1 controls, which are invisible and serve no purpose in these fields. */
  c1: (cp: number) => cp >= 0x80 && cp <= 0x9f,
  /** LRM / RLM. Not orthography — bidi steering only. */
  directionalMarks: (cp: number) => cp === 0x200e || cp === 0x200f,
  /** Bidi embedding, override and pop. */
  bidiEmbedding: (cp: number) => cp >= 0x202a && cp <= 0x202e,
  /** Bidi isolate controls. */
  bidiIsolate: (cp: number) => cp >= 0x2066 && cp <= 0x2069,
});

/** Why a text field is refused, or null when it is acceptable. */
export function unsafeTextReason(value: string): string | null {
  let index = 0;
  for (const character of value) {
    const cp = character.codePointAt(0) as number;
    for (const [reason, matches] of Object.entries(REFUSED_TEXT_CODEPOINTS)) {
      if (matches(cp)) {
        return `${reason}:U+${cp.toString(16).toUpperCase().padStart(4, "0")}@${index}`;
      }
    }
    index += 1;
  }
  return null;
}

export function isSafeBoundedText(value: unknown): boolean {
  return typeof value === "string" && unsafeTextReason(value) === null;
}

/* ── the archive-ingest decision ──────────────────────────────────────────── */

/**
 * The recorded position on reading container formats.
 *
 * Written as data rather than prose so a test can pin it, following the
 * precedent Phase 109-C1 set when it recorded `MONACO_DEPENDENCY_DECISION =
 * DEFERRED` in its editor seam. It grants nothing: every value is a refusal or
 * a hold.
 *
 * An earlier C2 plan proposed a dependency-free in-house ZIP reader built on
 * `node:zlib`. That proposal is WITHDRAWN and NOT APPROVED. `node:zlib` is a
 * DEFLATE codec, not a ZIP container parser; treating it as one understates the
 * work — central directory, ZIP64, encoding, entry attributes, symlink and
 * traversal handling — and hand-rolling that on the ingest path of an
 * industrial product is not a decision a slice may take on its own.
 *
 * C2.1 may proceed only after: a dependency security, maintenance and licence
 * assessment; an exact supported-format decision; a resource-budget decision;
 * at least one owner-supplied anonymised real export fixture; and separate
 * Codex approval.
 */
export const ARCHIVE_INGEST_DECISION = Object.freeze({
  ARCHIVE_PARSER_DECISION: "DEFERRED" as const,
  IN_HOUSE_ZIP_PARSER: "NOT_APPROVED" as const,
  PROPRIETARY_TIA_ARCHIVE: "UNSUPPORTED" as const,
  C2_1_ARCHIVE_INGEST: "HOLD" as const,
});

/* ── path classification ──────────────────────────────────────────────────── */

export type EntryPathVerdict =
  | { readonly ok: true; readonly canonical: string }
  | { readonly ok: false; readonly code: TiaDiagnosticCode };

/**
 * Classify and normalise a manifest entry path, or refuse it with a stable code.
 *
 * REFUSAL, NOT SANITISATION — the same decision Phase 109-C1 made for artifact
 * paths. Rewriting `../../etc/passwd` into something harmless would erase the
 * fact that something produced it; a traversal attempt is a finding.
 *
 * This returns a CODE where C1's `normaliseArtifactPath` throws a single error
 * type carrying prose. Both are needed: the code is what an audit row and a
 * review quote, and C1's normaliser stays the authority on the resulting shape.
 * A contract test runs every hostile fixture through BOTH and asserts they agree
 * on every rejection and produce byte-identical output on every acceptance, so
 * the pair cannot drift into disagreeing about what a valid path is.
 */
export function classifyEntryPath(raw: unknown): EntryPathVerdict {
  const C = TIA_DIAGNOSTIC_CODES;
  if (typeof raw !== "string" || raw.length === 0) {
    return { ok: false, code: C.MALFORMED_MANIFEST };
  }
  if (raw.includes("\0")) {
    return { ok: false, code: C.NUL_BYTE_IN_PATH };
  }
  if (raw.length > TIA_PACKAGE_LIMITS.maxEntryPathLength) {
    return { ok: false, code: C.PATH_LENGTH_EXCEEDED };
  }
  // NORMALIZATION FORM C IS REQUIRED, AND A NON-NFC PATH IS REFUSED RATHER THAN
  // NORMALISED.
  //
  // "café.scl" written precomposed (U+00E9) and decomposed (U+0065 U+0301)
  // render identically and are different strings, so both would be admitted as
  // two separate entries with the same visible name. On a case-insensitive or
  // normalising filesystem — APFS, HFS+ — one then silently overwrites the
  // other. That is a shadowing vector, and the duplicate check cannot see it.
  //
  // Normalising silently would close the shadowing hole but open a quieter one:
  // the path an engineer submitted would no longer be the path recorded, and the
  // digest would cover a string nobody wrote. Refusal keeps identity honest and
  // puts the decision back on the producer, which is where it belongs.
  //
  // NFC, never NFKC: NFKC folds compatibility characters, so it would map
  // genuinely different engineering identifiers onto one another.
  //
  // Checked BEFORE separator unification, on the submitted bytes. Replacing "\"
  // with "/" cannot change a string's normalization form, so the order is a
  // matter of reporting on what arrived rather than on what we made of it.
  if (raw.normalize("NFC") !== raw) {
    return { ok: false, code: C.PATH_NOT_NFC };
  }
  const unified = raw.replace(/\\/g, "/");
  if (/^[A-Za-z]:/.test(unified)) {
    // Checked BEFORE the leading-slash test: `C:/x` and `/C:/x` are both
    // drive-qualified, and reporting the second as merely "absolute" would
    // describe the finding less precisely than the evidence allows.
    return { ok: false, code: C.DRIVE_QUALIFIED_PATH_REJECTED };
  }
  if (unified.startsWith("/")) {
    return { ok: false, code: C.ABSOLUTE_PATH_REJECTED };
  }
  const segments = unified.split("/").filter((s) => s.length > 0);
  if (segments.length === 0) {
    return { ok: false, code: C.MALFORMED_MANIFEST };
  }
  if (segments.length > TIA_PACKAGE_LIMITS.maxEntryPathSegments) {
    return { ok: false, code: C.PATH_DEPTH_EXCEEDED };
  }
  for (const segment of segments) {
    if (segment === "." || segment === "..") {
      return { ok: false, code: C.PATH_TRAVERSAL_REJECTED };
    }
  }
  return { ok: true, canonical: segments.join("/") };
}

/** Canonical entry order: by canonical path, in code-point order. */
export function compareEntryPaths(a: string, b: string): number {
  return compareCodepoints(a, b);
}

/* ── adapter capabilities ─────────────────────────────────────────────────── */

/**
 * What an adapter can do.
 *
 * The first seven fields are typed with the LITERAL `false`, not `boolean`. That
 * is the whole mechanism: an adapter cannot declare `canDownloadToController:
 * true` and be reviewed for it later, because the assignment does not type-check.
 * The compiler enforces the safety contract that prose alone would only describe.
 *
 * The remaining fields are genuine booleans because they describe work that is
 * legitimately optional between adapters, and all of it is offline.
 */
export interface TiaAdapterCapabilities {
  /* Permanently unavailable. Literal `false`, by design. */
  readonly canConnectToController: false;
  readonly canDownloadToController: false;
  readonly canUploadFromController: false;
  readonly canWriteTags: false;
  readonly canExecuteCompile: false;
  readonly canInvokeOpenness: false;
  readonly canLaunchExternalProcess: false;

  /* Offline work an adapter may legitimately offer. */
  readonly canValidateManifestOffline: boolean;
  readonly canNormalizeOfflineFixture: boolean;
  readonly canHashSnapshot: boolean;
  readonly canDeclareSemanticContracts: boolean;
  readonly canIngestDeclaredCompileResult: boolean;
}

/** The field names that must be literal `false` in every adapter, ever. */
export const FORBIDDEN_CAPABILITY_KEYS: readonly (keyof TiaAdapterCapabilities)[] = [
  "canConnectToController",
  "canDownloadToController",
  "canUploadFromController",
  "canWriteTags",
  "canExecuteCompile",
  "canInvokeOpenness",
  "canLaunchExternalProcess",
] as const;

/**
 * A runtime re-check of what the type system already guarantees.
 *
 * Redundant while every adapter is written in TypeScript inside this repository
 * — which is exactly why it is here: the day a capability object is built from
 * parsed JSON, the type is erased and this function is the surviving guard.
 */
export function forbiddenCapabilityViolations(
  capabilities: unknown,
): readonly string[] {
  if (capabilities === null || typeof capabilities !== "object") {
    return [...FORBIDDEN_CAPABILITY_KEYS];
  }
  const record = capabilities as Record<string, unknown>;
  return FORBIDDEN_CAPABILITY_KEYS.filter((key) => record[key] !== false);
}

/**
 * An adapter that can present a TIA package to the companion.
 *
 * C2.0 defines the interface and ships exactly one implementation, over offline
 * fixtures. Naming TIA Openness in a type and a document is how the boundary is
 * DESCRIBED; nothing here invokes it, and `canInvokeOpenness` is literally false.
 */
export interface TiaAdapter {
  readonly id: string;
  /** Translation key. Rendered to a user, so it must not claim a missing capability. */
  readonly descriptionKey: string;
  readonly capabilities: TiaAdapterCapabilities;
  /** Manifest schema versions this adapter understands. */
  readonly supportedSchemaVersions: readonly string[];
  /** Package kinds this adapter will admit. Never includes an archive kind. */
  readonly admittedPackageKinds: readonly TiaPackageKind[];
}

/**
 * Negotiate what an adapter may be used for.
 *
 * Fail-closed on every axis: an unknown schema version, an unadmitted package
 * kind, or any forbidden capability declared true all produce a refusal with a
 * stable code rather than a reduced-functionality "yes".
 */
export function negotiateAdapter(
  adapter: TiaAdapter,
  request: { readonly schemaVersion: string; readonly packageKind: unknown },
):
  | { readonly ok: true }
  | { readonly ok: false; readonly code: TiaDiagnosticCode } {
  if (forbiddenCapabilityViolations(adapter.capabilities).length > 0) {
    return { ok: false, code: TIA_DIAGNOSTIC_CODES.FORBIDDEN_CONTROLLER_CAPABILITY };
  }
  if (!adapter.supportedSchemaVersions.includes(request.schemaVersion)) {
    return { ok: false, code: TIA_DIAGNOSTIC_CODES.SCHEMA_VERSION_UNSUPPORTED };
  }
  const admission = admitPackageKind(request.packageKind);
  if (!admission.admitted) {
    return { ok: false, code: admission.code };
  }
  if (!adapter.admittedPackageKinds.includes(admission.kind)) {
    return { ok: false, code: TIA_DIAGNOSTIC_CODES.UNSUPPORTED_PACKAGE_KIND };
  }
  return { ok: true };
}

/* ── errors ───────────────────────────────────────────────────────────────── */

/** A contract violation carrying the stable code a reviewer will quote. */
export class TiaContractError extends Error {
  readonly code: TiaDiagnosticCode;
  constructor(code: TiaDiagnosticCode, detail: string) {
    super(`[tia-companion] ${code}: ${detail}`);
    this.name = "TiaContractError";
    this.code = code;
  }
}
