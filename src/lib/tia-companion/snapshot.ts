/**
 * PHASE 109-C2.0 — the immutable snapshot and its provenance.
 *
 * TWO IDENTITIES, AND THEY ANSWER DIFFERENT QUESTIONS
 * ---------------------------------------------------
 * An earlier revision had `snapshotId === contentSha256`, which made provenance
 * invisible to identity: replacing the recording engineer, the producer, the
 * instant or the disclosure changed nothing, and `verifySnapshot` reported the
 * tampered snapshot as sound. Provenance that cannot be verified is decoration.
 *
 *   contentSha256   SHA-256 over the canonical ENGINEERING CONTENT. Two snapshots
 *                   of the same project state share it no matter who recorded
 *                   them or when. This is what a declared compile result binds
 *                   to, because a compile describes the code, not the paperwork.
 *
 *   snapshotId      SHA-256 over the canonical IDENTITY ENVELOPE: contentSha256,
 *                   sourceBytesSha256 and the validated provenance. This is what
 *                   identifies *this recording* of that content.
 *
 * The invariants, each with a test:
 *   - changing ANY provenance field changes snapshotId;
 *   - changing sourceBytesSha256 changes snapshotId;
 *   - changing only provenance does NOT change contentSha256;
 *   - changing the manifest changes both.
 *
 * There is deliberately no third `provenanceSha256` field. A stored digest that
 * nothing recomputes is another thing that can drift out of agreement with what
 * it describes; the envelope is built by one named function, `snapshotIdentityValue`,
 * which both the constructor and the verifier call.
 *
 * WHAT A SNAPSHOT DOES NOT CONTAIN
 * The original package bytes. `EngineeringProject` in this repository's schema
 * already states the rule — "imported engineering-project metadata (never the
 * proprietary binary itself)". C2.0 could not store them even if policy allowed
 * it, because nothing in this round reads them.
 */

import { canonicalSha256, digestsEqual, isSha256Hex } from "./canonical";
import {
  TIA_PACKAGE_LIMITS,
  TiaContractError,
  unsafeTextReason,
} from "./contract";
import {
  diagnostic,
  TIA_DIAGNOSTIC_CODES,
  type TiaDiagnostic,
} from "./diagnostics";
import { assertC2PermittedOrigin, isC2PermittedOrigin } from "./origin-policy";
import {
  admitValidatedManifest,
  canonicalManifestValue,
  keySetProblems,
  validateStoredManifest,
  type TiaPackageManifest,
  type ValidatedTiaPackageManifest,
} from "./package-manifest";

import type { DataOrigin } from "@/lib/automation-studio";

/* ── provenance ───────────────────────────────────────────────────────────── */

/**
 * Where a snapshot came from.
 *
 * `disclosure` is free text stating what this data is NOT — the same device
 * Phase 109-C1 uses. A reader who sees only the provenance record must still be
 * unable to mistake an offline fixture for a plant export.
 *
 * Every string field here is EVIDENCE and is part of `snapshotId`, so none of
 * them is trimmed: removing bytes from a value that participates in an identity
 * would mean the recorded provenance is not the submitted provenance.
 */
export interface TiaProvenance {
  readonly origin: DataOrigin;
  /** Stable identifier of the producing adapter. */
  readonly producer: string;
  /** Raw instant. Formatting is a presentation concern. */
  readonly recordedAtEpochMs: number;
  /** Responsible engineer, or the adapter for generated data. */
  readonly recordedBy: string;
  readonly disclosure: string;
}

/** Retained for callers that imported it before the bounds moved into the contract. */
export const MAX_DISCLOSURE_LENGTH = TIA_PACKAGE_LIMITS.maxDisclosureLength;

/** The bounded text fields of a provenance record, with their limits. */
const PROVENANCE_TEXT_FIELDS: readonly { field: "producer" | "recordedBy" | "disclosure"; max: number }[] =
  Object.freeze([
    { field: "producer", max: TIA_PACKAGE_LIMITS.maxProducerLength },
    { field: "recordedBy", max: TIA_PACKAGE_LIMITS.maxRecordedByLength },
    { field: "disclosure", max: TIA_PACKAGE_LIMITS.maxDisclosureLength },
  ]);

