"use client";

import Link                          from "next/link";
import { useLocale, useTranslations } from "next-intl";
import type { ErpTask } from "@/lib/erp/types";
import type { ChildPage } from "@/lib/erp/pagination";
import { formatDate } from "@/lib/i18n/format";
import { LoadMore, usePagedItems } from "./ErpPagedList";

const COLUMNS = ["TODO","IN_PROGRESS","BLOCKED","REVIEW","DONE"] as const;

const PRIORITY_COLOR: Record<string, string> = {
  LOW:      "text-muted-foreground",
  MEDIUM:   "text-blue-400",
  HIGH:     "text-yellow-500",
  CRITICAL: "text-red-500",
};

/**
 * Task board. Columns group the tasks that have been loaded so far; "load more"
 * continues the same ordered list, so a column can grow while the board is open.
 */
export function TaskListClient({ page, endpoint }: { page: ChildPage<ErpTask>; endpoint: string }) {
  const locale = useLocale();
  const t      = useTranslations("enterpriseOperations");
  const { items, hasMore, busy, failed, loadMore } = usePagedItems(page, endpoint);

  const grouped = Object.fromEntries(
    COLUMNS.map(col => [col, items.filter(task => task.status === col)])
  ) as Record<string, ErpTask[]>;

  return (
    <div className="space-y-3">
      <div className="overflow-x-auto">
        <div className="flex gap-4 min-w-max pb-2">
          {COLUMNS.map(col => (
            <div key={col} className="w-64 shrink-0">
              <div className="flex items-center justify-between mb-3">
                <span className="text-sm font-semibold">{t(`tasks.columns.${col}`)}</span>
                <span className="text-xs bg-muted rounded-full px-2 py-0.5">{grouped[col].length}</span>
              </div>
              <div className="space-y-2">
                {grouped[col].map(task => (
                  <Link
                    key={task.id}
                    href={`/${locale}/erp/tasks/${task.id}`}
                    className="block rounded-xl border bg-card p-3 hover:bg-accent/30 transition-colors"
                  >
                    <div className="text-sm font-medium leading-tight">{task.title}</div>
                    <div className="flex items-center gap-2 mt-2 text-xs">
                      <span className={PRIORITY_COLOR[task.priority] ?? ""}>{task.priority}</span>
                      {task.dueDate && (
                        <span className="text-muted-foreground ml-auto">
                          {formatDate(task.dueDate, locale)}
                        </span>
                      )}
                    </div>
                  </Link>
                ))}
                {grouped[col].length === 0 && (
                  <div className="text-center py-6 text-xs text-muted-foreground border border-dashed rounded-xl">{t("tasks.empty")}</div>
                )}
              </div>
            </div>
          ))}
        </div>
      </div>
      <LoadMore hasMore={hasMore} busy={busy} failed={failed} onLoad={loadMore} />
    </div>
  );
}
