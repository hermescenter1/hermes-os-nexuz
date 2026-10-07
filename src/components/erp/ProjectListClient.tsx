"use client";

import Link                          from "next/link";
import { useLocale, useTranslations } from "next-intl";
import type { ErpProjectView } from "@/lib/erp/operations";
import type { ChildPage } from "@/lib/erp/pagination";
import { formatDate } from "@/lib/i18n/format";
import { ErpPagedList } from "./ErpPagedList";

const STATUS_COLOR: Record<string, string> = {
  ACTIVE:    "bg-green-500/15 text-green-400",
  PLANNED:   "bg-blue-500/15 text-blue-400",
  ON_HOLD:   "bg-yellow-500/15 text-yellow-400",
  COMPLETED: "bg-muted text-muted-foreground",
  CANCELLED: "bg-red-500/15 text-red-400",
};

/**
 * Project list. `page` is the first cursor page from the server; `endpoint` is the
 * GET route (with the current status filter) that serves the following pages.
 */
export function ProjectListClient({ page, endpoint }: { page: ChildPage<ErpProjectView>; endpoint: string }) {
  const locale = useLocale();
  const t      = useTranslations("enterpriseOperations");

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-end">
        <Link href={`/${locale}/erp/projects/new`} className="text-sm bg-primary text-primary-foreground px-3 py-1.5 rounded-md hover:bg-primary/90">
          {t("projects.newProject")}
        </Link>
      </div>
      <ErpPagedList
        page={page}
        endpoint={endpoint}
        renderItem={p => {
          const dueStr = p.endDate ? formatDate(p.endDate, locale) : null;
          // Owners see the budget (or nothing when unset); other callers see restricted text, never 0.
          const budgetK = !p.financialsVisible
            ? t("financials.restricted")
            : p.budget ? `$${(p.budget / 1000).toFixed(0)}K` : null;
          return (
            <Link href={`/${locale}/erp/projects/${p.id}`} className="flex items-center gap-4 rounded-xl border bg-card px-4 py-3 hover:bg-accent/30 transition-colors">
              <div className="flex-1 min-w-0">
                <div className="font-medium truncate">{p.name}</div>
                {p.description && <div className="text-xs text-muted-foreground truncate mt-0.5">{p.description}</div>}
              </div>
              <div className="flex items-center gap-3 shrink-0 text-xs">
                {budgetK && <span className="text-muted-foreground">{budgetK}</span>}
                {dueStr  && <span className="text-muted-foreground">{t("projects.due", { date: dueStr })}</span>}
                <span className={`px-2 py-0.5 rounded-full font-medium ${STATUS_COLOR[p.status] ?? ""}`}>
                  {p.status.toLowerCase().replace("_"," ")}
                </span>
              </div>
            </Link>
          );
        }}
      />
      {page.items.length === 0 && (
        <div className="text-center py-12 text-muted-foreground text-sm">{t("projects.noProjectsFound")}</div>
      )}
    </div>
  );
}
