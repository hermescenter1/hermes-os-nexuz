import type { BrainDomainId, ReasoningMode, SafetyKind } from "@/lib/services/types";

/**
 * Analysis Memory Engine (Step 6).
 *
 * Persists every Brain analysis with its learning metadata. V1 SCOPE —
 * stated plainly: storage is an in-process bounded ring buffer, so records
 * persist for the lifetime of the Node server process (cleared on restart
 * and per-instance in serverless). No database is permitted yet; the
 * MemoryStore interface below is the seam Phase 2 re-points at Postgres
 * without touching callers.
 */

export interface AnalysisRecord {
  id: string;
  ts: number;
  /** stored truncated — memory is metadata, not a transcript */
  question: string;
  locale: "fa" | "en";
  domains: { id: BrainDomainId; score: number }[];
  libraries: string[];
  caseMatches: string[];
  vendors: string[];
  mode: ReasoningMode;
  safety: SafetyKind;
  guardrail?: string;
  /** learning metadata */
  confidence: number;
  evidenceScore: number;
  /* ---- Step 8: root-cause metadata (optional, additive) ---- */
  primaryCause?: string;
  caseId?: string;
  vendor?: string;
  /** Unknown layer: stored separately in statistics */
  unknown?: boolean;
  /** Phase 9C: sub-threshold near-miss domains for Unknown triage */
  suggestedDomains?: { id: BrainDomainId; score: number }[];
}

export interface MemoryStats {
  count: number;
  knownCount: number;
  unknownCount: number;
  avgConfidence: number;
  avgEvidence: number;
  byDomain: Record<string, number>;
  /** Phase A: top vendors aggregated from known analyses — always computed
   *  by stats()/computeMemoryStats(); this field was missing from the
   *  declared type even though BrainMemoryStats (services/types.ts) and
   *  ExecutiveOverview.tsx both already depend on it. */
  byVendor: Record<string, number>;
  /** Step 9: Brain reference counts per knowledge library (session) */
  libraryRefs: Record<string, number>;
  guardrailHits: number;
}

export interface MemoryStore {
  record(r: Omit<AnalysisRecord, "id" | "ts">): AnalysisRecord;
  recent(n?: number): AnalysisRecord[];
  stats(): MemoryStats;
}

const MAX_RECORDS = 200;

/**
 * Phase 11B-B: extracted so `/api/brain` GET can compute the same aggregate
 * shape over PostgreSQL-sourced records in database mode, without
 * duplicating the algorithm. Pure — takes any record list, in-process or
 * mapped from `analysisRepository().list()`.
 */
export function computeMemoryStats(buf: readonly AnalysisRecord[]): MemoryStats {
  const count = buf.length;
  const byDomain: Record<string, number> = {};
  const byVendor: Record<string, number> = {};
  const libraryRefs: Record<string, number> = {};
  let conf = 0;
  let ev = 0;
  let guards = 0;
  let unknowns = 0;
  for (const r of buf) {
    if (r.unknown) {
      // Unknown analyses count separately; their fixed low confidence
      // is excluded from the averages so it cannot dilute real signal.
      unknowns++;
      if (r.guardrail) guards++;
      continue;
    }
    conf += r.confidence;
    ev += r.evidenceScore;
    if (r.guardrail) guards++;
    const top = r.domains[0]?.id;
    if (top) byDomain[top] = (byDomain[top] ?? 0) + 1;
    for (const v of r.vendors) byVendor[v] = (byVendor[v] ?? 0) + 1;
    for (const lib of r.libraries) libraryRefs[lib] = (libraryRefs[lib] ?? 0) + 1;
  }
  const known = count - unknowns;
  return {
    count,
    knownCount: known,
    unknownCount: unknowns,
    avgConfidence: known ? Math.round((conf / known) * 100) / 100 : 0,
    avgEvidence: known ? Math.round((ev / known) * 100) / 100 : 0,
    byDomain,
    byVendor,
    libraryRefs,
    guardrailHits: guards,
  };
}

function createInProcessStore(): MemoryStore {
  const buf: AnalysisRecord[] = [];
  let seq = 0;

  return {
    record(r) {
      const rec: AnalysisRecord = {
        ...r,
        question: r.question.slice(0, 300),
        ...(r.primaryCause ? { primaryCause: r.primaryCause.slice(0, 200) } : {}),
        id: `a${++seq}`,
        ts: Date.now(),
      };
      buf.push(rec);
      if (buf.length > MAX_RECORDS) buf.shift();
      return rec;
    },
    recent(n = 20) {
      return buf.slice(-n).reverse();
    },
    stats() {
      return computeMemoryStats(buf);
    },
  };
}

// Survive Next.js dev hot-reload by anchoring on globalThis.
const g = globalThis as unknown as { __hermesMemory?: MemoryStore };
export const analysisMemory: MemoryStore =
  g.__hermesMemory ?? (g.__hermesMemory = createInProcessStore());
