/**
 * AI Gateway (Step 5 hardening).
 *
 * The single choke point for every LLM interaction in Hermes OS:
 *   provider abstraction → model routing → validation → timeout →
 *   error normalization → usage metadata.
 *
 * Phase 2 lifts this module (and its providers) into the FastAPI AI
 * Gateway microservice; callers keep the same request/response shapes.
 * The API key never leaves the server. With no provider configured the
 * gateway fails CLOSED with a typed error — callers must degrade to the
 * structured library path, never fabricate output.
 */

export type LlmTask =
  | "plcAnalysis"
  | "scadaHmiAnalysis"
  | "electricalTroubleshooting"
  | "otCybersecurity"
  | "maintenanceDiagnosis"
  | "generalTriage";

export interface UsageMetadata {
  provider: string;
  model: string;
  latencyMs: number;
  inputTokens?: number;
  outputTokens?: number;
}

export type GatewayErrorCode =
  | "no_provider"      // no API key / provider unavailable
  | "validation"       // request rejected before any network call
  | "timeout"          // provider exceeded the deadline
  | "upstream_error"   // provider returned a non-2xx
  | "bad_response";    // provider 2xx but unusable payload

export interface GatewayError {
  code: GatewayErrorCode;
  message: string;
}

export interface GatewayRequest {
  task: LlmTask;
  locale: "fa" | "en";
  system: string;
  user: string;
  maxTokens?: number;
}

export type GatewayResult =
  | { ok: true; text: string; usage: UsageMetadata }
  | { ok: false; error: GatewayError };

export interface LlmProvider {
  id: string;
  available(): boolean;
  complete(
    model: string,
    req: { system: string; user: string; maxTokens: number; timeoutMs: number }
  ): Promise<GatewayResult>;
}

/* ---------------- model routing ---------------- */

interface Route {
  provider: string;
  model: string;
  maxTokens: number;
  timeoutMs: number;
}

/** Task → provider/model. All tasks route to one model today; the table is
 *  the interface that lets Phase 2 split tasks across models/providers. */
const ROUTES: Record<LlmTask, Route> = {
  plcAnalysis:               { provider: "anthropic", model: "claude-sonnet-4-20250514", maxTokens: 1000, timeoutMs: 20_000 },
  scadaHmiAnalysis:          { provider: "anthropic", model: "claude-sonnet-4-20250514", maxTokens: 1000, timeoutMs: 20_000 },
  electricalTroubleshooting: { provider: "anthropic", model: "claude-sonnet-4-20250514", maxTokens: 1000, timeoutMs: 20_000 },
  otCybersecurity:           { provider: "anthropic", model: "claude-sonnet-4-20250514", maxTokens: 1000, timeoutMs: 20_000 },
  maintenanceDiagnosis:      { provider: "anthropic", model: "claude-sonnet-4-20250514", maxTokens: 1000, timeoutMs: 20_000 },
  generalTriage:             { provider: "anthropic", model: "claude-sonnet-4-20250514", maxTokens: 800,  timeoutMs: 15_000 },
};

/* ---------------- providers ---------------- */

import { anthropicProvider } from "./provider";

const PROVIDERS: Record<string, LlmProvider> = {
  [anthropicProvider.id]: anthropicProvider,
};

/* ---------------- validation ---------------- */

const LIMITS = { system: 8_000, user: 12_000 };

function validate(req: GatewayRequest): GatewayError | null {
  if (!ROUTES[req.task]) return { code: "validation", message: `unknown task: ${req.task}` };
  if (req.locale !== "fa" && req.locale !== "en")
    return { code: "validation", message: "unsupported locale" };
  if (!req.system || req.system.length > LIMITS.system)
    return { code: "validation", message: "system prompt missing or too long" };
  if (!req.user || req.user.length > LIMITS.user)
    return { code: "validation", message: "user content missing or too long" };
  return null;
}

/* ---------------- gateway entry points ---------------- */

export function gatewayAvailable(): boolean {
  return Object.values(PROVIDERS).some((p) => p.available());
}

/** Task-routed completion — the path Hermes Brain uses. */
export async function completeTask(req: GatewayRequest): Promise<GatewayResult> {
  const invalid = validate(req);
  if (invalid) return { ok: false, error: invalid };

  const route = ROUTES[req.task];
  const provider = PROVIDERS[route.provider];
  if (!provider || !provider.available()) {
    return {
      ok: false,
      error: { code: "no_provider", message: `provider unavailable: ${route.provider}` },
    };
  }
  return provider.complete(route.model, {
    system: req.system,
    user: req.user,
    maxTokens: req.maxTokens ?? route.maxTokens,
    timeoutMs: route.timeoutMs,
  });
}

/** Raw chat passthrough for the generic /api/ai BFF route. */
export async function completeChat(
  messages: { role: string; content: string }[],
  maxTokens = 1200
): Promise<GatewayResult> {
  // Validation first — a malformed request is a 400 regardless of whether
  // any provider is configured.
  const trimmed = messages.slice(-20).filter(
    (m) => (m.role === "user" || m.role === "assistant") && typeof m.content === "string"
  );
  if (trimmed.length === 0) {
    return { ok: false, error: { code: "validation", message: "no valid messages" } };
  }
  const totalLen = trimmed.reduce((n, m) => n + m.content.length, 0);
  if (totalLen > 60_000) {
    return { ok: false, error: { code: "validation", message: "conversation too long" } };
  }
  const provider = anthropicProvider;
  if (!provider.available()) {
    return { ok: false, error: { code: "no_provider", message: "AI gateway not configured (no API key)" } };
  }
  return provider.chat(trimmed, maxTokens, 25_000);
}
