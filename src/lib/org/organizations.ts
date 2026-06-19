/**
 * Organization CRUD service (Phase 32).
 */

import { getPrisma }                        from "@/lib/db/prisma";
import { recordAuditEvent, ORG_AUDIT }      from "@/lib/audit/audit-service";
import type { OrgRecord, OrgRole }          from "./types";

const SLUG_RE = /^[a-z0-9]([a-z0-9-]{0,46}[a-z0-9])?$/;

function slugify(s: string): string {
  return s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 48);
}

type OrgModel = {
  findUnique: (a: unknown) => Promise<Record<string, unknown> | null>;
  findFirst:  (a: unknown) => Promise<Record<string, unknown> | null>;
  create:     (a: unknown) => Promise<Record<string, unknown>>;
  update:     (a: unknown) => Promise<Record<string, unknown>>;
};

type MemberModel = {
  create: (a: unknown) => Promise<Record<string, unknown>>;
};

async function orgModel(): Promise<OrgModel | null> {
  const db = await getPrisma();
  return db ? ((db as Record<string, unknown>).organization as OrgModel) : null;
}

async function memberModel(): Promise<MemberModel | null> {
  const db = await getPrisma();
  return db ? ((db as Record<string, unknown>).organizationMember as MemberModel) : null;
}

function rowToOrg(r: Record<string, unknown>): OrgRecord {
  return {
    id:          String(r.id),
    name:        String(r.name),
    slug:        String(r.slug),
    description: r.description ? String(r.description) : null,
    website:     r.website     ? String(r.website)     : null,
    logoUrl:     r.logoUrl     ? String(r.logoUrl)     : null,
    settings:    (r.settings as Record<string, unknown>) ?? {},
    createdAt:   new Date(r.createdAt as string).toISOString(),
    updatedAt:   new Date(r.updatedAt as string).toISOString(),
  };
}

export async function getOrganizationById(id: string): Promise<OrgRecord | null> {
  const m = await orgModel();
  if (!m) return null;
  try {
    const row = await m.findUnique({ where: { id } });
    return row ? rowToOrg(row) : null;
  } catch { return null; }
}

export async function getOrganizationBySlug(slug: string): Promise<OrgRecord | null> {
  const m = await orgModel();
  if (!m) return null;
  try {
    const row = await m.findFirst({ where: { slug } });
    return row ? rowToOrg(row) : null;
  } catch { return null; }
}

export interface CreateOrgInput {
  name:        string;
  slug?:       string;
  description?: string;
  website?:    string;
  actorUserId: string;
}

/** Create an organization and add the creator as OWNER. */
export async function createOrganization(
  input: CreateOrgInput,
): Promise<{ ok: true; org: OrgRecord } | { ok: false; error: string }> {
  const om = await orgModel();
  const mm = await memberModel();
  if (!om || !mm) return { ok: false, error: "Database unavailable" };

  const name = input.name.trim();
  if (name.length < 2) return { ok: false, error: "Organization name must be at least 2 characters" };

  const rawSlug = input.slug ? input.slug.trim() : slugify(name);
  const slug    = `${rawSlug}-${Date.now().toString(36)}`;

  if (!SLUG_RE.test(rawSlug)) {
    return { ok: false, error: "Slug must be 2–50 lowercase alphanumeric characters or hyphens" };
  }

  const existing = await getOrganizationBySlug(slug);
  if (existing) return { ok: false, error: "Slug is already taken" };

  try {
    const row = await om.create({
      data: {
        name,
        slug,
        description: input.description ?? null,
        website:     input.website ?? null,
        settings:    {},
        createdAt:   new Date(),
        updatedAt:   new Date(),
      },
    });
    const org = rowToOrg(row);

    await mm.create({
      data: {
        organizationId: org.id,
        userId:         input.actorUserId,
        role:           "OWNER" as OrgRole,
        status:         "ACTIVE",
        joinedAt:       new Date(),
        createdAt:      new Date(),
        updatedAt:      new Date(),
      },
    });

    await recordAuditEvent({
      userId:     input.actorUserId,
      action:     ORG_AUDIT.ORG_CREATED,
      entityType: "Organization",
      entityId:   org.id,
      metadata:   { name, slug },
    });

    return { ok: true, org };
  } catch (err) {
    return { ok: false, error: String(err) };
  }
}

export interface UpdateOrgInput {
  name?:        string;
  description?: string;
  website?:     string;
  logoUrl?:     string;
  settings?:    Record<string, unknown>;
  actorUserId?: string;
}

/** Update organization profile fields. */
export async function updateOrganization(
  orgId: string,
  input: UpdateOrgInput,
): Promise<{ ok: true; org: OrgRecord } | { ok: false; error: string }> {
  const m = await orgModel();
  if (!m) return { ok: false, error: "Database unavailable" };

  const data: Record<string, unknown> = { updatedAt: new Date() };
  if (input.name        !== undefined) data.name        = input.name.trim();
  if (input.description !== undefined) data.description = input.description;
  if (input.website     !== undefined) data.website     = input.website;
  if (input.logoUrl     !== undefined) data.logoUrl     = input.logoUrl;
  if (input.settings    !== undefined) data.settings    = input.settings;

  if (data.name && String(data.name).length < 2) {
    return { ok: false, error: "Organization name must be at least 2 characters" };
  }

  try {
    const row = await m.update({ where: { id: orgId }, data });
    const org = rowToOrg(row);

    await recordAuditEvent({
      userId:     input.actorUserId,
      action:     ORG_AUDIT.ORG_UPDATED,
      entityType: "Organization",
      entityId:   org.id,
      metadata:   { fields: Object.keys(data).filter((k) => k !== "updatedAt") },
    });

    return { ok: true, org };
  } catch (err) {
    return { ok: false, error: String(err) };
  }
}
