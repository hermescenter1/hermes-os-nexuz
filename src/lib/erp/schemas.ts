/**
 * Strict request contracts for ERP tenant writes (HRIS-0.5).
 *
 * No schema here accepts an organizationId: the organization is the server-side
 * active context. A client that sends one is rejected by .strict().
 *
 * `.strict()` rejects unknown keys instead of silently dropping them: a client
 * cannot smuggle `organizationId`, `version`, `createdAt` or any other field
 * into a mutation that the contract does not list. Cross-entity references
 * (projectId, workOrderId, leadId) are deliberately absent until the ERP
 * operational modules are tenant scoped.
 */

import { z } from "zod";

export const RESOURCE_TYPES = ["HUMAN", "EQUIPMENT", "SOFTWARE", "VEHICLE", "FACILITY", "TOOL"] as const;
export const MEMBER_ROLES = ["member", "lead"] as const;

const text = (max: number) => z.string().trim().min(1).max(max);
const optionalText = (max: number) => z.string().trim().max(max).nullable().optional();

export const ListQuerySchema = z
  .object({
    limit: z.coerce.number().int().min(1).max(100).default(50),
    cursor: z.string().min(1).max(64).optional(),
    type: z.enum(RESOURCE_TYPES).optional(),
  })
  .strict();

export const TeamCreateSchema = z
  .object({
    name: text(120),
    description: optionalText(500),
    capacity: z.number().int().min(0).max(100000).optional(),
  })
  .strict();

export const TeamUpdateSchema = z
  .object({
    version: z.number().int().min(1),
    name: text(120).optional(),
    description: optionalText(500),
    capacity: z.number().int().min(0).max(100000).optional(),
  })
  .strict();

export const TeamMemberAddSchema = z
  .object({
    userId: z.string().min(1).max(64),
    role: z.enum(MEMBER_ROLES).default("member"),
    availability: z.number().int().min(0).max(100).default(100),
  })
  .strict();

export const ResourceCreateSchema = z
  .object({
    name: text(200),
    type: z.enum(RESOURCE_TYPES),
    description: optionalText(500),
    costRate: z.number().positive().max(10000000).nullable().optional(),
  })
  .strict();

export const ResourceUpdateSchema = z
  .object({
    version: z.number().int().min(1),
    name: text(200).optional(),
    type: z.enum(RESOURCE_TYPES).optional(),
    description: optionalText(500),
    costRate: z.number().positive().max(10000000).nullable().optional(),
    isAvailable: z.boolean().optional(),
  })
  .strict();

export type TeamCreateInput = z.infer<typeof TeamCreateSchema>;
export type TeamUpdateInput = z.infer<typeof TeamUpdateSchema>;
export type TeamMemberAddInput = z.infer<typeof TeamMemberAddSchema>;
export type ResourceCreateInput = z.infer<typeof ResourceCreateSchema>;
export type ResourceUpdateInput = z.infer<typeof ResourceUpdateSchema>;
export type ListQuery = z.infer<typeof ListQuerySchema>;
