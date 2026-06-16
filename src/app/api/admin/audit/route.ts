import { NextResponse } from "next/server";
import { filterAuditEvents, type AuditFilter } from "@/lib/audit/audit-service";
import { getCurrentUser } from "@/lib/auth/session";
import { can } from "@/lib/auth/roles";
import { isAuthConfigured } from "@/lib/auth/config";
import { getStorageMode } from "@/lib/storage/storage-mode";

/**
 * /api/admin/audit (Phase 12B). Admin-only audit log reader.
 * Returns { storageMode, events }. Supports filters: action, entityType,
 * userId, limit, from, to. Never crashes when the database is unavailable.
 */
export async function GET(req: Request) {
  // Setup-required: no auth configured -> empty, not an error.
  if (!isAuthConfigured()) {
    return NextResponse.json({ storageMode: getStorageMode(), events: [], authConfigured: false });
  }

  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  if (!can(user.role, "admin")) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  const url = new URL(req.url);
  const q = url.searchParams;
  const limitRaw = Number(q.get("limit"));
  const filter: AuditFilter = {
    ...(q.get("action") ? { action: q.get("action") as string } : {}),
    ...(q.get("entityType") ? { entityType: q.get("entityType") as string } : {}),
    ...(q.get("userId") ? { userId: q.get("userId") as string } : {}),
    ...(q.get("from") ? { from: q.get("from") as string } : {}),
    ...(q.get("to") ? { to: q.get("to") as string } : {}),
    limit: Number.isFinite(limitRaw) && limitRaw > 0 ? limitRaw : 100,
  };

  try {
    const { storageMode, events } = await filterAuditEvents(filter);
    return NextResponse.json({ storageMode, events });
  } catch {
    return NextResponse.json({ storageMode: getStorageMode(), events: [] });
  }
}
