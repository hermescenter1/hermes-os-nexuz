/**
 * Strict request contracts for the ERP operational modules (HRIS-0.5B).
 *
 * Same rules as schemas.ts: no schema accepts an organizationId, every object
 * is .strict(), and the organization is the server-side active context only.
 * Cross-entity references (projectId, teamId, assigneeId, managerId) are
 * validated against the caller's organization inside the write transaction.
 */

import { z } from "zod";

export const PROJECT_STATUSES = ["PLANNED", "ACTIVE", "ON_HOLD", "COMPLETED", "CANCELLED"] as const;
/** A project is created only in an initial state; later states are reached by transition. */
export const PROJECT_INITIAL_STATUSES = ["PLANNED", "ACTIVE"] as const;
export const TASK_STATUSES = ["TODO", "IN_PROGRESS", "BLOCKED", "REVIEW", "DONE", "CANCELLED"] as const;
export const TASK_PRIORITIES = ["LOW", "MEDIUM", "HIGH", "CRITICAL"] as const;
export const WORK_ORDER_STATUSES = ["OPEN", "ASSIGNED", "IN_PROGRESS", "WAITING_APPROVAL", "COMPLETED", "CANCELLED"] as const;
export const APPROVAL_STATUSES = ["PENDING", "APPROVED", "REJECTED", "CANCELLED"] as const;
/** A decision moves a PENDING request to APPROVED or REJECTED only. */
export const APPROVAL_DECISIONS = ["APPROVED", "REJECTED"] as const;

/**
 * Every top-level ERP list is cursor-paged: a request returns at most LIST_MAX rows
 * with `hasMore` and `nextCursor`, so a larger organization is never truncated silently.
 */
export const LIST_MAX = 100;
export const LIST_DEFAULT = 50;

const text = (max: number) => z.string().trim().min(1).max(max);
const optionalText = (max: number) => z.string().trim().max(max).nullable().optional();
const refId = z.string().trim().min(1).max(64);
const optionalRef = refId.nullable().optional();
const isoDate = z
  .string()
  .trim()
  .min(1)
  .max(40)
  .refine(v => !Number.isNaN(Date.parse(v)), { message: "invalid date" });
const optionalDate = isoDate.nullable().optional();
const money = z.number().positive().max(10_000_000_000);
const optionalMoney = money.nullable().optional();
const version = z.number().int().min(1);
const limit = z.coerce.number().int().min(1).max(LIST_MAX).default(LIST_DEFAULT);
const cursor = z.string().trim().min(1).max(64).optional();

// ── List queries (bounded, cursor-paged) ─────────────────────────────────────

export const ProjectListQuerySchema = z
  .object({ limit, cursor, status: z.enum(PROJECT_STATUSES).optional() })
  .strict();

export const TaskListQuerySchema = z
  .object({ limit, cursor, projectId: refId.optional(), status: z.enum(TASK_STATUSES).optional() })
  .strict();

export const InventoryListQuerySchema = z
  .object({ limit, cursor, category: text(100).optional() })
  .strict();

export const WorkOrderListQuerySchema = z
  .object({ limit, cursor, status: z.enum(WORK_ORDER_STATUSES).optional(), projectId: refId.optional() })
  .strict();

export const ApprovalListQuerySchema = z
  .object({ limit, cursor, status: z.enum(APPROVAL_STATUSES).optional() })
  .strict();

/** Team member picker: active organization members who are not yet in the team, searchable by name or email. */
export const MemberCandidateQuerySchema = z
  .object({ q: z.string().trim().max(100).optional(), limit, cursor })
  .strict();
export type MemberCandidateQuery = z.infer<typeof MemberCandidateQuerySchema>;

// ── Projects ─────────────────────────────────────────────────────────────────

export const ProjectCreateSchema = z
  .object({
    name: text(200),
    description: optionalText(1000),
    status: z.enum(PROJECT_INITIAL_STATUSES).optional(),
    startDate: optionalDate,
    endDate: optionalDate,
    budget: optionalMoney,
    managerId: optionalRef,
  })
  .strict()
  .superRefine((value, ctx) => {
    // An end date before the start date is refused: the project would have no valid duration.
    if (value.startDate && value.endDate && Date.parse(value.endDate) < Date.parse(value.startDate)) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["endDate"], message: "endDate must not be before startDate" });
    }
  });

