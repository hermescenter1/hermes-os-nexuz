import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth/session";
import { getNotificationService } from "@/lib/notifications/service";

export async function PATCH(): Promise<NextResponse> {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const count = await getNotificationService().markAllRead(user.id);
  return NextResponse.json({ ok: true, count });
}
