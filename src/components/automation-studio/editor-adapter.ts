/**
 * PHASE 109-C1 — the editor adapter seam.
 *
 * WHY THIS EXISTS RATHER THAN AN EDITOR
 * -------------------------------------
 * The repository has no code-editor dependency: no Monaco, no CodeMirror, no
 * Ace, no Prism, no Shiki. That alone would be a reason to defer.
 *
 * The stronger reason is the platform's own Content-Security-Policy. Every HTML
 * response from `src/middleware.ts` carries:
 *
 *     worker-src 'none'
 *
 * Monaco's tokenizer and language services run in Web Workers. Under this policy
 * they cannot start, so installing Monaco would not yield a working editor — it
 * would yield a broken one plus a request to weaken the site's CSP. That is a
 * security decision, not an editor decision, and it is not this round's to make.
 *
 *     MONACO_DEPENDENCY_DECISION = DEFERRED
 *
 * So Round 1 ships this interface plus one implementation: a real, accessible,
 * read-oriented source surface. It is deliberately NOT described as Monaco, as
 * an IDE, or as a full editor anywhere in the product, the docs or the report.
 * A later round can implement `EditorAdapter` with a real editor without the
 * workspace changing, once both the dependency and the CSP question are decided.
 */

import type { DiagnosticFinding } from "@/lib/automation-studio";

export interface EditorMarker {
  readonly line: number;
  readonly severity: DiagnosticFinding["severity"];
  /** Already-translated text. The adapter does no translation of its own. */
  readonly message: string;
  readonly code: string;
}

export interface EditorDocument {
  readonly artifactId: string;
  readonly name: string;
  readonly path: string;
  readonly language: string;
  readonly lines: readonly string[];
  readonly readOnly: boolean;
}

export interface EditorCapabilities {
  /** True only for an implementation that can genuinely tokenise the language. */
  readonly syntaxHighlighting: boolean;
  readonly codeFolding: boolean;
  readonly minimap: boolean;
  readonly multiCursor: boolean;
  /** Present in every implementation, including the fallback. */
  readonly lineNumbers: boolean;
  readonly diagnosticsGutter: boolean;
  readonly find: boolean;
  readonly keyboardAccessible: boolean;
  /** The source can actually be changed, not merely displayed. */
  readonly editable: boolean;
  readonly undo: boolean;
  readonly redo: boolean;
  /** An in-memory local save. Never persistence, never a network write. */
  readonly localSave: boolean;
}

export interface EditorAdapter {
  readonly id: string;
  /**
   * Short, honest description key. Rendered to the user, so it must not claim
   * capabilities the implementation does not have.
   */
  readonly descriptionKey: string;
  readonly capabilities: EditorCapabilities;
}

/**
 * The built-in surface.
 *
 * Everything false below is a capability this implementation genuinely does not
 * have. Stating them as `false` rather than omitting them is the point: a UI
 * that reads `capabilities.minimap` gets a truthful answer instead of rendering
 * a decorative strip that does nothing.
 */
export const FALLBACK_EDITOR_ADAPTER: EditorAdapter = Object.freeze({
  id: "hermes-plain-source-editor",
  descriptionKey: "editor.adapterDescription",
  capabilities: Object.freeze({
    // Absent, and said so plainly rather than omitted.
    syntaxHighlighting: false,
    codeFolding: false,
    minimap: false,
    multiCursor: false,
    // Present, and each is exercised by a test.
    lineNumbers: true,
    diagnosticsGutter: true,
    find: true,
    keyboardAccessible: true,
    editable: true,
    undo: true,
    redo: true,
    localSave: true,
  }),
});

/** Markers for one artifact, translated by the caller. */
export function markersForArtifact(
  findings: readonly DiagnosticFinding[],
  artifactId: string,
  translate: (finding: DiagnosticFinding) => string,
): readonly EditorMarker[] {
  return findings
    .filter((f) => f.artifactId === artifactId && typeof f.line === "number")
    .map((f) => ({
      line: f.line as number,
      severity: f.severity,
      message: translate(f),
      code: f.code,
    }))
    .sort((a, b) => a.line - b.line);
}

/**
 * Literal, case-insensitive find over source lines.
 *
 * Literal for the same reason the symbol search is: a user-supplied pattern
 * compiled into a regular expression is a denial-of-service in a text box.
 */
export function findInDocument(
  doc: EditorDocument,
  needle: string,
): readonly number[] {
  const query = needle.trim().toLowerCase();
  if (query.length === 0 || query.length > 128) return [];
  const hits: number[] = [];
  for (let i = 0; i < doc.lines.length; i += 1) {
    if (doc.lines[i].toLowerCase().includes(query)) hits.push(i + 1);
  }
  return hits;
}
