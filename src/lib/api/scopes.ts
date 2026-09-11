/**
 * API Platform scope definitions and enforcement (Phase 33).
 *
 * The "admin" scope is a superset that implies ALL other scopes.
 * It must be checked first in hasScope() before individual scope checks.
 * Do NOT remove this superset behaviour — it allows internal service tokens
 * to operate without listing every scope explicitly.
 */

export const ALL_SCOPES = [
  "projects.read",
  "projects.write",
  "billing.read",
  "billing.write",
  "organizations.read",
  "organizations.write",
  "telemetry.read",
  "telemetry.write",
  "industrial.read",     // Phase 35 Edge Gateway
  "industrial.write",    // Phase 35 Edge Gateway
  // PHASE 109-C-UI.2-R3 — organisation-wide execution of the intelligence
  // automation engine, on the machine axis. NOTE the documented "admin"
  // superset above still applies to it: an admin key satisfies this scope. That
  // is the recorded contract of this module and is not quietly changed here —
  // the route additionally requires an explicit confirmation and a reason, so
  // an admin key still cannot trigger an org-wide run by accident.
  "industrial.run_org_wide",
  "digital_twin.read",   // Phase 36 Digital Twin read access
  "digital_twin.write",  // Phase 36 Digital Twin write access
  "analytics.read",      // Phase 37 Time Series Analytics
  "copilot.read",        // Phase 38 Industrial Copilot
  "predictive.read",     // Phase 39 Predictive Maintenance (read-only analysis)
  "knowledge.read",      // Phase 40 Industrial Knowledge Engine — read
  "knowledge.write",     // Phase 40 Industrial Knowledge Engine — create/update
  "admin",               // superset — implies all scopes above
] as const;

export type ApiScope = typeof ALL_SCOPES[number];

export const SCOPE_LABELS: Record<string, string> = {
  "projects.read":       "Projects — Read",
  "projects.write":      "Projects — Write",
  "billing.read":        "Billing — Read",
  "billing.write":       "Billing — Write",
  "organizations.read":  "Organizations — Read",
  "organizations.write": "Organizations — Write",
  "telemetry.read":      "Telemetry — Read",
  "telemetry.write":     "Telemetry — Write",
  "industrial.read":     "Industrial Gateway — Read (Phase 35)",
  "industrial.write":    "Industrial Gateway — Write (Phase 35)",
  "industrial.run_org_wide": "Industrial Automation — Organisation-wide execution (Phase 109-C-UI.2-R3)",
  "admin":               "Admin — All Scopes",
};

/**
 * Check whether a key's scope list satisfies a required scope.
 * "admin" in keyScopes implies all scopes — checked first.
 */
export function hasScope(keyScopes: string[], required: string): boolean {
  return keyScopes.includes("admin") || keyScopes.includes(required);
}

/** Enforce a scope, returning a 403 error shape on failure. */
export function requireScope(
  keyScopes: string[],
  required: string,
): { ok: true } | { ok: false; error: string; status: number } {
  if (!hasScope(keyScopes, required)) {
    return {
      ok:     false,
      error:  `Missing required scope: ${required}`,
      status: 403,
    };
  }
  return { ok: true };
}

export function isValidScope(s: string): s is ApiScope {
  return (ALL_SCOPES as readonly string[]).includes(s);
}

export function validateScopes(
  scopes: unknown,
): { ok: true; scopes: string[] } | { ok: false; error: string } {
  if (!Array.isArray(scopes)) return { ok: false, error: "scopes must be an array" };
  for (const s of scopes) {
    if (typeof s !== "string" || !isValidScope(s)) {
      return { ok: false, error: `Invalid scope: ${String(s)}` };
    }
  }
  return { ok: true, scopes: scopes as string[] };
}