/**
 * The COMPLETE key set of a provenance record.
 *
 * `snapshotIdentityValue` hashes exactly these five. Any other key rides inside
 * a snapshot without appearing in a digest, so it can be changed freely and
 * nothing notices — which is the definition of an unbound field. Refused.
 */
export const EXACT_PROVENANCE_KEYS: readonly string[] = Object.freeze([
  "origin",
  "producer",
  "recordedAtEpochMs",
  "recordedBy",
  "disclosure",
]);

/**
 * The COMPLETE key set of a snapshot envelope. Same argument, one level up.
 */
export const EXACT_SNAPSHOT_KEYS: readonly string[] = Object.freeze([
  "snapshotId",
  "contentSha256",
  "sourceBytesSha256",
  "manifest",
  "provenance",
]);

export type ProvenanceProblem =
  | { readonly code: typeof TIA_DIAGNOSTIC_CODES.PROVENANCE_MISSING; readonly detail: string }
  | {
      readonly code: typeof TIA_DIAGNOSTIC_CODES.UNSAFE_TEXT_CONTROL_CHARACTERS;
      readonly detail: string;
    }
  | { readonly code: typeof TIA_DIAGNOSTIC_CODES.FORBIDDEN_ORIGIN; readonly detail: string };

/**
 * Everything wrong with a provenance record, or null.
 *
 * Returns a stable CODE alongside the human detail, so a caller never has to
 * parse a sentence to find out which rule was broken.
 */
export function provenanceProblem(value: unknown): ProvenanceProblem | null {
  const C = TIA_DIAGNOSTIC_CODES;
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    return { code: C.PROVENANCE_MISSING, detail: "provenance is absent" };
  }
  const record = value as Record<string, unknown>;

  const shape = keySetProblems(value, EXACT_PROVENANCE_KEYS, "provenance");
  if (shape.length > 0) {
    return { code: C.PROVENANCE_MISSING, detail: shape.join("; ") };
  }

  if (!isC2PermittedOrigin(record.origin)) {
    return { code: C.FORBIDDEN_ORIGIN, detail: `origin "${String(record.origin)}"` };
  }

  if (
    typeof record.recordedAtEpochMs !== "number" ||
    !Number.isInteger(record.recordedAtEpochMs) ||
    record.recordedAtEpochMs < 0
  ) {
    return {
      code: C.PROVENANCE_MISSING,
      detail: "recordedAtEpochMs is not a non-negative integer instant",
    };
  }

  for (const { field, max } of PROVENANCE_TEXT_FIELDS) {
    const text = record[field];
    if (typeof text !== "string") {
      return { code: C.PROVENANCE_MISSING, detail: `${field} is not a string` };
    }
    // Blank-CHECKED with trim, but the value is stored untrimmed: "is this field
    // meaningfully filled in" and "which bytes are the evidence" are different
    // questions, and only the first one is trim's business.
    if (text.trim().length === 0) {
      return { code: C.PROVENANCE_MISSING, detail: `${field} is empty` };
    }
    if (text.length > max) {
      return {
        code: C.PROVENANCE_MISSING,
        detail: `${field} exceeds its bound of ${max}`,
      };
    }
    const unsafe = unsafeTextReason(text);
    if (unsafe !== null) {
      return {
        code: C.UNSAFE_TEXT_CONTROL_CHARACTERS,
        detail: `${field} contains ${unsafe}`,
      };
    }
  }

  return null;
}

/**
 * Validate a provenance record, or throw with the stable code.
 *
 * The origin check delegates to the companion's own admission policy, so a live
 * origin is refused here by exactly the predicate that refuses it everywhere else.
 */
export function assertProvenance(value: unknown): TiaProvenance {
  const problem = provenanceProblem(value);
  if (problem !== null) {
    throw new TiaContractError(problem.code, problem.detail);
  }
  const record = value as Record<string, unknown>;
  return Object.freeze({
    origin: assertC2PermittedOrigin(record.origin),
    producer: record.producer as string,
    recordedAtEpochMs: record.recordedAtEpochMs as number,
    recordedBy: record.recordedBy as string,
    disclosure: record.disclosure as string,
  });
}

