"use client";

import Link            from "next/link";
import { usePathname } from "next/navigation";
import type { ErpTeamFull } from "@/lib/erp/types";

export function TeamDetailClient({ team }: { team: ErpTeamFull }) {
  const pathname = usePathname();
  const locale   = pathname.startsWith("/fa") ? "fa" : "en";

  return (
    <div className="space-y-6 max-w-2xl">
      <h1 className="text-2xl font-bold">{team.name}</h1>
      {team.description && <p className="text-muted-foreground">{team.description}</p>}

      <div className="grid grid-cols-2 gap-4">
        <div className="rounded-xl border bg-card p-4">
          <div className="text-xs text-muted-foreground mb-1">Members</div>
          <div className="font-bold text-2xl">{team.members?.length ?? 0}</div>
        </div>
        <div className="rounded-xl border bg-card p-4">
          <div className="text-xs text-muted-foreground mb-1">Capacity</div>
          <div className="font-bold text-2xl">{team.capacity ?? "—"}</div>
        </div>
      </div>

      {team.members && team.members.length > 0 && (
        <div className="rounded-xl border bg-card p-5">
          <h3 className="font-semibold mb-4">Members</h3>
          <div className="space-y-2">
            {team.members.map((m, i) => (
              <div key={i} className="flex items-center justify-between text-sm py-1 border-b last:border-0">
                <span>{m.userId}</span>
                <span className="text-muted-foreground capitalize">{m.role?.toLowerCase() ?? "member"}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      <Link href={`/${locale}/erp/teams`} className="text-sm px-3 py-1.5 border rounded-md hover:bg-accent inline-block">
        Back to Teams
      </Link>
    </div>
  );
}
