/**
 * PHASE 109-C2.1 — extra-field policy. Closed allowlist, fail-closed.
 *
 * WHY THE 0x7075 RULE IS SHAPED THE WAY IT IS
 * -------------------------------------------
 * yauzl implements the Info-ZIP Unicode Path field faithfully: when 0x7075 is
 * present, its version is 1 and its NameCRC32 matches the raw header name,
 * yauzl REPLACES `entry.fileName` with the field's contents. When the CRC does
 * not match, the spec says to ignore the field, and yauzl silently does.
 *
 * Both behaviours are correct for a ZIP reader and wrong for a content-addressed
 * ingester. An archive can therefore present two names for one entry, and the
 * reader picks one without saying so. The measured case: raw `blocks/a.scl`,
 * 0x7075 `blocks/b.scl`, valid CRC — `entry.fileName` came back `blocks/b.scl`
 * while the header bytes still said `a`. No traversal, no malformed data, and a
 * manifest reconciler comparing `entry.fileName` would compare a name the
 * header does not contain.
 *
 * So Hermes does not choose between the two names. It refuses any entry where
 * they differ at all.
 */

import { INGEST_DIAGNOSTIC_CODES, type IngestDiagnosticCode } from "./diagnostics";

/** ZIP64 extended information. */
export const EXTRA_ID_ZIP64 = 0x0001;
/** Info-ZIP Unicode Path. */
export const EXTRA_ID_UNICODE_PATH = 0x7075;

/**
 * The complete set of extra-field ids Hermes will tolerate.
 *
 * Timestamp fields (0x5455 extended timestamp, 0x000a NTFS times) are
 * deliberately absent. They are perfectly legal ZIP, and rejecting them is a
 * restriction on the HERMES PACKAGE PROFILE rather than a claim that such
 * archives are malformed: this package format is content-addressed, and a field
 * carrying host clock or filesystem state is an input the producer cannot
 * reproduce. Deterministic minimal metadata is the requirement.
 */
export const ALLOWED_EXTRA_FIELD_IDS: readonly number[] = Object.freeze([
  EXTRA_ID_ZIP64,
  EXTRA_ID_UNICODE_PATH,
]);

/** One parsed extra field, in the shape yauzl exposes. */
export interface RawExtraField {
  readonly id: number;
  readonly data: Uint8Array;
}

export type ExtraFieldProblem = {
  readonly code: IngestDiagnosticCode;
  readonly detail: string;
};

/** Hex id for diagnostics, e.g. `0x5455`. */
export function formatExtraFieldId(id: number): string {
  return `0x${id.toString(16).padStart(4, "0")}`;
}

/**
 * Whether a ZIP64 extended-information field is actually required.
 *
 * ZIP64 applies when a 32-bit field is saturated to its sentinel. A ZIP64 field
 * present without any sentinel is unnecessary, which means it is carrying bytes
 * for a reason unrelated to size — refused.
 */
export function zip64IsRequired(sizes: {
  readonly compressedSize: number;
  readonly uncompressedSize: number;
  readonly localHeaderOffset: number;
  readonly diskNumberStart?: number;
}): boolean {
  const U32 = 0xffffffff;
  const U16 = 0xffff;
  return (
    sizes.compressedSize === U32 ||
    sizes.uncompressedSize === U32 ||
    sizes.localHeaderOffset === U32 ||
    sizes.diskNumberStart === U16
  );
}

/**
 * Validate the extra fields of one central-directory entry.
 *
 * Returns every problem found rather than the first, so an operator sees the
 * whole shape of a hostile entry instead of peeling it one refusal at a time.
 */
export function extraFieldProblems(
  fields: readonly RawExtraField[],
  context: {
    readonly compressedSize: number;
    readonly uncompressedSize: number;
    readonly localHeaderOffset: number;
    readonly extraFieldRawLength: number;
  },
): readonly ExtraFieldProblem[] {
  const C = INGEST_DIAGNOSTIC_CODES;
  const problems: ExtraFieldProblem[] = [];
  const seen = new Set<number>();
  let declaredTotal = 0;

  for (const field of fields) {
    const id = formatExtraFieldId(field.id);

    if (!ALLOWED_EXTRA_FIELD_IDS.includes(field.id)) {
      problems.push({ code: C.EXTRA_FIELD_NOT_ALLOWED, detail: `extra field ${id}` });
      continue;
    }
    if (seen.has(field.id)) {
      problems.push({ code: C.EXTRA_FIELD_DUPLICATE, detail: `extra field ${id} appears twice` });
      continue;
    }
    seen.add(field.id);

    // 2-byte id + 2-byte length + payload.
    declaredTotal += 4 + field.data.length;

    if (field.id === EXTRA_ID_UNICODE_PATH && field.data.length < 6) {
      problems.push({
        code: C.EXTRA_FIELD_MALFORMED,
        detail: `unicode path field is ${field.data.length} bytes, minimum is 6`,
      });
    }
    if (field.id === EXTRA_ID_ZIP64 && !zip64IsRequired(context)) {
      problems.push({
        code: C.ZIP64_FIELD_UNNECESSARY,
        detail: "zip64 field present with no saturated size or offset",
      });
    }
  }

  // A declared run of fields that overshoots the buffer they were parsed from
  // means at least one length prefix lied.
  if (declaredTotal > context.extraFieldRawLength) {
    problems.push({
      code: C.EXTRA_FIELD_MALFORMED,
      detail: `extra fields declare ${declaredTotal} bytes in a ${context.extraFieldRawLength}-byte region`,
    });
  }

  return problems;
}

/**
 * Refuse any disagreement between the decoded name and the raw header name.
 *
 * `decodedName` is what yauzl returns after it has applied the 0x7075
 * substitution and its own backslash handling. `rawName` is the header bytes
 * decoded as UTF-8 with no substitution. Equality is required — the check is
 * not "is the substituted name safe", it is "is there only one name".
 */
export function filenameShadowProblem(
  decodedName: string,
  rawName: string,
): ExtraFieldProblem | null {
  if (decodedName === rawName) return null;
  return {
    code: INGEST_DIAGNOSTIC_CODES.FILENAME_SHADOWED,
    detail: "decoded entry name differs from the raw header name",
  };
}
