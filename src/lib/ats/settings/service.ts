/**
 * ATS-M1 — organization ATS settings: read view, section updates, retention.
 *
 * Tenant: the organization comes from the authenticated actor; every predicate
 * carries it. Concurrency: every write is conditional on the `version` the
 * settings page loaded. Audit: every write records the section, the reason and
 * the previous and new values of what changed, in the same transaction.
 *
 * Nothing here reads, stores, returns or audits a secret. The security section
 * is computed from the deployment environment at read time as
 * CONFIGURED / MISSING (or ENABLED / DISABLED for a flag) — the value itself
 * never leaves the process, and no endpoint accepts one.
 */

import { getPrisma } from "@/lib/db/prisma";
import { atsCan } from "@/lib/ats/rbac";
import { can as orgCan } from "@/lib/org/rbac";
import type { OrganizationRole } from "@/lib/tenant/contract";
import { buildRecruitmentAuditCreate } from "@/lib/ats/recruitment-audit";
import { RECRUITMENT_DATA_CLASS } from "@/lib/ats/application";
import { APPLICATION_ACCEPTANCE_AUTHORIZED } from "@/lib/ats/acceptance-flag";
import {
  ATS_EXTRACTOR_VERSION,
  ATS_POLICY_VERSION,
  ATS_PROMPT_VERSION,
  ATS_RUBRIC_VERSION,
  ENV,
  getAiReviewProviderMode,
  getIdempotencySecret,
  isExternalAiProcessingAllowed,
} from "@/lib/ats/policy";
import { ManagementRefusal, runMutation, zodIssues, type MutationContext, type MutationResult, type MutationTxBase } from "@/lib/ats/positions/mutation";
import { readSettingsOrDefaults, settingsFromRow, SETTINGS_SELECT, type AtsSettingsValues, type SettingsRow } from "./defaults";
import { retentionUpdateSchema, SECTION_POLICY, settingsPatchSchema, type SettingsSection } from "./contract";

type Fn<R = unknown> = (a: unknown) => Promise<R>;

export interface RetentionPolicyRow {
  id: string;
  name: string;
  dataClass: string;
  retentionDays: number | null;
  retentionTrigger: string;
  action: string;
  approvalState: string;
  enabled: boolean;
  dryRunOnly: boolean;
  legalHoldAware: boolean;
  effectiveFrom: Date | null;
  updatedAt: Date;
}

interface SettingsTx extends MutationTxBase {
  atsOrganizationSettings: {
    findUnique: Fn<SettingsRow | null>;
    create: Fn;
    updateMany: Fn<{ count: number }>;
  };
  retentionPolicy: { findFirst: Fn<RetentionPolicyRow | null>; create: Fn<{ id: string }>; updateMany: Fn<{ count: number }> };
  auditLog: { create: Fn };
}

interface SettingsClient extends SettingsTx {
  retentionPolicy: SettingsTx["retentionPolicy"] & { findMany: Fn<RetentionPolicyRow[]> };
  $transaction: <R>(fn: (tx: SettingsTx) => Promise<R>) => Promise<R>;
}

async function client(): Promise<SettingsClient | null> {
  return (await getPrisma()) as unknown as SettingsClient | null;
}

const RETENTION_SELECT = {
  id: true,
  name: true,
  dataClass: true,
  retentionDays: true,
  retentionTrigger: true,
  action: true,
  approvalState: true,
  enabled: true,
  dryRunOnly: true,
  legalHoldAware: true,
  effectiveFrom: true,
  updatedAt: true,
} as const;

// ── Security status (names and states only) ──────────────────────────────────

export type SecurityState = "CONFIGURED" | "MISSING" | "ENABLED" | "DISABLED";

export interface SecurityStatus {
  items: { name: string; state: SecurityState }[];
  applicationAcceptanceAuthorized: boolean;
  deploymentProviderMode: "deterministic" | "router";
}

export function securityStatus(): SecurityStatus {
  const token = process.env[ENV.REVIEW_WORKER_TOKEN];
  return {
    items: [
      { name: ENV.IDEMPOTENCY_SECRET, state: getIdempotencySecret() ? "CONFIGURED" : "MISSING" },
      { name: ENV.REVIEW_WORKER_TOKEN, state: typeof token === "string" && token.length > 0 ? "CONFIGURED" : "MISSING" },
      { name: ENV.AI_EXTERNAL_PROCESSING_ALLOWED, state: isExternalAiProcessingAllowed() ? "ENABLED" : "DISABLED" },
    ],
    applicationAcceptanceAuthorized: APPLICATION_ACCEPTANCE_AUTHORIZED,
    deploymentProviderMode: getAiReviewProviderMode(),
  };
}

