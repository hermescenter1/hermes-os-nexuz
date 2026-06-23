/**
 * NotificationService — core facade for the notification system.
 *
 * All methods are safe: they never throw and never block the calling flow.
 * If the database is unavailable, methods degrade silently.
 */

import { logger }        from "@/lib/logger";
import { getSseManager } from "@/lib/realtime/sse-manager";
import { recordUsage }   from "@/lib/billing/usage";
import {
  createNotification,
  getNotificationsForUser,
  getUnreadCount,
  markNotificationRead,
  markAllNotificationsRead,
  deleteNotification,
} from "./repository";
import type { CreateNotificationInput, Notification } from "./types";

class NotificationService {
  async create(input: CreateNotificationInput): Promise<Notification | null> {
    try {
      const notification = await createNotification(input);
      if (notification) {
        logger.info("[notifications] created.", {
          id:     notification.id,
          userId: input.userId,
          type:   input.type,
          title:  input.title,
        });
        // Push to connected SSE clients instantly (best-effort, never throws)
        getSseManager().broadcastToUser(notification.userId, {
          type:         "notification.created",
          notification,
        });
        // Record usage against the org when org context is provided (best-effort)
        if (input.organizationId) {
          void recordUsage(input.organizationId, "notifications_created", 1, input.userId);
        }
      }
      return notification;
    } catch (err) {
      logger.error("[notifications] service.create failed.", { error: String(err) });
      return null;
    }
  }

  async getForUser(
    userId: string,
    limit  = 20,
    offset = 0,
  ): Promise<{ notifications: Notification[]; total: number }> {
    try {
      return await getNotificationsForUser(userId, limit, offset);
    } catch {
      return { notifications: [], total: 0 };
    }
  }

  async getUnreadCount(userId: string): Promise<number> {
    try {
      return await getUnreadCount(userId);
    } catch {
      return 0;
    }
  }

  async markRead(id: string, userId: string): Promise<boolean> {
    try {
      return await markNotificationRead(id, userId);
    } catch {
      return false;
    }
  }

  async markAllRead(userId: string): Promise<number> {
    try {
      return await markAllNotificationsRead(userId);
    } catch {
      return 0;
    }
  }

  async delete(id: string, userId: string): Promise<boolean> {
    try {
      return await deleteNotification(id, userId);
    } catch {
      return false;
    }
  }
}

let _instance: NotificationService | null = null;

export function getNotificationService(): NotificationService {
  _instance ??= new NotificationService();
  return _instance;
}
