/**
 * PHASE 109-C2.0 — the TIA package manifest.
 *
 * A manifest is a Hermes-defined JSON document describing what a package
 * CLAIMS to contain. It is the only package shape C2.0 admits, and it is not a
 * proprietary format: no TIA archive is opened anywhere in this round.
 *
 * Every schema object is `.strict()`. That is not decoration. Zod's default is
 * to STRIP unknown keys, so a payload carrying a field the schema does not know
 * about validates cleanly and arrives with the field silently gone — a failure
 * mode this repository has already been bitten by, where a builder dropped whole
 * collections and every test still passed. For an integrity format the stakes
 * are higher: a stripped field changes the canonical bytes, so the same document
 * would hash differently depending on which schema version read it. Unknown key
 * ⇒ refusal.
 *
 * VALIDATION IS TWO LAYERS, DELIBERATELY
 *   1. the Zod schema answers "is this structurally a manifest";
 *   2. `validateManifest` answers "is it admissible", and it is the layer that
 *      produces stable `AES-C2-NNN` codes.
 * Zod issues are excellent for developers and useless as an audit vocabulary; a
 * code is what an engineer quotes and an audit row stores.
 */

import { z } from "zod";

import { normalizeIdentifier } from "@/lib/ot-edge/import-envelope";

import { canonicalSha256, isSha256Hex, stableStringify } from "./canonical";
import {
  admitPackageKind,
  ADMITTED_PACKAGE_KINDS,
  classifyEntryPath,
  compareEntryPaths,
  TIA_ENTRY_KINDS,
  TIA_PACKAGE_LIMITS,
  unsafeTextReason,
  type TiaEntryKind,
  type TiaPackageKind,
} from "./contract";
import {
  diagnostic,
  TIA_DIAGNOSTIC_CODES,
  type TiaDiagnostic,
  type TiaDiagnosticCode,
} from "./diagnostics";

/* ── versions ─────────────────────────────────────────────────────────────── */

/**
 * Manifest schema versions this round understands.
 *
 * Its own version space, independent of the Phase 94 `ImportEnvelope`'s "1.0".
 * Sharing a version string between two schemas that can evolve separately is how
 * a document ends up validating against the wrong one.
 */
export const SUPPORTED_MANIFEST_SCHEMA_VERSIONS = ["1.0"] as const;

export type TiaManifestSchemaVersion = (typeof SUPPORTED_MANIFEST_SCHEMA_VERSIONS)[number];

/* ── schemas ──────────────────────────────────────────────────────────────── */

const Sha256Schema = z
  .string()
  .regex(/^[0-9a-f]{64}$/, "expected a lowercase 64-character SHA-256 digest");

/**
 * The literal tuples the schemas enumerate.
 *
 * Written out rather than derived from the exported `readonly` arrays because
 * `z.enum` needs a literal tuple to infer its union, and an assertion that
 * launders an array into a tuple would defeat the type checking it is there to
 * provide. A contract test asserts each tuple equals its exported counterpart as
 * a SET, so the duplication cannot drift.
 */
export const ENTRY_KIND_TUPLE = [
  "source-block",
  "symbol-table",
  "hmi-screen",
  "project-metadata",
  "compile-log",
  "opaque",
] as const;

export const PACKAGE_KIND_TUPLE = [
  "normalized-manifest",
  "opaque-archive",
  "unrecognized",
] as const;

/**
 * Hard input bound on a path STRING, distinct from the policy bound on a path.
 *
 * Layer 1 exists to stop unbounded input, so it accepts a generous 4 KiB; layer 2
 * owns the policy limit and reports `PATH_LENGTH_EXCEEDED` precisely. If layer 1
 * enforced the policy bound instead, an over-long path would surface as a generic
 * structural failure and the specific code could never be produced — the check
 * would exist and be unreachable, which is the worst of both.
 */
export const MAX_RAW_PATH_INPUT_LENGTH = 4096;

