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
import { extractScadaJs } from "./extractors/scada-js";
import { extractHmi } from "./extractors/hmi";
import { emptyExtraction, type ArtifactLanguage, type ExtractionResult } from "./source-artifacts";
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
  code: "UNRESOLVED_SYMBOL" | "MISSING_EDGE" | "UNMAPPED_RELATION";
  systemId: string;
  artifact: string;
  detail: string;
}

type ExtractedRelationKind = "READS" | "WRITES" | "CALLS";

/**
 * How each language's canonical triple maps onto the graph vocabulary.
 *
 * Extractors can only report what a source text states about a symbol — that it
 * is read, written or invoked. What that MEANS differs by layer, and stating
 * the difference in one table keeps it auditable: an HMI object "reading" a tag
 * is displaying it, and "writing" one is declaring an operator command, not
 * performing a device write.
 */
const RELATION_MAPPING: Partial<
  Record<ArtifactLanguage, Record<ExtractedRelationKind, KnowledgeRelation>>
> = {
  SCL: { READS: "READS", WRITES: "WRITES", CALLS: "CALLS" },
  JAVASCRIPT: { READS: "READS", WRITES: "WRITES", CALLS: "NAVIGATES_TO" },
  HMI_JSON: { READS: "DISPLAYS", WRITES: "COMMANDS", CALLS: "NAVIGATES_TO" },
};

/** Extractor for each language the agreement gate understands. */
function extractionFor(language: ArtifactLanguage, content: string): ExtractionResult {
  switch (language) {
    case "SCL":
      return extractScl(content);
    case "JAVASCRIPT":
      return extractScadaJs(content);
    case "HMI_JSON":
      return extractHmi(content);
    default:
      // LAD_XML, FBD_XML, SCADA_JSON and CPP are carried for engineering
      // fidelity but are not parsed for relationships. Returning an empty
      // extraction is honest; pretending to have checked them would not be.
      return emptyExtraction();
  }
}

/** An artefact the gate did not check, and why. */
export interface SkippedArtifact {
  artifact: string;
  language: ArtifactLanguage;
  reason: "NO_RELATION_MAPPING";
}

/**
 * Verdict of the agreement gate, as a single value a caller cannot misread.
 *
 * The four states exist because "no issues" is not one fact but three very
 * different ones, and collapsing them would let the weakest of them be reported
 * as the strongest:
 *
 *   FAIL     — at least one issue. Any disagreement, any unresolved symbol, any
 *              UNMAPPED_RELATION. A relation this build cannot translate is a
 *              failure, not an omission: the alternative is guessing what an
 *              operator command means.
 *   BLOCKED  — nothing was checked at all. A system with no artefacts, or none
 *              whose language this build can parse, has an UNMEASURED graph. It
 *              is not clean; it is unexamined, and saying so is the whole point.
 *   PARTIAL  — some artefacts checked, some skipped, and no issue in what was
 *              checked. An honest positive result over an incomplete surface.
 *   PASS     — every artefact checked, no issue. The only state that entitles
 *              anyone to say the graph agrees with the source.
 */
export type SourceAgreementStatus = "PASS" | "PARTIAL" | "BLOCKED" | "FAIL";

export interface SourceAgreementReport {
  status: SourceAgreementStatus;
  issues: AgreementIssue[];
  /** Artefact locals whose relationships were extracted and checked. */
  checked: string[];
  /**
   * Artefacts carried for engineering fidelity but NOT checked, because this
   * build declares no relation mapping for their language. Reported rather
   * than dropped: a gate that silently ignores half the corpus reads as a
   * clean pass when it is really an unmeasured one.
   */
  skipped: SkippedArtifact[];
}

/**
 * Verify that every relationship stated by a system's engineering source exists
 * in its graph, and report which artefacts were checked and which were not.
 */
export function sourceAgreementReport(system: ReferenceSystem): SourceAgreementReport {
  const issues: AgreementIssue[] = [];
  const checked: string[] = [];
  const skipped: SkippedArtifact[] = [];
  const edgeKeys = new Set(system.edges.map((e) => `${e.relation}|${e.source}|${e.target}`));

  for (const artifact of system.artifacts) {
    const mapping = RELATION_MAPPING[artifact.language];
    if (!mapping) {
      skipped.push({
        artifact: artifact.local,
        language: artifact.language,
        reason: "NO_RELATION_MAPPING",
      });
      continue;
    }
    checked.push(artifact.local);

    const extraction = extractionFor(artifact.language, artifact.content);
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
        // Fail closed. A relation kind this language has no declared mapping
        // for is reported, never guessed at: falling back to the identity
        // mapping would silently assert that an HMI "write" is a device write.
        const graphRelation = mapping[relation.relation];
        if (!graphRelation) {
          issues.push({
            code: "UNMAPPED_RELATION",
            systemId: system.id,
            artifact: artifact.local,
            detail: `${artifact.language} declares no graph relation for ${relation.relation} (line ${relation.line})`,
          });
          continue;
        }

        const key = `${graphRelation}|${owner.id}|${target.id}`;
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

  return { status: agreementStatus(issues, checked, skipped), issues, checked, skipped };
}

/**
 * Resolve the four states in strict precedence: a defect outranks an absence,
 * and an absence outranks an incomplete pass. Evaluated in that order so a
 * system that is both unmeasured and defective is reported as FAIL — the
 * stronger warning — rather than as merely unexamined.
 */
function agreementStatus(
  issues: readonly AgreementIssue[],
  checked: readonly string[],
  skipped: readonly SkippedArtifact[],
): SourceAgreementStatus {
  if (issues.length > 0) return "FAIL";
  if (checked.length === 0) return "BLOCKED";
  if (skipped.length > 0) return "PARTIAL";
  return "PASS";
}

/**
 * The agreement gate itself: the issues only, so a test can assert `[]`.
 * Use `sourceAgreementReport` when the checked/skipped split matters.
 */
export function verifySourceAgreement(system: ReferenceSystem): AgreementIssue[] {
  return sourceAgreementReport(system).issues;
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
