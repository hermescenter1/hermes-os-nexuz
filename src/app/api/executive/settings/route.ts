/**
 * GET /api/executive/settings — the reporting settings in force for the active
 * organization, and where they came from.
 * PUT /api/executive/settings — change them (OWNER or ADMIN, `update_org`).
 *
 * The organization is always the server-resolved active one. A PUT body names
 * the values and the `expectedVersion` it read; a stale version answers 409 and
 * the caller re-reads, so two managers saving at once cannot silently
 * overwrite each other. Every accepted change is audited with its before and
 * after values in the same transaction.
 */

import type { NextRequest } from "next/server";
import { securityError, readBoundedJson, SMALL_JSON_BODY_BYTES } from "@/lib/security/request-guards";
import { resolveExecutiveScope, statusForFailure } from "@/lib/executive/scope";
import { authorizeExecutiveSettingsWrite } from "@/lib/executive/settings-auth";
import { loadExecutiveSettings, parseSettingsPayload, saveExecutiveSettings } from "@/lib/executive/settings";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const resolved = await resolveExecutiveScope();
  if (!resolved.ok) return securityError({ error: resolved.code }, statusForFailure(resolved.code));
  const settings = await loadExecutiveSettings(resolved.scope.organizationId);
  return securityError(
    {
      source: settings.source,
      storedRowRejected: settings.storedRowRejected,
      version: settings.version,
      updatedAt: settings.updatedAtIso,
      values: settings.values,
    },
    200,
  );
}

export async function PUT(req: NextRequest) {
  const auth = await authorizeExecutiveSettingsWrite(req);
  if (!auth.ok) return securityError({ error: auth.error }, auth.status);

  const body = await readBoundedJson(req, SMALL_JSON_BODY_BYTES);
  if (body.status === "too_large") return securityError({ error: "PAYLOAD_TOO_LARGE" }, 413);
  if (body.status === "invalid") return securityError({ error: "INVALID_REQUEST" }, 400);

  const parsed = parseSettingsPayload(body.value);
  if (!parsed.ok) {
    if ("malformed" in parsed) return securityError({ error: "INVALID_REQUEST" }, 400);
    return securityError({ error: "VALIDATION_FAILED", problems: parsed.problems }, 422);
  }

  const outcome = await saveExecutiveSettings({
    organizationId: auth.scope.organizationId,
    actorUserId: auth.scope.userId,
    correlationId: auth.scope.correlationId,
    values: parsed.values,
    expectedVersion: parsed.expectedVersion,
  });

  switch (outcome.kind) {
    case "SAVED":
      return securityError({ version: outcome.version }, 200);
    case "CONFLICT":
      return securityError({ error: "VERSION_CONFLICT", currentVersion: outcome.currentVersion }, 409);
    case "INVALID":
      return securityError({ error: "VALIDATION_FAILED", problems: outcome.problems }, 422);
    case "UNAVAILABLE":
      return securityError({ error: "SERVICE_UNAVAILABLE" }, 503);
  }
}
