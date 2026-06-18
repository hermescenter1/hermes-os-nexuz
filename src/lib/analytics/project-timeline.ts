import type {
  StoredProject,
  StoredMemory,
  StoredMemoryFeedback,
  MemoryOutcome,
} from "@/lib/storage/types";

// ── Types ──────────────────────────────────────────────────────────────────

export type TimelineEventType =
  | "project_created"
  | "project_updated"
  | "memory_created"
  | "feedback_added"
  | "outcome_resolved"
  | "outcome_failed"
  | "outcome_partial";

export interface TimelineEvent {
  type: TimelineEventType;
  timestamp: string;
  title: string;
  details: string;
}

export interface TimelineStats {
  /** ISO timestamp of the earliest event; null when timeline is empty. */
  firstActivity: string | null;
  /** ISO timestamp of the most recent event; null when timeline is empty. */
  lastActivity: string | null;
  totalEvents: number;
  /** Whole days between project.createdAt and `now`. */
  projectAgeDays: number;
  /** Compares event count in the last 30 days vs the prior 30-day window. */
  activityTrend: "increasing" | "stable" | "decreasing";
}

export interface ProjectTimelineData {
  projectId: string;
  timeline: TimelineEvent[];
  stats: TimelineStats;
}

// ── Pure helpers ───────────────────────────────────────────────────────────

function outcomeToEventType(outcome: MemoryOutcome): TimelineEventType {
  switch (outcome) {
    case "success": return "outcome_resolved";
    case "failed":  return "outcome_failed";
    case "partial": return "outcome_partial";
    default:        return "feedback_added";
  }
}

function outcomeTitle(type: TimelineEventType, domain: string): string {
  switch (type) {
    case "outcome_resolved": return `Outcome resolved: ${domain}`;
    case "outcome_failed":   return `Outcome failed: ${domain}`;
    case "outcome_partial":  return `Partial outcome: ${domain}`;
    default:                 return `Feedback added: ${domain}`;
  }
}

function daysBetween(from: Date, to: Date): number {
  return Math.max(0, Math.floor((to.getTime() - from.getTime()) / (24 * 3600 * 1000)));
}

function computeStats(
  project: StoredProject,
  events: TimelineEvent[],
  now: Date
): TimelineStats {
  const projectAgeDays = daysBetween(new Date(project.createdAt), now);

  if (events.length === 0) {
    return {
      firstActivity: null,
      lastActivity: null,
      totalEvents: 0,
      projectAgeDays,
      activityTrend: "stable",
    };
  }

  const last30Start  = new Date(now.getTime() - 30 * 24 * 3_600_000);
  const prior30Start = new Date(now.getTime() - 60 * 24 * 3_600_000);

  const last30Count = events.filter(
    (e) => new Date(e.timestamp) >= last30Start
  ).length;
  const prior30Count = events.filter(
    (e) => new Date(e.timestamp) >= prior30Start && new Date(e.timestamp) < last30Start
  ).length;

  return {
    firstActivity: events[0].timestamp,
    lastActivity:  events[events.length - 1].timestamp,
    totalEvents:   events.length,
    projectAgeDays,
    activityTrend:
      last30Count > prior30Count ? "increasing" :
      last30Count < prior30Count ? "decreasing" :
      "stable",
  };
}

// ── Core timeline engine ───────────────────────────────────────────────────

/**
 * Pure, deterministic timeline reconstruction — no I/O, no side effects.
 *
 * Events are sorted chronologically (timestamp ASC); ties broken by event
 * type alphabetically to ensure stable output across repeated calls.
 */
export function computeProjectTimeline(
  project: StoredProject,
  memories: StoredMemory[],
  feedbackByMemoryId: Map<string, StoredMemoryFeedback[]>,
  now = new Date()
): ProjectTimelineData {
  const events: TimelineEvent[] = [];

  // project_created — always the first event
  events.push({
    type:      "project_created",
    timestamp: project.createdAt,
    title:     `Project created: ${project.name}`,
    details:   project.description.trim() || `Project '${project.name}' was created with status '${project.status}'.`,
  });

  // project_updated — only when updatedAt meaningfully differs from createdAt
  if (project.updatedAt !== project.createdAt) {
    events.push({
      type:      "project_updated",
      timestamp: project.updatedAt,
      title:     `Project updated: ${project.name}`,
      details:   `Project '${project.name}' metadata was updated.`,
    });
  }

  // memory and feedback events
  for (const memory of memories) {
    events.push({
      type:      "memory_created",
      timestamp: memory.createdAt,
      title:     `Analysis recorded: ${memory.domain}`,
      details:   memory.analysisSummary.trim() || memory.query,
    });

    const feedback = feedbackByMemoryId.get(memory.id) ?? [];
    for (const fb of feedback) {
      const type = outcomeToEventType(fb.outcome);
      events.push({
        type,
        timestamp: fb.createdAt,
        title:     outcomeTitle(type, memory.domain),
        details:   `Outcome '${fb.outcome}' recorded for analysis in domain '${memory.domain}'.${fb.notes ? ` Notes: ${fb.notes}` : ""}`,
      });
    }
  }

  // Stable chronological sort: timestamp ASC, then type ASC for same timestamp
  events.sort((a, b) => {
    const tsDiff = a.timestamp.localeCompare(b.timestamp);
    return tsDiff !== 0 ? tsDiff : a.type.localeCompare(b.type);
  });

  return {
    projectId: project.id,
    timeline:  events,
    stats:     computeStats(project, events, now),
  };
}
