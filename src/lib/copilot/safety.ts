/**
 * Copilot Safety Layer — Phase 38.
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * ARCHITECTURAL BOUNDARY (PRIMARY DEFENSE):
 *
 * This entire module (src/lib/copilot/) imports ONLY read-only functions:
 *   - src/lib/digital-twin/*   (read-only graph/health/tags)
 *   - src/lib/industrial/assets.ts, sites.ts, gateways.ts  (list/get only)
 *   - src/lib/time-series/*    (analytics read)
 *   - src/lib/audit/*          (audit write — permitted)
 *   - src/lib/api/meter.ts     (metering write — permitted)
 *
 * The copilot module physically CANNOT call:
 *   - ingestTelemetry() (in industrial/telemetry.ts — not imported here)
 *   - verifyGatewayBinding() (in industrial/gateway-auth.ts — not imported here)
 *   - Any Prisma update/create path for industrial hardware models
 *
 * There is NO code path from this module to a control action.
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * TEXTUAL GUARD (SECONDARY DEFENSE):
 * Keyword matching on user input. If a control/write keyword is detected,
 * the request is rejected before any processing occurs.
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * INJECTION BOUNDARY:
 * All context data (asset names, metadata, telemetry values, gateway strings)
 * originating from industrial equipment is treated as UNTRUSTED DATA VALUES,
 * never as instructions. In a future LLM mode, this data must be placed in
 * the "data" section of the context, explicitly separated from instructions,
 * and never interpolated into the system prompt or instruction sequence.
 * Gateway-originated strings are escaped before use in templates.
 * ═══════════════════════════════════════════════════════════════════════════
 */

// Control-action keywords that must never be acted upon.
// All in lowercase — compare after .toLowerCase().
export const CONTROL_KEYWORDS = new Set([
  "write", "set", "send", "push", "execute", "run", "start", "stop", "reset",
  "command", "control", "actuate", "trigger", "override", "force", "switch",
  "enable", "disable", "turn on", "turn off", "power on", "power off",
  "restart", "reboot", "shutdown", "deploy", "update firmware", "flash",
  "modify", "change value", "set point", "setpoint",
  // Persian equivalents
  "بنویس", "ارسال", "اجرا", "کنترل", "راه‌اندازی", "خاموش", "روشن", "تنظیم",
]);

export const BLOCKED_RESPONSE_EN = "Control actions are not available in Hermes Copilot. This system is read-only and observes industrial equipment without sending commands.";
export const BLOCKED_RESPONSE_FA = "اقدامات کنترلی در هرمس کوپایلت در دسترس نیستند. این سیستم فقط خواندنی است و تجهیزات صنعتی را بدون ارسال دستور مشاهده می‌کند.";

export interface SafetyCheckResult {
  safe:    boolean;
  reason?: string;   // set when safe=false
}

/**
 * Check whether a user prompt is safe to process.
 * Returns { safe: false, reason: <localized message> } if a control keyword is matched.
 * All context data passed to this check is untrusted and treated as data only.
 */
export function checkSafetyGuard(prompt: string, locale = "en"): SafetyCheckResult {
  const lower = prompt.toLowerCase();
  for (const kw of CONTROL_KEYWORDS) {
    if (lower.includes(kw)) {
      return {
        safe:   false,
        reason: locale === "fa" ? BLOCKED_RESPONSE_FA : BLOCKED_RESPONSE_EN,
      };
    }
  }
  return { safe: true };
}

/**
 * Escape a gateway-originated string before interpolating into a template.
 * Removes characters that could be misinterpreted as instructions in future
 * LLM integration. Plain text only — no angle brackets, backticks, or braces
 * that could be parsed as markup or template syntax.
 */
export function escapeUntrustedData(s: string): string {
  return String(s)
    .replace(/[<>{}`]/g, "")
    .replace(/[\r\n]+/g, " ")
    .trim()
    .slice(0, 256);  // cap length to prevent oversized context injection
}
