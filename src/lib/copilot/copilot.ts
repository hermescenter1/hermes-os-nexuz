/**
 * Industrial Copilot orchestrator — Phase 38.
 *
 * Deterministic. No LLM. Response built by template/intent formatting.
 * Safety check → intent → context → insights → recommendations → confidence → format.
 *
 * READ-ONLY INVARIANT: No control commands, no PLC writes, no actuator actions.
 *
 * SITE SCOPE (slice C, IR-03): the engine runs only with a server-built {@link CopilotScope}
 * (./scope.ts). Every asset, site, telemetry and Digital Twin read below is bounded by it; there is no
 * organisation-wide entry point and no client value reaches a reader unchecked. Conversations are the
 * owner's own, and a stored answer is shown again only while the sites it was built from are still
 * readable by the current actor (see {@link getConversation}).
 */

import { getPrisma }                  from "@/lib/db/prisma";
import { checkSafetyGuard }           from "./safety";
import { classifyIntent }             from "./intent";
import { generateInsights }       from "./insights";
import { effectiveSiteIds, type CopilotScope } from "./scope";
import { generateRecommendations }    from "./recommendations";
import { scoreConfidence, isInsufficientData, INSUFFICIENT_DATA_RESPONSE_EN } from "./confidence";
import { getAssetContextSummary } from "./context";
import { getUpstreamAssets, getDownstreamAssets }        from "@/lib/digital-twin/graph";
import { getAlarmFrequency }          from "@/lib/time-series/alarms";
import { calculateAvailability }      from "@/lib/time-series/kpi";
import { getPeriodRange }             from "@/lib/time-series/periods";
import { meterIndustrialEvent }       from "@/lib/api/meter";
import type {
  CopilotResponse, ConversationRecord, MessageRecord,
  CopilotInsightRecord, CopilotObservation, CopilotEvidence,
} from "./types";

type ConvModel = {
  create:   (a: unknown) => Promise<Record<string, unknown>>;
  findFirst:(a: unknown) => Promise<Record<string, unknown> | null>;
  findMany: (a: unknown) => Promise<Record<string, unknown>[]>;
};
type MsgModel = {
  create:   (a: unknown) => Promise<Record<string, unknown>>;
  findMany: (a: unknown) => Promise<Record<string, unknown>[]>;
};
type TelemetryModel = { findFirst: (a: unknown) => Promise<Record<string, unknown> | null> };
type TwinNodeModel  = { findMany:  (a: unknown) => Promise<Record<string, unknown>[]> };

/** Upper bound of messages returned for one conversation. */
const MAX_MESSAGES_PER_CONVERSATION = 500;
type CountModel     = { count:     (a: unknown) => Promise<number> };

function rowToConv(r: Record<string, unknown>): ConversationRecord {
  return {
    id:             r.id             as string,
    organizationId: r.organizationId as string,
    userId:         (r.userId        ?? null) as string | null,
    title:          r.title          as string,
    createdAt:      new Date(r.createdAt as string).toISOString(),
    updatedAt:      new Date(r.updatedAt as string).toISOString(),
  };
}
function rowToMsg(r: Record<string, unknown>): MessageRecord {
  return {
    id:             r.id             as string,
    conversationId: r.conversationId as string,
    role:           r.role           as MessageRecord["role"],
    content:        r.content        as string,
    metadata:       (r.metadata ?? {}) as Record<string, unknown>,
    createdAt:      new Date(r.createdAt as string).toISOString(),
  };
}

export async function createConversation(
  organizationId: string,
  userId:         string | null,
  title:          string,
): Promise<ConversationRecord | null> {
  const prisma = await getPrisma();
  if (!prisma) return null;
  const db  = prisma as unknown as Record<string, unknown>;
  const row = await (db.copilotConversation as unknown as ConvModel).create({
    data: { organizationId, userId, title },
  });
  meterIndustrialEvent(organizationId, "copilot_conversations");
  return rowToConv(row);
}

