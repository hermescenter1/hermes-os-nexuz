/**
 * KnowledgeCategory CRUD — Phase 40.
 */

import { getPrisma }     from "@/lib/db/prisma";
import type { CategoryRecord } from "./types";

type CatModel = {
  create:   (a: unknown) => Promise<Record<string, unknown>>;
  findMany: (a: unknown) => Promise<Record<string, unknown>[]>;
  findFirst:(a: unknown) => Promise<Record<string, unknown> | null>;
  update:   (a: unknown) => Promise<Record<string, unknown>>;
};

function rowToCategory(r: Record<string, unknown>): CategoryRecord {
  return {
    id:             r.id             as string,
    organizationId: r.organizationId as string,
    name:           r.name           as string,
    description:    (r.description   ?? null) as string | null,
    parentId:       (r.parentId      ?? null) as string | null,
    createdAt:      new Date(r.createdAt as string).toISOString(),
    updatedAt:      new Date(r.updatedAt as string).toISOString(),
  };
}

async function model(): Promise<CatModel | null> {
  const db = await getPrisma();
  return db ? ((db as Record<string, unknown>).knowledgeCategory as CatModel) : null;
}

export async function listCategories(organizationId: string): Promise<CategoryRecord[]> {
  const m = await model();
  if (!m) return [];
  try {
    const rows = await m.findMany({
      where:   { organizationId },
      orderBy: { name: "asc" },
    });
    return rows.map(rowToCategory);
  } catch { return []; }
}

export async function getCategory(
  organizationId: string,
  id: string,
): Promise<CategoryRecord | null> {
  const m = await model();
  if (!m) return null;
  try {
    const row = await m.findFirst({ where: { id, organizationId } });
    return row ? rowToCategory(row) : null;
  } catch { return null; }
}

export async function createCategory(
  organizationId: string,
  name:           string,
  description?:   string,
  parentId?:      string,
): Promise<CategoryRecord | null> {
  const m = await model();
  if (!m) return null;
  try {
    const row = await m.create({
      data: { organizationId, name, description: description ?? null, parentId: parentId ?? null },
    });
    return rowToCategory(row);
  } catch { return null; }
}