/* ── identity ─────────────────────────────────────────────────────────────── */

export interface TiaSnapshot {
  /** SHA-256 over the identity envelope: content + source bytes + provenance. */
  readonly snapshotId: string;
  /** SHA-256 over the canonical manifest ALONE. Provenance does not affect it. */
  readonly contentSha256: string;
  /** SHA-256 of the producer's original input bytes, as declared. */
  readonly sourceBytesSha256: string;
  readonly manifest: TiaPackageManifest;
  readonly provenance: TiaProvenance;
}

/**
 * The canonical value `snapshotId` is taken over.
 *
 * Named and exported so the constructor, the verifier and any future auditor all
 * hash THE SAME THING. Two independent implementations of "the envelope" is how
 * a verifier ends up disagreeing with the thing it verifies.
 *
 * Provenance fields are listed explicitly rather than spread: a field added to
 * `TiaProvenance` must be added here deliberately, and the test that mutates
 * every field independently is what catches the omission.
 */
export function snapshotIdentityValue(input: {
  readonly contentSha256: string;
  readonly sourceBytesSha256: string;
  readonly provenance: TiaProvenance;
}): unknown {
  return {
    contentSha256: input.contentSha256,
    sourceBytesSha256: input.sourceBytesSha256,
    provenance: {
      origin: input.provenance.origin,
      producer: input.provenance.producer,
      recordedAtEpochMs: input.provenance.recordedAtEpochMs,
      recordedBy: input.provenance.recordedBy,
      disclosure: input.provenance.disclosure,
    },
  };
}

/**
 * Build a snapshot from a VALIDATED manifest and a provenance record.
 *
 * The manifest parameter is `ValidatedTiaPackageManifest`, and the value is
 * checked at runtime by `admitValidatedManifest` — a structurally cast object
 * fails there, not merely in the type checker. See the admission boundary in
 * `package-manifest.ts` for why the type alone was never enough.
 */
export async function createSnapshot(input: {
  readonly manifest: ValidatedTiaPackageManifest;
  readonly provenance: unknown;
}): Promise<TiaSnapshot> {
  const admitted = admitValidatedManifest(input.manifest);
  if (!admitted.ok) {
    throw new TiaContractError(TIA_DIAGNOSTIC_CODES.MALFORMED_MANIFEST, admitted.reason);
  }
  const provenance = assertProvenance(input.provenance);
  const contentSha256 = await canonicalSha256(canonicalManifestValue(admitted.manifest));
  const sourceBytesSha256 = admitted.manifest.sourceBytesSha256;
  const snapshotId = await canonicalSha256(
    snapshotIdentityValue({ contentSha256, sourceBytesSha256, provenance }),
  );
  return Object.freeze({
    snapshotId,
    contentSha256,
    sourceBytesSha256,
    manifest: admitted.manifest,
    provenance,
  });
}

/**
 * Build the TRUSTED, deeply frozen snapshot that verification hands back.
 *
 * WHY A COPY AND NOT THE CALLER'S OBJECT
 * `verifySnapshot` accepts `unknown`, which in practice means a value that came
 * off a wire or out of storage — typically from `JSON.parse`, which produces
 * ordinary mutable objects. Returning that object directly made the verdict
 * decay the instant it was issued: a caller could hold `verified.snapshot`,
 * write to `provenance.recordedBy` or `project.name`, and carry on using a value
 * that had been "verified" against content it no longer had. `readonly` in
 * TypeScript is erased at runtime and stops none of that.
 *
 * WHY AN EXPLICIT CONSTRUCTOR AND NOT A RECURSIVE CLONE
 * A generic deep-clone would faithfully copy whatever it was handed, including
 * shapes nobody validated. This function names every field it copies, so the
 * returned value is exactly the validated shape and nothing else can ride along
 * — the same argument that makes the exact-key checks worth having. Adding a
 * field to the contract means adding it here, deliberately.
 *
 * `structuredClone` and JSON round-tripping are both avoided: the first would
 * happily carry unvalidated properties, and the second is a serialiser, not a
 * copy mechanism — it would silently reinterpret values on the way through.
 *
 * WHAT IT DOES NOT DO
 * It does not touch the caller's object. No freezing, no normalising, no
 * trimming, no sorting, no repair. Values are carried across exactly: string
 * bytes and whitespace, entry order, numbers. The caller keeps a mutable input
 * and gets back an immutable verdict, and the two are independent.
 */
