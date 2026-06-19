/**
 * Plan service (Phase 31).
 * Read-only access to billing plans. Plans are managed via seed/admin, not user API.
 */

import { getPrisma }    from "@/lib/db/prisma";
import type { PlanRecord, PlanLimits, Currency } from "./types";

type PlanModel = {
  findMany:  (a: unknown) => Promise<Record<string, unknown>[]>;
  findUnique: (a: unknown) => Promise<Record<string, unknown> | null>;
};

async function model(): Promise<PlanModel | null> {
  const db = await getPrisma();
  return db ? ((db as Record<string, unknown>).plan as PlanModel) : null;
}

function rowToPlan(r: Record<string, unknown>): PlanRecord {
  return {
    id:           String(r.id),
    name:         String(r.name),
    slug:         String(r.slug),
    description:  String(r.description),
    monthlyPrice: String(r.monthlyPrice),
    yearlyPrice:  String(r.yearlyPrice),
    currency:     String(r.currency) as Currency,
    features:     (r.features as string[]) ?? [],
    limits:       (r.limits as PlanLimits) ?? {} as PlanLimits,
    isActive:     Boolean(r.isActive),
  };
}

/** List all active plans, ordered by monthly price ascending. */
export async function getActivePlans(): Promise<PlanRecord[]> {
  const m = await model();
  if (!m) return [];
  try {
    const rows = await m.findMany({
      where:   { isActive: true },
      orderBy: { monthlyPrice: "asc" },
    });
    return rows.map(rowToPlan);
  } catch {
    return [];
  }
}

/** Get a plan by slug. Returns null if not found. */
export async function getPlanBySlug(slug: string): Promise<PlanRecord | null> {
  const m = await model();
  if (!m) return null;
  try {
    const row = await m.findUnique({ where: { slug } });
    return row ? rowToPlan(row) : null;
  } catch {
    return null;
  }
}

/** Get a plan by id. */
export async function getPlanById(id: string): Promise<PlanRecord | null> {
  const m = await model();
  if (!m) return null;
  try {
    const row = await m.findUnique({ where: { id } });
    return row ? rowToPlan(row) : null;
  } catch {
    return null;
  }
}
