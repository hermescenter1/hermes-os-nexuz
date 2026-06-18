/**
 * Phase 26 — Pure Recommendation Engine.
 *
 * Produces deterministic, prioritised action items from memory data.
 * Six rule types fire independently; results are sorted by priority
 * then impact then id. No I/O, no side effects.
 */

import type { StoredMemory, StoredMemoryFeedback } from "@/lib/storage/types";

// ── Public types ───────────────────────────────────────────────────────────

export type RecommendationType =
  | "collect_feedback"
  | "review_failures"
  | "update_stale"
  | "expand_domain"
  | "link_to_project"
  | "document_success";

export type RecommendationPriority = "high" | "medium" | "low";

export interface Recommendation {
  id:          string;
  type:        RecommendationType;
  priority:    RecommendationPriority;
  title:       string;
  description: string;
  targetId?:   string;
  targetType?: "memory" | "domain";
  impact:      number;
}

export interface RecommendationResult {
  recommendations: Recommendation[];
  totalCount:      number;
}

// ── Constants ──────────────────────────────────────────────────────────────

const STALE_DAYS      = 90;
const STALE_MS        = STALE_DAYS * 24 * 60 * 60 * 1000;
const RULE_LIMIT      = 5;
const DOMAIN_MIN      = 3;

const PRIORITY_ORDER: Record<RecommendationPriority, number> = {
  high:   0,
  medium: 1,
  low:    2,
};

// ── Helpers ────────────────────────────────────────────────────────────────

function truncate(s: string, max = 50): string {
  return s.length > max ? s.slice(0, max - 3) + "..." : s;
}

// ── Main export ────────────────────────────────────────────────────────────

export function computeRecommendations(
  memories:           StoredMemory[],
  feedbackByMemoryId: Map<string, StoredMemoryFeedback[]>,
  now                 = new Date()
): RecommendationResult {
  const fbCount  = (id: string) => (feedbackByMemoryId.get(id) ?? []).length;
  const ageDays  = (m: StoredMemory) =>
    Math.floor((now.getTime() - new Date(m.createdAt).getTime()) / 86400000);

  const all: Recommendation[] = [];

  // 1. collect_feedback (high): uncertain memories with no feedback
  memories
    .filter(m => m.outcome === "unknown" && m.confidence < 60 && fbCount(m.id) === 0)
    .sort((a, b) => a.confidence - b.confidence || a.id.localeCompare(b.id))
    .slice(0, RULE_LIMIT)
    .forEach(m => all.push({
      id:         `collect_feedback:${m.id}`,
      type:       "collect_feedback",
      priority:   "high",
      title:      "Collect feedback for uncertain memory",
      description: `Memory "${truncate(m.query)}" has low confidence (${m.confidence}%) and no feedback.`,
      targetId:   m.id,
      targetType: "memory",
      impact:     Math.round((100 - m.confidence) * 0.8),
    }));

  // 2. review_failures (high): failed memories with no feedback
  memories
    .filter(m => m.outcome === "failed" && fbCount(m.id) === 0)
    .sort((a, b) =>
      new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime() ||
      a.id.localeCompare(b.id)
    )
    .slice(0, RULE_LIMIT)
    .forEach(m => all.push({
      id:         `review_failures:${m.id}`,
      type:       "review_failures",
      priority:   "high",
      title:      "Review failed outcome",
      description: `Memory "${truncate(m.query)}" has a failed outcome with no follow-up.`,
      targetId:   m.id,
      targetType: "memory",
      impact:     80,
    }));

  // 3. update_stale (medium): unknown memories older than 90 days
  memories
    .filter(m => m.outcome === "unknown" && ageDays(m) > STALE_DAYS)
    .sort((a, b) =>
      new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime() ||
      a.id.localeCompare(b.id)
    )
    .slice(0, RULE_LIMIT)
    .forEach(m => all.push({
      id:         `update_stale:${m.id}`,
      type:       "update_stale",
      priority:   "medium",
      title:      "Review outdated memory",
      description: `Memory "${truncate(m.query)}" has been unresolved for over ${STALE_DAYS} days.`,
      targetId:   m.id,
      targetType: "memory",
      impact:     50,
    }));

  // 4. expand_domain (medium): domains with fewer than 3 memories
  const domainCounts = new Map<string, number>();
  for (const m of memories) {
    if (m.domain) domainCounts.set(m.domain, (domainCounts.get(m.domain) ?? 0) + 1);
  }
  [...domainCounts.entries()]
    .filter(([, count]) => count < DOMAIN_MIN)
    .sort(([a], [b]) => a.localeCompare(b))
    .slice(0, RULE_LIMIT)
    .forEach(([domain, count]) => all.push({
      id:         `expand_domain:${domain}`,
      type:       "expand_domain",
      priority:   "medium",
      title:      `Expand "${domain}" knowledge base`,
      description: `Domain "${domain}" has only ${count} ${count === 1 ? "memory" : "memories"}.`,
      targetId:   domain,
      targetType: "domain",
      impact:     Math.max(20, (DOMAIN_MIN - count) * 30),
    }));

  // 5. link_to_project (low): memories without a project association
  memories
    .filter(m => !m.projectId)
    .sort((a, b) => b.confidence - a.confidence || a.id.localeCompare(b.id))
    .slice(0, RULE_LIMIT)
    .forEach(m => all.push({
      id:         `link_to_project:${m.id}`,
      type:       "link_to_project",
      priority:   "low",
      title:      "Link memory to a project",
      description: `Memory "${truncate(m.query)}" is not associated with any project.`,
      targetId:   m.id,
      targetType: "memory",
      impact:     30,
    }));

  // 6. document_success (low): success memories lacking feedback
  memories
    .filter(m => m.outcome === "success" && fbCount(m.id) === 0)
    .sort((a, b) => b.confidence - a.confidence || a.id.localeCompare(b.id))
    .slice(0, RULE_LIMIT)
    .forEach(m => all.push({
      id:         `document_success:${m.id}`,
      type:       "document_success",
      priority:   "low",
      title:      "Document successful resolution",
      description: `Memory "${truncate(m.query)}" resolved successfully but lacks documentation.`,
      targetId:   m.id,
      targetType: "memory",
      impact:     40,
    }));

  all.sort((a, b) => {
    const pd = PRIORITY_ORDER[a.priority] - PRIORITY_ORDER[b.priority];
    if (pd !== 0) return pd;
    const id = b.impact - a.impact;
    if (id !== 0) return id;
    return a.id.localeCompare(b.id);
  });

  return { recommendations: all, totalCount: all.length };
}
