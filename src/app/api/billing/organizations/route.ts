/**
 * Organization management API (Phase 31).
 *
 * GET  /api/billing/organizations  — get current user's organization
 * POST /api/billing/organizations  — create a new organization (user becomes OWNER)
 */

import { NextRequest, NextResponse } from "next/server";
import { verifyAccessToken }          from "@/lib/auth/jwt";
import { ACCESS_TOKEN_COOKIE }        from "@/lib/auth/config";
import { getPrisma }                  from "@/lib/db/prisma";
import { recordAuditEvent, BILLING_AUDIT } from "@/lib/audit/audit-service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type OrgModel = {
  findFirst:  (a: unknown) => Promise<Record<string, unknown> | null>;
  create:     (a: unknown) => Promise<Record<string, unknown>>;
};

type MemberModel = {
  findFirst:  (a: unknown) => Promise<Record<string, unknown> | null>;
  create:     (a: unknown) => Promise<Record<string, unknown>>;
};

async function getUserId(req: NextRequest): Promise<string | null> {
  const token = req.cookies.get(ACCESS_TOKEN_COOKIE)?.value;
  if (!token) return null;
  const payload = await verifyAccessToken(token);
  return payload?.sub ?? null;
}

function slugify(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 48);
}

// ── GET ──────────────────────────────────────────────────────────────────────

export async function GET(req: NextRequest) {
  const userId = await getUserId(req);
  if (!userId) return NextResponse.json({ error: "Authentication required" }, { status: 401 });

  const db = await getPrisma();
  if (!db) return NextResponse.json({ error: "Database unavailable" }, { status: 503 });

  try {
    const memberModel = (db as Record<string, unknown>).organizationMember as MemberModel;
    const member = await memberModel.findFirst({
      where:   { userId },
      orderBy: { createdAt: "asc" },
      include: { organization: true },
    });

    if (!member) return NextResponse.json({ organization: null });

    const org = member.organization as Record<string, unknown>;
    return NextResponse.json({
      organization: {
        id:        String(org.id),
        name:      String(org.name),
        slug:      String(org.slug),
        role:      String(member.role),
        createdAt: new Date(org.createdAt as string).toISOString(),
      },
    });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}

// ── POST ─────────────────────────────────────────────────────────────────────

export async function POST(req: NextRequest) {
  const userId = await getUserId(req);
  if (!userId) return NextResponse.json({ error: "Authentication required" }, { status: 401 });

  const db = await getPrisma();
  if (!db) return NextResponse.json({ error: "Database unavailable" }, { status: 503 });

  let body: unknown;
  try { body = await req.json(); } catch { body = {}; }
  const { name } = body as { name?: string };
  if (!name || typeof name !== "string" || name.trim().length < 2) {
    return NextResponse.json({ error: "name must be at least 2 characters" }, { status: 400 });
  }

  const memberModel = (db as Record<string, unknown>).organizationMember as MemberModel;
  const existing    = await memberModel.findFirst({ where: { userId } });
  if (existing) {
    return NextResponse.json({ error: "User already belongs to an organization" }, { status: 409 });
  }

  const orgModel = (db as Record<string, unknown>).organization as OrgModel;

  // Generate a unique slug
  const base = slugify(name.trim());
  const slug = `${base}-${Date.now().toString(36)}`;

  try {
    const org = await orgModel.create({
      data: { name: name.trim(), slug, createdAt: new Date(), updatedAt: new Date() },
    });

    const orgId = String((org as Record<string, unknown>).id);

    await memberModel.create({
      data: { organizationId: orgId, userId, role: "OWNER", createdAt: new Date() },
    });

    await recordAuditEvent({
      userId,
      action:     BILLING_AUDIT.ORG_CREATED,
      entityType: "Organization",
      entityId:   orgId,
      metadata:   { name: name.trim(), slug },
    });

    const orgRow = org as Record<string, unknown>;
    return NextResponse.json({
      organization: {
        id:        String(orgRow.id),
        name:      String(orgRow.name),
        slug:      String(orgRow.slug),
        role:      "OWNER",
        createdAt: new Date(orgRow.createdAt as string).toISOString(),
      },
    }, { status: 201 });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
