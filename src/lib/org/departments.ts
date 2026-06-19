/**
 * Department service (Phase 32).
 * Allowed types: automation, electrical, maintenance, production, management, it_ot
 */

import { getPrisma }                    from "@/lib/db/prisma";
import { recordAuditEvent, ORG_AUDIT }  from "@/lib/audit/audit-service";
import { DEPT_TYPES }                   from "./types";
import type { DeptRecord }              from "./types";

type DeptModel = {
  findMany:  (a: unknown) => Promise<Record<string, unknown>[]>;
  findFirst: (a: unknown) => Promise<Record<string, unknown> | null>;
  create:    (a: unknown) => Promise<Record<string, unknown>>;
  update:    (a: unknown) => Promise<Record<string, unknown>>;
};

async function model(): Promise<DeptModel | null> {
  const db = await getPrisma();
  return db ? ((db as Record<string, unknown>).department as DeptModel) : null;
}

function rowToDept(r: Record<string, unknown>): DeptRecord {
  return {
    id:             String(r.id),
    organizationId: String(r.organizationId),
    name:           String(r.name),
    description:    r.description ? String(r.description) : null,
    type:           String(r.type),
    managerId:      r.managerId ? String(r.managerId) : null,
    createdAt:      new Date(r.createdAt as string).toISOString(),
    updatedAt:      new Date(r.updatedAt as string).toISOString(),
  };
}

export async function listDepartments(orgId: string): Promise<DeptRecord[]> {
  const m = await model();
  if (!m) return [];
  try {
    const rows = await m.findMany({
      where:   { organizationId: orgId },
      orderBy: { name: "asc" },
    });
    return rows.map(rowToDept);
  } catch { return []; }
}

export interface CreateDeptInput {
  organizationId: string;
  name:           string;
  description?:   string;
  type:           string;
  managerId?:     string;
  actorUserId?:   string;
}

export async function createDepartment(
  input: CreateDeptInput,
): Promise<{ ok: true; department: DeptRecord } | { ok: false; error: string }> {
  const m = await model();
  if (!m) return { ok: false, error: "Database unavailable" };

  if (!DEPT_TYPES.includes(input.type as typeof DEPT_TYPES[number])) {
    return { ok: false, error: `Invalid department type. Allowed: ${DEPT_TYPES.join(", ")}` };
  }

  const name = input.name.trim();
  if (name.length < 2) return { ok: false, error: "Department name must be at least 2 characters" };

  try {
    const row = await m.create({
      data: {
        organizationId: input.organizationId,
        name,
        description:    input.description ?? null,
        type:           input.type,
        managerId:      input.managerId ?? null,
        createdAt:      new Date(),
        updatedAt:      new Date(),
      },
    });
    const department = rowToDept(row);

    await recordAuditEvent({
      userId:     input.actorUserId,
      action:     ORG_AUDIT.DEPARTMENT_CREATED,
      entityType: "Department",
      entityId:   department.id,
      metadata:   { orgId: input.organizationId, name, type: input.type },
    });

    return { ok: true, department };
  } catch (err) {
    return { ok: false, error: String(err) };
  }
}

export interface UpdateDeptInput {
  name?:        string;
  description?: string;
  managerId?:   string | null;
  actorUserId?: string;
}

export async function updateDepartment(
  deptId: string,
  orgId:  string,
  input:  UpdateDeptInput,
): Promise<{ ok: true; department: DeptRecord } | { ok: false; error: string }> {
  const m = await model();
  if (!m) return { ok: false, error: "Database unavailable" };

  const existing = await m.findFirst({ where: { id: deptId, organizationId: orgId } });
  if (!existing) return { ok: false, error: "Department not found" };

  const data: Record<string, unknown> = { updatedAt: new Date() };
  if (input.name        !== undefined) data.name        = input.name.trim();
  if (input.description !== undefined) data.description = input.description;
  if (input.managerId   !== undefined) data.managerId   = input.managerId;

  if (data.name && String(data.name).length < 2) {
    return { ok: false, error: "Department name must be at least 2 characters" };
  }

  try {
    const row = await m.update({ where: { id: deptId }, data });
    const department = rowToDept(row);

    await recordAuditEvent({
      userId:     input.actorUserId,
      action:     ORG_AUDIT.DEPARTMENT_UPDATED,
      entityType: "Department",
      entityId:   deptId,
      metadata:   { orgId, fields: Object.keys(data).filter((k) => k !== "updatedAt") },
    });

    return { ok: true, department };
  } catch (err) {
    return { ok: false, error: String(err) };
  }
}
