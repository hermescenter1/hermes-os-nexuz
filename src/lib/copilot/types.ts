/**
 * Industrial Copilot types — Phase 38.
 *
 * DETERMINISTIC: No LLM. All responses produced by template/intent formatting
 * over the deterministic insight, analytics, and graph engines.
 *
 * READ-ONLY INVARIANT: The Copilot observes, analyzes, explains, and recommends.
 * It MUST NOT control equipment, send commands, modify PLC values, or execute
 * autonomous actions. No write path to industrial hardware exists.
 */

export type CopilotIntent =
  | "dependency_question"
  | "health_question"
  | "alarm_question"
  | "kpi_question"
  | "anomaly_question"
  | "general_status_question";

export type CopilotConfidence = "LOW" | "MEDIUM" | "HIGH";

export type CopilotInsightType =
  | "stale_telemetry"
  | "repeated_fault"
  | "declining_health"
  | "abnormal_kpi"
  | "frequent_alarms"
  | "missing_telemetry"
  | "disconnected_asset";

export type CopilotInsightSeverity = "INFO" | "WARNING" | "CRITICAL";

export type CopilotMessageRole = "USER" | "ASSISTANT" | "SYSTEM";

/**
 * Structured evidence record.
 * Every recommendation and observation MUST carry evidence referencing REAL record IDs.
 * The UI uses these IDs to link back to source records.
 */
export interface CopilotEvidence {
  type:          "insight" | "kpi" | "telemetry" | "asset" | "health" | "anomaly";
  recordId?:     string;   // DB record id (CopilotInsight.id, KPIRecord.id, etc.)
  assetId?:      string;
  tag?:          string;
  timeframe?:    string;   // e.g. "last 24 hours"
  value?:        number;
  description:   string;
}

export interface CopilotInsightRecord {
  id:           string;
  organizationId: string;
  siteId:       string | null;
  assetId:      string | null;
  insightType:  CopilotInsightType;
  severity:     CopilotInsightSeverity;
  title:        string;
  description:  string;
  metadata:     Record<string, unknown>;
  createdAt:    string;
}

export interface CopilotRecommendation {
  id:          string;  // deterministic slug (e.g. "inspection_${assetId}")
  title:       string;
  description: string;
  priority:    "HIGH" | "MEDIUM" | "LOW";
  evidence:    CopilotEvidence[];
}

export interface CopilotObservation {
  title:       string;
  description: string;
  evidence:    CopilotEvidence[];
}

export interface CopilotResponse {
  intent:           CopilotIntent;
  confidence:       CopilotConfidence;
  summary:          string;
  observations:     CopilotObservation[];
  insights:         CopilotInsightRecord[];
  recommendations:  CopilotRecommendation[];
  supportingAssets: string[];  // asset IDs relevant to the response
  supportingKPIs:   { assetId: string; kpiName: string; value: number }[];
  insufficientData: boolean;   // true = not enough data to answer reliably
  blockedReason?:   string;    // set if safety guard triggered
}

export interface ConversationRecord {
  id:             string;
  organizationId: string;
  userId:         string | null;
  title:          string;
  createdAt:      string;
  updatedAt:      string;
}

export interface MessageRecord {
  id:             string;
  conversationId: string;
  role:           CopilotMessageRole;
  content:        string;
  metadata:       Record<string, unknown>;
  createdAt:      string;
}
