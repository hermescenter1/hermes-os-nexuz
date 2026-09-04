/**
 * Shared request shapes for the workflow write path.
 *
 * PAGE 08 persistence closure: the create and update routes previously carried
 * no `conditions` or `actions` at all, so an authoring client could send a
 * complete workflow and receive 201/200 while the children were dropped. These
 * schemas are the single definition of what a workflow write may contain, so
 * both routes accept exactly the same shape and neither can drift back into
 * silently discarding supported data.
 */
import { z } from "zod";
import { isSensitiveKey } from "./redaction";

/** Trigger values the engine whitelists (evaluateWorkflowTrigger). */
export const TRIGGER_TYPES = [
  "MANUAL", "SCHEDULED",
  "CRM_LEAD_CREATED", "CRM_OPPORTUNITY_WON", "CRM_CUSTOMER_AT_RISK",
  "ATS_CANDIDATE_CREATED", "ATS_APPLICATION_SUBMITTED",
  "ACADEMY_COURSE_COMPLETED", "VENDOR_ONBOARDING_REQUESTED",
  "CUSTOMER_SUPPORT_TICKET_CREATED", "INDUSTRIAL_ASSET_RISK_HIGH",
  "KNOWLEDGE_ARTICLE_CREATED",
] as const;

/** Condition values evaluateCondition can actually evaluate. */
export const CONDITION_TYPES = [
  "ALWAYS", "FIELD_EQUALS", "FIELD_NOT_EQUALS",
  "FIELD_GREATER_THAN", "FIELD_LESS_THAN",
  "STATUS_IS", "ROLE_IS", "HEALTH_SCORE_BELOW", "PRIORITY_IS",
] as const;

/** Action values the engine has a preview/executor for. */
export const ACTION_TYPES = [
  "CREATE_NOTIFICATION", "CREATE_TASK", "CREATE_SUPPORT_TICKET",
  "CREATE_CRM_ACTIVITY", "UPDATE_RECORD_STATUS", "ASSIGN_OWNER",
  "CREATE_AUDIT_LOG", "SEND_WEBHOOK", "CREATE_KNOWLEDGE_NOTE",
  "CREATE_MAINTENANCE_ALERT",
] as const;

export const MAX_CONDITIONS = 50;
export const MAX_ACTIONS     = 50;
export const MAX_CONFIG_KEYS = 24;

/**
 * `WorkflowAction.config` is a Json column, but the engine only ever reads
 * flat scalars out of it. Nested structures are refused so the column cannot
 * become an unbounded document store, and credential-shaped keys are refused
 * outright: no supported action reads one (SEND_WEBHOOK reads no config and
 * makes no outbound call), so accepting one would only put a plaintext secret
 * in the database.
 */
const ConfigValue = z.union([
  z.string().max(2000),
  z.number().finite(),
  z.boolean(),
  z.null(),
]);

export const ActionConfigSchema = z
  .record(z.string().min(1).max(64), ConfigValue)
  .superRefine((config, ctx) => {
    const keys = Object.keys(config);
    if (keys.length > MAX_CONFIG_KEYS) {
      ctx.addIssue({ code: "custom", message: `at most ${MAX_CONFIG_KEYS} configuration keys` });
    }
    for (const key of keys) {
      if (isSensitiveKey(key)) {
        // The key name is echoed, never the value.
        ctx.addIssue({
          code: "custom",
          path: [key],
          message: "credential-bearing configuration is not accepted; store secrets in the credential plane",
        });
      }
    }
  });

export const ConditionInputSchema = z.object({
  type:       z.enum(CONDITION_TYPES),
  field:      z.string().max(120).nullish(),
  operator:   z.string().max(40).nullish(),
  value:      z.string().max(500).nullish(),
  logicGroup: z.number().int().min(0).max(99).optional(),
}).strict();

/**
 * Execution order is the array position, not a client-supplied number, so it
 * is always dense, deterministic and impossible to send in a contradictory
 * form that the server would have to silently reconcile.
 */
export const ActionInputSchema = z.object({
  type:   z.enum(ACTION_TYPES),
  config: ActionConfigSchema.optional(),
}).strict();

export const ConditionsArraySchema = z.array(ConditionInputSchema).max(MAX_CONDITIONS);
export const ActionsArraySchema    = z.array(ActionInputSchema).max(MAX_ACTIONS);

export type ConditionInput = z.infer<typeof ConditionInputSchema>;
export type ActionInput    = z.infer<typeof ActionInputSchema>;
