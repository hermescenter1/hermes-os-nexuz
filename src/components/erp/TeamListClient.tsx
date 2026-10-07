"use client";

import Link                          from "next/link";
import { useLocale, useTranslations } from "next-intl";
import type { ErpTeam } from "@/lib/erp/types";
import type { ChildPage } from "@/lib/erp/pagination";
import { LoadMore, usePagedItems } from "./ErpPagedList";

export function TeamListClient({ page, endpoint }: { page: ChildPage<ErpTeam>; endpoint: string }) {
  const locale = useLocale();
  const t      = useTranslations("enterpriseOperations");
  const { items, hasMore, busy, failed, loadMore } = usePagedItems(page, endpoint);

  return (
    <div className="space-y-3">
      <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {items.map(team => (
          <Link
            key={team.id}
            href={`/${locale}/erp/teams/${team.id}`}
            className="rounded-xl border bg-card p-5 hover:bg-accent/30 transition-colors"
          >
            <h3 className="font-semibold">{team.name}</h3>
            {team.description && <p className="text-sm text-muted-foreground mt-1 line-clamp-2">{team.description}</p>}
            <div className="flex items-center gap-4 mt-4 text-xs text-muted-foreground">
              {team.capacity != null && <span>{t("teams.capacityValue", { value: team.capacity })}</span>}
            </div>
          </Link>
        ))}
        {items.length === 0 && (
          <div className="col-span-3 text-center py-12 text-muted-foreground text-sm">{t("teams.noTeamsFound")}</div>
        )}
      </div>
      <LoadMore hasMore={hasMore} busy={busy} failed={failed} onLoad={loadMore} />
    </div>
  );
}