function trustedSnapshotCopy(
  snapshot: TiaSnapshot,
  manifest: TiaPackageManifest,
  provenance: TiaProvenance,
): TiaSnapshot {
  const entries = manifest.entries.map((entry) =>
    Object.freeze({
      path: entry.path,
      kind: entry.kind,
      declaredByteSize: entry.declaredByteSize,
      declaredSha256: entry.declaredSha256,
    }),
  );

  return Object.freeze({
    snapshotId: snapshot.snapshotId,
    contentSha256: snapshot.contentSha256,
    sourceBytesSha256: snapshot.sourceBytesSha256,
    manifest: Object.freeze({
      schemaVersion: manifest.schemaVersion,
      packageKind: manifest.packageKind,
      declaredContainerExtension: manifest.declaredContainerExtension,
      declaredTiaVersion: manifest.declaredTiaVersion,
      project: Object.freeze({
        name: manifest.project.name,
        normalizedName: manifest.project.normalizedName,
        revision: manifest.project.revision,
      }),
      // The array is frozen too, not merely its members: an unfrozen array would
      // still accept `push`, `splice` and index assignment, which is enough to
      // change what the manifest says without touching any single entry object.
      entries: Object.freeze(entries),
      sourceBytesSha256: manifest.sourceBytesSha256,
    }),
    provenance: Object.freeze({
      origin: provenance.origin,
      producer: provenance.producer,
      recordedAtEpochMs: provenance.recordedAtEpochMs,
      recordedBy: provenance.recordedBy,
      disclosure: provenance.disclosure,
    }),
  });
}

export type SnapshotVerification =
  | { readonly ok: true; readonly snapshot: TiaSnapshot }
  | { readonly ok: false; readonly diagnostics: readonly TiaDiagnostic[] };

/**
 * Verify a snapshot, defensively, from `unknown`.
 *
 * DURABLE: it depends on NOTHING but the value in front of it.
 *
 * R2 routed verification through `admitValidatedManifest`, which requires
 * membership in a module-private `WeakSet`. That made a sound snapshot
 * unverifiable the moment it left the process that built it — serialise it,
 * store it, read it back, and the verifier reported it malformed. A snapshot
 * that cannot survive storage is not a snapshot, and a check that fails on
 * correct evidence teaches people to route around the checker.
 *
 * So the two boundaries are now separated by the question they answer:
 *
 *   CONSTRUCTION  `createSnapshot` still requires `WeakSet` membership. "Did
 *                 this value come out of our validator?" is answerable only
 *                 in-process, and it is the right question when minting a
 *                 snapshot from something a caller handed over.
 *   VERIFICATION  this function re-derives every invariant from the bytes.
 *                 "Is this value internally sound?" is answerable anywhere, by
 *                 anyone, in any process — which is what verification must mean.
 *
 * Weakening nothing: the fabricated object that `createSnapshot` refuses is
 * still refused there, and here it fails on its own merits because a forged
 * manifest cannot also produce a matching pair of digests.
 *
 * The sequence, and each step exists so a failure says WHICH part moved:
 *   1. the snapshot envelope has exactly its five keys;
 *   2. the stored manifest satisfies every invariant, re-derived from scratch;
 *   3. contentSha256 equals the digest of the canonical manifest;
 *   4. sourceBytesSha256 is well formed and matches the manifest's own;
 *   5. provenance has exactly its five keys and is valid under the policy;
 *   6. snapshotId equals the digest of the complete identity envelope.
 *
 * Nothing is normalised, trimmed, sorted or repaired along the way.
 *
 * ON SUCCESS IT RETURNS A TRUSTED COPY, NOT THE CALLER'S OBJECT. See
 * `trustedSnapshotCopy`: a verdict that can be mutated by whoever received it
 * is a verdict about a value that no longer exists.
 */
