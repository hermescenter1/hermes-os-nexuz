/**
 * ATS-M1 — the organization ATS settings contract (shared by route, service
 * and the settings page).
 *
 * One PATCH changes ONE section. Each section names the capability it needs
 * and whether a written reason is mandatory — the owner's rule:
 *
 *   workflow        ATS_MANAGE   reason optional   SLA + interview-stage defaults
 *   humanApproval   ATS_ADMIN    reason REQUIRED   default gate owner role
 *   ai              ATS_ADMIN    reason REQUIRED   provider, external processing, min confidence
 *   notifications   ATS_MANAGE   reason optional   recorded preferences
 *   publicCareers   ATS_ADMIN    reason REQUIRED   listing, intake, default locale
 *   retention       ATS_ADMIN    reason REQUIRED   (own endpoint) RECRUITMENT_CANDIDATE policy
 *   security        —            read-only         configured / missing, never a value
 *
 * What no section can change, because they are platform invariants and not
 * organization preferences: that a human approves every gate decision, that
 * every AI claim cites evidence, the pipeline order, and any secret.
 */

import { z } from "zod";
import type { AtsCapability } from "@/lib/ats/rbac";
import { APPROVAL_OWNER_ROLES, interviewKitSchema, reasonSchema, SLA_DAYS_MAX, SLA_DAYS_MIN } from "@/lib/ats/positions/contract";

export const SETTINGS_SECTIONS = ["workflow", "humanApproval", "ai", "notifications", "publicCareers"] as const;
export type SettingsSection = (typeof SETTINGS_SECTIONS)[number];

export const SECTION_POLICY: Readonly<Record<SettingsSection | "retention", { capability: AtsCapability; reasonRequired: boolean }>> =
  Object.freeze({
    workflow: { capability: "ATS_MANAGE", reasonRequired: false },
    humanApproval: { capability: "ATS_ADMIN", reasonRequired: true },
    ai: { capability: "ATS_ADMIN", reasonRequired: true },
    notifications: { capability: "ATS_MANAGE", reasonRequired: false },
    publicCareers: { capability: "ATS_ADMIN", reasonRequired: true },
    retention: { capability: "ATS_ADMIN", reasonRequired: true },
  });

const base = { expectedVersion: z.number().int().min(0), reason: reasonSchema.optional() };

export const settingsPatchSchema = z.discriminatedUnion("section", [
  z
    .object({
      section: z.literal("workflow"),
      changes: z
        .object({
          defaultDecisionSlaDays: z.number().int().min(SLA_DAYS_MIN).max(SLA_DAYS_MAX).nullable().optional(),
          defaultInterviewStages: interviewKitSchema.optional(),
        })
        .strict(),
      ...base,
    })
    .strict(),
  z
    .object({
      section: z.literal("humanApproval"),
      changes: z.object({ defaultApprovalOwnerRole: z.enum(APPROVAL_OWNER_ROLES).nullable() }).strict(),
      ...base,
    })
    .strict(),
  z
    .object({
      section: z.literal("ai"),
      changes: z
        .object({
          aiProviderMode: z.enum(["deterministic", "router"]).optional(),
          externalAiProcessingEnabled: z.boolean().optional(),
          minimumConfidence: z.number().int().min(0).max(100).nullable().optional(),
        })
        .strict(),
      ...base,
    })
    .strict(),
  z
    .object({
      section: z.literal("notifications"),
      changes: z
        .object({
          reviewAlertsEnabled: z.boolean().optional(),
          interviewRemindersEnabled: z.boolean().optional(),
          slaBreachAlertsEnabled: z.boolean().optional(),
        })
        .strict(),
      ...base,
    })
    .strict(),
  z
    .object({
      section: z.literal("publicCareers"),
      changes: z
        .object({
          publicListingEnabled: z.boolean().optional(),
          applicationIntakeEnabled: z.boolean().optional(),
          defaultPublicLocale: z.enum(["en", "fa", "de"]).optional(),
        })
        .strict(),
      ...base,
    })
    .strict(),
]);
export type SettingsPatch = z.infer<typeof settingsPatchSchema>;

export const RETENTION_TRIGGERS = ["CREATION", "LAST_ACTIVITY"] as const;
export const RETENTION_APPROVAL_STATES = ["PENDING_REVIEW", "APPROVED", "REJECTED"] as const;
export const RETENTION_DAYS_MIN = 30;
export const RETENTION_DAYS_MAX = 3650;

/**
 * The retention section. There is no `action` field on purpose: the ATS writer
 * stores ANONYMISE and nothing else — a DELETE or ARCHIVE policy for candidate
 * data cannot be configured here.
 */
export const retentionUpdateSchema = z
  .object({
    /** An existing RECRUITMENT_CANDIDATE policy of this organization, or null to create one. */
    policyId: z.string().trim().min(1).max(64).nullable(),
    name: z.string().trim().min(3).max(120).optional(),
    retentionDays: z.number().int().min(RETENTION_DAYS_MIN).max(RETENTION_DAYS_MAX),
    retentionTrigger: z.enum(RETENTION_TRIGGERS),
    approvalState: z.enum(RETENTION_APPROVAL_STATES),
    enabled: z.boolean(),
    effectiveFrom: z
      .string()
      .trim()
      .refine((v) => !Number.isNaN(Date.parse(v)), { message: "invalid date" })
      .nullable(),
    expectedVersion: z.number().int().min(0),
    reason: reasonSchema,
  })
  .strict();
export type RetentionUpdate = z.infer<typeof retentionUpdateSchema>;

/** The environment names the security section reports on — names only, never values. */
export const SECURITY_ITEMS = [
  "RECRUITMENT_IDEMPOTENCY_SECRET",
  "ATS_REVIEW_WORKER_TOKEN",
  "ATS_AI_EXTERNAL_PROCESSING_ALLOWED",
] as const;
