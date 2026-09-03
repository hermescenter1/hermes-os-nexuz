/**
 * PHASE 109-C1 — symbol index and cross-reference.
 *
 * This is the part of the Studio an engineer actually reaches for: "where is
 * this tag written, and what binds it". It is built once from the project and
 * then queried, because rebuilding it per keystroke is the difference between a
 * tool that feels instant on a real project and one that does not.
 *
 * Pure and synchronous. No React, no I/O, no clock.
 */

import {
  PROJECT_LIMITS,
  type AutomationProject,
  type SymbolAccess,
  type SymbolDefinition,
  type SymbolReference,
  type SymbolScope,
} from "./contract";

export interface SymbolEntry {
  readonly name: string;
  /** Every declaration of this name. More than one is a duplicate. */
  readonly declarations: readonly SymbolDefinition[];
  readonly reads: readonly SymbolReference[];
  readonly writes: readonly SymbolReference[];
  readonly bindings: readonly SymbolReference[];
  readonly alarms: readonly SymbolReference[];
  readonly all: readonly SymbolReference[];
  /** Declared but never referenced. */
  readonly orphan: boolean;
  /** Referenced but never declared. */
  readonly unresolved: boolean;
  readonly duplicate: boolean;
}

export interface SymbolIndex {
  readonly entries: readonly SymbolEntry[];
  readonly byName: ReadonlyMap<string, SymbolEntry>;
  /** Lower-cased name, precomputed so search never lower-cases in a loop. */
  readonly searchKeys: readonly string[];
  readonly symbolCount: number;
  readonly referenceCount: number;
}

const ACCESS_BUCKET: Record<SymbolAccess, keyof Pick<SymbolEntry, "reads" | "writes" | "bindings" | "alarms">> = {
  read: "reads",
  write: "writes",
  binding: "bindings",
  alarm: "alarms",
};

/**
 * Build the index in one pass over declarations and one over references.
 *
 * Deliberately O(declarations + references) with map lookups rather than the
 * obvious nested filter: on a project with tens of thousands of references the
 * nested version is quadratic and the search box becomes unusable.
 */
export function buildSymbolIndex(project: AutomationProject): SymbolIndex {
  const draft = new Map<
    string,
    {
      declarations: SymbolDefinition[];
      reads: SymbolReference[];
      writes: SymbolReference[];
      bindings: SymbolReference[];
      alarms: SymbolReference[];
      all: SymbolReference[];
    }
  >();

  const ensure = (name: string) => {
    let bucket = draft.get(name);
    if (!bucket) {
      bucket = { declarations: [], reads: [], writes: [], bindings: [], alarms: [], all: [] };
      draft.set(name, bucket);
    }
    return bucket;
  };

  for (const declaration of project.symbols) {
    ensure(declaration.name).declarations.push(declaration);
  }

  for (const reference of project.references) {
    const bucket = ensure(reference.symbolName);
    bucket[ACCESS_BUCKET[reference.access]].push(reference);
    bucket.all.push(reference);
  }

  const entries: SymbolEntry[] = [];
  for (const [name, bucket] of draft) {
    entries.push({
      name,
      declarations: bucket.declarations,
      reads: bucket.reads,
      writes: bucket.writes,
      bindings: bucket.bindings,
      alarms: bucket.alarms,
      all: bucket.all,
      orphan: bucket.declarations.length > 0 && bucket.all.length === 0,
      unresolved: bucket.declarations.length === 0 && bucket.all.length > 0,
      duplicate: bucket.declarations.length > 1,
    });
  }

  // Stable, locale-independent ordering. `localeCompare` would make the index
  // depend on the viewer's locale, which would make two users disagree about
  // what "the first result" is.
  entries.sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0));

  return {
    entries,
    byName: new Map(entries.map((e) => [e.name, e])),
    searchKeys: entries.map((e) => e.name.toLowerCase()),
    symbolCount: entries.length,
    referenceCount: project.references.length,
  };
}

export interface SymbolQuery {
  readonly text?: string;
  readonly scope?: SymbolScope | "any";
  readonly dataType?: string | "any";
  readonly onlyProblems?: boolean;
}

/**
 * Literal, case-insensitive substring search.
 *
 * Deliberately NOT a regular expression. A user-supplied pattern compiled into
 * a regex is a denial-of-service waiting to happen, and the query box is a
 * search field, not a query language.
 */
export function querySymbols(index: SymbolIndex, query: SymbolQuery): readonly SymbolEntry[] {
  const raw = (query.text ?? "").trim();
  if (raw.length > PROJECT_LIMITS.maxSearchQueryLength) {
    return [];
  }
  const needle = raw.toLowerCase();
  const scope = query.scope ?? "any";
  const dataType = query.dataType ?? "any";

  const out: SymbolEntry[] = [];
  for (let i = 0; i < index.entries.length; i += 1) {
    const entry = index.entries[i];
    if (needle.length > 0 && !index.searchKeys[i].includes(needle)) continue;
    if (query.onlyProblems && !(entry.orphan || entry.unresolved || entry.duplicate)) continue;
    if (scope !== "any") {
      if (!entry.declarations.some((d) => d.scope === scope)) continue;
    }
    if (dataType !== "any") {
      if (!entry.declarations.some((d) => d.dataType === dataType)) continue;
    }
    out.push(entry);
  }
  return out;
}

/** Every reference to a symbol, ordered by artifact then line. */
export function crossReference(index: SymbolIndex, name: string): readonly SymbolReference[] {
  const entry = index.byName.get(name);
  if (!entry) return [];
  return [...entry.all].sort((a, b) =>
    a.artifactId === b.artifactId
      ? a.line - b.line
      : a.artifactId < b.artifactId
        ? -1
        : 1,
  );
}

/** The declaration to jump to, or null when the symbol is unresolved. */
export function definitionOf(index: SymbolIndex, name: string): SymbolDefinition | null {
  const entry = index.byName.get(name);
  if (!entry || entry.declarations.length === 0) return null;
  return entry.declarations[0];
}

export function unresolvedSymbols(index: SymbolIndex): readonly SymbolEntry[] {
  return index.entries.filter((e) => e.unresolved);
}

export function orphanSymbols(index: SymbolIndex): readonly SymbolEntry[] {
  return index.entries.filter((e) => e.orphan);
}

export function duplicateSymbols(index: SymbolIndex): readonly SymbolEntry[] {
  return index.entries.filter((e) => e.duplicate);
}
