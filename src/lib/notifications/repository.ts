import { getPrisma } from "@/lib/db/prisma";
import { logger } from "@/lib/logger";
import type { Notification, CreateNotificationInput } from "./types";

type NotificationModel = {
  create:     (a: unknown) => Promise<Record<string, unknown>>;
  findMany:   (a?: unknown) => Promise<Record<string, unknown>[]>;
  count:      (a?: unknown) => Promise<number>;
  updateMany: (a: unknown) => Promise<{ count: number }>;
  deleteMany: (a: unknown) => Promise<{ count: number }>;
};

async function model(): Promise<NotificationModel | null> {
  const db = await getPrisma();
  return db ? ((db as Record<string, unknown>).notification as NotificationModel) : null;
}

function rowToNotification(r: Record<string, unknown>): Notification {
  return {
    id:        String(r.id),
    userId:    String(r.userId),
    type:      String(r.type) as Notification["type"],
    title:     String(r.title),
    message:   String(r.message),
    metadata:  (r.metadata as Record<string, unknown>) ?? {},
    isRead:    Boolean(r.isRead),
    createdAt: r.createdAt ? new Date(r.createdAt as string).toISOString() : new Date().toISOString(),
    updatedAt: r.updatedAt ? new Date(r.updatedAt as string).toISOString() : new Date().toISOString(),
  };
}

export async function createNotification(input: CreateNotificationInput): Promise<Notification | null> {
  try {
    const m = await model();
    if (!m) {
      logger.warn("[notifications] DB unavailable — notification not persisted.", { userId: input.userId, title: input.title });
      return null;
    }
    const row = await m.create({
      data: {
        userId:   input.userId,
        type:     input.type,
        title:    input.title,
        message:  input.message,
        metadata: input.metadata ?? {},
        isRead:   false,
      },
    });
    return rowToNotification(row);
  } catch (err) {
    logger.error("[notifications] create failed.", { error: String(err) });
    return null;
  }
}

export async function getNotificationsForUser(
  userId: string,
  limit  = 20,
  offset = 0,
): Promise<{ notifications: Notification[]; total: number }> {
  try {
    const m = await model();
    if (!m) return { notifications: [], total: 0 };

    const [rows, total] = await Promise.all([
      m.findMany({
        where:   { userId },
        orderBy: { createdAt: "desc" },
        take:    limit,
        skip:    offset,
      }),
      m.count({ where: { userId } }),
    ]);
    return { notifications: rows.map(rowToNotification), total };
  } catch (err) {
    logger.error("[notifications] list failed.", { error: String(err) });
    return { notifications: [], total: 0 };
  }
}

export async function getUnreadCount(userId: string): Promise<number> {
  try {
    const m = await model();
    if (!m) return 0;
    return await m.count({ where: { userId, isRead: false } });
  } catch {
    return 0;
  }
}

export async function markNotificationRead(id: string, userId: string): Promise<boolean> {
  try {
    const m = await model();
    if (!m) return false;
    const result = await m.updateMany({ where: { id, userId }, data: { isRead: true } });
    return result.count > 0;
  } catch {
    return false;
  }
}

export async function markAllNotificationsRead(userId: string): Promise<number> {
  try {
    const m = await model();
    if (!m) return 0;
    const result = await m.updateMany({ where: { userId, isRead: false }, data: { isRead: true } });
    return result.count;
  } catch {
    return 0;
  }
}

export async function deleteNotification(id: string, userId: string): Promise<boolean> {
  try {
    const m = await model();
    if (!m) return false;
    const result = await m.deleteMany({ where: { id, userId } });
    return result.count > 0;
  } catch {
    return false;
  }
}