export const ProjectUpdateSchema = z
  .object({
    version,
    name: text(200).optional(),
    description: optionalText(1000),
    status: z.enum(PROJECT_STATUSES).optional(),
    endDate: optionalDate,
    budget: optionalMoney,
  })
  .strict();

// ── Tasks ────────────────────────────────────────────────────────────────────

export const TaskCreateSchema = z
  .object({
    title: text(300),
    description: optionalText(2000),
    priority: z.enum(TASK_PRIORITIES).optional(),
    projectId: optionalRef,
    teamId: optionalRef,
    assigneeId: optionalRef,
    dueDate: optionalDate,
    estimatedHours: z.number().positive().max(100000).nullable().optional(),
  })
  .strict();

export const TaskUpdateSchema = z
  .object({
    version,
    title: text(300).optional(),
    status: z.enum(TASK_STATUSES).optional(),
    priority: z.enum(TASK_PRIORITIES).optional(),
    assigneeId: optionalRef,
    dueDate: optionalDate,
    /** Optional note recorded in the audit row of a status transition. */
    reason: optionalText(500),
  })
  .strict();

// ── Inventory ────────────────────────────────────────────────────────────────

export const InventoryCreateSchema = z
  .object({
    sku: text(100),
    name: text(300),
    category: optionalText(100),
    description: optionalText(1000),
    quantity: z.number().int().min(0).max(1_000_000_000).optional(),
    reorderLevel: z.number().int().min(0).max(1_000_000_000).optional(),
    unitCost: optionalMoney,
    location: optionalText(200),
  })
  .strict();

export const InventoryUpdateSchema = z
  .object({
    version,
    quantity: z.number().int().min(0).max(1_000_000_000).optional(),
    reserved: z.number().int().min(0).max(1_000_000_000).optional(),
    reorderLevel: z.number().int().min(0).max(1_000_000_000).optional(),
    location: optionalText(200),
  })
  .strict();

// ── Work orders ──────────────────────────────────────────────────────────────

export const WorkOrderCreateSchema = z
  .object({
    title: text(300),
    description: optionalText(2000),
    priority: z.enum(TASK_PRIORITIES).optional(),
    projectId: optionalRef,
    teamId: optionalRef,
    dueDate: optionalDate,
    requiresApproval: z.boolean().optional(),
  })
  .strict();

export const WorkOrderUpdateSchema = z
  .object({
    version,
    status: z.enum(WORK_ORDER_STATUSES).optional(),
    priority: z.enum(TASK_PRIORITIES).optional(),
    assigneeId: optionalRef,
    completionNote: optionalText(2000),
    /** Optional note recorded in the audit row of a status transition. */
    reason: optionalText(500),
  })
  .strict();

// ── Approvals ────────────────────────────────────────────────────────────────

/** The reason is required: a decision without a stated reason is refused. */
export const ApprovalDecisionSchema = z
  .object({
    version,
    status: z.enum(APPROVAL_DECISIONS),
    reason: text(1000),
  })
  .strict();

export type ProjectListQuery = z.infer<typeof ProjectListQuerySchema>;
export type TaskListQuery = z.infer<typeof TaskListQuerySchema>;
export type InventoryListQuery = z.infer<typeof InventoryListQuerySchema>;
export type WorkOrderListQuery = z.infer<typeof WorkOrderListQuerySchema>;
export type ApprovalListQuery = z.infer<typeof ApprovalListQuerySchema>;
export type ProjectCreateInput = z.infer<typeof ProjectCreateSchema>;
export type ProjectUpdateInput = z.infer<typeof ProjectUpdateSchema>;
export type TaskCreateInput = z.infer<typeof TaskCreateSchema>;
export type TaskUpdateInput = z.infer<typeof TaskUpdateSchema>;
export type InventoryCreateInput = z.infer<typeof InventoryCreateSchema>;
export type InventoryUpdateInput = z.infer<typeof InventoryUpdateSchema>;
export type WorkOrderCreateInput = z.infer<typeof WorkOrderCreateSchema>;
export type WorkOrderUpdateInput = z.infer<typeof WorkOrderUpdateSchema>;
export type ApprovalDecisionInput = z.infer<typeof ApprovalDecisionSchema>;