/**
 * Whether candidate text may reach an external model for THIS organization:
 * the deployment must allow it (provider "router" + the processing flag) AND
 * the organization must have switched it on. Any one "no" keeps it off.
 */
export function effectiveExternalAi(settings: Pick<AtsSettingsValues, "aiProviderMode" | "externalAiProcessingEnabled">): boolean {
  return (
    getAiReviewProviderMode() === "router" &&
    isExternalAiProcessingAllowed() &&
    settings.aiProviderMode === "router" &&
    settings.externalAiProcessingEnabled === true
  );
}

// ── Read view ────────────────────────────────────────────────────────────────

/** The fixed pipeline the stage gate enforces — displayed, never configurable. */
export const ENFORCED_PIPELINE = Object.freeze([
  "APPLIED",
  "AI_REVIEW_PENDING",
  "PENDING_HUMAN_APPROVAL",
  "SCREENING",
  "TECHNICAL_REVIEW",
  "INTERVIEW",
  "OFFER",
  "HIRED",
] as const);

export interface SettingsView {
  settings: AtsSettingsValues;
  locked: {
    humanApprovalRequired: true;
    evidenceRequired: true;
    retentionAction: "ANONYMISE";
    pipeline: readonly string[];
  };
  ai: {
    effectiveExternalProcessing: boolean;
    versions: { extractor: string; rubric: string; prompt: string; policy: string };
  };
  retention: {
    selectedPolicyId: string | null;
    policies: (Omit<RetentionPolicyRow, "effectiveFrom" | "updatedAt"> & { effectiveFrom: string | null; updatedAt: string })[];
  };
  /** ATS_ADMIN only; null for everyone else. */
  security: SecurityStatus | null;
  viewer: { canManage: boolean; canAdmin: boolean; canApproveRetention: boolean };
}

export async function getSettingsView(organizationId: string, role: string): Promise<SettingsView | null> {
  const prisma = await client();
  if (!prisma) return null;
  try {
    const [settings, policies] = await Promise.all([
      readSettingsOrDefaults(prisma, organizationId),
      prisma.retentionPolicy.findMany({
        where: { organizationId, dataClass: RECRUITMENT_DATA_CLASS },
        orderBy: { updatedAt: "desc" },
        take: 50,
        select: RETENTION_SELECT,
      }),
    ]);
    const canAdmin = atsCan(role, "ATS_ADMIN");
    return {
      settings,
      locked: { humanApprovalRequired: true, evidenceRequired: true, retentionAction: "ANONYMISE", pipeline: ENFORCED_PIPELINE },
      ai: {
        effectiveExternalProcessing: effectiveExternalAi(settings),
        versions: { extractor: ATS_EXTRACTOR_VERSION, rubric: ATS_RUBRIC_VERSION, prompt: ATS_PROMPT_VERSION, policy: ATS_POLICY_VERSION },
      },
      retention: {
        selectedPolicyId: settings.retentionPolicyId,
        policies: policies.map((p) => ({
          ...p,
          effectiveFrom: p.effectiveFrom ? p.effectiveFrom.toISOString() : null,
          updatedAt: p.updatedAt.toISOString(),
        })),
      },
      security: canAdmin ? securityStatus() : null,
      viewer: { canManage: atsCan(role, "ATS_MANAGE"), canAdmin, canApproveRetention: canAdmin && canApproveRetention(role) },
    };
  } catch {
    return null;
  }
}

// ── Writes ───────────────────────────────────────────────────────────────────

/** Defence in depth: a key that even LOOKS like a credential is never audited in clear. */
const SENSITIVE_KEY = /secret|token|password|credential|apikey|api_key|private/i;

export function redactForAudit(values: Record<string, unknown>): Record<string, unknown> {
  return Object.fromEntries(Object.entries(values).map(([k, v]) => [k, SENSITIVE_KEY.test(k) ? "REDACTED" : v]));
}