export const TiaManifestEntrySchema = z
  .object({
    /** Package-relative path. Bounded for shape here, classified in layer 2. */
    path: z.string().min(1).max(MAX_RAW_PATH_INPUT_LENGTH),
    kind: z.enum(ENTRY_KIND_TUPLE),
    declaredByteSize: z
      .number()
      .int()
      .min(0)
      .max(TIA_PACKAGE_LIMITS.maxDeclaredEntryBytes),
    /** Digest of the entry's bytes AS DECLARED by the producer. */
    declaredSha256: Sha256Schema,
  })
  .strict();

export const TiaProjectHeaderSchema = z
  .object({
    /**
     * The project name AS DECLARED. Evidence, so its bytes are preserved exactly.
     *
     * `.trim()` was removed here for the same reason it was removed from
     * `declaredBy`: in Zod it is a TRANSFORM, not a check, so
     * `"  Line 12   Bottling  "` was silently recorded as `"Line 12   Bottling"`
     * and the name stored was not the name submitted. Blankness is checked in
     * `validateManifest` with `value.trim().length > 0`, which asks whether the
     * field is filled in without deciding which bytes are the evidence.
     */
    name: z.string().max(191),
    revision: z.number().int().min(1).max(100_000),
  })
  .strict();

export const TiaPackageManifestSchema = z
  .object({
    schemaVersion: z.enum(SUPPORTED_MANIFEST_SCHEMA_VERSIONS),
    packageKind: z.enum(PACKAGE_KIND_TUPLE),
    /**
     * The extension the producer DECLARED. Recorded as evidence and never used
     * to admit anything — see `classifyDeclaredContainer`, which cannot return
     * the admitted kind.
     */
    declaredContainerExtension: z.string().max(32),
    /** The TIA version the producer declared, if any. An assertion, not a fact. */
    declaredTiaVersion: z.string().max(64).nullable(),
    project: TiaProjectHeaderSchema,
    // `declaredPackageBytes` and `declaredUncompressedBytes` were removed under
    // C2.0 CORRECTION 3. They existed only to feed a compression-ratio check,
    // and a manifest field whose sole purpose is to describe decompression
    // implies a companion that decompresses. This one does not.
    entries: z.array(TiaManifestEntrySchema).max(TIA_PACKAGE_LIMITS.maxEntries),
    /** Digest over the producer's original input bytes. Evidence, not verified here. */
    sourceBytesSha256: Sha256Schema,
  })
  .strict();

export type TiaManifestEntryInput = z.infer<typeof TiaManifestEntrySchema>;

/* ── the validated value ──────────────────────────────────────────────────── */

export interface TiaManifestEntry {
  /** The canonical path: separators unified, empty segments dropped. */
  readonly path: string;
  readonly kind: TiaEntryKind;
  readonly declaredByteSize: number;
  readonly declaredSha256: string;
}

export interface TiaPackageManifest {
  readonly schemaVersion: TiaManifestSchemaVersion;
  readonly packageKind: TiaPackageKind;
  readonly declaredContainerExtension: string;
  readonly declaredTiaVersion: string | null;
  readonly project: {
    readonly name: string;
    /** Locale-independent identity key, from the Phase 94 normaliser. */
    readonly normalizedName: string;
    readonly revision: number;
  };
  /** Sorted by canonical path in code-point order. */
  readonly entries: readonly TiaManifestEntry[];
  readonly sourceBytesSha256: string;
}

/* ── the admission boundary ───────────────────────────────────────────────── */