export async function verifySnapshot(value: unknown): Promise<SnapshotVerification> {
  const C = TIA_DIAGNOSTIC_CODES;
  const findings: TiaDiagnostic[] = [];

  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    return {
      ok: false,
      diagnostics: [diagnostic(C.SNAPSHOT_SHAPE_INVALID, { reason: "snapshot is not an object" })],
    };
  }
  const snapshot = value as TiaSnapshot;

  const envelopeShape = keySetProblems(value, EXACT_SNAPSHOT_KEYS, "snapshot");
  if (envelopeShape.length > 0) {
    // Fail closed and stop: an envelope of the wrong shape makes every later
    // comparison a guess about which field was meant to be which.
    return {
      ok: false,
      diagnostics: [diagnostic(C.SNAPSHOT_SHAPE_INVALID, { reason: envelopeShape.join("; ") })],
    };
  }

  const stored = validateStoredManifest(snapshot.manifest);
  if (!stored.ok) {
    findings.push(diagnostic(C.MALFORMED_MANIFEST, { reason: stored.problems.join("; ") }));
    return { ok: false, diagnostics: Object.freeze(findings) };
  }
  const admitted = { manifest: stored.manifest };

  const recomputedContent = await canonicalSha256(canonicalManifestValue(admitted.manifest));
  if (!digestsEqual(snapshot.contentSha256, recomputedContent)) {
    findings.push(
      diagnostic(
        C.CONTENT_HASH_MISMATCH,
        { field: "contentSha256", declared: String(snapshot.contentSha256), recomputed: recomputedContent },
        { snapshotContentSha256: recomputedContent },
      ),
    );
  }

  if (!isSha256Hex(snapshot.sourceBytesSha256)) {
    findings.push(
      diagnostic(C.CONTENT_HASH_MISMATCH, {
        field: "sourceBytesSha256",
        declared: String(snapshot.sourceBytesSha256),
        recomputed: "",
      }),
    );
  } else if (!digestsEqual(snapshot.sourceBytesSha256, admitted.manifest.sourceBytesSha256)) {
    // The snapshot's copy must still agree with the manifest it wraps; a
    // divergence means one of the two was edited after the fact.
    findings.push(
      diagnostic(C.CONTENT_HASH_MISMATCH, {
        field: "sourceBytesSha256",
        declared: snapshot.sourceBytesSha256,
        recomputed: admitted.manifest.sourceBytesSha256,
      }),
    );
  }

  const provenanceFault = provenanceProblem(snapshot.provenance);
  if (provenanceFault !== null) {
    findings.push(diagnostic(provenanceFault.code, { detail: provenanceFault.detail }));
    // Without valid provenance the envelope cannot be rebuilt, so the identity
    // check below would be meaningless rather than merely failing.
    return { ok: false, diagnostics: Object.freeze(findings) };
  }

  const recomputedId = await canonicalSha256(
    snapshotIdentityValue({
      contentSha256: recomputedContent,
      sourceBytesSha256: admitted.manifest.sourceBytesSha256,
      provenance: snapshot.provenance,
    }),
  );
  if (!digestsEqual(snapshot.snapshotId, recomputedId)) {
    findings.push(
      diagnostic(
        C.CONTENT_HASH_MISMATCH,
        { field: "snapshotId", declared: String(snapshot.snapshotId), recomputed: recomputedId },
        { snapshotContentSha256: recomputedContent },
      ),
    );
  }

  if (findings.length > 0) {
    // A failed verification yields diagnostics and NO snapshot. There is no
    // trusted value to hand back, and constructing one would be the single most
    // dangerous thing this function could do.
    return { ok: false, diagnostics: Object.freeze(findings) };
  }

  // Verified. Hand back a detached, deeply frozen copy rather than the caller's
  // object, so the verdict cannot be invalidated by whoever received it.
  return {
    ok: true,
    snapshot: trustedSnapshotCopy(snapshot, admitted.manifest, snapshot.provenance),
  };
}
