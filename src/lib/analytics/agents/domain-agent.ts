/**
 * Phase 27 — Domain Expertise Agent (pure engine).
 *
 * Evaluates the breadth and depth of domain expertise across the memory
 * corpus. No I/O, no side effects, fully deterministic.
 */

import type { StoredMemory } from "@/lib/storage/types";

// ── Public types ───────────────────────────────────────────────────────────

export interface DomainAgentData {
  totalDomains:     number;
  expertiseBreadth: number;   // % domains with ≥ DEEP_THRESHOLD memories
  expertiseDepth:   number;   // avg confidence across all memories
  emergingDomains:  string[]; // domains with new memories in last 30d, sorted ASC
  criticalGaps:     string[]; // domains with exactly 1 memory (insufficient cross-validation), sorted ASC
}

export interface DomainAgentResult {
  agentId:  "domain";
  score:    number;
  findings: string[];
  data:     DomainAgentData;
}

// ── Constants ──────────────────────────────────────────────────────────────

const DEEP_THRESHOLD = 3;
const EMERGING_MS    = 30 * 24 * 60 * 60 * 1000;
const GAP_PENALTY    = 15;   // pts per critical-gap domain

// ── Helpers ────────────────────────────────────────────────────────────────

function pct(n: number, d: number): number {
  return d === 0 ? 0 : Math.round((n / d) * 100);
}

// ── Main export ────────────────────────────────────────────────────────────

export function computeDomainAgent(
  memories: StoredMemory[],
  now       = new Date()
): DomainAgentResult {
  if (memories.length === 0) {
    return {
      agentId:  "domain",
      score:    0,
      findings: ["No memories to analyze domain expertise"],
      data: { totalDomains: 0, expertiseBreadth: 0, expertiseDepth: 0, emergingDomains: [], criticalGaps: [] },
    };
  }

  // Build per-domain memory list
  const domainMap = new Map<string, StoredMemory[]>();
  for (const m of memories) {
    const arr = domainMap.get(m.domain) ?? [];
    arr.push(m);
    domainMap.set(m.domain, arr);
  }

  const totalDomains    = domainMap.size;
  const deepDomains     = [...domainMap.values()].filter(mems => mems.length >= DEEP_THRESHOLD).length;
  const expertiseBreadth = pct(deepDomains, totalDomains);
  const expertiseDepth   = Math.round(
    memories.reduce((s, m) => s + m.confidence, 0) / memories.length
  );

  const nowMs = now.getTime();
  const cut   = nowMs - EMERGING_MS;

  const emergingDomains = [...domainMap.entries()]
    .filter(([, mems]) => mems.some(m => new Date(m.createdAt).getTime() >= cut))
    .map(([d]) => d)
    .sort();

  const criticalGaps = [...domainMap.entries()]
    .filter(([, mems]) => mems.length === 1)
    .map(([d]) => d)
    .sort();

  // Composite score: breadth×0.4 + depth×0.4 + gap-free×0.2
  const gapPenalty = Math.min(100, criticalGaps.length * GAP_PENALTY);
  const score = Math.min(100, Math.max(0, Math.round(
    expertiseBreadth * 0.4 +
    expertiseDepth   * 0.4 +
    (100 - gapPenalty) * 0.2
  )));

  const findings: string[] = [];
  if (expertiseBreadth >= 60)         findings.push("Strong domain coverage breadth");
  else if (expertiseBreadth < 30)     findings.push("Domain coverage is narrow");
  if (expertiseDepth >= 70)           findings.push("Deep expertise across domains");
  else if (expertiseDepth < 40)       findings.push("Low expertise depth — build confidence");
  if (criticalGaps.length > 0)        findings.push(`${criticalGaps.length} domain(s) with minimal coverage`);
  if (emergingDomains.length > 0)     findings.push(`${emergingDomains.length} domain(s) growing recently`);
  if (findings.length === 0)          findings.push("Domain expertise is well distributed");

  return {
    agentId: "domain",
    score,
    findings,
    data: { totalDomains, expertiseBreadth, expertiseDepth, emergingDomains, criticalGaps },
  };
}