/**
 * A manifest that this module actually validated.
 *
 * THE PROBLEM THIS SOLVES
 * An earlier revision claimed a `TiaPackageManifest` "can only be produced by
 * `validateManifest`, so a snapshot of an inadmissible package is impossible to
 * construct". That claim was false. TypeScript is STRUCTURALLY typed: any object
 * with the right shape is a `TiaPackageManifest`, and `as` erases even that. The
 * guarantee lived entirely in the type system, and the type system is not present
 * at runtime.
 *
 * THE BOUNDARY
 * Two mechanisms, and only the second is real:
 *
 *   1. a phantom brand, so `createSnapshot` cannot be called with an ordinary
 *      object by accident and the intent is visible in the signature;
 *   2. a module-private `WeakSet` that `validateManifest` writes to and
 *      `admitValidatedManifest` reads. This is the enforcement. A structurally
 *      cast object is not in the set, a spread copy of a validated manifest is
 *      not in the set, and nothing exported from this module or from the public
 *      barrel can put an object into it.
 *
 * A `WeakSet` rather than a marker property on purpose: a property would appear
 * in `Object.keys`, would therefore enter the canonical form, and would make the
 * admission mechanism part of the content digest. Membership is metadata about
 * the value, not part of it.
 */
declare const VALIDATED_BRAND: unique symbol;

export type ValidatedTiaPackageManifest = TiaPackageManifest & {
  readonly [VALIDATED_BRAND]: "validated-by-validateManifest";
};

/**
 * Module-private register of validated manifests.
 *
 * NOT exported, and deliberately not reachable from the public barrel. There is
 * no `markValidated`, no `asValidated` and no exported symbol: the only way in
 * is to pass `validateManifest`.
 */
const VALIDATED_MANIFESTS = new WeakSet<object>();

/** Whether a value was produced by this module's validator. */
export function isValidatedManifest(value: unknown): value is ValidatedTiaPackageManifest {
  return typeof value === "object" && value !== null && VALIDATED_MANIFESTS.has(value);
}

export type ManifestValidation =
  | { readonly ok: true; readonly manifest: ValidatedTiaPackageManifest }
  | { readonly ok: false; readonly diagnostics: readonly TiaDiagnostic[] };

/* ── validation ───────────────────────────────────────────────────────────── */

/**
 * Whether a bounded evidence name is acceptable, and why not if it is not.
 *
 * Shared by `validateManifest` (on submission) and by the durable stored-manifest
 * validator (on read-back), so a value that was refused at the door cannot be
 * accepted later by a second, laxer copy of the rule.
 *
 * Uses the existing codes: `MALFORMED_MANIFEST` for shape and blankness,
 * `UNSAFE_TEXT_CONTROL_CHARACTERS` for control and bidi characters. No new code
 * is warranted — neither failure is a new KIND of thing, and a code exists for
 * each.
 */
export function boundedNameProblem(
  value: unknown,
): { readonly code: TiaDiagnosticCode; readonly params: Record<string, string> } | null {
  const C = TIA_DIAGNOSTIC_CODES;
  if (typeof value !== "string") {
    return { code: C.MALFORMED_MANIFEST, params: { reason: "not a string" } };
  }
  if (value.length > 191) {
    return { code: C.MALFORMED_MANIFEST, params: { reason: "exceeds 191 characters" } };
  }
  // Blank-CHECKED with trim; the trimmed value is never stored anywhere.
  if (value.trim().length === 0) {
    return { code: C.MALFORMED_MANIFEST, params: { reason: "empty or whitespace-only" } };
  }
  const unsafe = unsafeTextReason(value);
  if (unsafe !== null) {
    return { code: C.UNSAFE_TEXT_CONTROL_CHARACTERS, params: { detail: unsafe } };
  }
  return null;
}

function readField(raw: unknown, field: string): unknown {
  if (raw === null || typeof raw !== "object") return undefined;
  return (raw as Record<string, unknown>)[field];
}

function readSchemaVersion(raw: unknown): string | null {
  const value = readField(raw, "schemaVersion");
  return typeof value === "string" ? value : null;
}

/**
 * Validate an untrusted value as a package manifest.
 *
 * Fail-closed and EXHAUSTIVE within a layer: layer 2 collects every semantic
 * finding rather than stopping at the first, because an engineer fixing a
 * rejected package should see all of it at once. Layers themselves are ordered,
 * so a structurally invalid document does not also produce a pile of derived
 * complaints about fields that were never there.
 */
