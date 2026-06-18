/**
 * Phase 26 — Pure Engineering Playbook Engine.
 *
 * Builds domain-level resolution playbooks from high-confidence success
 * memories (confidence >= 70, outcome = "success"). A domain needs at least
 * two qualifying memories to generate a playbook. No I/O, no side effects.
 */

import type { StoredMemory } from "@/lib/storage/types";

// ── Public types ───────────────────────────────────────────────────────────

export interface PlaybookStep {
  order:       number;
  description: string;
  source:      "memory";
  sourceId:    string;
}

export interface PlaybookEntry {
  id:            string;
  domain:        string;
  title:         string;
  description:   string;
  memoryCount:   number;
  avgConfidence: number;
  steps:         PlaybookStep[];
  caseIds:       string[];
}

export interface PlaybookResult {
  playbooks:  PlaybookEntry[];
  totalCount: number;
}

// ── Constants ──────────────────────────────────────────────────────────────

const MIN_QUALIFYING = 2;
const MIN_CONFIDENCE = 70;

// ── Main export ────────────────────────────────────────────────────────────

export function computePlaybooks(memories: StoredMemory[]): PlaybookResult {
  const domainNames = [...new Set(memories.map(m => m.domain).filter(Boolean))];
  const playbooks: PlaybookEntry[] = [];

  for (const domain of domainNames) {
    const qualifying = memories
      .filter(m => m.domain === domain && m.outcome === "success" && m.confidence >= MIN_CONFIDENCE)
      .sort((a, b) => {
        const cd = b.confidence - a.confidence;
        return cd !== 0 ? cd : a.id.localeCompare(b.id);
      });

    if (qualifying.length < MIN_QUALIFYING) continue;

    const avgConf  = Math.round(qualifying.reduce((s, m) => s + m.confidence, 0) / qualifying.length);
    const caseIds  = [...new Set(qualifying.flatMap(m => m.relatedCaseIds ?? []))].sort();
    const steps    = qualifying.map((m, i) => ({
      order:       i + 1,
      description: m.analysisSummary,
      source:      "memory" as const,
      sourceId:    m.id,
    }));

    playbooks.push({
      id:            `playbook:${domain}`,
      domain,
      title:         `${domain} resolution playbook`,
      description:   `Proven resolution patterns for the ${domain} domain based on ${qualifying.length} verified memories.`,
      memoryCount:   qualifying.length,
      avgConfidence: avgConf,
      steps,
      caseIds,
    });
  }

  playbooks.sort((a, b) => {
    const dm = b.memoryCount - a.memoryCount;
    return dm !== 0 ? dm : a.domain.localeCompare(b.domain);
  });

  return { playbooks, totalCount: playbooks.length };
}