async function writeSettings(
  tx: SettingsTx,
  ctx: MutationContext,
  expectedVersion: number,
  data: Record<string, unknown>,
): Promise<{ before: AtsSettingsValues; version: number }> {
  const row = await tx.atsOrganizationSettings.findUnique({ where: { organizationId: ctx.organizationId }, select: SETTINGS_SELECT });
  const before = settingsFromRow(row);
  if (before.version !== expectedVersion) throw new ManagementRefusal("STALE");
  if (!row) {
    await tx.atsOrganizationSettings.create({
      data: { organizationId: ctx.organizationId, ...data, version: 1, updatedById: ctx.actor.userId },
    });
  } else {
    const res = await tx.atsOrganizationSettings.updateMany({
      where: { organizationId: ctx.organizationId, version: expectedVersion },
      data: { ...data, version: { increment: 1 }, updatedById: ctx.actor.userId },
    });
    if (res.count !== 1) throw new ManagementRefusal("STALE");
  }
  return { before, version: expectedVersion + 1 };
}

export interface SettingsUpdated {
  section: SettingsSection;
  version: number;
  changed: string[];
}

export async function updateSettings(raw: unknown, ctx: MutationContext): Promise<MutationResult<SettingsUpdated>> {
  const parsed = settingsPatchSchema.safeParse(raw);
  if (!parsed.success) return { ok: false, code: "INVALID_INPUT", detail: { issues: zodIssues(parsed.error) } };
  const patch = parsed.data;
  const policy = SECTION_POLICY[patch.section];
  if (!atsCan(ctx.actor.role, policy.capability)) return { ok: false, code: "FORBIDDEN" };
  if (policy.reasonRequired && !patch.reason) return { ok: false, code: "REASON_REQUIRED" };
  const changes = Object.fromEntries(Object.entries(patch.changes).filter(([, v]) => v !== undefined));
  if (Object.keys(changes).length === 0) {
    return { ok: false, code: "INVALID_INPUT", detail: { issues: [{ path: "changes", message: "nothing to change" }] } };
  }

  return runMutation<SettingsUpdated, SettingsTx>(await client(), ctx, `settings.${patch.section}`, null, patch, async (tx) => {
    const { before, version } = await writeSettings(tx, ctx, patch.expectedVersion, changes);
    const previous = Object.fromEntries(Object.keys(changes).map((k) => [k, (before as unknown as Record<string, unknown>)[k] ?? null]));
    await tx.auditLog.create(
      buildRecruitmentAuditCreate({
        action: "recruitment.settings.updated",
        entityType: "AtsOrganizationSettings",
        entityId: ctx.organizationId,
        userId: ctx.actor.userId,
        organizationId: ctx.organizationId,
        correlationId: ctx.correlationId,
        metadata: {
          reason: patch.reason ?? `ATS settings section ${patch.section} updated`,
          before: { section: patch.section, version: patch.expectedVersion, ...redactForAudit(previous) },
          after: { section: patch.section, version, ...redactForAudit(changes) },
          stage: "M1",
        },
      }),
    );
    return { section: patch.section, version, changed: Object.keys(changes) };
  });
}

export interface RetentionUpdated {
  policyId: string;
  created: boolean;
  version: number;
  /** Whether the policy is now the organization's SELECTED one (approved, enabled, effective). */
  selected: boolean;
}

/**
 * Approving or enabling a retention policy is a COMPLIANCE act: it needs the
 * organization permission `manage_retention` (OWNER / ADMIN — the same gate as
 * the Phase 97 registry). ATS_ADMIN alone (which HR_MANAGER holds) may create
 * and edit PROPOSALS — PENDING_REVIEW and disabled — but can never approve its
 * own proposal, edit an already-approved policy, or convert a policy the
 * compliance registry configured with another action.
 */
export function canApproveRetention(role: string): boolean {
  return orgCan(role as OrganizationRole, "manage_retention");
}

