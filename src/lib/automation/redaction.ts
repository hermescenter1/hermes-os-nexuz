/**
 * Security-focused redaction utilities for workflow action configuration display.
 * Prevents exposure of credentials, secrets, and sensitive URL components.
 */

/**
 * Keys that indicate credential/secret values and should be redacted
 */
const SENSITIVE_KEYS = new Set([
  "apikey",
  "api_key",
  "token",
  "accesstoken",
  "access_token",
  "refreshtoken",
  "refresh_token",
  "secret",
  "clientsecret",
  "client_secret",
  "password",
  "authorization",
  "auth",
]);

/**
 * Check if a key name indicates a sensitive value.
 *
 * Exported so the write path can reject credential-bearing configuration at
 * the API boundary, instead of storing it in a plaintext Json column and then
 * relying on display-time redaction to keep it out of sight.
 */
export function isSensitiveKey(key: string): boolean {
  const normalized = key.toLowerCase().replace(/_/g, "");
  return SENSITIVE_KEYS.has(normalized);
}

/**
 * Redact credential-like values from URLs (query strings and fragments)
 */
function sanitizeUrl(value: string): string {
  try {
    // Only process strings that look like URLs
    if (typeof value !== "string" || !value.includes("://")) {
      return value;
    }

    const url = new URL(value);
    // Remove all query parameters
    url.search = "";
    // Remove fragment
    url.hash = "";
    return url.toString();
  } catch {
    // If URL parsing fails, return original value
    return value;
  }
}

/**
 * Recursively redact sensitive configuration values.
 * Returns a new object without modifying the original.
 */
export function redactActionConfig(config: Record<string, unknown>): Record<string, unknown> {
  if (!config || typeof config !== "object") {
    return config;
  }

  const redacted: Record<string, unknown> = {};

  for (const [key, value] of Object.entries(config)) {
    // Check if this key is sensitive
    if (isSensitiveKey(key)) {
      // Mark as redacted instead of showing a value
      redacted[key] = "[REDACTED]";
      continue;
    }

    // Recursively handle nested objects
    if (value !== null && typeof value === "object" && !Array.isArray(value)) {
      redacted[key] = redactActionConfig(value as Record<string, unknown>);
      continue;
    }

    // Handle arrays
    if (Array.isArray(value)) {
      redacted[key] = value.map(item => {
        if (item !== null && typeof item === "object") {
          return redactActionConfig(item as Record<string, unknown>);
        }
        return item;
      });
      continue;
    }

    // Sanitize URL values (remove query strings and fragments)
    if (typeof value === "string" && value.includes("://")) {
      redacted[key] = sanitizeUrl(value);
      continue;
    }

    // Keep other values as-is
    redacted[key] = value;
  }

  return redacted;
}

/**
 * Format redacted config for display.
 * Shows [REDACTED] for sensitive values, sanitized URLs, and safe non-sensitive values.
 */
export function formatRedactedConfig(config: Record<string, unknown>): string {
  const redacted = redactActionConfig(config);
  return JSON.stringify(redacted, null, 2);
}