/**
 * May the CURRENT actor see a stored assistant answer?
 *
 * Every answer stored since slice C records the sites it was built from (`metadata.scope.siteIds`); it is
 * shown only while every one of them is still readable. An answer stored before that carries no site
 * attribution, and its counts may have been computed from the whole organisation, so it is withheld
 * rather than guessed about. Free text cannot be sanitised reliably; it is not attempted.
 */
export function storedAnswerReadable(metadata: Record<string, unknown>, readableSiteIds: readonly string[]): boolean {
  const scope = metadata.scope;
  if (!scope || typeof scope !== "object") return false;
  const sites = (scope as Record<string, unknown>).siteIds;
  if (!Array.isArray(sites) || !sites.every((s) => typeof s === "string" && s.length > 0)) return false;
  return sites.every((s) => readableSiteIds.includes(s as string));
}

/** A withheld assistant answer keeps its place in the thread but carries nothing site-derived. */
function withheld(m: MessageRecord): MessageRecord {
  return { ...m, content: "", metadata: { withheld: true } };
}

/**
 * The actor's OWN conversation (a conversation of another member is "not found", like a missing one), with
 * every assistant answer re-authorised against the actor's CURRENT readable sites.
 */
export async function getConversation(
  id:     string,
  viewer: { organizationId: string; userId: string; siteIds: readonly string[] },
): Promise<{ conversation: ConversationRecord; messages: MessageRecord[] } | null> {
  if (!viewer.userId) return null;
  const prisma = await getPrisma();
  if (!prisma) return null;
  const db  = prisma as unknown as Record<string, unknown>;
  const row = await (db.copilotConversation as unknown as ConvModel).findFirst({
    where: { id, organizationId: viewer.organizationId, userId: viewer.userId },
  });
  if (!row) return null;
  const msgs = await (db.copilotMessage as unknown as MsgModel).findMany({
    where:   { conversationId: id },
    // The NEWEST messages are the ones the bound keeps: read newest-first, then
    // restore chronological order. (Oldest-first with a `take` would freeze a
    // long conversation at its first N messages — review F4.)
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    take:    MAX_MESSAGES_PER_CONVERSATION,
  });
  msgs.reverse();
  const messages = msgs.map(rowToMsg).map((m) =>
    m.role === "ASSISTANT" && !storedAnswerReadable(m.metadata, viewer.siteIds) ? withheld(m) : m);
  return { conversation: rowToConv(row), messages };
}

/** The actor's own conversations only. */
export async function listConversations(
  organizationId: string,
  userId:         string,
  limit           = 20,
): Promise<ConversationRecord[]> {
  if (!userId) return [];
  const prisma = await getPrisma();
  if (!prisma) return [];
  const db   = prisma as unknown as Record<string, unknown>;
  const rows = await (db.copilotConversation as unknown as ConvModel).findMany({
    where:   { organizationId, userId },
    orderBy: [{ updatedAt: "desc" }, { id: "asc" }],
    take:    limit,
  });
  return rows.map(rowToConv);
}

async function appendMessage(
  db:             Record<string, unknown>,
  conversationId: string,
  role:           MessageRecord["role"],
  content:        string,
  metadata:       Record<string, unknown> = {},
): Promise<MessageRecord> {
  const row = await (db.copilotMessage as unknown as MsgModel).create({
    data: { conversationId, role, content, metadata },
  });
  return rowToMsg(row);
}

