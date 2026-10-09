import { z } from "zod";

export const REGISTRY_ASSET_TYPES = [
  "PRODUCTION_LINE", "MACHINE", "PLC", "HMI", "SCADA_NODE",
  "ELECTRICAL_PANEL", "MCC_PANEL", "VFD", "MOTOR", "PUMP", "VALVE",
  "SENSOR", "INSTRUMENT", "ROBOT", "CONVEYOR", "COMPRESSOR",
  "UTILITY_SYSTEM", "SAFETY_SYSTEM", "NETWORK_DEVICE", "INDUSTRIAL_PC",
] as const;

export const ASSET_STATUSES = [
  "PLANNED", "COMMISSIONED", "IN_SERVICE", "DEGRADED",
  "UNDER_MAINTENANCE", "STANDBY", "RETIRED", "REPLACED", "DECOMMISSIONED",
] as const;

export const ASSET_CRITICALITIES = [
  "NON_CRITICAL", "LOW", "MEDIUM", "HIGH", "CRITICAL",
] as const;

export const ASSET_RISK_STATES = [
  "HEALTHY", "MONITOR", "AT_RISK", "CRITICAL", "UNKNOWN",
] as const;

export const ASSET_LIFECYCLE_STATES = [
  "DESIGN", "PROCUREMENT", "INSTALLATION", "COMMISSIONING",
  "IN_SERVICE", "DEGRADED", "DECOMMISSIONING", "RETIRED",
] as const;

const optionalText = (max: number) =>
  z.string().trim().max(max).nullable().optional().transform(value => value === "" ? null : value);

const relationId = z.string().trim().max(191).nullable().optional().transform(value => value === "" ? null : value);

const dateOnly = z.string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "Expected an ISO date (YYYY-MM-DD)")
  .refine(value => !Number.isNaN(Date.parse(`${value}T00:00:00.000Z`)), "Invalid date")
  .nullable()
  .optional()
  .transform(value => value === "" ? null : value);

const technicalSpecs = z.record(z.string().min(1).max(100), z.unknown())
  .refine(value => JSON.stringify(value).length <= 20_000, "Technical specifications are too large")
  .optional();

export const AssetCreateSchema = z.object({
  assetNumber:      z.string().trim().min(1).max(100),
  name:             z.string().trim().min(1).max(300),
  nameEn:           optionalText(300),
  nameFa:           optionalText(300),
  description:      optionalText(2_000),
  assetType:        z.enum(REGISTRY_ASSET_TYPES),
  status:           z.enum(ASSET_STATUSES).optional(),
  criticality:      z.enum(ASSET_CRITICALITIES).optional(),
  riskState:        z.enum(ASSET_RISK_STATES).optional(),
  lifecycleState:   z.enum(ASSET_LIFECYCLE_STATES).optional(),
  healthScore:      z.number().min(0).max(100).optional(),
  siteId:           relationId,
  parentAssetId:    relationId,
  locationId:       relationId,
  manufacturer:     optionalText(200),
  model:            optionalText(200),
  serialNumber:     optionalText(200),
  firmwareVersion:  optionalText(100),
  installationDate: dateOnly,
  commissionDate:   dateOnly,
  warrantyExpiry:   dateOnly,
  expectedLifeYears:z.number().int().min(1).max(200).nullable().optional(),
  technicalSpecs,
  tags:             z.array(z.string().trim().min(1).max(80)).max(40).optional(),
}).strict();

export const AssetUpdateSchema = AssetCreateSchema.partial()
  .strict()
  .refine(value => Object.keys(value).length > 0, "At least one field is required");

export type AssetCreateInput = z.infer<typeof AssetCreateSchema>;
export type AssetUpdateInput = z.infer<typeof AssetUpdateSchema>;
