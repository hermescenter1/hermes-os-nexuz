/**
 * ATS-M1 — a stored AtsOrganizationSettings row for test doubles.
 *
 * Not a test file (no `.test.`), so vitest never runs it; tests import it to
 * give their fake Prisma client the settings model the intake, the retention
 * sweep and the review worker now read. The row defaults to the fail-closed
 * values EXCEPT `applicationIntakeEnabled`, which a caller must set explicitly.
 */
import type { SettingsRow } from "@/lib/ats/settings/defaults";

export function settingsRow(over: Partial<SettingsRow> = {}): SettingsRow {
  return {
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
    version: 1,
    updatedAt: new Date("2026-09-24T00:00:00.000Z"),
    ...over,
  };
}