export function validateManifest(raw: unknown): ManifestValidation {
  const C = TIA_DIAGNOSTIC_CODES;

  // Layer 0 — the version, read before the schema so an unsupported version is
  // reported as itself rather than as a generic enum failure.
  const declaredVersion = readSchemaVersion(raw);
  if (
    declaredVersion === null ||
    !(SUPPORTED_MANIFEST_SCHEMA_VERSIONS as readonly string[]).includes(declaredVersion)
  ) {
    return {
      ok: false,
      diagnostics: [
        diagnostic(C.SCHEMA_VERSION_UNSUPPORTED, {
          declared: declaredVersion ?? "",
          supported: SUPPORTED_MANIFEST_SCHEMA_VERSIONS.join(","),
        }),
      ],
    };
  }

  // Layer 0b — the package kind, also read before the schema. Admission is the
  // most consequential decision this function makes, and it must be reported
  // with its own code whether the declared kind is a known-but-refused member
  // (`opaque-archive`) or a string outside the union entirely — which is what an
  // input claiming to be a proprietary TIA archive looks like. Leaving it to the
  // enum would collapse both into a generic structural failure.
  const admission = admitPackageKind(readField(raw, "packageKind"));
  if (!admission.admitted) {
    return {
      ok: false,
      diagnostics: [
        diagnostic(admission.code, {
          declaredKind: String(readField(raw, "packageKind")),
          declaredExtension: String(readField(raw, "declaredContainerExtension") ?? ""),
        }),
      ],
    };
  }

  // Layer 1 — structure.
  const parsed = TiaPackageManifestSchema.safeParse(raw);
  if (!parsed.success) {
    return {
      ok: false,
      diagnostics: [
        diagnostic(C.MALFORMED_MANIFEST, {
          issueCount: String(parsed.error.issues.length),
          firstPath: parsed.error.issues[0]?.path.join(".") ?? "",
        }),
      ],
    };
  }
  const value = parsed.data;

  // Layer 2 — entry-level and bound-level admissibility.
  const findings: TiaDiagnostic[] = [];

  // The project name is evidence: CHECKED, never rewritten. Two questions in a
  // fixed order, exactly as for the compile declarer fields — blankness first,
  // then whether it carries anything a renderer must not be handed.
  const nameProblem = boundedNameProblem(value.project.name);
  if (nameProblem !== null) {
    findings.push(diagnostic(nameProblem.code, { field: "project.name", ...nameProblem.params }));
  }

  const entries: TiaManifestEntry[] = [];
  const seen = new Map<string, number>();

  for (const entry of value.entries) {
    const verdict = classifyEntryPath(entry.path);
    if (!verdict.ok) {
      findings.push(diagnostic(verdict.code, { path: entry.path }, { entryPath: entry.path }));
      continue;
    }
    const canonical = verdict.canonical;
    const previous = seen.get(canonical);
    if (previous !== undefined) {
      findings.push(
        diagnostic(
          C.DUPLICATE_CANONICAL_PATH,
          { path: canonical, firstIndex: String(previous) },
          { entryPath: canonical },
        ),
      );
      continue;
    }
    seen.set(canonical, entries.length);
    entries.push({
      path: canonical,
      kind: entry.kind,
      declaredByteSize: entry.declaredByteSize,
      declaredSha256: entry.declaredSha256,
    });
  }

  // C2.0 CORRECTION 3 removed the aggregate size and compression-ratio checks
  // that stood here. Both described an archive; neither is enforceable, or
  // meaningful, for a JSON manifest this round never expands. What remains is
  // bounded by the schema itself: `maxEntries` on the array and
  // `maxDeclaredEntryBytes` on each entry's declared integer.

  if (findings.length > 0) {
    return { ok: false, diagnostics: Object.freeze(findings) };
  }

  entries.sort((a, b) => compareEntryPaths(a.path, b.path));

  const manifest = Object.freeze({
    schemaVersion: value.schemaVersion,
    packageKind: admission.kind,
    declaredContainerExtension: value.declaredContainerExtension,
    declaredTiaVersion: value.declaredTiaVersion,
    project: Object.freeze({
      name: value.project.name,
      normalizedName: normalizeIdentifier(value.project.name),
      revision: value.project.revision,
    }),
    entries: Object.freeze(entries.map((e) => Object.freeze(e))),
    sourceBytesSha256: value.sourceBytesSha256,
  });

  // The one place membership is granted, on a value this function just built
  // from validated parts. There is no other writer.
  VALIDATED_MANIFESTS.add(manifest);

  return { ok: true, manifest: manifest as ValidatedTiaPackageManifest };
}

