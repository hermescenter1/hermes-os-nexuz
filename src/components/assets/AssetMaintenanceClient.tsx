"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { IndustrialAsset, AssetMaintenanceLink } from "@/lib/assets/types";

function linkTypeBadge(t: string) {
  if (t === "CORRECTIVE_WORK_ORDER") return "bg-danger/[0.10] text-danger";
  if (t === "WORK_ORDER")            return "bg-ice/[0.08] text-ice";
  if (t === "INSPECTION")            return "bg-signal/[0.08] text-signal";
  return "bg-surface2 text-faint";
}

interface AssetWithLinks extends IndustrialAsset {
  maintenanceLinks: AssetMaintenanceLink[];
}

interface Props { assets: AssetWithLinks[] }

export function AssetMaintenanceClient({ assets }: Props) {
  const pathname = usePathname();
  const isFa    = pathname.startsWith("/fa");
  const locale  = isFa ? "fa" : "en";
  const hasLinks = assets.filter(a => a.maintenanceLinks?.length > 0);

  return (
    <div className="space-y-6">
      <div>
        <p className="eyebrow-mono text-ice mb-1">{isFa ? "نگهداشت دارایی" : "ASSET MAINTENANCE"}</p>
        <h1 className="text-xl font-semibold text-ink">{isFa ? "پیوندهای نگهداشت دارایی" : "Maintenance Links"}</h1>
        <p className="text-sm text-muted mt-1">
          {isFa ? "ارتباط دارایی‌ها با دستورکارها و برنامه‌های نگهداری" : "Asset links to work orders and maintenance plans"}
        </p>
      </div>

      {hasLinks.length === 0 ? (
        <div className="card-surface rounded-xl p-12 text-center">
          <p className="text-muted">{isFa ? "هیچ دستورکار مرتبطی ثبت نشده" : "No maintenance links recorded"}</p>
        </div>
      ) : (
        <div className="space-y-4">
          {hasLinks.map(a => (
            <div key={a.id} className="card-surface rounded-xl p-5">
              <div className="flex items-center justify-between mb-4">
                <div>
                  <p className="font-mono text-xs text-ice mb-0.5">{a.assetNumber}</p>
                  <Link href={`/${locale}/assets/${a.id}`} className="text-sm font-medium text-ink hover:text-ice">
                    {a.name}
                  </Link>
                </div>
                <span className="text-xs text-faint">{a.maintenanceLinks.length} {isFa ? "مورد" : "links"}</span>
              </div>

              <div className="space-y-2">
                {a.maintenanceLinks.map(lnk => (
                  <div key={lnk.id} className="flex items-start gap-3 bg-surface2 rounded-lg px-3 py-2">
                    <span className={`text-xs px-2 py-0.5 rounded-full font-medium shrink-0 ${linkTypeBadge(lnk.linkType)}`}>
                      {lnk.linkType.replace(/_/g, " ")}
                    </span>
                    <div className="flex-1 min-w-0">
                      {lnk.workOrderId && (
                        <p className="font-mono text-xs text-ice">{lnk.workOrderId}</p>
                      )}
                      {lnk.planId && (
                        <p className="font-mono text-xs text-signal">{lnk.planId}</p>
                      )}
                      {lnk.notes && <p className="text-xs text-muted mt-0.5">{lnk.notes}</p>}
                    </div>
                    <p className="text-xs text-faint shrink-0">{new Date(lnk.linkedAt).toLocaleDateString()}</p>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
