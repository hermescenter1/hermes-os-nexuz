"use client";

import Link            from "next/link";
import { usePathname } from "next/navigation";
import type { ErpTask } from "@/lib/erp/types";

const COLUMNS = ["TODO","IN_PROGRESS","BLOCKED","REVIEW","DONE"] as const;

const COL_LABEL: Record<string, string> = {
  TODO:        "To Do",
  IN_PROGRESS: "In Progress",
  BLOCKED:     "Blocked",
  REVIEW:      "Review",
  DONE:        "Done",
};

const PRIORITY_COLOR: Record<string, string> = {
  LOW:      "text-muted-foreground",
  MEDIUM:   "text-blue-400",
  HIGH:     "text-yellow-500",
  CRITICAL: "text-red-500",
};

export function TaskListClient({ tasks }: { tasks: ErpTask[] }) {
  const pathname = usePathname();
  const locale   = pathname.startsWith("/fa") ? "fa" : "en";

  const grouped = Object.fromEntries(
    COLUMNS.map(col => [col, tasks.filter(t => t.status === col)])
  ) as Record<string, ErpTask[]>;

  return (
    <div className="overflow-x-auto">
      <div className="flex gap-4 min-w-max pb-2">
        {COLUMNS.map(col => (
          <div key={col} className="w-64 shrink-0">
            <div className="flex items-center justify-between mb-3">
              <span className="text-sm font-semibold">{COL_LABEL[col]}</span>
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
                        {new Date(task.dueDate).toLocaleDateString()}
                      </span>
                    )}
                  </div>
                </Link>
              ))}
              {grouped[col].length === 0 && (
                <div className="text-center py-6 text-xs text-muted-foreground border border-dashed rounded-xl">Empty</div>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
