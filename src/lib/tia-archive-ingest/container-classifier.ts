/**
 * PHASE 109-C2.1 — container classification from CONTENT, never from a name.
 *
 * The spike found this the hard way: `tar -a -c -f x.zip` produced a TAR file
 * whose name ended in `.zip`. Its leading bytes were `6d 61 6e 69`, not
 * `50 4b 03 04`. Anything that trusted the extension would have handed a TAR to
 * a ZIP reader. So the extension is never consulted here — not as a hint, not
 * as a tie-breaker.
 *
 * ZIP is the only admitted transport. A Siemens project container is a
 * different thing and is refused with its own code rather than being silently
 * treated as "unknown", because "we recognised it and will not open it" and "we
 * have no idea what this is" are different findings for an operator.
 */

import { INGEST_DIAGNOSTIC_CODES, type IngestDiagnosticCode } from "./diagnostics";

/** Leading-byte signatures. All comparisons are on bytes, never on text. */
const SIGNATURES = Object.freeze({
  /** Local file header — a normal, non-empty ZIP. */
  zipLocalHeader: Object.freeze([0x50, 0x4b, 0x03, 0x04]),
  /** End of central directory with no entries — a structurally empty ZIP. */
  zipEmptyArchive: Object.freeze([0x50, 0x4b, 0x05, 0x06]),
  /** Spanned/split archive marker. Recognised so it can be refused precisely. */
  zipSpanned: Object.freeze([0x50, 0x4b, 0x07, 0x08]),
});

export type ContainerVerdict =
  | { readonly ok: true; readonly kind: "zip" }
  | { readonly ok: false; readonly code: IngestDiagnosticCode; readonly detail: string };

function startsWith(bytes: Uint8Array, sig: readonly number[]): boolean {
  if (bytes.length < sig.length) return false;
  for (let i = 0; i < sig.length; i++) if (bytes[i] !== sig[i]) return false;
  return true;
}

/** First `n` bytes as lowercase hex, for a diagnostic that names what was seen. */
export function leadingHex(bytes: Uint8Array, n = 4): string {
  const out: string[] = [];
  for (let i = 0; i < Math.min(n, bytes.length); i++) {
    out.push((bytes[i] as number).toString(16).padStart(2, "0"));
  }
  return out.join("");
}

/**
 * Classify a container by its leading bytes.
 *
 * A spanned archive is refused rather than accepted: the other volumes are not
 * present, so any entry it describes cannot be verified, and a partially
 * verifiable archive is the shape this whole phase exists to refuse.
 */
export function classifyContainer(bytes: Uint8Array): ContainerVerdict {
  const C = INGEST_DIAGNOSTIC_CODES;

  if (bytes.length < 4) {
    return { ok: false, code: C.CONTAINER_UNREADABLE, detail: `too short: ${bytes.length} bytes` };
  }
  if (startsWith(bytes, SIGNATURES.zipLocalHeader)) return { ok: true, kind: "zip" };
  if (startsWith(bytes, SIGNATURES.zipEmptyArchive)) {
    // Structurally valid, but a package with no entries carries no engineering
    // content and cannot satisfy any manifest. Refused as unreadable-for-purpose.
    return { ok: false, code: C.CONTAINER_UNREADABLE, detail: "empty archive (no entries)" };
  }
  if (startsWith(bytes, SIGNATURES.zipSpanned)) {
    return { ok: false, code: C.CONTAINER_NOT_ZIP, detail: "spanned archive is not admitted" };
  }
  return {
    ok: false,
    code: C.CONTAINER_NOT_ZIP,
    detail: `leading bytes ${leadingHex(bytes)} are not a ZIP signature`,
  };
}
