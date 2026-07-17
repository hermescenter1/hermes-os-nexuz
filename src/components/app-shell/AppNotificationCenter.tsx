"use client";

// PHASE 87C amendment — localized adapter around the existing NotificationCenter.
//
// Supplies next-intl translations (appShell.notifications.*) as presentation
// labels while preserving ALL existing behavior: fetching, SSE, polling
// fallback, mark-read/mark-all/delete, and endpoint contracts are untouched
// (they live in NotificationCenter itself — this adapter renders it, nothing
// more). The public site's SiteHeader keeps using the bare NotificationCenter
// with its original English defaults.

import { useTranslations } from "next-intl";
import { NotificationCenter } from "@/components/NotificationCenter";

export function AppNotificationCenter() {
  const t = useTranslations("appShell.notifications");
  return (
    <NotificationCenter
      labels={{
        title: t("title"),
        open: t("open"),
        close: t("close"),
        loading: t("loading"),
        empty: t("empty"),
        markRead: t("markRead"),
        markAllRead: t("markAllRead"),
        delete: t("delete"),
        // Template labels keep their {count}/{n} placeholders — the component
        // substitutes them itself, so read the RAW message (plain t() would
        // require ICU values here).
        unreadCount: t.raw("unreadCount") as string,
        justNow: t("justNow"),
        minutesAgo: t.raw("minutesAgo") as string,
        hoursAgo: t.raw("hoursAgo") as string,
        daysAgo: t.raw("daysAgo") as string,
        typeInfo: t("typeInfo"),
        typeSuccess: t("typeSuccess"),
        typeWarning: t("typeWarning"),
        typeError: t("typeError"),
        typeSecurity: t("typeSecurity"),
        connectionUnavailable: t("connectionUnavailable"),
        retry: t("retry"),
      }}
    />
  );
}