/* ── defensive re-checks ──────────────────────────────────────────────────── */

/* ── exact shapes ─────────────────────────────────────────────────────────── */

/**
 * The COMPLETE key set of each document level.
 *
 * Checked as an equality, not a subset. An unknown key is refused fail-closed
 * for a specific reason: `canonicalManifestValue` hashes a FIXED list of fields,
 * so any key outside that list rides along inside a snapshot without appearing
 * in a single digest. A field nothing covers is a field anybody can change, and
 * a verifier that shrugs at it is verifying less than it appears to.
 */
export const EXACT_MANIFEST_KEYS: readonly string[] = Object.freeze([
  "schemaVersion",
  "packageKind",
  "declaredContainerExtension",
  "declaredTiaVersion",
  "project",
  "entries",
  "sourceBytesSha256",
]);

export const EXACT_PROJECT_KEYS: readonly string[] = Object.freeze([
  "name",
  "normalizedName",
  "revision",
]);

export const EXACT_ENTRY_KEYS: readonly string[] = Object.freeze([
  "path",
  "kind",
  "declaredByteSize",
  "declaredSha256",
]);

/** Keys present on `value` that are not in `allowed`, plus any that are absent. */
export function keySetProblems(
  value: object,
  allowed: readonly string[],
  label: string,
): readonly string[] {
  const actual = Object.keys(value);
  const unknown = actual.filter((k) => !allowed.includes(k));
  const missing = allowed.filter((k) => !actual.includes(k));
  const out: string[] = [];
  if (unknown.length > 0) out.push(`${label} carries unknown key(s): ${unknown.join(", ")}`);
  if (missing.length > 0) out.push(`${label} is missing key(s): ${missing.join(", ")}`);
  return out;
}

/**
 * Everything wrong with a manifest, checked from scratch against `unknown`.
 *
 * DURABLE, AND THAT IS THE POINT. This function knows nothing about the
 * `WeakSet`, about object identity, or about which process built the value. It
 * re-derives every invariant from the bytes in front of it, so a snapshot that
 * has been serialised to JSON, stored, shipped and read back in another process
 * verifies exactly as it did when it was made. R2 tied verification to WeakSet
 * membership, which meant a perfectly sound snapshot became unverifiable the
 * moment it left the process that created it — a durability defect dressed as a
 * security check.
 *
 * The construction boundary is unaffected: `createSnapshot` still requires
 * WeakSet membership, so a fabricated object cannot be turned into a snapshot.
 * Verification asks a different question — "is this value internally sound?" —
 * and answers it from the value alone.
 *
 * It NORMALISES NOTHING. No trim, no sort, no re-derivation, no dropping of
 * unknown keys. A stored manifest whose entries are out of canonical order is
 * REPORTED, never quietly re-sorted; rewriting evidence during verification
 * would make the verifier the last thing anybody could trust.
 */