export async function updateRetention(raw: unknown, ctx: MutationContext): Promise<MutationResult<RetentionUpdated>> {
  const parsed = retentionUpdateSchema.safeParse(raw);
  if (!parsed.success) {
    const reasonMissing = parsed.error.issues.some((i) => i.path[0] === "reason");
    return reasonMissing
      ? { ok: false, code: "REASON_REQUIRED" }
      : { ok: false, code: "INVALID_INPUT", detail: { issues: zodIssues(parsed.error) } };
  }
  const input = parsed.data;
  if (!atsCan(ctx.actor.role, SECTION_POLICY.retention.capability)) return { ok: false, code: "FORBIDDEN" };
  const approver = canApproveRetention(ctx.actor.role);
  if (!approver && (input.approvalState !== "PENDING_REVIEW" || input.enabled)) return { ok: false, code: "FORBIDDEN" };

  return runMutation<RetentionUpdated, SettingsTx>(await client(), ctx, "settings.retention", input.policyId, input, async (tx, now) => {
    const policyData = {
      retentionDays: input.retentionDays,
      retentionTrigger: input.retentionTrigger,
      // The ONLY action this surface writes for candidate data.
      action: "ANONYMISE",
      approvalState: input.approvalState,
      enabled: input.enabled,
      effectiveFrom: input.effectiveFrom ? new Date(input.effectiveFrom) : null,
      // Every ATS write returns the policy to dry-run: CLEARING it for
      // execution stays an act of the compliance registry.
      dryRunOnly: true,
      updatedBy: ctx.actor.userId,
    };

    // Select it only when it can actually govern candidate data NOW. A
    // proposal (pending, disabled or not yet effective) is saved but leaves the
    // current selection in force, so the sweep and intake never silently lose
    // the policy they run under.
    const effective = policyData.effectiveFrom === null || policyData.effectiveFrom.getTime() <= now.getTime();
    const selected = input.approvalState === "APPROVED" && input.enabled && effective;
    const current = await readSettingsOrDefaults(tx, ctx.organizationId);
    if (input.policyId && input.policyId === current.retentionPolicyId && !selected) {
      // The SELECTED policy cannot be edited out of force here: that would
      // close intake and stop the sweep for the whole organization as a side
      // effect of a form save. Select another policy first, or withdraw it in
      // the compliance registry, where that decision belongs.
      throw new ManagementRefusal("INVALID_TRANSITION");
    }

    let policyId: string;
    let before: Record<string, unknown> | null = null;
    if (input.policyId) {
      const existing = await tx.retentionPolicy.findFirst({
        where: { id: input.policyId, organizationId: ctx.organizationId, dataClass: RECRUITMENT_DATA_CLASS },
        select: RETENTION_SELECT,
      });
      if (!existing) throw new ManagementRefusal("NOT_FOUND");
      // Without manage_retention: no edit of an approved policy, and no
      // conversion of a policy compliance configured with another action.
      if (!approver && (existing.approvalState === "APPROVED" || existing.action !== "ANONYMISE")) {
        throw new ManagementRefusal("FORBIDDEN");
      }
      before = {
        retentionDays: existing.retentionDays,
        retentionTrigger: existing.retentionTrigger,
        action: existing.action,
        approvalState: existing.approvalState,
        enabled: existing.enabled,
        dryRunOnly: existing.dryRunOnly,
        effectiveFrom: existing.effectiveFrom ? existing.effectiveFrom.toISOString() : null,
      };
      // Conditional on what was READ: an approval (or any edit) that landed in
      // between makes this STALE instead of being silently reverted.
      const res = await tx.retentionPolicy.updateMany({
        where: {
          id: existing.id,
          organizationId: ctx.organizationId,
          dataClass: RECRUITMENT_DATA_CLASS,
          approvalState: existing.approvalState,
          updatedAt: existing.updatedAt,
        },
        data: policyData,
      });
      if (res.count !== 1) throw new ManagementRefusal("STALE");
      policyId = existing.id;
    } else {
      const created = await tx.retentionPolicy.create({
        data: {
          organizationId: ctx.organizationId,
          name: input.name ?? "ATS candidate data retention",
          dataClass: RECRUITMENT_DATA_CLASS,
          targetResource: "AtsApplication",
          legalHoldAware: true,
          createdBy: ctx.actor.userId,
          ...policyData,
        },
        select: { id: true },
      });
      policyId = created.id;
    }

    const { version } = await writeSettings(tx, ctx, input.expectedVersion, selected ? { retentionPolicyId: policyId } : {});
    await tx.auditLog.create(
      buildRecruitmentAuditCreate({
        action: "recruitment.retention_policy.updated",
        entityType: "RetentionPolicy",
        entityId: policyId,
        userId: ctx.actor.userId,
        organizationId: ctx.organizationId,
        correlationId: ctx.correlationId,
        metadata: {
          reason: input.reason,
          before,
          after: {
            retentionDays: input.retentionDays,
            retentionTrigger: input.retentionTrigger,
            action: "ANONYMISE",
            approvalState: input.approvalState,
            enabled: input.enabled,
            effectiveFrom: policyData.effectiveFrom ? policyData.effectiveFrom.toISOString() : null,
            dryRunOnly: true,
            selectedForAts: selected,
            settingsVersion: version,
          },
          stage: "M1",
        },
      }),
    );
    return { policyId, created: !input.policyId, version, selected };
  });
}
