// PHASE 101 (addendum) — native engineering source artefacts.
//
// WHY THIS EXISTS
// A reference system that only carried a relationship graph would be a model of
// engineering, not engineering. Real control systems are written in real
// languages: IEC 61131-3 Structured Text / SCL for the controller, ladder and
// function-block networks exported as structured XML, JavaScript for
// WinCC-Unified-class SCADA scripting, and declarative screen definitions for
// the operator interface. Phase 101 therefore carries the ACTUAL SOURCE for
// each reference system and derives relationships FROM it, so the graph can be
// cross-checked against the code rather than merely asserted alongside it.
//
// WHAT THIS IS NOT
// These artefacts are engineering text. Nothing here is compiled, executed,
// downloaded or transmitted by Hermes. In particular no file in this phase is,
// or claims to be, a TIA Portal `.apXX` archive: producing one requires
// licensed Windows tooling that is not available in this environment, and that
// limitation is reported as an owner/tooling gate rather than papered over.
//
// PROVENANCE
// Every artefact carries its own SHA-256 and the list of corpus nodes it
// declares. That is what lets the Brain answer "which routine, in which
// language, at which revision, states this?" instead of "the model says so".

import { createHash } from "node:crypto";
import type { AuthoredProvenance, Provenance } from "./types";

/* ── Languages ────────────────────────────────────────────────────────────── */

export const ARTIFACT_LANGUAGES = [
  /** IEC 61131-3 Structured Text, Siemens SCL dialect. */
  "SCL",
  /** Ladder logic exported as structured, importable XML. */
  "LAD_XML",
  /** Function block diagram exported as structured, importable XML. */
  "FBD_XML",
  /** WinCC-Unified-class SCADA scripting. */
  "JAVASCRIPT",
  /** Declarative SCADA configuration (tags, alarms, historian, KPI). */
  "SCADA_JSON",
  /** Declarative HMI screen / faceplate / navigation definition. */
  "HMI_JSON",
  /** Deterministic plant-simulation source (never a control path). */
  "CPP",
] as const;
export type ArtifactLanguage = (typeof ARTIFACT_LANGUAGES)[number];

/** Which engineering layer an artefact belongs to. */
export const ARTIFACT_LAYERS = [
  "PHYSICAL_PROCESS",
  "SIMULATION",
  "PLC_LOGIC",
  "IO",
  "SCADA",
  "HMI",
] as const;
export type ArtifactLayer = (typeof ARTIFACT_LAYERS)[number];

/* ── Artefact ─────────────────────────────────────────────────────────────── */

export interface AuthoredSourceArtifact {
  /** Local id inside the project, e.g. "FB1210_MillSequence". */
  local: string;
  language: ArtifactLanguage;
  layer: ArtifactLayer;
  /** Filename as it would appear in an engineering export. */
  fileName: string;
  /**
   * Corpus node ids this artefact implements or declares. Sealing rejects an
   * id that does not exist, so an artefact cannot claim to implement something
   * the corpus has never heard of.
   */
  declares: string[];
  /** The engineering source itself. */
  content: string;
  provenance: AuthoredProvenance;
}

export interface SourceArtifact {
  /** Corpus-unique id: "<PROJECT>:SRC:<LOCAL>". */
  id: string;
  local: string;
  language: ArtifactLanguage;
  layer: ArtifactLayer;
  fileName: string;
  declares: string[];
  content: string;
  /** SHA-256 of the content, normalised to LF so a CRLF checkout cannot
   *  change an artefact's identity. */
  checksum: string;
  /** Line count, for surfaces that summarise an artefact without shipping it. */
  lineCount: number;
  provenance: Provenance;
}

/**
 * Normalise line endings before hashing.
 *
 * `core.autocrlf` rewrites working-tree line endings on Windows checkouts. If
 * the checksum were taken over the raw bytes, the same artefact would have two
 * different identities depending on which machine cloned the repository — and
 * the provenance gate would fail for a reason that has nothing to do with
 * engineering content.
 */
export function normaliseSource(content: string): string {
  return content.replace(/\r\n/g, "\n");
}

export function checksumOfArtifact(content: string): string {
  return createHash("sha256").update(normaliseSource(content), "utf8").digest("hex");
}

export function countLines(content: string): number {
  const normalised = normaliseSource(content);
  return normalised.length === 0 ? 0 : normalised.split("\n").length;
}

/* ── Extraction result ────────────────────────────────────────────────────── */

/**
 * A relationship recovered from source text rather than authored by hand.
 *
 * The extractors below are deterministic parsers, not heuristics with a
 * confidence score: either the source states a relationship or it does not.
 * That is what makes "the graph agrees with the code" a testable claim.
 */
export interface ExtractedRelation {
  /** Symbolic name exactly as written in the source. */
  symbol: string;
  relation: "READS" | "WRITES" | "CALLS";
  /** 1-based line in the artefact where the relation was found. */
  line: number;
}

export interface ExtractedUnit {
  /** Declared routine/screen/view name. */
  name: string;
  /** Declared kind, in the source language's own vocabulary. */
  kind: string;
  relations: ExtractedRelation[];
}

export interface ExtractionResult {
  units: ExtractedUnit[];
  /** Symbols read anywhere in the artefact, de-duplicated and sorted. */
  reads: string[];
  /** Symbols written anywhere in the artefact, de-duplicated and sorted. */
  writes: string[];
  /** Routines invoked anywhere in the artefact, de-duplicated and sorted. */
  calls: string[];
}

export function emptyExtraction(): ExtractionResult {
  return { units: [], reads: [], writes: [], calls: [] };
}

const byString = (a: string, b: string): number => (a < b ? -1 : a > b ? 1 : 0);

/** Collapse per-unit relations into the sorted, de-duplicated summary sets. */
export function summariseUnits(units: ExtractedUnit[]): ExtractionResult {
  const reads = new Set<string>();
  const writes = new Set<string>();
  const calls = new Set<string>();
  for (const unit of units) {
    for (const rel of unit.relations) {
      if (rel.relation === "READS") reads.add(rel.symbol);
      else if (rel.relation === "WRITES") writes.add(rel.symbol);
      else calls.add(rel.symbol);
    }
  }
  return {
    units,
    reads: [...reads].sort(byString),
    writes: [...writes].sort(byString),
    calls: [...calls].sort(byString),
  };
}
