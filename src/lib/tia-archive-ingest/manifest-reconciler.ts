/**
 * PHASE 109-C2.1 — reconcile what the archive contained against what the
 * manifest declared.
 *
 * Compared as SETS, in both directions. A one-directional check ("every
 * declared entry was found") passes an archive carrying extra files nobody
 * declared, which is the more useful smuggling direction of the two.
 *
 * Digests are compared only for paths present on both sides; a path missing
 * from either side is already a finding and does not need a second one.
 */

import { digestsEqual } from "../tia-companion/canonical";
import { compareEntryPaths } from "../tia-companion/contract";

import { INGEST_DIAGNOSTIC_CODES, type IngestDiagnosticCode } from "./diagnostics";
import type { IngestedEntry } from "./protocol";

/** What a manifest declares about one entry, reduced to the fields compared. */
export interface DeclaredEntry {
  readonly path: string;
  readonly contentSha256: string;
}

export type ReconciliationProblem = {
  readonly code: IngestDiagnosticCode;
  readonly detail: string;
};

export type Reconciliation =
  | { readonly ok: true; readonly paths: readonly string[] }
  | { readonly ok: false; readonly problems: readonly ReconciliationProblem[] };

/**
 * Compare the observed entry set against the declared one.
 *
 * Both lists are assumed to have already passed their own admission policies;
 * this function decides only whether they describe the same package.
 */
export function reconcile(
  observed: readonly IngestedEntry[],
  declared: readonly DeclaredEntry[],
): Reconciliation {
  const code = INGEST_DIAGNOSTIC_CODES.MANIFEST_RECONCILIATION_FAILED;
  const problems: ReconciliationProblem[] = [];

  const observedByPath = new Map<string, IngestedEntry>();
  for (const entry of observed) observedByPath.set(entry.path, entry);
  const declaredByPath = new Map<string, DeclaredEntry>();
  for (const entry of declared) declaredByPath.set(entry.path, entry);

  // Duplicate paths inside either list would make the set comparison lie, so
  // they are caught before it runs.
  if (observedByPath.size !== observed.length) {
    problems.push({ code, detail: "observed entries contain a duplicate path" });
  }
  if (declaredByPath.size !== declared.length) {
    problems.push({ code, detail: "declared entries contain a duplicate path" });
  }

  for (const path of observedByPath.keys()) {
    if (!declaredByPath.has(path)) {
      problems.push({ code, detail: `present in archive but not declared: ${path}` });
    }
  }
  for (const path of declaredByPath.keys()) {
    if (!observedByPath.has(path)) {
      problems.push({ code, detail: `declared but not present in archive: ${path}` });
    }
  }

  for (const [path, entry] of observedByPath) {
    const decl = declaredByPath.get(path);
    if (!decl) continue;
    if (!digestsEqual(entry.sha256, decl.contentSha256)) {
      problems.push({ code, detail: `content digest differs for ${path}` });
    }
  }

  if (problems.length > 0) return { ok: false, problems };

  const paths = [...observedByPath.keys()].sort(compareEntryPaths);
  return { ok: true, paths };
}
