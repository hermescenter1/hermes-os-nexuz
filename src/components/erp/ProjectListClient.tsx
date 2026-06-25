"use client";

import Link            from "next/link";
import { usePathname } from "next/navigation";
import type { ErpProject } from "@/lib/erp/types";

const STATUS_COLOR: Record<string, string> = {
  ACTIVE:    "bg-green-500/15 text-green-400",
  PLANNED:   "bg-blue-500/15 text-blue-400",
  ON_HOLD:   "bg-yellow-500/15 text-yellow-400",
  COMPLETED: "bg-muted text-muted-foreground",
  CANCELLED: "bg-red-500/15 text-red-400",
};

export function ProjectListClient({ projects }: { projects: ErpProject[] }) {
  const pathname = usePathname();
  const locale   = pathname.startsWith("/fa") ? "fa" : "en";

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">{projects.length} project{projects.length !== 1 ? "s" : ""}</p>
        <Link href={`/${locale}/erp/projects/new`} className="text-sm bg-primary text-primary-foreground px-3 py-1.5 rounded-md hover:bg-primary/90">
          New Project
        </Link>
      </div>
      <div className="space-y-2">
        {projects.map(p => {
          const dueStr = p.endDate ? new Date(p.endDate).toLocaleDateString() : null;
          const budgetK = p.budget ? `$${(p.budget / 1000).toFixed(0)}K` : null;
          return (
            <Link key={p.id} href={`/${locale}/erp/projects/${p.id}`} className="flex items-center gap-4 rounded-xl border bg-card px-4 py-3 hover:bg-accent/30 transition-colors">
              <div className="flex-1 min-w-0">
                <div className="font-medium truncate">{p.name}</div>
                {p.description && <div className="text-xs text-muted-foreground truncate mt-0.5">{p.description}</div>}
              </div>
              <div className="flex items-center gap-3 shrink-0 text-xs">
                {budgetK && <span className="text-muted-foreground">{budgetK}</span>}
                {dueStr  && <span className="text-muted-foreground">Due {dueStr}</span>}
                <span className={`px-2 py-0.5 rounded-full font-medium ${STATUS_COLOR[p.status] ?? ""}`}>
                  {p.status.toLowerCase().replace("_"," ")}
                </span>
              </div>
            </Link>
          );
        })}
        {projects.length === 0 && (
          <div className="text-center py-12 text-muted-foreground text-sm">No projects found.</div>
        )}
      </div>
    </div>
  );
}
