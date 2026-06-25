"use client";

import Link            from "next/link";
import { usePathname } from "next/navigation";
import type { ErpWorkOrderFull } from "@/lib/erp/types";

export function WorkOrderDetailClient({ wo }: { wo: ErpWorkOrderFull }) {
  const pathname = usePathname();
  const locale   = pathname.startsWith("/fa") ? "fa" : "en";

  return (
    <div className="space-y-6 max-w-2xl">
      <div>
        <div className="flex items-center gap-3 mb-1">
          <span className="text-xs bg-muted px-2 py-0.5 rounded-full capitalize">{wo.status.toLowerCase().replace(/_/g," ")}</span>
          <span className="text-xs text-muted-foreground">{wo.priority}</span>
          {wo.requiresApproval && <span className="text-xs bg-orange-500/15 text-orange-400 px-2 py-0.5 rounded-full">Requires Approval</span>}
        </div>
        <h1 className="text-2xl font-bold">{wo.title}</h1>
        {wo.description && <p className="text-muted-foreground mt-2">{wo.description}</p>}
      </div>

      <div className="grid grid-cols-2 gap-4">
        {[
          { label: "Due Date", value: wo.dueDate ? new Date(wo.dueDate).toLocaleDateString() : "—" },
          { label: "Team",     value: wo.teamId ?? "—" },
        ].map(m => (
          <div key={m.label} className="rounded-xl border bg-card p-4">
            <div className="text-xs text-muted-foreground mb-1">{m.label}</div>
            <div className="font-medium">{m.value}</div>
          </div>
        ))}
      </div>

      {wo.activities && wo.activities.length > 0 && (
        <div className="rounded-xl border bg-card p-5">
          <h3 className="font-semibold mb-4">Activity Log</h3>
          <div className="space-y-3 text-sm">
            {wo.activities.map(a => (
              <div key={a.id} className="flex gap-3 py-1 border-b last:border-0">
                <div className="w-2 h-2 rounded-full bg-primary mt-1.5 shrink-0" />
                <div>
                  <p>{a.notes ?? a.action}</p>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    {new Date(a.createdAt).toLocaleDateString()}
                  </p>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {wo.completionNote && (
        <div className="rounded-xl border bg-green-500/10 p-4 text-sm">
          <div className="font-medium text-green-400 mb-1">Completion Note</div>
          <p>{wo.completionNote}</p>
        </div>
      )}

      <Link href={`/${locale}/erp/work-orders`} className="text-sm px-3 py-1.5 border rounded-md hover:bg-accent inline-block">
        Back to Work Orders
      </Link>
    </div>
  );
}
