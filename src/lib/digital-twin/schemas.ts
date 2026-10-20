/**
 * Digital Twin request schemas — Slice 1.
 *
 * Zod strips unknown keys by default, which is what we want here: a request
 * body is never spread into a Prisma `data` object, only the parsed, allow-listed
 * result is. (Rejecting unknown keys with 400 would be stricter, but it would
 * change the PATCH contract that SECURITY-8 pinned: an injected `organizationId`
 * is DROPPED, the request still succeeds.)
 *
 * Bounds are deliberately explicit constants so a reviewer can see every limit
 * in one place.
 */

import { z } from "zod";
import { ALL_NODE_TYPES, ALL_RELATION_TYPES } from "./types";
import type { DigitalTwinNodeType, DigitalTwinRelationType } from "./types";
import { TAG_PATTERN } from "@/lib/industrial/types";

export const TWIN_LIMITS = {
  /** Request body ceilings, in bytes. */
  BODY_BYTES: 64 * 1024,
  LAYOUT_BODY_BYTES: 320 * 1024,
  /** Stored JSON ceilings, in bytes of the serialised value. */
  METADATA_BYTES: 16 * 1024,
  LAYOUT_DATA_BYTES: 256 * 1024,
  JSON_MAX_DEPTH: 8,
  /**
   * Result-set ceilings. Each is applied in the query as `take: limit + 1`, so a
   * result of EXACTLY the limit is not reported as truncated; one row more is, and
   * only the first `limit` rows (in a fixed total order) are returned. The
   * responses that report it with `truncated: true`: GET nodes, GET relations,
   * GET graph, GET tags, GET layout, and GET nodes/[id] (as `relations.truncated`,
   * which covers either direction). The internal array-returning helper
   * listTagsForAsset is capped the same way but, returning an array, cannot
   * carry the flag. Every list reader requires the caller's site scope.
   */
  LIST_NODES: 1000,
  LIST_RELATIONS: 5000,
  LIST_TAGS: 1000,
  LIST_LAYOUTS: 200,
  GRAPH_NODES: 2000,
  GRAPH_RELATIONS: 10000,
  /** Hierarchy walks (cycle checks). Exceeding either REFUSES the write. */
  HIERARCHY_MAX_DEPTH: 50,
  HIERARCHY_MAX_VISITED: 10000,
} as const;

/** Keys that must never be stored as JSON object members. */
const FORBIDDEN_KEYS = new Set(["__proto__", "constructor", "prototype"]);

/**
 * Why a JSON value is unacceptable, or null if it is fine. Pure, so it is unit
 * testable without zod.
 */
export function jsonProblem(
  value: unknown,
  opts: { maxBytes: number; maxDepth: number },
): string | null {
  let serialised: string;
  try {
    serialised = JSON.stringify(value);
  } catch {
    return "must be JSON-serialisable";
  }
  if (serialised === undefined) return "must be JSON-serialisable";
  if (new TextEncoder().encode(serialised).length > opts.maxBytes) {
    return `must not exceed ${opts.maxBytes} bytes when serialised`;
  }
  const stack: Array<{ v: unknown; d: number }> = [{ v: value, d: 1 }];
  while (stack.length > 0) {
    const { v, d } = stack.pop() as { v: unknown; d: number };
    if (typeof v !== "object" || v === null) continue;
    if (d > opts.maxDepth) return `must not be nested deeper than ${opts.maxDepth} levels`;
    if (Array.isArray(v)) {
      for (const item of v) stack.push({ v: item, d: d + 1 });
      continue;
    }
    for (const [k, child] of Object.entries(v as Record<string, unknown>)) {
      if (FORBIDDEN_KEYS.has(k)) return `must not contain the key "${k}"`;
      stack.push({ v: child, d: d + 1 });
    }
  }
  return null;
}

const boundedObject = (maxBytes: number) =>
  z.record(z.string(), z.unknown()).superRefine((value, ctx) => {
    const problem = jsonProblem(value, { maxBytes, maxDepth: TWIN_LIMITS.JSON_MAX_DEPTH });
    if (problem) ctx.addIssue({ code: "custom", message: problem });
  });

export const metadataSchema = boundedObject(TWIN_LIMITS.METADATA_BYTES);
export const layoutDataSchema = boundedObject(TWIN_LIMITS.LAYOUT_DATA_BYTES);

/** An identifier the caller supplies. Charset-restricted: no whitespace, no punctuation that could reach a log line or a query fragment. */
export const idSchema = z
  .string()
  .min(1)
  .max(64)
  .regex(/^[A-Za-z0-9_-]+$/, "must contain only letters, digits, '_' and '-'");

// eslint-disable-next-line no-control-regex -- the point is to refuse control characters
const NO_CONTROL = /^[^\u0000-\u001f\u007f]*$/;

const nameSchema = z.string().trim().min(1).max(200).regex(NO_CONTROL, "must not contain control characters");

const nodeTypeSchema = z.enum(ALL_NODE_TYPES as [DigitalTwinNodeType, ...DigitalTwinNodeType[]]);
const relationTypeSchema = z.enum(ALL_RELATION_TYPES as [DigitalTwinRelationType, ...DigitalTwinRelationType[]]);

export const TAG_DATA_TYPES = ["float", "int", "bool", "string", "enum"] as const;

export const createNodeBody = z.object({
  siteId:       idSchema,
  displayName:  nameSchema,
  nodeType:     nodeTypeSchema,
  assetId:      idSchema.nullish(),
  parentNodeId: idSchema.nullish(),
  metadata:     metadataSchema.optional(),
});

export const patchNodeBody = z.object({
  displayName:  nameSchema.optional(),
  nodeType:     nodeTypeSchema.optional(),
  assetId:      idSchema.nullish(),
  parentNodeId: idSchema.nullish(),
  metadata:     metadataSchema.optional(),
});

export const createRelationBody = z.object({
  sourceNodeId: idSchema,
  targetNodeId: idSchema,
  relationType: relationTypeSchema,
  metadata:     metadataSchema.optional(),
});

export const patchRelationBody = z.object({
  metadata: metadataSchema.optional(),
});

export const createLayoutBody = z.object({
  siteId:     idSchema,
  name:       nameSchema,
  layoutData: layoutDataSchema.optional(),
});

export const createTagBody = z.object({
  assetId:     idSchema,
  tagName:     nameSchema,
  tagPath:     z.string().regex(TAG_PATTERN, "is not a valid tag path"),
  unit:        z.string().trim().min(1).max(32).regex(NO_CONTROL).nullish(),
  dataType:    z.enum(TAG_DATA_TYPES).optional(),
  description: z.string().trim().max(1000).regex(NO_CONTROL).nullish(),
  metadata:    metadataSchema.optional(),
});

export const patchTagBody = z.object({
  tagName:     nameSchema.optional(),
  unit:        z.string().trim().min(1).max(32).regex(NO_CONTROL).nullish(),
  dataType:    z.enum(TAG_DATA_TYPES).optional(),
  description: z.string().trim().max(1000).regex(NO_CONTROL).nullish(),
  metadata:    metadataSchema.optional(),
});

export const siteIdQuery = idSchema;
