import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth/session";
import { getNotificationService } from "@/lib/notifications/service";

export async function GET(): Promise<NextResponse> {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ count: 0 });

  const count = await getNotificationService().getUnreadCount(user.id);
  return NextResponse.json({ count });
}
