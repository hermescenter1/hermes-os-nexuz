/**
 * PHASE 100 — tri-state evidence source classification.
 *
 * The defect this module exists to remove: the evaluator used to read evidence
 * with `try { JSON.parse(t) } catch { return null }`, which collapsed four
 * different situations into one `null` — file absent, file empty, file
 * unparseable, and file parsed to something that is not an object. Downstream,
 * `null` means "nothing was supplied", so a supplied but MALFORMED evidence
 * document was reported as `BLOCKED / no evidence recorded` on a GREEN build.
 * That is precisely backwards: the published contract says supplied-but-invalid
 * evidence is a FAIL that fails CI, and absence is the only thing that is
 * BLOCKED.
 *
 * So reading is now a classification, not a coercion:
 *
 *   ABSENT     — nothing is at the path. The gate is BLOCKED. Correct.
 *   VALID      — a JSON object was read. The validators decide the rest.
 *   MALFORMED  — something IS there and it cannot be used. The gate FAILs,
 *                `evidenceSupplied` is true, and the build fails.
 *
 * ── Why the parse error is never quoted ──────────────────────────────────────
 *
 * V8's `SyntaxError.message` echoes file bytes. Measured on this runtime:
 *
 *   JSON.parse('not json with a token inside')
 *     -> Unexpected token 'o', "not json w"... is not valid JSON
 *   JSON.parse('NaN')  ->  "NaN" is not valid JSON        (whole document)
 *
 * and the offset is attacker-influenced too: a file whose body is
 * `x at position 4242` produces a message containing `at position 4242` even
 * though the file is 18 bytes, so even "just the number" cannot be trusted.
 *
 * Evidence documents are sanitized by contract but nothing guarantees a
 * malformed one is — a half-written file, a wrong file pasted by mistake, a
 * binary blob. The classification is therefore drawn from a CLOSED vocabulary
 * and the error object is never bound: `catch {}` with no binding, so there is
 * no variable to accidentally interpolate later.
 *
 * Pure `node:fs` reads. No clock, no network, no process exit, no writes.
 */

import { readFileSync, statSync } from "node:fs";

export const EVIDENCE_SOURCE_STATUSES = ["ABSENT", "VALID", "MALFORMED"];

/**
 * Closed classification vocabulary. Nothing outside this list is ever emitted,
 * and no member carries any part of the file's contents.
 */
export const MALFORMED_CLASSIFICATIONS = [
  "EMPTY_FILE",
  "NOT_UTF8_TEXT",
  "JSON_SYNTAX_ERROR",
  "NOT_A_JSON_OBJECT",
  "MALFORMED_DOCUMENT_SHAPE",
  "PATH_IS_A_DIRECTORY",
  "PATH_NOT_A_REGULAR_FILE",
  "FILE_TOO_LARGE",
  "PATH_ESCAPES_EVIDENCE_ROOT",
  "UNREADABLE_PATH",
];

/**
 * Evidence documents are sanitized records of counts, references and digests.
 * Four mebibytes is orders of magnitude above any legitimate one and well below
 * anything that would strain the evaluator.
 */
export const MAX_EVIDENCE_BYTES = 4 * 1024 * 1024;

/**
 * @typedef {{
 *   status: "ABSENT" | "VALID" | "MALFORMED",
 *   supplied: boolean,
 *   document: object | null,
 *   text: string | null,
 *   classification: string | null,
 *   byteLength: number | null,
 * }} EvidenceSource
 */

const absent = () => ({ status: "ABSENT", supplied: false, document: null, text: null, classification: null, byteLength: null });
const malformed = (classification, byteLength = null) => ({
  status: "MALFORMED",
  supplied: true,
  document: null,
  text: null,
  classification,
  byteLength,
});

/** A UTF-8 BOM is what several Windows editors write; it is not a malformation. */
function stripBom(text) {
  return text.charCodeAt(0) === 0xfeff ? text.slice(1) : text;
}

/**
 * Classify whatever is at `absPath`.
 *
 * @param {string} absPath
 * @param {{ shape?: ((doc: object) => boolean) | null }} [options]
 *   `shape` additionally rejects a well-formed JSON object whose top-level
 *   structure is wrong for the document it claims to be. Without it a supplied
 *   `{"findings": "oops"}` would read as an EMPTY finding register and turn four
 *   repository-owned gates green.
 * @returns {EvidenceSource}
 */