export function manifestInvariantViolations(value: unknown): readonly string[] {
  const problems: string[] = [];
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    return ["manifest is not an object"];
  }
  const m = value as TiaPackageManifest;

  problems.push(...keySetProblems(value, EXACT_MANIFEST_KEYS, "manifest"));

  if (!(SUPPORTED_MANIFEST_SCHEMA_VERSIONS as readonly string[]).includes(m.schemaVersion)) {
    problems.push("schemaVersion is not supported");
  }
  if (!(ADMITTED_PACKAGE_KINDS as readonly string[]).includes(m.packageKind)) {
    problems.push("packageKind is not admitted");
  }
  if (
    typeof m.declaredContainerExtension !== "string" ||
    m.declaredContainerExtension.length > 32
  ) {
    problems.push("declaredContainerExtension is malformed");
  }
  if (
    !(m.declaredTiaVersion === null ||
      (typeof m.declaredTiaVersion === "string" && m.declaredTiaVersion.length <= 64))
  ) {
    problems.push("declaredTiaVersion is malformed");
  }

  if (m.project === null || typeof m.project !== "object" || Array.isArray(m.project)) {
    problems.push("project is not an object");
  } else {
    problems.push(...keySetProblems(m.project, EXACT_PROJECT_KEYS, "project"));
    // The SAME name rule the door applies, re-run on read-back: a value refused
    // on submission must not become acceptable just because it arrived from
    // storage instead.
    const nameProblem = boundedNameProblem(m.project.name);
    if (nameProblem !== null) {
      problems.push(
        `project.name is invalid (${nameProblem.code}): ${Object.values(nameProblem.params).join(", ")}`,
      );
    }
    if (
      typeof m.project.revision !== "number" ||
      !Number.isInteger(m.project.revision) ||
      m.project.revision < 1 ||
      m.project.revision > 100_000
    ) {
      problems.push("project identity is malformed");
    } else if (typeof m.project.normalizedName !== "string") {
      problems.push("normalizedName is not a string");
    } else if (m.project.normalizedName !== normalizeIdentifier(m.project.name)) {
      // The identity key must still be DERIVED from the name it claims to derive
      // from. A forged manifest naming one project and keying another would map
      // onto the wrong EngineeringProject row downstream.
      problems.push("normalizedName does not derive from name");
    }
  }

  if (!isSha256Hex(m.sourceBytesSha256)) {
    problems.push("sourceBytesSha256 is malformed");
  }
  if (!Array.isArray(m.entries)) {
    problems.push("entries is not an array");
    return problems;
  }
  if (m.entries.length > TIA_PACKAGE_LIMITS.maxEntries) {
    problems.push("entries exceeds the bound");
  }

  const seen = new Set<string>();
  let previous: string | null = null;
  for (const entry of m.entries) {
    if (entry === null || typeof entry !== "object" || Array.isArray(entry)) {
      problems.push("an entry is not an object");
      continue;
    }
    problems.push(...keySetProblems(entry, EXACT_ENTRY_KEYS, "entry"));
    // Re-runs the FULL path rule, NFC included, on the stored value.
    const verdict = classifyEntryPath(entry.path);
    if (!verdict.ok) {
      problems.push(`entry path is invalid (${verdict.code}): ${String(entry.path)}`);
    } else if (verdict.canonical !== entry.path) {
      problems.push(`entry path is not canonical: ${String(entry.path)}`);
    }
    if (typeof entry.path === "string") {
      if (seen.has(entry.path)) problems.push(`duplicate entry path: ${entry.path}`);
      seen.add(entry.path);
      if (previous !== null && compareEntryPaths(previous, entry.path) >= 0) {
        problems.push("entries are not in canonical order");
      }
      previous = entry.path;
    }
    if (!isSha256Hex(entry.declaredSha256)) {
      problems.push(`entry digest is malformed: ${String(entry.path)}`);
    }
    if (!(TIA_ENTRY_KINDS as readonly string[]).includes(entry.kind)) {
      problems.push(`entry kind is unknown: ${String(entry.kind)}`);
    }
    if (
      typeof entry.declaredByteSize !== "number" ||
      !Number.isInteger(entry.declaredByteSize) ||
      entry.declaredByteSize < 0 ||
      entry.declaredByteSize > TIA_PACKAGE_LIMITS.maxDeclaredEntryBytes
    ) {
      problems.push(`entry size is out of range: ${String(entry.path)}`);
    }
  }
  return problems;
}

export type StoredManifestValidation =
  | { readonly ok: true; readonly manifest: TiaPackageManifest }
  | { readonly ok: false; readonly problems: readonly string[] };

