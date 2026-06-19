/**
 * Industrial Copilot orchestrator — Phase 38.
 *
 * Deterministic. No LLM. Response built by template/intent formatting.
 * Safety check → intent → context → insights → recommendations → confidence → format.
 *
 * READ-ONLY INVARIANT: No control commands, no PLC writes, no actuator actions.
 */

import { getPrisma }                  from "@/lib/db/prisma";
import { checkSafetyGuard }           from "./safety";
import { classifyIntent }             from "./intent";
import { generateInsights, listInsights } from "./insights";
import { generateRecommendations }    from "./recommendations";
import { scoreConfidence, isInsufficientData, INSUFFICIENT_DATA_RESPONSE_EN } from "./confidence";
import { getAssetContextSummary, getSiteContextSummary } from "./context";
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

export async function getConversation(
  id:             string,
  organizationId: string,
): Promise<{ conversation: ConversationRecord; messages: MessageRecord[] } | null> {
  const prisma = await getPrisma();
  if (!prisma) return null;
  const db  = prisma as unknown as Record<string, unknown>;
  const row = await (db.copilotConversation as unknown as ConvModel).findFirst({
    where: { id, organizationId },
  });
  if (!row) return null;
  const msgs = await (db.copilotMessage as unknown as MsgModel).findMany({
    where:   { conversationId: id },
    orderBy: { createdAt: "asc" },
  });
  return { conversation: rowToConv(row), messages: msgs.map(rowToMsg) };
}

export async function listConversations(
  organizationId: string,
  limit           = 20,
): Promise<ConversationRecord[]> {
  const prisma = await getPrisma();
  if (!prisma) return [];
  const db   = prisma as unknown as Record<string, unknown>;
  const rows = await (db.copilotConversation as unknown as ConvModel).findMany({
    where:   { organizationId },
    orderBy: { updatedAt: "desc" },
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
  organizationId: string,
  query:          string,
  assetId?:       string,
  siteId?:        string,
  locale          = "en",
): Promise<CopilotResponse> {
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
  const insights     = await generateInsights(organizationId, siteId);
  const assetInsights = assetId
    ? insights.filter((i) => i.assetId === assetId)
    : insights;

  const observations: CopilotObservation[] = [];

  // ── 4. Intent-specific observations ───────────────────────────────────────
  if (intent === "dependency_question" && assetId) {
    const [up, down] = await Promise.all([
      getUpstreamAssets(assetId, organizationId).catch(() => ({ nodes: [], cycleDetected: false, truncated: false })),
      getDownstreamAssets(assetId, organizationId).catch(() => ({ nodes: [], cycleDetected: false, truncated: false })),
    ]);
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
    const ctx = await getAssetContextSummary(organizationId, assetId).catch(() => null);
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
  organizationId: string,
  conversationId: string,
  content:        string,
  assetId?:       string,
  siteId?:        string,
  locale          = "en",
): Promise<{ userMessage: MessageRecord; assistantMessage: MessageRecord; response: CopilotResponse } | null> {
  const prisma = await getPrisma();
  if (!prisma) return null;
  const db = prisma as unknown as Record<string, unknown>;

  // Verify conversation belongs to org
  const conv = await (db.copilotConversation as unknown as ConvModel).findFirst({
    where: { id: conversationId, organizationId },
  });
  if (!conv) return null;

  const userMsg   = await appendMessage(db, conversationId, "USER",      content);
  const response  = await generateResponse(organizationId, content, assetId, siteId, locale);
  const assistMsg = await appendMessage(db, conversationId, "ASSISTANT", response.summary, {
    intent:      response.intent,
    confidence:  response.confidence,
    insightCount: response.insights.length,
    recCount:    response.recommendations.length,
  });

  return { userMessage: userMsg, assistantMessage: assistMsg, response };
}