export function readEvidenceSource(absPath, { shape = null } = {}) {
  let stats;
  try {
    stats = statSync(absPath);
  } catch {
    // ENOENT is the overwhelmingly common case and is a genuine absence. Any
    // other stat failure (permissions, a broken link) means something IS there
    // that cannot be read, which is not an absence.
    try {
      statSync(absPath, { throwIfNoEntry: true });
    } catch (err) {
      if (err && err.code === "ENOENT") return absent();
      return malformed("UNREADABLE_PATH");
    }
    return absent();
  }

  if (stats.isDirectory()) return malformed("PATH_IS_A_DIRECTORY");
  if (!stats.isFile()) return malformed("PATH_NOT_A_REGULAR_FILE");
  if (stats.size > MAX_EVIDENCE_BYTES) return malformed("FILE_TOO_LARGE", stats.size);

  let buffer;
  try {
    buffer = readFileSync(absPath);
  } catch {
    return malformed("UNREADABLE_PATH", stats.size);
  }

  const byteLength = buffer.byteLength;
  if (byteLength === 0) return malformed("EMPTY_FILE", 0);
  // A NUL byte means this is not the sanitized text document it claims to be —
  // a binary blob, or UTF-16 read as UTF-8.
  if (buffer.includes(0)) return malformed("NOT_UTF8_TEXT", byteLength);

  const text = stripBom(buffer.toString("utf8"));
  if (text.trim() === "") return malformed("EMPTY_FILE", byteLength);

  let parsed;
  try {
    parsed = JSON.parse(text);
  } catch {
    // Deliberately unbound — see the module comment. The thrown message echoes
    // file bytes, so there must be no variable holding it.
    return malformed("JSON_SYNTAX_ERROR", byteLength);
  }

  // `null`, `[]`, `42`, `"x"` and `true` all parse. An array is `typeof
  // "object"` and non-null, so it has to be excluded explicitly.
  if (parsed === null || typeof parsed !== "object" || Array.isArray(parsed)) {
    return malformed("NOT_A_JSON_OBJECT", byteLength);
  }

  if (shape && !shape(parsed)) return malformed("MALFORMED_DOCUMENT_SHAPE", byteLength);

  return { status: "VALID", supplied: true, document: parsed, text, classification: null, byteLength };
}

/**
 * Classify a TEXT source (the scope and pilot-plan markdown that get hashed).
 *
 * Empty text is VALID here and not an error: `computeScopeHash("")` is a real,
 * stable digest that simply will not match any attestation, which is the
 * correct fail-closed outcome for "no scope was agreed". Only unreadable or
 * non-file paths are malformed.
 *
 * @param {string} absPath
 * @returns {EvidenceSource}
 */
export function readTextSource(absPath) {
  let stats;
  try {
    stats = statSync(absPath);
  } catch (err) {
    if (err && err.code === "ENOENT") return absent();
    return malformed("UNREADABLE_PATH");
  }
  if (stats.isDirectory()) return malformed("PATH_IS_A_DIRECTORY");
  if (!stats.isFile()) return malformed("PATH_NOT_A_REGULAR_FILE");
  if (stats.size > MAX_EVIDENCE_BYTES) return malformed("FILE_TOO_LARGE", stats.size);

  let buffer;
  try {
    buffer = readFileSync(absPath);
  } catch {
    return malformed("UNREADABLE_PATH", stats.size);
  }
  if (buffer.includes(0)) return malformed("NOT_UTF8_TEXT", buffer.byteLength);

  return {
    status: "VALID",
    supplied: true,
    document: null,
    text: stripBom(buffer.toString("utf8")),
    classification: null,
    byteLength: buffer.byteLength,
  };
}

/**
 * The reason recorded on every gate derived from a malformed document.
 *
 * Keyed on the document's stable ID, never on its path: in OWNER_CLOSURE mode
 * the path is an absolute location outside the repository, and the published
 * summary is scanned by `assertNoSensitiveEvidence`, whose IP-address pattern
 * matches a UNC root and whose e-mail pattern can match odd path segments.
 */
export function malformedReason(documentId, classification) {
  return (
    `MALFORMED_EVIDENCE_DOCUMENT (${classification}) for ${documentId} — ` +
    "a supplied evidence document that cannot be read as a JSON object is a FAILURE, not an absence"
  );
}

/** Per-gate detail line. Carries the classification and the size, never content. */
export function malformedGateError(gate, documentId, source) {
  const size = source?.byteLength === null || source?.byteLength === undefined ? "unknown" : `${source.byteLength}`;
  return `${gate}: derived from ${documentId}, SUPPLIED but ${source?.classification} (${size} bytes) — no field of it was read`;
}
