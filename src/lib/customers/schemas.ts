/**
 * Request contracts for a tenant's customers (Executive Management Center
 * slice G).
 *
 * Same rules as the ERP contracts: no schema accepts an organizationId, every
 * object is .strict() (an unknown key is refused, not stripped), and the
 * organization is only ever the server-side active context. A follow-up owner
 * or a project id is validated against the caller's organization inside the
 * write transaction, never trusted from here.
 */

import { z } from "zod";

export const PARTY_STATUSES = ["PROSPECT", "ACTIVE", "INACTIVE"] as const;
export const INTERACTION_KINDS = ["CALL", "MEETING", "EMAIL", "VISIT", "NOTE"] as const;

/** Every list is cursor-paged: at most LIST_MAX rows, with hasMore and nextCursor. */
export const LIST_MAX = 100;
export const LIST_DEFAULT = 25;

const text = (max: number) => z.string().trim().min(1).max(max);
/** Optional free text: an empty string means "clear it", stored as null. */
const optionalText = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .transform(v => (v === "" ? null : v))
    .nullable()
    .optional();
const refId = z.string().trim().min(1).max(64);
const instant = z
  .string()
  .trim()
  .min(1)
  .max(40)
  .refine(v => !Number.isNaN(Date.parse(v)), { message: "invalid date" });

const email = z
  .string()
  .trim()
  .max(254)
  .transform(v => (v === "" ? null : v.toLowerCase()))
  .refine(v => v === null || /^[^@\s]+@[^@\s]+$/.test(v), { message: "invalid email" })
  .nullable()
  .optional();

const country = z
  .string()
  .trim()
  .transform(v => (v === "" ? null : v.toUpperCase()))
  .refine(v => v === null || /^[A-Z]{2}$/.test(v), { message: "invalid country" })
  .nullable()
  .optional();

const fields = {
  displayName: text(200),
  legalName: optionalText(200),
  status: z.enum(PARTY_STATUSES).optional(),
  email,
  phone: optionalText(40),
  city: optionalText(100),
  country,
  notes: optionalText(4000),
  followUpOwnerId: refId.nullable().optional(),
  nextActionAt: instant.nullable().optional(),
  nextActionNote: optionalText(500),
};

/** A next-action note without a date has nothing to be due on. */
const noteNeedsDate = (v: { nextActionAt?: string | null; nextActionNote?: string | null }) =>
  !v.nextActionNote || Boolean(v.nextActionAt);

export const CustomerCreateSchema = z
  .object(fields)
  .strict()
  .refine(noteNeedsDate, { message: "nextActionNote requires nextActionAt", path: ["nextActionNote"] });
export type CustomerCreate = z.infer<typeof CustomerCreateSchema>;

/**
 * A partial update. `expectedVersion` is REQUIRED: two people editing the same
 * customer must not silently overwrite each other. `archived` archives or
 * restores; nothing is ever deleted.
 */
export const CustomerUpdateSchema = z
  .object({
    ...fields,
    displayName: text(200).optional(),
    archived: z.boolean().optional(),
    expectedVersion: z.number().int().min(1),
  })
  .strict()
  .refine(v => Object.keys(v).some(k => k !== "expectedVersion"), { message: "nothing to change" });
export type CustomerUpdate = z.infer<typeof CustomerUpdateSchema>;

export const CustomerListQuerySchema = z
  .object({
    q: z.string().trim().max(100).optional(),
    status: z.enum(PARTY_STATUSES).optional(),
    owner: z.union([z.literal("me"), refId]).optional(),
    /** "overdue": a next action whose date has passed. */
    followUp: z.enum(["overdue", "scheduled", "none"]).optional(),
    archived: z.enum(["exclude", "only"]).optional(),
    limit: z.coerce.number().int().min(1).max(LIST_MAX).optional(),
    cursor: refId.optional(),
  })
  .strict();
export type CustomerListQuery = z.infer<typeof CustomerListQuerySchema>;

export const InteractionCreateSchema = z
  .object({
    kind: z.enum(INTERACTION_KINDS),
    occurredAt: instant,
    summary: text(2000),
  })
  .strict();
export type InteractionCreate = z.infer<typeof InteractionCreateSchema>;

export const InteractionListQuerySchema = z
  .object({
    limit: z.coerce.number().int().min(1).max(LIST_MAX).optional(),
    cursor: refId.optional(),
  })
  .strict();
export type InteractionListQuery = z.infer<typeof InteractionListQuerySchema>;

/** Link (projectId) or unlink (null) one of the organization's projects. */
export const ProjectLinkSchema = z
  .object({
    projectId: refId,
    linked: z.boolean(),
  })
  .strict();
export type ProjectLink = z.infer<typeof ProjectLinkSchema>;