/**
 * Validate a manifest that came back from storage.
 *
 * Returns the value UNCHANGED on success — it is a validator, not a
 * rehydrator that reshapes what it was given. Callers get back the same object
 * they passed in, so nothing downstream can be looking at a quietly repaired
 * copy of the evidence.
 */
export function validateStoredManifest(value: unknown): StoredManifestValidation {
  const problems = manifestInvariantViolations(value);
  if (problems.length > 0) return { ok: false, problems };
  return { ok: true, manifest: value as TiaPackageManifest };
}

/**
 * Admit a value as a validated manifest, or explain why not.
 *
 * Both gates, in this order: it must be in the register (it went through the
 * validator) AND it must still satisfy the invariants (it has not been altered
 * since). Either one alone would be a weaker claim than the pair.
 */
export function admitValidatedManifest(
  value: unknown,
): { readonly ok: true; readonly manifest: ValidatedTiaPackageManifest } | { readonly ok: false; readonly reason: string } {
  if (!isValidatedManifest(value)) {
    return {
      ok: false,
      reason:
        "the manifest was not produced by validateManifest — a structurally " +
        "identical object, a cast, or a copy of a validated one all land here",
    };
  }
  const problems = manifestInvariantViolations(value);
  if (problems.length > 0) {
    return { ok: false, reason: `manifest invariants violated: ${problems.join("; ")}` };
  }
  return { ok: true, manifest: value };
}

/* ── canonical form ───────────────────────────────────────────────────────── */

/**
 * The canonical value of a manifest.
 *
 * Field order is irrelevant (`stableStringify` sorts keys by code point) and
 * entry order is normalised by sorting on the canonical path, so two manifests
 * describing the same package produce identical bytes no matter which order
 * their producer happened to emit. That is what makes the digest an identity
 * rather than a fingerprint of one particular serialisation.
 *
 * `declaredContainerExtension` IS included: it is part of what the producer
 * asserted, and evidence that is excluded from the digest is evidence that can
 * be changed without invalidating it.
 */
export function canonicalManifestValue(manifest: TiaPackageManifest): unknown {
  return {
    schemaVersion: manifest.schemaVersion,
    packageKind: manifest.packageKind,
    declaredContainerExtension: manifest.declaredContainerExtension,
    declaredTiaVersion: manifest.declaredTiaVersion,
    project: {
      // `name` IS hashed. R3 left it out on the reasoning that only
      // `normalizedName` matters for identity — which was wrong in the one
      // direction that counts: `name` is STORED in the snapshot and was covered
      // by no digest, so it could be rewritten to any other spelling, casing or
      // spacing that normalises the same way while `contentSha256` and
      // `snapshotId` both stayed valid. "Line 12 Bottling" and
      // "line   12   bottling" share a normalizedName; only one of them is what
      // the producer actually declared, and a stored field nothing covers is a
      // field anybody can change.
      name: manifest.project.name,
      normalizedName: manifest.project.normalizedName,
      revision: manifest.project.revision,
    },
    sourceBytesSha256: manifest.sourceBytesSha256,
    entries: [...manifest.entries]
      .sort((a, b) => compareEntryPaths(a.path, b.path))
      .map((entry) => ({
        path: entry.path,
        kind: entry.kind,
        declaredByteSize: entry.declaredByteSize,
        declaredSha256: entry.declaredSha256,
      })),
  };
}

export function canonicaliseManifest(manifest: TiaPackageManifest): string {
  return stableStringify(canonicalManifestValue(manifest));
}

/** SHA-256 over the canonical manifest. The snapshot's content identity. */
export async function manifestContentSha256(manifest: TiaPackageManifest): Promise<string> {
  return canonicalSha256(canonicalManifestValue(manifest));
}

/** Re-export for callers validating a digest they were handed. */
export { isSha256Hex };

/** The entry kinds, for a caller that needs to enumerate them. */
export const MANIFEST_ENTRY_KINDS: readonly TiaEntryKind[] = TIA_ENTRY_KINDS;
