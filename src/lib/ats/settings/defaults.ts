/**
 * ATS-M1 — organization ATS settings: the fail-closed defaults and the one
 * reader every consumer uses (position service, intake, review worker, the
 * public listing predicate's documentation).
 *
 * An organization that never saved its settings has NO row, and reads exactly
 * these values:
 *   * external AI processing OFF, provider deterministic;
 *   * application intake CLOSED (and the global APPLICATION_ACCEPTANCE_AUTHORIZED
 *     gate still applies on top — this can only narrow it, never open it);
 *   * public listing NOT switched off (a per-position publish is still required
 *     for anything to be listed — this is a kill switch, not an opener);
 *   * no retention policy selected (intake then refuses: no invented duration);
 *   * notifications off, no SLA/owner defaults.
 *
 * Server-only in practice (it reads the database), but it imports no Prisma
 * runtime: the caller hands in its own client or transaction.
 */

import type { PositionLocale } from "@/lib/ats/positions/contract";

export interface AtsSettingsValues {
  defaultDecisionSlaDays: number | null;
  defaultInterviewStages: unknown[];
  defaultApprovalOwnerRole: string | null;
  aiProviderMode: "deterministic" | "router";
  externalAiProcessingEnabled: boolean;
  minimumConfidence: number | null;
  reviewAlertsEnabled: boolean;
  interviewRemindersEnabled: boolean;
  slaBreachAlertsEnabled: boolean;
  publicListingEnabled: boolean;
  applicationIntakeEnabled: boolean;
  defaultPublicLocale: PositionLocale;
  retentionPolicyId: string | null;
  version: number;
  /** false when no row exists yet — every value above is then a default. */
  exists: boolean;
  updatedAt: string | null;
}

export const ATS_SETTINGS_DEFAULTS: Readonly<AtsSettingsValues> = Object.freeze({
  defaultDecisionSlaDays: null,
  defaultInterviewStages: [],
  defaultApprovalOwnerRole: null,
  aiProviderMode: "deterministic",
  externalAiProcessingEnabled: false,
  minimumConfidence: null,
  reviewAlertsEnabled: false,
  interviewRemindersEnabled: false,
  slaBreachAlertsEnabled: false,
  publicListingEnabled: true,
  applicationIntakeEnabled: false,
  defaultPublicLocale: "fa",
  retentionPolicyId: null,
  version: 0,
  exists: false,
  updatedAt: null,
});

export interface SettingsRow {
  defaultDecisionSlaDays: number | null;
  defaultInterviewStages: unknown;
  defaultApprovalOwnerRole: string | null;
  aiProviderMode: string;
  externalAiProcessingEnabled: boolean;
  minimumConfidence: number | null;
  reviewAlertsEnabled: boolean;
  interviewRemindersEnabled: boolean;
  slaBreachAlertsEnabled: boolean;
  publicListingEnabled: boolean;
  applicationIntakeEnabled: boolean;
  defaultPublicLocale: string;
  retentionPolicyId: string | null;
  version: number;
  updatedAt: Date;
}

export interface SettingsReader {
  atsOrganizationSettings: { findUnique: (a: unknown) => Promise<SettingsRow | null> };
}

const LOCALES: readonly PositionLocale[] = ["en", "fa", "de"];

/** Map a stored row (or its absence) to typed values; unknown text fails closed. */
export function settingsFromRow(row: SettingsRow | null): AtsSettingsValues {
  if (!row) return { ...ATS_SETTINGS_DEFAULTS, defaultInterviewStages: [] };
  return {
    defaultDecisionSlaDays: row.defaultDecisionSlaDays,
    defaultInterviewStages: Array.isArray(row.defaultInterviewStages) ? row.defaultInterviewStages : [],
    defaultApprovalOwnerRole: row.defaultApprovalOwnerRole,
    // Anything but the literal "router" is deterministic — a typo cannot enable a model.
    aiProviderMode: row.aiProviderMode === "router" ? "router" : "deterministic",
    externalAiProcessingEnabled: row.externalAiProcessingEnabled === true,
    minimumConfidence: row.minimumConfidence,
    reviewAlertsEnabled: row.reviewAlertsEnabled === true,
    interviewRemindersEnabled: row.interviewRemindersEnabled === true,
    slaBreachAlertsEnabled: row.slaBreachAlertsEnabled === true,
    publicListingEnabled: row.publicListingEnabled !== false,
    applicationIntakeEnabled: row.applicationIntakeEnabled === true,
    defaultPublicLocale: (LOCALES as readonly string[]).includes(row.defaultPublicLocale)
      ? (row.defaultPublicLocale as PositionLocale)
      : "fa",
    retentionPolicyId: row.retentionPolicyId,
    version: row.version,
    exists: true,
    updatedAt: row.updatedAt.toISOString(),
  };
}

export const SETTINGS_SELECT = {
  defaultDecisionSlaDays: true,
  defaultInterviewStages: true,
  defaultApprovalOwnerRole: true,
  aiProviderMode: true,
  externalAiProcessingEnabled: true,
  minimumConfidence: true,
  reviewAlertsEnabled: true,
  interviewRemindersEnabled: true,
  slaBreachAlertsEnabled: true,
  publicListingEnabled: true,
  applicationIntakeEnabled: true,
  defaultPublicLocale: true,
  retentionPolicyId: true,
  version: true,
  updatedAt: true,
} as const;

/** Read the organization's settings; a missing row is the defaults. Throws on a store error. */
export async function readSettingsOrDefaults(db: SettingsReader, organizationId: string): Promise<AtsSettingsValues> {
  const row = await db.atsOrganizationSettings.findUnique({ where: { organizationId }, select: SETTINGS_SELECT });
  return settingsFromRow(row);
}
