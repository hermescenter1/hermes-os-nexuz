/**
 * PHASE 109-C2.1 — local vs central header reconciliation.
 *
 * THE CENTRAL DIRECTORY IS THE ONLY AUTHORITY. The local header is read solely
 * so that a disagreement can be detected; it never supplies a value that is
 * used. That asymmetry is the point: a reader that falls back to the local
 * header when the two differ is a reader an attacker can steer.
 *
 * WHAT IS *NOT* TREATED AS HOSTILE. The local extra field may legitimately
 * differ from the central one — Info-ZIP timestamp layouts differ by design,
 * and ZIP64 sentinels appear in one header and not the other. So extra fields
 * are compared by ID SET, not by content. Everything that must be identical is
 * compared byte-for-byte or numerically.
 *
 * Because general-purpose bit 3 is refused outright by the entry policy, the
 * zero-size data-descriptor exception does not have to be tolerated here: a
 * local header carrying zeroed crc/sizes is simply a mismatch.
 */

import { INGEST_DIAGNOSTIC_CODES, type IngestDiagnosticCode } from "./diagnostics";

export interface LocalHeaderView {
  readonly generalPurposeBitFlag: number;
  readonly compressionMethod: number;
  readonly crc32: number;
  readonly compressedSize: number;
  readonly uncompressedSize: number;
  /** Raw header bytes of the name — never a decoded string. */
  readonly fileNameBytes: Uint8Array;
  readonly extraFieldIds: readonly number[];
}

export interface CentralHeaderView {
  readonly generalPurposeBitFlag: number;
  readonly compressionMethod: number;
  readonly crc32: number;
  readonly compressedSize: number;
  readonly uncompressedSize: number;
  readonly fileNameBytes: Uint8Array;
  readonly extraFieldIds: readonly number[];
}

export type HeaderMismatch = {
  readonly code: IngestDiagnosticCode;
  readonly field: string;
  readonly detail: string;
};

function bytesEqual(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return false;
  return true;
}

function sameIdSet(a: readonly number[], b: readonly number[]): boolean {
  const sa = new Set(a);
  const sb = new Set(b);
  if (sa.size !== sb.size) return false;
  for (const id of sa) if (!sb.has(id)) return false;
  return true;
}

/**
 * Every field on which the two headers disagree.
 *
 * The name is compared as BYTES. Comparing decoded strings would let two
 * different byte sequences that decode alike pass as identical, which is the
 * same class of mistake the 0x7075 shadowing check exists to prevent.
 */
export function headerMismatches(
  local: LocalHeaderView,
  central: CentralHeaderView,
): readonly HeaderMismatch[] {
  const code = INGEST_DIAGNOSTIC_CODES.LOCAL_CENTRAL_MISMATCH;
  const out: HeaderMismatch[] = [];

  if (!bytesEqual(local.fileNameBytes, central.fileNameBytes)) {
    out.push({ code, field: "fileName", detail: "raw header name bytes differ" });
  }
  if (local.generalPurposeBitFlag !== central.generalPurposeBitFlag) {
    out.push({
      code,
      field: "generalPurposeBitFlag",
      detail: `local 0x${local.generalPurposeBitFlag.toString(16)} vs central 0x${central.generalPurposeBitFlag.toString(16)}`,
    });
  }
  if (local.compressionMethod !== central.compressionMethod) {
    out.push({
      code,
      field: "compressionMethod",
      detail: `local ${local.compressionMethod} vs central ${central.compressionMethod}`,
    });
  }
  if ((local.crc32 >>> 0) !== (central.crc32 >>> 0)) {
    out.push({ code, field: "crc32", detail: "local and central crc32 differ" });
  }
  if (local.compressedSize !== central.compressedSize) {
    out.push({
      code,
      field: "compressedSize",
      detail: `local ${local.compressedSize} vs central ${central.compressedSize}`,
    });
  }
  if (local.uncompressedSize !== central.uncompressedSize) {
    out.push({
      code,
      field: "uncompressedSize",
      detail: `local ${local.uncompressedSize} vs central ${central.uncompressedSize}`,
    });
  }
  if (!sameIdSet(local.extraFieldIds, central.extraFieldIds)) {
    out.push({ code, field: "extraFieldIds", detail: "local and central extra-field id sets differ" });
  }

  return out;
}
