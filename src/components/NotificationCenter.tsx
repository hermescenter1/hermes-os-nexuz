"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import type { Notification, NotificationType } from "@/lib/notifications/types";

// ─── Icons ────────────────────────────────────────────────────────────────────

function BellIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
      <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" />
      <path d="M13.73 21a2 2 0 0 1-3.46 0" />
    </svg>
  );
}

function BellOffIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
      <path d="M8.56 2.9A7 7 0 0 1 19 9v4m-2 4H2s3-2 3-9a4.67 4.67 0 0 1 .08-.83" />
      <path d="M13.73 21a2 2 0 0 1-3.46 0" />
      <line x1="2" y1="2" x2="22" y2="22" />
    </svg>
  );
}

function CheckIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round">
      <polyline points="20 6 9 17 4 12" />
    </svg>
  );
}

function XIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
      <line x1="18" y1="6" x2="6" y2="18" />
      <line x1="6" y1="6" x2="18" y2="18" />
    </svg>
  );
}

// ─── Localizable labels (PHASE 87C amendment) ────────────────────────────────
//
// Every user-facing string is overridable so the bilingual app shell can pass
// next-intl translations (see app-shell/AppNotificationCenter). Defaults are
// the component's original English strings — existing consumers (SiteHeader)
// render byte-identical output with no prop. Presentation only: fetching, SSE,
// polling, and mark-read behavior are untouched.

export interface NotificationCenterLabels {
  /** Panel heading. */
  title: string;
  /** Bell aria-label when the panel is closed. */
  open: string;
  /** Bell aria-label when the panel is open. */
  close: string;
  loading: string;
  empty: string;
  markRead: string;
  markAllRead: string;
  delete: string;
  /** Badge aria-label template; `{count}` is replaced with the unread count. */
  unreadCount: string;
  /** Relative-time templates; `{n}` is replaced with the magnitude. */
  justNow: string;
  minutesAgo: string;
  hoursAgo: string;
  daysAgo: string;
  /** Notification type indicators (dot tooltips). */
  typeInfo: string;
  typeSuccess: string;
  typeWarning: string;
  typeError: string;
  typeSecurity: string;
  /** Reserved for a future connection-state UI — no such state renders today. */
  connectionUnavailable: string;
  retry: string;
}

export const NOTIFICATION_CENTER_DEFAULT_LABELS: NotificationCenterLabels = {
  title: "Notifications",
  open: "Open notifications",
  close: "Close notifications",
  loading: "Loading…",
  empty: "No notifications",
  markRead: "Mark as read",
  markAllRead: "Mark all read",
  delete: "Delete",
  unreadCount: "{count} unread notifications",
  justNow: "just now",
  minutesAgo: "{n}m ago",
  hoursAgo: "{n}h ago",
  daysAgo: "{n}d ago",
  typeInfo: "Info",
  typeSuccess: "Success",
  typeWarning: "Warning",
  typeError: "Error",
  typeSecurity: "Security",
  connectionUnavailable: "Connection unavailable",
  retry: "Retry",
};

// ─── Type indicator ──────────────────────────────────────────────────────────

const TYPE_CONFIG: Record<NotificationType, { dot: string; labelKey: keyof NotificationCenterLabels }> = {
  info:     { dot: "bg-blue-400",    labelKey: "typeInfo" },
  success:  { dot: "bg-emerald-400", labelKey: "typeSuccess" },
  warning:  { dot: "bg-amber-400",   labelKey: "typeWarning" },
  error:    { dot: "bg-red-500",     labelKey: "typeError" },
  security: { dot: "bg-purple-400",  labelKey: "typeSecurity" },
};

