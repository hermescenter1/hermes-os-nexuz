/**
 * Intent classification — Phase 38.
 *
 * Deterministic keyword/route matching only. No LLM, no ML.
 * Returns the most specific matching intent, or "general_status_question" as fallback.
 */

import type { CopilotIntent } from "./types";

type IntentRule = { keywords: string[]; intent: CopilotIntent };

// Rules evaluated in priority order. First match wins.
const INTENT_RULES: IntentRule[] = [
  {
    intent: "dependency_question",
    keywords: [
      "depend", "downstream", "upstream", "connected to", "controls", "feeds",
      "affects", "impact", "part of", "topology", "graph", "linked",
      "وابسته", "پایین‌دست", "بالادست", "متصل", "کنترل می‌کند", "تغذیه",
    ],
  },
  {
    intent: "health_question",
    keywords: [
      "health", "status", "score", "condition", "degraded", "critical", "healthy",
      "well", "how is", "state of", "functioning",
      "سلامت", "وضعیت", "امتیاز", "تخریب", "بحرانی", "سالم",
    ],
  },
  {
    intent: "alarm_question",
    keywords: [
      "alarm", "alert", "fault", "error", "bad quality", "stale", "warning",
      "incident", "failure", "trip", "top alarm", "alarm rate",
      "آلارم", "خطا", "هشدار", "نقص", "خرابی",
    ],
  },
  {
    intent: "kpi_question",
    keywords: [
      "kpi", "availability", "runtime", "downtime", "efficiency", "performance",
      "uptime", "oee", "production",
      "شاخص", "دسترسی", "زمان کارکرد", "توقف", "بازده", "عملکرد",
    ],
  },
  {
    intent: "anomaly_question",
    keywords: [
      "anomaly", "spike", "drop", "unusual", "abnormal", "out of range",
      "sudden", "unexpected", "outlier",
      "ناهنجاری", "جهش", "افت", "غیرعادی", "خارج از محدوده",
    ],
  },
];

export function classifyIntent(prompt: string): CopilotIntent {
  const lower = prompt.toLowerCase();
  for (const rule of INTENT_RULES) {
    if (rule.keywords.some((kw) => lower.includes(kw))) {
      return rule.intent;
    }
  }
  return "general_status_question";
}