export async function generateResponse(
  scope:  CopilotScope,
  query:  string,
  locale  = "en",
): Promise<CopilotResponse> {
  const organizationId = scope.organizationId;
  const assetId = scope.asset?.id;
  const siteId  = scope.siteId ?? undefined;
  const prisma = await getPrisma();
  const db     = prisma ? (prisma as unknown as Record<string, unknown>) : null;

  // ── 1. Safety guard ────────────────────────────────────────────────────────
  const safety = checkSafetyGuard(query, locale);
  if (!safety.safe) {
    return {
      intent: "general_status_question", confidence: "LOW",
      summary: safety.reason!,
      observations: [], insights: [], recommendations: [],
      supportingAssets: [], supportingKPIs: [],
      insufficientData: false, blockedReason: safety.reason,
    };
  }

  // ── 2. Intent classification ───────────────────────────────────────────────
  const intent = classifyIntent(query);

  // ── 3. Gather context and insights ────────────────────────────────────────
  const range24h     = getPeriodRange("last24Hours");
  const insights     = await generateInsights(scope);
  const assetInsights = assetId
    ? insights.filter((i) => i.assetId === assetId)
    : insights;

  const observations: CopilotObservation[] = [];

  // ── 4. Intent-specific observations ───────────────────────────────────────
  if (intent === "dependency_question" && assetId && db) {
    // The traversal starts at the asset's Digital Twin node, looked up inside the scope's sites, and
    // never leaves those sites.
    const startNodes = await (db.digitalTwinNode as unknown as TwinNodeModel).findMany({
      where:   { organizationId, assetId, siteId: { in: [...scope.siteIds] } },
      orderBy: [{ createdAt: "asc" }, { id: "asc" }],
      select:  { id: true },
      take:    1,
    }).catch(() => [] as Record<string, unknown>[]);
    const startNodeId = typeof startNodes[0]?.id === "string" ? (startNodes[0].id as string) : null;
    const none = { nodes: [], cycleDetected: false, truncated: false };
    const [up, down] = startNodeId
      ? await Promise.all([
          getUpstreamAssets(startNodeId, organizationId, scope.siteIds).catch(() => none),
          getDownstreamAssets(startNodeId, organizationId, scope.siteIds).catch(() => none),
        ])
      : [none, none];
    if (up.nodes.length > 0 || down.nodes.length > 0) {
      const evidence: CopilotEvidence[] = [
        ...up.nodes.map((n) => ({ type: "asset" as const, assetId: n.assetId ?? undefined, description: `Upstream: ${n.displayName}` })),
        ...down.nodes.map((n) => ({ type: "asset" as const, assetId: n.assetId ?? undefined, description: `Downstream: ${n.displayName}` })),
      ];
      observations.push({
        title:       "Asset dependencies",
        description: `This asset has ${up.nodes.length} upstream and ${down.nodes.length} downstream connections.`,
        evidence,
      });
    }
  }

  if (intent === "alarm_question") {
    const target = assetId ?? siteId;
    if (target) {
      const alarmFreq = await getAlarmFrequency(organizationId, assetId ?? target, range24h).catch(() => null);
      if (alarmFreq) {
        observations.push({
          title:       "Alarm summary",
          description: `Alarm rate: ${(alarmFreq.alarmRate * 100).toFixed(1)}% (BAD: ${alarmFreq.badCount}, STALE: ${alarmFreq.staleCount}).`,
          evidence:    [{ type: "telemetry" as const, assetId: assetId, description: "Last 24-hour alarm frequency", timeframe: "last 24 hours" }],
        });
      }
    }
  }

  if (intent === "kpi_question" && assetId) {
    const avail = await calculateAvailability(organizationId, assetId, range24h, "last24Hours").catch(() => null);
    if (avail) {
      observations.push({
        title:       "KPI: Availability",
        description: `Availability over last 24 hours: ${avail.value.toFixed(1)}%.`,
        evidence:    [{ type: "kpi" as const, assetId, description: `Availability = ${avail.value.toFixed(1)}%`, timeframe: "last 24 hours" }],
      });
    }
  }

  if (intent === "health_question" && assetId) {
    const ctx = await getAssetContextSummary(scope, assetId).catch(() => null);
    if (ctx) {
      observations.push({
        title:       "Asset health",
        description: `Current health score: ${ctx.healthScore ?? "N/A"}. Status: ${ctx.status}.`,
        evidence:    [{ type: "health" as const, assetId, description: `Health score: ${ctx.healthScore}` }],
      });
    }
  }

  // ── 5. Recommendations ────────────────────────────────────────────────────
  const recommendations = generateRecommendations(assetInsights);

  // ── 6. Confidence scoring ─────────────────────────────────────────────────
  let lastTelAt: Date | null = null;
  let goodFrac                = 0;
  if (db && assetId) {
    const lastRow = await (db.telemetryRecord as unknown as TelemetryModel).findFirst({
      where:   { organizationId, assetId },
      orderBy: { receivedAt: "desc" },
    });
    if (lastRow) lastTelAt = new Date(lastRow.receivedAt as string);
    const [good, total] = await Promise.all([
      (db.telemetryRecord as unknown as CountModel).count({ where: { organizationId, assetId, quality: "GOOD", receivedAt: { gte: range24h.from } } }),
      (db.telemetryRecord as unknown as CountModel).count({ where: { organizationId, assetId, receivedAt: { gte: range24h.from } } }),
    ]);
    goodFrac = total > 0 ? good / total : 0;
  }

  const evidenceCount = assetInsights.length + observations.length + recommendations.length;
  const confidence    = scoreConfidence({ lastTelemetryAt: lastTelAt, evidenceCount, goodQualityFrac: goodFrac });
  const insufficient  = isInsufficientData(confidence, evidenceCount);

  // ── 7. Summary string (template-based, deterministic) ─────────────────────
  let summary: string;
  if (insufficient) {
    summary = locale === "fa"
      ? "داده‌های صنعتی کافی برای پاسخ مطمئن به این سوال وجود ندارد."
      : INSUFFICIENT_DATA_RESPONSE_EN;
  } else {
    const critCount = assetInsights.filter((i) => i.severity === "CRITICAL").length;
    const warnCount = assetInsights.filter((i) => i.severity === "WARNING").length;
    summary = critCount > 0
      ? `Found ${critCount} critical and ${warnCount} warning insight(s). ${recommendations.length} recommendation(s) generated.`
      : warnCount > 0
        ? `Found ${warnCount} warning insight(s). ${recommendations.length} recommendation(s) generated.`
        : "No critical issues detected. System appears to be operating normally.";
  }

  meterIndustrialEvent(organizationId, "copilot_queries");

  return {
    intent,
    confidence,
    summary,
    observations,
    insights:        assetInsights.slice(0, 20),
    recommendations: recommendations.slice(0, 10),
    supportingAssets: assetId ? [assetId] : [],
    supportingKPIs:  [],
    insufficientData: insufficient,
  };
}

export async function sendMessage(
  scope:          CopilotScope,
  conversationId: string,
  content:        string,
  locale          = "en",
): Promise<{ userMessage: MessageRecord; assistantMessage: MessageRecord; response: CopilotResponse } | null> {
  if (!scope.userId) return null;
  const prisma = await getPrisma();
  if (!prisma) return null;
  const db = prisma as unknown as Record<string, unknown>;

  // The conversation must be the actor's own, in this organisation (one of another member is "not found").
  const conv = await (db.copilotConversation as unknown as ConvModel).findFirst({
    where: { id: conversationId, organizationId: scope.organizationId, userId: scope.userId },
  });
  if (!conv) return null;

  const userMsg   = await appendMessage(db, conversationId, "USER",      content);
  const response  = await generateResponse(scope, content, locale);
  const assistMsg = await appendMessage(db, conversationId, "ASSISTANT", response.summary, {
    intent:      response.intent,
    confidence:  response.confidence,
    insightCount: response.insights.length,
    recCount:    response.recommendations.length,
    // Site attribution: the answer is shown again only while these sites stay readable.
    scope:       { siteIds: effectiveSiteIds(scope) },
  });

  return { userMessage: userMsg, assistantMessage: assistMsg, response };
}