function TypeDot({ type, labels }: { type: NotificationType; labels: NotificationCenterLabels }) {
  const cfg = TYPE_CONFIG[type] ?? TYPE_CONFIG.info;
  return (
    <span
      className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${cfg.dot}`}
      title={labels[cfg.labelKey]}
    />
  );
}

// ─── Time formatting ─────────────────────────────────────────────────────────

function timeAgo(isoDate: string, labels: NotificationCenterLabels): string {
  const diff = Date.now() - new Date(isoDate).getTime();
  const mins  = Math.floor(diff / 60_000);
  const hours = Math.floor(diff / 3_600_000);
  const days  = Math.floor(diff / 86_400_000);
  if (mins  < 1)  return labels.justNow;
  if (mins  < 60) return labels.minutesAgo.replace("{n}", String(mins));
  if (hours < 24) return labels.hoursAgo.replace("{n}", String(hours));
  if (days  < 7)  return labels.daysAgo.replace("{n}", String(days));
  return new Date(isoDate).toLocaleDateString();
}

// ─── Notification item ───────────────────────────────────────────────────────

function NotificationItem({
  notification,
  labels,
  onMarkRead,
  onDelete,
}: {
  notification: Notification;
  labels:       NotificationCenterLabels;
  onMarkRead:   (id: string) => void;
  onDelete:     (id: string) => void;
}) {
  return (
    <li
      className={`group relative flex gap-3 border-b border-line/50 px-4 py-3 last:border-0 transition-colors hover:bg-muted/5 ${
        notification.isRead ? "" : "bg-signal/[0.04]"
      }`}
    >
      <TypeDot type={notification.type} labels={labels} />

      <div className="min-w-0 flex-1">
        <p className={`truncate text-sm font-medium ${notification.isRead ? "text-muted" : "text-fg"}`}>
          {notification.title}
        </p>
        <p className="mt-0.5 line-clamp-2 text-xs text-muted">
          {notification.message}
        </p>
        <p className="mt-1 text-[0.6rem] text-muted/60">
          {timeAgo(notification.createdAt, labels)}
        </p>
      </div>

      <div className="flex shrink-0 flex-col gap-1 opacity-0 transition-opacity group-hover:opacity-100">
        {!notification.isRead && (
          <button
            onClick={() => onMarkRead(notification.id)}
            title={labels.markRead}
            aria-label={labels.markRead}
            className="rounded p-0.5 hover:bg-signal/10"
          >
            <CheckIcon className="h-3.5 w-3.5 text-signal" />
          </button>
        )}
        <button
          onClick={() => onDelete(notification.id)}
          title={labels.delete}
          aria-label={labels.delete}
          className="rounded p-0.5 hover:bg-red-500/10"
        >
          <XIcon className="h-3.5 w-3.5 text-muted hover:text-red-500" />
        </button>
      </div>
    </li>
  );
}

// ─── Main component ──────────────────────────────────────────────────────────

// Polling is a fallback sync; SSE is the primary real-time channel.
const POLL_INTERVAL_MS = 60_000;

export function NotificationCenter({
  labels: labelOverrides,
}: {
  /** Localized presentation labels; unspecified keys keep the English defaults. */
  labels?: Partial<NotificationCenterLabels>;
} = {}) {
  const labels: NotificationCenterLabels = { ...NOTIFICATION_CENTER_DEFAULT_LABELS, ...labelOverrides };
  const [isOpen,         setIsOpen]         = useState(false);
  const [notifications,  setNotifications]  = useState<Notification[]>([]);
  const [unreadCount,    setUnreadCount]     = useState(0);
  const [loading,        setLoading]         = useState(false);
  const dropdownRef  = useRef<HTMLDivElement>(null);
  const listLoadedRef = useRef(false); // true once the dropdown list has been fetched

  // ── Initial count + polling fallback ────────────────────────────────────
  const fetchUnreadCount = useCallback(async () => {
    try {
      const res = await fetch("/api/notifications/unread-count");
      if (!res.ok) return;
      const data = await res.json() as { count: number };
      setUnreadCount(data.count);
    } catch { /* best-effort */ }
  }, []);

  useEffect(() => {
    void fetchUnreadCount();
    const id = setInterval(() => void fetchUnreadCount(), POLL_INTERVAL_MS);
    return () => clearInterval(id);
  }, [fetchUnreadCount]);

  // ── SSE real-time channel ─────────────────────────────────────────────────
  useEffect(() => {
    if (typeof EventSource === "undefined") return; // SSR guard

    let es: EventSource | null = null;
    let errorCount = 0;

    function connect() {
      es = new EventSource("/api/realtime/events");

      es.onmessage = (event: MessageEvent<string>) => {
        errorCount = 0;
        try {
          const data = JSON.parse(event.data) as Record<string, unknown>;
          if (data.type === "notification.created") {
            const notif = data.notification as Notification;
            setUnreadCount(prev => prev + 1);
            // Prepend to list if the dropdown has been opened at least once
            if (listLoadedRef.current) {
              setNotifications(prev => [notif, ...prev]);
            }
          }
        } catch { /* ignore malformed event */ }
      };

      es.onerror = () => {
        errorCount++;
        // After 5 quick consecutive errors (likely 401 / auth issue), stop retrying
        if (errorCount >= 5) {
          es?.close();
        }
      };
    }

    connect();
    return () => { es?.close(); };
  }, []);

  const fetchNotifications = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/notifications?limit=20");
      if (!res.ok) return;
      const data = await res.json() as { notifications: Notification[] };
      setNotifications(data.notifications);
      listLoadedRef.current = true;
    } catch { /* best-effort */ }
    finally { setLoading(false); }
  }, []);

  const handleToggle = useCallback(() => {
    if (isOpen) {
      setIsOpen(false);
    } else {
      setIsOpen(true);
      void fetchNotifications();
    }
  }, [isOpen, fetchNotifications]);

  const handleMarkRead = useCallback(async (id: string) => {
    try {
      await fetch(`/api/notifications/${id}/read`, { method: "PATCH" });
      setNotifications(prev => prev.map(n => n.id === id ? { ...n, isRead: true } : n));
      setUnreadCount(prev => Math.max(0, prev - 1));
    } catch { /* best-effort */ }
  }, []);

  const handleMarkAllRead = useCallback(async () => {
    try {
      await fetch("/api/notifications/read-all", { method: "PATCH" });
      setNotifications(prev => prev.map(n => ({ ...n, isRead: true })));
      setUnreadCount(0);
    } catch { /* best-effort */ }
  }, []);

  const handleDelete = useCallback(async (id: string) => {
    const wasUnread = notifications.find(n => n.id === id)?.isRead === false;
    try {
      await fetch(`/api/notifications/${id}`, { method: "DELETE" });
      setNotifications(prev => prev.filter(n => n.id !== id));
      if (wasUnread) setUnreadCount(prev => Math.max(0, prev - 1));
    } catch { /* best-effort */ }
  }, [notifications]);

  // Close on outside click
  useEffect(() => {
    if (!isOpen) return;
    const handler = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [isOpen]);

  return (
    <div className="relative" ref={dropdownRef}>
      {/* Bell trigger */}
      <button
        onClick={handleToggle}
        aria-label={isOpen ? labels.close : labels.open}
        aria-expanded={isOpen}
        className="relative flex h-8 w-8 items-center justify-center rounded-md text-muted transition-colors hover:bg-muted/10 hover:text-fg"
      >
        <BellIcon className="h-4.5 w-4.5" />
        {unreadCount > 0 && (
          <span
            aria-label={labels.unreadCount.replace("{count}", String(unreadCount))}
            className="absolute -end-0.5 -top-0.5 flex h-4 min-w-[1rem] items-center justify-center rounded-full bg-signal px-0.5 text-[0.55rem] font-bold leading-none text-bg"
          >
            {unreadCount > 9 ? "9+" : unreadCount}
          </span>
        )}
      </button>

      {/* Dropdown */}
      {isOpen && (
        <div className="absolute end-0 top-10 z-50 w-80 overflow-hidden rounded-xl border border-line bg-bg shadow-2xl">
          {/* Header */}
          <div className="flex items-center justify-between border-b border-line px-4 py-3">
            <span className="text-sm font-semibold">{labels.title}</span>
            {unreadCount > 0 && (
              <button
                onClick={() => void handleMarkAllRead()}
                className="text-xs text-signal transition-opacity hover:opacity-70"
              >
                {labels.markAllRead}
              </button>
            )}
          </div>

          {/* Body */}
          <div className="max-h-96 overflow-y-auto">
            {loading ? (
              <div className="flex items-center justify-center py-10 text-muted">
                <span className="text-sm">{labels.loading}</span>
              </div>
            ) : notifications.length === 0 ? (
              <div className="flex flex-col items-center py-10 text-muted">
                <BellOffIcon className="mb-2 h-8 w-8 opacity-30" />
                <span className="text-sm">{labels.empty}</span>
              </div>
            ) : (
              <ul>
                {notifications.map(n => (
                  <NotificationItem
                    key={n.id}
                    notification={n}
                    labels={labels}
                    onMarkRead={(id) => void handleMarkRead(id)}
                    onDelete={(id) => void handleDelete(id)}
                  />
                ))}
              </ul>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
