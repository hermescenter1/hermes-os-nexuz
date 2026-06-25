"use client";

import Link            from "next/link";
import { usePathname } from "next/navigation";
import type { ErpWorkOrder } from "@/lib/erp/types";

const STATUS_COLOR: Record<string, string> = {
  OPEN:              "bg-blue-500/15 text-blue-400",
  ASSIGNED:          "bg-cyan-500/15 text-cyan-400",
  IN_PROGRESS:       "bg-yellow-500/15 text-yellow-400",
  WAITING_APPROVAL:  "bg-orange-500/15 text-orange-400",
  COMPLETED:         "bg-green-500/15 text-green-400",
  CANCELLED:         "bg-muted text-muted-foreground",
};

const PRIORITY_DOT: Record<string, string> = {
  LOW:      "bg-muted-foreground",
  MEDIUM:   "bg-blue-400",
  HIGH:     "bg-yellow-400",
  CRITICAL: "bg-red-500",
};

export function WorkOrderListClient({ orders }: { orders: ErpWorkOrder[] }) {
  const pathname = usePathname();
  const locale   = pathname.startsWith("/fa") ? "fa" : "en";

  return (
    <div className="space-y-2">
      {orders.map(wo => (
        <Link
          key={wo.id}
          href={`/${locale}/erp/work-orders/${wo.id}`}
          className="flex items-center gap-4 rounded-xl border bg-card px-4 py-3 hover:bg-accent/30 transition-colors"
        >
          <div className={`w-2.5 h-2.5 rounded-full shrink-0 ${PRIORITY_DOT[wo.priority] ?? "bg-muted"}`} />
          <div className="flex-1 min-w-0">
            <div className="font-medium truncate">{wo.title}</div>
            {wo.description && <div className="text-xs text-muted-foreground truncate">{wo.description}</div>}
          </div>
          <div className="flex items-center gap-3 shrink-0 text-xs">
            {wo.dueDate && <span className="text-muted-foreground">Due {new Date(wo.dueDate).toLocaleDateString()}</span>}
            <span className={`px-2 py-0.5 rounded-full font-medium ${STATUS_COLOR[wo.status] ?? ""}`}>
              {wo.status.toLowerCase().replace(/_/g," ")}
            </span>
          </div>
        </Link>
      ))}
      {orders.length === 0 && (
        <div className="text-center py-12 text-muted-foreground text-sm">No work orders found.</div>
      )}
    </div>
  );
}
