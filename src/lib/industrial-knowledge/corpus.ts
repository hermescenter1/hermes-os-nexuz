// PHASE 101 — the sealed reference corpus and its source-agreement gate.
//
// The corpus is the registry of every sealed reference system plus the index
// the reasoning layer queries. It also owns the check that matters most for
// the addendum's authenticity requirement: that the relationships the GRAPH
// claims are the relationships the SOURCE actually states.
//
// WHY AGREEMENT IS CHECKED RATHER THAN ASSUMED
// A hand-authored graph beside hand-authored code drifts. One gets edited, the
// other does not, and the corpus quietly starts describing a plant that no
// longer matches its own program. `verifySourceAgreement` makes that drift a
// test failure: every read, write and call the extractor recovers from the
// engineering source must exist as an edge in the graph.
//
// The check is deliberately one-directional. Source ⊆ graph is required; the
// reverse is not, because a graph legitimately carries relationships no single
// routine states — physical containment, evidence links, fault-mode
// explanations, and the SCADA/HMI bindings that live in other artefacts.

import { buildIndex, type KnowledgeIndex } from "./graph";
import { extractScl } from "./extractors/scl";
import type { KnowledgeNode, KnowledgeRelation, ReferenceSystem } from "./types";
import { REFERENCE_SYSTEMS } from "./reference";

/* ── Registry ─────────────────────────────────────────────────────────────── */

export const CORPUS: readonly ReferenceSystem[] = REFERENCE_SYSTEMS;

let cachedIndex: KnowledgeIndex | null = null;

/**
 * The corpus index, built once per process.
 *
 * Reference systems are immutable module constants, so caching is safe and the
 * alternative — rebuilding a multi-thousand-edge index on every diagnostic
 * request — would be pure waste.
 */
export function corpusIndex(): KnowledgeIndex {
  if (!cachedIndex) cachedIndex = buildIndex(CORPUS);
  return cachedIndex;
}

/* ── Symbol resolution ────────────────────────────────────────────────────── */

/**
 * Resolve a symbolic name written in engineering source to a corpus node.
 *
 * Reference systems name their symbols with the same local identifier the
 * corpus node uses, which is what makes source-to-graph resolution mechanical
 * rather than a guess. A dotted member path (`"DB_Name".Member`) falls back to
 * its base symbol, because the data block is the object the corpus models.
 */
export function resolveSymbol(
  system: ReferenceSystem,
  symbol: string,
): KnowledgeNode | null {
  const candidates = [symbol, symbol.split(".")[0]];
  for (const candidate of candidates) {
    const suffix = `:${candidate}`;
    const matches = system.nodes.filter((n) => n.id.endsWith(suffix));
    if (matches.length === 1) return matches[0];
    if (matches.length > 1) {
      // Ambiguity is a corpus authoring defect, not something to resolve by
      // preference order — silently picking one would attach a source citation
      // to the wrong plant object.
      throw new Error(
        `symbol "${candidate}" is ambiguous in ${system.id}: ${matches.map((m) => m.id).join(", ")}`,
      );
    }
  }
  return null;
}

/* ── Source ⇄ graph agreement ─────────────────────────────────────────────── */

export interface AgreementIssue {
  code: "UNRESOLVED_SYMBOL" | "MISSING_EDGE";
  systemId: string;
  artifact: string;
  detail: string;
}

const RELATION_OF: Record<"READS" | "WRITES" | "CALLS", KnowledgeRelation> = {
  READS: "READS",
  WRITES: "WRITES",
  CALLS: "CALLS",
};

/**
 * Verify that every relationship stated by a system's SCL source exists in its
 * graph. Returns an empty array when the two agree.
 */
export function verifySourceAgreement(system: ReferenceSystem): AgreementIssue[] {
  const issues: AgreementIssue[] = [];
  const edgeKeys = new Set(system.edges.map((e) => `${e.relation}|${e.source}|${e.target}`));

  for (const artifact of system.artifacts) {
    if (artifact.language !== "SCL") continue;

    const extraction = extractScl(artifact.content);
    for (const unit of extraction.units) {
      const owner = resolveSymbol(system, unit.name);
      if (!owner) {
        issues.push({
          code: "UNRESOLVED_SYMBOL",
          systemId: system.id,
          artifact: artifact.local,
          detail: `declaring unit "${unit.name}" has no corpus node`,
        });
        continue;
      }

      for (const relation of unit.relations) {
        const target = resolveSymbol(system, relation.symbol);
        if (!target) {
          issues.push({
            code: "UNRESOLVED_SYMBOL",
            systemId: system.id,
            artifact: artifact.local,
            detail: `"${relation.symbol}" (line ${relation.line}) has no corpus node`,
          });
          continue;
        }
        const key = `${RELATION_OF[relation.relation]}|${owner.id}|${target.id}`;
        if (!edgeKeys.has(key)) {
          issues.push({
            code: "MISSING_EDGE",
            systemId: system.id,
            artifact: artifact.local,
            detail: `source states ${relation.relation} ${unit.name} → ${relation.symbol} (line ${relation.line}); graph has no such edge`,
          });
        }
      }
    }
  }

  return issues;
}

/** Corpus-wide counts, for reports and the command centre header. */
export interface CorpusStats {
  systems: number;
  nodes: number;
  edges: number;
  scenarios: number;
  artifacts: number;
  sourceLines: number;
  bySourceType: Record<string, number>;
}

export function corpusStats(systems: readonly ReferenceSystem[] = CORPUS): CorpusStats {
  const bySourceType: Record<string, number> = {};
  let nodes = 0;
  let edges = 0;
  let scenarios = 0;
  let artifacts = 0;
  let sourceLines = 0;

  for (const system of systems) {
    bySourceType[system.sourceType] = (bySourceType[system.sourceType] ?? 0) + 1;
    nodes += system.nodes.length;
    edges += system.edges.length;
    scenarios += system.scenarios.length;
    artifacts += system.artifacts.length;
    for (const artifact of system.artifacts) sourceLines += artifact.lineCount;
  }

  return { systems: systems.length, nodes, edges, scenarios, artifacts, sourceLines, bySourceType };
}
